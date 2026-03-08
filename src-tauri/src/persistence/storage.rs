use std::path::{Path, PathBuf};
use std::fs;

/// Create a directory tree and, on Unix, restrict permissions to owner-only (0o700).
fn create_dir_secure(path: &Path) -> std::io::Result<()> {
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

/// Ensures the app directory and tabs subdirectory exist at the given path
pub fn ensure_app_dir(app_dir: &Path) -> std::io::Result<PathBuf> {
    create_dir_secure(&app_dir.join("tabs"))?;
    Ok(app_dir.to_path_buf())
}

/// Ensures a tab's directory exists, returns the path
#[allow(dead_code)]
pub fn ensure_tab_dir(app_dir: &Path, tab_id: &str) -> std::io::Result<PathBuf> {
    let tab_dir = app_dir.join("tabs").join(tab_id);
    create_dir_secure(&tab_dir)?;
    Ok(tab_dir)
}

/// Returns the path to a tab's directory
pub fn tab_dir(app_dir: &Path, tab_id: &str) -> PathBuf {
    app_dir.join("tabs").join(tab_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_ensure_app_dir_creates_directory() {
        let tmp = TempDir::new().unwrap();
        let app_dir = tmp.path().to_path_buf();

        let result = ensure_app_dir(&app_dir).unwrap();
        assert_eq!(result, app_dir);
        assert!(app_dir.join("tabs").exists());
        assert!(app_dir.join("tabs").is_dir());
    }

    #[test]
    fn test_tab_dir_returns_correct_path() {
        let app_dir = PathBuf::from("/fake/app");
        let path = tab_dir(&app_dir, "my-tab-123");
        assert_eq!(path, PathBuf::from("/fake/app/tabs/my-tab-123"));
    }

    #[test]
    fn test_ensure_app_dir_idempotent() {
        let tmp = TempDir::new().unwrap();
        let app_dir = tmp.path().to_path_buf();

        ensure_app_dir(&app_dir).unwrap();
        ensure_app_dir(&app_dir).unwrap();

        assert!(app_dir.join("tabs").exists());
    }
}
