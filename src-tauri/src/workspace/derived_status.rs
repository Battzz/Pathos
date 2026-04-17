//! Workspace derived-status enum — drives the kanban lanes (Done / In
//! Review / In Progress / Backlog / Canceled) in the sidebar. Stored in
//! `workspaces.derived_status` and optionally overridden by
//! `workspaces.manual_status`.
//!
//! Historical data may carry `"in-review"` or `"cancelled"` (British) — the
//! parser canonicalises both on read. Writers always emit the canonical
//! American form (`"review"`, `"canceled"`).

use std::fmt;
use std::str::FromStr;

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DerivedStatus {
    #[default]
    InProgress,
    Done,
    Review,
    Backlog,
    Canceled,
}

impl DerivedStatus {
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::InProgress => "in-progress",
            Self::Done => "done",
            Self::Review => "review",
            Self::Backlog => "backlog",
            Self::Canceled => "canceled",
        }
    }

    /// Sidebar kanban lane. Note: `InProgress` maps to `"progress"` — the
    /// stored value has a hyphen, the lane id does not.
    pub const fn group_id(&self) -> &'static str {
        match self {
            Self::InProgress => "progress",
            Self::Done => "done",
            Self::Review => "review",
            Self::Backlog => "backlog",
            Self::Canceled => "canceled",
        }
    }

    /// Sort rank: done first, review/progress/backlog next, canceled last.
    pub const fn sort_rank(&self) -> usize {
        match self {
            Self::Done => 0,
            Self::Review => 1,
            Self::InProgress => 2,
            Self::Backlog => 3,
            Self::Canceled => 4,
        }
    }
}

impl fmt::Display for DerivedStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug)]
pub struct UnknownDerivedStatus(pub String);

impl fmt::Display for UnknownDerivedStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "unknown workspace derived_status: {:?}", self.0)
    }
}

impl std::error::Error for UnknownDerivedStatus {}

impl FromStr for DerivedStatus {
    type Err = UnknownDerivedStatus;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_ascii_lowercase().as_str() {
            "in-progress" => Ok(Self::InProgress),
            "done" => Ok(Self::Done),
            "review" | "in-review" => Ok(Self::Review),
            "backlog" => Ok(Self::Backlog),
            "canceled" | "cancelled" => Ok(Self::Canceled),
            _ => Err(UnknownDerivedStatus(s.to_string())),
        }
    }
}

impl FromSql for DerivedStatus {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        let s = value.as_str()?;
        s.parse()
            .map_err(|e: UnknownDerivedStatus| FromSqlError::Other(Box::new(e)))
    }
}

impl ToSql for DerivedStatus {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::Borrowed(ValueRef::Text(
            self.as_str().as_bytes(),
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_spellings_canonicalise() {
        assert_eq!(
            DerivedStatus::from_str("in-review").unwrap(),
            DerivedStatus::Review
        );
        assert_eq!(
            DerivedStatus::from_str("cancelled").unwrap(),
            DerivedStatus::Canceled
        );
        assert_eq!(
            DerivedStatus::from_str("CANCELED").unwrap(),
            DerivedStatus::Canceled
        );
        assert_eq!(
            DerivedStatus::from_str(" done ").unwrap(),
            DerivedStatus::Done
        );
    }

    #[test]
    fn round_trips_canonical_form() {
        for s in [
            DerivedStatus::InProgress,
            DerivedStatus::Done,
            DerivedStatus::Review,
            DerivedStatus::Backlog,
            DerivedStatus::Canceled,
        ] {
            assert_eq!(DerivedStatus::from_str(s.as_str()).unwrap(), s);
        }
    }

    #[test]
    fn json_serializes_to_kebab_case_literals() {
        assert_eq!(
            serde_json::to_string(&DerivedStatus::InProgress).unwrap(),
            "\"in-progress\""
        );
        assert_eq!(
            serde_json::to_string(&DerivedStatus::Done).unwrap(),
            "\"done\""
        );
        assert_eq!(
            serde_json::to_string(&DerivedStatus::Review).unwrap(),
            "\"review\""
        );
        assert_eq!(
            serde_json::to_string(&DerivedStatus::Backlog).unwrap(),
            "\"backlog\""
        );
        assert_eq!(
            serde_json::to_string(&DerivedStatus::Canceled).unwrap(),
            "\"canceled\""
        );
    }

    #[test]
    fn group_id_differs_from_stored_str() {
        // Only deviation from `as_str` is InProgress → "progress".
        assert_eq!(DerivedStatus::InProgress.group_id(), "progress");
        assert_ne!(
            DerivedStatus::InProgress.as_str(),
            DerivedStatus::InProgress.group_id()
        );
    }
}
