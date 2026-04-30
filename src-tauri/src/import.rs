//! Workspace-granular import of Conductor data into Pathos.
//!
//! Users browse Conductor repos/workspaces, select individual workspaces,
//! and import their chat history into Pathos project chats.

use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;

use crate::{helpers, workspace::helpers as ws_helpers};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A repository found in the Conductor database.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConductorRepo {
    pub id: String,
    pub name: String,
    pub remote_url: Option<String>,
    pub workspace_count: i64,
    pub already_imported_count: i64,
}

/// A workspace found in the Conductor database.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConductorWorkspace {
    pub id: String,
    pub directory_name: String,
    pub state: String,
    pub branch: Option<String>,
    pub status: Option<String>,
    pub pr_title: Option<String>,
    pub session_count: i64,
    pub message_count: i64,
    pub already_imported: bool,
    pub icon_src: Option<String>,
}

/// Result returned to the frontend after an import attempt.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportWorkspacesResult {
    pub success: bool,
    pub imported_count: i64,
    pub skipped_count: i64,
    pub errors: Vec<String>,
}

// ---------------------------------------------------------------------------
// Browsing — list repos and workspaces from Conductor
// ---------------------------------------------------------------------------

/// List all repositories in the Conductor database with workspace counts.
pub fn list_conductor_repos() -> Result<Vec<ConductorRepo>> {
    let (pathos_conn, _source_path) = open_with_conductor_attached()?;

    let mut stmt = pathos_conn
        .prepare(
            r#"
            SELECT
                r.id,
                r.name,
                r.remote_url,
                (SELECT count(*) FROM source.workspaces w
                 WHERE w.repository_id = r.id
                   AND w.state = 'ready') AS workspace_count,
                (SELECT count(*) FROM source.workspaces w
                 WHERE w.repository_id = r.id
                   AND w.state = 'ready'
                   AND EXISTS (
                       SELECT 1 FROM source.sessions s
                       WHERE s.workspace_id = w.id
                   )
                   AND NOT EXISTS (
                       SELECT 1 FROM source.sessions s
                       WHERE s.workspace_id = w.id
                         AND s.id NOT IN (SELECT id FROM main.sessions)
                   )) AS already_imported_count
            FROM source.repos r
            WHERE r.hidden = 0 OR r.hidden IS NULL
            ORDER BY r.name COLLATE NOCASE
            "#,
        )
        .context("Failed to query Conductor repos")?;

    let repos = stmt
        .query_map([], |row| {
            Ok(ConductorRepo {
                id: row.get(0)?,
                name: row.get(1)?,
                remote_url: row.get(2)?,
                workspace_count: row.get(3)?,
                already_imported_count: row.get(4)?,
            })
        })
        .context("Failed to read Conductor repos")?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to collect Conductor repos")?;

    drop(stmt);

    pathos_conn.execute("DETACH DATABASE source", []).ok();

    Ok(repos)
}

/// List workspaces for a given repo in the Conductor database.
pub fn list_conductor_workspaces(repo_id: &str) -> Result<Vec<ConductorWorkspace>> {
    let (pathos_conn, _source_path) = open_with_conductor_attached()?;

    let mut stmt = pathos_conn
        .prepare(
            r#"
            SELECT
                w.id,
                w.directory_name,
                w.state,
                w.branch,
                w.derived_status,
                w.pr_title,
                (SELECT count(*) FROM source.sessions s
                 WHERE s.workspace_id = w.id) AS session_count,
                (SELECT count(*) FROM source.session_messages m
                 WHERE m.session_id IN (
                     SELECT s.id FROM source.sessions s WHERE s.workspace_id = w.id
                 )) AS message_count,
                (CASE WHEN EXISTS (
                    SELECT 1 FROM source.sessions s
                    WHERE s.workspace_id = w.id
                ) AND NOT EXISTS (
                    SELECT 1 FROM source.sessions s
                    WHERE s.workspace_id = w.id
                      AND s.id NOT IN (SELECT id FROM main.sessions)
                ) THEN 1 ELSE 0 END) AS already_imported,
                r.root_path
            FROM source.workspaces w
            JOIN source.repos r ON r.id = w.repository_id
            WHERE w.repository_id = ?1
              AND w.state = 'ready'
            ORDER BY w.updated_at DESC
            "#,
        )
        .context("Failed to query Conductor workspaces")?;

    let workspaces = stmt
        .query_map([repo_id], |row| {
            let root_path: Option<String> = row.get(9)?;
            Ok((
                ConductorWorkspace {
                    id: row.get(0)?,
                    directory_name: row.get(1)?,
                    state: row.get(2)?,
                    branch: row.get(3)?,
                    status: row.get(4)?,
                    pr_title: row.get(5)?,
                    session_count: row.get(6)?,
                    message_count: row.get(7)?,
                    already_imported: row.get::<_, i64>(8)? != 0,
                    icon_src: None,
                },
                root_path,
            ))
        })
        .context("Failed to read Conductor workspaces")?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to collect Conductor workspaces")?;

    // Resolve repo icons from filesystem after closing the DB statement.
    let workspaces: Vec<ConductorWorkspace> = workspaces
        .into_iter()
        .map(|(mut ws, root_path)| {
            ws.icon_src = ws_helpers::repo_icon_src_for_root_path(root_path.as_deref());
            ws
        })
        .collect();

    pathos_conn.execute("DETACH DATABASE source", []).ok();

    Ok(workspaces)
}

// ---------------------------------------------------------------------------
// Import — copy selected workspaces into Pathos
// ---------------------------------------------------------------------------

/// Import selected workspaces from Conductor into Pathos.
///
/// For each workspace:
/// 1. Resolves or imports the repository record
/// 2. Creates the repo's project workspace when needed
/// 3. Copies sessions and messages into that project workspace
pub fn import_conductor_workspaces(workspace_ids: &[String]) -> Result<ImportWorkspacesResult> {
    if workspace_ids.is_empty() {
        return Ok(ImportWorkspacesResult {
            success: true,
            imported_count: 0,
            skipped_count: 0,
            errors: vec![],
        });
    }

    let (pathos_conn, _source_path) = open_with_conductor_attached()?;

    let conductor_root = crate::data_dir::conductor_root_path();
    let mut imported_count: i64 = 0;
    let mut skipped_count: i64 = 0;
    let mut errors: Vec<String> = vec![];

    pathos_conn
        .execute_batch("BEGIN IMMEDIATE")
        .context("Failed to start transaction")?;

    let mut imported_workspaces: Vec<ImportedWorkspaceMeta> = vec![];

    for ws_id in workspace_ids {
        // Savepoint per workspace so a partial failure rolls back only this workspace's rows
        pathos_conn.execute_batch("SAVEPOINT ws_import").ok();

        match import_workspace_db_records(&pathos_conn, ws_id) {
            Ok(ImportDbResult::Imported(meta)) => {
                pathos_conn
                    .execute_batch("RELEASE SAVEPOINT ws_import")
                    .ok();
                imported_workspaces.push(meta);
                imported_count += 1;
            }
            Ok(ImportDbResult::Skipped) => {
                pathos_conn
                    .execute_batch("RELEASE SAVEPOINT ws_import")
                    .ok();
                skipped_count += 1;
            }
            Err(error) => {
                pathos_conn
                    .execute_batch("ROLLBACK TO SAVEPOINT ws_import")
                    .ok();
                pathos_conn
                    .execute_batch("RELEASE SAVEPOINT ws_import")
                    .ok();
                errors.push(format!("{ws_id}: {error}"));
            }
        }
    }

    if imported_count > 0 || skipped_count > 0 {
        pathos_conn
            .execute_batch("COMMIT")
            .context("Failed to commit")?;
    } else {
        pathos_conn.execute_batch("ROLLBACK").ok();
    }

    pathos_conn.execute("DETACH DATABASE source", []).ok();

    // Best-effort Claude project file copy. No git worktree is created:
    // imported sessions are project chats that run from the repository root.
    for meta in &imported_workspaces {
        if let (Some(conductor_root), Some(repo_root)) =
            (conductor_root.as_deref(), meta.repo_root.as_deref())
        {
            copy_claude_sessions_for_project(
                conductor_root,
                repo_root,
                &meta.repo_name,
                &meta.directory_name,
            );
        }
    }

    Ok(ImportWorkspacesResult {
        success: errors.is_empty(),
        imported_count,
        skipped_count,
        errors,
    })
}

/// Check if the Conductor database is available for import.
pub fn conductor_source_available() -> bool {
    crate::data_dir::conductor_source_db_path().is_some()
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Metadata collected during Phase 1 (DB import) for Phase 2 (filesystem).
struct ImportedWorkspaceMeta {
    repo_name: String,
    directory_name: String,
    repo_root: Option<PathBuf>,
}

enum ImportDbResult {
    Imported(ImportedWorkspaceMeta),
    Skipped,
}

/// Phase 1: Import database records for a single workspace.
/// No git or worktree operations happen here: source sessions are attached to
/// the repo's project workspace.
fn import_workspace_db_records(conn: &Connection, workspace_id: &str) -> Result<ImportDbResult> {
    // Read workspace info from source
    let (source_repo_id, directory_name): (String, String) = conn
        .query_row(
            "SELECT repository_id, directory_name FROM source.workspaces WHERE id = ?1",
            [workspace_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .with_context(|| format!("Workspace {workspace_id} not found in Conductor"))?;

    // Read repo name + root_path from source
    let (source_repo_name, source_root_path): (String, Option<String>) = conn
        .query_row(
            "SELECT name, root_path FROM source.repos WHERE id = ?1",
            [&source_repo_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .with_context(|| format!("Repo {source_repo_id} not found in Conductor"))?;

    let canonical_repo = resolve_canonical_repo(
        conn,
        &source_repo_id,
        &source_repo_name,
        source_root_path.as_deref(),
    )?;

    let source_session_count = count_source_sessions(conn, workspace_id)?;
    if source_session_count == 0 {
        return Ok(ImportDbResult::Skipped);
    }

    let existing_session_count = count_existing_imported_sessions(conn, workspace_id)?;
    if existing_session_count >= source_session_count {
        return Ok(ImportDbResult::Skipped);
    }

    let project_workspace_id = get_or_create_import_project_workspace(conn, &canonical_repo)?;

    // 3. Insert sessions (handles claude_session_id → provider_session_id rename)
    let (sess_main, sess_src) = import_session_column_lists(conn)?;
    conn.execute(
        &format!(
            "INSERT OR IGNORE INTO main.sessions ({sess_main}) SELECT {sess_src} FROM source.sessions WHERE workspace_id = ?1"
        ),
        rusqlite::params![workspace_id, project_workspace_id],
    )
    .context("Failed to import sessions")?;

    // 3b. Remap legacy "opus-1m" model ID (CLI no longer accepts it)
    conn.execute(
        "UPDATE main.sessions SET model = 'default' WHERE model = 'opus-1m' AND workspace_id = ?1",
        [&project_workspace_id],
    )
    .ok();

    // 4. Insert session_messages
    let (msg_main, msg_src) = import_column_lists(conn, "session_messages")?;
    conn.execute(
        &format!(
            "INSERT OR IGNORE INTO main.session_messages ({msg_main}) \
             SELECT {msg_src} FROM source.session_messages \
             WHERE session_id IN (SELECT id FROM source.sessions WHERE workspace_id = ?1)"
        ),
        [workspace_id],
    )
    .context("Failed to import messages")?;

    Ok(ImportDbResult::Imported(ImportedWorkspaceMeta {
        repo_name: canonical_repo.name,
        directory_name,
        repo_root: helpers::non_empty(&canonical_repo.root_path).map(PathBuf::from),
    }))
}

fn count_source_sessions(conn: &Connection, workspace_id: &str) -> Result<i64> {
    conn.query_row(
        "SELECT count(*) FROM source.sessions WHERE workspace_id = ?1",
        [workspace_id],
        |row| row.get(0),
    )
    .context("Failed to count source sessions")
}

fn count_existing_imported_sessions(conn: &Connection, workspace_id: &str) -> Result<i64> {
    conn.query_row(
        "SELECT count(*)
         FROM main.sessions
         WHERE id IN (SELECT id FROM source.sessions WHERE workspace_id = ?1)",
        [workspace_id],
        |row| row.get(0),
    )
    .context("Failed to count existing imported sessions")
}

fn get_or_create_import_project_workspace(
    conn: &Connection,
    repo: &CanonicalRepo,
) -> Result<String> {
    if let Some(existing) = conn
        .query_row(
            "SELECT id FROM main.workspaces
             WHERE repository_id = ?1 AND kind = 'project'
             ORDER BY created_at ASC
             LIMIT 1",
            [&repo.id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .context("Failed to look up project workspace")?
    {
        return Ok(existing);
    }

    let project_workspace_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO main.workspaces (
             id, repository_id, directory_name, branch, state, status, kind, unread, created_at, updated_at
         ) VALUES (
             ?1, ?2, '', ?3, 'ready', 'in-progress', 'project', 0, datetime('now'), datetime('now')
         )",
        rusqlite::params![
            &project_workspace_id,
            &repo.id,
            repo.default_branch.as_deref()
        ],
    )
    .context("Failed to create project workspace for imported sessions")?;

    Ok(project_workspace_id)
}

/// Encode a filesystem path into a Claude Code project directory name.
/// Claude uses `path.replace('/', '-').replace('.', '-')`.
fn encode_claude_project_dir(path: &Path) -> String {
    path.display().to_string().replace(['/', '.'], "-")
}

/// Copy Claude Code session files from the Conductor worktree project dir
/// to the repo-root project dir so imported project chats can be resumed.
fn copy_claude_sessions_for_project(
    conductor_root: &Path,
    repo_root: &Path,
    repo_name: &str,
    directory_name: &str,
) {
    // Claude Code config lives under the user's home directory.
    let home = match std::env::var_os("HOME").map(PathBuf::from) {
        Some(h) => h,
        None => return,
    };
    let claude_projects = home.join(".claude").join("projects");
    if !claude_projects.is_dir() {
        return;
    }

    let conductor_ws_path = conductor_root
        .join("workspaces")
        .join(repo_name)
        .join(directory_name);

    let src_dir = claude_projects.join(encode_claude_project_dir(&conductor_ws_path));
    let dst_dir = claude_projects.join(encode_claude_project_dir(repo_root));

    if !src_dir.is_dir() {
        return;
    }

    // Create destination dir if needed
    if std::fs::create_dir_all(&dst_dir).is_err() {
        tracing::error!(dir = %dst_dir.display(), "Failed to create Claude project dir");
        return;
    }

    // Copy each session file (.jsonl) and session directory (subagents, tool-results)
    let entries = match std::fs::read_dir(&src_dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    let mut copied = 0u32;
    for entry in entries.flatten() {
        let path = entry.path();
        let dst_path = dst_dir.join(entry.file_name());
        if path.is_file() && path.extension().is_some_and(|ext| ext == "jsonl") {
            if std::fs::copy(&path, &dst_path).is_ok() {
                copied += 1;
            }
        } else if path.is_dir() {
            // Session directory (contains subagents/, tool-results/, etc.)
            if dst_path.exists() {
                std::fs::remove_dir_all(&dst_path).ok();
            }
            if helpers::copy_dir_all(&path, &dst_path).is_ok() {
                copied += 1;
            }
        }
    }

    if copied > 0 {
        tracing::info!(count = copied, src = %src_dir.display(), dst = %dst_dir.display(), "Copied Claude session files");
    }
}

/// Open the Pathos DB and attach Conductor DB as `source`.
fn open_with_conductor_attached() -> Result<(Connection, String)> {
    let source_path =
        crate::data_dir::conductor_source_db_path().context("Conductor database not found")?;
    let source_display = source_path.display().to_string();
    let dest_path = crate::data_dir::db_path()?;

    let conn = Connection::open_with_flags(
        &dest_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .context("Failed to open Pathos database")?;

    conn.busy_timeout(std::time::Duration::from_secs(5))
        .context("Failed to set busy timeout")?;

    conn.execute(
        "ATTACH DATABASE ?1 AS source",
        [source_path.to_string_lossy().as_ref()],
    )
    .context("Failed to attach Conductor database")?;

    Ok((conn, source_display))
}

/// Get column names for a table (from the main schema).
fn get_table_columns(conn: &Connection, table: &str) -> Result<Vec<String>> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .with_context(|| format!("Failed to get columns for {table}"))?;

    let columns: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .context("Failed to query column info")?
        .filter_map(Result::ok)
        .collect();

    if columns.is_empty() {
        bail!("Table {table} has no columns");
    }

    Ok(columns)
}

/// Column name mappings from Conductor (source) → Pathos (main).
/// Used during import to bridge schema renames.
const COLUMN_RENAMES: &[(&str, &str)] = &[("claude_session_id", "provider_session_id")];

/// Build INSERT-SELECT column lists that handle renamed columns between
/// source (Conductor) and main (Pathos) schemas.
///
/// Returns `(main_col_list, source_col_list)` where renamed columns use
/// `source_name AS main_name` in the SELECT list.
fn import_column_lists(conn: &Connection, table: &str) -> Result<(String, String)> {
    let main_cols = get_table_columns(conn, table)?;

    let source_cols: Vec<String> = conn
        .prepare(&format!("PRAGMA source.table_info({table})"))
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .map(|rows| rows.filter_map(Result::ok).collect())
        })
        .unwrap_or_default();

    let source_set: std::collections::HashSet<&str> =
        source_cols.iter().map(|s| s.as_str()).collect();

    // Build column lists using only columns that exist in both schemas
    let mut main_parts = Vec::new();
    let mut source_parts = Vec::new();

    for col in &main_cols {
        if source_set.contains(col.as_str()) {
            // Column exists in both with the same name
            main_parts.push(col.clone());
            source_parts.push(col.clone());
        } else {
            // Check if it was renamed
            let old_name = COLUMN_RENAMES
                .iter()
                .find(|(_, new)| *new == col.as_str())
                .map(|(old, _)| *old);

            if let Some(old) = old_name {
                if source_set.contains(old) {
                    main_parts.push(col.clone());
                    source_parts.push(format!("{old} AS {col}"));
                }
            }
            // Column only in main (new column) — skip, will get DEFAULT value
        }
    }

    if main_parts.is_empty() {
        bail!("No compatible columns found for table {table}");
    }

    Ok((main_parts.join(", "), source_parts.join(", ")))
}

struct CanonicalRepo {
    id: String,
    name: String,
    root_path: Option<String>,
    default_branch: Option<String>,
}

fn resolve_canonical_repo(
    conn: &Connection,
    source_repo_id: &str,
    source_repo_name: &str,
    source_root_path: Option<&str>,
) -> Result<CanonicalRepo> {
    if let Some(repo) = load_main_repo(conn, "id = ?1", [source_repo_id])? {
        return Ok(repo);
    }

    if let Some(root_path) = source_root_path.filter(|path| !path.trim().is_empty()) {
        if let Some(repo) = load_main_repo(conn, "root_path = ?1", [root_path])? {
            tracing::info!(
                source_repo_id,
                canonical_repo_id = %repo.id,
                root_path,
                "Resolved Conductor repo to existing Pathos repo by root_path"
            );
            return Ok(repo);
        }
    }

    import_repo_from_source(conn, source_repo_id).context("Failed to import repo")?;

    load_main_repo(conn, "id = ?1", [source_repo_id])?.with_context(|| {
        format!(
            "Repo import did not create or resolve a Pathos repo for source repo {source_repo_name} ({source_repo_id})"
        )
    })
}

fn load_main_repo<P>(
    conn: &Connection,
    where_clause: &str,
    params: P,
) -> Result<Option<CanonicalRepo>>
where
    P: rusqlite::Params,
{
    conn.query_row(
        &format!(
            "SELECT id, name, root_path, default_branch FROM main.repos WHERE {where_clause} LIMIT 1"
        ),
        params,
        |row| {
            Ok(CanonicalRepo {
                id: row.get(0)?,
                name: row.get(1)?,
                root_path: row.get(2)?,
                default_branch: row.get(3)?,
            })
        },
    )
    .optional()
    .context("Failed to load canonical repo")
}

fn import_repo_from_source(conn: &Connection, source_repo_id: &str) -> Result<()> {
    let source_cols: Vec<String> = conn
        .prepare("PRAGMA source.table_info(repos)")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .map(|rows| rows.filter_map(Result::ok).collect())
        })
        .unwrap_or_default();
    let source_set: std::collections::HashSet<&str> =
        source_cols.iter().map(|s| s.as_str()).collect();

    let expr = |column: &str, default: &str| {
        if source_set.contains(column) {
            format!("COALESCE({column}, {default})")
        } else {
            default.to_string()
        }
    };
    let nullable = |column: &str| {
        if source_set.contains(column) {
            column.to_string()
        } else {
            "NULL".to_string()
        }
    };

    conn.execute(
        &format!(
            "INSERT OR IGNORE INTO main.repos (
                 id, name, remote_url, default_branch, root_path, hidden, auto_run_setup,
                 is_git, created_at, updated_at
             )
             SELECT
                 id,
                 {name},
                 {remote_url},
                 {default_branch},
                 {root_path},
                 {hidden},
                 {auto_run_setup},
                 {is_git},
                 {created_at},
                 {updated_at}
             FROM source.repos
             WHERE id = ?1",
            name = nullable("name"),
            remote_url = nullable("remote_url"),
            default_branch = expr("default_branch", "'main'"),
            root_path = nullable("root_path"),
            hidden = expr("hidden", "0"),
            auto_run_setup = expr("auto_run_setup", "1"),
            is_git = expr("is_git", "1"),
            created_at = expr("created_at", "datetime('now')"),
            updated_at = expr("updated_at", "datetime('now')"),
        ),
        [source_repo_id],
    )?;

    Ok(())
}

fn import_session_column_lists(conn: &Connection) -> Result<(String, String)> {
    let main_cols = get_table_columns(conn, "sessions")?;

    let source_cols: Vec<String> = conn
        .prepare("PRAGMA source.table_info(sessions)")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .map(|rows| rows.filter_map(Result::ok).collect())
        })
        .unwrap_or_default();

    let source_set: std::collections::HashSet<&str> =
        source_cols.iter().map(|s| s.as_str()).collect();

    let mut main_parts = Vec::new();
    let mut source_parts = Vec::new();

    for col in &main_cols {
        if col == "workspace_id" {
            main_parts.push(col.clone());
            source_parts.push("?2 AS workspace_id".to_string());
            continue;
        }

        if source_set.contains(col.as_str()) {
            main_parts.push(col.clone());
            source_parts.push(col.clone());
            continue;
        }

        let old_name = COLUMN_RENAMES
            .iter()
            .find(|(_, new)| *new == col.as_str())
            .map(|(old, _)| *old);

        if let Some(old) = old_name {
            if source_set.contains(old) {
                main_parts.push(col.clone());
                source_parts.push(format!("{old} AS {col}"));
            }
        }
    }

    if main_parts.is_empty() {
        bail!("No compatible columns found for table sessions");
    }

    Ok((main_parts.join(", "), source_parts.join(", ")))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::{env, fs};

    use crate::testkit::{GitTestRepo, TestEnv};
    fn setup_test_db() -> (Connection, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let conn = Connection::open(&db_path).unwrap();
        crate::schema::ensure_schema(&conn).unwrap();
        (conn, dir)
    }

    #[test]
    fn import_workspace_db_records_inserts_cascade() {
        let (conn, _dir) = setup_test_db();

        // Create a "source" schema in the same in-memory DB for testing
        conn.execute_batch(
            r#"
            ATTACH DATABASE ':memory:' AS source;
            CREATE TABLE source.repos AS SELECT * FROM main.repos WHERE 0;
            CREATE TABLE source.workspaces AS SELECT * FROM main.workspaces WHERE 0;
            CREATE TABLE source.sessions AS SELECT * FROM main.sessions WHERE 0;
            CREATE TABLE source.session_messages AS SELECT * FROM main.session_messages WHERE 0;

            INSERT INTO source.repos (id, name, created_at, updated_at) VALUES ('r1', 'my-repo', datetime('now'), datetime('now'));
            INSERT INTO source.workspaces (id, repository_id, directory_name, state, created_at, updated_at) VALUES ('w1', 'r1', 'boston', 'ready', datetime('now'), datetime('now'));
            INSERT INTO source.sessions (id, workspace_id, created_at, updated_at) VALUES ('s1', 'w1', datetime('now'), datetime('now'));
            INSERT INTO source.sessions (id, workspace_id, created_at, updated_at) VALUES ('s2', 'w1', datetime('now'), datetime('now'));
            INSERT INTO source.session_messages (id, session_id, role, content, created_at) VALUES ('m1', 's1', 'user', 'hello', datetime('now'));
            INSERT INTO source.session_messages (id, session_id, role, content, created_at) VALUES ('m2', 's2', 'user', 'world', datetime('now'));
            "#,
        )
        .unwrap();

        let result = import_workspace_db_records(&conn, "w1");
        assert!(matches!(result.unwrap(), ImportDbResult::Imported(_)));

        // Verify cascade
        let repo_count: i64 = conn
            .query_row("SELECT count(*) FROM main.repos", [], |r| r.get(0))
            .unwrap();
        let ws_count: i64 = conn
            .query_row("SELECT count(*) FROM main.workspaces", [], |r| r.get(0))
            .unwrap();
        let sess_count: i64 = conn
            .query_row("SELECT count(*) FROM main.sessions", [], |r| r.get(0))
            .unwrap();
        let msg_count: i64 = conn
            .query_row("SELECT count(*) FROM main.session_messages", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(repo_count, 1);
        assert_eq!(ws_count, 1);
        assert_eq!(sess_count, 2);
        assert_eq!(msg_count, 2);
    }

    #[test]
    fn import_workspace_db_records_skips_existing() {
        let (conn, _dir) = setup_test_db();

        conn.execute_batch(
            r#"
            INSERT INTO main.repos (id, name) VALUES ('r1', 'my-repo');
            INSERT INTO main.workspaces (id, repository_id, directory_name, kind, state) VALUES ('p1', 'r1', '', 'project', 'ready');
            INSERT INTO main.sessions (id, workspace_id, created_at, updated_at) VALUES ('s1', 'p1', datetime('now'), datetime('now'));

            ATTACH DATABASE ':memory:' AS source;
            CREATE TABLE source.repos AS SELECT * FROM main.repos WHERE 0;
            CREATE TABLE source.workspaces AS SELECT * FROM main.workspaces WHERE 0;
            CREATE TABLE source.sessions AS SELECT * FROM main.sessions WHERE 0;
            CREATE TABLE source.session_messages AS SELECT * FROM main.session_messages WHERE 0;

            INSERT INTO source.repos (id, name, created_at, updated_at) VALUES ('r1', 'my-repo', datetime('now'), datetime('now'));
            INSERT INTO source.workspaces (id, repository_id, directory_name, state, created_at, updated_at) VALUES ('w1', 'r1', 'boston', 'ready', datetime('now'), datetime('now'));
            INSERT INTO source.sessions (id, workspace_id, created_at, updated_at) VALUES ('s1', 'w1', datetime('now'), datetime('now'));
            "#,
        )
        .unwrap();

        let result = import_workspace_db_records(&conn, "w1").unwrap();

        assert!(matches!(result, ImportDbResult::Skipped));

        let sess_count: i64 = conn
            .query_row("SELECT count(*) FROM main.sessions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(sess_count, 1);
    }

    #[test]
    fn import_workspace_db_records_reuses_canonical_repo_by_root_path() {
        let (conn, _dir) = setup_test_db();

        conn.execute_batch(
            r#"
            INSERT INTO main.repos (id, name, root_path)
            VALUES ('r-main', 'pathos', '/tmp/pathos');

            ATTACH DATABASE ':memory:' AS source;
            CREATE TABLE source.repos AS SELECT * FROM main.repos WHERE 0;
            CREATE TABLE source.workspaces AS SELECT * FROM main.workspaces WHERE 0;
            CREATE TABLE source.sessions AS SELECT * FROM main.sessions WHERE 0;
            CREATE TABLE source.session_messages AS SELECT * FROM main.session_messages WHERE 0;

            INSERT INTO source.repos (id, name, root_path, created_at, updated_at)
            VALUES ('r-source', 'conductor-pathos', '/tmp/pathos', datetime('now'), datetime('now'));
            INSERT INTO source.workspaces (id, repository_id, directory_name, state, created_at, updated_at)
            VALUES ('w1', 'r-source', 'hyperion', 'ready', datetime('now'), datetime('now'));
            INSERT INTO source.sessions (id, workspace_id, created_at, updated_at)
            VALUES ('s1', 'w1', datetime('now'), datetime('now'));
            "#,
        )
        .unwrap();

        let result = import_workspace_db_records(&conn, "w1").unwrap();
        let ImportDbResult::Imported(meta) = result else {
            panic!("workspace should import");
        };

        let repo_count: i64 = conn
            .query_row("SELECT count(*) FROM main.repos", [], |r| r.get(0))
            .unwrap();
        let project_workspace: (String, String) = conn
            .query_row(
                "SELECT repository_id, kind FROM main.workspaces WHERE repository_id = 'r-main'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();

        assert_eq!(repo_count, 1);
        assert_eq!(
            project_workspace,
            ("r-main".to_string(), "project".to_string())
        );
        assert_eq!(meta.repo_name, "pathos");
        assert_eq!(meta.repo_root, Some(PathBuf::from("/tmp/pathos")));
    }

    #[test]
    fn get_table_columns_works() {
        let (conn, _dir) = setup_test_db();
        let cols = get_table_columns(&conn, "repos").unwrap();
        assert!(cols.contains(&"id".to_string()));
        assert!(cols.contains(&"name".to_string()));
    }

    #[test]
    fn import_column_lists_handles_renamed_columns() {
        let (conn, _dir) = setup_test_db();

        // Simulate Conductor source with old column name
        conn.execute_batch(
            r#"
            ATTACH DATABASE ':memory:' AS source;
            CREATE TABLE source.sessions (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                status TEXT DEFAULT 'idle',
                claude_session_id TEXT,
                model TEXT,
                permission_mode TEXT DEFAULT 'default',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            "#,
        )
        .unwrap();

        let (main_cols, src_cols) = import_column_lists(&conn, "sessions").unwrap();

        // main should have provider_session_id, source should map claude_session_id AS provider_session_id
        assert!(
            main_cols.contains("provider_session_id"),
            "main_cols should contain provider_session_id: {main_cols}"
        );
        assert!(
            src_cols.contains("claude_session_id AS provider_session_id"),
            "src_cols should map old→new: {src_cols}"
        );
    }

    #[test]
    fn import_column_lists_handles_identical_schemas() {
        let (conn, _dir) = setup_test_db();

        conn.execute_batch(
            r#"
            ATTACH DATABASE ':memory:' AS source;
            CREATE TABLE source.repos AS SELECT * FROM main.repos WHERE 0;
            "#,
        )
        .unwrap();

        let (main_cols, src_cols) = import_column_lists(&conn, "repos").unwrap();
        // When schemas are identical, both column lists should be the same
        assert_eq!(main_cols, src_cols);
    }

    #[test]
    fn import_column_lists_drops_source_only_columns() {
        let (conn, _dir) = setup_test_db();

        // Source has an extra column that main doesn't
        conn.execute_batch(
            r#"
            ATTACH DATABASE ':memory:' AS source;
            CREATE TABLE source.repos (
                id TEXT PRIMARY KEY,
                name TEXT,
                extra_conductor_field TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            "#,
        )
        .unwrap();

        let (main_cols, src_cols) = import_column_lists(&conn, "repos").unwrap();
        // extra_conductor_field should NOT appear in either list
        assert!(
            !main_cols.contains("extra_conductor_field"),
            "main_cols should not contain source-only column"
        );
        assert!(
            !src_cols.contains("extra_conductor_field"),
            "src_cols should not contain source-only column"
        );
    }

    #[test]
    fn import_preserves_conductor_provider_session_id() {
        let (conn, _dir) = setup_test_db();

        conn.execute_batch(
            r#"
            ATTACH DATABASE ':memory:' AS source;
            CREATE TABLE source.repos AS SELECT * FROM main.repos WHERE 0;
            CREATE TABLE source.workspaces AS SELECT * FROM main.workspaces WHERE 0;
            CREATE TABLE source.sessions (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                status TEXT DEFAULT 'idle',
                claude_session_id TEXT,
                model TEXT,
                permission_mode TEXT DEFAULT 'default',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE source.session_messages AS SELECT * FROM main.session_messages WHERE 0;

            INSERT INTO source.repos (id, name, created_at, updated_at) VALUES ('r1', 'my-repo', datetime('now'), datetime('now'));
            INSERT INTO source.workspaces (id, repository_id, directory_name, state, created_at, updated_at) VALUES ('w1', 'r1', 'boston', 'ready', datetime('now'), datetime('now'));
            INSERT INTO source.sessions (id, workspace_id, claude_session_id, created_at, updated_at)
                VALUES ('s1', 'w1', 'real-claude-uuid-123', datetime('now'), datetime('now'));
            "#,
        )
        .unwrap();

        let result = import_workspace_db_records(&conn, "w1");
        assert!(matches!(result.unwrap(), ImportDbResult::Imported(_)));

        // Verify the old claude_session_id was imported as provider_session_id
        let provider_sid: Option<String> = conn
            .query_row(
                "SELECT provider_session_id FROM main.sessions WHERE id = 's1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            provider_sid.as_deref(),
            Some("real-claude-uuid-123"),
            "claude_session_id should be mapped to provider_session_id"
        );
    }

    #[test]
    fn encode_claude_project_dir_encodes_correctly() {
        let path = PathBuf::from("/Users/me/conductor/workspaces/repo/ws");
        let encoded = encode_claude_project_dir(&path);
        assert_eq!(encoded, "-Users-me-conductor-workspaces-repo-ws");

        let path2 = PathBuf::from("/Users/me/pathos-dev/workspaces/repo/ws");
        let encoded2 = encode_claude_project_dir(&path2);
        assert_eq!(encoded2, "-Users-me-pathos-dev-workspaces-repo-ws");
    }

    #[test]
    fn import_conductor_workspaces_imports_sessions_without_worktrees() {
        let _env = TestEnv::new("import-without-worktrees");
        let fake_home = tempfile::tempdir().unwrap();
        let conductor_db_dir = fake_home
            .path()
            .join("Library/Application Support/com.conductor.app");
        fs::create_dir_all(&conductor_db_dir).unwrap();
        let conductor_db_path = conductor_db_dir.join("conductor.db");
        let conductor_conn = Connection::open(&conductor_db_path).unwrap();
        crate::schema::ensure_schema(&conductor_conn).unwrap();

        let repo = GitTestRepo::init();
        conductor_conn
            .execute(
                "INSERT INTO repos (id, name, root_path, created_at, updated_at) VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))",
                rusqlite::params!["r1", "my-repo", repo.path().display().to_string()],
            )
            .unwrap();
        conductor_conn
            .execute(
                "INSERT INTO workspaces (id, repository_id, directory_name, state, branch, created_at, updated_at) VALUES (?1, ?2, ?3, 'ready', ?4, datetime('now'), datetime('now'))",
                rusqlite::params!["w1", "r1", "broken-import", "missing/branch"],
            )
            .unwrap();
        conductor_conn
            .execute(
                "INSERT INTO sessions (id, workspace_id, created_at, updated_at) VALUES ('s1', 'w1', datetime('now'), datetime('now'))",
                [],
            )
            .unwrap();
        conductor_conn
            .execute(
                "INSERT INTO session_messages (id, session_id, role, content, created_at) VALUES ('m1', 's1', 'user', 'hello', datetime('now'))",
                [],
            )
            .unwrap();
        drop(conductor_conn);

        let original_home = env::var_os("HOME");
        env::set_var("HOME", fake_home.path());

        let result = import_conductor_workspaces(&["w1".to_string()]).unwrap();

        match original_home {
            Some(home) => env::set_var("HOME", home),
            None => env::remove_var("HOME"),
        }

        assert!(result.success, "import errors: {:?}", result.errors);
        assert_eq!(result.imported_count, 1);
        let conn = crate::models::db::write_conn().unwrap();
        let old_workspace_count: i64 = conn
            .query_row("SELECT count(*) FROM workspaces WHERE id = 'w1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        let project_workspace_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM workspaces WHERE repository_id = 'r1' AND kind = 'project'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let session_workspace_kind: String = conn
            .query_row(
                "SELECT w.kind FROM sessions s JOIN workspaces w ON w.id = s.workspace_id WHERE s.id = 's1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let message_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM session_messages WHERE session_id = 's1'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        assert_eq!(old_workspace_count, 0);
        assert_eq!(project_workspace_count, 1);
        assert_eq!(session_workspace_kind, "project");
        assert_eq!(message_count, 1);
    }
}
