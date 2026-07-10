# Changelog

All notable changes to the Plotline project.

## [1.0.0] — 2026-07-10 (in progress)

### Feature — ChapterPicker combobox in WorkflowRunDialog (2026-07-10)
- `WorkflowRunDialog` now detects chapter-like variables (name matching
  `/^chapter/i`, e.g. `chapter_spec`, `chapter_number`) and renders them as a
  `ChapterPickerField` combobox instead of a plain textarea.
- The combobox offers a dropdown of chapters parsed from the `book_outline`
  variable via `parseChaptersFromOutline()` (from `src/utils/chapters.ts`).
  Chapters are parsed live from the dialog's `values` state, so editing the
  outline textarea reactively updates the picker's dropdown options.
- Selecting a chapter from the dropdown sends the chapter number (e.g. "3")
  as the variable value, but the input displays the full label (e.g.
  "Chapter 3: The Method"). This display/value divergence is managed with a
  `skipSyncRef` that prevents the value-sync effect from overwriting the
  label with the raw number after a dropdown selection.
- Free-text entry is always available: typing a custom value sends that raw
  text as both the display and the value.
- Keyboard navigation: ArrowDown/Up navigate chapters, Enter selects,
  Escape/Tab close the dropdown. Cmd/Ctrl+Enter passes through to the
  dialog's global Run handler.
- Edge cases handled: if `book_outline` exists with content but no parseable
  chapters, shows a "No chapters detected in outline" hint and falls back to
  a text input. If no `book_outline` variable exists, silently falls back to
  a text input with placeholder "e.g., 3 or Chapter 3".
- Visual prominence: the chapter picker card has a coral-tinted background,
  an inset accent left bar (via box-shadow to avoid box-model shift), a
  "chapter picker" badge, and a larger sans-serif input (15px vs 13px mono
  textarea) to signal it as the primary action target.
- New CSS classes added to `WorkflowRunDialog.module.css`: `.chapterCard`,
  `.chapterBadge`, `.pickerContainer`, `.pickerInputWrap`, `.pickerInput`,
  `.pickerToggle`, `.pickerHint`, `.pickerDropdown`, `.pickerOption`,
  `.pickerOptionActive`, `.pickerOptionNum`, `.pickerOptionLabel`, plus
  `dropdownIn` keyframe animation. No separate CSS file created.
- `WorkflowRunDialog.tsx` version bumped to 1.1.0.

### Feature — OpenRouter retry with exponential backoff (2026-07-10)
- Added retry logic to `openrouter::complete()` per global AGENTS.md "Respectful API usage"
  requirement. Up to 3 retries with exponential backoff (1s, 2s, 4s) for transient failures.
- New `is_retryable_error()` classifies errors: retryable (network timeout, connection failure,
  HTTP 5xx, body decode glitch, response parse error) vs. non-retryable (401 auth, 429 rate
  limit, API key not set, config/permanent errors).
- Verbose logging with ISO 8601 timestamps on every retry attempt, including the previous
  error and backoff delay.
- Body decode failures with HTTP 200 (e.g., truncated chunked response) are now retried
  instead of immediately failing the run with a confusing "HTTP 200: error decoding response
  body" message.

### Feature — WorkflowRunDialog: pre-flight variable editor (2026-07-10)
- New `WorkflowRunDialog` component (`src/components/WorkflowRunDialog.tsx` +
  `.module.css`): modal dialog that appears when running a workflow with
  `{{variables.<name>}}` placeholders. Shows each variable with a Title Case
  label, raw name, "from file" badge (if a default exists), "Used in: step1,
  step2" context, and an auto-resizing textarea (caps at 300px, then scrolls).
  Staggered card reveal animation (50ms per card). Escape cancels,
  Cmd/Ctrl+Enter runs. Uses CSS modules (not inline styles) as the pattern
  for new components.
- New `src/utils/variables.ts`: `scanWorkflowVariables()` reads the workflow
  YAML, extracts step prompt_file paths via a lightweight line-by-line parser
  (no js-yaml dependency), reads each prompt file, scans for the backend's
  `{{variables.<name>}}` regex, and loads current values from
  `<project_root>/variables/<name>.md`. Returns sorted `VariableInfo[]`.
  Also exports `titleCaseFromVariableName()` and `VariableInfo` type.
- `WorkflowSelector.tsx` modified: `handleRun` now scans for variables first.
  Zero variables → runs immediately (no dialog). Variables found → opens
  `WorkflowRunDialog`. New `handleDialogRun` passes edited values to the
  backend as `variable_overrides`, which take precedence over file-based
  values in `substitution.rs` without mutating any project files on disk.
  Errors shown in the dialog footer so the user can retry without losing edits.
- Backend: `substitution::substitute_variables` now accepts `variable_overrides:
  &HashMap<String, String>` — checks overrides first, falls back to
  `<project_root>/variables/<name>.md`. `engine::run_workflow` and the
  `run_workflow` IPC command accept `variable_overrides: HashMap<String, String>`.
- New API wrapper `runWorkflow()` in `src/api/tauri.ts` accepts optional
  `variableOverrides: Record<string, string>`.
- Design: dialog matches SettingsModal aesthetic (same overlay gradient/blur,
  coral hairline border, panel animation) but wider (640px) for textareas.
  Variable cards have subtle accent background that brightens on focus-within.

### Bugfix — Run directory race condition (2026-07-10)
- Fixed double directory creation: `commands::run_workflow` now snapshots `_workflow.yaml`
  into the pre-created run dir before returning to the frontend, so `getRunStatus`
  can immediately find steps instead of showing "No steps found for this run."
- Changed `engine::run_workflow` to accept a pre-created `run_dir: &Path` parameter
  instead of creating its own directory (which previously collided and created a -2
  suffixed clone, leaving the original empty).

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
- 19 unit tests (slugify edge cases, collision handling, snapshot subdirs, read/write/infer)

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
- 17 unit tests (delete_subsequent_outputs, context format, re-run logic, event serialization)

### WP7 — IPC Commands & Config
- All 15 Tauri commands implemented and registered: `run_workflow`, `rerun_from_step`, `save_output`, `save_variable`, `cancel_workflow`, `write_file_content`, `get_run_status`, `list_workflows`, `list_runs`, `read_file_content`, `set_api_key`, `get_api_key`, `has_api_key`, `set_project_root`, `get_project_root`
- `run_workflow` and `rerun_from_step` use `tauri::async_runtime::spawn` for background execution
- `config.rs`: API key via OS keyring (service `plotline`, account `openrouter`)
- `set_project_root`/`get_project_root` via `tauri-plugin-store`
- `list_runs` sorts by `started_at` descending (newest first)
- `list_workflows` filters for `.yaml`/`.yml` files, skips unparsable files with warning
   - `save_variable`/`cancel_workflow`/`write_file_content` commands for variable persistence, run cancellation, and arbitrary file writes

### WP8 — Frontend Foundation
- `src/api/tauri.ts`: typed IPC wrappers for all 15 commands
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

### WP14.1 — Settings Fixes (2026-07-10)
- Fixed directory picker: switched from dynamic `import(@vite-ignore)` to static `import { open } from "@tauri-apps/plugin-dialog"`. The dynamic import failed at runtime in the Tauri WebView because bare module specifiers can't resolve as URLs after Vite ignores them.
- Fixed project root not updating after Settings save: added `refresh()` to `useProjectRoot` hook and call it in `App.handleCloseSettings`. Previously the hook only loaded once on mount, so closing Settings left the main UI showing stale state (empty sidebar, "No project root set" footer).

### Documentation
- Rewrote `README.md` as a comprehensive user guide: quick start, project structure, workflow YAML format with field reference, model selection table, execution flow, context chaining, variable substitution, run directory anatomy, re-run from step, typical use cases (serial pipeline, iterative editing, parameterized generation, A/B testing), UI reference diagram, key design decisions, and MVP limitations.
