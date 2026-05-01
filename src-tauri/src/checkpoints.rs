use std::{
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
};

use anyhow::{bail, Context, Result};
use rusqlite::OptionalExtension;

const CHECKPOINT_REF_PREFIX: &str = "refs/pathos/checkpoints";

pub fn capture_user_message_checkpoint(
    workspace_dir: &Path,
    session_id: &str,
    message_id: &str,
) -> Result<bool> {
    if !is_git_repository(workspace_dir)? {
        return Ok(false);
    }

    let checkpoint_ref = checkpoint_ref(session_id, message_id);
    let temp_dir = TempCheckpointDir::new()?;
    let index_path = temp_dir.path.join("index");
    let git_env = checkpoint_git_env(&index_path);

    if has_head_commit(workspace_dir)? {
        run_git_with_env(workspace_dir, ["read-tree", "HEAD"], &git_env)?;
    }

    run_git_with_env(workspace_dir, ["add", "-A", "--", "."], &git_env)?;
    let tree_oid = run_git_with_env(workspace_dir, ["write-tree"], &git_env)?;
    if tree_oid.is_empty() {
        bail!("git write-tree returned an empty tree id");
    }

    let message = format!("pathos checkpoint session={session_id} message={message_id}");
    let commit_oid = run_git_with_env(
        workspace_dir,
        ["commit-tree", tree_oid.as_str(), "-m", message.as_str()],
        &git_env,
    )?;
    if commit_oid.is_empty() {
        bail!("git commit-tree returned an empty commit id");
    }

    run_git(
        workspace_dir,
        ["update-ref", checkpoint_ref.as_str(), commit_oid.as_str()],
    )?;
    Ok(true)
}

pub fn restore_user_message_checkpoint(
    session_id: &str,
    message_id: &str,
    include_selected: bool,
) -> Result<Option<bool>> {
    if !include_selected {
        return Ok(None);
    }

    let Some(workspace_dir) = resolve_session_workspace_dir(session_id)? else {
        return Ok(None);
    };
    if !is_git_repository(&workspace_dir)? {
        return Ok(None);
    }

    let checkpoint_ref = checkpoint_ref(session_id, message_id);
    let fallback_to_head = is_first_user_message(session_id, message_id)?;
    let restored = restore_checkpoint(&workspace_dir, &checkpoint_ref, fallback_to_head)?;
    Ok(Some(restored))
}

pub fn delete_user_message_checkpoints(
    session_id: &str,
    message_ids: impl IntoIterator<Item = String>,
) -> Result<()> {
    let Some(workspace_dir) = resolve_session_workspace_dir(session_id)? else {
        return Ok(());
    };
    if !is_git_repository(&workspace_dir)? {
        return Ok(());
    }

    for message_id in message_ids {
        let checkpoint_ref = checkpoint_ref(session_id, &message_id);
        let _ = run_git_allow_failure(
            &workspace_dir,
            ["update-ref", "-d", checkpoint_ref.as_str()],
        )?;
    }

    Ok(())
}

pub fn user_message_ids_for_truncation(
    session_id: &str,
    message_id: &str,
    include_selected: bool,
) -> Result<Vec<String>> {
    let connection = crate::models::db::read_conn()?;
    let selected_rowid: i64 = connection
        .query_row(
            "SELECT rowid FROM session_messages WHERE session_id = ?1 AND id = ?2",
            rusqlite::params![session_id, message_id],
            |row| row.get(0),
        )
        .with_context(|| format!("Failed to find message {message_id} in session {session_id}"))?;
    let comparator = if include_selected { ">=" } else { ">" };
    let mut statement = connection
        .prepare(&format!(
            "SELECT id FROM session_messages WHERE session_id = ?1 AND rowid {comparator} ?2 AND role = 'user' ORDER BY rowid ASC"
        ))
        .context("Failed to prepare checkpoint cleanup query")?;
    let rows = statement
        .query_map(rusqlite::params![session_id, selected_rowid], |row| {
            row.get::<_, String>(0)
        })
        .context("Failed to query checkpoint cleanup messages")?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .context("Failed to collect checkpoint cleanup messages")
}

fn restore_checkpoint(
    workspace_dir: &Path,
    checkpoint_ref: &str,
    fallback_to_head: bool,
) -> Result<bool> {
    let mut commit_oid = resolve_commit(workspace_dir, checkpoint_ref)?;
    if commit_oid.is_none() && fallback_to_head {
        commit_oid = resolve_commit(workspace_dir, "HEAD")?;
    }
    let Some(commit_oid) = commit_oid else {
        return Ok(false);
    };

    run_git(
        workspace_dir,
        [
            "restore",
            "--source",
            commit_oid.as_str(),
            "--worktree",
            "--staged",
            "--",
            ".",
        ],
    )?;
    run_git(workspace_dir, ["clean", "-fd", "--", "."])?;
    if has_head_commit(workspace_dir)? {
        run_git(workspace_dir, ["reset", "--quiet", "--", "."])?;
    }
    Ok(true)
}

fn resolve_session_workspace_dir(session_id: &str) -> Result<Option<PathBuf>> {
    let connection = crate::models::db::read_conn()
        .context("Failed to open DB while resolving checkpoint workspace")?;
    let workspace_info: Option<(String, String, String, Option<String>)> = connection
        .query_row(
            r#"SELECT r.name, w.directory_name, COALESCE(w.kind, 'workspace'), r.root_path
               FROM sessions s
               JOIN workspaces w ON w.id = s.workspace_id
               JOIN repos r ON r.id = w.repository_id
               WHERE s.id = ?1"#,
            [session_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            },
        )
        .optional()
        .context("Failed to load checkpoint workspace info")?;

    let Some((repo_name, directory_name, kind, root_path)) = workspace_info else {
        return Ok(None);
    };

    if kind == "project" {
        return Ok(root_path.map(PathBuf::from).filter(|path| path.is_dir()));
    }

    let workspace_dir = crate::data_dir::workspace_dir(&repo_name, &directory_name)?;
    Ok(workspace_dir.is_dir().then_some(workspace_dir))
}

fn is_first_user_message(session_id: &str, message_id: &str) -> Result<bool> {
    let connection = crate::models::db::read_conn()?;
    let selected_rowid: i64 = connection
        .query_row(
            "SELECT rowid FROM session_messages WHERE session_id = ?1 AND id = ?2",
            rusqlite::params![session_id, message_id],
            |row| row.get(0),
        )
        .with_context(|| format!("Failed to find message {message_id} in session {session_id}"))?;
    let prior_user_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM session_messages WHERE session_id = ?1 AND rowid < ?2 AND role = 'user'",
            rusqlite::params![session_id, selected_rowid],
            |row| row.get(0),
        )
        .context("Failed to count prior user messages")?;
    Ok(prior_user_count == 0)
}

fn checkpoint_ref(session_id: &str, message_id: &str) -> String {
    format!(
        "{}/{}/{}",
        CHECKPOINT_REF_PREFIX,
        sanitize_ref_component(session_id),
        sanitize_ref_component(message_id),
    )
}

fn sanitize_ref_component(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' => ch,
            _ => '_',
        })
        .collect()
}

fn checkpoint_git_env(index_path: &Path) -> Vec<(String, String)> {
    vec![
        (
            "GIT_INDEX_FILE".to_string(),
            index_path.display().to_string(),
        ),
        ("GIT_AUTHOR_NAME".to_string(), "Pathos".to_string()),
        (
            "GIT_AUTHOR_EMAIL".to_string(),
            "pathos@users.noreply.github.com".to_string(),
        ),
        ("GIT_COMMITTER_NAME".to_string(), "Pathos".to_string()),
        (
            "GIT_COMMITTER_EMAIL".to_string(),
            "pathos@users.noreply.github.com".to_string(),
        ),
    ]
}

fn is_git_repository(workspace_dir: &Path) -> Result<bool> {
    let output = run_git_allow_failure(workspace_dir, ["rev-parse", "--is-inside-work-tree"])?;
    Ok(output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "true")
}

fn has_head_commit(workspace_dir: &Path) -> Result<bool> {
    Ok(resolve_commit(workspace_dir, "HEAD")?.is_some())
}

fn resolve_commit(workspace_dir: &Path, value: &str) -> Result<Option<String>> {
    let target = format!("{value}^{{commit}}");
    let output = run_git_allow_failure(
        workspace_dir,
        ["rev-parse", "--verify", "--quiet", target.as_str()],
    )?;
    if !output.status.success() {
        return Ok(None);
    }
    let commit = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!commit.is_empty()).then_some(commit))
}

fn run_git<I, S>(workspace_dir: &Path, args: I) -> Result<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    handle_git_output(
        git_command(workspace_dir, args)
            .output()
            .context("Failed to run git")?,
    )
}

fn run_git_with_env<I, S>(workspace_dir: &Path, args: I, env: &[(String, String)]) -> Result<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = git_command(workspace_dir, args);
    for (key, value) in env {
        command.env(key, value);
    }
    handle_git_output(command.output().context("Failed to run git")?)
}

fn run_git_allow_failure<I, S>(workspace_dir: &Path, args: I) -> Result<Output>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    git_command(workspace_dir, args)
        .output()
        .context("Failed to run git")
}

fn git_command<I, S>(workspace_dir: &Path, args: I) -> Command
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = Command::new("git");
    command.arg("-C").arg(workspace_dir);
    for arg in args {
        command.arg(arg.as_ref());
    }
    command
}

fn handle_git_output(output: Output) -> Result<String> {
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("git exited with status {}", output.status)
    };
    bail!(detail)
}

struct TempCheckpointDir {
    path: PathBuf,
}

impl TempCheckpointDir {
    fn new() -> Result<Self> {
        let path = std::env::temp_dir().join(format!("pathos-checkpoint-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).context("Failed to create checkpoint temp directory")?;
        Ok(Self { path })
    }
}

impl Drop for TempCheckpointDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn run_git_test<I, S>(workspace_dir: &Path, args: I)
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        run_git(workspace_dir, args).unwrap();
    }

    fn init_repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        run_git_test(dir.path(), ["init", "-b", "main"]);
        run_git_test(dir.path(), ["config", "user.name", "Pathos Test"]);
        run_git_test(
            dir.path(),
            ["config", "user.email", "pathos-test@example.invalid"],
        );
        fs::write(dir.path().join("tracked.txt"), "base\n").unwrap();
        run_git_test(dir.path(), ["add", "tracked.txt"]);
        run_git_test(dir.path(), ["commit", "-m", "base"]);
        dir
    }

    #[test]
    fn capture_and_restore_checkpoint_restores_worktree_state() {
        let dir = init_repo();
        fs::write(dir.path().join("tracked.txt"), "before\n").unwrap();
        fs::write(dir.path().join("scratch.txt"), "scratch\n").unwrap();

        assert!(capture_user_message_checkpoint(dir.path(), "session-1", "message-1").unwrap());

        fs::write(dir.path().join("tracked.txt"), "after\n").unwrap();
        fs::remove_file(dir.path().join("scratch.txt")).unwrap();
        fs::write(dir.path().join("new.txt"), "new\n").unwrap();

        assert!(
            restore_checkpoint(dir.path(), &checkpoint_ref("session-1", "message-1"), false,)
                .unwrap()
        );

        assert_eq!(
            fs::read_to_string(dir.path().join("tracked.txt")).unwrap(),
            "before\n"
        );
        assert_eq!(
            fs::read_to_string(dir.path().join("scratch.txt")).unwrap(),
            "scratch\n"
        );
        assert!(!dir.path().join("new.txt").exists());
    }

    #[test]
    fn restore_checkpoint_can_fallback_to_head() {
        let dir = init_repo();
        fs::write(dir.path().join("tracked.txt"), "dirty\n").unwrap();
        fs::write(dir.path().join("new.txt"), "new\n").unwrap();

        assert!(restore_checkpoint(dir.path(), "refs/pathos/checkpoints/missing", true,).unwrap());

        assert_eq!(
            fs::read_to_string(dir.path().join("tracked.txt")).unwrap(),
            "base\n"
        );
        assert!(!dir.path().join("new.txt").exists());
    }

    #[test]
    fn restore_user_message_checkpoint_resolves_session_workspace() {
        let data_dir = tempfile::tempdir().unwrap();
        let repo_dir = init_repo();
        let _guard = crate::data_dir::TEST_ENV_LOCK.lock().unwrap();
        std::env::set_var("PATHOS_DATA_DIR", data_dir.path());

        let db_path = crate::data_dir::db_path().unwrap();
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        crate::schema::ensure_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO repos (id, name, root_path) VALUES ('r1', 'repo', ?1)",
            [repo_dir.path().display().to_string()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO workspaces (id, repository_id, directory_name, kind, state) VALUES ('w1', 'r1', '', 'project', 'ready')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sessions (id, workspace_id, status) VALUES ('s1', 'w1', 'idle')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO session_messages (id, session_id, role, content) VALUES ('m1', 's1', 'user', '{}')",
            [],
        )
        .unwrap();

        fs::write(repo_dir.path().join("tracked.txt"), "before\n").unwrap();
        capture_user_message_checkpoint(repo_dir.path(), "s1", "m1").unwrap();
        fs::write(repo_dir.path().join("tracked.txt"), "after\n").unwrap();

        let restored = restore_user_message_checkpoint("s1", "m1", true).unwrap();

        assert_eq!(restored, Some(true));
        assert_eq!(
            fs::read_to_string(repo_dir.path().join("tracked.txt")).unwrap(),
            "before\n"
        );

        std::env::remove_var("PATHOS_DATA_DIR");
    }
}
