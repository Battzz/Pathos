use anyhow::Context;
use serde::Serialize;
use tauri::Manager;

use crate::{agents, git_watcher, models::db, service, sidecar};

use super::common::{run_blocking, CmdResult};

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
}

/// Where Helmor installs its CLI binary — `/usr/local/bin/helmor` on macOS
/// (matches the existing `dev:cli:install` script).
fn cli_install_target() -> anyhow::Result<std::path::PathBuf> {
    Ok(std::path::PathBuf::from("/usr/local/bin/helmor"))
}

/// Name of the compiled CLI binary produced by `cargo build --bin helmor-cli`.
fn cli_source_binary_name() -> &'static str {
    "helmor-cli"
}

#[tauri::command]
pub fn get_cli_status() -> CmdResult<CliStatus> {
    let install_path = cli_install_target()?;
    let installed = install_path.exists();
    Ok(CliStatus {
        installed,
        install_path: if installed {
            Some(install_path.display().to_string())
        } else {
            None
        },
        build_mode: crate::data_dir::data_mode_label().to_string(),
    })
}

#[tauri::command]
pub async fn install_cli() -> CmdResult<CliStatus> {
    run_blocking(|| {
        let source = std::env::current_exe()?;
        let target_dir = source
            .parent()
            .context("Cannot determine binary directory")?;
        let cli_binary = target_dir.join(cli_source_binary_name());

        if !cli_binary.exists() {
            anyhow::bail!(
                "CLI binary not found at {}. Run `cargo build --bin helmor-cli` first.",
                cli_binary.display()
            );
        }

        let install_path = cli_install_target()?;
        if let Some(parent) = install_path.parent() {
            std::fs::create_dir_all(parent).with_context(|| {
                format!("Failed to create install directory {}", parent.display())
            })?;
        }
        std::fs::copy(&cli_binary, &install_path).with_context(|| {
            format!(
                "Failed to copy CLI to {}. You may need to run: sudo cp {} {}",
                install_path.display(),
                cli_binary.display(),
                install_path.display()
            )
        })?;

        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&install_path, std::fs::Permissions::from_mode(0o755))?;

        Ok(CliStatus {
            installed: true,
            install_path: Some(install_path.display().to_string()),
            build_mode: crate::data_dir::data_mode_label().to_string(),
        })
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
    pub attachments_deleted: usize,
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
        let mut conn = db::open_connection(true)?;
        let tx = conn
            .transaction()
            .context("Failed to start dev-reset transaction")?;

        let attachments_deleted: usize = tx.execute("DELETE FROM attachments", []).unwrap_or(0);
        let messages_deleted: usize = tx.execute("DELETE FROM session_messages", []).unwrap_or(0);
        let sessions_deleted: usize = tx.execute("DELETE FROM sessions", []).unwrap_or(0);
        let _diff_comments: usize = tx.execute("DELETE FROM diff_comments", []).unwrap_or(0);
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
            attachments_deleted,
            directories_removed: dirs_removed,
        })
    })
    .await
}
