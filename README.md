# RawNote

A lightweight, cross-platform note-taking editor with crash-proof persistence. Everything you type is saved — even if the app crashes.

## Features

- **Crash-proof editing** — Write-ahead log ensures zero data loss (every edit is fsynced to disk)
- **Tabs** — Create, rename, reorder, close (auto-archived)
- **Archive** — Closed tabs are archived, not deleted. Restore anytime.
- **Syntax highlighting** — 100+ languages via CodeMirror 6
- **Markdown preview** — Toggle with Cmd/Ctrl+P
- **Search** — Find in current tab (Cmd/Ctrl+F)
- **Customizable keybindings** — Edit `~/.rawnote/config.json`
- **Dark theme** — Easy on the eyes
- **Local-only** — No cloud, no accounts, no telemetry

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v18+)
- Platform dependencies for Tauri: see [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Development

```bash
# Clone and install
git clone <repo-url> && cd copilot-plainpad
npm install

# Run in development mode
npx tauri dev
```

### Production Build

```bash
npx tauri build
```

Outputs platform-specific installers in `src-tauri/target/release/bundle/`.

## Project Structure

```
copilot-plainpad/
├── src/                    # Frontend (TypeScript)
│   ├── main.ts             # Entry point
│   ├── app.ts              # App orchestrator
│   ├── editor.ts           # CodeMirror 6 wrapper
│   ├── tabs.ts             # Tab bar UI
│   ├── archive.ts          # Archive panel
│   ├── preview.ts          # Markdown preview (Marked)
│   ├── keybindings.ts      # Keybinding manager
│   ├── ipc.ts              # Tauri IPC wrappers
│   ├── types.ts            # TypeScript interfaces
│   └── styles/             # CSS
├── src-tauri/              # Backend (Rust)
│   └── src/
│       ├── lib.rs          # Tauri app setup and command registration
│       ├── commands.rs     # IPC command handlers + AppState
│       ├── persistence/
│       │   ├── wal.rs      # Write-ahead log (append, read, truncate)
│       │   ├── snapshot.rs # Atomic snapshot writes
│       │   ├── recovery.rs # Snapshot + WAL replay recovery
│       │   └── storage.rs  # App directory management
│       ├── tab/
│       │   ├── model.rs    # Tab struct
│       │   └── manager.rs  # Tab CRUD, session state, ordering
│       └── config/
│           └── model.rs    # AppConfig, EditorConfig, defaults
├── package.json
├── vite.config.ts
└── docs/
    └── architecture.md     # Detailed architecture documentation
```

## Data Storage

All data is stored locally in `~/.rawnote/` (macOS/Linux) or `%USERPROFILE%\.rawnote\` (Windows):

```
~/.rawnote/
├── config.json          # User configuration
├── session.json         # Active tab list and selection
└── tabs/
    └── {uuid}/
        ├── meta.json    # Tab metadata
        ├── content.txt  # Latest full snapshot
        └── wal.log      # Write-ahead log (delta journal)
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for:

- Crash-safety strategy (WAL + snapshots)
- Data model and file layout
- Recovery flow and corruption handling
- Platform differences (fsync, atomic rename)
- IPC command reference

## Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| New tab | Cmd+N | Ctrl+N |
| Close tab | Cmd+W | Ctrl+W |
| Find | Cmd+F | Ctrl+F |
| Next tab | Ctrl+Tab | Ctrl+Tab |
| Prev tab | Ctrl+Shift+Tab | Ctrl+Shift+Tab |
| Toggle preview | Cmd+P | Ctrl+P |
| Settings | Cmd+, | Ctrl+, |

All shortcuts are customizable in `~/.rawnote/config.json`.

## License

MIT
