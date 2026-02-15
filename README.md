# RawNote

**A simple, fast, crash-proof text editor.** Nothing more, nothing less.

## Why RawNote?

I just want a simple editor. I don't need the hundreds of features in Notepad++ or Sublime — I need something that opens instantly, lets me jot things down across tabs, and never loses my work.

Notepad++ has also been [flagged with security vulnerabilities](https://nvd.nist.gov/) and is increasingly banned in corporate environments. RawNote is a clean, modern alternative built with security-conscious defaults: no plugins, no shell execution, no network access. Just a local text editor.

**RawNote's promise:** Everything you type is saved to disk immediately — even if the app crashes, your machine loses power, or you force-quit. Zero data loss, zero friction.

## Features

- ⚡ **Instant startup** — Opens in under a second, ~30 MB memory footprint
- 🔒 **Crash-proof** — Write-ahead log (WAL) fsyncs every edit to disk immediately
- 📑 **Tabs** — Create, rename (double-click or Cmd+R), drag to reorder, navigate with Cmd+Shift+[/]
- 📦 **Archive, don't delete** — Closing a tab archives it. Restore or permanently delete from the archive panel
- 🎨 **Syntax highlighting** — 100+ languages via CodeMirror 6
- 📝 **Markdown preview** — Toggle split view with Cmd+P
- 🔍 **Search** — Cmd+F to find in current tab
- 🌗 **Themes** — Light, Dark, or System (follows OS preference). Title bar follows theme
- ⚙️ **Settings tab** — Change theme, editor config, and keybindings from within the app
- 💾 **Save As** — Optionally save to a specific file path (Cmd+Shift+S). Unsaved tabs show a `~` indicator
- ⌨️ **Customizable keybindings** — All shortcuts configurable via settings or `~/.rawnote/config.json`
- 🖥️ **Cross-platform** — Windows, macOS, Linux
- 🚫 **Local-only** — No cloud, no accounts, no telemetry, no network access

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v18+)
- Platform dependencies for Tauri: see [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Development

```bash
git clone https://github.com/jcjc-dev/rawnote.git && cd rawnote
npm install
npx tauri dev
```

### Production Build

```bash
npx tauri build
```

Outputs platform-specific installers in `src-tauri/target/release/bundle/`.

## Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| New tab | Cmd+N | Ctrl+N |
| Close/archive tab | Cmd+W | Ctrl+W |
| Rename tab | Cmd+R | Ctrl+R |
| Next tab | Cmd+Shift+] | Ctrl+Shift+] |
| Previous tab | Cmd+Shift+[ | Ctrl+Shift+[ |
| Find | Cmd+F | Ctrl+F |
| Toggle markdown preview | Cmd+P | Ctrl+P |
| Save As | Cmd+Shift+S | Ctrl+Shift+S |
| Toggle archive | Cmd+Shift+A | Ctrl+Shift+A |
| Settings | Cmd+, | Ctrl+, |

All shortcuts are customizable in Settings or `~/.rawnote/config.json`.

## How It Works

RawNote uses a **write-ahead log** (WAL) to guarantee that every keystroke is durable on disk:

1. Every edit appends a delta to a per-tab `wal.log` file, followed by `fsync`
2. Every 50 edits (or 5 seconds), a full snapshot is atomically written
3. On startup, content is recovered by replaying the WAL on top of the last snapshot

Even if the app crashes mid-keystroke, at most the final character is lost. See [docs/architecture.md](docs/architecture.md) for the full crash-safety design.

## Data Storage

All data is stored locally in `~/.rawnote/` (macOS/Linux) or `%USERPROFILE%\.rawnote\` (Windows):

```
~/.rawnote/
├── config.json        # Settings and keybindings
├── session.json       # Active tab list and order
└── tabs/
    └── {uuid}/
        ├── meta.json    # Tab metadata (title, timestamps, archived flag)
        ├── content.txt  # Latest full snapshot
        └── wal.log      # Write-ahead log (edit deltas)
```

## Tech Stack

- **[Tauri 2](https://v2.tauri.app/)** — Lightweight desktop framework (~10 MB binary, uses OS webview)
- **Rust** — Backend persistence layer with direct `fsync` control
- **[CodeMirror 6](https://codemirror.net/)** — Editor component with 100+ language modes
- **TypeScript** — Frontend UI (vanilla, no framework)
- **[Marked](https://marked.js.org/)** — Markdown rendering

## Project Structure

```
├── src/                    # Frontend (TypeScript + CSS)
│   ├── app.ts              # App orchestrator
│   ├── editor.ts           # CodeMirror 6 wrapper
│   ├── tabs.ts             # Tab bar (drag, rename, reorder)
│   ├── archive.ts          # Archive panel (restore/delete)
│   ├── settings.ts         # Settings tab UI
│   ├── theme.ts            # Theme system (light/dark/system)
│   ├── preview.ts          # Markdown preview
│   ├── keybindings.ts      # Keybinding manager
│   └── ipc.ts              # Tauri IPC wrappers
├── src-tauri/              # Backend (Rust)
│   └── src/
│       ├── commands.rs     # IPC command handlers
│       ├── persistence/    # WAL, snapshots, recovery, storage
│       ├── tab/            # Tab model and manager
│       └── config/         # App configuration
└── docs/
    └── architecture.md     # Crash-safety design document
```

## License

MIT
