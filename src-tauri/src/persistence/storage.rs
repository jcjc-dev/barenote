use std::path::PathBuf;
use std::fs;

/// Returns the app data directory: ~/.rawnote on Linux/macOS, %USERPROFILE%\.rawnote on Windows
pub fn get_app_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Could not determine home directory");
    home.join(".rawnote")
}

/// Ensures the app directory and tabs subdirectory exist
pub fn ensure_app_dir() -> std::io::Result<PathBuf> {
    let app_dir = get_app_dir();
    fs::create_dir_all(app_dir.join("tabs"))?;
    Ok(app_dir)
}

/// Ensures a tab's directory exists, returns the path
#[allow(dead_code)]
pub fn ensure_tab_dir(app_dir: &PathBuf, tab_id: &str) -> std::io::Result<PathBuf> {
    let tab_dir = app_dir.join("tabs").join(tab_id);
    fs::create_dir_all(&tab_dir)?;
    Ok(tab_dir)
}

/// Returns the path to a tab's directory
pub fn tab_dir(app_dir: &PathBuf, tab_id: &str) -> PathBuf {
    app_dir.join("tabs").join(tab_id)
}
