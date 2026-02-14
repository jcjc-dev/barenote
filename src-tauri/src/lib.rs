mod commands;
mod persistence;
mod tab;
mod config;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::create_tab,
            commands::rename_tab,
            commands::close_tab,
            commands::archive_tab,
            commands::restore_tab,
            commands::list_tabs,
            commands::list_archived_tabs,
            commands::get_tab_content,
            commands::update_tab_content,
            commands::append_delta,
            commands::get_config,
            commands::save_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
