//! Tauri commands for the user-facing "Spaces" feature.
//!
//! The frontend uses these to render the sidebar pager (one page per
//! space) and to let the user create / rename / delete spaces from the
//! footer "+" button.

use tauri::AppHandle;

use crate::{
    models::spaces::{self, Space},
    ui_sync,
};

use super::common::{run_blocking, CmdResult};

#[tauri::command]
pub async fn list_spaces() -> CmdResult<Vec<Space>> {
    run_blocking(spaces::list_spaces).await
}

#[tauri::command]
pub async fn create_space(app: AppHandle, name: String) -> CmdResult<Space> {
    let created = run_blocking(move || spaces::create_space(&name)).await?;
    ui_sync::publish(&app, ui_sync::UiMutationEvent::SpaceListChanged);
    Ok(created)
}

#[tauri::command]
pub async fn rename_space(app: AppHandle, space_id: String, name: String) -> CmdResult<()> {
    run_blocking(move || spaces::rename_space(&space_id, &name)).await?;
    ui_sync::publish(&app, ui_sync::UiMutationEvent::SpaceListChanged);
    Ok(())
}

#[tauri::command]
pub async fn delete_space(app: AppHandle, space_id: String) -> CmdResult<()> {
    run_blocking(move || spaces::delete_space(&space_id)).await?;
    ui_sync::publish(&app, ui_sync::UiMutationEvent::SpaceListChanged);
    Ok(())
}

#[tauri::command]
pub async fn assign_repo_to_space(
    app: AppHandle,
    repo_id: String,
    space_id: Option<String>,
) -> CmdResult<()> {
    run_blocking(move || spaces::assign_repo_to_space(&repo_id, space_id.as_deref())).await?;
    ui_sync::publish(&app, ui_sync::UiMutationEvent::SpaceListChanged);
    Ok(())
}
