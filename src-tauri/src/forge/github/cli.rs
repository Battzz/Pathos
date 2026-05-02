use anyhow::{anyhow, Context, Result};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use crate::forge::command::{run_command, run_command_with_env};
use crate::forge::status_cache::{self, CacheableStatus, CachedEntry};

const GITHUB_HOST: &str = "github.com";
const GITHUB_REPOS_ENDPOINT: &str =
    "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member";
const GITHUB_CLI_STATUS_CACHE_TTL: Duration = Duration::from_secs(2);
const GITHUB_CLI_READY_DOWNGRADE_GRACE: Duration = Duration::from_secs(600);
const GITHUB_REPO_LOGIN_CACHE_TTL: Duration = Duration::from_secs(300);

type GithubStatusCache = Mutex<HashMap<&'static str, CachedEntry<GithubCliStatus>>>;
static SYSTEM_GH_STATUS_CACHE: LazyLock<GithubStatusCache> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static GITHUB_REPO_LOGIN_CACHE: LazyLock<Mutex<HashMap<String, CachedRepoLogin>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

impl CacheableStatus for GithubCliStatus {
    fn is_ready(&self) -> bool {
        matches!(self, GithubCliStatus::Ready { .. })
    }
    fn should_debounce_ready_downgrade(&self) -> bool {
        // `Unauthenticated` is conclusive — `gh auth status` reads the local
        // hosts.yml so it should surface immediately on a `gh auth logout`.
        // Only `Error` (network blip, gh momentarily wedged) is debounced.
        matches!(self, GithubCliStatus::Error { .. })
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum GithubCliStatus {
    Ready {
        host: String,
        login: String,
        version: String,
        message: String,
    },
    Unauthenticated {
        host: String,
        version: Option<String>,
        message: String,
    },
    Unavailable {
        host: String,
        message: String,
    },
    Error {
        host: String,
        version: Option<String>,
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GithubCliUser {
    pub login: String,
    pub id: i64,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GithubCliAccount {
    pub login: String,
    pub id: i64,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub email: Option<String>,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GithubRepositorySummary {
    pub id: i64,
    pub name: String,
    pub full_name: String,
    pub owner_login: String,
    pub private: bool,
    pub default_branch: Option<String>,
    pub html_url: String,
    pub updated_at: Option<String>,
    pub pushed_at: Option<String>,
}

#[derive(Debug, Clone)]
struct GhCommandOutput {
    stdout: String,
}

#[derive(Debug, Clone)]
struct CachedRepoLogin {
    login: String,
    expires_at: Instant,
}

#[derive(Debug, Clone)]
enum GhCommandError {
    NotFound,
    Failed {
        stdout: String,
        stderr: String,
        code: Option<i32>,
    },
    Other(String),
}

trait GhCommandRunner {
    fn run<I, S>(&self, args: I) -> std::result::Result<GhCommandOutput, GhCommandError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>;
}

pub fn get_github_cli_status() -> Result<GithubCliStatus> {
    status_cache::load_cached(
        &SYSTEM_GH_STATUS_CACHE,
        GITHUB_HOST,
        GITHUB_CLI_STATUS_CACHE_TTL,
        GITHUB_CLI_READY_DOWNGRADE_GRACE,
        || get_github_cli_status_with(&SystemGhRunner),
    )
}

pub fn refresh_github_cli_status() -> Result<GithubCliStatus> {
    status_cache::refresh_cached(&SYSTEM_GH_STATUS_CACHE, GITHUB_HOST, || {
        get_github_cli_status_with(&SystemGhRunner)
    })
}

pub fn get_github_cli_user() -> Result<Option<GithubCliUser>> {
    let status = get_github_cli_status()?;
    get_github_cli_user_with_status(&SystemGhRunner, &status)
}

pub fn list_github_cli_accounts() -> Result<Vec<GithubCliAccount>> {
    let status = get_github_cli_status()?;
    list_github_cli_accounts_with_status(&SystemGhRunner, &status)
}

pub fn switch_github_cli_account(github_user_id: i64) -> Result<()> {
    switch_github_cli_account_with(&SystemGhRunner, github_user_id)?;
    status_cache::refresh_cached(&SYSTEM_GH_STATUS_CACHE, GITHUB_HOST, || {
        get_github_cli_status_with(&SystemGhRunner)
    })?;
    Ok(())
}

pub fn list_github_accessible_repositories() -> Result<Vec<GithubRepositorySummary>> {
    let status = get_github_cli_status()?;
    if !github_cli_is_ready(&status) {
        return Ok(Vec::new());
    }

    let accounts = list_github_cli_accounts_with_status(&SystemGhRunner, &status)?;
    if accounts.is_empty() {
        return list_github_accessible_repositories_with_status(&SystemGhRunner, &status);
    }

    let mut repositories = HashMap::<i64, GithubRepositorySummary>::new();
    for account in accounts {
        match list_github_accessible_repositories_for_login(&account.login) {
            Ok(account_repositories) => {
                for repository in account_repositories {
                    repositories.entry(repository.id).or_insert(repository);
                }
            }
            Err(error) => {
                tracing::debug!(
                    login = %account.login,
                    error = %format!("{error:#}"),
                    "GitHub CLI repository lookup failed for account; continuing"
                );
            }
        }
    }

    let mut repositories = repositories.into_values().collect::<Vec<_>>();
    repositories.sort_by(|a, b| {
        b.pushed_at
            .cmp(&a.pushed_at)
            .then_with(|| a.full_name.cmp(&b.full_name))
    });
    Ok(repositories)
}

pub fn github_api_json<T>(args: Vec<String>, context: &str) -> Result<Option<T>>
where
    T: DeserializeOwned,
{
    let status = get_github_cli_status()?;
    if !github_cli_is_ready(&status) {
        return Ok(None);
    }

    let output = match run_gh_api(&SystemGhRunner, args) {
        Ok(output) => output,
        Err(GhCommandError::NotFound) => {
            tracing::warn!("gh binary missing during API call");
            return Ok(None);
        }
        Err(GhCommandError::Failed {
            stdout,
            stderr,
            code,
        }) => {
            let detail = command_error_detail(&stdout, &stderr, code);
            if looks_like_unauthenticated(&detail) {
                tracing::warn!(code = ?code, detail = %detail, "gh API call unauthenticated");
                return Ok(None);
            }

            tracing::warn!(code = ?code, detail = %detail, "gh API call failed");
            return Err(anyhow!("GitHub CLI API call failed: {detail}"));
        }
        Err(GhCommandError::Other(message)) => {
            tracing::warn!(error = %message, "gh API call failed (IO error)");
            return Err(anyhow!("GitHub CLI API call failed: {message}"));
        }
    };

    serde_json::from_str::<T>(&output.stdout)
        .with_context(|| format!("Failed to decode GitHub CLI API response for {context}"))
        .map(Some)
}

pub fn github_api_json_for_login<T>(
    login: &str,
    args: Vec<String>,
    context: &str,
) -> Result<Option<T>>
where
    T: DeserializeOwned,
{
    let output = match run_gh_api_for_login(login, args) {
        Ok(output) => output,
        Err(GhCommandError::NotFound) => {
            tracing::warn!("gh binary missing during account-scoped API call");
            return Ok(None);
        }
        Err(GhCommandError::Failed {
            stdout,
            stderr,
            code,
        }) => {
            let detail = command_error_detail(&stdout, &stderr, code);
            if looks_like_unauthenticated(&detail) {
                tracing::warn!(
                    login = %login,
                    code = ?code,
                    detail = %detail,
                    "account-scoped gh API call unauthenticated"
                );
                return Ok(None);
            }

            tracing::warn!(
                login = %login,
                code = ?code,
                detail = %detail,
                "account-scoped gh API call failed"
            );
            return Err(anyhow!("GitHub CLI API call failed for {login}: {detail}"));
        }
        Err(GhCommandError::Other(message)) => {
            tracing::warn!(
                login = %login,
                error = %message,
                "account-scoped gh API call failed (IO error)"
            );
            return Err(anyhow!("GitHub CLI API call failed for {login}: {message}"));
        }
    };

    serde_json::from_str::<T>(&output.stdout)
        .with_context(|| {
            format!("Failed to decode GitHub CLI API response for {context} as {login}")
        })
        .map(Some)
}

pub fn resolve_github_login_for_repo(owner: &str, name: &str) -> Result<Option<String>> {
    let cache_key = format!(
        "{}/{}",
        owner.to_ascii_lowercase(),
        name.to_ascii_lowercase()
    );
    let now = Instant::now();
    if let Some(login) = GITHUB_REPO_LOGIN_CACHE
        .lock()
        .ok()
        .and_then(|cache| cache.get(&cache_key).cloned())
        .filter(|cached| cached.expires_at > now)
        .map(|cached| cached.login)
    {
        return Ok(Some(login));
    }

    let mut accounts = list_github_cli_accounts()?;
    accounts.sort_by_key(|account| !account.active);
    for account in accounts {
        if github_repo_accessible_for_login(&account.login, owner, name)? {
            if let Ok(mut cache) = GITHUB_REPO_LOGIN_CACHE.lock() {
                cache.insert(
                    cache_key,
                    CachedRepoLogin {
                        login: account.login.clone(),
                        expires_at: now + GITHUB_REPO_LOGIN_CACHE_TTL,
                    },
                );
            }
            return Ok(Some(account.login));
        }
    }

    Ok(None)
}

pub fn logout_github_cli() -> Result<()> {
    let status = get_github_cli_status()?;
    let GithubCliStatus::Ready { login, .. } = status else {
        return Ok(());
    };

    match SystemGhRunner.run([
        "auth",
        "logout",
        "--hostname",
        GITHUB_HOST,
        "--user",
        &login,
    ]) {
        Ok(_) => {
            status_cache::refresh_cached(&SYSTEM_GH_STATUS_CACHE, GITHUB_HOST, || {
                get_github_cli_status_with(&SystemGhRunner)
            })?;
            Ok(())
        }
        Err(GhCommandError::NotFound) => Ok(()),
        Err(GhCommandError::Failed {
            stdout,
            stderr,
            code,
        }) => {
            let detail = command_error_detail(&stdout, &stderr, code);
            if looks_like_unauthenticated(&detail) {
                return Ok(());
            }
            Err(anyhow!("GitHub CLI logout failed: {detail}"))
        }
        Err(GhCommandError::Other(message)) => Err(anyhow!("GitHub CLI logout failed: {message}")),
    }
}

fn get_github_cli_status_with(runner: &impl GhCommandRunner) -> Result<GithubCliStatus> {
    tracing::debug!(host = GITHUB_HOST, "Checking GitHub CLI status");
    let version = match runner.run(["--version"]) {
        Ok(output) => Some(parse_gh_version(&output.stdout)),
        Err(GhCommandError::NotFound) => {
            tracing::warn!(host = GITHUB_HOST, "GitHub CLI binary not found");
            return Ok(GithubCliStatus::Unavailable {
                host: GITHUB_HOST.to_string(),
                message: "GitHub CLI is not installed on this machine.".to_string(),
            });
        }
        Err(GhCommandError::Failed {
            stdout,
            stderr,
            code,
        }) => {
            let detail = command_error_detail(&stdout, &stderr, code);
            tracing::warn!(
                host = GITHUB_HOST,
                code = ?code,
                detail = %detail,
                "GitHub CLI version probe exited non-zero"
            );
            return Ok(GithubCliStatus::Error {
                host: GITHUB_HOST.to_string(),
                version: None,
                message: format!("Unable to read GitHub CLI version: {detail}"),
            });
        }
        Err(GhCommandError::Other(message)) => {
            tracing::warn!(
                host = GITHUB_HOST,
                error = %message,
                "GitHub CLI version probe failed (IO error)"
            );
            return Ok(GithubCliStatus::Error {
                host: GITHUB_HOST.to_string(),
                version: None,
                message: format!("Unable to read GitHub CLI version: {message}"),
            });
        }
    };

    let auth_output = match runner.run([
        "auth",
        "status",
        "--hostname",
        GITHUB_HOST,
        "--json",
        "hosts",
    ]) {
        Ok(output) => output,
        Err(GhCommandError::NotFound) => {
            tracing::warn!(
                host = GITHUB_HOST,
                "GitHub CLI binary disappeared between probes"
            );
            return Ok(GithubCliStatus::Unavailable {
                host: GITHUB_HOST.to_string(),
                message: "GitHub CLI is not installed on this machine.".to_string(),
            });
        }
        Err(GhCommandError::Failed {
            stdout,
            stderr,
            code,
        }) => {
            let detail = command_error_detail(&stdout, &stderr, code);
            if looks_like_unauthenticated(&detail) {
                tracing::warn!(
                    host = GITHUB_HOST,
                    code = ?code,
                    detail = %detail,
                    "GitHub CLI unauthenticated"
                );
                return Ok(GithubCliStatus::Unauthenticated {
                    host: GITHUB_HOST.to_string(),
                    version,
                    message: "Run `gh auth login` to connect GitHub CLI.".to_string(),
                });
            }

            tracing::warn!(
                host = GITHUB_HOST,
                code = ?code,
                detail = %detail,
                "GitHub CLI auth check failed (transient or unknown)"
            );
            return Ok(GithubCliStatus::Error {
                host: GITHUB_HOST.to_string(),
                version,
                message: format!("GitHub CLI auth check failed: {detail}"),
            });
        }
        Err(GhCommandError::Other(message)) => {
            tracing::warn!(
                host = GITHUB_HOST,
                error = %message,
                "GitHub CLI auth check failed (IO error)"
            );
            return Ok(GithubCliStatus::Error {
                host: GITHUB_HOST.to_string(),
                version,
                message: format!("GitHub CLI auth check failed: {message}"),
            });
        }
    };

    let parsed =
        serde_json::from_str::<GhAuthStatusResponse>(&auth_output.stdout).map_err(|err| {
            tracing::error!(
                stdout = %auth_output.stdout,
                "Failed to decode `gh auth status --json hosts` output"
            );
            anyhow!("Failed to decode GitHub CLI auth status: {err}")
        })?;
    let host_entry = parsed
        .hosts
        .get(GITHUB_HOST)
        .and_then(|entries| {
            entries
                .iter()
                .find(|entry| entry.active.unwrap_or(false))
                .or_else(|| entries.first())
        })
        .cloned()
        .context("GitHub CLI did not return auth status for github.com")?;

    let host = host_entry.host.unwrap_or_else(|| GITHUB_HOST.to_string());
    let login = host_entry.login.unwrap_or_default();

    if host_entry.state.as_deref() != Some("success") || login.trim().is_empty() {
        tracing::warn!(
            host = %host,
            state = ?host_entry.state,
            login_blank = login.trim().is_empty(),
            "GitHub CLI auth status JSON missing success/login"
        );
        return Ok(GithubCliStatus::Unauthenticated {
            host,
            version,
            message: "Run `gh auth login` to connect GitHub CLI.".to_string(),
        });
    }

    tracing::debug!(host = %host, login = %login, "GitHub CLI authenticated");
    Ok(GithubCliStatus::Ready {
        host,
        login: login.clone(),
        version: version.unwrap_or_else(|| "unknown".to_string()),
        message: format!("GitHub CLI ready as {login}."),
    })
}

#[cfg(test)]
fn get_github_cli_user_with(runner: &impl GhCommandRunner) -> Result<Option<GithubCliUser>> {
    let status = get_github_cli_status_with(runner)?;
    get_github_cli_user_with_status(runner, &status)
}

fn get_github_cli_user_with_status(
    runner: &impl GhCommandRunner,
    status: &GithubCliStatus,
) -> Result<Option<GithubCliUser>> {
    if !github_cli_is_ready(status) {
        return Ok(None);
    }

    let output = match runner.run(["api", "/user"]) {
        Ok(output) => output,
        Err(GhCommandError::NotFound) => {
            tracing::warn!("gh binary missing during /user lookup");
            return Ok(None);
        }
        Err(GhCommandError::Failed {
            stdout,
            stderr,
            code,
        }) => {
            let detail = command_error_detail(&stdout, &stderr, code);
            if looks_like_unauthenticated(&detail) {
                tracing::warn!(code = ?code, detail = %detail, "gh /user unauthenticated");
                return Ok(None);
            }

            tracing::warn!(code = ?code, detail = %detail, "gh /user lookup failed");
            return Err(anyhow!("GitHub CLI user lookup failed: {detail}"));
        }
        Err(GhCommandError::Other(message)) => {
            tracing::warn!(error = %message, "gh /user lookup failed (IO error)");
            return Err(anyhow!("GitHub CLI user lookup failed: {message}"));
        }
    };

    let parsed = serde_json::from_str::<GithubApiUser>(&output.stdout)
        .context("Failed to decode GitHub CLI /user response")?;

    Ok(Some(GithubCliUser {
        login: parsed.login,
        id: parsed.id,
        name: parsed.name,
        avatar_url: parsed.avatar_url,
        email: parsed.email,
    }))
}

#[cfg(test)]
fn list_github_cli_accounts_with(runner: &impl GhCommandRunner) -> Result<Vec<GithubCliAccount>> {
    let status = get_github_cli_status_with(runner)?;
    list_github_cli_accounts_with_status(runner, &status)
}

fn list_github_cli_accounts_with_status(
    runner: &impl GhCommandRunner,
    status: &GithubCliStatus,
) -> Result<Vec<GithubCliAccount>> {
    let GithubCliStatus::Ready {
        login: active_login,
        ..
    } = status
    else {
        return Ok(Vec::new());
    };

    let entries = authenticated_host_entries(runner)?;
    let mut accounts = Vec::new();
    for entry in entries {
        let Some(login) = entry
            .login
            .as_deref()
            .map(str::trim)
            .filter(|login| !login.is_empty())
        else {
            continue;
        };
        if accounts
            .iter()
            .any(|account: &GithubCliAccount| account.login.eq_ignore_ascii_case(login))
        {
            continue;
        }

        let user = match github_public_user(runner, login) {
            Ok(user) => user,
            Err(error) => {
                tracing::debug!(
                    login = %login,
                    error = %format!("{error:#}"),
                    "GitHub CLI account profile lookup failed; using login-only account"
                );
                None
            }
        };
        accounts.push(GithubCliAccount {
            active: entry.active.unwrap_or(false) || login.eq_ignore_ascii_case(active_login),
            login: user
                .as_ref()
                .map(|user| user.login.clone())
                .unwrap_or_else(|| login.to_string()),
            id: user
                .as_ref()
                .map(|user| user.id)
                .unwrap_or_else(|| synthetic_github_user_id(login)),
            name: user.as_ref().and_then(|user| user.name.clone()),
            avatar_url: user.as_ref().and_then(|user| user.avatar_url.clone()),
            email: user.and_then(|user| user.email),
        });
    }

    Ok(accounts)
}

fn switch_github_cli_account_with(
    runner: &impl GhCommandRunner,
    github_user_id: i64,
) -> Result<()> {
    let status = get_github_cli_status_with(runner)?;
    if !github_cli_is_ready(&status) {
        return Err(anyhow!("GitHub CLI is not authenticated."));
    }

    let account = list_github_cli_accounts_with_status(runner, &status)?
        .into_iter()
        .find(|account| account.id == github_user_id)
        .with_context(|| format!("GitHub account {github_user_id} is not authenticated in gh."))?;

    match runner.run([
        "auth",
        "switch",
        "--hostname",
        GITHUB_HOST,
        "--user",
        &account.login,
    ]) {
        Ok(_) => Ok(()),
        Err(GhCommandError::NotFound) => Err(anyhow!("GitHub CLI is not installed.")),
        Err(GhCommandError::Failed {
            stdout,
            stderr,
            code,
        }) => Err(anyhow!(
            "GitHub CLI account switch failed: {}",
            command_error_detail(&stdout, &stderr, code)
        )),
        Err(GhCommandError::Other(message)) => {
            Err(anyhow!("GitHub CLI account switch failed: {message}"))
        }
    }
}

#[cfg(test)]
fn list_github_accessible_repositories_with(
    runner: &impl GhCommandRunner,
) -> Result<Vec<GithubRepositorySummary>> {
    let status = get_github_cli_status_with(runner)?;
    list_github_accessible_repositories_with_status(runner, &status)
}

fn list_github_accessible_repositories_with_status(
    runner: &impl GhCommandRunner,
    status: &GithubCliStatus,
) -> Result<Vec<GithubRepositorySummary>> {
    if !github_cli_is_ready(status) {
        return Ok(Vec::new());
    }

    let output = match runner.run(["api", GITHUB_REPOS_ENDPOINT]) {
        Ok(output) => output,
        Err(GhCommandError::NotFound) => {
            tracing::warn!("gh binary missing during /user/repos lookup");
            return Ok(Vec::new());
        }
        Err(GhCommandError::Failed {
            stdout,
            stderr,
            code,
        }) => {
            let detail = command_error_detail(&stdout, &stderr, code);
            if looks_like_unauthenticated(&detail) {
                tracing::warn!(code = ?code, detail = %detail, "gh /user/repos unauthenticated");
                return Ok(Vec::new());
            }

            tracing::warn!(code = ?code, detail = %detail, "gh /user/repos lookup failed");
            return Err(anyhow!("GitHub CLI repository lookup failed: {detail}"));
        }
        Err(GhCommandError::Other(message)) => {
            tracing::warn!(error = %message, "gh /user/repos lookup failed (IO error)");
            return Err(anyhow!("GitHub CLI repository lookup failed: {message}"));
        }
    };

    let parsed = serde_json::from_str::<Vec<GithubApiRepository>>(&output.stdout)
        .context("Failed to decode GitHub CLI /user/repos response")?;

    Ok(parsed
        .into_iter()
        .map(|repository| GithubRepositorySummary {
            id: repository.id,
            name: repository.name,
            full_name: repository.full_name,
            owner_login: repository.owner.login,
            private: repository.private,
            default_branch: repository.default_branch,
            html_url: repository.html_url,
            updated_at: repository.updated_at,
            pushed_at: repository.pushed_at,
        })
        .collect())
}

fn list_github_accessible_repositories_for_login(
    login: &str,
) -> Result<Vec<GithubRepositorySummary>> {
    let output = match run_gh_api_for_login(login, vec![GITHUB_REPOS_ENDPOINT.to_string()]) {
        Ok(output) => output,
        Err(GhCommandError::NotFound) => {
            tracing::warn!("gh binary missing during account-scoped /user/repos lookup");
            return Ok(Vec::new());
        }
        Err(GhCommandError::Failed {
            stdout,
            stderr,
            code,
        }) => {
            let detail = command_error_detail(&stdout, &stderr, code);
            if looks_like_unauthenticated(&detail) || looks_like_not_found(&detail) {
                tracing::debug!(
                    login = %login,
                    code = ?code,
                    detail = %detail,
                    "account-scoped gh /user/repos unavailable"
                );
                return Ok(Vec::new());
            }

            return Err(anyhow!(
                "GitHub CLI repository lookup failed for {login}: {detail}"
            ));
        }
        Err(GhCommandError::Other(message)) => {
            return Err(anyhow!(
                "GitHub CLI repository lookup failed for {login}: {message}"
            ));
        }
    };

    let parsed = serde_json::from_str::<Vec<GithubApiRepository>>(&output.stdout)
        .with_context(|| format!("Failed to decode GitHub CLI /user/repos response for {login}"))?;

    Ok(parsed
        .into_iter()
        .map(|repository| GithubRepositorySummary {
            id: repository.id,
            name: repository.name,
            full_name: repository.full_name,
            owner_login: repository.owner.login,
            private: repository.private,
            default_branch: repository.default_branch,
            html_url: repository.html_url,
            updated_at: repository.updated_at,
            pushed_at: repository.pushed_at,
        })
        .collect())
}

fn run_gh_api(
    runner: &impl GhCommandRunner,
    args: Vec<String>,
) -> std::result::Result<GhCommandOutput, GhCommandError> {
    let mut command_args = Vec::with_capacity(args.len() + 1);
    command_args.push("api".to_string());
    command_args.extend(args);
    runner.run(command_args)
}

fn run_gh_api_for_login(
    login: &str,
    args: Vec<String>,
) -> std::result::Result<GhCommandOutput, GhCommandError> {
    let token = token_for_login(login)?;
    let mut command_args = Vec::with_capacity(args.len() + 3);
    command_args.push("api".to_string());
    command_args.push("--hostname".to_string());
    command_args.push(GITHUB_HOST.to_string());
    command_args.extend(args);

    let output = run_command_with_env("gh", command_args, &[("GH_TOKEN", token.as_str())])
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                GhCommandError::NotFound
            } else {
                GhCommandError::Other(error.to_string())
            }
        })?;

    if output.success {
        return Ok(GhCommandOutput {
            stdout: output.stdout,
        });
    }

    Err(GhCommandError::Failed {
        stdout: output.stdout,
        stderr: output.stderr,
        code: output.status,
    })
}

fn token_for_login(login: &str) -> std::result::Result<String, GhCommandError> {
    let output =
        SystemGhRunner.run(["auth", "token", "--hostname", GITHUB_HOST, "--user", login])?;
    let token = output.stdout.trim();
    if token.is_empty() {
        return Err(GhCommandError::Other(format!(
            "GitHub CLI returned an empty token for {login}"
        )));
    }
    Ok(token.to_string())
}

fn github_repo_accessible_for_login(login: &str, owner: &str, name: &str) -> Result<bool> {
    let endpoint = format!("/repos/{owner}/{name}");
    match run_gh_api_for_login(login, vec![endpoint]) {
        Ok(output) => {
            let repo = serde_json::from_str::<GithubApiRepositoryAccess>(&output.stdout)
                .with_context(|| {
                    format!("Failed to decode GitHub CLI repository access response for {login}")
                })?;
            Ok(repo
                .permissions
                .map(|permissions| permissions.push)
                .unwrap_or(true))
        }
        Err(GhCommandError::Failed {
            stdout,
            stderr,
            code,
        }) => {
            let detail = command_error_detail(&stdout, &stderr, code);
            if looks_like_unauthenticated(&detail) || looks_like_not_found(&detail) {
                tracing::debug!(
                    login = %login,
                    repo = %format!("{owner}/{name}"),
                    detail = %detail,
                    "GitHub repository is not accessible for account"
                );
                return Ok(false);
            }
            Err(anyhow!(
                "GitHub CLI repository access check failed for {login}: {detail}"
            ))
        }
        Err(GhCommandError::NotFound) => Ok(false),
        Err(GhCommandError::Other(message)) => Err(anyhow!(
            "GitHub CLI repository access check failed for {login}: {message}"
        )),
    }
}

fn authenticated_host_entries(runner: &impl GhCommandRunner) -> Result<Vec<GhHostStatusEntry>> {
    let output = match runner.run([
        "auth",
        "status",
        "--hostname",
        GITHUB_HOST,
        "--json",
        "hosts",
    ]) {
        Ok(output) => output,
        Err(GhCommandError::NotFound) => return Ok(Vec::new()),
        Err(GhCommandError::Failed {
            stdout,
            stderr,
            code,
        }) => {
            let detail = command_error_detail(&stdout, &stderr, code);
            if looks_like_unauthenticated(&detail) {
                return Ok(Vec::new());
            }
            return Err(anyhow!("GitHub CLI auth account lookup failed: {detail}"));
        }
        Err(GhCommandError::Other(message)) => {
            return Err(anyhow!("GitHub CLI auth account lookup failed: {message}"));
        }
    };

    let parsed = serde_json::from_str::<GhAuthStatusResponse>(&output.stdout)
        .context("Failed to decode GitHub CLI auth account status")?;

    Ok(parsed
        .hosts
        .get(GITHUB_HOST)
        .into_iter()
        .flat_map(|entries| entries.iter())
        .filter(|entry| entry.state.as_deref() == Some("success"))
        .cloned()
        .collect())
}

fn github_public_user(runner: &impl GhCommandRunner, login: &str) -> Result<Option<GithubCliUser>> {
    let endpoint = format!("/users/{login}");
    let output = match runner.run(["api", endpoint.as_str()]) {
        Ok(output) => output,
        Err(GhCommandError::NotFound) => return Ok(None),
        Err(GhCommandError::Failed {
            stdout,
            stderr,
            code,
        }) => {
            let detail = command_error_detail(&stdout, &stderr, code);
            if looks_like_unauthenticated(&detail) {
                return Ok(None);
            }
            return Err(anyhow!("GitHub CLI public user lookup failed: {detail}"));
        }
        Err(GhCommandError::Other(message)) => {
            return Err(anyhow!("GitHub CLI public user lookup failed: {message}"));
        }
    };

    let parsed = serde_json::from_str::<GithubApiUser>(&output.stdout)
        .with_context(|| format!("Failed to decode GitHub CLI /users/{login} response"))?;

    Ok(Some(GithubCliUser {
        login: parsed.login,
        id: parsed.id,
        name: parsed.name,
        avatar_url: parsed.avatar_url,
        email: parsed.email,
    }))
}

fn synthetic_github_user_id(login: &str) -> i64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in login.to_ascii_lowercase().bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    (hash & 0x7fff_ffff_ffff_ffff) as i64
}

fn parse_gh_version(stdout: &str) -> String {
    stdout
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(2))
        .unwrap_or("unknown")
        .to_string()
}

fn command_error_detail(stdout: &str, stderr: &str, code: Option<i32>) -> String {
    let trimmed_stderr = stderr.trim();
    if !trimmed_stderr.is_empty() {
        return trimmed_stderr.to_string();
    }

    let trimmed_stdout = stdout.trim();
    if !trimmed_stdout.is_empty() {
        return trimmed_stdout.to_string();
    }

    match code {
        Some(code) => format!("gh exited with status {code}"),
        None => "gh exited unsuccessfully".to_string(),
    }
}

/// Match `gh` output that conclusively means "no valid auth on file".
/// Avoid bare `401` / `unauthorized` / `unauthenticated` — those leak into
/// transient network errors (e.g. `401 Service Unavailable`,
/// `unauthenticated upstream timeout`) and would flap the UI on a network
/// blip. Mirror the whitelist style used by `looks_like_glab_unauthenticated`.
fn looks_like_unauthenticated(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    normalized.contains("401 unauthorized")
        || normalized.contains("bad credentials")
        || normalized.contains("not logged into")
        || normalized.contains("not logged in")
        || normalized.contains("not authenticated")
        || normalized.contains("authentication failed")
        || normalized.contains("gh auth login")
        || normalized.contains("no token found")
        || normalized.contains("has not been authenticated")
}

fn looks_like_not_found(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    normalized.contains("http 404") || normalized.contains("not found")
}

fn github_cli_is_ready(status: &GithubCliStatus) -> bool {
    matches!(status, GithubCliStatus::Ready { .. })
}

struct SystemGhRunner;

impl GhCommandRunner for SystemGhRunner {
    fn run<I, S>(&self, args: I) -> std::result::Result<GhCommandOutput, GhCommandError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let output = run_command("gh", args).map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                GhCommandError::NotFound
            } else {
                GhCommandError::Other(error.to_string())
            }
        })?;

        if output.success {
            return Ok(GhCommandOutput {
                stdout: output.stdout,
            });
        }

        Err(GhCommandError::Failed {
            stdout: output.stdout,
            stderr: output.stderr,
            code: output.status,
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
struct GhAuthStatusResponse {
    hosts: HashMap<String, Vec<GhHostStatusEntry>>,
}

#[derive(Debug, Clone, Deserialize)]
struct GhHostStatusEntry {
    state: Option<String>,
    active: Option<bool>,
    host: Option<String>,
    login: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubApiUser {
    login: String,
    id: i64,
    name: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubApiRepository {
    id: i64,
    name: String,
    full_name: String,
    private: bool,
    default_branch: Option<String>,
    html_url: String,
    updated_at: Option<String>,
    pushed_at: Option<String>,
    owner: GithubApiRepositoryOwner,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubApiRepositoryOwner {
    login: String,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubApiRepositoryAccess {
    permissions: Option<GithubApiRepositoryPermissions>,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubApiRepositoryPermissions {
    push: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::VecDeque;

    #[derive(Clone)]
    enum MockRunnerResponse {
        Success {
            stdout: String,
            stderr: String,
        },
        NotFound,
        Failed {
            stdout: String,
            stderr: String,
            code: Option<i32>,
        },
        Other(String),
    }

    struct MockGhRunner {
        responses: RefCell<VecDeque<MockRunnerResponse>>,
        calls: RefCell<Vec<Vec<String>>>,
    }

    impl MockGhRunner {
        fn new(responses: impl IntoIterator<Item = MockRunnerResponse>) -> Self {
            Self {
                responses: RefCell::new(responses.into_iter().collect()),
                calls: RefCell::new(Vec::new()),
            }
        }

        fn calls(&self) -> Vec<Vec<String>> {
            self.calls.borrow().clone()
        }
    }

    impl GhCommandRunner for MockGhRunner {
        fn run<I, S>(&self, args: I) -> std::result::Result<GhCommandOutput, GhCommandError>
        where
            I: IntoIterator<Item = S>,
            S: AsRef<OsStr>,
        {
            self.calls.borrow_mut().push(
                args.into_iter()
                    .map(|arg| arg.as_ref().to_string_lossy().to_string())
                    .collect(),
            );
            match self
                .responses
                .borrow_mut()
                .pop_front()
                .expect("mock response should exist")
            {
                MockRunnerResponse::Success { stdout, stderr } => {
                    let _ = stderr;
                    Ok(GhCommandOutput { stdout })
                }
                MockRunnerResponse::NotFound => Err(GhCommandError::NotFound),
                MockRunnerResponse::Failed {
                    stdout,
                    stderr,
                    code,
                } => Err(GhCommandError::Failed {
                    stdout,
                    stderr,
                    code,
                }),
                MockRunnerResponse::Other(message) => Err(GhCommandError::Other(message)),
            }
        }
    }

    #[test]
    fn get_github_cli_status_parses_ready_state() {
        let runner = MockGhRunner::new([
            MockRunnerResponse::Success {
                stdout:
                    "gh version 2.88.1 (2026-03-12)\nhttps://github.com/cli/cli/releases/tag/v2.88.1\n"
                        .to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat"}]}}"#
                    .to_string(),
                stderr: String::new(),
            },
        ]);

        let status = get_github_cli_status_with(&runner).unwrap();

        assert_eq!(
            status,
            GithubCliStatus::Ready {
                host: "github.com".to_string(),
                login: "octocat".to_string(),
                version: "2.88.1".to_string(),
                message: "GitHub CLI ready as octocat.".to_string(),
            }
        );
    }

    #[test]
    fn get_github_cli_status_returns_unavailable_when_gh_is_missing() {
        let runner = MockGhRunner::new([MockRunnerResponse::NotFound]);

        let status = get_github_cli_status_with(&runner).unwrap();

        assert_eq!(
            status,
            GithubCliStatus::Unavailable {
                host: "github.com".to_string(),
                message: "GitHub CLI is not installed on this machine.".to_string(),
            }
        );
    }

    #[test]
    fn get_github_cli_status_returns_unauthenticated_when_gh_is_not_logged_in() {
        let runner = MockGhRunner::new([
            MockRunnerResponse::Success {
                stdout: "gh version 2.88.1 (2026-03-12)\n".to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Failed {
                stdout: String::new(),
                stderr: "You are not logged into any GitHub hosts. To log in, run: gh auth login"
                    .to_string(),
                code: Some(1),
            },
        ]);

        let status = get_github_cli_status_with(&runner).unwrap();

        assert_eq!(
            status,
            GithubCliStatus::Unauthenticated {
                host: "github.com".to_string(),
                version: Some("2.88.1".to_string()),
                message: "Run `gh auth login` to connect GitHub CLI.".to_string(),
            }
        );
    }

    #[test]
    fn get_github_cli_user_parses_user_profile() {
        let runner = MockGhRunner::new([
            MockRunnerResponse::Success {
                stdout: "gh version 2.88.1 (2026-03-12)\n".to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat"}]}}"#
                    .to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"{"login":"octocat","id":0,"name":"Octocat","avatar_url":"https://avatars.githubusercontent.com/u/0?v=4","email":"test@example.com"}"#
                    .to_string(),
                stderr: String::new(),
            },
        ]);

        let user = get_github_cli_user_with(&runner).unwrap();

        assert_eq!(
            user,
            Some(GithubCliUser {
                login: "octocat".to_string(),
                id: 0,
                name: Some("Octocat".to_string()),
                avatar_url: Some("https://avatars.githubusercontent.com/u/0?v=4".to_string()),
                email: Some("test@example.com".to_string()),
            })
        );
    }

    #[test]
    fn list_github_cli_accounts_parses_all_authenticated_accounts() {
        let runner = MockGhRunner::new([
            MockRunnerResponse::Success {
                stdout: "gh version 2.88.1 (2026-03-12)\n".to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat"},{"state":"success","active":false,"host":"github.com","login":"hubot"}]}}"#
                    .to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat"},{"state":"success","active":false,"host":"github.com","login":"hubot"}]}}"#
                    .to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"{"login":"octocat","id":1,"name":"Octocat","avatar_url":"https://avatars.githubusercontent.com/u/1?v=4","email":"octo@example.com"}"#
                    .to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"{"login":"hubot","id":2,"name":"Hubot","avatar_url":"https://avatars.githubusercontent.com/u/2?v=4","email":null}"#
                    .to_string(),
                stderr: String::new(),
            },
        ]);

        let accounts = list_github_cli_accounts_with(&runner).unwrap();

        assert_eq!(
            accounts,
            vec![
                GithubCliAccount {
                    login: "octocat".to_string(),
                    id: 1,
                    name: Some("Octocat".to_string()),
                    avatar_url: Some("https://avatars.githubusercontent.com/u/1?v=4".to_string()),
                    email: Some("octo@example.com".to_string()),
                    active: true,
                },
                GithubCliAccount {
                    login: "hubot".to_string(),
                    id: 2,
                    name: Some("Hubot".to_string()),
                    avatar_url: Some("https://avatars.githubusercontent.com/u/2?v=4".to_string()),
                    email: None,
                    active: false,
                },
            ]
        );
    }

    #[test]
    fn list_github_cli_accounts_falls_back_to_login_when_profile_lookup_fails() {
        let runner = MockGhRunner::new([
            MockRunnerResponse::Success {
                stdout: "gh version 2.88.1 (2026-03-12)\n".to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat"}]}}"#
                    .to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat"}]}}"#
                    .to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Failed {
                stdout: String::new(),
                stderr: "HTTP 401: Bad credentials".to_string(),
                code: Some(1),
            },
        ]);

        let accounts = list_github_cli_accounts_with(&runner).unwrap();

        assert_eq!(
            accounts,
            vec![GithubCliAccount {
                login: "octocat".to_string(),
                id: synthetic_github_user_id("octocat"),
                name: None,
                avatar_url: None,
                email: None,
                active: true,
            }]
        );
    }

    #[test]
    fn switch_github_cli_account_switches_by_resolved_login() {
        let runner = MockGhRunner::new([
            MockRunnerResponse::Success {
                stdout: "gh version 2.88.1 (2026-03-12)\n".to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat"},{"state":"success","active":false,"host":"github.com","login":"hubot"}]}}"#
                    .to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat"},{"state":"success","active":false,"host":"github.com","login":"hubot"}]}}"#
                    .to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"{"login":"octocat","id":1,"name":"Octocat","avatar_url":null,"email":null}"#
                    .to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"{"login":"hubot","id":2,"name":"Hubot","avatar_url":null,"email":null}"#
                    .to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: String::new(),
                stderr: String::new(),
            },
        ]);

        switch_github_cli_account_with(&runner, 2).unwrap();

        assert_eq!(
            runner.calls().last(),
            Some(&vec![
                "auth".to_string(),
                "switch".to_string(),
                "--hostname".to_string(),
                "github.com".to_string(),
                "--user".to_string(),
                "hubot".to_string(),
            ])
        );
    }

    #[test]
    fn list_github_accessible_repositories_parses_repository_list() {
        let runner = MockGhRunner::new([
            MockRunnerResponse::Success {
                stdout: "gh version 2.88.1 (2026-03-12)\n".to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat"}]}}"#
                    .to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Success {
                stdout: r#"[{"id":0,"name":"pathos","full_name":"dohooo/pathos","private":false,"default_branch":"main","html_url":"https://github.com/dohooo/pathos","updated_at":"2026-01-01T00:00:00Z","pushed_at":"2026-01-01T00:00:00Z","owner":{"login":"dohooo"}}]"#
                    .to_string(),
                stderr: String::new(),
            },
        ]);

        let repositories = list_github_accessible_repositories_with(&runner).unwrap();

        assert_eq!(
            repositories,
            vec![GithubRepositorySummary {
                id: 0,
                name: "pathos".to_string(),
                full_name: "dohooo/pathos".to_string(),
                owner_login: "dohooo".to_string(),
                private: false,
                default_branch: Some("main".to_string()),
                html_url: "https://github.com/dohooo/pathos".to_string(),
                updated_at: Some("2026-01-01T00:00:00Z".to_string()),
                pushed_at: Some("2026-01-01T00:00:00Z".to_string()),
            }]
        );
    }

    #[test]
    fn get_github_cli_user_returns_none_when_unauthenticated() {
        let runner = MockGhRunner::new([
            MockRunnerResponse::Success {
                stdout: "gh version 2.88.1 (2026-03-12)\n".to_string(),
                stderr: String::new(),
            },
            MockRunnerResponse::Failed {
                stdout: String::new(),
                stderr: "You are not logged into any GitHub hosts. To log in, run: gh auth login"
                    .to_string(),
                code: Some(1),
            },
        ]);

        let user = get_github_cli_user_with(&runner).unwrap();

        assert_eq!(user, None);
    }

    #[test]
    fn get_github_cli_status_surfaces_version_lookup_errors() {
        let runner =
            MockGhRunner::new([MockRunnerResponse::Other("permission denied".to_string())]);

        let status = get_github_cli_status_with(&runner).unwrap();

        assert_eq!(
            status,
            GithubCliStatus::Error {
                host: "github.com".to_string(),
                version: None,
                message: "Unable to read GitHub CLI version: permission denied".to_string(),
            }
        );
    }

    #[test]
    fn looks_like_unauthenticated_matches_canonical_phrases() {
        assert!(looks_like_unauthenticated(
            "You are not logged into any GitHub hosts. Run gh auth login"
        ));
        assert!(looks_like_unauthenticated("HTTP 401: Bad credentials"));
        assert!(looks_like_unauthenticated("authentication failed"));
        assert!(looks_like_unauthenticated("no token found"));
    }

    #[test]
    fn looks_like_unauthenticated_ignores_transient_network_errors() {
        // 401 codes returned for non-auth reasons (rate limit, service degraded).
        assert!(!looks_like_unauthenticated("401 Service Unavailable"));
        // Bare "unauthenticated" / "unauthorized" must not match — they leak
        // into transient upstream errors.
        assert!(!looks_like_unauthenticated(
            "unauthenticated upstream timeout"
        ));
        assert!(!looks_like_unauthenticated("unauthorized origin: EOF"));
        // DNS / connect failures.
        assert!(!looks_like_unauthenticated(
            "Get \"https://api.github.com\": dial tcp: lookup api.github.com: no such host"
        ));
        assert!(!looks_like_unauthenticated(
            "connection reset by peer while reading response"
        ));
    }
}
