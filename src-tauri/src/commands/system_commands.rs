use anyhow::Context;
use serde::Serialize;
use tauri::Manager;

use crate::{agents, git_watcher, models::db, service, sidecar};

use super::common::{run_blocking, CmdResult};

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CliInstallState {
    Missing,
    Managed,
    Stale,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataInfo {
    pub data_mode: String,
    pub data_dir: String,
    pub db_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    pub installed: bool,
    pub install_path: Option<String>,
    pub build_mode: String,
    pub install_state: CliInstallState,
}

/// Where Helmor installs its managed CLI entrypoint on macOS.
fn cli_install_target() -> std::path::PathBuf {
    std::path::PathBuf::from(format!("/usr/local/bin/{}", installed_cli_name()))
}

fn installed_cli_name() -> &'static str {
    if crate::data_dir::is_dev() {
        "helmor-dev"
    } else {
        "helmor"
    }
}

/// Name of the compiled CLI binary produced by `cargo build --bin helmor-cli`.
fn cli_source_binary_name() -> &'static str {
    "helmor-cli"
}

fn bundled_cli_binary(app_exe: &std::path::Path) -> anyhow::Result<std::path::PathBuf> {
    let target_dir = app_exe
        .parent()
        .context("Cannot determine app binary directory")?;
    Ok(target_dir.join(cli_source_binary_name()))
}

fn cli_install_remediation(cli_binary: &std::path::Path, install_path: &std::path::Path) -> String {
    format!(
        "sudo ln -sfn {} {}",
        shell_quote(cli_binary),
        shell_quote(install_path),
    )
}

fn shell_quote(path: &std::path::Path) -> String {
    format!("'{}'", path.display().to_string().replace('\'', "'\\''"))
}

fn classify_cli_install(
    install_path: &std::path::Path,
    bundled_cli: &std::path::Path,
) -> CliInstallState {
    let metadata = match std::fs::symlink_metadata(install_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return CliInstallState::Missing;
        }
        Err(_) => return CliInstallState::Stale,
    };

    if !metadata.file_type().is_symlink() {
        return CliInstallState::Stale;
    }

    let target = match std::fs::read_link(install_path) {
        Ok(target) => target,
        Err(_) => return CliInstallState::Stale,
    };
    let resolved_target = if target.is_absolute() {
        target
    } else {
        install_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("/"))
            .join(target)
    };

    match (
        std::fs::canonicalize(resolved_target),
        std::fs::canonicalize(bundled_cli),
    ) {
        (Ok(installed), Ok(expected)) if installed == expected => CliInstallState::Managed,
        _ => CliInstallState::Stale,
    }
}

fn cli_status_for_paths(
    install_path: &std::path::Path,
    bundled_cli: &std::path::Path,
) -> CliStatus {
    let install_state = classify_cli_install(install_path, bundled_cli);
    CliStatus {
        installed: install_state != CliInstallState::Missing,
        install_path: (install_state != CliInstallState::Missing)
            .then(|| install_path.display().to_string()),
        build_mode: crate::data_dir::data_mode_label().to_string(),
        install_state,
    }
}

fn install_cli_symlink(
    bundled_cli: &std::path::Path,
    install_path: &std::path::Path,
) -> anyhow::Result<()> {
    if !bundled_cli.is_file() {
        anyhow::bail!(
            "CLI binary not found at {}. Run `cargo build --bin helmor-cli` first.",
            bundled_cli.display()
        );
    }

    if let Some(parent) = install_path.parent() {
        std::fs::create_dir_all(parent).with_context(|| {
            format!(
                "Failed to prepare install directory {}. Try:\n  {}",
                parent.display(),
                cli_install_remediation(bundled_cli, install_path)
            )
        })?;
    }

    match std::fs::symlink_metadata(install_path) {
        Ok(metadata) if metadata.file_type().is_dir() => {
            anyhow::bail!(
                "Install path {} is a directory. Remove it first, then run:\n  {}",
                install_path.display(),
                cli_install_remediation(bundled_cli, install_path)
            );
        }
        Ok(_) => {
            std::fs::remove_file(install_path).with_context(|| {
                format!(
                    "Failed to replace existing CLI install at {}. Try:\n  {}",
                    install_path.display(),
                    cli_install_remediation(bundled_cli, install_path)
                )
            })?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(error).with_context(|| {
                format!(
                    "Failed to inspect existing CLI install at {}. Try:\n  {}",
                    install_path.display(),
                    cli_install_remediation(bundled_cli, install_path)
                )
            });
        }
    }

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(bundled_cli, install_path).with_context(|| {
            format!(
                "Failed to install CLI at {}. Try:\n  {}",
                install_path.display(),
                cli_install_remediation(bundled_cli, install_path)
            )
        })?;
        Ok(())
    }

    #[cfg(not(unix))]
    {
        anyhow::bail!("CLI installation via symlink is only supported on Unix.");
    }
}

#[tauri::command]
pub fn get_cli_status() -> CmdResult<CliStatus> {
    let install_path = cli_install_target();
    let source = std::env::current_exe().context("Cannot determine app executable path")?;
    let cli_binary = bundled_cli_binary(&source)?;
    Ok(cli_status_for_paths(&install_path, &cli_binary))
}

#[tauri::command]
pub async fn install_cli() -> CmdResult<CliStatus> {
    run_blocking(|| {
        let source = std::env::current_exe()?;
        let cli_binary = bundled_cli_binary(&source)?;
        let install_path = cli_install_target();
        install_cli_symlink(&cli_binary, &install_path)?;
        Ok(cli_status_for_paths(&install_path, &cli_binary))
    })
    .await
}

#[tauri::command]
pub fn get_data_info() -> CmdResult<DataInfo> {
    let data_dir = crate::data_dir::data_dir()?;
    let db_path = crate::data_dir::db_path()?;

    Ok(DataInfo {
        data_mode: crate::data_dir::data_mode_label().to_string(),
        data_dir: data_dir.display().to_string(),
        db_path: db_path.display().to_string(),
    })
}

#[tauri::command]
pub async fn drain_pending_cli_sends() -> CmdResult<Vec<service::PendingCliSend>> {
    run_blocking(service::drain_pending_cli_sends).await
}

#[tauri::command]
pub async fn save_pasted_image(data: String, media_type: String) -> CmdResult<String> {
    run_blocking(move || {
        use std::fs;
        use uuid::Uuid;

        let ext = match media_type.as_str() {
            "image/jpeg" | "image/jpg" => "jpg",
            "image/gif" => "gif",
            "image/webp" => "webp",
            _ => "png",
        };

        let paste_dir = crate::data_dir::data_dir()?.join("paste-cache");
        fs::create_dir_all(&paste_dir).context("Failed to create paste-cache directory")?;

        let filename = format!("paste-{}.{}", Uuid::new_v4(), ext);
        let filepath = paste_dir.join(&filename);

        let bytes = base64_decode(&data).context("Invalid base64 data")?;

        fs::write(&filepath, &bytes)
            .with_context(|| format!("Failed to write pasted image to {}", filepath.display()))?;

        Ok(filepath.to_string_lossy().to_string())
    })
    .await
}

fn base64_decode(input: &str) -> anyhow::Result<Vec<u8>> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(input)
        .map_err(|e| anyhow::anyhow!("base64 decode error: {e}"))
}

// ---------------------------------------------------------------------------
// Graceful quit (called from the frontend quit-confirmation dialog)
// ---------------------------------------------------------------------------

/// Shut down git watchers, abort active streams (when `force`), tear down
/// the sidecar cooperatively, then exit. Git watchers go first to stop new
/// events from arriving while we drain.
#[tauri::command]
pub async fn request_quit(app: tauri::AppHandle, force: bool) {
    tracing::info!(force, "request_quit invoked from frontend");

    // 1. Stop filesystem watchers so no new events arrive.
    app.state::<git_watcher::GitWatcherManager>().shutdown();

    // 2. If tasks are in flight, gracefully stop every active stream.
    if force {
        let sidecar = app.state::<sidecar::ManagedSidecar>();
        let active = app.state::<agents::ActiveStreams>();
        agents::abort_all_active_streams_blocking(
            &sidecar,
            &active,
            std::time::Duration::from_millis(1500),
        );
    }

    // 3. Cooperative sidecar teardown: shutdown RPC → SIGTERM → SIGKILL.
    let sidecar = app.state::<sidecar::ManagedSidecar>();
    let (cooperative, escalation) = if force {
        (
            std::time::Duration::from_millis(2000),
            std::time::Duration::from_millis(500),
        )
    } else {
        (
            std::time::Duration::from_millis(500),
            std::time::Duration::from_millis(200),
        )
    };
    sidecar.shutdown(cooperative, escalation);

    // 4. Done — terminate the process.
    app.exit(0);
}

// ---------------------------------------------------------------------------
// Dev-only: nuclear data reset
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevResetResult {
    pub repos_deleted: usize,
    pub workspaces_deleted: usize,
    pub sessions_deleted: usize,
    pub messages_deleted: usize,
    pub directories_removed: Vec<String>,
}

/// Wipe **all** workspaces, sessions, messages, repos, and their filesystem
/// artefacts from the dev data directory.  Only compiled into debug builds.
///
/// Safety guard: the function asserts `data_dir::is_dev()` at runtime as well,
/// so even if someone somehow calls this from a release binary, it refuses.
#[tauri::command]
pub async fn dev_reset_all_data(app: tauri::AppHandle) -> CmdResult<DevResetResult> {
    // 1. Stop all active agent streams so they don't write into deleted sessions.
    {
        let sidecar_state = app.state::<sidecar::ManagedSidecar>();
        let active = app.state::<agents::ActiveStreams>();
        agents::abort_all_active_streams_blocking(
            &sidecar_state,
            &active,
            std::time::Duration::from_millis(1500),
        );
    }

    // 2. Stop all git watchers.
    {
        let manager = app.state::<git_watcher::GitWatcherManager>();
        manager.shutdown();
    }

    run_blocking(move || {
        use crate::data_dir;

        // Runtime double-check: never run in release.
        anyhow::ensure!(
            data_dir::is_dev(),
            "dev_reset_all_data called outside dev mode"
        );

        let data_dir = data_dir::data_dir()?;
        tracing::warn!(dir = %data_dir.display(), "DEV RESET: wiping all data");

        // --- Database cleanup (single transaction) -----------------------
        let mut conn = db::write_conn()?;
        let tx = conn
            .transaction()
            .context("Failed to start dev-reset transaction")?;

        let messages_deleted: usize = tx.execute("DELETE FROM session_messages", []).unwrap_or(0);
        let sessions_deleted: usize = tx.execute("DELETE FROM sessions", []).unwrap_or(0);
        let _pending: usize = tx.execute("DELETE FROM pending_cli_sends", []).unwrap_or(0);
        let workspaces_deleted: usize = tx.execute("DELETE FROM workspaces", []).unwrap_or(0);
        let repos_deleted: usize = tx.execute("DELETE FROM repos", []).unwrap_or(0);

        tx.commit()
            .context("Failed to commit dev-reset transaction")?;

        tracing::info!(
            repos_deleted,
            workspaces_deleted,
            sessions_deleted,
            messages_deleted,
            "DEV RESET: database cleared"
        );

        // --- Filesystem cleanup (best-effort) ----------------------------
        let mut dirs_removed = Vec::new();

        let dirs_to_clear = [
            data_dir.join("workspaces"),
            data_dir.join("archived-contexts"),
            data_dir.join("paste-cache"),
        ];

        for dir in &dirs_to_clear {
            if dir.is_dir() {
                // Remove contents but recreate the empty directory.
                if std::fs::remove_dir_all(dir).is_ok() {
                    dirs_removed.push(dir.display().to_string());
                    std::fs::create_dir_all(dir).ok();
                }
            }
        }

        // Workspace-specific logs (keep the top-level logs/ dir).
        let ws_logs = data_dir.join("logs").join("workspaces");
        if ws_logs.is_dir() && std::fs::remove_dir_all(&ws_logs).is_ok() {
            dirs_removed.push(ws_logs.display().to_string());
        }

        tracing::info!(?dirs_removed, "DEV RESET: filesystem cleaned");

        Ok(DevResetResult {
            repos_deleted,
            workspaces_deleted,
            sessions_deleted,
            messages_deleted,
            directories_removed: dirs_removed,
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn classify_cli_install_reports_missing_when_path_absent() {
        let tmp = tempdir().unwrap();
        let bundled_cli = tmp.path().join("Helmor.app/Contents/MacOS/helmor-cli");
        fs::create_dir_all(bundled_cli.parent().unwrap()).unwrap();
        fs::write(&bundled_cli, "#!/bin/sh\n").unwrap();

        let install_path = tmp.path().join("usr/local/bin/helmor");
        assert_eq!(
            classify_cli_install(&install_path, &bundled_cli),
            CliInstallState::Missing
        );
    }

    #[test]
    fn classify_cli_install_reports_managed_for_matching_symlink() {
        let tmp = tempdir().unwrap();
        let bundled_cli = tmp.path().join("Helmor.app/Contents/MacOS/helmor-cli");
        let install_path = tmp.path().join("usr/local/bin/helmor");
        fs::create_dir_all(bundled_cli.parent().unwrap()).unwrap();
        fs::create_dir_all(install_path.parent().unwrap()).unwrap();
        fs::write(&bundled_cli, "#!/bin/sh\n").unwrap();
        std::os::unix::fs::symlink(&bundled_cli, &install_path).unwrap();

        assert_eq!(
            classify_cli_install(&install_path, &bundled_cli),
            CliInstallState::Managed
        );
    }

    #[test]
    fn classify_cli_install_reports_stale_for_regular_file_copy() {
        let tmp = tempdir().unwrap();
        let bundled_cli = tmp.path().join("Helmor.app/Contents/MacOS/helmor-cli");
        let install_path = tmp.path().join("usr/local/bin/helmor");
        fs::create_dir_all(bundled_cli.parent().unwrap()).unwrap();
        fs::create_dir_all(install_path.parent().unwrap()).unwrap();
        fs::write(&bundled_cli, "#!/bin/sh\n").unwrap();
        fs::write(&install_path, "#!/bin/sh\n").unwrap();

        assert_eq!(
            classify_cli_install(&install_path, &bundled_cli),
            CliInstallState::Stale
        );
    }

    #[test]
    fn install_cli_symlink_replaces_stale_copy_with_managed_symlink() {
        let tmp = tempdir().unwrap();
        let bundled_cli = tmp.path().join("Helmor.app/Contents/MacOS/helmor-cli");
        let install_path = tmp.path().join("usr/local/bin/helmor");
        fs::create_dir_all(bundled_cli.parent().unwrap()).unwrap();
        fs::create_dir_all(install_path.parent().unwrap()).unwrap();
        fs::write(&bundled_cli, "#!/bin/sh\n").unwrap();
        fs::write(&install_path, "#!/bin/sh\n").unwrap();

        install_cli_symlink(&bundled_cli, &install_path).unwrap();

        assert_eq!(
            classify_cli_install(&install_path, &bundled_cli),
            CliInstallState::Managed
        );
    }

    #[test]
    fn cli_install_remediation_uses_force_replace_symlink_command() {
        let command = cli_install_remediation(
            std::path::Path::new("/Applications/Helmor.app/Contents/MacOS/helmor-cli"),
            std::path::Path::new("/usr/local/bin/helmor-dev"),
        );

        assert_eq!(
            command,
            "sudo ln -sfn '/Applications/Helmor.app/Contents/MacOS/helmor-cli' '/usr/local/bin/helmor-dev'"
        );
    }
}
