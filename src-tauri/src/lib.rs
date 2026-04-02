mod conductor;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            conductor::get_conductor_fixture_info,
            conductor::list_archived_workspaces,
            conductor::list_workspace_groups
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
