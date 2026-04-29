//! Workspace kind enum — distinguishes the imported folder itself
//! (`project`) from a branched git worktree (`workspace`). Mirrors the
//! `workspaces.kind` column.
//!
//! - `project`: one per repo, auto-created lazily when the user starts
//!   their first chat in that repo. Sessions in a project workspace
//!   render as "chats" in the sidebar. The agent operates on the
//!   imported folder directly — there is no separate worktree.
//! - `workspace`: a branched git worktree under the helmor data dir.
//!   Only available for git-backed repos. Renders as a "workspace"
//!   row in the sidebar with branch / PR sync / archive affordances.

use std::fmt;
use std::str::FromStr;

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceKind {
    Project,
    Workspace,
}

impl WorkspaceKind {
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Project => "project",
            Self::Workspace => "workspace",
        }
    }
}

impl fmt::Display for WorkspaceKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug)]
pub struct UnknownWorkspaceKind(pub String);

impl fmt::Display for UnknownWorkspaceKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "unknown workspace kind: {:?}", self.0)
    }
}

impl std::error::Error for UnknownWorkspaceKind {}

impl FromStr for WorkspaceKind {
    type Err = UnknownWorkspaceKind;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "project" => Ok(Self::Project),
            "workspace" => Ok(Self::Workspace),
            other => Err(UnknownWorkspaceKind(other.to_string())),
        }
    }
}

impl FromSql for WorkspaceKind {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        let s = value.as_str()?;
        s.parse()
            .map_err(|e: UnknownWorkspaceKind| FromSqlError::Other(Box::new(e)))
    }
}

impl ToSql for WorkspaceKind {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::Borrowed(ValueRef::Text(
            self.as_str().as_bytes(),
        )))
    }
}
