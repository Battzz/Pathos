//! Generic, projectless chats.
//!
//! The persistence model still needs a workspace/session anchor, so generic
//! chats live in one hidden project workspace. The repo row is hidden from
//! normal project listings, and `resolve_workspace_root_path_unchecked`
//! resolves it to the user's home directory so file mentions can point at
//! ordinary files outside an imported project.

use std::path::PathBuf;

use anyhow::{Context, Result};
use rusqlite::OptionalExtension;

use crate::{db, workspace_state::WorkspaceState};

use super::workspaces::RepositoryFolderChat;

pub const GENERIC_CHAT_REPO_ID: &str = "__pathos_generic_chats__";
const GENERIC_CHAT_REPO_NAME: &str = "Chats";

pub fn generic_chat_root_path() -> Result<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .or_else(|| crate::data_dir::data_dir().ok())
        .context("Could not determine a working directory for generic chats")
}

pub fn get_or_create_generic_chat_workspace() -> Result<String> {
    let mut connection = db::write_conn()?;
    let transaction = connection
        .transaction()
        .context("Failed to start generic chat workspace transaction")?;

    transaction
        .execute(
            r#"
            INSERT OR IGNORE INTO repos (
              id,
              name,
              default_branch,
              hidden,
              is_git,
              created_at,
              updated_at
            ) VALUES (?1, ?2, 'main', 1, 1, datetime('now'), datetime('now'))
            "#,
            (GENERIC_CHAT_REPO_ID, GENERIC_CHAT_REPO_NAME),
        )
        .context("Failed to ensure generic chat repository")?;

    let existing: Option<String> = transaction
        .query_row(
            "SELECT id FROM workspaces WHERE repository_id = ?1 AND kind = 'project' LIMIT 1",
            [GENERIC_CHAT_REPO_ID],
            |row| row.get(0),
        )
        .optional()
        .context("Failed to look up generic chat workspace")?;

    if let Some(workspace_id) = existing {
        transaction
            .commit()
            .context("Failed to commit generic chat workspace lookup")?;
        return Ok(workspace_id);
    }

    let workspace_id = uuid::Uuid::new_v4().to_string();
    transaction
        .execute(
            r#"
            INSERT INTO workspaces (
              id,
              repository_id,
              directory_name,
              branch,
              state,
              status,
              kind,
              unread,
              created_at,
              updated_at
            ) VALUES (?1, ?2, '', NULL, ?3, 'in-progress', 'project', 0, datetime('now'), datetime('now'))
            "#,
            rusqlite::params![
                workspace_id,
                GENERIC_CHAT_REPO_ID,
                WorkspaceState::Ready,
            ],
        )
        .context("Failed to create generic chat workspace")?;

    transaction
        .commit()
        .context("Failed to commit generic chat workspace creation")?;
    Ok(workspace_id)
}

pub fn list_generic_chats() -> Result<Vec<RepositoryFolderChat>> {
    let workspace_id = get_or_create_generic_chat_workspace()?;
    let connection = db::read_conn()?;
    let mut stmt = connection
        .prepare(
            r#"
            SELECT
              id,
              workspace_id,
              title,
              agent_type,
              status,
              unread_count,
              pinned_at,
              created_at,
              updated_at,
              last_user_message_at
            FROM sessions
            WHERE workspace_id = ?1
              AND COALESCE(is_hidden, 0) = 0
              AND action_kind IS NULL
            ORDER BY
              CASE WHEN pinned_at IS NULL THEN 1 ELSE 0 END,
              datetime(pinned_at) DESC,
              datetime(COALESCE(last_user_message_at, updated_at, created_at)) DESC,
              datetime(created_at) DESC
            "#,
        )
        .context("Failed to prepare generic chat list query")?;

    let rows = stmt
        .query_map([workspace_id], |row| {
            Ok(RepositoryFolderChat {
                session_id: row.get(0)?,
                workspace_id: row.get(1)?,
                title: row.get(2)?,
                agent_type: row.get(3)?,
                status: row.get(4)?,
                unread_count: row.get(5)?,
                pinned_at: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                last_user_message_at: row.get(9)?,
            })
        })
        .context("Failed to load generic chats")?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(rows)
}
