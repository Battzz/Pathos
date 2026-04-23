use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum UiMutationEvent {
    WorkspaceListChanged,
    WorkspaceChanged {
        workspace_id: String,
    },
    SessionListChanged {
        workspace_id: String,
    },
    ContextUsageChanged {
        session_id: String,
    },
    /// Account-global Codex rate-limit snapshot updated. No payload — the
    /// frontend re-fetches via `get_codex_rate_limits`.
    CodexRateLimitsChanged,
    WorkspaceFilesChanged {
        workspace_id: String,
    },
    WorkspaceGitStateChanged {
        workspace_id: String,
    },
    WorkspacePrChanged {
        workspace_id: String,
    },
    RepositoryListChanged,
    RepositoryChanged {
        repo_id: String,
    },
    SettingsChanged {
        key: Option<String>,
    },
    GithubIdentityChanged,
    PendingCliSendQueued {
        workspace_id: String,
        session_id: String,
        prompt: String,
        model_id: Option<String>,
        permission_mode: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiMutationEnvelope {
    pub version: u8,
    pub event: UiMutationEvent,
}

impl UiMutationEnvelope {
    pub const VERSION: u8 = 1;

    pub fn new(event: UiMutationEvent) -> Self {
        Self {
            version: Self::VERSION,
            event,
        }
    }
}
