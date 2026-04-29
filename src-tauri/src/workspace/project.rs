//! Project workspace — the imported folder itself, used as a container
//! for "chats" (sessions that operate on the repo root rather than a
//! branched worktree).
//!
//! Exactly one project workspace exists per repo, created lazily the
//! first time the user starts a chat in that repo. It uses
//! `kind='project'`, an empty `directory_name` sentinel, and lives in
//! `state='ready'` from the moment of insertion (no Phase-2 worktree
//! provisioning).

use anyhow::{Context, Result};

use crate::{
    db,
    error::{coded, ErrorCode},
    workspace_kind::WorkspaceKind,
    workspace_state::WorkspaceState,
};

/// Look up the project workspace for a repo. Returns `None` if no chat
/// has ever been started against this repo.
pub fn find_project_workspace(repo_id: &str) -> Result<Option<String>> {
    let connection = db::read_conn()?;
    let mut statement = connection
        .prepare(
            "SELECT id FROM workspaces
             WHERE repository_id = ?1 AND kind = 'project'
             ORDER BY created_at ASC
             LIMIT 1",
        )
        .context("Failed to prepare project workspace lookup")?;
    let mut rows = statement
        .query_map([repo_id], |row| row.get::<_, String>(0))
        .context("Failed to query project workspace")?;
    match rows.next() {
        Some(Ok(id)) => Ok(Some(id)),
        Some(Err(e)) => Err(e.into()),
        None => Ok(None),
    }
}

/// Idempotently return the project workspace id for a repo, creating
/// one if it doesn't exist yet. The created row has no worktree on
/// disk — the agent will operate directly on the repo's root path.
pub fn get_or_create_project_workspace(repo_id: &str) -> Result<String> {
    if let Some(existing) = find_project_workspace(repo_id)? {
        return Ok(existing);
    }

    // Confirm the repo exists; bail with a typed error so the frontend
    // can surface a useful message instead of a generic SQL constraint.
    let repo = crate::repos::load_repository_by_id(repo_id)?
        .ok_or_else(|| coded(ErrorCode::WorkspaceNotFound))
        .with_context(|| format!("Repository not found: {repo_id}"))?;

    let workspace_id = uuid::Uuid::new_v4().to_string();
    let connection = db::write_conn()?;
    connection
        .execute(
            r#"
            INSERT INTO workspaces (
              id,
              repository_id,
              directory_name,
              branch,
              state,
              status,
              kind,
              unread,
              created_at,
              updated_at
            ) VALUES (?1, ?2, '', ?3, ?4, 'in-progress', 'project', 0, datetime('now'), datetime('now'))
            "#,
            rusqlite::params![
                workspace_id,
                repo_id,
                repo.default_branch.as_deref(),
                WorkspaceState::Ready,
            ],
        )
        .with_context(|| format!("Failed to create project workspace for repo {repo_id}"))?;

    Ok(workspace_id)
}

/// Whether the given workspace kind operates on a branched worktree
/// (i.e. has a directory under the helmor data dir). `Project`
/// workspaces operate on the repo root and skip the worktree machinery.
pub const fn has_worktree(kind: WorkspaceKind) -> bool {
    matches!(kind, WorkspaceKind::Workspace)
}

/// Resolve the on-disk working directory for a workspace record.
///
/// - `Project`: the imported folder itself (`repo.root_path`). The
///   record's `directory_name` is the empty-string sentinel and must
///   not be appended to the data-dir layout.
/// - `Workspace`: the branched worktree under
///   `{data_dir}/workspaces/{repo_name}/{directory_name}`.
///
/// Returns `None` when the resolved path doesn't exist on disk
/// (archived branched workspaces, or projects whose source folder was
/// deleted externally). Callers that need the path regardless can call
/// `resolve_workspace_root_path_unchecked` instead.
pub fn resolve_workspace_root_path(
    record: &crate::models::workspaces::WorkspaceRecord,
) -> Option<std::path::PathBuf> {
    let path = resolve_workspace_root_path_unchecked(record)?;
    if path.is_dir() {
        Some(path)
    } else {
        None
    }
}

/// Same as [`resolve_workspace_root_path`] but doesn't probe the
/// filesystem. Useful when callers need the path even if it is
/// (currently) missing — e.g. to surface a precise error message.
pub fn resolve_workspace_root_path_unchecked(
    record: &crate::models::workspaces::WorkspaceRecord,
) -> Option<std::path::PathBuf> {
    match record.kind {
        WorkspaceKind::Project => record.root_path.as_deref().map(std::path::PathBuf::from),
        WorkspaceKind::Workspace => {
            crate::data_dir::workspace_dir(&record.repo_name, &record.directory_name).ok()
        }
    }
}
