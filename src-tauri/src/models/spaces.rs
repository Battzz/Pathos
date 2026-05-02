//! User-defined organisational layer above projects (`repos`).
//!
//! A Space groups together repos so the sidebar can show one slice at a
//! time. The `'default'` space is seeded by [`crate::schema`] and acts as
//! a fallback for repos that never had a `space_id` assigned (e.g. legacy
//! installs prior to this migration). Read paths therefore coalesce
//! `NULL → 'default'`.

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use super::db;

/// Sentinel id for the auto-seeded "Default" space. Repos with
/// `space_id IS NULL` are treated as belonging to this space.
pub const DEFAULT_SPACE_ID: &str = "default";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    pub id: String,
    pub name: String,
    pub display_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// All spaces ordered by `display_order` asc, then by name. Default space
/// is always present (seeded at schema init).
pub fn list_spaces() -> Result<Vec<Space>> {
    let connection = db::read_conn()?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, name, display_order, created_at, updated_at
            FROM spaces
            ORDER BY display_order ASC, LOWER(name) ASC
            "#,
        )
        .context("Failed to prepare space list query")?;

    let rows = statement
        .query_map([], |row| {
            Ok(Space {
                id: row.get(0)?,
                name: row.get(1)?,
                display_order: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .context("Failed to query spaces")?;

    rows.collect::<std::result::Result<Vec<_>, _>>()
        .context("Failed to deserialize spaces")
}

fn normalize_name(raw: &str) -> Result<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        bail!("Space name cannot be empty");
    }
    if trimmed.chars().count() > 64 {
        bail!("Space name must be 64 characters or fewer");
    }
    Ok(trimmed.to_string())
}

/// Create a new space. The id is generated server-side. Returns the
/// created row (so the caller doesn't need a follow-up read).
pub fn create_space(name: &str) -> Result<Space> {
    let name = normalize_name(name)?;
    let id = uuid::Uuid::new_v4().to_string();

    let connection = db::write_conn()?;
    let next_order: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(display_order), 0) + 1 FROM spaces",
            [],
            |row| row.get(0),
        )
        .context("Failed to resolve next space display order")?;

    connection
        .execute(
            r#"
            INSERT INTO spaces (id, name, display_order, created_at, updated_at)
            VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))
            "#,
            rusqlite::params![id, name, next_order],
        )
        .with_context(|| format!("Failed to insert space {name}"))?;

    let mut statement = connection
        .prepare("SELECT id, name, display_order, created_at, updated_at FROM spaces WHERE id = ?1")
        .context("Failed to prepare space readback")?;
    let space = statement
        .query_row([id.as_str()], |row| {
            Ok(Space {
                id: row.get(0)?,
                name: row.get(1)?,
                display_order: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .context("Failed to read back inserted space")?;

    Ok(space)
}

pub fn rename_space(space_id: &str, new_name: &str) -> Result<()> {
    let new_name = normalize_name(new_name)?;
    let connection = db::write_conn()?;
    let updated = connection
        .execute(
            "UPDATE spaces SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![new_name, space_id],
        )
        .with_context(|| format!("Failed to rename space {space_id}"))?;

    if updated != 1 {
        bail!("Space not found: {space_id}");
    }
    Ok(())
}

/// Delete a space. The Default space cannot be removed — it's the implicit
/// home for unassigned repos. Repos in the deleted space are reassigned to
/// the Default space rather than orphaned.
pub fn delete_space(space_id: &str) -> Result<()> {
    if space_id == DEFAULT_SPACE_ID {
        bail!("The Default space cannot be deleted");
    }

    let mut connection = db::write_conn()?;
    let tx = connection
        .transaction()
        .context("Failed to start delete space transaction")?;

    // Reassign repos before removing the space row so we never leave
    // dangling references even when foreign keys are off (the production
    // pragma — see `init_connection`).
    tx.execute(
        "UPDATE repos SET space_id = NULL, updated_at = datetime('now') WHERE space_id = ?1",
        [space_id],
    )
    .with_context(|| format!("Failed to reassign repos out of space {space_id}"))?;

    let removed = tx
        .execute("DELETE FROM spaces WHERE id = ?1", [space_id])
        .with_context(|| format!("Failed to delete space {space_id}"))?;

    if removed != 1 {
        bail!("Space not found: {space_id}");
    }

    tx.commit()
        .context("Failed to commit delete space transaction")?;
    Ok(())
}

/// Move a repo into a space. Pass `None` to clear the assignment (which
/// is read as the Default space). Validates the target space exists.
pub fn assign_repo_to_space(repo_id: &str, space_id: Option<&str>) -> Result<()> {
    let connection = db::write_conn()?;
    if let Some(target) = space_id {
        if target != DEFAULT_SPACE_ID {
            let exists: bool = connection
                .prepare("SELECT 1 FROM spaces WHERE id = ?1")
                .and_then(|mut stmt| stmt.exists([target]))
                .unwrap_or(false);
            if !exists {
                bail!("Space not found: {target}");
            }
        }
    }

    // We persist the literal value (including 'default') rather than
    // collapsing 'default' → NULL, so user intent round-trips through the
    // UI correctly. Read paths still coalesce NULL → 'default' for the
    // legacy rows that pre-date this column.
    let updated = connection
        .execute(
            "UPDATE repos SET space_id = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![space_id, repo_id],
        )
        .with_context(|| format!("Failed to assign repo {repo_id} to space"))?;

    if updated != 1 {
        bail!("Repository not found: {repo_id}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_spaces_includes_default_on_fresh_install() {
        let _env = crate::testkit::TestEnv::new("spaces-default-seed");
        let spaces = list_spaces().unwrap();
        assert_eq!(spaces.len(), 1);
        assert_eq!(spaces[0].id, DEFAULT_SPACE_ID);
        assert_eq!(spaces[0].name, "Default");
    }

    #[test]
    fn create_and_rename_space_round_trips() {
        let _env = crate::testkit::TestEnv::new("spaces-create-rename");
        let created = create_space("Marketing").unwrap();
        assert_eq!(created.name, "Marketing");
        assert!(created.display_order >= 1);

        rename_space(&created.id, "  Growth  ").unwrap();
        let listed = list_spaces().unwrap();
        let renamed = listed.iter().find(|s| s.id == created.id).unwrap();
        assert_eq!(renamed.name, "Growth");
    }

    #[test]
    fn create_space_rejects_blank_name() {
        let _env = crate::testkit::TestEnv::new("spaces-blank-name");
        let err = create_space("   ").unwrap_err();
        assert!(err.to_string().contains("cannot be empty"));
    }

    #[test]
    fn delete_space_reassigns_repos_to_default() {
        let _env = crate::testkit::TestEnv::new("spaces-delete-reassign");
        let space = create_space("Side projects").unwrap();

        let conn = crate::models::db::write_conn().unwrap();
        conn.execute(
            "INSERT INTO repos (id, name, root_path, space_id) VALUES ('r1', 'demo', '/tmp/demo', ?1)",
            [space.id.as_str()],
        )
        .unwrap();
        drop(conn);

        delete_space(&space.id).unwrap();

        let conn = crate::models::db::read_conn().unwrap();
        let space_id: Option<String> = conn
            .query_row("SELECT space_id FROM repos WHERE id = 'r1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(
            space_id.is_none(),
            "deleted space should leave repo unassigned (= Default)"
        );

        let still_listed = list_spaces().unwrap();
        assert!(still_listed.iter().all(|s| s.id != space.id));
    }

    #[test]
    fn delete_space_refuses_default() {
        let _env = crate::testkit::TestEnv::new("spaces-delete-default");
        let err = delete_space(DEFAULT_SPACE_ID).unwrap_err();
        assert!(err.to_string().contains("Default"));
    }

    #[test]
    fn assign_repo_to_space_validates_target_space() {
        let _env = crate::testkit::TestEnv::new("spaces-assign-validate");
        let conn = crate::models::db::write_conn().unwrap();
        conn.execute(
            "INSERT INTO repos (id, name, root_path) VALUES ('r1', 'demo', '/tmp/demo')",
            [],
        )
        .unwrap();
        drop(conn);

        let err = assign_repo_to_space("r1", Some("nope")).unwrap_err();
        assert!(err.to_string().contains("Space not found"));

        let space = create_space("Work").unwrap();
        assign_repo_to_space("r1", Some(&space.id)).unwrap();
        let conn = crate::models::db::read_conn().unwrap();
        let space_id: Option<String> = conn
            .query_row("SELECT space_id FROM repos WHERE id = 'r1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(space_id.as_deref(), Some(space.id.as_str()));

        // Pass None to reset to "Default" (NULL-as-default semantics).
        assign_repo_to_space("r1", None).unwrap();
        let conn = crate::models::db::read_conn().unwrap();
        let space_id: Option<String> = conn
            .query_row("SELECT space_id FROM repos WHERE id = 'r1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(space_id.is_none());
    }
}
