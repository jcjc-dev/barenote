use std::path::Path;
use super::snapshot;
use super::wal;

/// Apply a single delta to content string
fn apply_delta(content: &mut String, delta: &wal::Delta) {
    let pos = delta.position.min(content.len());
    let end = (pos + delta.delete_count).min(content.len());
    content.replace_range(pos..end, &delta.inserted);
}

/// Recover tab content: read snapshot + replay WAL deltas
pub fn recover_tab(tab_dir: &Path) -> std::io::Result<String> {
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

    #[test]
    fn test_recover_with_out_of_bounds_position() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        snapshot::write_snapshot(&dir, "Hi").unwrap();
        // Position 100 is way beyond "Hi" (len 2); apply_delta clamps to content.len()
        wal::append_delta(&dir, &wal::Delta {
            timestamp_ms: 1000,
            position: 100,
            delete_count: 0,
            inserted: "!".into(),
        }).unwrap();

        let content = recover_tab(&dir).unwrap();
        assert_eq!(content, "Hi!");
    }

    #[test]
    fn test_recover_with_out_of_bounds_delete() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        snapshot::write_snapshot(&dir, "Hello").unwrap();
        // Delete 100 chars starting at position 2 — should clamp to end
        wal::append_delta(&dir, &wal::Delta {
            timestamp_ms: 1000,
            position: 2,
            delete_count: 100,
            inserted: "".into(),
        }).unwrap();

        let content = recover_tab(&dir).unwrap();
        assert_eq!(content, "He");
    }

    #[test]
    fn test_recover_unicode_positions() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        // "🎉" is 4 bytes in UTF-8; "中" is 3 bytes
        let base = "🎉中文";
        snapshot::write_snapshot(&dir, base).unwrap();

        // Insert at byte position after "🎉" (4 bytes)
        wal::append_delta(&dir, &wal::Delta {
            timestamp_ms: 1000,
            position: 4,
            delete_count: 0,
            inserted: "OK".into(),
        }).unwrap();

        let content = recover_tab(&dir).unwrap();
        assert_eq!(content, "🎉OK中文");
    }

    #[test]
    fn test_recover_empty_snapshot_with_deltas() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        // No snapshot at all — only WAL entries
        wal::append_delta(&dir, &wal::Delta {
            timestamp_ms: 1000,
            position: 0,
            delete_count: 0,
            inserted: "First".into(),
        }).unwrap();
        wal::append_delta(&dir, &wal::Delta {
            timestamp_ms: 2000,
            position: 5,
            delete_count: 0,
            inserted: " Second".into(),
        }).unwrap();

        let content = recover_tab(&dir).unwrap();
        assert_eq!(content, "First Second");
    }

    #[test]
    fn test_recover_large_content() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        // Write a 512KB snapshot
        let base = "A".repeat(512 * 1024);
        snapshot::write_snapshot(&dir, &base).unwrap();

        // Append deltas that add another 512KB+
        let chunk = "B".repeat(1024);
        for i in 0..512 {
            wal::append_delta(&dir, &wal::Delta {
                timestamp_ms: i as u64,
                position: base.len() + i * 1024,
                delete_count: 0,
                inserted: chunk.clone(),
            }).unwrap();
        }

        let content = recover_tab(&dir).unwrap();
        assert_eq!(content.len(), 512 * 1024 + 512 * 1024);
        assert!(content.starts_with("AAAA"));
        assert!(content.ends_with("BBBB"));
    }

    // --- Integration tests ---

    #[test]
    fn test_full_lifecycle() {
        let tmp = TempDir::new().unwrap();
        let app_dir = tmp.path().to_path_buf();

        // Create tab dir
        let tab_dir = super::super::storage::ensure_tab_dir(&app_dir, "tab-lifecycle").unwrap();

        // Write snapshot
        snapshot::write_snapshot(&tab_dir, "Initial").unwrap();

        // Append multiple deltas
        wal::append_delta(&tab_dir, &wal::Delta {
            timestamp_ms: 1, position: 7, delete_count: 0, inserted: " content".into(),
        }).unwrap();
        wal::append_delta(&tab_dir, &wal::Delta {
            timestamp_ms: 2, position: 15, delete_count: 0, inserted: " here".into(),
        }).unwrap();

        // Recover and verify
        let content = recover_tab(&tab_dir).unwrap();
        assert_eq!(content, "Initial content here");
    }

    #[test]
    fn test_snapshot_then_wal_truncate_then_recover() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        // Write snapshot and old WAL
        snapshot::write_snapshot(&dir, "Base").unwrap();
        wal::append_delta(&dir, &wal::Delta {
            timestamp_ms: 1, position: 4, delete_count: 0, inserted: " old".into(),
        }).unwrap();

        // Simulate compaction: new snapshot, truncate WAL, add new deltas
        let content = recover_tab(&dir).unwrap();
        assert_eq!(content, "Base old");

        snapshot::write_snapshot(&dir, &content).unwrap();
        wal::truncate_wal(&dir).unwrap();

        wal::append_delta(&dir, &wal::Delta {
            timestamp_ms: 2, position: 8, delete_count: 0, inserted: " new".into(),
        }).unwrap();

        let content = recover_tab(&dir).unwrap();
        assert_eq!(content, "Base old new");
    }

    #[test]
    fn test_concurrent_append_and_recover() {
        use std::thread;

        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        snapshot::write_snapshot(&dir, "").unwrap();

        // Spawn threads that each append deltas
        let handles: Vec<_> = (0..4).map(|t| {
            let d = dir.clone();
            thread::spawn(move || {
                for i in 0..10 {
                    let _ = wal::append_delta(&d, &wal::Delta {
                        timestamp_ms: (t * 100 + i) as u64,
                        position: 0,
                        delete_count: 0,
                        inserted: format!("t{}i{} ", t, i),
                    });
                }
            })
        }).collect();

        for h in handles {
            h.join().unwrap();
        }

        // Concurrent appends may interleave, causing some JSON lines to be
        // corrupt. The WAL reader must tolerate this gracefully.
        let deltas = wal::read_deltas(&dir).unwrap();
        assert!(deltas.len() > 0, "should have parsed at least some deltas");
        assert!(deltas.len() <= 40, "should not have more deltas than written");

        // Recovery should not panic regardless of interleaving
        let content = recover_tab(&dir).unwrap();
        assert!(!content.is_empty());
    }
}
