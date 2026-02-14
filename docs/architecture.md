# RawNote Architecture

## 1. Overview

RawNote is a lightweight, cross-platform desktop note-taking app designed to replace Notepad++/Sublime Text for quick daily notes. It prioritizes crash-proof persistence — every keystroke is durably saved, so no work is ever lost.

**Stack:**

- **Backend:** [Tauri 2](https://v2.tauri.app/) + Rust — handles all file I/O, persistence, and tab management
- **Frontend:** Vanilla TypeScript + [CodeMirror 6](https://codemirror.net/) — editor with syntax highlighting and Markdown preview
- **Preview:** [Marked](https://marked.js.org/) for Markdown rendering

**Why this stack:**

- **Lightweight** — ~30–60 MB RAM (vs Electron's 200+ MB)
- **Fast startup** — native binary, no JS runtime overhead
- **Crash-proof persistence** — Rust's `File::sync_all()` (fsync) guarantees durability; the WAL ensures at most one keystroke is lost on crash
- **Trivial Markdown preview** — web UI makes it a one-liner with Marked

## 2. Data Model

### Tab

```rust
struct Tab {
    id: String,          // UUID v4
    title: String,       // User-editable display name
    created_at: String,  // RFC 3339 timestamp
    updated_at: String,  // RFC 3339 timestamp, updated on every mutation
    archived: bool,      // Soft-delete flag (closed tabs are archived, not deleted)
}
```

### Session State

```rust
struct SessionState {
    active_tabs: Vec<String>,      // Ordered list of active (non-archived) tab IDs
    selected_tab: Option<String>,  // Currently selected tab ID
}
```

### AppConfig

```rust
struct AppConfig {
    keybindings: HashMap<String, String>,  // Action → shortcut mapping (e.g. "newTab" → "CmdOrCtrl+N")
    editor: EditorConfig,                  // Font size, tab size, word wrap, line numbers
    snapshot_interval_edits: u32,          // Snapshot after N edits (default: 50)
    snapshot_interval_ms: u64,             // Snapshot after K ms of inactivity (default: 5000)
}

struct EditorConfig {
    font_size: u32,    // Default: 14
    tab_size: u32,     // Default: 2
    word_wrap: bool,   // Default: true
    line_numbers: bool, // Default: true
}
```

### Delta (WAL entry)

```rust
struct Delta {
    timestamp_ms: u64,   // Unix timestamp in milliseconds
    position: usize,     // Character position in the document
    delete_count: usize, // Number of characters to delete at position
    inserted: String,    // Text to insert at position (after deletion)
}
```

A Delta represents a single text change: delete `delete_count` characters starting at `position`, then insert `inserted` at that position.

## 3. File Layout

All data is stored in `~/.rawnote/` (Linux/macOS) or `%USERPROFILE%\.rawnote\` (Windows):

```
~/.rawnote/
├── config.json          # User configuration (keybindings, editor settings, snapshot intervals)
├── session.json         # Active tab order and selected tab ID
└── tabs/
    └── {uuid}/
        ├── meta.json    # Tab metadata (title, timestamps, archived flag)
        ├── content.txt  # Latest full snapshot of tab content
        └── wal.log      # Write-ahead log (append-only delta journal)
```

**Key details:**

- Each tab gets its own directory under `tabs/`, named by its UUID
- `meta.json` is rewritten on rename, archive, or restore
- `content.txt` is written atomically (write to `.tmp`, fsync, rename)
- `wal.log` is append-only — each line is a JSON-serialized Delta
- `session.json` tracks which tabs are open and their order
- `config.json` is created with defaults on first run; user-editable

## 4. Crash-Safety Strategy

This is RawNote's defining feature. The persistence layer uses a **write-ahead log (WAL) + periodic snapshots** pattern, similar to databases like SQLite and PostgreSQL.

### Write-Ahead Log (WAL)

Every edit from the CodeMirror editor is sent to the Rust backend via the `append_delta` IPC command. The backend:

1. Serializes the delta as a JSON line
2. Appends it to `wal.log` (using `OpenOptions::append`)
3. Calls `File::sync_all()` (fsync) to flush to disk

Because each delta is a single JSON line followed by a newline, and the file is append-only, the WAL is always in a consistent state — even if the process crashes mid-write, only the last incomplete line would be corrupt.

**WAL entry format** (one JSON object per line):

```json
{"timestamp_ms":1706000000000,"position":0,"delete_count":0,"inserted":"Hello"}
{"timestamp_ms":1706000001000,"position":5,"delete_count":0,"inserted":" World"}
{"timestamp_ms":1706000002000,"position":6,"delete_count":5,"inserted":"Rust"}
```

### Periodic Snapshots

The frontend tracks an edit counter and a timer. A snapshot is triggered when either:

- The edit count reaches `snapshot_interval_edits` (default: **50** edits), or
- `snapshot_interval_ms` (default: **5000 ms**) have elapsed since the last snapshot with pending edits

The snapshot process (`update_tab_content` command):

1. Write the full document content to `content.txt.tmp`
2. Call `File::sync_all()` on the temp file (ensures all bytes are on disk)
3. Atomic rename: `content.txt.tmp` → `content.txt` (via `std::fs::rename`)
4. fsync the parent directory (Unix only — ensures the directory entry is durable)
5. Truncate `wal.log` to zero length (the WAL is no longer needed)

This guarantees that `content.txt` is always a **complete, valid** snapshot. The rename is atomic on all platforms for same-directory renames, so there's no window where `content.txt` could be partially written.

### Recovery Flow

On startup, for each tab, the `recover_tab` function:

1. **Read the snapshot:** Load `content.txt` as the base content (or start with an empty string if missing)
2. **Read the WAL:** Parse each JSON line from `wal.log` into a `Delta`
3. **Replay deltas:** For each delta, apply it to the content:
   - Delete `delete_count` characters starting at `position`
   - Insert `inserted` text at `position`
4. **Result:** Fully recovered content, identical to what the user last saw

**Edge cases:**

| Scenario | Behavior |
|----------|----------|
| `content.txt` exists, `wal.log` exists | Normal recovery: snapshot + replay WAL |
| `content.txt` exists, `wal.log` missing | Snapshot is the final content (no edits since last snapshot) |
| `content.txt` missing, `wal.log` exists | Start from empty string, replay all WAL deltas |
| Both missing | Empty tab (metadata in `meta.json` is preserved) |

### Corruption Handling

- **Truncated WAL entry:** If the last line in `wal.log` is incomplete JSON (e.g., process crashed mid-write), the parser skips it. All valid entries before it are replayed. At most the last few keystrokes are lost.
- **Corrupt WAL entry mid-file:** Any line that fails JSON parsing is skipped; parsing continues with the next line.
- **I/O error reading WAL:** Reading stops at the error; all deltas read up to that point are used.
- **Corrupt `content.txt`:** If the snapshot file is unreadable (I/O error), recovery falls back to WAL-only replay from an empty string.

### Comparison with Notepad++

| | Notepad++ | RawNote |
|--|-----------|---------|
| **Backup mechanism** | Periodic backup files (~10s intervals) + `session.xml` | WAL (every edit fsynced) + atomic snapshots |
| **Max data loss on crash** | Up to ~10 seconds of work | At most the last keystroke (one delta) |
| **Backup file format** | Full copy of the file | Append-only delta journal + periodic snapshots |
| **Recovery** | Restore from last backup | Replay WAL on top of last snapshot |

RawNote's WAL provides **sub-second durability**: every individual edit is fsynced to disk before the IPC call returns. The only way to lose data is if the OS lies about fsync (which some filesystems do — but that's an OS-level issue, not an app-level one).

## 5. Platform Differences

| Concern | macOS/Linux | Windows |
|---------|-------------|---------|
| **fsync** | `File::sync_all()` → `fsync()` | `File::sync_all()` → `FlushFileBuffers()` |
| **Directory fsync** | Performed after atomic rename (ensures rename durability) | Not performed (NTFS rename is durable without it) |
| **App directory** | `~/.rawnote/` | `%USERPROFILE%\.rawnote\` |
| **Home dir resolution** | `dirs::home_dir()` → `$HOME` | `dirs::home_dir()` → `%USERPROFILE%` |
| **Atomic rename** | `std::fs::rename` → `rename()` (POSIX atomic for same-dir) | `std::fs::rename` → `MoveFileEx` (atomic for same-dir) |

The `dirs` crate (v5) handles cross-platform home directory resolution. The `#[cfg(unix)]` conditional compilation ensures directory fsync only runs on Unix platforms.

## 6. IPC Command Reference

All commands are registered as Tauri commands and invoked from the frontend via `@tauri-apps/api`. They all receive `AppState` (which holds a `Mutex<TabManager>` and `Mutex<AppConfig>`) as managed state.

### Tab Management

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `create_tab` | `title: String` | `Tab` | Create a new tab with the given title. Adds to active list, selects it, saves session. |
| `rename_tab` | `id: String, title: String` | `()` | Rename a tab. Updates `meta.json` and `updated_at`. |
| `close_tab` | `id: String` | `()` | Archive a tab (alias for `archive_tab`). Removes from active list. |
| `archive_tab` | `id: String` | `()` | Archive a tab (set `archived: true`). Removes from active list, updates session. |
| `restore_tab` | `id: String` | `()` | Restore an archived tab. Sets `archived: false`, adds to active list, selects it. |
| `list_tabs` | — | `Vec<Tab>` | List all active (non-archived) tabs in display order. |
| `list_archived_tabs` | — | `Vec<Tab>` | List all archived tabs. |

### Content & Persistence

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `get_tab_content` | `id: String` | `String` | Recover tab content (snapshot + WAL replay). |
| `update_tab_content` | `id: String, content: String` | `()` | Write a full snapshot (atomic write) and truncate the WAL. |
| `append_delta` | `id: String, position: usize, delete_count: usize, inserted: String` | `()` | Append a single edit delta to the WAL (fsynced). |

### Configuration

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `get_config` | — | `AppConfig` | Get the current app configuration. |
| `save_config` | `config: AppConfig` | `()` | Save configuration to `config.json` and update in-memory state. |

## 7. Frontend Architecture

The frontend is **vanilla TypeScript** with no framework (no React, Vue, etc.). It uses Vite for bundling and development.

### Key Modules

```
src/
├── main.ts          # Entry point — creates and initializes the App
├── app.ts           # App class — orchestrates all components
├── editor.ts        # CodeMirror 6 wrapper (RawNoteEditor)
├── tabs.ts          # Tab bar UI (TabBar) — create, select, close, drag-to-reorder
├── archive.ts       # Archive panel (ArchivePanel) — slide-out panel for restoring tabs
├── preview.ts       # Markdown preview (MarkdownPreview) — renders via Marked
├── search.ts        # Search functionality
├── keybindings.ts   # KeybindingManager — reads shortcuts from config, registers handlers
├── ipc.ts           # Tauri IPC wrappers — typed functions calling Rust commands
├── types.ts         # TypeScript interfaces (Tab, Delta, AppConfig, EditorConfig)
└── styles/          # CSS stylesheets
```

### Editor

- **CodeMirror 6** with extensions for syntax highlighting (100+ languages via `@codemirror/language-data`), search (`@codemirror/search`), and autocompletion (`@codemirror/autocomplete`)
- Markdown-specific support via `@codemirror/lang-markdown`
- Editor changes are captured via CodeMirror's transaction system and forwarded to the Rust backend as deltas

### Snapshot Scheduling

The `App` class manages snapshot timing on the frontend side:
- An edit counter increments on every change
- When the counter reaches `snapshot_interval_edits` (default 50), a full snapshot is saved via `update_tab_content`
- A timer resets on each edit; if `snapshot_interval_ms` (default 5000ms) elapses with pending edits, a snapshot is saved
- Switching tabs or closing a tab also triggers a snapshot if there are pending edits

### Keybindings

Default keybindings (customizable in `~/.rawnote/config.json`):

| Action | Shortcut |
|--------|----------|
| New tab | `CmdOrCtrl+N` |
| Close tab | `CmdOrCtrl+W` |
| Find | `CmdOrCtrl+F` |
| Toggle preview | `CmdOrCtrl+P` |
| Next tab | `Ctrl+Tab` |
| Previous tab | `Ctrl+Shift+Tab` |
| Settings | `CmdOrCtrl+,` |

`CmdOrCtrl` maps to `Cmd` on macOS and `Ctrl` on Windows/Linux.
