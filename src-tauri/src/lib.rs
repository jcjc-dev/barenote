mod commands;
mod persistence;
mod tab;
mod config;

use commands::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()
                .map_err(|e| format!("Failed to resolve app data directory: {}", e))?;
            app.manage(AppState::new(app_dir));
            Ok(())
        })
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
            commands::append_delta_batch,
            commands::open_file,
            commands::get_config,
            commands::save_config,
            commands::set_window_theme,
            commands::save_tab_to_path,
            commands::reorder_tabs,
            commands::delete_tab,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Error while running tauri application: {}", e);
            std::process::exit(1);
        });
}
