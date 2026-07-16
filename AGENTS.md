# Plotline — AGENTS.md

Project-specific guidance for OpenCode sessions. The global rules (decision ledger, worktree contract, filesystem deny list, self-grading ban, etc.) are loaded separately from `~/.config/opencode/AGENTS.md` and are NOT repeated here. When the two conflict on a project matter, this file wins for Plotline-specific concerns.

Plotline is a Tauri 2.0 desktop app: a React/TypeScript webview (`src/`) orchestrating a Rust execution engine (`src-tauri/src/`) that runs YAML-defined AI workflows against the OpenRouter API. See `README.md` for the user-facing model and `docs/technical_specification.md` for the architecture contract.

---

## Commands

| Task | Command | Notes |
|---|---|---|
| Dev (full app) | `npm run tauri dev` | Runs Vite (:1420) **and** the Rust core together. Do **NOT** use `npm run dev` — that starts only Vite and the Tauri webview will fail to load. |
| Prod build | `npm run tauri build` | Output in `src-tauri/target/release/bundle/`. |
| Frontend typecheck | `npx tsc --noEmit` | There is **no `lint` script and no eslint/prettier**. Typecheck is the only static gate. `npm run build` (`tsc && vite build`) also typechecks. |
| Frontend tests (one-shot) | `npx vitest run` | `npm test` runs `vitest` in **watch mode** — use `vitest run` in scripts/CI. |
| Single frontend test | `npx vitest run src/__tests__/api.test.ts` | |
| Rust tests | `cd src-tauri && cargo test` | Must run from `src-tauri/`. |
| Single Rust module | `cd src-tauri && cargo test substitution` | Filters by module path (e.g. `workflow`, `engine`, `run_manager`, `openrouter`). |

**Pre-commit gate order:** `npx tsc --noEmit` → `npx vitest run` → `cd src-tauri && cargo test`. There is no CI, so these gates only run if you run them.

Prerequisites: Node ≥20, Rust stable, and the [Tauri 2.0 system deps](https://tauri.app/start/prerequisites/). `reqwest` uses `rustls-tls`, so no system OpenSSL is required.

---

## Architecture

Two processes communicating over Tauri IPC:

- **Frontend** (`src/`): React 18 + Vite. Entry `src/main.tsx` → `App.tsx` (three-panel layout). IPC wrappers in `src/api/tauri.ts`; types mirroring Rust in `src/types/index.ts`. Hooks in `src/hooks/` (`useRunState`, `useProjectRoot`, `useTauriEvent`). Components in `src/components/`.
- **Backend** (`src-tauri/src/`): Crate name `plotline_lib` (lib + `cdylib` + `staticlib`). Entry `lib.rs::run()` registers all 15 IPC commands and the `store` + `dialog` plugins. `main.rs` just calls `run()`. Modules are **strictly separated** (per the architecture contract in `lib.rs`): `commands.rs` (IPC handlers) → `engine.rs` (execution loop) → `workflow.rs` (parse/validate), `substitution.rs` (variable injection), `run_manager.rs` (run dirs/snapshots/status), `openrouter.rs` (HTTP client), `config.rs` (API key via keyring), `error.rs` (`PlotlineError`, 15 variants).

The IPC boundary is the contract between the two halves: every Rust `#[tauri::command]` in `commands.rs` has a typed wrapper in `src/api/tauri.ts`. Changing one side requires changing the other.

---

## IPC naming — easy to get wrong

- **Command names** are snake_case strings passed to `invoke("run_workflow", ...)`.
- **Argument keys** are camelCase in TypeScript (`workflowPath`, `projectRoot`, `variableOverrides`) and Tauri auto-maps them to snake_case Rust params (`workflow_path`, `project_root`, `variable_overrides`). Mismatching the casing = silent argument-drop / IPC failure.
- **Event payloads** from Rust use `#[serde(rename_all = "camelCase")]` so frontend receives camelCase. Preserve this when adding events.

---

## Testing quirks

- **Rust tests are inline** — each module has a `#[cfg(test)] mod tests` block. `src-tauri/tests/` holds **only fixtures** (`fixtures/project/` with sample `workflows/`, `prompts/`, `variables/`), not integration test files. Inline tests reference these fixtures by relative path.
- **`openrouter.rs` tests are async** — they use `#[tokio::test]` + `wiremock` to spin up a mock HTTP server and override the endpoint via an env var. No real network calls; no OpenRouter key needed.
- **`config.rs` keyring tests need a Secret Service / D-Bus daemon** on Linux (the `keyring` crate uses the `linux-native` feature). On headless boxes without one, these tests **self-skip** (they do not fail). They are also serialized through a global mutex because they share the real `plotline/openrouter` keyring entry — don't run them in parallel with manual keyring writes.
- **Frontend tests mock `@tauri-apps/api/core`** via `vi.mock` (see `src/__tests__/api.test.ts`). Tauri APIs are unavailable under jsdom — any new test that touches IPC must mock `invoke`. Setup is `src/test-setup.ts` (jest-dom matchers); env is `jsdom`, `globals: true`.

---

## Operational gotchas

- **One workflow at a time.** Cancellation uses a global `static CANCEL_FLAG: Mutex<Option<Arc<AtomicBool>>>` in `engine.rs`. A second concurrent run overwrites the flag and breaks cancel for the first. The UI disables Run buttons during execution — preserve this.
- **Vite dev port 1420 is `strictPort: true`** because `tauri.conf.json` hardcodes `devUrl: http://localhost:1420`. Don't change the port without updating both files.
- **API key lives in the OS keyring** (service `plotline`, account `openrouter`), never in files. Project root is stored via `tauri-plugin-store` in `settings.json`. Do not write the API key to `settings.json` or any project file.
- **CSP** (`tauri.conf.json`) restricts `connect-src` to `'self' https://openrouter.ai`. Adding any other HTTP provider requires editing the CSP.
- **Prompts are frozen, variables are live.** At run start, prompt files are snapshotted into the run dir's `_prompts/`; variable files are read fresh from `<project_root>/variables/` on each step. Editing a prompt mid-run has no effect; editing a variable does.
- **Step output files are 1-indexed, code indices are 0-indexed.** `run_manager::step_output_path(index=0, name="outline")` writes `step_01_outline.md` (`format!("step_{:02}_{}.md", index + 1, name)`). Easy off-by-one bug source.
- **OpenRouter client** (`openrouter.rs`): non-streaming only (`stream: false`), 30s timeout, required headers `HTTP-Referer: https://plotline.app` and `X-Title: Plotline`. Status mapping: 401→`ApiKeyInvalid`, 429→`RateLimited`, 5xx/other→`ProviderError`, timeout→`NetworkTimeout`. Transient errors (network, 5xx, body decode) retry up to 3× with exponential backoff (1s/2s/4s); 401/429 do not retry.

---

## Persisted formats — R3, do not change without a decision

These are on-disk contracts users and re-runs depend on. Per global §2, changing them is an R3 decision (stop and surface branches):

- Run directory: `runs/YYYY-MM-DD-HHMM-<slug>/`, with `-2`, `-3`… collision suffixes. `slugify(name)`: lowercase, spaces→hyphens, strip non-`[a-z0-9-]`, collapse consecutive hyphens, trim leading/trailing, truncate to 50, fallback `"unnamed"`.
- Step output files: `step_{NN}_{name}.md` (1-indexed, zero-padded to 2 digits).
- Run snapshot: `_workflow.yaml` + `_prompts/` (preserving subdir structure).
- Context chaining: previous step output appended as `\n\n---\n\nPrevious Step Output:\n\n{content}`.
- Variable substitution regex: `\{\{variables\.([a-zA-Z0-9_-]+)\}\}`. Unknown `{{...}}` patterns are left untouched (no error).
- Workflow YAML schema: `name`, `steps[].name` (slug-safe `^[a-zA-Z0-9_-]+$`), `steps[].prompt_file`, `steps[].model` (OpenRouter ID). `prompt_file` paths are validated against traversal (`../` rejected).

---

## Repo conventions

- Commits land on `main` directly; history uses work-package-style messages (`WP0`…`WP14`) and informal `docs:`/`fix:` prefixes. No tags, no release process, no PR flow is enforced — match the surrounding style.
- Files carry a `// Version: x.y.z | YYYY-MM-DD` header comment and verbose "why" comments (not "what"). Follow this when adding new files.
- New UI components use **CSS Modules** (`*.module.css`), not inline styles — see `WorkflowRunDialog.module.css` / `SettingsModal.module.css` for the pattern. Global dark-theme variables live in `src/styles/global.css`: `--color-bg` (`#1a1a2e`), `--color-panel` (`#16213e`), `--color-accent` (`#0f3460`), `--color-primary` (`#e94560`). Use the custom properties, don't hardcode hex.
- `CHANGELOG.md` is append-only and detailed; log every change there as you go (global rule).
