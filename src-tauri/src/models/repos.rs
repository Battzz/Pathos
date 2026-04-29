use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{git_ops, helpers, workspace_state};

use super::db;

/// Sentinel value: when a folder is selected for import but doesn't have a
/// `.git` directory, we mark the resolved input as non-git so the import
/// flow skips git-only fields (remote, default_branch, forge detection).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ImportKind {
    Git,
    NonGit,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryCreateOption {
    pub id: String,
    pub name: String,
    pub remote: Option<String>,
    pub remote_url: Option<String>,
    pub default_branch: Option<String>,
    pub branch_prefix_custom: Option<String>,
    pub forge_provider: Option<String>,
    pub repo_icon_src: Option<String>,
    pub repo_initials: String,
    pub is_git: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddRepositoryDefaults {
    pub last_clone_directory: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddRepositoryResponse {
    pub repository_id: String,
    pub created_repository: bool,
    /// True when the imported folder is a git working tree. False for
    /// plain folders — those can host chats but not branched workspaces.
    pub is_git: bool,
}

#[derive(Debug, Clone)]
pub struct ResolvedRepositoryInput {
    pub name: String,
    pub normalized_root_path: String,
    /// False when the imported folder isn't a git working tree. Drives
    /// the `repos.is_git` column and gates worktree-creating UI.
    pub is_git: bool,
    pub remote: Option<String>,
    pub remote_url: Option<String>,
    /// Optional for non-git folders. For git folders this is resolved
    /// from the remote HEAD (or local refs as a fallback).
    pub default_branch: Option<String>,
    /// Forge classification cached on the repo record. Set at repo-creation
    /// time by `crate::forge::detect_provider_for_repo_offline`.
    pub forge_provider: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct RepositoryRecord {
    pub id: String,
    #[allow(dead_code)] // Kept for callers that need a complete repository snapshot.
    pub name: String,
    pub remote: Option<String>,
    pub default_branch: Option<String>,
    pub root_path: String,
    #[allow(dead_code)] // Queried separately via RepoScripts; kept here for completeness.
    pub setup_script: Option<String>,
    #[allow(dead_code)] // Queried separately via RepoScripts; kept here for completeness.
    pub run_script: Option<String>,
    /// Defaults to true for setup automation; users disable it from repo settings.
    #[allow(dead_code)] // Queried separately via RepoScripts; kept here for completeness.
    pub auto_run_setup: bool,
    /// Cached forge classification ("github" / "gitlab" / "unknown").
    /// NULL for repos created before the detection feature — the loader
    /// re-runs detection on demand in that case.
    #[allow(dead_code)]
    pub forge_provider: Option<String>,
    /// True when the imported folder is a git working tree.
    pub is_git: bool,
}

pub fn list_repositories() -> Result<Vec<RepositoryCreateOption>> {
    let connection = db::read_conn()?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
              id,
              name,
              default_branch,
              root_path,
              remote,
              remote_url,
              forge_provider,
              branch_prefix_custom,
              COALESCE(is_git, 1) AS is_git
            FROM repos
            WHERE COALESCE(hidden, 0) = 0
            ORDER BY COALESCE(display_order, 0) ASC, LOWER(name) ASC
            "#,
        )
        .context("Failed to prepare repository list query")?;

    let rows = statement
        .query_map([], |row| {
            let name: String = row.get(1)?;
            let root_path: Option<String> = row.get(3)?;
            let initials = helpers::repo_initials_for_name(&name);
            let icon_src = helpers::repo_icon_src_for_root_path(root_path.as_deref());

            Ok(RepositoryCreateOption {
                id: row.get(0)?,
                name,
                remote: row.get(4)?,
                remote_url: row.get(5)?,
                forge_provider: row.get(6)?,
                branch_prefix_custom: row.get(7)?,
                default_branch: row.get(2)?,
                repo_icon_src: icon_src,
                repo_initials: initials,
                is_git: row.get::<_, i64>(8)? != 0,
            })
        })
        .context("Failed to load repositories")?;

    rows.collect::<std::result::Result<Vec<_>, _>>()
        .context("Failed to deserialize repositories")
}

pub(crate) fn load_repository_by_id(repo_id: &str) -> Result<Option<RepositoryRecord>> {
    let connection = db::read_conn()?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, name, remote, default_branch, root_path, setup_script, run_script, auto_run_setup, forge_provider, COALESCE(is_git, 1)
            FROM repos
            WHERE id = ?1
            "#,
        )
        .with_context(|| format!("Failed to prepare repository lookup for {repo_id}"))?;

    let mut rows = statement
        .query_map([repo_id], |row| {
            Ok(RepositoryRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                remote: row.get(2)?,
                default_branch: row.get(3)?,
                root_path: row.get(4)?,
                setup_script: row.get(5)?,
                run_script: row.get(6)?,
                auto_run_setup: row.get::<_, Option<i64>>(7)?.unwrap_or(1) != 0,
                forge_provider: row.get(8)?,
                is_git: row.get::<_, i64>(9)? != 0,
            })
        })
        .with_context(|| format!("Failed to query repository {repo_id}"))?;

    match rows.next() {
        Some(result) => result
            .map(Some)
            .with_context(|| format!("Failed to deserialize repository {repo_id}")),
        None => Ok(None),
    }
}

pub(crate) fn load_repository_by_root_path(root_path: &str) -> Result<Option<RepositoryRecord>> {
    let connection = db::read_conn()?;
    if let Some(repository) = query_repository_by_root_path(&connection, root_path)? {
        return Ok(Some(repository));
    }

    if let Some(normalized_root) = normalize_filesystem_path(Path::new(root_path)) {
        if normalized_root != root_path {
            if let Some(repository) = query_repository_by_root_path(&connection, &normalized_root)?
            {
                return Ok(Some(repository));
            }
        }

        if let Some(repository_name) = Path::new(root_path)
            .file_name()
            .and_then(|value| value.to_str())
        {
            for repository in query_repository_candidates_by_name(&connection, repository_name)? {
                let normalized_repository_root =
                    normalize_filesystem_path(Path::new(&repository.root_path))
                        .unwrap_or_else(|| repository.root_path.clone());
                if normalized_repository_root == normalized_root {
                    return Ok(Some(repository));
                }
            }
        }
    }

    Ok(None)
}

fn query_repository_by_root_path(
    connection: &rusqlite::Connection,
    root_path: &str,
) -> Result<Option<RepositoryRecord>> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, name, remote, default_branch, root_path, setup_script, run_script, auto_run_setup, forge_provider, COALESCE(is_git, 1)
            FROM repos
            WHERE root_path = ?1
            ORDER BY created_at ASC
            LIMIT 1
            "#,
        )
        .with_context(|| format!("Failed to prepare repository root lookup for {root_path}"))?;

    let mut rows = statement
        .query_map([root_path], |row| {
            Ok(RepositoryRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                remote: row.get(2)?,
                default_branch: row.get(3)?,
                root_path: row.get(4)?,
                setup_script: row.get(5)?,
                run_script: row.get(6)?,
                auto_run_setup: row.get::<_, Option<i64>>(7)?.unwrap_or(1) != 0,
                forge_provider: row.get(8)?,
                is_git: row.get::<_, i64>(9)? != 0,
            })
        })
        .with_context(|| format!("Failed to query repository row for {root_path}"))?;

    match rows.next() {
        Some(result) => result
            .map(Some)
            .with_context(|| format!("Failed to deserialize repository for {root_path}")),
        None => Ok(None),
    }
}

fn query_repository_candidates_by_name(
    connection: &rusqlite::Connection,
    repository_name: &str,
) -> Result<Vec<RepositoryRecord>> {
    let root_suffix = format!("%/{repository_name}");
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, name, remote, default_branch, root_path, setup_script, run_script, auto_run_setup, forge_provider, COALESCE(is_git, 1)
            FROM repos
            WHERE name = ?1 OR root_path LIKE ?2
            ORDER BY created_at ASC
            "#,
        )
        .with_context(|| {
            format!("Failed to prepare repository candidate lookup for {repository_name}")
        })?;

    let rows = statement
        .query_map([repository_name, root_suffix.as_str()], |row| {
            Ok(RepositoryRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                remote: row.get(2)?,
                default_branch: row.get(3)?,
                root_path: row.get(4)?,
                setup_script: row.get(5)?,
                run_script: row.get(6)?,
                auto_run_setup: row.get::<_, Option<i64>>(7)?.unwrap_or(1) != 0,
                forge_provider: row.get(8)?,
                is_git: row.get::<_, i64>(9)? != 0,
            })
        })
        .with_context(|| format!("Failed to query repository candidates for {repository_name}"))?;

    rows.collect::<std::result::Result<Vec<_>, _>>()
        .with_context(|| {
            format!("Failed to deserialize repository candidates for {repository_name}")
        })
}

pub(crate) fn insert_repository(repository: &ResolvedRepositoryInput) -> Result<String> {
    let connection = db::write_conn()?;
    let next_display_order: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(display_order), 0) + 1 FROM repos",
            [],
            |row| row.get(0),
        )
        .context("Failed to resolve next repository display order")?;
    let repo_id = uuid::Uuid::new_v4().to_string();

    connection
        .execute(
            r#"
            INSERT INTO repos (
              id,
              name,
              root_path,
              remote,
              remote_url,
              default_branch,
              display_order,
              hidden,
              setup_script,
              run_script,
              archive_script,
              forge_provider,
              is_git,
              created_at,
              updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, NULL, NULL, NULL, ?8, ?9, datetime('now'), datetime('now'))
            "#,
            (
                repo_id.as_str(),
                repository.name.as_str(),
                repository.normalized_root_path.as_str(),
                repository.remote.as_deref(),
                repository.remote_url.as_deref(),
                repository.default_branch.as_deref(),
                next_display_order,
                repository.forge_provider.as_deref(),
                if repository.is_git { 1_i64 } else { 0 },
            ),
        )
        .with_context(|| format!("Failed to insert repository {}", repository.name))?;

    Ok(repo_id)
}

/// Atomically update the remote and re-resolve default_branch from the new
/// remote's HEAD. Falls back to "main" if the remote HEAD can't be resolved.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRepositoryRemoteResponse {
    /// Number of ready workspaces whose `intended_target_branch` does not
    /// exist on the new remote. Zero means everything lines up.
    pub orphaned_workspace_count: u64,
}

pub fn update_repository_remote(
    repo_id: &str,
    remote: &str,
) -> Result<UpdateRepositoryRemoteResponse> {
    let repository = load_repository_by_id(repo_id)?
        .with_context(|| format!("Repository not found: {repo_id}"))?;
    let repo_root = std::path::PathBuf::from(repository.root_path.trim());

    let new_default_branch = resolve_default_branch_from_remote_head(&repo_root, remote)
        .with_context(|| {
            format!("Remote \"{remote}\" has no HEAD — cannot determine default branch")
        })?;
    let new_remote_url = resolve_repository_remote_url(&repo_root, remote).ok();

    // Re-classify locally when the remote swaps; no network or CLI probes
    // on this settings path.
    let (new_provider, _) = crate::forge::detect_provider_for_repo_offline(
        new_remote_url.as_deref(),
        Some(repo_root.as_path()),
    );
    let new_forge_provider = new_provider.as_storage_str().to_string();

    let connection = db::write_conn()?;
    let updated = connection
        .execute(
            "UPDATE repos SET remote = ?1, default_branch = ?2, remote_url = ?3, forge_provider = ?4, updated_at = datetime('now') WHERE id = ?5",
            rusqlite::params![remote, new_default_branch, new_remote_url, new_forge_provider, repo_id],
        )
        .with_context(|| format!("Failed to update remote for {repo_id}"))?;

    if updated != 1 {
        bail!("Repository not found: {repo_id}");
    }

    // Fetch refs so branch/target status has local remote-tracking refs.
    // This must succeed before accepting the remote change.
    git_ops::fetch_all_remote(&repo_root, remote)
        .with_context(|| format!("Failed to fetch from remote \"{remote}\""))?;

    // Check how many ready workspaces have a target branch that doesn't
    // exist on the new remote. We don't auto-overwrite — let the user
    // decide via the header branch picker.
    let remote_branches = git_ops::list_remote_branches(&repo_root, remote).unwrap_or_default();

    let sql = format!(
        "SELECT intended_target_branch FROM workspaces WHERE repository_id = ?1 AND state {}",
        workspace_state::OPERATIONAL_FILTER,
    );
    let mut stmt = connection
        .prepare(&sql)
        .context("Failed to query workspace target branches")?;
    let targets: Vec<String> = stmt
        .query_map([repo_id], |row| row.get::<_, Option<String>>(0))
        .context("Failed to read workspace target branches")?
        .filter_map(|r| r.ok().flatten())
        .filter(|t| !t.trim().is_empty())
        .collect();

    let orphaned = targets
        .iter()
        .filter(|t| !remote_branches.contains(t))
        .count() as u64;

    Ok(UpdateRepositoryRemoteResponse {
        orphaned_workspace_count: orphaned,
    })
}

pub fn list_repo_remotes(repo_id: &str) -> Result<Vec<String>> {
    let repository = load_repository_by_id(repo_id)?
        .with_context(|| format!("Repository not found: {repo_id}"))?;
    let repo_root = std::path::PathBuf::from(repository.root_path.trim());
    git_ops::ensure_git_repository(&repo_root)?;
    git_ops::list_remotes(&repo_root)
}

/// Write the forge_provider cache for a repo. Called on the legacy path
/// where `get_workspace_forge` ran detection because the row predates this
/// feature — persisting avoids re-detecting on every subsequent query.
pub fn update_repository_forge_provider(repo_id: &str, provider: &str) -> Result<()> {
    let connection = db::write_conn()?;
    connection
        .execute(
            "UPDATE repos SET forge_provider = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![provider, repo_id],
        )
        .with_context(|| format!("Failed to update forge_provider for {repo_id}"))?;
    Ok(())
}

pub fn update_repository_default_branch(repo_id: &str, default_branch: &str) -> Result<()> {
    let connection = db::write_conn()?;
    let updated = connection
        .execute(
            "UPDATE repos SET default_branch = ?1, updated_at = datetime('now') WHERE id = ?2",
            [default_branch, repo_id],
        )
        .with_context(|| format!("Failed to update default branch for {repo_id}"))?;

    if updated != 1 {
        bail!("Repository not found: {repo_id}");
    }

    Ok(())
}

/// Flip a previously-imported folder from `is_git=0` to `is_git=1` once a
/// `git init` has run inside it. Also seeds `default_branch` so later
/// queries don't have to special-case the freshly-initialised state.
pub fn mark_repository_initialised(repo_id: &str, default_branch: &str) -> Result<()> {
    let connection = db::write_conn()?;
    let updated = connection
        .execute(
            "UPDATE repos SET is_git = 1, default_branch = ?1, updated_at = datetime('now') WHERE id = ?2",
            [default_branch, repo_id],
        )
        .with_context(|| format!("Failed to mark repository {repo_id} as git-initialised"))?;

    if updated != 1 {
        bail!("Repository not found: {repo_id}");
    }

    Ok(())
}

pub fn load_repo_branch_prefix_settings(
    repo_id: &str,
) -> Result<crate::settings::EffectiveBranchPrefixSettings> {
    let connection = db::read_conn()?;
    let mut statement = connection
        .prepare("SELECT branch_prefix_custom, forge_provider, remote_url FROM repos WHERE id = ?1")
        .with_context(|| format!("Failed to prepare branch prefix lookup for {repo_id}"))?;

    let repo_settings: crate::settings::EffectiveBranchPrefixSettings = statement
        .query_row([repo_id], |row| {
            Ok(crate::settings::EffectiveBranchPrefixSettings {
                branch_prefix_type: None,
                branch_prefix_custom: row.get(0)?,
                forge_provider: row.get(1)?,
                remote_url: row.get(2)?,
            })
        })
        .with_context(|| format!("Repository not found: {repo_id}"))?;

    let custom_override = repo_settings
        .branch_prefix_custom
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(custom) = custom_override {
        return Ok(crate::settings::EffectiveBranchPrefixSettings {
            branch_prefix_type: Some("custom".to_string()),
            branch_prefix_custom: Some(custom.to_string()),
            forge_provider: repo_settings.forge_provider,
            remote_url: repo_settings.remote_url,
        });
    }

    let fallback = crate::settings::load_branch_prefix_settings().unwrap_or(
        crate::settings::BranchPrefixSettings {
            branch_prefix_type: None,
            branch_prefix_custom: None,
        },
    );

    Ok(crate::settings::EffectiveBranchPrefixSettings {
        branch_prefix_type: fallback.branch_prefix_type,
        branch_prefix_custom: fallback.branch_prefix_custom,
        forge_provider: repo_settings.forge_provider,
        remote_url: repo_settings.remote_url,
    })
}

pub fn update_repository_branch_prefix(
    repo_id: &str,
    branch_prefix_custom: Option<&str>,
) -> Result<()> {
    let branch_prefix_custom = branch_prefix_custom
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let connection = db::write_conn()?;
    let updated = connection
        .execute(
            "UPDATE repos SET branch_prefix_custom = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![branch_prefix_custom, repo_id],
        )
        .with_context(|| format!("Failed to update branch prefix for {repo_id}"))?;

    if updated != 1 {
        bail!("Repository not found: {repo_id}");
    }

    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoScripts {
    pub setup_script: Option<String>,
    pub run_script: Option<String>,
    pub archive_script: Option<String>,
    pub setup_from_project: bool,
    pub run_from_project: bool,
    pub archive_from_project: bool,
    /// Auto-run setup on workspace creation. DB-only — not configurable
    /// from `helmor.json`. Defaults to true.
    pub auto_run_setup: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoPreferences {
    pub create_pr: Option<String>,
    pub fix_errors: Option<String>,
    pub resolve_conflicts: Option<String>,
    pub branch_rename: Option<String>,
    pub general: Option<String>,
}

/// Resolve repo scripts using a fixed priority:
///
///   1. The workspace's worktree `helmor.json` — highest priority, only
///      consulted when `workspace_id` is supplied AND the worktree dir
///      exists on disk.
///   2. The source repo root's `helmor.json` — used whenever (1) can't
///      apply: no `workspace_id`, unknown workspace, or worktree missing
///      (archived / broken / pre-Phase-2 creation).
///   3. DB-level config (`repos.setup_script/run_script/archive_script`) —
///      the per-user override set via the Settings UI, used as a final
///      fallback when neither `helmor.json` source provides a value.
///
/// The same rule applies regardless of caller (runtime panel, settings
/// page, script execution, archive hook) — there is no special-case
/// branch for "creation in flight" or "no workspace context".
pub fn load_repo_scripts(repo_id: &str, workspace_id: Option<&str>) -> Result<RepoScripts> {
    // Priority 1: workspace worktree helmor.json.
    let worktree_project = workspace_id.and_then(|ws_id| {
        crate::models::workspaces::load_workspace_record_by_id(ws_id)
            .ok()
            .flatten()
            .and_then(|ws| crate::workspace_project::resolve_workspace_root_path(&ws))
            .and_then(|dir| load_helmor_json_scripts(&dir))
    });

    // Priority 2: source repo root helmor.json (worktree missing or no
    // workspace context at all).
    let project = worktree_project.or_else(|| {
        load_repository_by_id(repo_id)
            .ok()
            .flatten()
            .and_then(|repo| load_helmor_json_scripts(&PathBuf::from(repo.root_path.trim())))
    });

    // Priority 3: DB values — picked up by `pick_script` when the project
    // config doesn't provide a value.
    let connection = db::read_conn()?;
    let mut statement = connection
        .prepare(
            "SELECT setup_script, run_script, archive_script, auto_run_setup FROM repos WHERE id = ?1",
        )
        .with_context(|| format!("Failed to prepare script lookup for {repo_id}"))?;

    let (db_setup, db_run, db_archive, auto_run_setup) = statement
        .query_row([repo_id], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<i64>>(3)?.unwrap_or(1) != 0,
            ))
        })
        .with_context(|| format!("Repository not found: {repo_id}"))?;

    let (setup_script, setup_from_project) =
        pick_script(project.as_ref().and_then(|p| p.setup.as_deref()), db_setup);
    let (run_script, run_from_project) =
        pick_script(project.as_ref().and_then(|p| p.run.as_deref()), db_run);
    let (archive_script, archive_from_project) = pick_script(
        project.as_ref().and_then(|p| p.archive.as_deref()),
        db_archive,
    );

    Ok(RepoScripts {
        setup_script,
        run_script,
        archive_script,
        setup_from_project,
        run_from_project,
        archive_from_project,
        auto_run_setup,
    })
}

/// Project config wins when present; returns (value, is_from_project).
fn pick_script(project_value: Option<&str>, db_value: Option<String>) -> (Option<String>, bool) {
    match project_value {
        Some(v) => (Some(v.to_owned()), true),
        None => (db_value, false),
    }
}

struct HelmorJsonScripts {
    setup: Option<String>,
    run: Option<String>,
    archive: Option<String>,
}

fn load_helmor_json_scripts(root_path: &Path) -> Option<HelmorJsonScripts> {
    parse_project_config_scripts(&root_path.join("helmor.json"))
}

fn parse_project_config_scripts(config_path: &Path) -> Option<HelmorJsonScripts> {
    if !config_path.is_file() {
        return None;
    }
    let contents = match fs::read_to_string(config_path) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Failed to read {}: {e:#}", config_path.display());
            return None;
        }
    };
    let json: Value = match serde_json::from_str(&contents) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("Invalid JSON in {}: {e}", config_path.display());
            return None;
        }
    };
    let scripts = json.get("scripts")?;
    Some(HelmorJsonScripts {
        setup: scripts
            .get("setup")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        run: scripts
            .get("run")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        archive: scripts
            .get("archive")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
    })
}

pub fn update_repo_scripts(
    repo_id: &str,
    setup_script: Option<&str>,
    run_script: Option<&str>,
    archive_script: Option<&str>,
) -> Result<()> {
    let connection = db::write_conn()?;
    let updated = connection
        .execute(
            "UPDATE repos SET setup_script = ?1, run_script = ?2, archive_script = ?3, updated_at = datetime('now') WHERE id = ?4",
            rusqlite::params![setup_script, run_script, archive_script, repo_id],
        )
        .with_context(|| format!("Failed to update scripts for {repo_id}"))?;

    if updated != 1 {
        bail!("Repository not found: {repo_id}");
    }

    Ok(())
}

/// Persist the user opt-in flag that controls whether the setup script
/// auto-runs on workspace creation.
pub fn update_repo_auto_run_setup(repo_id: &str, enabled: bool) -> Result<()> {
    let connection = db::write_conn()?;
    let updated = connection
        .execute(
            "UPDATE repos SET auto_run_setup = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![if enabled { 1 } else { 0 }, repo_id],
        )
        .with_context(|| format!("Failed to update auto_run_setup for {repo_id}"))?;

    if updated != 1 {
        bail!("Repository not found: {repo_id}");
    }

    Ok(())
}

pub fn load_repo_preferences(repo_id: &str) -> Result<RepoPreferences> {
    let connection = db::read_conn()?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
              custom_prompt_create_pr,
              custom_prompt_fix_errors,
              custom_prompt_resolve_merge_conflicts,
              custom_prompt_rename_branch,
              custom_prompt_general
            FROM repos
            WHERE id = ?1
            "#,
        )
        .with_context(|| format!("Failed to prepare preferences lookup for {repo_id}"))?;

    statement
        .query_row([repo_id], |row| {
            Ok(RepoPreferences {
                create_pr: row.get(0)?,
                fix_errors: row.get(1)?,
                resolve_conflicts: row.get(2)?,
                branch_rename: row.get(3)?,
                general: row.get(4)?,
            })
        })
        .with_context(|| format!("Repository not found: {repo_id}"))
}

pub fn update_repo_preferences(repo_id: &str, preferences: &RepoPreferences) -> Result<()> {
    let connection = db::write_conn()?;
    let updated = connection
        .execute(
            r#"
            UPDATE repos
            SET
              custom_prompt_create_pr = ?1,
              custom_prompt_fix_errors = ?2,
              custom_prompt_resolve_merge_conflicts = ?3,
              custom_prompt_rename_branch = ?4,
              custom_prompt_general = ?5,
              updated_at = datetime('now')
            WHERE id = ?6
            "#,
            rusqlite::params![
                normalize_repo_preference(preferences.create_pr.as_deref()),
                normalize_repo_preference(preferences.fix_errors.as_deref()),
                normalize_repo_preference(preferences.resolve_conflicts.as_deref()),
                normalize_repo_preference(preferences.branch_rename.as_deref()),
                normalize_repo_preference(preferences.general.as_deref()),
                repo_id
            ],
        )
        .with_context(|| format!("Failed to update preferences for {repo_id}"))?;

    if updated != 1 {
        bail!("Repository not found: {repo_id}");
    }

    Ok(())
}

fn normalize_repo_preference(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

struct RepositoryWorkspaceArtifact {
    repo_root: PathBuf,
    repo_name: String,
    directory_name: String,
    kind: String,
}

/// Delete a repository and all related data (workspaces, sessions, messages, etc.)
/// plus Helmor-managed worktree directories. The imported project root is
/// never deleted; only `kind='workspace'` rows map to managed worktrees.
pub fn delete_repository_cascade(repo_id: &str) -> Result<()> {
    let mut connection = db::write_conn()?;

    let mut statement = connection
        .prepare(
            r#"
            SELECT
              r.root_path,
              r.name,
              w.directory_name,
              COALESCE(w.kind, 'workspace') AS kind
            FROM workspaces w
            JOIN repos r ON r.id = w.repository_id
            WHERE w.repository_id = ?1
            "#,
        )
        .context("Failed to prepare repository workspace cleanup query")?;
    let artifacts = statement
        .query_map([repo_id], |row| {
            Ok(RepositoryWorkspaceArtifact {
                repo_root: PathBuf::from(row.get::<_, String>(0)?),
                repo_name: row.get(1)?,
                directory_name: row.get(2)?,
                kind: row.get(3)?,
            })
        })
        .context("Failed to query repository workspace cleanup artifacts")?
        .collect::<std::result::Result<Vec<_>, _>>()
        .context("Failed to collect repository workspace cleanup artifacts")?;
    drop(statement);

    let tx = connection
        .transaction()
        .context("Failed to start delete repository transaction")?;

    // Delete leaf data first, then parent rows.
    tx.execute(
        "DELETE FROM session_messages WHERE session_id IN (SELECT s.id FROM sessions s JOIN workspaces w ON s.workspace_id = w.id WHERE w.repository_id = ?1)",
        [repo_id],
    ).context("Failed to delete session messages for repository")?;
    tx.execute(
        "DELETE FROM sessions WHERE workspace_id IN (SELECT id FROM workspaces WHERE repository_id = ?1)",
        [repo_id],
    ).context("Failed to delete sessions for repository")?;
    tx.execute(
        "DELETE FROM pending_cli_sends WHERE workspace_id IN (SELECT id FROM workspaces WHERE repository_id = ?1)",
        [repo_id],
    ).context("Failed to delete pending sends for repository")?;
    tx.execute("DELETE FROM workspaces WHERE repository_id = ?1", [repo_id])
        .context("Failed to delete workspaces for repository")?;
    tx.execute("DELETE FROM repos WHERE id = ?1", [repo_id])
        .context("Failed to delete repository row")?;

    tx.commit()
        .context("Failed to commit delete repository transaction")?;

    for artifact in artifacts {
        if artifact.kind != "workspace" || artifact.directory_name.trim().is_empty() {
            continue;
        }
        let Ok(workspace_dir) =
            crate::data_dir::workspace_dir(&artifact.repo_name, &artifact.directory_name)
        else {
            continue;
        };
        if !workspace_dir.exists() {
            continue;
        }
        if let Err(error) = git_ops::remove_worktree(&artifact.repo_root, &workspace_dir) {
            tracing::warn!(
                path = %workspace_dir.display(),
                error = %error,
                "Failed to remove managed worktree during project deletion; falling back to directory removal"
            );
            if let Err(remove_error) = std::fs::remove_dir_all(&workspace_dir) {
                tracing::warn!(
                    path = %workspace_dir.display(),
                    error = %remove_error,
                    "Failed to remove managed workspace directory during project deletion"
                );
            }
        }
    }

    Ok(())
}

pub fn resolve_repository_from_local_path(folder_path: &str) -> Result<ResolvedRepositoryInput> {
    let (normalized_root_path, kind) = resolve_project_root_path(folder_path)?;
    let normalized_root = Path::new(&normalized_root_path);
    let name = normalized_root
        .file_name()
        .and_then(|value| value.to_str())
        .map(ToOwned::to_owned)
        .filter(|value| !value.trim().is_empty())
        .with_context(|| {
            format!(
                "Failed to derive repository name from {}",
                normalized_root.display()
            )
        })?;

    if kind == ImportKind::NonGit {
        // Non-git folders only support chats (no remote, no branch, no
        // forge). The frontend hides the "+ Workspace" affordance for these.
        return Ok(ResolvedRepositoryInput {
            name,
            normalized_root_path,
            is_git: false,
            remote: None,
            remote_url: None,
            default_branch: None,
            forge_provider: None,
        });
    }

    let remote = resolve_repository_remote(normalized_root)?;
    let remote_url = match remote.as_deref() {
        Some(remote_name) => Some(resolve_repository_remote_url(normalized_root, remote_name)?),
        None => None,
    };
    // Default branch is best-effort for git repos: if there's no remote
    // (e.g. a freshly initialized repo with no upstream yet) we leave it
    // None and the user can configure it later from repo settings.
    let default_branch = resolve_repository_default_branch(normalized_root, remote.as_deref());

    // Keep repo creation local: no network probes or CLI calls here.
    let (provider, _) = crate::forge::detect_provider_for_repo_offline(
        remote_url.as_deref(),
        Some(normalized_root),
    );
    let forge_provider = Some(provider.as_storage_str().to_string());

    Ok(ResolvedRepositoryInput {
        name,
        normalized_root_path,
        is_git: true,
        remote,
        remote_url,
        default_branch,
        forge_provider,
    })
}

pub fn clone_repository_from_url(
    git_url: &str,
    clone_directory: &str,
) -> Result<AddRepositoryResponse> {
    let url = git_url.trim();
    if url.is_empty() {
        bail!("Git URL is required.");
    }

    let parent = Path::new(clone_directory.trim());
    if !parent.exists() {
        bail!(
            "Clone location does not exist: {}. Please choose an existing directory.",
            parent.display()
        );
    }
    if !parent.is_dir() {
        bail!("Clone location is not a directory: {}", parent.display());
    }

    let repo_name = infer_repo_name_from_url(url)
        .with_context(|| format!("Unable to derive a repository name from URL: {url}"))?;
    let target_dir = parent.join(&repo_name);

    if target_dir.exists() {
        bail!(
            "Target directory already exists: {}. Please remove it or choose a different clone location.",
            target_dir.display()
        );
    }

    let target_arg = target_dir.display().to_string();
    let clone_result = git_ops::run_git_with_timeout(
        ["clone", "--", url, target_arg.as_str()],
        Some(parent),
        git_ops::GIT_CLONE_TIMEOUT,
    );

    if let Err(error) = clone_result {
        // git may have partially created the target directory before failing.
        // Best-effort cleanup so the user can retry without hitting the
        // "target directory already exists" branch above.
        if target_dir.exists() {
            let _ = fs::remove_dir_all(&target_dir);
        }
        return Err(error.context("Failed to clone repository"));
    }

    add_repository_from_local_path(&target_dir.display().to_string())
}

fn infer_repo_name_from_url(url: &str) -> Option<String> {
    let trimmed = url.trim().trim_end_matches('/');
    let without_git = trimmed.strip_suffix(".git").unwrap_or(trimmed);
    let last = without_git.rsplit(['/', ':']).next()?;
    let cleaned = last.trim();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.to_string())
    }
}

pub fn add_repository_from_local_path(folder_path: &str) -> Result<AddRepositoryResponse> {
    // Resolve the project root (git root if it's a working tree, otherwise
    // the folder itself). Cheap — no network calls.
    let (normalized_root_path, _kind) = resolve_project_root_path(folder_path)?;

    let last_clone_directory = Path::new(&normalized_root_path)
        .parent()
        .map(|parent| parent.display().to_string());
    if let Some(dir) = last_clone_directory.as_deref() {
        crate::settings::upsert_setting_value("last_clone_directory", dir)
            .map_err(|e| anyhow::anyhow!(e))?;
    }

    if let Some(repository) = load_repository_by_root_path(&normalized_root_path)? {
        // Re-importing an existing project is a no-op — just open it.
        return Ok(AddRepositoryResponse {
            repository_id: repository.id,
            created_repository: false,
            is_git: repository.is_git,
        });
    }

    // Only do the expensive remote/branch resolution for truly new repos.
    let resolved_repository = resolve_repository_from_local_path(folder_path)?;
    let is_git = resolved_repository.is_git;

    let repository_id = insert_repository(&resolved_repository)
        .with_context(|| format!("Failed to persist repository {}", resolved_repository.name))?;

    Ok(AddRepositoryResponse {
        repository_id,
        created_repository: true,
        is_git,
    })
}

/// Resolve the project's root path. If the selected folder is inside a
/// git working tree, the git toplevel is returned (so a user who picked a
/// subdirectory still imports the whole repo). Otherwise the folder
/// itself is returned and the import is recorded as non-git.
///
/// No network calls — only local git commands and filesystem checks.
fn resolve_project_root_path(folder_path: &str) -> Result<(String, ImportKind)> {
    let selected_path = PathBuf::from(folder_path.trim());

    if folder_path.trim().is_empty() {
        bail!("No project folder was selected.");
    }
    if !selected_path.exists() {
        bail!("Selected path does not exist: {}", selected_path.display());
    }
    if !selected_path.is_dir() {
        bail!(
            "Selected path is not a directory: {}",
            selected_path.display()
        );
    }

    let selected_path_arg = selected_path.display().to_string();
    let inside_work_tree = git_ops::run_git(
        [
            "-C",
            selected_path_arg.as_str(),
            "rev-parse",
            "--is-inside-work-tree",
        ],
        None,
    );

    let is_git = matches!(inside_work_tree, Ok(ref out) if out.trim() == "true");
    if !is_git {
        // Non-git folder: use its own canonical path. We canonicalize so
        // duplicate-import detection (root_path uniqueness) is stable.
        let canonical = normalize_filesystem_path(&selected_path)
            .unwrap_or_else(|| selected_path.display().to_string());
        return Ok((canonical, ImportKind::NonGit));
    }

    let root = git_ops::run_git(
        [
            "-C",
            selected_path_arg.as_str(),
            "rev-parse",
            "--show-toplevel",
        ],
        None,
    )
    .map_err(|error| anyhow::anyhow!("Failed to resolve Git repository root: {error}"))?;

    Ok((root.trim().to_string(), ImportKind::Git))
}

// ---- Git remote / branch resolution helpers ----

fn resolve_repository_remote(repo_root: &Path) -> Result<Option<String>> {
    let repo_root_arg = repo_root.display().to_string();
    let output = git_ops::run_git(["-C", repo_root_arg.as_str(), "remote"], None)
        .map_err(|error| anyhow::anyhow!("Failed to read repository remotes: {error}"))?;
    let mut remotes = output
        .lines()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    if remotes.is_empty() {
        return Ok(None);
    }

    // Prefer "origin" if it exists.
    if remotes.iter().any(|remote| remote == "origin") {
        return Ok(Some("origin".to_string()));
    }

    // Multiple remotes, no origin — pick the first alphabetically.
    // User can change it later in repo settings.
    remotes.sort();
    Ok(remotes.into_iter().next())
}

fn resolve_repository_remote_url(repo_root: &Path, remote: &str) -> Result<String> {
    let repo_root_arg = repo_root.display().to_string();
    git_ops::run_git(
        ["-C", repo_root_arg.as_str(), "remote", "get-url", remote],
        None,
    )
    .map(|value| value.trim().to_string())
    .map_err(|error| anyhow::anyhow!("Failed to resolve remote URL for {remote}: {error}"))
}

fn resolve_repository_default_branch(repo_root: &Path, remote: Option<&str>) -> Option<String> {
    let remote = remote?;
    resolve_default_branch_from_remote_head(repo_root, remote).ok()
}

fn resolve_default_branch_from_remote_head(repo_root: &Path, remote: &str) -> Result<String> {
    // Authoritative: query the remote directly (lightweight network call).
    if let Ok(branch) = resolve_head_from_ls_remote(repo_root, remote) {
        return Ok(branch);
    }
    // Offline fallback: local symbolic ref (may be stale).
    resolve_head_from_local_symbolic_ref(repo_root, remote)
}

fn resolve_head_from_local_symbolic_ref(repo_root: &Path, remote: &str) -> Result<String> {
    let repo_root_arg = repo_root.display().to_string();
    let output = git_ops::run_git(
        [
            "-C",
            repo_root_arg.as_str(),
            "symbolic-ref",
            "--quiet",
            "--short",
            &format!("refs/remotes/{remote}/HEAD"),
        ],
        None,
    )
    .map_err(|error| anyhow::anyhow!("Failed to resolve remote HEAD for {remote}: {error}"))?;

    let prefix = format!("{remote}/");
    output
        .trim()
        .strip_prefix(prefix.as_str())
        .map(ToOwned::to_owned)
        .filter(|value| !value.trim().is_empty())
        .with_context(|| format!("Remote HEAD for {remote} did not include a branch name"))
}

/// Query the remote via `git ls-remote --symref <remote> HEAD` to discover
/// the default branch. Only transfers a few bytes — much cheaper than a fetch.
fn resolve_head_from_ls_remote(repo_root: &Path, remote: &str) -> Result<String> {
    let output = git_ops::run_git_with_timeout(
        [
            "-C",
            &repo_root.display().to_string(),
            "ls-remote",
            "--symref",
            remote,
            "HEAD",
        ],
        None,
        git_ops::GIT_NETWORK_TIMEOUT,
    )
    .with_context(|| format!("Failed to query HEAD from remote \"{remote}\""))?;

    // Output format: "ref: refs/heads/main\tHEAD\n<sha>\tHEAD\n"
    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("ref: refs/heads/") {
            if let Some(branch) = rest.split('\t').next() {
                let branch = branch.trim();
                if !branch.is_empty() {
                    return Ok(branch.to_string());
                }
            }
        }
    }

    bail!("Remote \"{remote}\" did not advertise a HEAD branch")
}

pub(crate) fn normalize_filesystem_path(path: &Path) -> Option<String> {
    fs::canonicalize(path)
        .ok()
        .map(|canonicalized| canonicalized.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delete_repository_cascade_removes_managed_worktrees_only() {
        let env = crate::testkit::TestEnv::new("repo-delete-worktrees");
        let git_repo = crate::testkit::GitTestRepo::init();
        let project_root = git_repo.path().to_path_buf();
        let project_marker = project_root.join("project-file.txt");
        fs::write(&project_marker, "keep\n").unwrap();

        let conn = env.db_connection();
        crate::testkit::insert_repo(&conn, "r1", "demo", Some("origin"));
        conn.execute(
            "UPDATE repos SET root_path = ?1 WHERE id = 'r1'",
            [project_root.display().to_string()],
        )
        .unwrap();
        crate::testkit::insert_workspace(
            &conn,
            &crate::testkit::WorkspaceFixture {
                id: "w-worktree",
                repo_id: "r1",
                directory_name: "alpha",
                state: "ready",
                branch: Some("feature/alpha"),
                intended_target_branch: None,
            },
        );
        conn.execute(
            r#"
            INSERT INTO workspaces (
              id,
              repository_id,
              directory_name,
              state,
              status,
              kind,
              branch
            ) VALUES ('w-project', 'r1', '', 'ready', 'in-progress', 'project', 'main')
            "#,
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sessions (id, workspace_id, status, title) VALUES ('s1', 'w-worktree', 'idle', 'Workspace chat')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO session_messages (id, session_id, role, content) VALUES ('m1', 's1', 'user', '{}')",
            [],
        )
        .unwrap();
        drop(conn);

        let workspace_dir = crate::data_dir::workspace_dir("demo", "alpha").unwrap();
        fs::create_dir_all(&workspace_dir).unwrap();
        fs::write(workspace_dir.join("worktree-file.txt"), "delete\n").unwrap();

        delete_repository_cascade("r1").unwrap();

        assert!(
            !workspace_dir.exists(),
            "managed worktree directory should be removed"
        );
        assert!(
            project_marker.is_file(),
            "project root should never be deleted with the Helmor project"
        );

        let conn = env.db_connection();
        let repo_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM repos WHERE id = 'r1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        let workspace_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workspaces WHERE repository_id = 'r1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let message_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM session_messages", [], |row| {
                row.get(0)
            })
            .unwrap();

        assert_eq!(repo_count, 0);
        assert_eq!(workspace_count, 0);
        assert_eq!(message_count, 0);
    }

    #[test]
    fn insert_and_load_repository_round_trips_forge_provider() {
        let env = crate::testkit::TestEnv::new("repos-forge-provider");
        let repo = ResolvedRepositoryInput {
            name: "gitlab-repo".to_string(),
            normalized_root_path: env.root.join("repo").display().to_string(),
            remote: Some("origin".to_string()),
            remote_url: Some("git@gitlab.com:acme/gitlab-repo.git".to_string()),
            default_branch: Some("main".to_string()),
            is_git: true,
            forge_provider: Some("gitlab".to_string()),
        };

        let repo_id = insert_repository(&repo).unwrap();
        let loaded = load_repository_by_id(&repo_id).unwrap().unwrap();

        assert_eq!(loaded.forge_provider.as_deref(), Some("gitlab"));
        assert_eq!(loaded.remote.as_deref(), Some("origin"));
    }

    #[test]
    fn update_repository_forge_provider_persists_cache() {
        let env = crate::testkit::TestEnv::new("repos-forge-provider-update");
        let repo = ResolvedRepositoryInput {
            name: "legacy-repo".to_string(),
            normalized_root_path: env.root.join("legacy").display().to_string(),
            remote: Some("origin".to_string()),
            remote_url: Some("git@github.com:acme/legacy-repo.git".to_string()),
            default_branch: Some("main".to_string()),
            is_git: true,
            forge_provider: None,
        };

        let repo_id = insert_repository(&repo).unwrap();
        assert_eq!(
            load_repository_by_id(&repo_id)
                .unwrap()
                .unwrap()
                .forge_provider,
            None
        );

        update_repository_forge_provider(&repo_id, "github").unwrap();

        let loaded = load_repository_by_id(&repo_id).unwrap().unwrap();
        assert_eq!(loaded.forge_provider.as_deref(), Some("github"));
    }

    #[test]
    fn repository_branch_prefix_round_trips() {
        let env = crate::testkit::TestEnv::new("repos-branch-prefix");
        crate::settings::upsert_setting_value("branch_prefix_type", "custom").unwrap();
        crate::settings::upsert_setting_value("branch_prefix_custom", "team/").unwrap();

        let repo = ResolvedRepositoryInput {
            name: "prefix-repo".to_string(),
            normalized_root_path: env.root.join("prefix").display().to_string(),
            remote: Some("origin".to_string()),
            remote_url: Some("git@github.com:acme/prefix-repo.git".to_string()),
            default_branch: Some("main".to_string()),
            is_git: true,
            forge_provider: Some("github".to_string()),
        };

        let repo_id = insert_repository(&repo).unwrap();
        let loaded = load_repo_branch_prefix_settings(&repo_id).unwrap();
        assert_eq!(loaded.branch_prefix_type.as_deref(), Some("custom"));
        assert_eq!(loaded.branch_prefix_custom.as_deref(), Some("team/"));

        let listed = list_repositories().unwrap();
        let listed_repo = listed.iter().find(|repo| repo.id == repo_id).unwrap();
        assert_eq!(listed_repo.branch_prefix_custom.as_deref(), None);

        update_repository_branch_prefix(&repo_id, Some("repo/")).unwrap();

        let updated = load_repo_branch_prefix_settings(&repo_id).unwrap();
        assert_eq!(updated.branch_prefix_type.as_deref(), Some("custom"));
        assert_eq!(updated.branch_prefix_custom.as_deref(), Some("repo/"));

        let listed = list_repositories().unwrap();
        let listed_repo = listed.iter().find(|repo| repo.id == repo_id).unwrap();
        assert_eq!(listed_repo.branch_prefix_custom.as_deref(), Some("repo/"));

        update_repository_branch_prefix(&repo_id, None).unwrap();

        let reset = load_repo_branch_prefix_settings(&repo_id).unwrap();
        assert_eq!(reset.branch_prefix_type.as_deref(), Some("custom"));
        assert_eq!(reset.branch_prefix_custom.as_deref(), Some("team/"));
    }
}
