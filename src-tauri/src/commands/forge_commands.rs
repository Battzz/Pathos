use crate::forge::{
    self, ChangeRequestInfo, ForgeActionStatus, ForgeCliStatus, ForgeDetection, ForgeProvider,
    RemoteState,
};
use crate::ui_sync::{self, UiMutationEvent};
use crate::workspace::scripts::{ScriptContext, ScriptEvent, ScriptProcessManager};
use tauri::{ipc::Channel, State};

use super::common::{run_blocking, CmdResult};

#[tauri::command]
pub async fn get_workspace_forge(workspace_id: String) -> CmdResult<ForgeDetection> {
    run_blocking(move || forge::get_workspace_forge(&workspace_id)).await
}

#[tauri::command]
pub async fn get_forge_cli_status(
    provider: ForgeProvider,
    host: Option<String>,
) -> CmdResult<ForgeCliStatus> {
    run_blocking(move || forge::get_forge_cli_status(provider, host.as_deref())).await
}

#[tauri::command]
pub async fn open_forge_cli_auth_terminal(
    provider: ForgeProvider,
    host: Option<String>,
) -> CmdResult<()> {
    run_blocking(move || forge::open_forge_cli_auth_terminal(provider, host.as_deref())).await
}

fn forge_cli_auth_script_type(provider: ForgeProvider, host: &str, instance_id: &str) -> String {
    format!("forge-cli-auth:{provider:?}:{host}:{instance_id}")
}

const FORGE_CLI_AUTH_REPO_ID: &str = "__helmor_onboarding_forge__";

#[tauri::command]
pub async fn spawn_forge_cli_auth_terminal(
    manager: State<'_, ScriptProcessManager>,
    provider: ForgeProvider,
    host: Option<String>,
    instance_id: String,
    channel: Channel<ScriptEvent>,
) -> CmdResult<()> {
    let host = host.unwrap_or_else(|| "gitlab.com".to_string());
    let command = forge::forge_cli_auth_command(provider, Some(&host))?;
    let working_dir = std::env::var("HOME")
        .ok()
        .filter(|home| !home.trim().is_empty())
        .or_else(|| {
            std::env::current_dir()
                .ok()
                .map(|path| path.display().to_string())
        })
        .unwrap_or_else(|| "/".to_string());
    let context = ScriptContext {
        root_path: working_dir.clone(),
        workspace_path: None,
        workspace_name: None,
        default_branch: None,
    };
    let mgr = manager.inner().clone();
    let script_type = forge_cli_auth_script_type(provider, &host, &instance_id);

    tauri::async_runtime::spawn_blocking(move || {
        let key = (
            FORGE_CLI_AUTH_REPO_ID.to_string(),
            script_type.clone(),
            None::<String>,
        );
        let command_to_send = format!("{command}; exit\n");
        let stdin_manager = mgr.clone();
        std::thread::spawn(move || {
            for _ in 0..80 {
                match stdin_manager.write_stdin(&key, command_to_send.as_bytes()) {
                    Ok(true) => return,
                    Ok(false) => std::thread::sleep(std::time::Duration::from_millis(25)),
                    Err(error) => {
                        tracing::debug!("Forge CLI auth terminal stdin unavailable: {error}");
                        return;
                    }
                }
            }
            tracing::debug!("Forge CLI auth terminal was not ready for initial command");
        });

        if let Err(error) = crate::workspace::scripts::run_terminal_session(
            &mgr,
            FORGE_CLI_AUTH_REPO_ID,
            &script_type,
            None,
            &working_dir,
            &context,
            channel.clone(),
        ) {
            let _ = channel.send(ScriptEvent::Error {
                message: error.to_string(),
            });
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_forge_cli_auth_terminal(
    manager: State<'_, ScriptProcessManager>,
    provider: ForgeProvider,
    host: Option<String>,
    instance_id: String,
) -> CmdResult<bool> {
    let host = host.unwrap_or_else(|| "gitlab.com".to_string());
    let key = (
        FORGE_CLI_AUTH_REPO_ID.to_string(),
        forge_cli_auth_script_type(provider, &host, &instance_id),
        None,
    );
    Ok(manager.kill(&key))
}

#[tauri::command]
pub async fn write_forge_cli_auth_terminal_stdin(
    manager: State<'_, ScriptProcessManager>,
    provider: ForgeProvider,
    host: Option<String>,
    instance_id: String,
    data: String,
) -> CmdResult<bool> {
    let host = host.unwrap_or_else(|| "gitlab.com".to_string());
    let key = (
        FORGE_CLI_AUTH_REPO_ID.to_string(),
        forge_cli_auth_script_type(provider, &host, &instance_id),
        None,
    );
    Ok(manager.write_stdin(&key, data.as_bytes())?)
}

#[tauri::command]
pub async fn resize_forge_cli_auth_terminal(
    manager: State<'_, ScriptProcessManager>,
    provider: ForgeProvider,
    host: Option<String>,
    instance_id: String,
    cols: u16,
    rows: u16,
) -> CmdResult<bool> {
    let host = host.unwrap_or_else(|| "gitlab.com".to_string());
    let key = (
        FORGE_CLI_AUTH_REPO_ID.to_string(),
        forge_cli_auth_script_type(provider, &host, &instance_id),
        None,
    );
    Ok(manager.resize(&key, cols, rows)?)
}

#[tauri::command]
pub async fn refresh_workspace_change_request(
    workspace_id: String,
    app: tauri::AppHandle,
) -> CmdResult<Option<ChangeRequestInfo>> {
    let lookup_workspace_id = workspace_id.clone();
    let (result, workspace_status_changed) = run_blocking(move || {
        let result = forge::refresh_workspace_change_request(&lookup_workspace_id)?;
        let changed =
            crate::workspaces::sync_workspace_pr_state(&lookup_workspace_id, result.as_ref())?;
        Ok::<_, anyhow::Error>((result, changed))
    })
    .await?;
    if workspace_status_changed {
        ui_sync::publish(
            &app,
            UiMutationEvent::WorkspaceChangeRequestChanged { workspace_id },
        );
    }
    Ok(result)
}

#[tauri::command]
pub async fn get_workspace_forge_action_status(
    workspace_id: String,
    app: tauri::AppHandle,
) -> CmdResult<ForgeActionStatus> {
    let lookup_workspace_id = workspace_id.clone();
    let status =
        run_blocking(move || forge::lookup_workspace_forge_action_status(&lookup_workspace_id))
            .await?;
    if should_publish_workspace_forge_changed(status.remote_state) {
        ui_sync::publish(
            &app,
            UiMutationEvent::WorkspaceForgeChanged { workspace_id },
        );
    }
    Ok(status)
}

#[tauri::command]
pub async fn get_workspace_forge_check_insert_text(
    workspace_id: String,
    item_id: String,
) -> CmdResult<String> {
    run_blocking(move || forge::lookup_workspace_forge_check_insert_text(&workspace_id, &item_id))
        .await
}

#[tauri::command]
pub async fn merge_workspace_change_request(
    workspace_id: String,
    app: tauri::AppHandle,
) -> CmdResult<Option<ChangeRequestInfo>> {
    run_change_request_action(workspace_id, app, forge::merge_workspace_change_request).await
}

#[tauri::command]
pub async fn close_workspace_change_request(
    workspace_id: String,
    app: tauri::AppHandle,
) -> CmdResult<Option<ChangeRequestInfo>> {
    run_change_request_action(workspace_id, app, forge::close_workspace_change_request).await
}

async fn run_change_request_action(
    workspace_id: String,
    app: tauri::AppHandle,
    action: fn(&str) -> anyhow::Result<Option<ChangeRequestInfo>>,
) -> CmdResult<Option<ChangeRequestInfo>> {
    let sync_workspace_id = workspace_id.clone();
    let (result, workspace_status_changed) = run_blocking(move || {
        let result = action(&sync_workspace_id)?;
        let changed =
            crate::workspaces::sync_workspace_pr_state(&sync_workspace_id, result.as_ref())?;
        Ok::<_, anyhow::Error>((result, changed))
    })
    .await?;
    if workspace_status_changed {
        ui_sync::publish(
            &app,
            UiMutationEvent::WorkspaceChangeRequestChanged { workspace_id },
        );
    }
    Ok(result)
}

fn should_publish_workspace_forge_changed(remote_state: RemoteState) -> bool {
    remote_state == RemoteState::Unauthenticated
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unauthenticated_action_status_refreshes_workspace_forge() {
        assert!(should_publish_workspace_forge_changed(
            RemoteState::Unauthenticated
        ));
        assert!(!should_publish_workspace_forge_changed(RemoteState::Ok));
        assert!(!should_publish_workspace_forge_changed(RemoteState::NoPr));
        assert!(!should_publish_workspace_forge_changed(
            RemoteState::Unavailable
        ));
        assert!(!should_publish_workspace_forge_changed(RemoteState::Error));
    }
}
