//! Project workspace — the imported folder itself, used as a container
//! for "chats" (sessions that operate on the repo root rather than a
//! branched worktree).
//!
//! Exactly one project workspace exists per repo, created lazily the
//! first time the user starts a chat in that repo. It uses
//! `kind='project'`, an empty `directory_name` sentinel, and lives in
//! `state='ready'` from the moment of insertion (no Phase-2 worktree
//! provisioning).

use anyhow::{bail, Context, Result};

use crate::{
    db,
    error::{coded, ErrorCode},
    git_ops,
    models::workspaces as workspace_models,
    workspace_kind::WorkspaceKind,
    workspace_state::WorkspaceState,
};

/// Default branch name used when running `git init` from the header
/// "Initialize git" affordance. We don't read the user's
/// `init.defaultBranch` here so the resulting state is predictable
/// across machines — the user can rename via the branch switcher.
const INIT_DEFAULT_BRANCH: &str = "main";

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
/// (i.e. has a directory under the pathos data dir). `Project`
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

/// Response payload for `init_workspace_git`. Returns the repo id and the
/// branch name git was initialised on so the frontend can update its
/// optimistic state without a follow-up roundtrip.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitWorkspaceGitResponse {
    pub repo_id: String,
    pub branch: String,
}

/// Run `git init -b main` inside a project workspace's folder, flip the
/// repo's `is_git` flag, and seed the workspace's `branch` column so the
/// header switches from the "Initialize git" affordance to the normal
/// branch picker. Idempotent: if the folder is already a git working tree
/// (e.g. the user ran `git init` themselves), this just refreshes the DB
/// to match.
pub fn init_workspace_git(workspace_id: &str) -> Result<InitWorkspaceGitResponse> {
    let record = workspace_models::load_workspace_record_by_id(workspace_id)?
        .ok_or_else(|| coded(ErrorCode::WorkspaceNotFound))
        .with_context(|| format!("Workspace not found: {workspace_id}"))?;

    if record.kind != WorkspaceKind::Project {
        bail!("Initialize git is only supported on project workspaces");
    }

    let root = resolve_workspace_root_path(&record)
        .with_context(|| format!("Workspace {workspace_id} folder is missing on disk"))?;

    if !git_ops::is_inside_work_tree(&root) {
        git_ops::init_repository(&root, INIT_DEFAULT_BRANCH)?;
    }

    let branch = git_ops::current_branch_name(&root).unwrap_or_else(|_| INIT_DEFAULT_BRANCH.into());

    crate::repos::mark_repository_initialised(&record.repo_id, &branch)?;

    let connection = db::write_conn()?;
    connection
        .execute(
            "UPDATE workspaces SET branch = ?1 WHERE id = ?2",
            (branch.as_str(), workspace_id),
        )
        .context("Failed to record initialised branch on workspace")?;

    Ok(InitWorkspaceGitResponse {
        repo_id: record.repo_id,
        branch,
    })
}
