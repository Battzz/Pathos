use std::{
    ffi::OsString,
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant, UNIX_EPOCH},
};

use anyhow::{bail, Context, Result};
use uuid::Uuid;

use crate::models::workspaces as workspace_models;

pub(super) fn resolve_allowed_path(path: &Path, require_existing: bool) -> Result<PathBuf> {
    if !path.is_absolute() {
        bail!("Editor file paths must be absolute: {}", path.display());
    }

    let normalized_path = if require_existing || path.exists() {
        path.canonicalize()
            .with_context(|| format!("Failed to resolve editor file {}", path.display()))?
    } else {
        canonicalize_missing_path(path)?
    };

    let workspace_roots = allowed_workspace_roots()?;

    if workspace_roots
        .iter()
        .any(|workspace_root| normalized_path.starts_with(workspace_root))
    {
        return Ok(normalized_path);
    }

    if path_is_inside_known_workspace(path)? {
        return Ok(normalized_path);
    }

    bail!(
        "Editor file must live inside a workspace root: {}",
        path.display()
    )
}

pub(super) fn path_is_inside_known_workspace(path: &Path) -> Result<bool> {
    if !path.is_absolute() {
        return Ok(false);
    }
    let normalized_path = canonicalize_missing_path(path)?;

    for record in workspace_models::load_workspace_records()? {
        let Some(workspace_dir) =
            crate::workspace_project::resolve_workspace_root_path_unchecked(&record)
        else {
            continue;
        };
        let Ok(normalized_root) = canonicalize_missing_path(&workspace_dir) else {
            continue;
        };
        if normalized_path.starts_with(normalized_root) {
            return Ok(true);
        }
    }

    Ok(false)
}

pub(super) fn allowed_workspace_roots() -> Result<Vec<PathBuf>> {
    let mut workspace_roots = Vec::new();

    for record in workspace_models::load_workspace_records()? {
        let Some(workspace_dir) =
            crate::workspace_project::resolve_workspace_root_path_unchecked(&record)
        else {
            // Malformed repo/directory name — skip rather than nuke the whole
            // picker. Not user-actionable.
            continue;
        };

        if !workspace_dir.is_dir() {
            continue;
        }

        // canonicalize can fail if a parent component vanishes mid-iteration
        // (symlink chain broken, etc.). One broken workspace must not take
        // the whole picker down — skip and keep going.
        match workspace_dir.canonicalize() {
            Ok(path) => workspace_roots.push(path),
            Err(error) => {
                tracing::warn!(
                    path = %workspace_dir.display(),
                    error = %error,
                    "skipping unresolvable workspace root",
                );
            }
        }
    }

    workspace_roots.sort();
    workspace_roots.dedup();

    Ok(workspace_roots)
}

const MAX_WORKSPACE_FILES_FOR_MENTION: usize = 5000;
const MAX_INDEXED_FILES_FOR_MENTION: usize = 500;
const MAX_QUERY_FALLBACK_DIRS_FOR_MENTION: usize = 2500;
const INDEXED_SEARCH_TIMEOUT: Duration = Duration::from_millis(900);

#[derive(Debug, Clone)]
pub(super) struct MentionFileQuery {
    lower: String,
}

impl MentionFileQuery {
    pub(super) fn new(query: Option<&str>) -> Option<Self> {
        let query = query?.trim();
        if query.is_empty() {
            return None;
        }
        Some(Self {
            lower: query.to_ascii_lowercase(),
        })
    }
}

pub(super) struct MentionWalkBudget {
    visited_dirs: usize,
    max_dirs: usize,
}

impl MentionWalkBudget {
    pub(super) fn for_query_fallback() -> Self {
        Self {
            visited_dirs: 0,
            max_dirs: MAX_QUERY_FALLBACK_DIRS_FOR_MENTION,
        }
    }

    fn enter_dir(&mut self) -> bool {
        if self.visited_dirs >= self.max_dirs {
            return false;
        }
        self.visited_dirs += 1;
        true
    }
}

pub(super) fn collect_indexed_workspace_files_for_mention(
    workspace_root: &Path,
    query: &MentionFileQuery,
) -> Result<Option<Vec<PathBuf>>> {
    if let Some(files) = collect_git_workspace_files_for_mention(workspace_root, query)? {
        return Ok(Some(files));
    }

    collect_spotlight_workspace_files_for_mention(workspace_root, query)
}

pub(super) fn collect_workspace_files_for_mention(
    workspace_root: &Path,
    current_dir: &Path,
    discovered_files: &mut Vec<PathBuf>,
    query: Option<&MentionFileQuery>,
    mut budget: Option<&mut MentionWalkBudget>,
) -> Result<()> {
    if discovered_files.len() >= MAX_WORKSPACE_FILES_FOR_MENTION {
        return Ok(());
    }
    if let Some(budget) = budget.as_deref_mut() {
        if !budget.enter_dir() {
            return Ok(());
        }
    }

    let read_dir = match fs::read_dir(current_dir) {
        Ok(iter) => iter,
        Err(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::NotFound | std::io::ErrorKind::PermissionDenied
            ) =>
        {
            // Subdir vanished between walk start and descent (git checkout,
            // rm -rf, etc.) or is protected by the OS. Generic chats can
            // be rooted at $HOME, where protected folders are common, so one
            // unreadable directory must not break the whole @-mention picker.
            tracing::debug!(
                path = %current_dir.display(),
                error = %error,
                "skipping unreadable workspace subdir during mention walk",
            );
            return Ok(());
        }
        Err(error) => {
            return Err(error).with_context(|| {
                format!(
                    "Failed to read workspace directory {}",
                    current_dir.display()
                )
            })
        }
    };
    let mut entries = Vec::new();
    for entry in read_dir {
        match entry {
            Ok(entry) => entries.push(entry),
            Err(error) => {
                tracing::debug!(
                    path = %current_dir.display(),
                    error = %error,
                    "skipping unreadable workspace entry during mention walk",
                );
            }
        }
    }

    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        if discovered_files.len() >= MAX_WORKSPACE_FILES_FOR_MENTION {
            break;
        }

        let entry_path = entry.path();
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                tracing::debug!(
                    path = %entry_path.display(),
                    error = %error,
                    "skipping uninspectable workspace entry during mention walk",
                );
                continue;
            }
        };

        if file_type.is_dir() {
            if should_skip_workspace_dir_for_mention(workspace_root, &entry_path) {
                continue;
            }

            collect_workspace_files_for_mention(
                workspace_root,
                &entry_path,
                discovered_files,
                query,
                budget.as_deref_mut(),
            )?;
            continue;
        }

        if file_type.is_file()
            && should_include_workspace_file_for_mention(&entry_path)
            && file_matches_mention_query(workspace_root, &entry_path, query)
        {
            discovered_files.push(entry_path);
        }
    }

    Ok(())
}

fn collect_git_workspace_files_for_mention(
    workspace_root: &Path,
    query: &MentionFileQuery,
) -> Result<Option<Vec<PathBuf>>> {
    let workspace_root_arg = workspace_root.display().to_string();
    let Ok(repo_root_output) = crate::git_ops::run_git(
        [
            "-C",
            workspace_root_arg.as_str(),
            "rev-parse",
            "--show-toplevel",
        ],
        None,
    ) else {
        return Ok(None);
    };
    let repo_root = PathBuf::from(repo_root_output.trim());
    if repo_root.as_os_str().is_empty() {
        return Ok(None);
    }

    let Ok(output) = crate::git_ops::run_git(
        [
            "-C",
            workspace_root_arg.as_str(),
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "--full-name",
        ],
        None,
    ) else {
        return Ok(None);
    };

    let mut files = Vec::new();
    for line in output.lines() {
        if files.len() >= MAX_INDEXED_FILES_FOR_MENTION {
            break;
        }
        let relative = line.trim();
        if relative.is_empty() {
            continue;
        }
        let path = repo_root.join(relative);
        if !path.starts_with(workspace_root) {
            continue;
        }
        if is_mention_file_candidate(workspace_root, &path, Some(query)) {
            files.push(path);
        }
    }

    if files.is_empty() {
        Ok(None)
    } else {
        Ok(Some(files))
    }
}

#[cfg(target_os = "macos")]
fn collect_spotlight_workspace_files_for_mention(
    workspace_root: &Path,
    query: &MentionFileQuery,
) -> Result<Option<Vec<PathBuf>>> {
    if query.lower.chars().count() < 2 {
        return Ok(None);
    }

    let expression = format!(
        "kMDItemFSName == \"*{}*\"cd",
        escape_spotlight_query(&query.lower)
    );
    let mut child = match Command::new("mdfind")
        .arg("-onlyin")
        .arg(workspace_root)
        .arg(expression)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            tracing::warn!(
                path = %workspace_root.display(),
                error = %error,
                "failed to spawn Spotlight mention search",
            );
            return Ok(None);
        }
    };

    let Some(stdout) = child.stdout.take() else {
        let _ = child.kill();
        return Ok(None);
    };

    let (sender, receiver) = mpsc::channel();
    let workspace_root_for_reader = workspace_root.to_path_buf();
    let query_for_reader = query.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut files = Vec::new();
        for line in reader.lines() {
            let Ok(line) = line else {
                continue;
            };
            let path = PathBuf::from(line);
            if is_mention_file_candidate(&workspace_root_for_reader, &path, Some(&query_for_reader))
            {
                files.push(path);
            }
            if files.len() >= MAX_INDEXED_FILES_FOR_MENTION {
                break;
            }
        }
        let _ = sender.send(files);
    });

    let started_at = Instant::now();
    loop {
        if let Ok(files) = receiver.try_recv() {
            let _ = child.kill();
            let _ = child.wait();
            return Ok(if files.is_empty() { None } else { Some(files) });
        }

        if child.try_wait()?.is_some() {
            let files = receiver
                .recv_timeout(Duration::from_millis(50))
                .unwrap_or_default();
            return Ok(if files.is_empty() { None } else { Some(files) });
        }

        if started_at.elapsed() >= INDEXED_SEARCH_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            let files = receiver
                .recv_timeout(Duration::from_millis(50))
                .unwrap_or_default();
            return Ok(if files.is_empty() { None } else { Some(files) });
        }

        thread::sleep(Duration::from_millis(10));
    }
}

#[cfg(not(target_os = "macos"))]
fn collect_spotlight_workspace_files_for_mention(
    _workspace_root: &Path,
    _query: &MentionFileQuery,
) -> Result<Option<Vec<PathBuf>>> {
    Ok(None)
}

fn escape_spotlight_query(query: &str) -> String {
    query.replace('\\', "\\\\").replace('"', "\\\"")
}

fn is_mention_file_candidate(
    workspace_root: &Path,
    path: &Path,
    query: Option<&MentionFileQuery>,
) -> bool {
    path.is_file()
        && !has_skipped_mention_ancestor(workspace_root, path)
        && should_include_workspace_file_for_mention(path)
        && file_matches_mention_query(workspace_root, path, query)
}

fn has_skipped_mention_ancestor(workspace_root: &Path, path: &Path) -> bool {
    let mut current = path.parent();
    while let Some(dir) = current {
        if dir == workspace_root {
            return false;
        }
        if should_skip_workspace_dir_for_mention(workspace_root, dir) {
            return true;
        }
        current = dir.parent();
    }
    false
}

fn file_matches_mention_query(
    workspace_root: &Path,
    path: &Path,
    query: Option<&MentionFileQuery>,
) -> bool {
    let Some(query) = query else {
        return true;
    };
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if file_name.contains(&query.lower) {
        return true;
    }
    path.strip_prefix(workspace_root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase()
        .contains(&query.lower)
}

fn should_skip_workspace_dir_for_mention(workspace_root: &Path, path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return true;
    };

    if matches!(
        name,
        ".git"
            | "node_modules"
            | "dist"
            | "build"
            | "coverage"
            | "target"
            | ".next"
            | ".turbo"
            | ".cache"
            | ".venv"
            | ".Trash"
            | ".gradle"
            | ".npm"
            | ".rustup"
            | "__pycache__"
    ) {
        return true;
    }

    path.parent() == Some(workspace_root)
        && matches!(
            name,
            "Applications" | "Library" | "Movies" | "Music" | "Pictures"
        )
}

fn should_include_workspace_file_for_mention(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };

    if matches!(file_name, ".DS_Store" | "Thumbs.db" | "desktop.ini") {
        return false;
    }

    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return true;
    };

    let lower = extension.to_ascii_lowercase();
    !matches!(
        lower.as_str(),
        "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "webp"
            | "bmp"
            | "ico"
            | "tiff"
            | "tif"
            | "avif"
            | "heic"
            | "heif"
            | "mp3"
            | "wav"
            | "flac"
            | "ogg"
            | "m4a"
            | "aac"
            | "wma"
            | "opus"
            | "mp4"
            | "mov"
            | "avi"
            | "mkv"
            | "webm"
            | "m4v"
            | "wmv"
            | "flv"
            | "zip"
            | "tar"
            | "gz"
            | "bz2"
            | "xz"
            | "7z"
            | "rar"
            | "tgz"
            | "tbz2"
            | "zst"
            | "lz"
            | "lzma"
            | "exe"
            | "dll"
            | "so"
            | "dylib"
            | "o"
            | "a"
            | "class"
            | "jar"
            | "war"
            | "ear"
            | "pyc"
            | "pyo"
            | "wasm"
            | "node"
            | "ttf"
            | "otf"
            | "woff"
            | "woff2"
            | "eot"
            | "doc"
            | "docx"
            | "xls"
            | "xlsx"
            | "ppt"
            | "pptx"
            | "odt"
            | "ods"
            | "odp"
            | "db"
            | "sqlite"
            | "sqlite3"
            | "mdb"
            | "iso"
            | "dmg"
            | "pkg"
            | "deb"
            | "rpm"
            | "msi"
            | "apk"
            | "ipa"
            | "bin"
            | "dat"
    )
}

pub(super) fn collect_editor_files(
    workspace_root: &Path,
    current_dir: &Path,
    discovered_files: &mut Vec<PathBuf>,
) -> Result<()> {
    if discovered_files.len() >= 48 {
        return Ok(());
    }

    let read_dir = match fs::read_dir(current_dir) {
        Ok(iter) => iter,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            tracing::warn!(
                path = %current_dir.display(),
                "skipping missing workspace subdir during editor walk",
            );
            return Ok(());
        }
        Err(error) => {
            return Err(error).with_context(|| {
                format!(
                    "Failed to read workspace directory {}",
                    current_dir.display()
                )
            })
        }
    };
    let mut entries = read_dir
        .collect::<std::result::Result<Vec<_>, _>>()
        .with_context(|| {
            format!(
                "Failed to iterate workspace directory {}",
                current_dir.display()
            )
        })?;

    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        if discovered_files.len() >= 48 {
            break;
        }

        let entry_path = entry.path();
        let file_type = entry.file_type().with_context(|| {
            format!("Failed to inspect workspace entry {}", entry_path.display())
        })?;

        if file_type.is_dir() {
            if should_skip_editor_dir(workspace_root, &entry_path) {
                continue;
            }

            collect_editor_files(workspace_root, &entry_path, discovered_files)?;
            continue;
        }

        if file_type.is_file() && should_include_editor_file(&entry_path) {
            discovered_files.push(entry_path);
        }
    }

    Ok(())
}

fn should_skip_editor_dir(workspace_root: &Path, path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return true;
    };

    matches!(
        name,
        ".git"
            | "node_modules"
            | "dist"
            | "build"
            | "coverage"
            | "target"
            | ".next"
            | ".turbo"
            | ".cache"
            | ".venv"
            | "__pycache__"
    ) || (name.starts_with('.') && path != workspace_root)
}

fn should_include_editor_file(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };

    if matches!(
        file_name,
        "package.json"
            | "pnpm-lock.yaml"
            | "bun.lock"
            | "Cargo.toml"
            | "Cargo.lock"
            | "tsconfig.json"
            | "vite.config.ts"
            | "README.md"
            | "AGENTS.md"
    ) {
        return true;
    }

    matches!(
        path.extension().and_then(|value| value.to_str()),
        Some(
            "ts" | "tsx"
                | "js"
                | "jsx"
                | "rs"
                | "json"
                | "toml"
                | "md"
                | "css"
                | "html"
                | "yml"
                | "yaml"
                | "py"
                | "go"
                | "java"
                | "swift"
                | "kt"
        )
    )
}

pub(super) fn editor_file_sort_key(workspace_root: &Path, path: &Path) -> (usize, usize, String) {
    let relative = path
        .strip_prefix(workspace_root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    let depth = relative.matches('/').count();
    let priority = if relative.starts_with("src/") {
        0
    } else if relative.starts_with("app/")
        || relative.starts_with("lib/")
        || relative.starts_with("components/")
    {
        1
    } else if depth == 0 {
        2
    } else {
        3
    };

    (priority, depth, relative)
}

pub(super) fn atomic_write_file(path: &Path, content: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .with_context(|| format!("Editor file has no parent directory: {}", path.display()))?;
    let file_name = path
        .file_name()
        .with_context(|| format!("Editor file has no file name: {}", path.display()))?
        .to_string_lossy();
    let temp_path = parent.join(format!(".{file_name}.pathos-{}", Uuid::new_v4()));

    let write_result = (|| -> Result<()> {
        let mut temp_file = fs::OpenOptions::new()
            .create_new(true)
            .truncate(true)
            .write(true)
            .open(&temp_path)
            .with_context(|| {
                format!("Failed to create temp editor file {}", temp_path.display())
            })?;

        temp_file
            .write_all(content)
            .with_context(|| format!("Failed to write temp editor file {}", temp_path.display()))?;
        temp_file
            .sync_all()
            .with_context(|| format!("Failed to flush temp editor file {}", temp_path.display()))?;

        if let Ok(metadata) = fs::metadata(path) {
            fs::set_permissions(&temp_path, metadata.permissions()).with_context(|| {
                format!(
                    "Failed to copy permissions onto temp editor file {}",
                    temp_path.display()
                )
            })?;
        }

        fs::rename(&temp_path, path).with_context(|| {
            format!(
                "Failed to replace editor file {} with {}",
                path.display(),
                temp_path.display()
            )
        })?;

        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }

    write_result
}

pub(super) fn canonicalize_missing_path(path: &Path) -> Result<PathBuf> {
    let mut missing_segments = Vec::<OsString>::new();
    let mut current = path;

    while !current.exists() {
        let segment = current
            .file_name()
            .with_context(|| format!("Editor path has no file name: {}", path.display()))?;
        missing_segments.push(segment.to_os_string());
        current = current
            .parent()
            .with_context(|| format!("Editor path has no parent: {}", path.display()))?;
    }

    let mut resolved = current
        .canonicalize()
        .with_context(|| format!("Failed to resolve editor parent {}", current.display()))?;

    for segment in missing_segments.iter().rev() {
        resolved.push(segment);
    }

    Ok(resolved)
}

pub(super) fn metadata_mtime_ms(metadata: &fs::Metadata) -> Result<i64> {
    let duration = metadata
        .modified()
        .context("Failed to read file modification time")?
        .duration_since(UNIX_EPOCH)
        .context("File modification time predates the Unix epoch")?;

    i64::try_from(duration.as_millis()).context("File modification time exceeds i64 range")
}
