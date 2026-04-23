use std::collections::HashMap;
use std::path::Path;
use std::sync::mpsc::RecvTimeoutError;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Maximum time we wait between sidecar events before declaring the sidecar
/// dead. The sidecar emits a `heartbeat` event every 15s for every active
/// stream; 45s = 3× heartbeat interval tolerates a single missed tick from
/// GC / busy system without false positives. A long-running tool call (e.g.
/// `bash: pytest` for 20 minutes) is fine because heartbeats keep flowing
/// regardless of what the AI is doing.
const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(45);

/// Persist an error message and finalize the session after an abnormal
/// stream exit (heartbeat timeout, channel disconnect). Returns `true` iff
/// the session row was successfully transitioned to `idle`.
///
/// Kept as a free fn so both the timeout/disconnect match arms and the
/// regression tests can drive the same code path.
pub(crate) fn cleanup_abnormal_stream_exit(
    rid: &str,
    exchange_ctx: Option<&ExchangeContext>,
    resolved_model: &str,
    user_message: &str,
    effort_level: Option<&str>,
    permission_mode: Option<&str>,
) -> bool {
    let Some(ctx) = exchange_ctx else {
        tracing::debug!(
            rid = %rid,
            "cleanup_abnormal_stream_exit: no exchange_ctx — nothing to finalize"
        );
        return false;
    };
    let conn = match crate::models::db::write_conn() {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(
                rid = %rid,
                session_id = %ctx.helmor_session_id,
                "cleanup_abnormal_stream_exit: write_conn borrow failed — session may be stuck: {e}"
            );
            return false;
        }
    };

    let err_persist_ok = match persist_error_message(&conn, ctx, resolved_model, user_message) {
        Ok(_) => true,
        Err(error) => {
            tracing::error!(
                rid = %rid,
                session_id = %ctx.helmor_session_id,
                "cleanup_abnormal_stream_exit: persist_error_message failed: {error}"
            );
            false
        }
    };

    match finalize_session_metadata(&conn, ctx, "idle", effort_level, permission_mode) {
        Ok(_) => {
            tracing::debug!(
                rid = %rid,
                session_id = %ctx.helmor_session_id,
                err_persist_ok,
                "cleanup_abnormal_stream_exit: session finalized to idle"
            );
            true
        }
        Err(error) => {
            tracing::error!(
                rid = %rid,
                session_id = %ctx.helmor_session_id,
                "cleanup_abnormal_stream_exit: finalize_session_metadata failed: {error}"
            );
            false
        }
    }
}

use rusqlite::params;
use serde_json::{json, Value};
use tauri::{ipc::Channel, AppHandle, Manager};
use uuid::Uuid;

use crate::pipeline::types::{
    ExtendedMessagePart, MessagePart, MessageRole, PlanAllowedPrompt, ThreadMessageLike,
};

use super::{
    finalize_session_metadata, persist_error_message, persist_exit_plan_message,
    persist_result_and_finalize, persist_turn_message, persist_user_message, AgentSendRequest,
    AgentStreamEvent, CmdResult, ExchangeContext,
};

#[derive(Debug, Clone)]
pub(crate) struct ActiveStreamHandle {
    pub request_id: String,
    pub sidecar_session_id: String,
    pub provider: String,
}

#[derive(Default)]
pub struct ActiveStreams {
    inner: Arc<Mutex<HashMap<String, ActiveStreamHandle>>>,
}

impl ActiveStreams {
    pub fn new() -> Self {
        Self::default()
    }

    fn register(&self, handle: ActiveStreamHandle) {
        if let Ok(mut map) = self.inner.lock() {
            map.insert(handle.request_id.clone(), handle);
        }
    }

    fn unregister(&self, request_id: &str) {
        if let Ok(mut map) = self.inner.lock() {
            map.remove(request_id);
        }
    }

    fn snapshot(&self) -> Vec<ActiveStreamHandle> {
        self.inner
            .lock()
            .map(|map| map.values().cloned().collect())
            .unwrap_or_default()
    }

    pub(crate) fn lookup_by_sidecar_session_id(
        &self,
        sidecar_session_id: &str,
    ) -> Option<ActiveStreamHandle> {
        self.inner.lock().ok().and_then(|map| {
            map.values()
                .find(|h| h.sidecar_session_id == sidecar_session_id)
                .cloned()
        })
    }

    pub(crate) fn len(&self) -> usize {
        self.inner.lock().map(|map| map.len()).unwrap_or(0)
    }

    fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

pub fn abort_all_active_streams_blocking(
    sidecar: &crate::sidecar::ManagedSidecar,
    active: &ActiveStreams,
    timeout: Duration,
) {
    let handles = active.snapshot();
    if handles.is_empty() {
        return;
    }

    tracing::info!(
        count = handles.len(),
        "Graceful shutdown — aborting active streams"
    );

    for handle in &handles {
        let stop_req = crate::sidecar::SidecarRequest {
            id: Uuid::new_v4().to_string(),
            method: "stopSession".to_string(),
            params: serde_json::json!({
                "sessionId": handle.sidecar_session_id,
                "provider": handle.provider,
            }),
        };
        if let Err(error) = sidecar.send(&stop_req) {
            tracing::error!(request_id = %handle.request_id, "Failed to send stopSession during shutdown: {error}");
        }
    }

    let start = Instant::now();
    let poll = Duration::from_millis(50);
    while !active.is_empty() && start.elapsed() < timeout {
        std::thread::sleep(poll);
    }

    let remaining = active.len();
    if remaining == 0 {
        tracing::info!("Graceful shutdown — all streams drained cleanly");
    } else {
        tracing::info!(
            remaining,
            "Graceful shutdown — timeout, streams still active"
        );
    }
}

pub fn bridge_elicitation_request_event(
    provider: &str,
    model_id: &str,
    resolved_model: &str,
    session_id: Option<String>,
    working_directory: &str,
    raw: &Value,
) -> AgentStreamEvent {
    AgentStreamEvent::ElicitationRequest {
        provider: provider.to_string(),
        model_id: model_id.to_string(),
        resolved_model: resolved_model.to_string(),
        session_id,
        working_directory: working_directory.to_string(),
        elicitation_id: raw
            .get("elicitationId")
            .and_then(Value::as_str)
            .map(str::to_string),
        server_name: raw
            .get("serverName")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        message: raw
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        mode: raw.get("mode").and_then(Value::as_str).map(str::to_string),
        url: raw.get("url").and_then(Value::as_str).map(str::to_string),
        requested_schema: raw.get("requestedSchema").cloned(),
    }
}

/// Build a JSON Schema from Codex `requestUserInput` questions so the
/// frontend's ElicitationPanel can render them as form fields.
fn build_user_input_schema(questions: &Value) -> Value {
    let arr = match questions.as_array() {
        Some(a) => a,
        None => return Value::Null,
    };

    let mut properties = serde_json::Map::new();
    let mut required = Vec::new();

    for (i, q) in arr.iter().enumerate() {
        let header = q.get("header").and_then(Value::as_str).unwrap_or("");
        let question_text = q
            .get("question")
            .and_then(Value::as_str)
            .unwrap_or("Question");
        let is_other = q.get("isOther").and_then(Value::as_bool).unwrap_or(false);
        let options = q.get("options").and_then(Value::as_array);
        // Use question id as key so responses map back to Codex question ids
        let key = q
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("q{i}"));

        // header → title (tab label), question → description (subtitle)
        let title = if header.is_empty() {
            question_text
        } else {
            header
        };
        let description = if header.is_empty() { "" } else { question_text };

        let has_options = options.is_some_and(|o| !o.is_empty());

        let prop = if has_options {
            let opts = options.unwrap();
            let one_of: Vec<Value> = opts
                .iter()
                .map(|opt| {
                    let label = opt.get("label").and_then(Value::as_str).unwrap_or("");
                    let desc = opt.get("description").and_then(Value::as_str).unwrap_or("");
                    serde_json::json!({
                        "const": label,
                        "title": label,
                        "description": desc,
                    })
                })
                .collect();

            let mut p = serde_json::json!({
                "type": "string",
                "title": title,
                "description": description,
                "oneOf": one_of,
            });
            if is_other {
                p["x-allow-other"] = Value::Bool(true);
            }
            p
        } else if is_other {
            serde_json::json!({
                "type": "string",
                "title": title,
                "description": description,
            })
        } else {
            serde_json::json!({
                "type": "string",
                "title": title,
                "description": description,
                "oneOf": [
                    { "const": "yes", "title": "Yes" },
                    { "const": "no", "title": "No" },
                ],
            })
        };

        required.push(Value::String(key.clone()));
        properties.insert(key, prop);
    }

    serde_json::json!({
        "type": "object",
        "properties": properties,
        "required": required,
    })
}

/// Convert an ElicitationResponse content back to Codex answer format.
///
/// Codex expects: `{ "question_id": { "answers": ["value"] }, ... }`
/// Frontend sends: `{ "question_id": "value", ... }`
pub fn convert_elicitation_content_to_codex_answers(content: &Value) -> Value {
    let obj = match content.as_object() {
        Some(o) => o,
        None => return Value::Null,
    };
    let mut answers = serde_json::Map::new();
    for (key, value) in obj {
        let answer_str = value.as_str().unwrap_or("").to_string();
        answers.insert(key.clone(), serde_json::json!({ "answers": [answer_str] }));
    }
    Value::Object(answers)
}

/// Inputs to `build_send_message_params`. Grouped into a struct so the
/// constructor stays call-site ergonomic and we don't need to track
/// argument positions.
pub struct BuildSendMessageParamsInput<'a> {
    pub sidecar_session_id: &'a str,
    pub prompt: &'a str,
    pub cli_model: &'a str,
    pub cwd: &'a str,
    pub resume_session_id: Option<&'a str>,
    pub provider: &'a str,
    pub effort_level: Option<&'a str>,
    pub permission_mode: Option<&'a str>,
    pub fast_mode: bool,
    pub helmor_session_id: Option<&'a str>,
}

/// Build the `sendMessage` request params that the sidecar receives. Pure
/// function modulo `lookup_workspace_linked_directories` which reads from
/// the configured data dir DB — isolated so tests can snapshot the full
/// payload against a seeded workspace row.
///
/// `additionalDirectories` is omitted when empty so the sidecar payload
/// stays tight and existing snapshot fixtures for untouched sessions
/// don't churn.
pub fn build_send_message_params(input: BuildSendMessageParamsInput<'_>) -> Value {
    let additional_directories = lookup_workspace_linked_directories(input.helmor_session_id);

    let mut params = serde_json::json!({
        "sessionId": input.sidecar_session_id,
        "prompt": input.prompt,
        "model": input.cli_model,
        "cwd": input.cwd,
        "resume": input.resume_session_id,
        "provider": input.provider,
        "effortLevel": input.effort_level,
        "permissionMode": input.permission_mode,
        "fastMode": input.fast_mode,
    });
    if !additional_directories.is_empty() {
        if let Some(obj) = params.as_object_mut() {
            obj.insert(
                "additionalDirectories".to_string(),
                Value::from(additional_directories),
            );
        }
    }
    params
}

/// Load the workspace's `/add-dir` list via the helmor session id. Returns
/// an empty vec if the session is not yet persisted or the workspace has
/// no linked directories — both are normal states. DB read failures are
/// degraded to an empty list (the feature is best-effort per turn) but
/// logged so a broken DB surfaces in the logs instead of as "my
/// /add-dir silently stopped working".
pub fn lookup_workspace_linked_directories(helmor_session_id: Option<&str>) -> Vec<String> {
    let Some(hsid) = helmor_session_id else {
        return Vec::new();
    };
    let conn = match crate::models::db::read_conn() {
        Ok(c) => c,
        Err(err) => {
            tracing::warn!(
                helmor_session_id = %hsid,
                error = %err,
                "Failed to open DB for linked-directory lookup; falling back to empty list",
            );
            return Vec::new();
        }
    };
    let raw: Option<String> = match conn.query_row(
        r#"SELECT w.linked_directory_paths
           FROM sessions s
           JOIN workspaces w ON w.id = s.workspace_id
           WHERE s.id = ?1"#,
        [hsid],
        |row| row.get(0),
    ) {
        Ok(v) => v,
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(err) => {
            tracing::warn!(
                helmor_session_id = %hsid,
                error = %err,
                "linked_directory_paths query failed; falling back to empty list",
            );
            return Vec::new();
        }
    };
    crate::workspaces::parse_linked_directory_paths(raw.as_deref())
}

/// Outcome of parsing+writing a `contextUsageUpdated` event.
#[derive(Debug, PartialEq, Eq)]
enum ContextUsageWriteOutcome {
    /// Malformed event (missing/empty sessionId or meta).
    Skipped,
    /// Event valid, DB row updated.
    Wrote(String),
    /// Event valid but no row matched the sessionId. Don't broadcast —
    /// nobody is subscribed to a ghost session, and silently treating it
    /// as a successful write would mask sidecar/DB races.
    UnknownSession(String),
}

fn write_context_usage_meta(
    conn: &rusqlite::Connection,
    raw: &Value,
) -> std::result::Result<ContextUsageWriteOutcome, rusqlite::Error> {
    let Some(session_id) = raw.get("sessionId").and_then(Value::as_str) else {
        return Ok(ContextUsageWriteOutcome::Skipped);
    };
    if session_id.is_empty() {
        return Ok(ContextUsageWriteOutcome::Skipped);
    }
    let Some(meta) = raw.get("meta").and_then(Value::as_str) else {
        return Ok(ContextUsageWriteOutcome::Skipped);
    };
    let affected = conn.execute(
        "UPDATE sessions SET context_usage_meta = ?1 WHERE id = ?2",
        params![meta, session_id],
    )?;
    if affected == 0 {
        return Ok(ContextUsageWriteOutcome::UnknownSession(
            session_id.to_string(),
        ));
    }
    Ok(ContextUsageWriteOutcome::Wrote(session_id.to_string()))
}

/// Persist a `codexRateLimitsUpdated` event into the global settings table
/// and broadcast `CodexRateLimitsChanged`. Account-scoped data — no
/// session_id involved, so the event carries no payload.
fn persist_codex_rate_limits_event(app: &AppHandle, raw: &Value) {
    let Some(snapshot) = raw.get("snapshot").and_then(Value::as_str) else {
        tracing::warn!("codexRateLimitsUpdated event missing snapshot");
        return;
    };
    if let Err(err) = crate::models::settings::upsert_setting_value(
        crate::models::settings::CODEX_RATE_LIMITS_KEY,
        snapshot,
    ) {
        tracing::warn!("Failed to persist codex rate limits: {err}");
        return;
    }
    crate::ui_sync::publish(app, crate::ui_sync::UiMutationEvent::CodexRateLimitsChanged);
}

/// Persist a `contextUsageUpdated` event and broadcast `ContextUsageChanged`.
/// Payload-free — the frontend refetches via React Query on invalidation,
/// same pattern as `codexRateLimitsUpdated`.
fn persist_context_usage_event(app: &AppHandle, raw: &Value) {
    let outcome = match crate::models::db::write_conn() {
        Ok(conn) => match write_context_usage_meta(&conn, raw) {
            Ok(outcome) => outcome,
            Err(err) => {
                tracing::warn!("Failed to persist context_usage_meta: {err}");
                return;
            }
        },
        Err(err) => {
            tracing::warn!("context_usage write_conn borrow failed: {err}");
            return;
        }
    };
    let session_id = match outcome {
        ContextUsageWriteOutcome::Skipped => {
            tracing::warn!("contextUsageUpdated event malformed (missing sessionId or meta)");
            return;
        }
        ContextUsageWriteOutcome::UnknownSession(id) => {
            tracing::warn!(
                session_id = %id,
                "contextUsageUpdated for unknown session — likely a stale/post-delete event"
            );
            return;
        }
        ContextUsageWriteOutcome::Wrote(id) => id,
    };
    crate::ui_sync::publish(
        app,
        crate::ui_sync::UiMutationEvent::ContextUsageChanged { session_id },
    );
}

fn should_adopt_provider_session_id(
    current_provider_session_id: Option<&str>,
    observed_provider_session_id: &str,
    helmor_session_id: Option<&str>,
) -> bool {
    !observed_provider_session_id.is_empty()
        && helmor_session_id != Some(observed_provider_session_id)
        && current_provider_session_id.is_none()
}

#[allow(clippy::too_many_arguments)]
pub(super) fn stream_via_sidecar(
    app: AppHandle,
    on_event: Channel<AgentStreamEvent>,
    sidecar: &crate::sidecar::ManagedSidecar,
    active_streams: &ActiveStreams,
    stream_id: &str,
    model: &super::ResolvedModel,
    prompt: &str,
    request: &AgentSendRequest,
    working_directory: &Path,
) -> CmdResult<()> {
    let request_id = stream_id.to_string();

    tracing::debug!(
        provider = %model.provider,
        model = %model.cli_model,
        cwd = %working_directory.display(),
        prompt_len = prompt.len(),
        "stream_via_sidecar"
    );

    let resume_session_id = request.session_id.clone().or_else(|| {
        request.helmor_session_id.as_deref().and_then(|hsid| {
            let conn = crate::models::db::read_conn().ok()?;
            let (stored_sid, stored_provider): (Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT provider_session_id, agent_type FROM sessions WHERE id = ?1",
                    [hsid],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .ok()?;
            let sid = stored_sid?;
            if stored_provider.unwrap_or_default() == model.provider {
                Some(sid)
            } else {
                None
            }
        })
    });

    tracing::debug!(
        resume_session_id = ?resume_session_id,
        helmor_session_id = ?request.helmor_session_id,
        provider = %model.provider,
        "Session resume context"
    );

    let helmor_session_id = request.helmor_session_id.clone();
    let sidecar_session_id = helmor_session_id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let params = build_send_message_params(BuildSendMessageParamsInput {
        sidecar_session_id: &sidecar_session_id,
        prompt,
        cli_model: &model.cli_model,
        cwd: &working_directory.display().to_string(),
        resume_session_id: resume_session_id.as_deref(),
        provider: &model.provider,
        effort_level: request.effort_level.as_deref(),
        permission_mode: request.permission_mode.as_deref(),
        fast_mode: request.fast_mode.unwrap_or(false),
        helmor_session_id: request.helmor_session_id.as_deref(),
    });

    // Surface the `/add-dir` decision in logs — we often debug linked-
    // directory issues by asking "did the path actually make it to the
    // sidecar?" and this answers that without grepping the sidecar
    // wire-format later.
    if let Some(arr) = params
        .get("additionalDirectories")
        .and_then(|v| v.as_array())
    {
        tracing::info!(
            count = arr.len(),
            dirs = ?arr,
            helmor_session_id = ?request.helmor_session_id,
            "sendMessage with linked additionalDirectories"
        );
    } else {
        tracing::info!(
            helmor_session_id = ?request.helmor_session_id,
            "sendMessage without linked additionalDirectories (none configured)"
        );
    }

    let sidecar_req = crate::sidecar::SidecarRequest {
        id: request_id.clone(),
        method: "sendMessage".to_string(),
        params,
    };

    let rx = sidecar.subscribe(&request_id);

    if let Err(error) = sidecar.send(&sidecar_req) {
        sidecar.unsubscribe(&request_id);
        return Err(anyhow::anyhow!("Sidecar send failed: {error}").into());
    }

    active_streams.register(ActiveStreamHandle {
        request_id: request_id.clone(),
        sidecar_session_id: sidecar_session_id.clone(),
        provider: model.provider.to_string(),
    });

    let model_id = model.id.clone();
    let provider = model.provider.clone();
    let model_copy = model.clone();
    let prompt_copy = prompt.to_string();
    let working_dir_str = working_directory.display().to_string();
    let hsid_copy = helmor_session_id;
    let effort_copy = request.effort_level.clone();
    let mut permission_mode_copy = request.permission_mode.clone();
    let fast_mode = request.fast_mode.unwrap_or(false);
    let user_message_id_copy = request.user_message_id.clone();
    let files_copy = request.files.clone().unwrap_or_default();
    let resume_only = request.resume_only;
    let sidecar_session_id_copy = sidecar_session_id.clone();
    let rid = request_id.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let stream_started_at = Instant::now();
        tracing::info!(
            rid = %rid,
            helmor_session_id = ?hsid_copy,
            sidecar_session_id = %sidecar_session_id_copy,
            provider = %provider,
            model = %model_copy.cli_model,
            resume_only,
            "stream: event loop starting"
        );

        let sidecar_state: tauri::State<'_, crate::sidecar::ManagedSidecar> = app.state();
        let active_streams_state: tauri::State<'_, ActiveStreams> = app.state();
        let mut resolved_session_id: Option<String> = resume_session_id.clone();
        let context_key = rid.clone();
        let pipeline_session_id = hsid_copy.clone().unwrap_or_else(|| context_key.clone());
        let mut pipeline = hsid_copy.as_ref().map(|_| {
            crate::pipeline::MessagePipeline::new(
                provider.as_str(),
                &model_copy.cli_model,
                &context_key,
                &pipeline_session_id,
            )
        });
        let mut event_count: u64 = 0;
        let mut heartbeat_count: u64 = 0;

        let mut exchange_ctx: Option<ExchangeContext> = None;
        let mut persisted_turn_count: usize = 0;
        let mut persisted_exit_plan_review: Option<ThreadMessageLike> = None;

        // Short-borrow only. The single-writer pool (max_size=1) is shared
        // with every other write in the app; a long-held handle here would
        // block pin/unpin/mark-read/rename for the entire turn.
        if let Some(hsid) = &hsid_copy {
            let ctx = ExchangeContext {
                helmor_session_id: hsid.clone(),
                model_id: model_copy.id.to_string(),
                model_provider: model_copy.provider.to_string(),
                user_message_id: user_message_id_copy
                    .clone()
                    .unwrap_or_else(|| Uuid::new_v4().to_string()),
            };

            match crate::models::db::write_conn() {
                Ok(conn) => {
                    if let Err(e) = conn.execute(
                        "UPDATE sessions SET fast_mode = ?1 WHERE id = ?2",
                        rusqlite::params![fast_mode, &ctx.helmor_session_id],
                    ) {
                        tracing::error!(rid = %rid, "Failed to update fast_mode: {e}");
                    }

                    if resume_only {
                        exchange_ctx = Some(ctx);
                    } else {
                        match persist_user_message(&conn, &ctx, &prompt_copy, &files_copy) {
                            Ok(()) => {
                                tracing::debug!(rid = %rid, "User message persisted to DB");
                                exchange_ctx = Some(ctx);
                            }
                            Err(error) => {
                                tracing::error!(rid = %rid, "Failed to persist user message: {error}");
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::error!(rid = %rid, "Failed to borrow write conn for initial persist: {e}");
                }
            }
        }

        tracing::debug!(rid = %rid, "Waiting for sidecar events...");

        loop {
            let event = match rx.recv_timeout(HEARTBEAT_TIMEOUT) {
                Ok(ev) => ev,
                Err(err @ (RecvTimeoutError::Timeout | RecvTimeoutError::Disconnected)) => {
                    let (reason_log, user_message, should_stop_sidecar) = match err {
                        RecvTimeoutError::Timeout => (
                            format!(
                                "heartbeat lost for {:?} — treating stream as dead",
                                HEARTBEAT_TIMEOUT
                            ),
                            format!(
                                "Sidecar stopped responding (no heartbeat for {:?}). You can retry the request.",
                                HEARTBEAT_TIMEOUT,
                            ),
                            true,
                        ),
                        RecvTimeoutError::Disconnected => (
                            "sidecar channel disconnected".to_string(),
                            "Sidecar connection was lost. You can retry the request.".to_string(),
                            // Channel already closed — stopSession would most
                            // likely fail, and if the sidecar already died
                            // the request isn't running anyway.
                            false,
                        ),
                    };
                    tracing::error!(rid = %rid, "{reason_log}");

                    if should_stop_sidecar {
                        let stop_req = crate::sidecar::SidecarRequest {
                            id: Uuid::new_v4().to_string(),
                            method: "stopSession".to_string(),
                            params: serde_json::json!({
                                "sessionId": sidecar_session_id_copy,
                                "provider": provider,
                            }),
                        };
                        if let Err(e) = sidecar_state.send(&stop_req) {
                            tracing::warn!(rid = %rid, "stopSession during abnormal exit failed: {e}");
                        }
                    }

                    let resolved_model = pipeline
                        .as_ref()
                        .map(|p| p.accumulator.resolved_model().to_string())
                        .unwrap_or_else(|| model_copy.cli_model.to_string());
                    let persisted = cleanup_abnormal_stream_exit(
                        &rid,
                        exchange_ctx.as_ref(),
                        &resolved_model,
                        &user_message,
                        effort_copy.as_deref(),
                        permission_mode_copy.as_deref(),
                    );

                    tracing::info!(
                        rid = %rid,
                        event_count,
                        heartbeat_count,
                        elapsed_ms = stream_started_at.elapsed().as_millis(),
                        persisted,
                        has_exchange_ctx = exchange_ctx.is_some(),
                        "stream: abnormal exit — finalized"
                    );
                    let _ = on_event.send(AgentStreamEvent::Error {
                        message: user_message,
                        persisted,
                        internal: true,
                    });
                    break;
                }
            };

            // Heartbeats are keepalives only — do not advance pipeline state.
            if event.event_type() == "heartbeat" {
                heartbeat_count += 1;
                tracing::trace!(rid = %rid, heartbeat_count, "heartbeat");
                continue;
            }

            event_count += 1;

            // Claude's authoritative session_id comes only from `system.init`.
            // Earlier events — notably SessionStart:resume hook notifications —
            // carry a transient session_id that does NOT map to any real
            // conversation jsonl. Adopting them poisons the next resume with
            // "No conversation found". Codex flattens every notification with
            // its real thread_id, so any event is safe.
            let is_provider_session_marker = match model_copy.provider.as_str() {
                "claude" => event.is_claude_session_init(),
                _ => true,
            };
            if is_provider_session_marker {
                if let Some(sid) = event.session_id() {
                    if should_adopt_provider_session_id(
                        resolved_session_id.as_deref(),
                        sid,
                        hsid_copy.as_deref(),
                    ) {
                        resolved_session_id = Some(sid.to_string());
                        if resume_only {
                            tracing::debug!(
                                rid = %rid,
                                provider_session_id = sid,
                                "Skipping provider session persistence for resume-only stream"
                            );
                        } else if let (Some(ctx), Some(conn)) =
                            (&exchange_ctx, &crate::models::db::write_conn().ok())
                        {
                            if let Err(error) = conn.execute(
                                "UPDATE sessions SET provider_session_id = ?2, agent_type = ?3 WHERE id = ?1",
                                params![ctx.helmor_session_id, sid, ctx.model_provider],
                            ) {
                                tracing::error!(rid = %rid, "Failed to persist session id: {error}");
                            } else {
                                tracing::debug!(rid = %rid, provider_session_id = sid, "Session ID persisted");
                            }
                        }
                    }
                }
            }

            match event.event_type() {
                "end" | "aborted" => {
                    let is_aborted = event.event_type() == "aborted";
                    let reason = if is_aborted {
                        Some(
                            event
                                .raw
                                .get("reason")
                                .and_then(Value::as_str)
                                .unwrap_or("user_requested")
                                .to_string(),
                        )
                    } else {
                        None
                    };
                    let status = if is_aborted { "aborted" } else { "idle" };

                    // Tracks whether the FINAL finalize (persist_result_and_finalize
                    // for end, finalize_session_metadata for aborted) succeeded.
                    // Turn-message failures don't flip this back to false — the
                    // frontend uses `persisted` as "end state is durable in DB".
                    let mut persisted = false;
                    let mut resolved_model = model_copy.cli_model.to_string();

                    if let Some(mut pipeline_state) = pipeline.take() {
                        if is_aborted {
                            pipeline_state.accumulator.mark_pending_tools_aborted();
                        }

                        pipeline_state.accumulator.flush_pending();

                        if is_aborted {
                            pipeline_state.accumulator.flush_codex_in_progress();
                            pipeline_state.materialize_partial();
                            pipeline_state.accumulator.append_aborted_notice();
                        }

                        // Persist remaining turns and sync their UUIDs back
                        // into collected[] so streaming IDs = DB IDs.
                        if let (Some(ctx), Some(conn)) =
                            (&exchange_ctx, &crate::models::db::write_conn().ok())
                        {
                            let model_str = pipeline_state.accumulator.resolved_model().to_string();
                            while persisted_turn_count < pipeline_state.accumulator.turns_len() {
                                match persist_turn_message(
                                    conn,
                                    ctx,
                                    pipeline_state.accumulator.turn_at(persisted_turn_count),
                                    &model_str,
                                ) {
                                    Ok(_) => persisted_turn_count += 1,
                                    Err(error) => {
                                        tracing::error!(
                                            turn = persisted_turn_count,
                                            "Failed to persist turn: {error}"
                                        );
                                        break;
                                    }
                                }
                            }
                        }
                        let output = pipeline_state
                            .accumulator
                            .drain_output(resolved_session_id.as_deref());
                        if !output.assistant_text.is_empty() {
                            resolved_model = output.resolved_model.clone();
                        }
                        if let (Some(ctx), Some(conn)) =
                            (&exchange_ctx, &crate::models::db::write_conn().ok())
                        {
                            if is_aborted {
                                match finalize_session_metadata(
                                    conn,
                                    ctx,
                                    status,
                                    effort_copy.as_deref(),
                                    permission_mode_copy.as_deref(),
                                ) {
                                    Ok(_) => persisted = true,
                                    Err(error) => {
                                        tracing::error!(rid = %rid, "Failed to finalize exchange: {error}");
                                    }
                                }
                            } else {
                                let preassigned = pipeline_state.accumulator.take_result_id();
                                match persist_result_and_finalize(
                                    conn,
                                    ctx,
                                    &output.resolved_model,
                                    &output.assistant_text,
                                    effort_copy.as_deref(),
                                    permission_mode_copy.as_deref(),
                                    &output.usage,
                                    output.result_json.as_deref(),
                                    status,
                                    preassigned,
                                ) {
                                    Ok(_) => persisted = true,
                                    Err(error) => {
                                        tracing::error!(rid = %rid, "Failed to finalize exchange: {error}");
                                    }
                                }
                            }
                        } else if exchange_ctx.is_some() {
                            tracing::error!(
                                rid = %rid,
                                "Failed to borrow writer for finalize — reporting persisted=false"
                            );
                        }

                        // Final render with DB-synced IDs so the frontend
                        // cache matches what the historical loader returns.
                        let mut final_messages = pipeline_state.finish();
                        if let Some(plan_message) = persisted_exit_plan_review.clone() {
                            final_messages.push(plan_message);
                        }
                        let _ = on_event.send(AgentStreamEvent::Update {
                            messages: final_messages,
                        });
                    }

                    tracing::info!(
                        rid = %rid,
                        outcome = if is_aborted { "aborted" } else { "done" },
                        event_count,
                        heartbeat_count,
                        persisted_turn_count,
                        elapsed_ms = stream_started_at.elapsed().as_millis(),
                        persisted,
                        "stream: terminal event received"
                    );
                    let _ = if let Some(reason) = reason {
                        on_event.send(AgentStreamEvent::Aborted {
                            provider: provider.clone(),
                            model_id: model_id.clone(),
                            resolved_model,
                            session_id: resolved_session_id.clone(),
                            working_directory: working_dir_str.clone(),
                            persisted,
                            reason,
                        })
                    } else {
                        on_event.send(AgentStreamEvent::Done {
                            provider: provider.clone(),
                            model_id: model_id.clone(),
                            resolved_model,
                            session_id: resolved_session_id.clone(),
                            working_directory: working_dir_str.clone(),
                            persisted,
                        })
                    };
                    break;
                }
                "permissionRequest" => {
                    let permission_id = event
                        .raw
                        .get("permissionId")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let tool_name = event
                        .raw
                        .get("toolName")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let tool_input = event
                        .raw
                        .get("toolInput")
                        .cloned()
                        .unwrap_or(Value::Object(Default::default()));
                    let title = event
                        .raw
                        .get("title")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                    let description = event
                        .raw
                        .get("description")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                    tracing::debug!(rid = %rid, tool = %tool_name, permission_id = %permission_id, "Permission request");

                    let _ = on_event.send(AgentStreamEvent::PermissionRequest {
                        permission_id,
                        tool_name,
                        tool_input,
                        title,
                        description,
                    });
                }
                "planCaptured" => {
                    let tool_use_id = event
                        .raw
                        .get("toolUseId")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let plan_value = event.raw.get("plan").cloned().unwrap_or(Value::Null);
                    let tool_input = json!({ "plan": plan_value });
                    tracing::debug!(rid = %rid, tool_use_id = %tool_use_id, "Plan captured");

                    if let Some(pipeline_state) = pipeline.as_mut() {
                        pipeline_state.accumulator.flush_pending();

                        if let (Some(ctx), Some(conn)) =
                            (&exchange_ctx, &crate::models::db::write_conn().ok())
                        {
                            let model_str = pipeline_state.accumulator.resolved_model().to_string();
                            while persisted_turn_count < pipeline_state.accumulator.turns_len() {
                                match persist_turn_message(
                                    conn,
                                    ctx,
                                    pipeline_state.accumulator.turn_at(persisted_turn_count),
                                    &model_str,
                                ) {
                                    Ok(_) => persisted_turn_count += 1,
                                    Err(error) => {
                                        tracing::error!(
                                            turn = persisted_turn_count,
                                            "Failed to persist turn: {error}"
                                        );
                                        break;
                                    }
                                }
                            }
                        }

                        let resolved_model =
                            pipeline_state.accumulator.resolved_model().to_string();
                        let persisted_metadata = if let (Some(ctx), Some(conn)) =
                            (&exchange_ctx, &crate::models::db::write_conn().ok())
                        {
                            persist_exit_plan_message(
                                conn,
                                ctx,
                                &resolved_model,
                                &tool_use_id,
                                "ExitPlanMode",
                                &tool_input,
                            )
                            .ok()
                        } else {
                            None
                        };
                        let (msg_id, created_at) = persisted_metadata.unwrap_or_default();
                        persisted_exit_plan_review = Some(build_exit_plan_review_message(
                            (!msg_id.is_empty()).then_some(msg_id),
                            (!created_at.is_empty()).then_some(created_at),
                            &tool_use_id,
                            "ExitPlanMode",
                            &tool_input,
                        ));

                        let mut final_messages = pipeline_state.finish();
                        if let Some(plan_message) = persisted_exit_plan_review.clone() {
                            final_messages.push(plan_message);
                        }
                        let _ = on_event.send(AgentStreamEvent::Update {
                            messages: final_messages,
                        });
                    }
                    let _ = on_event.send(AgentStreamEvent::PlanCaptured {});
                }
                "deferredToolUse" => {
                    let tool_use_id = event
                        .raw
                        .get("toolUseId")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let tool_name = event
                        .raw
                        .get("toolName")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let tool_input = event
                        .raw
                        .get("toolInput")
                        .cloned()
                        .unwrap_or(Value::Object(Default::default()));
                    let mut resolved_model = model_copy.cli_model.to_string();

                    if let Some(mut pipeline_state) = pipeline.take() {
                        pipeline_state.accumulator.flush_pending();

                        if let (Some(ctx), Some(conn)) =
                            (&exchange_ctx, &crate::models::db::write_conn().ok())
                        {
                            let model_str = pipeline_state.accumulator.resolved_model().to_string();
                            while persisted_turn_count < pipeline_state.accumulator.turns_len() {
                                match persist_turn_message(
                                    conn,
                                    ctx,
                                    pipeline_state.accumulator.turn_at(persisted_turn_count),
                                    &model_str,
                                ) {
                                    Ok(_) => persisted_turn_count += 1,
                                    Err(error) => {
                                        tracing::error!(
                                            turn = persisted_turn_count,
                                            "Failed to persist turn: {error}"
                                        );
                                        break;
                                    }
                                }
                            }
                        }

                        // Deferred pause is terminal for this stream from the
                        // frontend's perspective. IDs are already stable by
                        // construction (same UUID in `collected[]` and
                        // `CollectedTurn`), so no post-hoc sync is needed.
                        resolved_model = pipeline_state.accumulator.resolved_model().to_string();

                        let final_messages = pipeline_state.finish();
                        let _ = on_event.send(AgentStreamEvent::Update {
                            messages: final_messages,
                        });

                        if let (Some(ctx), Some(conn)) =
                            (&exchange_ctx, &crate::models::db::write_conn().ok())
                        {
                            if let Err(error) = finalize_session_metadata(
                                conn,
                                ctx,
                                "idle",
                                effort_copy.as_deref(),
                                permission_mode_copy.as_deref(),
                            ) {
                                tracing::error!(
                                    rid = %rid,
                                    "Failed to finalize deferred exchange: {error}"
                                );
                            }
                        }
                    }

                    let _ = on_event.send(AgentStreamEvent::DeferredToolUse {
                        provider: provider.clone(),
                        model_id: model_id.clone(),
                        resolved_model,
                        session_id: resolved_session_id.clone(),
                        working_directory: working_dir_str.clone(),
                        permission_mode: permission_mode_copy.clone(),
                        tool_use_id,
                        tool_name,
                        tool_input,
                    });
                    break;
                }
                "permissionModeChanged" => {
                    permission_mode_copy = event
                        .raw
                        .get("permissionMode")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                }
                "contextUsageUpdated" => {
                    persist_context_usage_event(&app, &event.raw);
                }
                "codexRateLimitsUpdated" => {
                    persist_codex_rate_limits_event(&app, &event.raw);
                }
                "elicitationRequest" => {
                    let resolved_model = pipeline
                        .as_ref()
                        .map(|state| state.accumulator.resolved_model().to_string())
                        .unwrap_or_else(|| model_copy.cli_model.to_string());
                    let _ = on_event.send(bridge_elicitation_request_event(
                        &provider,
                        &model_id,
                        &resolved_model,
                        resolved_session_id.clone(),
                        &working_dir_str,
                        &event.raw,
                    ));
                }
                "userInputRequest" => {
                    let resolved_model = pipeline
                        .as_ref()
                        .map(|state| state.accumulator.resolved_model().to_string())
                        .unwrap_or_else(|| model_copy.cli_model.to_string());
                    let user_input_id = event
                        .raw
                        .get("userInputId")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let questions = event
                        .raw
                        .get("questions")
                        .cloned()
                        .unwrap_or(Value::Array(Vec::new()));
                    let schema = build_user_input_schema(&questions);
                    let message = "Codex needs your input".to_string();

                    let _ = on_event.send(AgentStreamEvent::ElicitationRequest {
                        provider: provider.to_string(),
                        model_id: model_id.to_string(),
                        resolved_model,
                        session_id: resolved_session_id.clone(),
                        working_directory: working_dir_str.clone(),
                        elicitation_id: Some(user_input_id),
                        server_name: "Codex".to_string(),
                        message,
                        mode: Some("form".to_string()),
                        url: None,
                        requested_schema: Some(schema),
                    });
                }
                "error" => {
                    let message = event
                        .raw
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("Unknown sidecar error")
                        .to_string();
                    let internal = event
                        .raw
                        .get("internal")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);
                    tracing::debug!(rid = %rid, internal, "Sidecar error: {message}");
                    let mut persisted = false;

                    if let (Some(ctx), Some(conn)) =
                        (&exchange_ctx, &crate::models::db::write_conn().ok())
                    {
                        let resolved_model = pipeline
                            .as_ref()
                            .map(|pipeline_state| {
                                pipeline_state.accumulator.resolved_model().to_string()
                            })
                            .unwrap_or_else(|| model_copy.cli_model.to_string());

                        match persist_error_message(conn, ctx, &resolved_model, &message) {
                            Ok(_) => persisted = true,
                            Err(error) => {
                                tracing::error!(rid = %rid, "Failed to persist error message: {error}");
                            }
                        }

                        if let Err(error) = finalize_session_metadata(
                            conn,
                            ctx,
                            "idle",
                            effort_copy.as_deref(),
                            permission_mode_copy.as_deref(),
                        ) {
                            tracing::error!(rid = %rid, "Failed to finalize error exchange: {error}");
                        }
                    }

                    tracing::info!(
                        rid = %rid,
                        event_count,
                        heartbeat_count,
                        elapsed_ms = stream_started_at.elapsed().as_millis(),
                        persisted,
                        internal,
                        "stream: error event — finalized"
                    );
                    let _ = on_event.send(AgentStreamEvent::Error {
                        message,
                        persisted,
                        internal,
                    });
                    break;
                }
                _ => {
                    let line = serde_json::to_string(&event.raw).unwrap_or_default();
                    if !line.is_empty() && line != "{}" {
                        if let Some(pipeline_state) = pipeline.as_mut() {
                            let emit = pipeline_state.push_event(&event.raw, &line);

                            if let (Some(ctx), Some(conn)) =
                                (&exchange_ctx, &crate::models::db::write_conn().ok())
                            {
                                let model_str =
                                    pipeline_state.accumulator.resolved_model().to_string();
                                while persisted_turn_count < pipeline_state.accumulator.turns_len()
                                {
                                    match persist_turn_message(
                                        conn,
                                        ctx,
                                        pipeline_state.accumulator.turn_at(persisted_turn_count),
                                        &model_str,
                                    ) {
                                        Ok(_) => {
                                            persisted_turn_count += 1;
                                        }
                                        Err(error) => {
                                            tracing::error!(
                                                turn = persisted_turn_count,
                                                "Failed to persist turn: {error}"
                                            );
                                            break;
                                        }
                                    }
                                }
                            }

                            match emit {
                                crate::pipeline::PipelineEmit::Full(mut messages) => {
                                    if let Some(ref plan_msg) = persisted_exit_plan_review {
                                        messages.push(plan_msg.clone());
                                    }
                                    let _ = on_event.send(AgentStreamEvent::Update { messages });
                                }
                                crate::pipeline::PipelineEmit::Partial(message) => {
                                    let _ = on_event
                                        .send(AgentStreamEvent::StreamingPartial { message });
                                }
                                crate::pipeline::PipelineEmit::None => {}
                            }
                        }
                    }
                }
            }
        }

        tracing::info!(
            rid = %rid,
            event_count,
            heartbeat_count,
            persisted_turn_count,
            elapsed_ms = stream_started_at.elapsed().as_millis(),
            "stream: event loop exited, cleaning up subscription"
        );
        sidecar_state.unsubscribe(&rid);
        active_streams_state.unregister(&rid);
    });

    Ok(())
}

fn build_exit_plan_review_message(
    id: Option<String>,
    created_at: Option<String>,
    tool_use_id: &str,
    tool_name: &str,
    tool_input: &Value,
) -> ThreadMessageLike {
    let plan = tool_input
        .get("plan")
        .and_then(Value::as_str)
        .map(str::to_string);
    let plan_file_path = tool_input
        .get("planFilePath")
        .and_then(Value::as_str)
        .map(str::to_string);
    let allowed_prompts = tool_input
        .get("allowedPrompts")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| {
                    let tool = entry.get("tool").and_then(Value::as_str)?;
                    let prompt = entry.get("prompt").and_then(Value::as_str)?;
                    Some(PlanAllowedPrompt {
                        tool: tool.to_string(),
                        prompt: prompt.to_string(),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    ThreadMessageLike {
        role: MessageRole::Assistant,
        id,
        created_at,
        content: vec![ExtendedMessagePart::Basic(MessagePart::PlanReview {
            tool_use_id: tool_use_id.to_string(),
            tool_name: tool_name.to_string(),
            plan,
            plan_file_path,
            allowed_prompts,
        })],
        status: None,
        streaming: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use insta::assert_yaml_snapshot;

    #[test]
    fn provider_session_id_is_adopted_only_once() {
        assert!(should_adopt_provider_session_id(
            None,
            "provider-session-1",
            None
        ));
        assert!(!should_adopt_provider_session_id(
            Some("provider-session-1"),
            "provider-session-1",
            None,
        ));
        assert!(!should_adopt_provider_session_id(
            Some("provider-session-1"),
            "provider-session-2",
            None,
        ));
    }

    #[test]
    fn provider_session_id_rejects_empty_and_helmor_echo_values() {
        assert!(!should_adopt_provider_session_id(None, "", None));
        assert!(!should_adopt_provider_session_id(
            None,
            "helmor-session-1",
            Some("helmor-session-1"),
        ));
    }

    fn open_test_db_with_session(session_id: &str) -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::schema::ensure_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO sessions (id, workspace_id, status) VALUES (?1, 'w1', 'idle')",
            [session_id],
        )
        .unwrap();
        conn
    }

    fn read_meta(conn: &rusqlite::Connection, session_id: &str) -> Option<String> {
        conn.query_row(
            "SELECT context_usage_meta FROM sessions WHERE id = ?1",
            [session_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .unwrap()
    }

    #[test]
    fn write_context_usage_meta_persists_string() {
        let conn = open_test_db_with_session("s1");
        let raw = serde_json::json!({
            "sessionId": "s1",
            "meta": r#"{"usedTokens":42,"maxTokens":1000,"percentage":4.2}"#,
        });
        let outcome = write_context_usage_meta(&conn, &raw).unwrap();
        assert_eq!(outcome, ContextUsageWriteOutcome::Wrote("s1".to_string()));
        assert_eq!(
            read_meta(&conn, "s1").as_deref(),
            Some(r#"{"usedTokens":42,"maxTokens":1000,"percentage":4.2}"#)
        );
    }

    #[test]
    fn write_context_usage_meta_skips_when_meta_null() {
        let conn = open_test_db_with_session("s1");
        // Pre-seed so we can prove the row was NOT touched.
        conn.execute(
            "UPDATE sessions SET context_usage_meta = '{}' WHERE id = 's1'",
            [],
        )
        .unwrap();
        let raw = serde_json::json!({ "sessionId": "s1", "meta": null });
        let outcome = write_context_usage_meta(&conn, &raw).unwrap();
        assert_eq!(outcome, ContextUsageWriteOutcome::Skipped);
        // Pre-seeded value still there.
        assert_eq!(read_meta(&conn, "s1").as_deref(), Some("{}"));
    }

    #[test]
    fn write_context_usage_meta_skips_when_session_id_missing() {
        let conn = open_test_db_with_session("s1");
        for raw in [
            serde_json::json!({}),
            serde_json::json!({ "sessionId": "" }),
            serde_json::json!({ "sessionId": null, "meta": "{}" }),
        ] {
            let outcome = write_context_usage_meta(&conn, &raw).unwrap();
            assert_eq!(outcome, ContextUsageWriteOutcome::Skipped);
        }
        // Row never touched.
        assert!(read_meta(&conn, "s1").is_none());
    }

    #[test]
    fn write_context_usage_meta_reports_unknown_session() {
        // UPDATE against a non-existent id affects 0 rows. The outcome must
        // distinguish this from a real write so persist_context_usage_event
        // can skip the broadcast — silently treating it as a write would
        // mask sidecar/DB races (stale event after delete, etc.).
        let conn = open_test_db_with_session("s1");
        let raw = serde_json::json!({ "sessionId": "ghost", "meta": "{}" });
        let outcome = write_context_usage_meta(&conn, &raw).unwrap();
        assert_eq!(
            outcome,
            ContextUsageWriteOutcome::UnknownSession("ghost".to_string())
        );
        assert!(read_meta(&conn, "s1").is_none());
    }

    #[test]
    fn build_elicitation_request_event_maps_raw_sidecar_payload() {
        let event = bridge_elicitation_request_event(
            "claude",
            "opus-1m",
            "claude-opus-4-20250514",
            Some("provider-session-1".to_string()),
            "/tmp/helmor",
            &serde_json::json!({
                "elicitationId": "elicitation-1",
                "serverName": "design-server",
                "message": "Need structured input",
                "mode": "form",
                "url": null,
                "requestedSchema": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string" }
                    },
                    "required": ["name"]
                }
            }),
        );

        assert_yaml_snapshot!(
            serde_json::to_value(&event).unwrap(),
            @r#"
elicitationId: elicitation-1
kind: elicitationRequest
message: Need structured input
mode: form
model_id: opus-1m
provider: claude
requestedSchema:
  properties:
    name:
      type: string
  required:
    - name
  type: object
resolved_model: claude-opus-4-20250514
serverName: design-server
session_id: provider-session-1
url: ~
working_directory: /tmp/helmor
            "#
        );
    }

    #[test]
    fn user_input_schema_yes_no_question() {
        let questions = serde_json::json!([
            { "question": "Approve this plan?" }
        ]);
        let schema = build_user_input_schema(&questions);
        // Verify structure without relying on key order
        assert_eq!(schema["type"], "object");
        let q0 = &schema["properties"]["q0"];
        assert_eq!(q0["type"], "string");
        assert_eq!(q0["title"], "Approve this plan?");
        let options = q0["oneOf"].as_array().unwrap();
        assert_eq!(options.len(), 2);
        assert_eq!(options[0]["const"], "yes");
        assert_eq!(options[1]["const"], "no");
        assert_eq!(schema["required"][0], "q0");
    }

    #[test]
    fn user_input_schema_free_text_question() {
        let questions = serde_json::json!([
            { "question": "What changes?", "isOther": true }
        ]);
        let schema = build_user_input_schema(&questions);
        assert_eq!(schema["type"], "object");
        let q0 = &schema["properties"]["q0"];
        assert_eq!(q0["type"], "string");
        assert_eq!(q0["title"], "What changes?");
        assert!(q0.get("oneOf").is_none());
    }

    #[test]
    fn user_input_schema_mixed_questions() {
        let questions = serde_json::json!([
            { "question": "Continue?" },
            { "question": "Describe approach", "isOther": true },
        ]);
        let schema = build_user_input_schema(&questions);
        let props = &schema["properties"];
        assert!(props["q0"].get("oneOf").is_some());
        assert!(props["q1"].get("oneOf").is_none());
        assert_eq!(schema["required"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn user_input_schema_empty_returns_empty_object() {
        let schema = build_user_input_schema(&serde_json::json!([]));
        // Empty questions → empty schema (properties exist but empty)
        assert_eq!(schema["type"], "object");
        assert!(schema["properties"].as_object().unwrap().is_empty());
    }

    #[test]
    fn user_input_schema_non_array_returns_null() {
        assert_eq!(
            build_user_input_schema(&serde_json::json!("not array")),
            Value::Null
        );
    }

    #[test]
    fn convert_answers_maps_to_codex_format() {
        let content = serde_json::json!({
            "project_shape": "New project",
            "app_goal": "Validate requirements",
        });
        let answers = convert_elicitation_content_to_codex_answers(&content);
        let obj = answers.as_object().unwrap();
        assert_eq!(
            obj["project_shape"],
            serde_json::json!({ "answers": ["New project"] }),
        );
        assert_eq!(
            obj["app_goal"],
            serde_json::json!({ "answers": ["Validate requirements"] }),
        );
    }

    #[test]
    fn convert_answers_wraps_each_value() {
        let content = serde_json::json!({
            "q0": "a",
            "q1": "b",
        });
        let answers = convert_elicitation_content_to_codex_answers(&content);
        let obj = answers.as_object().unwrap();
        assert_eq!(obj.len(), 2);
        assert_eq!(obj["q0"]["answers"][0], "a");
        assert_eq!(obj["q1"]["answers"][0], "b");
    }

    #[test]
    fn convert_answers_null_input() {
        assert_eq!(
            convert_elicitation_content_to_codex_answers(&Value::Null),
            Value::Null,
        );
    }

    #[test]
    fn user_input_schema_with_options() {
        let questions = serde_json::json!([{
            "id": "project_shape",
            "header": "Project shape",
            "question": "Choose project type",
            "isOther": false,
            "options": [
                { "label": "New project", "description": "Start from scratch" },
                { "label": "Refactor", "description": "Based on existing code" },
            ]
        }]);
        let schema = build_user_input_schema(&questions);
        // Key should be the question id
        let field = &schema["properties"]["project_shape"];
        assert_eq!(field["title"], "Project shape");
        assert_eq!(field["description"], "Choose project type");
        let opts = field["oneOf"].as_array().unwrap();
        assert_eq!(opts.len(), 2);
        assert_eq!(opts[0]["const"], "New project");
        assert_eq!(opts[0]["description"], "Start from scratch");
        assert!(field.get("x-allow-other").is_none());
    }

    #[test]
    fn user_input_schema_options_with_is_other() {
        let questions = serde_json::json!([{
            "header": "Platform choice",
            "question": "First-launch platform?",
            "isOther": true,
            "options": [
                { "label": "H5", "description": "Fastest" },
            ]
        }]);
        let schema = build_user_input_schema(&questions);
        let q0 = &schema["properties"]["q0"];
        assert_eq!(q0["title"], "Platform choice");
        assert_eq!(q0["x-allow-other"], true);
        assert_eq!(q0["oneOf"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn user_input_schema_header_fallback() {
        let questions = serde_json::json!([
            { "question": "Simple question?" }
        ]);
        let schema = build_user_input_schema(&questions);
        let q0 = &schema["properties"]["q0"];
        // No header → title falls back to question, description is empty
        assert_eq!(q0["title"], "Simple question?");
        assert_eq!(q0["description"], "");
    }

    // ---- lookup_workspace_linked_directories ----------------------------

    mod lookup_linked_directories {
        use super::*;

        /// Set up an isolated DB + schema for each test and seed a repo row
        /// that the workspace fixture can reference.
        fn with_test_db<F: FnOnce(&rusqlite::Connection)>(name: &str, f: F) {
            let dir = tempfile::tempdir().unwrap();
            let _guard = crate::data_dir::TEST_ENV_LOCK
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            std::env::set_var("HELMOR_DATA_DIR", dir.path());
            crate::data_dir::ensure_directory_structure().unwrap();

            let db_path = crate::data_dir::db_path().unwrap();
            let conn = rusqlite::Connection::open(&db_path).unwrap();
            crate::schema::ensure_schema(&conn).unwrap();
            conn.execute(
                "INSERT INTO repos (id, name, default_branch) VALUES ('r-1', ?1, 'main')",
                [name],
            )
            .unwrap();
            f(&conn);
            std::env::remove_var("HELMOR_DATA_DIR");
        }

        fn insert_ws_session(
            conn: &rusqlite::Connection,
            ws_id: &str,
            sess_id: &str,
            linked: Option<&str>,
        ) {
            conn.execute(
                "INSERT INTO workspaces (id, repository_id, directory_name, state,
                 derived_status, linked_directory_paths) VALUES (?1, 'r-1', 'ws', 'ready',
                 'in-progress', ?2)",
                rusqlite::params![ws_id, linked],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO sessions (id, workspace_id, status) VALUES (?1, ?2, 'idle')",
                [sess_id, ws_id],
            )
            .unwrap();
        }

        #[test]
        fn returns_empty_when_session_id_is_missing() {
            with_test_db("noop", |_conn| {
                assert!(lookup_workspace_linked_directories(None).is_empty());
            });
        }

        #[test]
        fn returns_empty_when_session_row_not_found() {
            with_test_db("orphan", |_conn| {
                assert!(lookup_workspace_linked_directories(Some("unknown-session")).is_empty());
            });
        }

        #[test]
        fn returns_empty_when_linked_column_is_null() {
            with_test_db("null-col", |conn| {
                insert_ws_session(conn, "w-1", "s-1", None);
                assert!(lookup_workspace_linked_directories(Some("s-1")).is_empty());
            });
        }

        #[test]
        fn returns_parsed_list_when_linked_column_populated() {
            with_test_db("populated", |conn| {
                insert_ws_session(conn, "w-2", "s-2", Some(r#"["/abs/a","/abs/b"]"#));
                assert_eq!(
                    lookup_workspace_linked_directories(Some("s-2")),
                    vec!["/abs/a".to_string(), "/abs/b".to_string()],
                );
            });
        }

        #[test]
        fn returns_empty_when_json_is_malformed() {
            with_test_db("malformed", |conn| {
                insert_ws_session(conn, "w-3", "s-3", Some("not json"));
                assert!(lookup_workspace_linked_directories(Some("s-3")).is_empty());
            });
        }

        #[test]
        fn trims_and_dedupes_at_parse_time() {
            with_test_db("normalize", |conn| {
                insert_ws_session(
                    conn,
                    "w-4",
                    "s-4",
                    Some(r#"["  /abs/a  ","/abs/a","","/abs/b"]"#),
                );
                assert_eq!(
                    lookup_workspace_linked_directories(Some("s-4")),
                    vec!["/abs/a".to_string(), "/abs/b".to_string()],
                );
            });
        }
    }

    // ---- cleanup_abnormal_stream_exit ------------------------------------

    mod cleanup_abnormal_exit {
        use super::*;
        use crate::agents::ExchangeContext;

        fn with_session<F: FnOnce()>(session_status: &str, f: F) {
            let dir = tempfile::tempdir().unwrap();
            let _guard = crate::data_dir::TEST_ENV_LOCK
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            std::env::set_var("HELMOR_DATA_DIR", dir.path());
            crate::data_dir::ensure_directory_structure().unwrap();

            let db_path = crate::data_dir::db_path().unwrap();
            let conn = rusqlite::Connection::open(&db_path).unwrap();
            crate::schema::ensure_schema(&conn).unwrap();
            conn.execute(
                "INSERT INTO repos (id, name, default_branch) VALUES ('r-1', 'r', 'main')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO workspaces (id, repository_id, directory_name, state, derived_status)
                 VALUES ('w-1', 'r-1', 'd', 'ready', 'in-progress')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO sessions (id, workspace_id, status, title) VALUES (?1, 'w-1', ?2, 't')",
                rusqlite::params!["s-1", session_status],
            )
            .unwrap();
            drop(conn);

            f();

            std::env::remove_var("HELMOR_DATA_DIR");
        }

        fn ctx() -> ExchangeContext {
            ExchangeContext {
                helmor_session_id: "s-1".to_string(),
                model_id: "opus".to_string(),
                model_provider: "claude".to_string(),
                user_message_id: "user-1".to_string(),
            }
        }

        fn session_status() -> String {
            crate::models::db::read_conn()
                .unwrap()
                .query_row("SELECT status FROM sessions WHERE id = 's-1'", [], |r| {
                    r.get::<_, String>(0)
                })
                .unwrap()
        }

        fn error_message_count() -> i64 {
            crate::models::db::read_conn()
                .unwrap()
                .query_row(
                    "SELECT COUNT(*) FROM session_messages
                     WHERE session_id = 's-1' AND content LIKE '%sidecar%'",
                    [],
                    |r| r.get::<_, i64>(0),
                )
                .unwrap()
        }

        #[test]
        fn finalizes_session_to_idle_and_persists_error_message() {
            with_session("streaming", || {
                let persisted = cleanup_abnormal_stream_exit(
                    "rid-1",
                    Some(&ctx()),
                    "opus",
                    "sidecar dead, retry",
                    None,
                    None,
                );
                assert!(persisted, "expected persisted=true on successful finalize");
                assert_eq!(session_status(), "idle");
                assert_eq!(error_message_count(), 1);
            });
        }

        #[test]
        fn returns_false_and_does_not_touch_db_when_exchange_ctx_is_none() {
            with_session("streaming", || {
                let persisted =
                    cleanup_abnormal_stream_exit("rid-2", None, "opus", "sidecar dead", None, None);
                assert!(!persisted);
                // Session must remain in streaming state — nothing happened.
                assert_eq!(session_status(), "streaming");
                assert_eq!(error_message_count(), 0);
            });
        }

        #[test]
        fn returns_false_when_session_row_does_not_exist() {
            with_session("streaming", || {
                let mut bad_ctx = ctx();
                bad_ctx.helmor_session_id = "nonexistent".to_string();
                let persisted = cleanup_abnormal_stream_exit(
                    "rid-3",
                    Some(&bad_ctx),
                    "opus",
                    "sidecar dead",
                    None,
                    None,
                );
                // finalize_session_metadata fails when no row matches; helper
                // must report the session as NOT persisted rather than lying.
                assert!(!persisted);
            });
        }
    }
}
