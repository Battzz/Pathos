use std::{
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;

const FIXTURE_BASE_DIR: &str = ".local-data/conductor";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConductorFixtureInfo {
    pub data_mode: String,
    pub fixture_root: String,
    pub db_path: String,
    pub archive_root: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSidebarRow {
    pub id: String,
    pub title: String,
    pub avatar: String,
    pub active: bool,
    pub directory_name: String,
    pub repo_name: String,
    pub state: String,
    pub derived_status: String,
    pub manual_status: Option<String>,
    pub branch: Option<String>,
    pub active_session_id: Option<String>,
    pub active_session_title: Option<String>,
    pub active_session_agent_type: Option<String>,
    pub active_session_status: Option<String>,
    pub pr_title: Option<String>,
    pub session_count: i64,
    pub message_count: i64,
    pub attachment_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSidebarGroup {
    pub id: String,
    pub label: String,
    pub tone: String,
    pub rows: Vec<WorkspaceSidebarRow>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub id: String,
    pub title: String,
    pub directory_name: String,
    pub repo_name: String,
    pub state: String,
    pub derived_status: String,
    pub manual_status: Option<String>,
    pub active: bool,
    pub branch: Option<String>,
    pub active_session_id: Option<String>,
    pub active_session_title: Option<String>,
    pub active_session_agent_type: Option<String>,
    pub active_session_status: Option<String>,
    pub pr_title: Option<String>,
    pub session_count: i64,
    pub message_count: i64,
    pub attachment_count: i64,
}

#[derive(Debug)]
struct WorkspaceRecord {
    id: String,
    repo_name: String,
    directory_name: String,
    state: String,
    derived_status: String,
    manual_status: Option<String>,
    branch: Option<String>,
    active_session_id: Option<String>,
    active_session_title: Option<String>,
    active_session_agent_type: Option<String>,
    active_session_status: Option<String>,
    pr_title: Option<String>,
    session_count: i64,
    message_count: i64,
    attachment_count: i64,
}

#[tauri::command]
pub fn get_conductor_fixture_info() -> Result<ConductorFixtureInfo, String> {
    let fixture_root = resolve_fixture_root()?;
    let db_path = fixture_root.join("com.conductor.app/conductor.db");
    let archive_root = fixture_root.join("helmor/archived-contexts");

    Ok(ConductorFixtureInfo {
        data_mode: "fixture".to_string(),
        fixture_root: fixture_root.display().to_string(),
        db_path: db_path.display().to_string(),
        archive_root: archive_root.display().to_string(),
    })
}

#[tauri::command]
pub fn list_workspace_groups() -> Result<Vec<WorkspaceSidebarGroup>, String> {
    let records = load_workspace_records()?;
    let mut done = Vec::new();
    let mut review = Vec::new();
    let mut progress = Vec::new();
    let mut backlog = Vec::new();
    let mut canceled = Vec::new();

    for record in records {
        let row = record_to_sidebar_row(record);
        match group_id_from_status(&row.manual_status, &row.derived_status) {
            "done" => done.push(row),
            "review" => review.push(row),
            "backlog" => backlog.push(row),
            "canceled" => canceled.push(row),
            _ => progress.push(row),
        }
    }

    sort_sidebar_rows(&mut done);
    sort_sidebar_rows(&mut review);
    sort_sidebar_rows(&mut progress);
    sort_sidebar_rows(&mut backlog);
    sort_sidebar_rows(&mut canceled);

    Ok(vec![
        WorkspaceSidebarGroup {
            id: "done".to_string(),
            label: "Done".to_string(),
            tone: "done".to_string(),
            rows: done,
        },
        WorkspaceSidebarGroup {
            id: "review".to_string(),
            label: "In review".to_string(),
            tone: "review".to_string(),
            rows: review,
        },
        WorkspaceSidebarGroup {
            id: "progress".to_string(),
            label: "In progress".to_string(),
            tone: "progress".to_string(),
            rows: progress,
        },
        WorkspaceSidebarGroup {
            id: "backlog".to_string(),
            label: "Backlog".to_string(),
            tone: "backlog".to_string(),
            rows: backlog,
        },
        WorkspaceSidebarGroup {
            id: "canceled".to_string(),
            label: "Canceled".to_string(),
            tone: "canceled".to_string(),
            rows: canceled,
        },
    ])
}

#[tauri::command]
pub fn list_archived_workspaces() -> Result<Vec<WorkspaceSummary>, String> {
    let mut archived = load_workspace_records()?
        .into_iter()
        .filter(|record| record.state == "archived")
        .map(record_to_summary)
        .collect::<Vec<_>>();

    archived.sort_by(|left, right| left.title.to_lowercase().cmp(&right.title.to_lowercase()));

    Ok(archived)
}

fn record_to_sidebar_row(record: WorkspaceRecord) -> WorkspaceSidebarRow {
    let title = display_title(&record);

    WorkspaceSidebarRow {
        avatar: avatar_for_title(&title),
        active: record.state == "ready",
        title,
        id: record.id,
        directory_name: record.directory_name,
        repo_name: record.repo_name,
        state: record.state,
        derived_status: record.derived_status,
        manual_status: record.manual_status,
        branch: record.branch,
        active_session_id: record.active_session_id,
        active_session_title: record.active_session_title,
        active_session_agent_type: record.active_session_agent_type,
        active_session_status: record.active_session_status,
        pr_title: record.pr_title,
        session_count: record.session_count,
        message_count: record.message_count,
        attachment_count: record.attachment_count,
    }
}

fn record_to_summary(record: WorkspaceRecord) -> WorkspaceSummary {
    WorkspaceSummary {
        active: record.state == "ready",
        title: display_title(&record),
        id: record.id,
        directory_name: record.directory_name,
        repo_name: record.repo_name,
        state: record.state,
        derived_status: record.derived_status,
        manual_status: record.manual_status,
        branch: record.branch,
        active_session_id: record.active_session_id,
        active_session_title: record.active_session_title,
        active_session_agent_type: record.active_session_agent_type,
        active_session_status: record.active_session_status,
        pr_title: record.pr_title,
        session_count: record.session_count,
        message_count: record.message_count,
        attachment_count: record.attachment_count,
    }
}

fn display_title(record: &WorkspaceRecord) -> String {
    if let Some(pr_title) = non_empty(&record.pr_title) {
        return pr_title.to_string();
    }

    if let Some(session_title) = non_empty(&record.active_session_title) {
        if session_title != "Untitled" {
            return session_title.to_string();
        }
    }

    humanize_directory_name(&record.directory_name)
}

fn avatar_for_title(title: &str) -> String {
    title
        .chars()
        .find(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_uppercase().to_string())
        .unwrap_or_else(|| "W".to_string())
}

fn group_id_from_status(manual_status: &Option<String>, derived_status: &str) -> &'static str {
    let status = non_empty(manual_status)
        .unwrap_or(derived_status)
        .trim()
        .to_ascii_lowercase();

    match status.as_str() {
        "done" => "done",
        "review" | "in-review" => "review",
        "backlog" => "backlog",
        "cancelled" | "canceled" => "canceled",
        _ => "progress",
    }
}

fn sort_sidebar_rows(rows: &mut [WorkspaceSidebarRow]) {
    rows.sort_by(|left, right| {
        right
            .active
            .cmp(&left.active)
            .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
    });
}

fn humanize_directory_name(directory_name: &str) -> String {
    directory_name
        .split(['-', '_'])
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            let mut characters = segment.chars();
            match characters.next() {
                Some(first) if first.is_ascii_alphabetic() => {
                    let mut label = String::new();
                    label.push(first.to_ascii_uppercase());
                    label.push_str(characters.as_str());
                    label
                }
                Some(first) => {
                    let mut label = String::new();
                    label.push(first);
                    label.push_str(characters.as_str());
                    label
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn non_empty(value: &Option<String>) -> Option<&str> {
    value.as_deref().filter(|inner| !inner.trim().is_empty())
}

fn load_workspace_records() -> Result<Vec<WorkspaceRecord>, String> {
    let connection = open_fixture_connection()?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
              w.id,
              r.name AS repo_name,
              w.directory_name,
              w.state,
              COALESCE(w.derived_status, 'in-progress') AS derived_status,
              w.manual_status,
              w.branch,
              w.active_session_id,
              s.title AS active_session_title,
              s.agent_type AS active_session_agent_type,
              s.status AS active_session_status,
              w.pr_title,
              (
                SELECT COUNT(*)
                FROM sessions ws
                WHERE ws.workspace_id = w.id
              ) AS session_count,
              (
                SELECT COUNT(*)
                FROM session_messages sm
                JOIN sessions ws ON ws.id = sm.session_id
                WHERE ws.workspace_id = w.id
              ) AS message_count,
              (
                SELECT COUNT(*)
                FROM attachments a
                JOIN sessions ws ON ws.id = a.session_id
                WHERE ws.workspace_id = w.id
              ) AS attachment_count
            FROM workspaces w
            JOIN repos r ON r.id = w.repository_id
            LEFT JOIN sessions s ON s.id = w.active_session_id
            ORDER BY w.directory_name
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(WorkspaceRecord {
                id: row.get(0)?,
                repo_name: row.get(1)?,
                directory_name: row.get(2)?,
                state: row.get(3)?,
                derived_status: row.get(4)?,
                manual_status: row.get(5)?,
                branch: row.get(6)?,
                active_session_id: row.get(7)?,
                active_session_title: row.get(8)?,
                active_session_agent_type: row.get(9)?,
                active_session_status: row.get(10)?,
                pr_title: row.get(11)?,
                session_count: row.get(12)?,
                message_count: row.get(13)?,
                attachment_count: row.get(14)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn open_fixture_connection() -> Result<Connection, String> {
    let db_path = resolve_fixture_root()?.join("com.conductor.app/conductor.db");

    Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| error.to_string())
}

fn resolve_fixture_root() -> Result<PathBuf, String> {
    if let Ok(root) = std::env::var("HELMOR_CONDUCTOR_FIXTURE_ROOT") {
        let path = PathBuf::from(root);
        validate_fixture_root(&path)?;
        return Ok(path);
    }

    let base_dir = project_root().join(FIXTURE_BASE_DIR);
    let mut candidates = fs::read_dir(&base_dir)
        .map_err(|error| {
            format!(
                "Failed to read fixture base directory {}: {error}",
                base_dir.display()
            )
        })?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_type()
                .map(|file_type| file_type.is_dir())
                .unwrap_or(false)
        })
        .map(|entry| {
            let modified = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH);

            (modified, entry.path())
        })
        .collect::<Vec<_>>();

    candidates.sort_by(|left, right| right.0.cmp(&left.0));

    let fixture_root = candidates
        .into_iter()
        .map(|(_, path)| path)
        .find(|path| validate_fixture_root(path).is_ok())
        .ok_or_else(|| {
            format!(
                "No valid Conductor fixture found under {}",
                base_dir.display()
            )
        })?;

    Ok(fixture_root)
}

fn validate_fixture_root(path: &Path) -> Result<(), String> {
    let db_path = path.join("com.conductor.app/conductor.db");
    let archive_root = path.join("helmor/archived-contexts");

    if !db_path.is_file() {
        return Err(format!("Missing fixture database at {}", db_path.display()));
    }

    if !archive_root.is_dir() {
        return Err(format!(
            "Missing archived contexts directory at {}",
            archive_root.display()
        ));
    }

    Ok(())
}

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri should have a repo root parent")
        .to_path_buf()
}
