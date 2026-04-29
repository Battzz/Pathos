use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use anyhow::{bail, Context, Result};
use serde::Serialize;

use crate::{
    bail_coded, db,
    error::{coded, ErrorCode},
    git_ops, helpers,
    models::workspaces as workspace_models,
    repos,
    workspace_state::WorkspaceState,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreWorkspaceResponse {
    pub restored_workspace_id: String,
    pub restored_state: WorkspaceState,
    pub selected_workspace_id: String,
    /// Set when the originally archived branch name was already taken at
    /// restore time and the workspace had to be checked out on a `-vN`
    /// suffixed branch instead. The frontend uses this to surface an
    /// informational toast so the rename never happens silently.
    pub branch_rename: Option<BranchRename>,
    pub restored_from_target_branch: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchRename {
    pub original: String,
    pub actual: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveWorkspaceResponse {
    pub archived_workspace_id: String,
    pub archived_state: WorkspaceState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateRestoreResponse {
    /// Set when the workspace's `intended_target_branch` no longer exists
    /// on the repo's current remote. The frontend should confirm before
    /// proceeding, offering `suggested_branch` as the replacement.
    pub target_branch_conflict: Option<TargetBranchConflict>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetBranchConflict {
    pub current_branch: String,
    pub suggested_branch: String,
    pub remote: String,
}

/// Remove workspace rows stuck in the `Initializing` state longer than the
/// supplied cutoff. Called at app startup to clean up rows left behind when
/// the process exited mid-finalize (e.g. the app was force-quit while the
/// git worktree was being created). Best-effort: returns the number of
/// rows purged and logs failures rather than propagating them.
pub fn cleanup_orphaned_initializing_workspaces(max_age_seconds: i64) -> Result<usize> {
    let orphans = workspace_models::list_initializing_workspaces_older_than(max_age_seconds)?;
    let orphan_count = orphans.len();

    for orphan in orphans {
        let record = &orphan.record;
        let repo_root_value = record.root_path.as_deref().unwrap_or("").trim();
        let repo_root = PathBuf::from(repo_root_value);
        let workspace_dir =
            match crate::data_dir::workspace_dir(&record.repo_name, &record.directory_name) {
                Ok(path) => path,
                Err(error) => {
                    tracing::warn!(
                        workspace_id = %record.id,
                        error = %error,
                        "Failed to resolve workspace dir for orphan cleanup",
                    );
                    continue;
                }
            };
        let branch = record.branch.as_deref().unwrap_or("");

        cleanup_failed_created_workspace(
            &record.id,
            &repo_root,
            &workspace_dir,
            branch,
            workspace_dir.exists(),
        );

        tracing::info!(
            workspace_id = %record.id,
            "Cleaned up orphaned initializing workspace",
        );
    }

    Ok(orphan_count)
}

#[derive(Debug, Clone)]
pub struct ArchivePreparedPlan {
    pub workspace_id: String,
    repo_root: PathBuf,
    branch: String,
    workspace_dir: PathBuf,
}

fn is_archive_eligible_state(state: WorkspaceState) -> bool {
    matches!(state, WorkspaceState::Ready | WorkspaceState::SetupPending)
}

/// Resolve the interpreter + single-command flag used to run the archive
/// script. Respects `$SHELL` (falling back to `/bin/sh`) and uses `-c`.
fn archive_shell() -> (String, &'static str) {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    (shell, "-c")
}

/// Structured outcome of a single archive-hook invocation. Returned by the
/// testable `run_archive_hook_inner` and collapsed to a log line by the public
/// `run_archive_hook`. Phase 2's cross-platform refactor uses the same enum.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ArchiveHookOutcome {
    /// Workspace record was not found in the DB.
    WorkspaceMissing,
    /// Repo scripts failed to load (DB error).
    ScriptsLoadFailed,
    /// No archive script is configured — nothing to run.
    NoScript,
    /// The shell exited zero.
    Success,
    /// The shell exited non-zero with the given code (if reported).
    ScriptError { code: Option<i32> },
    /// The shell failed to spawn (binary missing, permissions, etc.).
    SpawnError { message: String },
}

/// Best-effort archive hook. Public wrapper that logs the outcome and discards it.
fn run_archive_hook(workspace_id: &str, workspace_dir: &Path, repo_root: &Path) {
    let outcome = run_archive_hook_inner(workspace_id, workspace_dir, repo_root);
    match outcome {
        ArchiveHookOutcome::Success => {
            tracing::info!(workspace_id, "Archive hook succeeded");
        }
        ArchiveHookOutcome::ScriptError { code } => {
            tracing::warn!(workspace_id, code = ?code, "Archive hook exited with error");
        }
        ArchiveHookOutcome::SpawnError { message } => {
            tracing::warn!(workspace_id, error = %message, "Archive hook failed to spawn");
        }
        ArchiveHookOutcome::NoScript
        | ArchiveHookOutcome::WorkspaceMissing
        | ArchiveHookOutcome::ScriptsLoadFailed => {
            // Silent no-ops by design.
        }
    }
}

/// Testable inner implementation. Returns a typed outcome without logging so
/// tests can assert on it deterministically.
pub(crate) fn run_archive_hook_inner(
    workspace_id: &str,
    workspace_dir: &Path,
    repo_root: &Path,
) -> ArchiveHookOutcome {
    let record = match workspace_models::load_workspace_record_by_id(workspace_id) {
        Ok(Some(r)) => r,
        _ => return ArchiveHookOutcome::WorkspaceMissing,
    };
    let scripts = match repos::load_repo_scripts(&record.repo_id, Some(workspace_id)) {
        Ok(s) => s,
        Err(_) => return ArchiveHookOutcome::ScriptsLoadFailed,
    };
    let script = match scripts.archive_script.filter(|s| !s.trim().is_empty()) {
        Some(s) => s,
        None => return ArchiveHookOutcome::NoScript,
    };

    let (shell, shell_flag) = archive_shell();
    tracing::info!(workspace_id, script = %script, shell = %shell, "Running archive hook");

    let status = Command::new(&shell)
        .arg(shell_flag)
        .arg(&script)
        .current_dir(workspace_dir)
        .env("HELMOR_ROOT_PATH", repo_root.display().to_string())
        .env("HELMOR_WORKSPACE_PATH", workspace_dir.display().to_string())
        .env("HELMOR_WORKSPACE_NAME", &record.directory_name)
        .env(
            "HELMOR_DEFAULT_BRANCH",
            record.default_branch.as_deref().unwrap_or("main"),
        )
        .status();

    match status {
        Ok(s) if s.success() => ArchiveHookOutcome::Success,
        Ok(s) => ArchiveHookOutcome::ScriptError { code: s.code() },
        Err(e) => ArchiveHookOutcome::SpawnError {
            message: e.to_string(),
        },
    }
}

pub fn prepare_archive_plan(workspace_id: &str) -> Result<ArchivePreparedPlan> {
    let timing = std::time::Instant::now();
    let record = workspace_models::load_workspace_record_by_id(workspace_id)?
        .ok_or_else(|| coded(ErrorCode::WorkspaceNotFound))
        .with_context(|| format!("Workspace not found: {workspace_id}"))?;

    if !is_archive_eligible_state(record.state) {
        bail!(
            "Workspace is not archive-ready: {workspace_id} (state: {})",
            record.state
        );
    }

    let repo_root = helpers::non_empty(&record.root_path)
        .map(PathBuf::from)
        .with_context(|| format!("Workspace {workspace_id} is missing repo root_path"))?;
    let branch = helpers::non_empty(&record.branch)
        .map(ToOwned::to_owned)
        .with_context(|| format!("Workspace {workspace_id} is missing branch"))?;
    if !repo_root.is_dir() {
        bail_coded!(
            ErrorCode::WorkspaceBroken,
            "Archive source repository is missing at {}",
            repo_root.display()
        );
    }

    let workspace_dir = crate::data_dir::workspace_dir(&record.repo_name, &record.directory_name)?;
    if !workspace_dir.is_dir() {
        bail_coded!(
            ErrorCode::WorkspaceBroken,
            "Archive source workspace is missing at {}",
            workspace_dir.display()
        );
    }

    tracing::debug!(
        workspace_id,
        elapsed_ms = timing.elapsed().as_millis(),
        "Archive: prepare_archive_plan finished"
    );
    Ok(ArchivePreparedPlan {
        workspace_id: workspace_id.to_string(),
        repo_root,
        branch,
        workspace_dir,
    })
}

pub fn validate_archive_workspace(workspace_id: &str) -> Result<()> {
    prepare_archive_plan(workspace_id).map(|_| ())
}

pub fn archive_workspace_impl(workspace_id: &str) -> Result<ArchiveWorkspaceResponse> {
    let plan = prepare_archive_plan(workspace_id)?;
    execute_archive_plan(&plan)
}

pub fn execute_archive_plan(plan: &ArchivePreparedPlan) -> Result<ArchiveWorkspaceResponse> {
    let repo_root = &plan.repo_root;
    let branch = &plan.branch;
    let workspace_dir = &plan.workspace_dir;
    let workspace_id = &plan.workspace_id;
    let timing = std::time::Instant::now();
    if !repo_root.is_dir() {
        bail_coded!(
            ErrorCode::WorkspaceBroken,
            "Archive source repository is missing at {}",
            repo_root.display()
        );
    }
    let git_started = std::time::Instant::now();
    let archive_commit = git_ops::current_workspace_head_commit(workspace_dir)?;
    git_ops::verify_commit_exists(repo_root, &archive_commit)?;
    tracing::debug!(
        workspace_id,
        elapsed_ms = git_started.elapsed().as_millis(),
        "Archive: HEAD resolve + verify finished"
    );

    // Run archive script (best-effort, don't block archive on script failure).
    let hook_started = std::time::Instant::now();
    run_archive_hook(workspace_id, workspace_dir, repo_root);
    tracing::info!(
        workspace_id,
        elapsed_ms = hook_started.elapsed().as_millis(),
        "Archive hook finished"
    );

    let remove_worktree_started = std::time::Instant::now();
    git_ops::remove_worktree(repo_root, workspace_dir)?;
    tracing::info!(
        workspace_id,
        elapsed_ms = remove_worktree_started.elapsed().as_millis(),
        "Archive worktree removal finished"
    );

    let branch_delete_started = std::time::Instant::now();
    git_ops::run_git(
        [
            "-C",
            &repo_root.display().to_string(),
            "branch",
            "-D",
            branch,
        ],
        None,
    )
    .ok();
    tracing::debug!(
        workspace_id,
        elapsed_ms = branch_delete_started.elapsed().as_millis(),
        "Archive: branch delete finished"
    );

    let db_started = std::time::Instant::now();
    if let Err(error) =
        workspace_models::update_archived_workspace_state(workspace_id, &archive_commit)
    {
        cleanup_failed_archive(repo_root, workspace_dir, branch, &archive_commit);
        return Err(error);
    }

    tracing::debug!(
        workspace_id,
        elapsed_ms = db_started.elapsed().as_millis(),
        "Archive: DB state update finished"
    );
    tracing::info!(
        workspace_id,
        elapsed_ms = timing.elapsed().as_millis(),
        "Archive execution finished"
    );

    Ok(ArchiveWorkspaceResponse {
        archived_workspace_id: workspace_id.to_string(),
        archived_state: WorkspaceState::Archived,
    })
}

struct RestorePreflightData {
    repo_root: PathBuf,
    branch: String,
    archive_commit: Option<String>,
    target_branch: String,
    remote: String,
    workspace_dir: PathBuf,
}

fn restore_workspace_preflight(workspace_id: &str) -> Result<RestorePreflightData> {
    let record = workspace_models::load_workspace_record_by_id(workspace_id)?
        .ok_or_else(|| coded(ErrorCode::WorkspaceNotFound))
        .with_context(|| format!("Workspace not found: {workspace_id}"))?;

    if record.state != WorkspaceState::Archived {
        bail!("Workspace is not archived: {workspace_id}");
    }

    let repo_root = helpers::non_empty(&record.root_path)
        .map(PathBuf::from)
        .with_context(|| format!("Workspace {workspace_id} is missing repo root_path"))?;
    let branch = helpers::non_empty(&record.branch)
        .map(ToOwned::to_owned)
        .with_context(|| format!("Workspace {workspace_id} is missing branch"))?;
    let archive_commit = helpers::non_empty(&record.archive_commit).map(ToOwned::to_owned);
    let target_branch = helpers::non_empty(&record.intended_target_branch)
        .or_else(|| helpers::non_empty(&record.default_branch))
        .unwrap_or("main")
        .to_string();
    let remote = record.remote.unwrap_or_else(|| "origin".to_string());

    let workspace_dir = crate::data_dir::workspace_dir(&record.repo_name, &record.directory_name)?;
    git_ops::ensure_git_repository(&repo_root)?;
    if let Some(archive_commit) = archive_commit.as_deref() {
        git_ops::verify_commit_exists(&repo_root, archive_commit)?;
    }

    Ok(RestorePreflightData {
        repo_root,
        branch,
        archive_commit,
        target_branch,
        remote,
        workspace_dir,
    })
}

pub fn validate_restore_workspace(workspace_id: &str) -> Result<ValidateRestoreResponse> {
    let preflight = restore_workspace_preflight(workspace_id)?;

    let record = workspace_models::load_workspace_record_by_id(workspace_id)?
        .ok_or_else(|| coded(ErrorCode::WorkspaceNotFound))
        .with_context(|| format!("Workspace not found: {workspace_id}"))?;
    let remote = record.remote.unwrap_or_else(|| "origin".to_string());
    let intended = record
        .intended_target_branch
        .filter(|value| !value.trim().is_empty());

    let conflict = if let Some(ref target) = intended {
        let has_any_refs = !git_ops::list_remote_branches(&preflight.repo_root, &remote)
            .unwrap_or_default()
            .is_empty();

        let exists = git_ops::verify_remote_ref_exists(&preflight.repo_root, &remote, target)
            .unwrap_or(false);

        if exists || !has_any_refs {
            None
        } else {
            let repo = crate::repos::load_repository_by_id(&record.repo_id)?
                .with_context(|| format!("Repository not found: {}", record.repo_id))?;
            let suggested = repo.default_branch.unwrap_or_else(|| "main".to_string());
            Some(TargetBranchConflict {
                current_branch: target.clone(),
                suggested_branch: suggested,
                remote,
            })
        }
    } else {
        None
    };

    Ok(ValidateRestoreResponse {
        target_branch_conflict: conflict,
    })
}

pub fn restore_workspace_impl(
    workspace_id: &str,
    target_branch_override: Option<&str>,
) -> Result<RestoreWorkspaceResponse> {
    let RestorePreflightData {
        repo_root,
        branch,
        archive_commit,
        target_branch: stored_target_branch,
        remote,
        workspace_dir,
    } = restore_workspace_preflight(workspace_id)?;
    let target_branch = target_branch_override
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(stored_target_branch.as_str());

    if workspace_dir.exists() {
        std::fs::remove_dir_all(&workspace_dir).with_context(|| {
            format!(
                "Failed to remove existing workspace directory: {}",
                workspace_dir.display()
            )
        })?;
    }

    fs::create_dir_all(workspace_dir.parent().with_context(|| {
        format!(
            "Workspace restore target has no parent: {}",
            workspace_dir.display()
        )
    })?)
    .with_context(|| {
        format!(
            "Failed to create workspace parent directory for {}",
            workspace_dir.display()
        )
    })?;

    let actual_branch = helpers::next_available_branch_name(&repo_root, &branch)?;

    let (start_point, restored_from_target_branch) = match archive_commit.as_deref() {
        Some(commit) => {
            git_ops::verify_commit_exists(&repo_root, commit).with_context(|| {
                format!(
                    "Archive commit {commit} no longer exists in {} \
                     (likely garbage-collected). Cannot restore.",
                    repo_root.display()
                )
            })?;
            (commit.to_string(), None)
        }
        None => (
            resolve_restore_target_start_point(&repo_root, &remote, target_branch)?,
            Some(target_branch.to_string()),
        ),
    };

    git_ops::run_git(
        [
            "-C",
            &repo_root.display().to_string(),
            "branch",
            &actual_branch,
            &start_point,
        ],
        None,
    )
    .with_context(|| format!("Failed to create branch {actual_branch} from {start_point}"))?;
    let _ = git_ops::run_git(
        [
            "-C",
            &repo_root.display().to_string(),
            "branch",
            "--unset-upstream",
            &actual_branch,
        ],
        None,
    );

    git_ops::create_worktree(&repo_root, &workspace_dir, &actual_branch)?;

    if actual_branch != branch {
        let conn = db::write_conn().map_err(|error| {
            cleanup_failed_restore(&repo_root, &workspace_dir, &actual_branch);
            error.context("Failed to open DB to persist restored branch name")
        })?;
        conn.execute(
            "UPDATE workspaces SET branch = ?1 WHERE id = ?2",
            rusqlite::params![actual_branch, workspace_id],
        )
        .map_err(|error| {
            cleanup_failed_restore(&repo_root, &workspace_dir, &actual_branch);
            anyhow::anyhow!("Failed to persist restored branch name in DB: {error}")
        })?;
    }

    if let Err(error) =
        workspace_models::update_restored_workspace_state(workspace_id, target_branch_override)
    {
        cleanup_failed_restore(&repo_root, &workspace_dir, &actual_branch);
        return Err(error);
    }

    let branch_rename = if actual_branch != branch {
        Some(BranchRename {
            original: branch,
            actual: actual_branch,
        })
    } else {
        None
    };

    Ok(RestoreWorkspaceResponse {
        restored_workspace_id: workspace_id.to_string(),
        restored_state: WorkspaceState::Ready,
        selected_workspace_id: workspace_id.to_string(),
        branch_rename,
        restored_from_target_branch,
    })
}

fn resolve_restore_target_start_point(
    repo_root: &Path,
    remote: &str,
    target_branch: &str,
) -> Result<String> {
    if git_ops::verify_branch_exists(repo_root, target_branch).is_ok() {
        return Ok(target_branch.to_string());
    }

    if git_ops::verify_remote_ref_exists(repo_root, remote, target_branch)? {
        return Ok(format!("{remote}/{target_branch}"));
    }

    bail!(
        "Cannot restore workspace without an archive commit: target branch {target_branch} was not found"
    );
}

fn cleanup_failed_created_workspace(
    workspace_id: &str,
    repo_root: &Path,
    workspace_dir: &Path,
    branch: &str,
    created_worktree: bool,
) {
    if created_worktree && workspace_dir.exists() {
        let _ = git_ops::remove_worktree(repo_root, workspace_dir);
        let _ = fs::remove_dir_all(workspace_dir);
    }

    if !branch.is_empty() {
        let _ = git_ops::remove_branch(repo_root, branch);
    }
    let _ = workspace_models::delete_workspace_and_session_rows(workspace_id);
}

fn cleanup_failed_restore(repo_root: &Path, workspace_dir: &Path, branch: &str) {
    let _ = git_ops::remove_worktree(repo_root, workspace_dir);
    let _ = fs::remove_dir_all(workspace_dir);
    let _ = git_ops::remove_branch(repo_root, branch);
}

fn cleanup_failed_archive(
    repo_root: &Path,
    workspace_dir: &Path,
    branch: &str,
    archive_commit: &str,
) {
    let _ = git_ops::point_branch_to_commit(repo_root, branch, archive_commit);

    if !workspace_dir.exists() {
        let _ = git_ops::create_worktree(repo_root, workspace_dir, branch);
    }
}

#[cfg(test)]
mod tests {
    //! Baseline archive-hook outcome tests. Exercise the enum without requiring
    //! a real workspace in the database — the WorkspaceMissing path is the
    //! easiest to reach deterministically from a unit test.
    use super::*;

    #[test]
    fn archive_hook_inner_returns_workspace_missing_for_unknown_id() {
        let tmp = std::env::temp_dir();
        let outcome = run_archive_hook_inner("nonexistent-workspace-id", &tmp, &tmp);
        // Whatever the DB state, an unknown workspace id must short-circuit to
        // WorkspaceMissing or ScriptsLoadFailed — never spawn a shell or Success.
        assert!(
            matches!(
                outcome,
                ArchiveHookOutcome::WorkspaceMissing | ArchiveHookOutcome::ScriptsLoadFailed
            ),
            "unexpected outcome for unknown workspace id: {outcome:?}"
        );
    }

    #[test]
    fn archive_hook_outcome_debug_is_stable() {
        // Lock the debug representations that show up in logs/test diagnostics.
        assert_eq!(format!("{:?}", ArchiveHookOutcome::Success), "Success");
        assert_eq!(format!("{:?}", ArchiveHookOutcome::NoScript), "NoScript");
        assert_eq!(
            format!("{:?}", ArchiveHookOutcome::ScriptError { code: Some(7) }),
            "ScriptError { code: Some(7) }"
        );
    }

    #[test]
    fn archive_hook_outcome_equality() {
        assert_eq!(
            ArchiveHookOutcome::ScriptError { code: Some(1) },
            ArchiveHookOutcome::ScriptError { code: Some(1) }
        );
        assert_ne!(
            ArchiveHookOutcome::ScriptError { code: Some(1) },
            ArchiveHookOutcome::ScriptError { code: Some(2) }
        );
        assert_ne!(ArchiveHookOutcome::Success, ArchiveHookOutcome::NoScript);
    }
}
