use std::time::{Duration, Instant};

use anyhow::Context;
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    agents::{self, ActionKind},
    db, pipeline, sessions, workspace, workspace_project,
};

use super::common::{run_blocking, CmdResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChatResponse {
    pub workspace_id: String,
    pub session_id: String,
}

/// Create a chat session against a repo. Lazily provisions the repo's
/// project workspace (kind='project', no worktree) the first time and
/// then creates an idle session inside it. The frontend should select
/// `workspaceId` + `sessionId` and route the user to the conversation
/// panel.
#[tauri::command]
pub async fn create_chat_session_in_repo(
    app: tauri::AppHandle,
    repo_id: String,
    permission_mode: Option<String>,
) -> CmdResult<CreateChatResponse> {
    let _lock = db::WORKSPACE_FS_MUTATION_LOCK.lock().await;
    let response = run_blocking(move || {
        let workspace_id = workspace_project::get_or_create_project_workspace(&repo_id)?;
        if let Some(session_id) = sessions::reuse_empty_visible_chat_session(&workspace_id)? {
            return Ok::<_, anyhow::Error>(CreateChatResponse {
                workspace_id,
                session_id,
            });
        }
        let session =
            sessions::create_session(&workspace_id, None, None, permission_mode.as_deref())?;
        Ok::<_, anyhow::Error>(CreateChatResponse {
            workspace_id,
            session_id: session.session_id,
        })
    })
    .await?;
    crate::ui_sync::publish(
        &app,
        crate::ui_sync::UiMutationEvent::SessionListChanged {
            workspace_id: response.workspace_id.clone(),
        },
    );
    Ok(response)
}

#[tauri::command]
pub async fn create_generic_chat_session(
    app: tauri::AppHandle,
    permission_mode: Option<String>,
) -> CmdResult<CreateChatResponse> {
    let response = run_blocking(move || {
        let workspace_id = workspace::generic_chats::get_or_create_generic_chat_workspace()?;
        if let Some(session_id) = sessions::reuse_empty_visible_chat_session(&workspace_id)? {
            return Ok::<_, anyhow::Error>(CreateChatResponse {
                workspace_id,
                session_id,
            });
        }
        let session =
            sessions::create_session(&workspace_id, None, None, permission_mode.as_deref())?;
        Ok::<_, anyhow::Error>(CreateChatResponse {
            workspace_id,
            session_id: session.session_id,
        })
    })
    .await?;
    crate::ui_sync::publish(
        &app,
        crate::ui_sync::UiMutationEvent::SessionListChanged {
            workspace_id: response.workspace_id.clone(),
        },
    );
    Ok(response)
}

#[tauri::command]
pub async fn list_generic_chats() -> CmdResult<Vec<workspace::workspaces::RepositoryFolderChat>> {
    run_blocking(workspace::generic_chats::list_generic_chats).await
}

#[tauri::command]
pub async fn list_workspace_sessions(
    workspace_id: String,
) -> CmdResult<Vec<sessions::WorkspaceSessionSummary>> {
    run_blocking(move || sessions::list_workspace_sessions(&workspace_id)).await
}

#[tauri::command]
pub async fn list_session_thread_messages(
    session_id: String,
) -> CmdResult<Vec<pipeline::types::ThreadMessageLike>> {
    run_blocking(move || {
        let historical = sessions::list_session_historical_records(&session_id)?;
        Ok(pipeline::MessagePipeline::convert_historical(&historical))
    })
    .await
}

#[tauri::command]
pub async fn truncate_session_messages_after(
    sidecar: tauri::State<'_, crate::sidecar::ManagedSidecar>,
    session_id: String,
    message_id: String,
    include_selected: bool,
) -> CmdResult<usize> {
    let checkpoint_session_id = session_id.clone();
    let checkpoint_message_id = message_id.clone();
    let checkpoint_restored = run_blocking(move || {
        crate::checkpoints::restore_user_message_checkpoint(
            &checkpoint_session_id,
            &checkpoint_message_id,
            include_selected,
        )
    })
    .await?;
    if matches!(checkpoint_restored, Some(false)) {
        return Err(
            anyhow::anyhow!("Filesystem checkpoint is unavailable for this message.").into(),
        );
    }

    let metadata_session_id = session_id.clone();
    let metadata_message_id = message_id.clone();
    let metadata = run_blocking(move || {
        sessions::session_message_rollback_metadata(
            &metadata_session_id,
            &metadata_message_id,
            include_selected,
        )
    })
    .await?;

    let cleanup_session_id = session_id.clone();
    let cleanup_message_id = message_id.clone();
    let stale_checkpoint_message_ids = run_blocking(move || {
        crate::checkpoints::user_message_ids_for_truncation(
            &cleanup_session_id,
            &cleanup_message_id,
            include_selected,
        )
    })
    .await?;

    rollback_live_provider_session(
        &sidecar,
        &session_id,
        metadata.agent_type.as_deref(),
        metadata.user_turns_to_rollback,
    )
    .await?;

    let truncated_session_id = session_id.clone();
    let deleted = run_blocking(move || {
        sessions::truncate_session_messages_after(&session_id, &message_id, include_selected)
    })
    .await?;

    if !stale_checkpoint_message_ids.is_empty() {
        run_blocking(move || {
            crate::checkpoints::delete_user_message_checkpoints(
                &truncated_session_id,
                stale_checkpoint_message_ids,
            )
        })
        .await?;
    }

    Ok(deleted)
}

async fn rollback_live_provider_session(
    sidecar: &crate::sidecar::ManagedSidecar,
    session_id: &str,
    agent_type: Option<&str>,
    num_turns: usize,
) -> CmdResult<()> {
    if num_turns == 0 {
        return Ok(());
    }
    let provider = match agent_type {
        Some(provider @ ("codex" | "claude")) => provider,
        _ => return Ok(()),
    };

    let request_id = Uuid::new_v4().to_string();
    let request = crate::sidecar::SidecarRequest {
        id: request_id.clone(),
        method: "rollbackSession".to_string(),
        params: serde_json::json!({
            "sessionId": session_id,
            "provider": provider,
            "numTurns": num_turns,
        }),
    };

    let rx = sidecar.subscribe(&request_id);
    if let Err(error) = sidecar.send(&request) {
        sidecar.unsubscribe(&request_id);
        return Err(anyhow::anyhow!("Sidecar rollback send failed: {error}").into());
    }

    let rid_for_worker = request_id.clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(anyhow::anyhow!("Timed out waiting for sidecar rollback"));
            }
            match rx.recv_timeout(remaining) {
                Ok(event) => match event.event_type() {
                    "pong" => return Ok(()),
                    "error" => {
                        let msg = event
                            .raw
                            .get("message")
                            .and_then(Value::as_str)
                            .unwrap_or("sidecar rollback failed");
                        return Err(anyhow::anyhow!(msg.to_string()));
                    }
                    _ => continue,
                },
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    return Err(anyhow::anyhow!("Timed out waiting for sidecar rollback"));
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(anyhow::anyhow!("Sidecar disconnected during rollback"));
                }
            }
        }
    })
    .await
    .map_err(|error| anyhow::anyhow!("Rollback worker failed: {error}"))?;

    sidecar.unsubscribe(&rid_for_worker);
    outcome.map_err(Into::into)
}

#[tauri::command]
pub async fn create_session(
    workspace_id: String,
    action_kind: Option<ActionKind>,
    model_id: Option<String>,
    permission_mode: Option<String>,
) -> CmdResult<sessions::CreateSessionResponse> {
    run_blocking(move || {
        sessions::create_session(
            &workspace_id,
            action_kind,
            model_id.as_deref(),
            permission_mode.as_deref(),
        )
    })
    .await
}

#[tauri::command]
pub async fn rename_session(session_id: String, title: String) -> CmdResult<()> {
    run_blocking(move || sessions::rename_session(&session_id, &title)).await
}

#[tauri::command]
pub async fn pin_session(app: tauri::AppHandle, session_id: String) -> CmdResult<()> {
    let workspace_id = run_blocking(move || sessions::pin_session(&session_id)).await?;
    crate::ui_sync::publish(
        &app,
        crate::ui_sync::UiMutationEvent::SessionListChanged { workspace_id },
    );
    Ok(())
}

#[tauri::command]
pub async fn unpin_session(app: tauri::AppHandle, session_id: String) -> CmdResult<()> {
    let workspace_id = run_blocking(move || sessions::unpin_session(&session_id)).await?;
    crate::ui_sync::publish(
        &app,
        crate::ui_sync::UiMutationEvent::SessionListChanged { workspace_id },
    );
    Ok(())
}

#[tauri::command]
pub async fn hide_session(session_id: String) -> CmdResult<()> {
    run_blocking(move || sessions::hide_session(&session_id)).await
}

#[tauri::command]
pub async fn unhide_session(session_id: String) -> CmdResult<()> {
    run_blocking(move || sessions::unhide_session(&session_id)).await
}

#[tauri::command]
pub async fn delete_session(session_id: String) -> CmdResult<()> {
    run_blocking(move || sessions::delete_session(&session_id)).await
}

#[tauri::command]
pub async fn delete_project_chats(
    app: tauri::AppHandle,
    repo_id: String,
) -> CmdResult<sessions::DeleteProjectChatsResponse> {
    let response = run_blocking(move || sessions::delete_project_chats(&repo_id)).await?;
    if let Some(workspace_id) = &response.workspace_id {
        crate::ui_sync::publish(
            &app,
            crate::ui_sync::UiMutationEvent::SessionListChanged {
                workspace_id: workspace_id.clone(),
            },
        );
    }
    Ok(response)
}

#[tauri::command]
pub async fn list_hidden_sessions(
    workspace_id: String,
) -> CmdResult<Vec<sessions::WorkspaceSessionSummary>> {
    run_blocking(move || sessions::list_hidden_sessions(&workspace_id)).await
}

#[tauri::command]
pub async fn get_session_context_usage(session_id: String) -> CmdResult<Option<String>> {
    run_blocking(move || sessions::get_session_context_usage(&session_id)).await
}

/// Ad-hoc Claude-only context-usage fetch for the hover popover. Pure
/// passthrough to the sidecar — no DB write, no mutex, no TTL. The
/// frontend caches the result for 30 s via React Query.
#[tauri::command]
pub async fn get_live_context_usage(
    sidecar: tauri::State<'_, crate::sidecar::ManagedSidecar>,
    request: agents::GetLiveContextUsageRequest,
) -> CmdResult<String> {
    agents::fetch_live_context_usage(&sidecar, request)
}

#[tauri::command]
pub async fn mark_session_read(session_id: String) -> CmdResult<()> {
    run_blocking(move || sessions::mark_session_read(&session_id)).await
}

#[tauri::command]
pub async fn mark_session_unread(session_id: String) -> CmdResult<()> {
    run_blocking(move || sessions::mark_session_unread(&session_id)).await
}

#[tauri::command]
pub async fn update_session_settings(
    session_id: String,
    model: Option<String>,
    effort_level: Option<String>,
    permission_mode: Option<String>,
) -> CmdResult<()> {
    run_blocking(move || {
        let connection = db::write_conn()?;
        connection
            .execute(
                r#"
                UPDATE sessions SET
                  model = COALESCE(?2, model),
                  effort_level = COALESCE(?3, effort_level),
                  permission_mode = COALESCE(?4, permission_mode)
                WHERE id = ?1
                "#,
                rusqlite::params![session_id, model, effort_level, permission_mode],
            )
            .context("Failed to update session settings")?;
        Ok(())
    })
    .await
}
