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

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression gate: `rename_all = "camelCase"` on the enum only renames
    /// variant names, NOT fields inside struct variants. We need
    /// `rename_all_fields = "camelCase"` on top. Without it, `session_id`
    /// goes over the wire as snake_case, the frontend reads `event.sessionId`
    /// as `undefined`, and `invalidateQueries` matches zero queries — the
    /// exact bug that broke the context-usage ring until the user switched
    /// sessions or windows. If this test ever fails, don't loosen it;
    /// re-check the serde attributes on `UiMutationEvent`.
    #[test]
    fn struct_variant_fields_serialize_as_camel_case() {
        let cases: Vec<UiMutationEvent> = vec![
            UiMutationEvent::WorkspaceChanged {
                workspace_id: "w".into(),
            },
            UiMutationEvent::SessionListChanged {
                workspace_id: "w".into(),
            },
            UiMutationEvent::ContextUsageChanged {
                session_id: "s".into(),
            },
            UiMutationEvent::WorkspaceFilesChanged {
                workspace_id: "w".into(),
            },
            UiMutationEvent::WorkspaceGitStateChanged {
                workspace_id: "w".into(),
            },
            UiMutationEvent::WorkspacePrChanged {
                workspace_id: "w".into(),
            },
            UiMutationEvent::RepositoryChanged {
                repo_id: "r".into(),
            },
            UiMutationEvent::SettingsChanged { key: None },
            UiMutationEvent::PendingCliSendQueued {
                workspace_id: "w".into(),
                session_id: "s".into(),
                prompt: "p".into(),
                model_id: None,
                permission_mode: None,
            },
        ];
        for event in cases {
            let s = serde_json::to_string(&event).unwrap();
            assert!(!s.contains('_'), "snake_case field leaked to the wire: {s}",);
        }
    }

    #[test]
    fn context_usage_changed_has_session_id_in_camel_case() {
        let event = UiMutationEvent::ContextUsageChanged {
            session_id: "abc".into(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "contextUsageChanged");
        assert_eq!(json["sessionId"], "abc");
        assert!(json.get("session_id").is_none());
    }

    #[test]
    fn variant_names_are_camel_case() {
        let cases = [
            (
                UiMutationEvent::WorkspaceListChanged,
                "workspaceListChanged",
            ),
            (
                UiMutationEvent::CodexRateLimitsChanged,
                "codexRateLimitsChanged",
            ),
            (
                UiMutationEvent::RepositoryListChanged,
                "repositoryListChanged",
            ),
            (
                UiMutationEvent::GithubIdentityChanged,
                "githubIdentityChanged",
            ),
        ];
        for (event, expected) in cases {
            let json = serde_json::to_value(&event).unwrap();
            assert_eq!(json["type"], expected);
        }
    }
}
