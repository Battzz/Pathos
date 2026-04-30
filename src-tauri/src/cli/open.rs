//! `pathos <path>` — open or create a project chat for a local folder.

use std::{
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use serde::Serialize;

use crate::{sessions, ui_sync::UiMutationEvent, workspace_project};

use super::{args::Cli, notify_ui_events, output};

const APP_LAUNCH_WAIT: Duration = Duration::from_secs(5);
const APP_NOTIFY_INTERVAL: Duration = Duration::from_millis(150);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenPathResponse {
    repository_id: String,
    workspace_id: String,
    session_id: String,
    created_repository: bool,
    app_running: bool,
    app_notified: bool,
}

pub fn open_path(path: &str, cli: &Cli) -> Result<()> {
    let target = normalize_input_path(path)?;
    let repository = crate::repos::add_repository_from_local_path(&target.display().to_string())?;

    let workspace_id =
        workspace_project::get_or_create_project_workspace(&repository.repository_id)?;
    let session = sessions::create_session(&workspace_id, None, None, None)?;

    let app_was_running = crate::service::is_app_running();
    if !app_was_running {
        launch_pathos_app();
    }

    let app_notified = notify_open_chat(&workspace_id, &session.session_id, app_was_running);

    notify_ui_events([
        UiMutationEvent::RepositoryListChanged,
        UiMutationEvent::WorkspaceListChanged,
        UiMutationEvent::SessionListChanged {
            workspace_id: workspace_id.clone(),
        },
    ]);

    let response = OpenPathResponse {
        repository_id: repository.repository_id,
        workspace_id,
        session_id: session.session_id,
        created_repository: repository.created_repository,
        app_running: app_was_running || app_notified,
        app_notified,
    };

    output::print(cli, &response, |r| {
        let mut lines = Vec::new();
        if r.created_repository {
            lines.push(format!("Created repository {}", r.repository_id));
        } else {
            lines.push(format!("Repository already exists: {}", r.repository_id));
        }
        lines.push(format!("Opened chat {}", r.session_id));
        if !r.app_notified {
            lines.push("Pathos app was not notified; open Pathos to see the new chat.".to_string());
        }
        lines.join("\n")
    })
}

fn normalize_input_path(path: &str) -> Result<PathBuf> {
    let raw = Path::new(path);
    let absolute = if raw.is_absolute() {
        raw.to_path_buf()
    } else {
        std::env::current_dir()
            .context("Failed to read current directory")?
            .join(raw)
    };
    absolute
        .canonicalize()
        .with_context(|| format!("Failed to resolve path {}", absolute.display()))
}

fn notify_open_chat(workspace_id: &str, session_id: &str, app_was_running: bool) -> bool {
    let event = || UiMutationEvent::OpenChatRequested {
        workspace_id: workspace_id.to_string(),
        session_id: session_id.to_string(),
    };

    if app_was_running {
        return crate::ui_sync::notify_running_app(event()).unwrap_or(false);
    }

    let deadline = Instant::now() + APP_LAUNCH_WAIT;
    while Instant::now() < deadline {
        if crate::ui_sync::notify_running_app(event()).unwrap_or(false) {
            return true;
        }
        thread::sleep(APP_NOTIFY_INTERVAL);
    }
    false
}

fn launch_pathos_app() {
    #[cfg(target_os = "macos")]
    {
        if let Some(bundle_path) = current_app_bundle_path() {
            if Command::new("open").arg(bundle_path).status().is_ok() {
                return;
            }
        }

        let _ = Command::new("open").args(["-a", "Pathos"]).status();
    }
}

#[cfg(target_os = "macos")]
fn current_app_bundle_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let macos_dir = exe.parent()?;
    if macos_dir.file_name()? != "MacOS" {
        return None;
    }
    let contents_dir = macos_dir.parent()?;
    if contents_dir.file_name()? != "Contents" {
        return None;
    }
    let app_dir = contents_dir.parent()?;
    if app_dir.extension()? == "app" {
        Some(app_dir.to_path_buf())
    } else {
        None
    }
}
