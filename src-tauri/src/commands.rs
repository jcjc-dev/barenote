use std::path::PathBuf;
use std::sync::{Mutex, RwLock};
use serde::Deserialize;
use tauri::State;
use crate::tab::model::Tab;
use crate::tab::manager::TabManager;
use crate::config::model::AppConfig;
use crate::persistence::{storage, wal, snapshot, recovery};

pub struct AppState {
    pub tab_manager: RwLock<TabManager>,
    pub config: Mutex<AppConfig>,
}

impl AppState {
    pub fn new(app_dir: PathBuf) -> Self {
        let app_dir = storage::ensure_app_dir(&app_dir).unwrap_or_else(|e| {
            eprintln!("Failed to create app directory: {}", e);
            std::process::exit(1);
        });
        let mut tab_manager = TabManager::new(app_dir.clone());
        let _ = tab_manager.load_all_tabs();
        let _ = tab_manager.load_session();
        let config = AppConfig::load(&app_dir);

        AppState {
            tab_manager: RwLock::new(tab_manager),
            config: Mutex::new(config),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct DeltaInput {
    pub position: usize,
    pub delete_count: usize,
    pub inserted: String,
}

#[tauri::command]
pub fn create_tab(title: String, state: State<AppState>) -> Result<Tab, String> {
    let mut mgr = state.tab_manager.write().map_err(|e| e.to_string())?;
    mgr.create_tab(&title).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_tab(id: String, title: String, state: State<AppState>) -> Result<(), String> {
    let mut mgr = state.tab_manager.write().map_err(|e| e.to_string())?;
    mgr.rename_tab(&id, &title).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_tab(id: String, state: State<AppState>) -> Result<(), String> {
    let mut mgr = state.tab_manager.write().map_err(|e| e.to_string())?;
    // If tab is empty, delete permanently instead of archiving
    if mgr.is_tab_empty(&id) {
        mgr.delete_tab(&id).map_err(|e| e.to_string())
    } else {
        mgr.archive_tab(&id).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn archive_tab(id: String, state: State<AppState>) -> Result<(), String> {
    let mut mgr = state.tab_manager.write().map_err(|e| e.to_string())?;
    mgr.archive_tab(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_tab(id: String, state: State<AppState>) -> Result<(), String> {
    let mut mgr = state.tab_manager.write().map_err(|e| e.to_string())?;
    mgr.restore_tab(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_tabs(state: State<AppState>) -> Result<Vec<Tab>, String> {
    let mgr = state.tab_manager.read().map_err(|e| e.to_string())?;
    Ok(mgr.list_active())
}

#[tauri::command]
pub fn list_archived_tabs(state: State<AppState>) -> Result<Vec<Tab>, String> {
    let mgr = state.tab_manager.read().map_err(|e| e.to_string())?;
    Ok(mgr.list_archived())
}

#[tauri::command]
pub fn get_tab_content(id: String, state: State<AppState>) -> Result<String, String> {
    let mgr = state.tab_manager.read().map_err(|e| e.to_string())?;
    let tab_dir = storage::tab_dir(&mgr.app_dir, &id);
    recovery::recover_tab(&tab_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_tab_content(id: String, content: String, state: State<AppState>) -> Result<(), String> {
    let mgr = state.tab_manager.read().map_err(|e| e.to_string())?;
    let tab_dir = storage::tab_dir(&mgr.app_dir, &id);
    snapshot::write_snapshot(&tab_dir, &content).map_err(|e| e.to_string())?;
    wal::truncate_wal(&tab_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn append_delta(id: String, position: usize, delete_count: usize, inserted: String, state: State<AppState>) -> Result<(), String> {
    let mgr = state.tab_manager.read().map_err(|e| e.to_string())?;
    let tab_dir = storage::tab_dir(&mgr.app_dir, &id);
    let delta = wal::Delta {
        timestamp_ms: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        position,
        delete_count,
        inserted,
    };
    wal::append_delta(&tab_dir, &delta).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_config(state: State<AppState>) -> Result<AppConfig, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub fn save_config(config: AppConfig, state: State<AppState>) -> Result<(), String> {
    let mgr = state.tab_manager.read().map_err(|e| e.to_string())?;
    config.save(&mgr.app_dir).map_err(|e| e.to_string())?;
    let mut current = state.config.lock().map_err(|e| e.to_string())?;
    *current = config;
    Ok(())
}

#[tauri::command]
pub fn save_tab_to_path(id: String, path: String, state: State<AppState>) -> Result<(), String> {
    let mut mgr = state.tab_manager.write().map_err(|e| e.to_string())?;
    let tab_dir = crate::persistence::storage::tab_dir(&mgr.app_dir, &id);
    let content = crate::persistence::recovery::recover_tab(&tab_dir).map_err(|e| e.to_string())?;

    // Validate the target path
    let path = std::path::PathBuf::from(&path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err("Target directory does not exist".to_string());
        }
    }
    // Canonicalize to resolve symlinks and .. components
    let canonical = path.canonicalize().or_else(|_| {
        // If file doesn't exist yet, canonicalize the parent
        path.parent()
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid path"))
            .and_then(|p| p.canonicalize())
            .map(|p| p.join(path.file_name().unwrap_or_default()))
    }).map_err(|e| format!("Invalid path: {}", e))?;

    std::fs::write(&canonical, &content).map_err(|e| e.to_string())?;
    let canonical_str = canonical.to_string_lossy().to_string();
    mgr.set_file_path(&id, &canonical_str).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_window_theme(theme: String, window: tauri::WebviewWindow) -> Result<(), String> {
    use tauri::Theme;
    let tauri_theme = match theme.as_str() {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None,
    };
    window.set_theme(tauri_theme).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_tabs(order: Vec<String>, state: State<AppState>) -> Result<(), String> {
    let mut mgr = state.tab_manager.write().map_err(|e| e.to_string())?;
    mgr.reorder_tabs(order).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_tab(id: String, state: State<AppState>) -> Result<(), String> {
    let mut mgr = state.tab_manager.write().map_err(|e| e.to_string())?;
    mgr.delete_tab(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn append_delta_batch(id: String, deltas: Vec<DeltaInput>, state: State<AppState>) -> Result<(), String> {
    let mgr = state.tab_manager.read().map_err(|e| e.to_string())?;
    let tab_dir = storage::tab_dir(&mgr.app_dir, &id);
    let wal_deltas: Vec<wal::Delta> = deltas.into_iter().map(|d| {
        wal::Delta {
            timestamp_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            position: d.position,
            delete_count: d.delete_count,
            inserted: d.inserted,
        }
    }).collect();
    wal::append_deltas(&tab_dir, &wal_deltas).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_file(path: String, state: State<AppState>) -> Result<String, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let file_name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Untitled")
        .to_string();
    let mut mgr = state.tab_manager.write().map_err(|e| e.to_string())?;
    let tab = mgr.create_tab(&file_name).map_err(|e| e.to_string())?;
    let tab_id = tab.id.clone();
    let tab_dir = storage::tab_dir(&mgr.app_dir, &tab_id);
    snapshot::write_snapshot(&tab_dir, &content).map_err(|e| e.to_string())?;
    mgr.set_file_path(&tab_id, &path).map_err(|e| e.to_string())?;
    Ok(tab_id)
}
