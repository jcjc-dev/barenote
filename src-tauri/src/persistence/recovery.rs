use std::path::PathBuf;
use super::snapshot;
use super::wal;

/// Apply a single delta to content string
fn apply_delta(content: &mut String, delta: &wal::Delta) {
    let pos = delta.position.min(content.len());
    let end = (pos + delta.delete_count).min(content.len());
    content.replace_range(pos..end, &delta.inserted);
}

/// Recover tab content: read snapshot + replay WAL deltas
pub fn recover_tab(tab_dir: &PathBuf) -> std::io::Result<String> {
    // Start with snapshot or empty string
    let mut content = snapshot::read_snapshot(tab_dir)?
        .unwrap_or_default();

    // Replay WAL deltas on top
    let deltas = wal::read_deltas(tab_dir)?;
    for delta in &deltas {
        apply_delta(&mut content, delta);
    }

    Ok(content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_recover_with_snapshot_and_wal() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        snapshot::write_snapshot(&dir, "Hello").unwrap();
        wal::append_delta(&dir, &wal::Delta {
            timestamp_ms: 1000,
            position: 5,
            delete_count: 0,
            inserted: " World".into(),
        }).unwrap();

        let content = recover_tab(&dir).unwrap();
        assert_eq!(content, "Hello World");
    }

    #[test]
    fn test_recover_snapshot_only() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        snapshot::write_snapshot(&dir, "Snapshot only").unwrap();

        let content = recover_tab(&dir).unwrap();
        assert_eq!(content, "Snapshot only");
    }

    #[test]
    fn test_recover_wal_only() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        wal::append_delta(&dir, &wal::Delta {
            timestamp_ms: 1000,
            position: 0,
            delete_count: 0,
            inserted: "From WAL".into(),
        }).unwrap();

        let content = recover_tab(&dir).unwrap();
        assert_eq!(content, "From WAL");
    }

    #[test]
    fn test_recover_empty() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        let content = recover_tab(&dir).unwrap();
        assert_eq!(content, "");
    }

    #[test]
    fn test_recover_with_delete_delta() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        snapshot::write_snapshot(&dir, "Hello World").unwrap();

        // Delete "World" (position 6, delete 5) and insert "Rust"
        wal::append_delta(&dir, &wal::Delta {
            timestamp_ms: 1000,
            position: 6,
            delete_count: 5,
            inserted: "Rust".into(),
        }).unwrap();

        let content = recover_tab(&dir).unwrap();
        assert_eq!(content, "Hello Rust");
    }
}
