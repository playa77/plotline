# Changelog

All notable changes to Plotline are recorded here. This project follows a
docs-first development model against a versioned document suite in `docs/`;
entries reference work packages (WP-xx) from `docs/plotline-roadmap-v0.1.0.md`
where applicable. Format is loosely [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow the document suite version (currently `0.1.0-dev`).

## [0.1.0-dev] — unreleased

### Added
- **2026-07-16** — WP-00: Repository scaffold — Electron + React + TypeScript
  toolchain with Electron Forge + Vite plugin, Vitest, ESLint flat config,
  Prettier, strict TS config, and decision ledger (`DECISIONS.md`). Creates
  empty Electron window titled "Plotline" with sandboxed renderer
  (`contextIsolation: true`, `nodeIntegration: false`). (commit pending)

### Changed
- **2026-07-16** — Replaced project `AGENTS.md` (previously a verbatim
  duplicate of the global `~/.config/opencode/AGENTS.md`) with
  project-specific guidance only: docs-first read protocol, architecture
  invariants (sandboxed renderer, Git-as-object-DB, two-repo split,
  keychain API keys, Substack-safe HTML, one-click pipeline contract),
  work-package workflow, and build/runtime gotchas (Tectonic, AppImage).
  Global rules are no longer duplicated. (commit `0879167`)
