# AGENTS.md — Plotline

> Tauri 2.0 (Rust) + React 18 / TypeScript + Vite desktop app. "GitHub Actions for knowledge work."

## Current state

**No code exists yet.** This repo contains design docs and a binding implementation contract. Every future OpenCode session starts by reading these docs before writing any code.

## Architecture (from docs/)

| Layer | Tech | Entrypoint |
|-------|------|------------|
| Desktop shell | Tauri 2.0 | `src-tauri/src/main.rs` |
| Backend engine | Rust (async/tokio) | `src-tauri/src/lib.rs` (module decls) |
| Frontend | React 18 / TypeScript | `src/main.tsx` |
| IPC bridge | Tauri commands + events | `src-tauri/src/commands.rs` ↔ `src/api/tauri.ts` |

**Rust modules** (strict separation): `workflow`, `substitution`, `engine`, `openrouter`, `run_manager`, `config`, `commands`, `error`.

**Frontend layers**: `api/` (typed invoke wrappers) → `hooks/` (state) → `components/` (UI).

## Implementation rules (NON-NEGOTIABLE)

`docs/roadmap.md` is a **binding implementation contract** with 16 sequential Work Packages (WP0–WP16). Key constraints:

- **Strictly sequential.** Never parallelize, skip, or reorder Work Packages.
- **Zero-tolerance verification.** Every WP requires: all tasks done, all acceptance criteria proven, 100% test coverage for new code, **full** `cargo test` and `npm test` suites passing, `cargo check` zero warnings, `npm run build` zero errors, `npx tsc --noEmit` zero errors.
- **Verification report format** is mandatory (see `docs/roadmap.md` Appendix A). No WP is "done" without it.
- **No unapproved dependencies.** Only crates/npm packages listed in `docs/technical_specification.md` Section 3.
- **No skipped tests.** No `#[ignore]`, no `.skip`, no exceptions.
- **Regression testing every WP.** All previous WP tests must still pass.

Read `docs/example_prompt.md` for the intent behind this rigor.

## Developer commands

```bash
# Dev mode (Vite + Tauri)
npm run tauri dev

# Production build
npm run tauri build

# Rust tests (all)
cd src-tauri && cargo test

# Rust tests (filtered)
cd src-tauri && cargo test <module_name>

# Rust check (no build)
cd src-tauri && cargo check

# Frontend tests
npm test

# Frontend typecheck
npx tsc --noEmit

# Frontend build only
npm run build
```

## Key design decisions an agent would miss

### Data flow quirk: prompts are snapshotted, variables are live

During execution, the engine reads prompt files from the **run snapshot** (`_prompts/`), but resolves variable files from the **project root** (`project_root/variables/`). This means editing a prompt file mid-run won't affect the running workflow, but editing a variable file will.

### Step output paths are 1-indexed, code indices are 0-indexed

`run_manager::step_output_path(index=0, name="outline")` produces `step_01_outline.md`. Always: `format!("step_{:02}_{}.md", index + 1, name)`.

### Context concatenation format

The engine appends previous output with exactly: `\n\n---\n\nPrevious Step Output:\n\n{content}`. The prompt author has no control over where context goes — it is always appended.

### Variable substitution syntax

`{{variables.<name>}}` → resolves `<project_root>/variables/<name>.md`. Other `{{...}}` patterns are left untouched (no error). Regex: `\{\{variables\.([a-zA-Z0-9_-]+)\}\}`.

### API key never in settings.json

`tauri-plugin-store` (settings.json) stores only `project_root` and model defaults. The OpenRouter API key goes to the OS keyring: service `plotline`, account `openrouter`.

### CSP restricts connections

`tauri.conf.json` CSP: `connect-src 'self' https://openrouter.ai`. All HTTP goes through Rust backend, but CSP is defense-in-depth.

### Vite port is locked

Port 1420, `strictPort: true`. The Tauri dev server expects this exact port.

### Only one workflow at a time (MVP)

No background job queue. The engine runs as a single async Tauri command. The frontend must disable "Run" buttons during execution.

### Run directory naming: collision handling

Format: `runs/YYYY-MM-DD-HHMM-<slug>/`. If a directory exists, append `-2`, `-3`, etc. Slugify rules: lowercase, spaces→hyphens, strip non-`[a-z0-9-]`, collapse consecutive hyphens, trim leading/trailing, truncate to 50, fallback to `"unnamed"`.

### OpenRouter requirements

All requests must include headers: `HTTP-Referer: https://plotline.app` and `X-Title: Plotline`. Non-streaming only for MVP (`"stream": false`). 30-second timeout. Error mapping: 401→ApiKeyInvalid, 429→RateLimited, 5xx→ProviderError, timeout→NetworkTimeout.

### Directory structure conventions

```
src-tauri/src/         # Rust source
src-tauri/tests/fixtures/project/  # Rust test fixtures
src/                   # Frontend source
src/api/tauri.ts       # Typed IPC wrappers (invoke)
src/hooks/             # React hooks (useTauriEvent, useRunState, useProjectRoot)
src/components/        # React components
src/types/index.ts     # Shared TypeScript types
src/styles/global.css  # Dark theme CSS variables
docs/                  # Design docs (read before implementing)
```

### Dark theme CSS variables

Background: `#1a1a2e`, panels: `#16213e`, accents: `#0f3460`, primary action: `#e94560`. Monospace for status, sans-serif for UI.

## References

- `docs/design_document.md` — Architecture and design decisions
- `docs/technical_specification.md` — Module specs, types, API contracts
- `docs/roadmap.md` — Implementation contract (16 WPs)
- `docs/example_prompt.md` — How to prompt an AI to implement this project
- `README.md` — User-facing overview
