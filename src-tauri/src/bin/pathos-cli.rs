//! pathos CLI — workspace and session management from the terminal.
//!
//! Reuses the same Rust domain logic as the Tauri GUI, reading from / writing
//! to the same SQLite database and worktree layout.
//!
//! Cargo binary name is `pathos-cli` (to avoid conflicting with the Tauri GUI
//! binary). The install process exposes it as `pathos` in release builds and
//! `pathos-dev` in debug builds.
//!
//! The CLI body lives in `pathos_lib::cli` so it can reach crate-private
//! domain logic. This binary is just the entry point.

use std::process::ExitCode;

fn main() -> ExitCode {
    pathos_lib::cli::run()
}
