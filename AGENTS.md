# AGENTS.md — Plotline

> Tauri 2.0 (Rust) + React 18 / TypeScript + Vite desktop app. "GitHub Actions for knowledge work."

## Current state

The full MVP backend is implemented and tested: workflow parsing/validation, variable substitution, OpenRouter client, execution engine, run manager, config/keyring, and all 15 IPC commands. The frontend is fully built: typed API wrappers, all hooks (useTauriEvent, useRunState, useProjectRoot), and all components (WorkflowSelector, RunMonitor, StepCard, OutputEditor with CodeMirror, PromptEditorModal, WorkflowRunDialog, SettingsModal, Toast, ErrorBoundary). Build and test pipelines pass with 86 Rust tests and 35 frontend tests.

## Architecture

| Layer | Tech | Entrypoint |
|-------|------|------------|
| Desktop shell | Tauri 2.0 | `src-tauri/src/main.rs` (calls `plotline_lib::run()`) |
| Backend engine | Rust (async/tokio) | `src-tauri/src/lib.rs` (module decls + Tauri builder) |
| Frontend | React 18 / TypeScript | `src/main.tsx` |
| IPC bridge | Tauri commands + events | `src-tauri/src/commands.rs` ↔ `src/api/tauri.ts` |

**Rust crate name**: `plotline_lib`. Library crate with `lib`, `cdylib`, and `staticlib` types.
**Rust modules**: `workflow`, `substitution`, `engine`, `openrouter`, `run_manager`, `config`, `commands`, `error`.
**Frontend layers**: `api/` (typed invoke wrappers) → `hooks/` (state) → `components/` (UI). All layers are fully implemented and tested.

## Developer commands

All commands run from repo root unless noted:

```bash
# Dev (full Tauri app with hot-reload):
npm run tauri dev

# Dev (Vite frontend only, no Rust backend):
npm run dev

# Full production build:
npm run tauri build

# Frontend build only (tsc + vite):
npm run build

# Frontend typecheck:
npx tsc --noEmit

# Rust check and tests run from src-tauri/:
cargo check         # (in src-tauri/)
cargo test          # (in src-tauri/) - 86 tests pass (all modules)
cargo test <module> # (in src-tauri/) - filtered run

# Frontend tests (vitest):
npm test
```

**Test config**: Vitest with `jsdom` environment, `globals: true`, setup file `./src/test-setup.ts` (imports `@testing-library/jest-dom`). TypeScript is strict with `noUnusedLocals` and `noUnusedParameters`.

## Design decisions an agent would miss

### Data flow: prompts are snapshotted, variables are live

During execution, the engine reads prompt files from the **run snapshot** (`_prompts/`), but resolves variable files from the **project root** (`project_root/variables/`). Editing a prompt file mid-run won't affect the running workflow, but editing a variable file will.

### Step output paths are 1-indexed, code indices are 0-indexed

`run_manager::step_output_path(index=0, name="outline")` produces `step_01_outline.md`. Always: `format!("step_{:02}_{}.md", index + 1, name)`.

### Context concatenation format

The engine appends previous output with exactly: `\n\n---\n\nPrevious Step Output:\n\n{content}`. The prompt author has no control over where context goes — it is always appended.

### Variable substitution syntax

`{{variables.<name>}}` → resolves `<project_root>/variables/<name>.md`. Other `{{...}}` patterns are left untouched (no error). Regex: `\{\{variables\.([a-zA-Z0-9_-]+)\}\}`.

### API key never in settings.json

`tauri-plugin-store` (settings.json) stores only `project_root` and model defaults. The OpenRouter API key goes to the OS keyring: service `plotline`, account `openrouter`.

### CSP restricts connections

`tauri.conf.json` CSP: `default-src 'self'; connect-src 'self' https://openrouter.ai; style-src 'self' 'unsafe-inline'`. All HTTP goes through Rust backend, but CSP is defense-in-depth.

### Vite port is locked

Port 1420, `strictPort: true`. The Tauri dev server expects this exact port.

### Only one workflow at a time (MVP)

No background job queue. The engine runs as a single async Tauri command. The frontend must disable "Run" buttons during execution.

### Run directory naming: collision handling

Format: `runs/YYYY-MM-DD-HHMM-<slug>/`. If a directory exists, append `-2`, `-3`, etc. Slugify rules: lowercase, spaces→hyphens, strip non-`[a-z0-9-]`, collapse consecutive hyphens, trim leading/trailing, truncate to 50, fallback to `"unnamed"`.

### OpenRouter requirements

All requests must include headers: `HTTP-Referer: https://plotline.app` and `X-Title: Plotline`. Non-streaming only for MVP (`"stream": false`). 30-second timeout. Error mapping: 401→ApiKeyInvalid, 429→RateLimited, 5xx→ProviderError, timeout→NetworkTimeout.

### Tauri config

- App window: 1200×800, min 800×600
- Store plugin configured via Rust builder in `src-tauri/src/lib.rs` (`.plugin(tauri_plugin_store::Builder::new().build())`)
- `beforeDevCommand: "npm run dev"` — Vite starts before Tauri
- `beforeBuildCommand: "npm run build"` — frontend built before Tauri bundles

### Dark theme CSS variables

Already set up in `src/styles/global.css`: background `#1a1a2e`, panels `#16213e`, accents `#0f3460`, primary action `#e94560`. Monospace for status/code, sans-serif for UI. CSS custom properties (`--color-bg`, `--color-panel`, etc.) are available; use them rather than hardcoding colors.
