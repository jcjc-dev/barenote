use serde::{Serialize, Deserialize};
use std::path::Path;
use std::fs::{File, OpenOptions};
use std::io::{Write, BufRead, BufReader};

#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Delta {
    pub timestamp_ms: u64,
    pub position: usize,
    pub delete_count: usize,
    pub inserted: String,
}

/// Append a delta to the WAL file for a tab. Each delta is a JSON line followed by newline.
/// Calls fsync after write for durability.
pub fn append_delta(tab_dir: &Path, delta: &Delta) -> std::io::Result<()> {
    let wal_path = tab_dir.join("wal.log");
    let mut opts = OpenOptions::new();
    opts.create(true).append(true);
    #[cfg(unix)]
    opts.mode(0o600);
    let mut file = opts.open(&wal_path)?;
    let line = serde_json::to_string(delta).map_err(std::io::Error::other)?;
    writeln!(file, "{}", line)?;
    file.sync_all()?;
    Ok(())
}

/// Append multiple deltas to the WAL file in a single batch with one fsync.
pub fn append_deltas(tab_dir: &Path, deltas: &[Delta]) -> std::io::Result<()> {
    let wal_path = tab_dir.join("wal.log");
    let mut opts = OpenOptions::new();
    opts.create(true).append(true);
    #[cfg(unix)]
    opts.mode(0o600);
    let mut file = opts.open(&wal_path)?;
    for delta in deltas {
        let line = serde_json::to_string(delta)
            .map_err(std::io::Error::other)?;
        writeln!(file, "{}", line)?;
    }
    file.sync_all()?;
    Ok(())
}

/// Read all deltas from the WAL file. Skips corrupt/incomplete trailing entries.
pub fn read_deltas(tab_dir: &Path) -> std::io::Result<Vec<Delta>> {
    let wal_path = tab_dir.join("wal.log");
    if !wal_path.exists() {
        return Ok(Vec::new());
    }
    let file = File::open(&wal_path)?;
    let reader = BufReader::new(file);
    let mut deltas = Vec::new();
    for line in reader.lines() {
        match line {
            Ok(l) if l.trim().is_empty() => continue,
            Ok(l) => {
                match serde_json::from_str::<Delta>(&l) {
                    Ok(delta) => deltas.push(delta),
                    Err(_) => {
                        // Corrupt entry — skip it (likely truncated write)
                        continue;
                    }
                }
            }
            Err(_) => break, // IO error, stop reading
        }
    }
    Ok(deltas)
}

/// Truncate (clear) the WAL file after a successful snapshot
pub fn truncate_wal(tab_dir: &Path) -> std::io::Result<()> {
    let wal_path = tab_dir.join("wal.log");
    if wal_path.exists() {
        File::create(&wal_path)?; // Truncates to zero length
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_append_and_read_deltas() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        let deltas = vec![
            Delta { timestamp_ms: 1000, position: 0, delete_count: 0, inserted: "Hello".into() },
            Delta { timestamp_ms: 2000, position: 5, delete_count: 0, inserted: " World".into() },
            Delta { timestamp_ms: 3000, position: 11, delete_count: 0, inserted: "!".into() },
        ];

        for d in &deltas {
            append_delta(&dir, d).unwrap();
        }

        let read = read_deltas(&dir).unwrap();
        assert_eq!(read.len(), 3);
        assert_eq!(read[0].inserted, "Hello");
        assert_eq!(read[1].inserted, " World");
        assert_eq!(read[2].inserted, "!");
        assert_eq!(read[0].timestamp_ms, 1000);
        assert_eq!(read[1].position, 5);
        assert_eq!(read[2].delete_count, 0);
    }

    #[test]
    fn test_read_empty_wal() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();
        let deltas = read_deltas(&dir).unwrap();
        assert!(deltas.is_empty());
    }

    #[test]
    fn test_corrupt_trailing_entry() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        let delta = Delta { timestamp_ms: 1000, position: 0, delete_count: 0, inserted: "Hello".into() };
        append_delta(&dir, &delta).unwrap();

        // Append corrupt data manually
        let wal_path = dir.join("wal.log");
        let mut file = OpenOptions::new().append(true).open(&wal_path).unwrap();
        writeln!(file, "{{corrupt json data").unwrap();

        let read = read_deltas(&dir).unwrap();
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].inserted, "Hello");
    }

    #[test]
    fn test_truncate_wal() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        let delta = Delta { timestamp_ms: 1000, position: 0, delete_count: 0, inserted: "Hello".into() };
        append_delta(&dir, &delta).unwrap();

        let read = read_deltas(&dir).unwrap();
        assert_eq!(read.len(), 1);

        truncate_wal(&dir).unwrap();

        let read = read_deltas(&dir).unwrap();
        assert!(read.is_empty());
    }

    #[test]
    fn test_append_empty_delta() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        let delta = Delta { timestamp_ms: 1000, position: 0, delete_count: 0, inserted: "".into() };
        append_delta(&dir, &delta).unwrap();

        let read = read_deltas(&dir).unwrap();
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].inserted, "");
        assert_eq!(read[0].delete_count, 0);
    }

    #[test]
    fn test_append_large_delta() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        let large_str = "x".repeat(1_000_000);
        let delta = Delta { timestamp_ms: 1000, position: 0, delete_count: 0, inserted: large_str.clone() };
        append_delta(&dir, &delta).unwrap();

        let read = read_deltas(&dir).unwrap();
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].inserted.len(), 1_000_000);
        assert_eq!(read[0].inserted, large_str);
    }

    #[test]
    fn test_read_deltas_from_nonexistent_file() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("nonexistent_subdir");
        // Directory doesn't exist, so wal.log won't exist
        let deltas = read_deltas(&dir).unwrap();
        assert!(deltas.is_empty());
    }

    #[test]
    fn test_append_delta_special_characters() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        let special = "line1\nline2\ttab\r\n🎉🚀 emoji \0 null byte 中文";
        let delta = Delta { timestamp_ms: 42, position: 0, delete_count: 0, inserted: special.into() };
        append_delta(&dir, &delta).unwrap();

        let read = read_deltas(&dir).unwrap();
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].inserted, special);
    }
}
