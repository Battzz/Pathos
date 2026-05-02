//! GitHub identity adapter backed by the local `gh` CLI.

use anyhow::Result;
use chrono::Utc;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::forge::{self, github::cli, ForgeProvider};

#[derive(Debug, Clone, Default)]
pub struct GithubIdentityFlowRuntime;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GithubIdentitySession {
    pub provider: String,
    pub github_user_id: i64,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub primary_email: Option<String>,
    pub token_expires_at: Option<String>,
    pub refresh_token_expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GithubIdentityAccount {
    pub github_user_id: i64,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub primary_email: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum GithubIdentitySnapshot {
    Connected {
        session: GithubIdentitySession,
        accounts: Vec<GithubIdentityAccount>,
    },
    Disconnected,
    Unconfigured {
        message: String,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GithubIdentityDeviceFlowStart {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub expires_at: String,
    pub interval_seconds: u64,
}

pub fn get_github_identity_session() -> Result<GithubIdentitySnapshot> {
    match cli::get_github_cli_status()? {
        cli::GithubCliStatus::Ready { .. } => {}
        cli::GithubCliStatus::Unauthenticated { .. } => {
            return Ok(GithubIdentitySnapshot::Disconnected)
        }
        cli::GithubCliStatus::Unavailable { message, .. } => {
            return Ok(GithubIdentitySnapshot::Unconfigured { message });
        }
        cli::GithubCliStatus::Error { message, .. } => {
            return Ok(GithubIdentitySnapshot::Error { message });
        }
    }

    let cli_accounts = cli::list_github_cli_accounts()?;
    let user = cli::get_github_cli_user()?;
    let session_account = user
        .as_ref()
        .map(|user| GithubIdentityAccount {
            github_user_id: user.id,
            login: user.login.clone(),
            name: user.name.clone(),
            avatar_url: user.avatar_url.clone(),
            primary_email: user.email.clone(),
        })
        .or_else(|| {
            cli_accounts
                .iter()
                .find(|account| account.active)
                .or_else(|| cli_accounts.first())
                .map(|account| GithubIdentityAccount {
                    github_user_id: account.id,
                    login: account.login.clone(),
                    name: account.name.clone(),
                    avatar_url: account.avatar_url.clone(),
                    primary_email: account.email.clone(),
                })
        });
    let Some(session_account) = session_account else {
        return Ok(GithubIdentitySnapshot::Disconnected);
    };

    let session = GithubIdentitySession {
        provider: "github".to_string(),
        github_user_id: session_account.github_user_id,
        login: session_account.login.clone(),
        name: session_account.name.clone(),
        avatar_url: session_account.avatar_url.clone(),
        primary_email: session_account.primary_email.clone(),
        token_expires_at: None,
        refresh_token_expires_at: None,
    };
    let mut accounts: Vec<GithubIdentityAccount> = cli_accounts
        .into_iter()
        .map(|account| GithubIdentityAccount {
            github_user_id: account.id,
            login: account.login,
            name: account.name,
            avatar_url: account.avatar_url,
            primary_email: account.email,
        })
        .collect();

    if !accounts
        .iter()
        .any(|account| account.github_user_id == session.github_user_id)
    {
        accounts.insert(
            0,
            GithubIdentityAccount {
                github_user_id: session.github_user_id,
                login: session.login.clone(),
                name: session.name.clone(),
                avatar_url: session.avatar_url.clone(),
                primary_email: session.primary_email.clone(),
            },
        );
    }

    Ok(GithubIdentitySnapshot::Connected { session, accounts })
}

pub fn start_github_identity_connect(
    app: AppHandle,
    _runtime: GithubIdentityFlowRuntime,
) -> Result<GithubIdentityDeviceFlowStart> {
    forge::open_forge_cli_auth_terminal(ForgeProvider::Github, Some("github.com"))?;
    let snapshot = get_github_identity_session()?;
    emit_github_identity_snapshot(&app, &snapshot)?;
    Ok(GithubIdentityDeviceFlowStart {
        device_code: String::new(),
        user_code: "GH CLI".to_string(),
        verification_uri: "https://github.com/login".to_string(),
        verification_uri_complete: None,
        expires_at: Utc::now().to_rfc3339(),
        interval_seconds: 2,
    })
}

pub fn cancel_github_identity_connect(
    app: AppHandle,
    _runtime: GithubIdentityFlowRuntime,
) -> Result<()> {
    emit_current_github_identity_snapshot(&app)
}

pub fn disconnect_github_identity(
    app: AppHandle,
    _runtime: GithubIdentityFlowRuntime,
) -> Result<()> {
    cli::logout_github_cli()?;
    emit_current_github_identity_snapshot(&app)
}

pub fn disconnect_github_identity_headless() -> Result<()> {
    cli::logout_github_cli()
}

pub fn switch_github_identity_account(
    app: AppHandle,
    github_user_id: i64,
) -> Result<GithubIdentitySnapshot> {
    cli::switch_github_cli_account(github_user_id)?;
    let snapshot = get_github_identity_session()?;
    emit_github_identity_snapshot(&app, &snapshot)?;
    Ok(snapshot)
}

fn emit_current_github_identity_snapshot(app: &AppHandle) -> Result<()> {
    let snapshot = get_github_identity_session()?;
    emit_github_identity_snapshot(app, &snapshot)
}

fn emit_github_identity_snapshot(app: &AppHandle, snapshot: &GithubIdentitySnapshot) -> Result<()> {
    app.emit("github-identity-changed", snapshot)?;
    Ok(())
}
