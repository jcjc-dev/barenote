use std::path::Path;
use std::fs::{self, File};
use std::io::Write;

#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;

/// Write content atomically: write to .tmp, fsync, rename to final path
pub fn write_snapshot(tab_dir: &Path, content: &str) -> std::io::Result<()> {
    let final_path = tab_dir.join("content.txt");
    let tmp_path = tab_dir.join("content.txt.tmp");

    let mut file = {
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        opts.mode(0o600);
        opts.open(&tmp_path)?
    };
    file.write_all(content.as_bytes())?;
    file.sync_all()?; // fsync for durability

    fs::rename(&tmp_path, &final_path)?; // atomic on same filesystem

    // fsync the directory to ensure the rename is durable
    #[cfg(unix)]
    {
        if let Ok(dir) = File::open(tab_dir) {
            let _ = dir.sync_all();
        }
    }

    Ok(())
}

/// Read the latest snapshot content, if it exists
pub fn read_snapshot(tab_dir: &Path) -> std::io::Result<Option<String>> {
    let path = tab_dir.join("content.txt");
    if path.exists() {
        let content = fs::read_to_string(&path)?;
        Ok(Some(content))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_write_and_read_snapshot() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        write_snapshot(&dir, "Hello, snapshot!").unwrap();
        let content = read_snapshot(&dir).unwrap();
        assert_eq!(content, Some("Hello, snapshot!".to_string()));
    }

    #[test]
    fn test_read_missing_snapshot() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        let content = read_snapshot(&dir).unwrap();
        assert_eq!(content, None);
    }

    #[test]
    fn test_atomic_write() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        write_snapshot(&dir, "Atomic content").unwrap();

        // The tmp file should not exist after write (it was renamed)
        let tmp_path = dir.join("content.txt.tmp");
        assert!(!tmp_path.exists());

        // The final file should exist
        let final_path = dir.join("content.txt");
        assert!(final_path.exists());
        assert_eq!(fs::read_to_string(&final_path).unwrap(), "Atomic content");
    }

    #[test]
    fn test_write_and_read_empty_content() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        write_snapshot(&dir, "").unwrap();
        let content = read_snapshot(&dir).unwrap();
        assert_eq!(content, Some("".to_string()));
    }

    #[test]
    fn test_write_snapshot_overwrites_existing() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        write_snapshot(&dir, "First").unwrap();
        write_snapshot(&dir, "Second").unwrap();

        let content = read_snapshot(&dir).unwrap();
        assert_eq!(content, Some("Second".to_string()));
    }

    #[test]
    fn test_snapshot_with_unicode_content() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        let unicode = "Hello 🌍🎉 中文テスト émojis «quotes» \u{200B}zero-width";
        write_snapshot(&dir, unicode).unwrap();
        let content = read_snapshot(&dir).unwrap();
        assert_eq!(content, Some(unicode.to_string()));
    }
}
