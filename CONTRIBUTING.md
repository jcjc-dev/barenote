# Contributing to BareNote

Thanks for your interest in contributing! This guide will help you get started.

## Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) 18+
- Tauri prerequisites for your platform — see the [official guide](https://v2.tauri.app/start/prerequisites/)

## Development Setup

```bash
git clone https://github.com/AumJavalable/barenote.git
cd barenote
npm install
npx tauri dev
```

## Project Structure

```
src/              # Frontend (TypeScript)
src-tauri/
  src/            # Rust backend (commands, persistence, config)
  capabilities/   # Tauri permission definitions
  Cargo.toml      # Rust dependencies
```

- **`src/`** — TypeScript frontend using Vite
- **`src-tauri/src/`** — Rust backend: Tauri commands, file persistence, tab management, and app config

## Running Tests

**Rust backend:**

```bash
cd src-tauri
cargo test
```

**Frontend:** Tests are coming soon. Contributions welcome!

## Submitting a Pull Request

1. Fork the repo and create a feature branch from `main`.
2. Make your changes and commit with a clear message.
3. Run `cargo test` in `src-tauri/` to verify nothing is broken.
4. Open a PR describing what you changed and why.
5. Link any related issues (e.g., `Closes #42`).

## Code Style

- **TypeScript:** Strict mode enabled (`tsconfig.json`). Follow existing patterns.
- **Rust:** Stable toolchain, no `unsafe` code. Run `cargo clippy` before submitting.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
