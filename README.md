# BareNote

<p align="center">
  <img src="assets/icon.png" alt="BareNote icon" width="384" />
</p>

A simple, fast, crash-proof text editor. Built with [Tauri 2](https://v2.tauri.app/) and [CodeMirror 6](https://codemirror.net/).

Every keystroke is saved to disk immediately — even if the app crashes, your machine loses power, or you force-quit. No cloud, no accounts, no telemetry. Just a local text editor.

## Features

- Instant startup with ~30 MB memory footprint
- Crash-proof persistence via write-ahead log
- Tabs with drag-to-reorder, archive, and restore
- Syntax highlighting for 100+ languages
- Markdown preview
- Light, Dark, and System themes
- Customizable keybindings
- Cross-platform (macOS, Windows, Linux)

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v18+)
- Platform dependencies for Tauri: see [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Run in Development

```bash
git clone https://github.com/jcjc-dev/barenote.git && cd barenote
npm install
npx tauri dev
```

### Build for Production

```bash
npx tauri build
```

Outputs platform-specific installers in `src-tauri/target/release/bundle/`.

## Documentation

See [docs/architecture.md](docs/architecture.md) for the crash-safety design and technical details.

## License

MIT
