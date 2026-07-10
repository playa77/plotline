# Changelog

All notable changes to the Plotline project.

## [1.0.0] — 2026-07-10 (in progress)

### WP0 — Project Scaffolding
- Tauri 2.0 + React 18 / TypeScript + Vite project initialized
- All Rust module placeholders created and declared in `lib.rs`
- Dependencies installed: tauri 2, serde, reqwest, tokio, keyring, chrono, etc.
- `tauri.conf.json` configured: window 1200x800, CSP, store plugin
- `vite.config.ts` configured: port 1420, strict port
- `.gitignore` created

### WP1 — Core Types & Error Handling
- `PlotlineError` enum (15 variants) with `thiserror::Error` derive
- `From<std::io::Error>`, `From<serde_yaml::Error>`, `From<reqwest::Error>` impls
- Rust types: `Workflow`, `Step`, `ResolvedStep`, `RunInfo`, `RunStepStatus`, `StepStatus`
- TypeScript types mirroring Rust types in `src/types/index.ts`

### WP2 — Workflow Parser
- `parse_workflow()`: YAML deserialization with file-not-found and parse-error handling
- `validate_workflow()`: name non-empty, steps non-empty, unique step names, slug-safe names (`^[a-zA-Z0-9_-]+$`), prompt file existence, path traversal rejection, model non-empty
- 13 unit tests with test fixtures under `src-tauri/tests/fixtures/project/`
- `WorkflowSummary` and `RunSummary` types for list_workflows/list_runs

### WP3 — Variable Substitution
- `substitute_variables()`: regex-based `{{variables.<name>}}` replacement from `project_root/variables/<name>.md`
- Unknown `{{...}}` patterns left untouched
- `VariableFileNotFound` error on missing variable files
- 12 unit tests (single, multiple, same-variable-twice, special chars, mixed placeholders, etc.)

### WP4 — Run Manager
- `slugify()`: lowercase, spaces→hyphens, strip non-[a-z0-9-], collapse hyphens, truncate to 50, fallback "unnamed"
- `create_run_directory()`: timestamped `YYYY-MM-DD-HHMM-<slug>` with `-2`/`-3` collision suffixes
- `snapshot_workflow()`: copies workflow YAML + prompt files (preserving subdirectory structure)
- `step_output_path()`: 1-indexed zero-padded `step_01_<name>.md`
- `read_step_output()`, `write_step_output()`, `infer_run_status()`
- 20 unit tests (slugify edge cases, collision handling, snapshot subdirs, read/write/infer)

### WP5 — OpenRouter Client
- `complete()`: POST to `https://openrouter.ai/api/v1/chat/completions` with 30s timeout
- Required headers: `Authorization`, `Content-Type`, `HTTP-Referer`, `X-Title`
- Status code mapping: 200→parse, 401→ApiKeyInvalid, 429→RateLimited, 5xx→ProviderError
- `parse_success_body()`: extracts `choices[0].message.content` and usage tokens
- 11 wiremock integration tests (success, error codes, timeout, malformed JSON, missing fields, headers)

### WP6 — Execution Engine
- `run_workflow()`: parse→validate→create run dir→snapshot→sequential step execution→events
- `rerun_from_step()`: load snapshot workflow, validate index, delete subsequent outputs, execute from step
- Context concatenation: `\n\n---\n\nPrevious Step Output:\n\n{content}`
- Prompts from snapshot (`_prompts/`), variables from live project root
- 5 event payload types with camelCase serde serialization
- 19 unit tests (delete_subsequent_outputs, context format, re-run logic, event serialization)

### WP7 — IPC Commands & Config
- All 12 Tauri commands implemented and registered: `run_workflow`, `rerun_from_step`, `save_output`, `get_run_status`, `list_workflows`, `list_runs`, `read_file_content`, `set_api_key`, `get_api_key`, `has_api_key`, `set_project_root`, `get_project_root`
- `run_workflow` and `rerun_from_step` use `tauri::async_runtime::spawn` for background execution
- `config.rs`: API key via OS keyring (service `plotline`, account `openrouter`)
- `set_project_root`/`get_project_root` via `tauri-plugin-store`
- `list_runs` sorts by `started_at` descending (newest first)
- `list_workflows` filters for `.yaml`/`.yml` files, skips unparsable files with warning

### WP8 — Frontend Foundation
- `src/api/tauri.ts`: typed IPC wrappers for all 12 commands
- `useTauriEvent<T>` hook with stale-closure protection via refs
- `useRunState` hook: manages `stepStatuses` Map, run lifecycle (isRunning, isComplete, hasError, isRerun)
- `useProjectRoot` hook: load/save project root via `tauri-plugin-store`
- `App.tsx`: three-panel layout (sidebar + main content + footer), view switching (`selector`/`monitor`/`output`/`settings`)
- `global.css`: dark theme with CSS custom properties (`--color-bg`, `--color-panel`, `--color-accent`, `--color-primary`, etc.)

### WP9 — Settings UI
- `SettingsModal.tsx`: project root (Change... button via `@tauri-apps/plugin-dialog`) + API key input with status indicator
- `Toast.tsx`: dependency-free toast notification system using `useSyncExternalStore`, 4s auto-dismiss, success/error variants
- Dynamic import pattern for `@tauri-apps/plugin-dialog` to avoid bundling at top-level

### WP10 — Workflow Selector UI
- `WorkflowSelector.tsx`: lists workflows (name, step count, Run button) + run history (name, date, progress)
- "Run" buttons disabled during active workflow execution
- "Create a workflow YAML file in your project's workflows/ directory." empty state
- Refresh button for manual re-fetch

### WP11 — Run Monitor UI
- `RunMonitor.tsx`: loads initial status from filesystem, merges with live event-driven state
- `StepCard.tsx`: visual state indicators (pending ○ gray, running ▶ blue, completed ✓ green, error ✗ red)
- "View Output" button on completed steps, "Re-run from here" on completed/errored steps
- Elapsed time counter (1Hz update while running)
- Re-run badge ("Re-running from Step N"), Completed/Failed badges
- Error summary display

### WP12 — Output Editor UI
- `OutputEditor.tsx`: dual-mode (view: `react-markdown` rendering, edit: CodeMirror with Markdown syntax highlighting)
- Save via `saveOutput` IPC, success toast on save
- Unsaved changes discard confirmation dialog
- Large output warning (>100KB threshold)
- Character count in status bar

### WP13 — Re-run Integration
- Re-run button wired in `StepCard` → calls `rerunFromStep(runDir, stepIndex)`
- `markAsRerun()` in `useRunState` sets `isRerun` and `rerunFromIndex`
- "Uses the original workflow snapshot." tooltip on re-run button

### WP14 — Error Handling & Polish
- `ErrorBoundary.tsx`: class-based React error boundary with fallback UI (overlay, error details, Reload button)
- Toast notifications for save errors, run errors, API key errors
- Settings prompt button when project root is not set
- Graceful handling of missing `workflows/` directory, corrupted run directories, unparsable workflow files
