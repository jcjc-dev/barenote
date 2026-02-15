use std::path::PathBuf;
use std::fs;

/// Ensures the app directory and tabs subdirectory exist at the given path
pub fn ensure_app_dir(app_dir: &PathBuf) -> std::io::Result<PathBuf> {
    fs::create_dir_all(app_dir.join("tabs"))?;
    Ok(app_dir.clone())
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
