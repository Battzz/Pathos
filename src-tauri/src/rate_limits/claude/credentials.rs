//! Claude OAuth credential type, parsing, and ranking.
//!
//! Pure data — no IO, no IPC. The keychain reader, the cache and the
//! refresh paths all consume `ClaudeOAuthCredentials` produced here.

use chrono::Utc;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
struct ClaudeCredentialsFile {
    #[serde(rename = "claudeAiOauth")]
    claude_ai_oauth: Option<ClaudeOAuthCredentials>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ClaudeOAuthCredentials {
    pub(super) access_token: String,
    pub(super) expires_at: Option<i64>,
    #[serde(default)]
    pub(super) scopes: Vec<String>,
}

impl ClaudeOAuthCredentials {
    pub(super) fn is_expired(&self, now_ms: i64) -> bool {
        self.expires_at
            .is_some_and(|expires_at| expires_at <= now_ms)
    }

    pub(super) fn has_required_scope(&self) -> bool {
        self.scopes.iter().any(|scope| scope == "user:profile")
    }
}

/// Parse the JSON payload returned by `/usr/bin/security` (or the
/// fallback file). Accepts both the nested Claude-CLI shape
/// (`{"claudeAiOauth": {...}}`) and the flat shape so the same code can
/// consume hand-edited overrides.
pub(super) fn parse_credentials(data: &[u8]) -> Option<ClaudeOAuthCredentials> {
    serde_json::from_slice::<ClaudeCredentialsFile>(data)
        .ok()
        .and_then(|file| file.claude_ai_oauth)
        .or_else(|| serde_json::from_slice::<ClaudeOAuthCredentials>(data).ok())
}

/// Order candidates so the best one is `last()`. Priority: has the
/// `user:profile` scope > not expired > later `expires_at`.
pub(super) fn sort_credentials(credentials: &mut [ClaudeOAuthCredentials], now: i64) {
    credentials.sort_by_key(|credential| {
        let scope_score = if credential.has_required_scope() {
            2
        } else {
            0
        };
        let valid_score = if credential.is_expired(now) { 0 } else { 1 };
        let expires_at = credential.expires_at.unwrap_or(0) / 1000;
        (scope_score, valid_score, expires_at)
    });
}

pub(super) fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nested_claude_code_credentials() {
        let data = br#"{"claudeAiOauth":{"accessToken":"a","refreshToken":"r","expiresAt":1777109771360,"scopes":["user:profile"],"rateLimitTier":"default"}}"#;
        let credentials = parse_credentials(data).unwrap();
        assert_eq!(credentials.access_token, "a");
        assert!(credentials.has_required_scope());
    }

    #[test]
    fn parses_flat_claude_code_credentials() {
        let data =
            br#"{"accessToken":"a","refreshToken":"r","expiresAt":1777109771360,"scopes":["user:profile"]}"#;
        let credentials = parse_credentials(data).unwrap();
        assert_eq!(credentials.access_token, "a");
        // refresh_token is intentionally not on the struct: we never
        // refresh directly, so we never need to read it.
    }

    #[test]
    fn returns_none_for_invalid_credentials_bytes() {
        assert!(parse_credentials(b"not json").is_none());
    }

    #[test]
    fn credential_sort_prioritizes_required_scope() {
        let now = 1_000_000;
        let mut credentials = vec![
            ClaudeOAuthCredentials {
                access_token: "valid-no-scope".to_string(),
                expires_at: Some(now + 10_000),
                scopes: Vec::new(),
            },
            ClaudeOAuthCredentials {
                access_token: "expired-with-scope".to_string(),
                expires_at: Some(now - 1),
                scopes: vec!["user:profile".to_string()],
            },
        ];

        sort_credentials(&mut credentials, now);
        assert_eq!(
            credentials
                .last()
                .map(|credential| credential.access_token.as_str()),
            Some("expired-with-scope")
        );
    }
}
