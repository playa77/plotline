# Implementation Roadmap

## Overview

This roadmap breaks the Plotline MVP into 16 sequential work packages. Each package is self-contained, has clear dependencies, and produces verifiable output. The coding agent should complete packages in order unless explicitly noted otherwise.

**Estimated total effort**: 8–12 hours of focused implementation time for a capable coding agent.

**Critical path**: WP0 → WP1 → WP2 → WP3 → WP4 → WP5 → WP6 → WP7 → WP8 → WP10 → WP11 → WP12 → WP13 → WP16

**Parallelizable after WP7**: WP9 can be done in parallel with WP10–WP12.

---

## WP0 — Project Scaffolding

**Objective**: Create a working Tauri 2.0 + React + TypeScript project that launches and displays a placeholder screen.

**Prerequisites**: Node.js 20+, Rust toolchain (stable), Tauri 2.0 CLI.

### Tasks

1. **Initialize Tauri project**
   ```bash
   npm create tauri-app@latest plotline -- --template react-ts
   cd plotline
   ```

2. **Verify project structure matches Doc 2, Section 2**
   - Create all directories listed in the project structure.
   - Create empty placeholder files for all Rust modules (`workflow.rs`, `engine.rs`, `substitution.rs`, `openrouter.rs`, `run_manager.rs`, `config.rs`, `error.rs`, `commands.rs`).
   - In `lib.rs`, add `mod` declarations for all modules.

3. **Add Rust dependencies to `Cargo.toml`**
   - Add all crates listed in Doc 2, Section 3 with specified versions.
   - Run `cargo check` to verify resolution.

4. **Add frontend dependencies to `package.json`**
   - Install all packages listed in Doc 2, Section 3.
   - Run `npm install`.

5. **Configure `tauri.conf.json`**
   - Set `productName` to `Plotline`.
   - Set `identifier` to `com.plotline.app`.
   - Set window dimensions (1200×800, min 800×600).
   - Set CSP policy as specified in Doc 2, Section 4.
   - Configure `beforeDevCommand` and `beforeBuildCommand`.

6. **Configure `vite.config.ts`**
   - Set port to 1420, `strictPort: true`.
   - Set build target to `es2021`.

7. **Configure `tsconfig.json`**
   - Use the configuration from Doc 2, Section 13.

8. **Configure Tauri capabilities**
   - Create `src-tauri/capabilities/default.json` with permissions from Doc 2, Section 4.

9. **Create placeholder `App.tsx`**
   - Render a centered `<h1>Plotline</h1>` and nothing else.
   - Verify the app launches with `npm run tauri dev`.

10. **Create `.gitignore`**
    ```
    node_modules/
    dist/
    src-tauri/target/
    src-tauri/gen/
    .DS_Store
    *.log
    ```

11. **Initialize git repository**
    ```bash
    git init
    git add -A
    git commit -m "WP0: Project scaffolding"
    ```

### Acceptance Criteria
- `npm run tauri dev` launches a desktop window titled "Plotline" displaying "Plotline" as a heading.
- `cargo check` passes with no errors.
- `npm run build` succeeds.
- All dependencies from Doc 2 are installed and resolvable.

### Files Created/Modified
- `Cargo.toml`, `tauri.conf.json`, `package.json`, `vite.config.ts`, `tsconfig.json`
- `src-tauri/capabilities/default.json`
- `src-tauri/src/*.rs` (empty placeholders with `mod` declarations)
- `src/App.tsx` (placeholder)
- `.gitignore`

---

## WP1 — Core Types & Error Handling

**Objective**: Define all Rust data types and error types that the rest of the backend depends on.

**Prerequisites**: WP0 complete.

### Tasks

1. **Implement `error.rs`**
   - Copy the `PlotlineError` enum from Doc 2, Section 8 (`error.rs` module spec).
   - Ensure `thiserror::Error` derive is applied.
   - Verify all variants have `#[error("...")]` messages.
   - Implement `From<std::io::Error>` for `PlotlineError` → `FilesystemError`.
   - Implement `From<serde_yaml::Error>` for `PlotlineError` → `WorkflowParseError`.
   - Implement `From<reqwest::Error>` for `PlotlineError` → map timeout vs other errors.

2. **Implement `workflow.rs` type definitions**
   - Copy `Workflow`, `Step`, `ResolvedStep`, `RunInfo`, `RunStepStatus`, `StepStatus` structs from Doc 2, Section 5.
   - Ensure all structs derive `Debug, Clone, Serialize, Deserialize`.
   - Ensure `StepStatus` uses `#[serde(rename_all = "snake_case")]`.

3. **Create frontend type definitions**
   - Create `src/types/index.ts` with all interfaces from Doc 2, Section 5.
   - Ensure types match Rust structs exactly (field names, types, nullability).

4. **Verify compilation**
   - `cargo check` must pass.
   - `npx tsc --noEmit` must pass.

### Acceptance Criteria
- `cargo check` passes.
- `npx tsc --noEmit` passes.
- All types defined in both Rust and TypeScript.
- Error types cover all failure modes listed in Doc 2, Section 11.

### Files Created/Modified
- `src-tauri/src/error.rs`
- `src-tauri/src/workflow.rs` (types only, no functions yet)
- `src/types/index.ts`

---

## WP2 — Workflow Parser

**Objective**: Parse and validate workflow YAML files.

**Prerequisites**: WP1 complete.

### Tasks

1. **Implement `parse_workflow` function in `workflow.rs`**
   ```rust
   pub fn parse_workflow(
       workflow_path: &Path,
       project_root: &Path,
   ) -> Result<Workflow, PlotlineError>
   ```

   - Read file at `workflow_path`.
   - Deserialize as YAML into `Workflow` struct.
   - If file doesn't exist → `WorkflowNotFound`.
   - If YAML is invalid → `WorkflowParseError`.

2. **Implement `validate_workflow` function in `workflow.rs`**
   ```rust
   pub fn validate_workflow(
       workflow: &Workflow,
       project_root: &Path,
   ) -> Result<(), PlotlineError>
   ```

   Validation rules (in order):
   - `name` is non-empty string.
   - `steps` is non-empty array.
   - Each step `name` is non-empty.
   - Each step `name` is unique within the workflow.
   - Each step `name` matches regex `^[a-zA-Z0-9_-]+$`.
   - Each `prompt_file` is non-empty.
   - Each `prompt_file` resolves to an existing file within `project_root` (resolve relative to project root, reject path traversal — no `..` components).
   - Each `model` is non-empty.

3. **Write unit tests in `workflow.rs`**
   - Create test fixtures directory: `src-tauri/tests/fixtures/project/`.
   - Create `workflows/valid.yaml` with 2 steps.
   - Create `workflows/empty_steps.yaml` (steps: []).
   - Create `workflows/duplicate_names.yaml` (two steps with same name).
   - Create `workflows/missing_prompt.yaml` (references non-existent file).
   - Create `prompts/step1.md` and `prompts/step2.md`.
   - Test cases:
     - `test_parse_valid_workflow` — parses successfully.
     - `test_parse_missing_file` — returns `WorkflowNotFound`.
     - `test_parse_invalid_yaml` — returns `WorkflowParseError`.
     - `test_validate_empty_steps` — returns `WorkflowValidationError`.
     - `test_validate_duplicate_names` — returns `WorkflowValidationError`.
     - `test_validate_missing_prompt_file` — returns `WorkflowValidationError`.
     - `test_validate_path_traversal` — prompt_file with `../` is rejected.

4. **Run tests**
   ```bash
   cd src-tauri && cargo test workflow
   ```

### Acceptance Criteria
- All unit tests pass.
- Path traversal is rejected (prompt_file containing `..` returns error).
- Empty workflow name or steps return validation errors.
- Missing prompt files return validation errors.

### Files Created/Modified
- `src-tauri/src/workflow.rs`
- `src-tauri/tests/fixtures/project/workflows/*.yaml`
- `src-tauri/tests/fixtures/project/prompts/*.md`

---

## WP3 — Variable Substitution

**Objective**: Replace `{{variables.<name>}}` placeholders in prompt text with file contents.

**Prerequisites**: WP1 complete.

### Tasks

1. **Implement `substitute_variables` function in `substitution.rs`**
   ```rust
   pub fn substitute_variables(
       prompt_content: &str,
       project_root: &Path,
   ) -> Result<String, PlotlineError>
   ```

   - Use regex: `\{\{variables\.([a-zA-Z0-9_-]+)\}\}`
   - For each match, capture group 1 as `var_name`.
   - Construct path: `project_root / "variables" / f"{var_name}.md"`.
   - If file exists, read contents and replace placeholder.
   - If file does not exist, return `VariableFileNotFound { path }`.
   - If no matches found, return original string unchanged.
   - Unknown `{{...}}` patterns (not matching `variables.` prefix) are left untouched.

2. **Write unit tests in `substitution.rs`**
   - Create test fixtures:
     - `tests/fixtures/project/variables/style.md` containing "Write in a dark, brooding tone."
     - `tests/fixtures/project/variables/protagonist.md` containing "John Doe, a retired detective."
   - Test cases:
     - `test_single_substitution` — one `{{variables.style}}` replaced.
     - `test_multiple_substitutions` — two different variables replaced.
     - `test_same_variable_twice` — `{{variables.style}}` appears twice, both replaced.
     - `test_no_variables` — text with no placeholders returned unchanged.
     - `test_unknown_placeholder_ignored` — `{{unknown.thing}}` left untouched.
     - `test_missing_variable_file` — returns `VariableFileNotFound`.
     - `test_variable_with_special_chars_in_name` — `{{variables.my-var_name}}` works.

3. **Run tests**
   ```bash
   cd src-tauri && cargo test substitution
   ```

### Acceptance Criteria
- All unit tests pass.
- Missing variable files produce a clear error with the file path.
- Non-variable placeholders are left untouched (no false positives).
- Multiple occurrences of the same variable are all replaced.

### Files Created/Modified
- `src-tauri/src/substitution.rs`
- `src-tauri/tests/fixtures/project/variables/*.md`

---

## WP4 — Run Manager

**Objective**: Create and manage run directories on the filesystem.

**Prerequisites**: WP1, WP2 complete.

### Tasks

1. **Implement `slugify` helper function**
   ```rust
   fn slugify(name: &str) -> String
   ```
   - Lowercase.
   - Replace spaces with hyphens.
   - Remove all characters except `a-z`, `0-9`, `-`.
   - Collapse consecutive hyphens into one.
   - Strip leading/trailing hyphens.
   - Truncate to 50 characters.
   - If result is empty, return `"unnamed"`.

2. **Implement `create_run_directory`**
   ```rust
   pub fn create_run_directory(
       project_root: &Path,
       workflow_name: &str,
   ) -> Result<PathBuf, PlotlineError>
   ```
   - Generate timestamp: `chrono::Local::now().format("%Y-%m-%d-%H%M")`.
   - Generate slug from `workflow_name`.
   - Directory name: `f"{timestamp}-{slug}"`.
   - Full path: `project_root / "runs" / dir_name`.
   - Create directory (and `runs/` parent if it doesn't exist).
   - Create `_prompts/` subdirectory inside run directory.
   - Return the absolute path.

3. **Implement `snapshot_workflow`**
   ```rust
   pub fn snapshot_workflow(
       run_dir: &Path,
       workflow_path: &Path,
       workflow: &Workflow,
       project_root: &Path,
   ) -> Result<(), PlotlineError>
   ```
   - Copy `workflow_path` to `run_dir / "_workflow.yaml"`.
   - For each step in `workflow.steps`:
     - Resolve `prompt_file` relative to `project_root`.
     - Copy to `run_dir / "_prompts" / <original_filename>`.
     - Preserve directory structure if prompt_file has subdirectories (e.g., `prompts/chapter1/outline.md` → `_prompts/chapter1/outline.md`).

4. **Implement `step_output_path`**
   ```rust
   pub fn step_output_path(
       run_dir: &Path,
       step_index: usize,
       step_name: &str,
   ) -> PathBuf
   ```
   - Format: `f"step_{:02}_{}.md"` (1-indexed, zero-padded to 2 digits).
   - Example: step index 0 → `step_01_outline.md`.

5. **Implement `read_step_output`**
   ```rust
   pub fn read_step_output(
       run_dir: &Path,
       step_index: usize,
       step_name: &str,
   ) -> Option<String>
   ```
   - Construct path using `step_output_path`.
   - If file exists, return `Some(contents)`.
   - If file doesn't exist, return `None`.

6. **Implement `write_step_output`**
   ```rust
   pub fn write_step_output(
       run_dir: &Path,
       step_index: usize,
       step_name: &str,
       content: &str,
   ) -> Result<(), PlotlineError>
   ```
   - Construct path using `step_output_path`.
   - Write content to file (overwrite if exists).

7. **Implement `infer_run_status`**
   ```rust
   pub fn infer_run_status(
       run_dir: &Path,
       workflow: &Workflow,
   ) -> RunInfo
   ```
   - Parse `run_dir / "_workflow.yaml"` to get workflow definition.
   - For each step, check if output file exists:
     - If exists → `StepStatus::Completed`, set `output_path`.
     - If not exists → `StepStatus::Pending`, `output_path: None`.
   - Determine run timestamp from directory name (parse the `YYYY-MM-DD-HHMM` prefix).
   - Return `RunInfo`.

8. **Write unit tests**
   - Test cases:
     - `test_slugify_basic` — "Write Chapter" → "write-chapter".
     - `test_slugify_special_chars` — "Chapter 1: The Beginning!" → "chapter-1-the-beginning".
     - `test_slugify_empty` — "" → "unnamed".
     - `test_slugify_truncation` — 100-char name → 50 chars max.
     - `test_create_run_directory` — directory created with correct name format.
     - `test_snapshot_workflow` — `_workflow.yaml` and `_prompts/` populated correctly.
     - `test_step_output_path` — correct zero-padded filename.
     - `test_infer_run_status_all_complete` — all output files exist → all `Completed`.
     - `test_infer_run_status_partial` — some output files exist → mix of `Completed` and `Pending`.

9. **Run tests**
   ```bash
   cd src-tauri && cargo test run_manager
   ```

### Acceptance Criteria
- Run directories are named with timestamp prefix and slugified workflow name.
- Workflow snapshots include the YAML file and all referenced prompt files.
- Step output filenames are zero-padded and correctly indexed.
- `infer_run_status` correctly identifies completed and pending steps based on file existence.
- All unit tests pass.

### Files Created/Modified
- `src-tauri/src/run_manager.rs`

---

## WP5 — OpenRouter Client

**Objective**: Send HTTP requests to OpenRouter and parse responses.

**Prerequisites**: WP1 complete.

### Tasks

1. **Implement `CompletionRequest` and `CompletionResponse` structs in `openrouter.rs`**
   ```rust
   pub struct CompletionRequest {
       pub model: String,
       pub prompt: String,
       pub api_key: String,
   }

   pub struct CompletionResponse {
       pub content: String,
       pub prompt_tokens: u32,
       pub completion_tokens: u32,
   }
   ```

2. **Implement `complete` function**
   ```rust
   pub async fn complete(request: CompletionRequest)
       -> Result<CompletionResponse, PlotlineError>
   ```

   Implementation:
   - Create `reqwest::Client` with 30-second timeout.
   - Construct request body:
     ```json
     {
       "model": "<model>",
       "messages": [{"role": "user", "content": "<prompt>"}],
       "stream": false
     }
     ```
   - Set headers:
     - `Authorization: Bearer <api_key>`
     - `Content-Type: application/json`
     - `HTTP-Referer: https://plotline.app`
     - `X-Title: Plotline`
   - POST to `https://openrouter.ai/api/v1/chat/completions`.
   - Check status code:
     - 200 → parse response.
     - 401 → `ApiKeyInvalid`.
     - 429 → `RateLimited`.
     - 5xx → `ProviderError { status, body }`.
     - Other → `ProviderError { status, body }`.
   - Parse JSON response:
     - Extract `choices[0].message.content` as `content`.
     - Extract `usage.prompt_tokens` and `usage.completion_tokens`.
     - If parsing fails → `ResponseParseError`.
   - Return `CompletionResponse`.

3. **Handle timeout specifically**
   - If `reqwest::Error::is_timeout()` → `NetworkTimeout`.
   - If `reqwest::Error::is_connect()` → `ProviderError { status: 0, body: "Connection failed" }`.

4. **Write integration tests using `wiremock`**
   - Add `wiremock` to `[dev-dependencies]` in `Cargo.toml`.
   - Test cases:
     - `test_complete_success` — mock returns 200 with valid JSON → returns `CompletionResponse`.
     - `test_complete_401` — mock returns 401 → returns `ApiKeyInvalid`.
     - `test_complete_429` — mock returns 429 → returns `RateLimited`.
     - `test_complete_500` — mock returns 500 → returns `ProviderError`.
     - `test_complete_malformed_json` — mock returns 200 with invalid JSON → returns `ResponseParseError`.
     - `test_complete_timeout` — mock delays 35s → returns `NetworkTimeout`. (Use a 1-second timeout in test config to avoid waiting.)

5. **Run tests**
   ```bash
   cd src-tauri && cargo test openrouter
   ```

### Acceptance Criteria
- Successful API calls return parsed content and token counts.
- HTTP errors are mapped to specific `PlotlineError` variants.
- Network timeouts are caught and mapped to `NetworkTimeout`.
- All integration tests pass with mocked HTTP server.
- Headers include `HTTP-Referer` and `X-Title` as required by OpenRouter.

### Files Created/Modified
- `src-tauri/src/openrouter.rs`
- `src-tauri/Cargo.toml` (add `wiremock` to dev-dependencies)

---

## WP6 — Execution Engine

**Objective**: Implement the core sequential execution loop that ties together parsing, substitution, API calls, and file I/O.

**Prerequisites**: WP2, WP3, WP4, WP5 complete.

### Tasks

1. **Implement `run_workflow` in `engine.rs`**
   ```rust
   pub async fn run_workflow(
       app_handle: &AppHandle,
       workflow_path: &Path,
       project_root: &Path,
   ) -> Result<(), PlotlineError>
   ```

   Implementation (follow pseudocode from Doc 2, Section 8):
   - Call `workflow::parse_workflow` and `workflow::validate_workflow`.
   - Call `run_manager::create_run_directory`.
   - Call `run_manager::snapshot_workflow`.
   - Emit `run_started` event with `{ run_dir }`.
   - Initialize `previous_output: Option<String> = None`.
   - For each step (0-indexed):
     - Emit `step_started` with `{ step_index, step_name }`.
     - Read prompt file from `run_dir / "_prompts" / <prompt_file>`.
     - Call `substitution::substitute_variables` (use `project_root`, not `run_dir`).
     - If `previous_output` is `Some`:
       - Append `"\n\n---\n\nPrevious Step Output:\n\n"` + `previous_output` to prompt.
     - Retrieve API key from keyring (via `config::get_api_key`).
     - If key is missing → emit `run_error`, return `ApiKeyNotSet`.
     - Call `openrouter::complete`.
     - If error → emit `run_error` with `{ step_index, error }`, return error.
     - Call `run_manager::write_step_output`.
     - Emit `step_completed` with `{ step_index, output_path }`.
     - Set `previous_output = Some(response.content)`.
   - Emit `run_completed` with `{ run_dir }`.

2. **Implement `rerun_from_step` in `engine.rs`**
   ```rust
   pub async fn rerun_from_step(
       app_handle: &AppHandle,
       run_dir: &Path,
       step_index: usize,
   ) -> Result<(), PlotlineError>
   ```

   Implementation:
   - Parse workflow from `run_dir / "_workflow.yaml"` (use `run_dir` as project root for path resolution since prompts are snapshotted there).
   - Validate `step_index` is within bounds.
   - Emit `run_started` with `{ run_dir }`.
   - If `step_index > 0`:
     - Read previous step's output from disk using `run_manager::read_step_output`.
     - Set `previous_output` to that content.
   - Else: `previous_output = None`.
   - For each step from `step_index` onward:
     - Same loop body as `run_workflow` (read prompt from `_prompts/`, substitute, append, call API, write output, emit events).
     - **Important**: Before writing a step's output, delete any existing output files for this step AND all subsequent steps (they are being invalidated).
   - Emit `run_completed`.

3. **Implement helper: `delete_subsequent_outputs`**
   ```rust
   fn delete_subsequent_outputs(
       run_dir: &Path,
       workflow: &Workflow,
       from_index: usize,
   ) -> Result<(), PlotlineError>
   ```
   - For each step from `from_index` to end:
     - Construct output path.
     - If file exists, delete it.
   - This ensures stale outputs from a previous run don't confuse `infer_run_status`.

4. **Write integration tests**
   - Mock OpenRouter using `wiremock`.
   - Create a test project with 3-step workflow.
   - Test cases:
     - `test_run_workflow_complete` — all 3 steps execute, output files created, events emitted in correct order.
     - `test_run_workflow_error_halts` — step 2 returns 500 → run stops, step 3 never executes, step 1 output preserved.
     - `test_rerun_from_step` — run completes, then re-run from step 2 → step 1 output preserved, steps 2 and 3 overwritten.
     - `test_rerun_deletes_subsequent` — run completes, then re-run from step 1 → all outputs overwritten.
     - `test_context_concatenation` — step 2's API call contains step 1's output in the prompt.

5. **Run tests**
   ```bash
   cd src-tauri && cargo test engine
   ```

### Acceptance Criteria
- Full workflow runs execute all steps sequentially.
- Each step's prompt includes the previous step's output appended with the specified separator.
- Errors halt execution and preserve completed step outputs.
- Re-run from step uses existing prior outputs as context.
- Re-run from step overwrites subsequent outputs.
- Events are emitted in correct order: `run_started` → (`step_started` → `step_completed`)* → `run_completed`.
- All integration tests pass.

### Files Created/Modified
- `src-tauri/src/engine.rs`

---

## WP7 — Tauri IPC Commands & Config

**Objective**: Expose backend functionality to the frontend via Tauri commands. Implement API key storage.

**Prerequisites**: WP6 complete.

### Tasks

1. **Implement `config.rs` — API key management**
   ```rust
   pub fn get_api_key() -> Result<String, PlotlineError>
   pub fn set_api_key(key: &str) -> Result<(), PlotlineError>
   pub fn has_api_key() -> Result<bool, PlotlineError>
   ```
   - Use `keyring::Entry::new("plotline", "openrouter")`.
   - `get_api_key`: retrieve password, return `ApiKeyNotSet` if not found.
   - `set_api_key`: set password, return `KeyringError` on failure.
   - `has_api_key`: return `true` if entry exists and is non-empty, `false` otherwise.

2. **Implement all commands in `commands.rs`**
   - Implement every command listed in Doc 2, Section 8 (`commands.rs` module spec).
   - Each command:
     - Converts string parameters to `PathBuf` where needed.
     - Calls the appropriate backend module function.
     - Maps `PlotlineError` to `String` via `.map_err(|e| e.to_string())`.
     - Returns `Result<T, String>`.
   - For `run_workflow` and `rerun_from_step`:
     - These are async and long-running.
     - Use `tauri::async_runtime::spawn` to run the engine in a background task.
     - Pass a clone of `AppHandle` to the spawned task for event emission.
     - Return the `run_dir` immediately (for `run_workflow`) so the frontend can start listening.

   `[PROPOSED DESIGN DECISION]`: `run_workflow` should spawn the execution as a background task and return the `run_dir` immediately. The frontend listens to events for progress updates. This prevents the IPC call from blocking indefinitely.

3. **Register commands in `main.rs` / `lib.rs`**
   ```rust
   tauri::Builder::default()
       .plugin(tauri_plugin_store::Builder::default().build())
       .invoke_handler(tauri::generate_handler![
           commands::run_workflow,
           commands::rerun_from_step,
           commands::save_output,
           commands::get_run_status,
           commands::list_workflows,
           commands::list_runs,
           commands::read_file_content,
           commands::set_api_key,
           commands::get_api_key,
           commands::has_api_key,
           commands::set_project_root,
           commands::get_project_root,
       ])
       .run(tauri::generate_context!())
       .expect("error while running Plotline");
   ```

4. **Implement `list_workflows` command**
   - Read `project_root / "workflows"` directory.
   - Filter for `.yaml` and `.yml` files.
   - Parse each file.
   - Return `Vec<WorkflowSummary>` where:
     ```rust
     pub struct WorkflowSummary {
         pub name: String,
         pub file_path: String,
         pub step_count: usize,
     }
     ```

5. **Implement `list_runs` command**
   - Read `project_root / "runs"` directory.
   - Filter for directories.
   - For each directory, call `run_manager::infer_run_status`.
   - Return `Vec<RunSummary>` where:
     ```rust
     pub struct RunSummary {
         pub run_dir: String,
         pub workflow_name: String,
         pub started_at: String,
         pub completed_steps: usize,
         pub total_steps: usize,
     }
     ```

6. **Implement `read_file_content` command**
   - Takes absolute file path.
   - Reads and returns contents as string.
   - **Security**: Validate path is within the project root (prevent arbitrary file reads).

7. **Implement project root management**
   - Use `tauri-plugin-store` to persist `project_root` in `settings.json`.
   - `set_project_root`: validate directory exists, store in plugin.
   - `get_project_root`: read from plugin, return `None` if not set.

8. **Manual verification**
   - Launch app in dev mode.
   - Use Tauri devtools console to invoke commands:
     ```javascript
     await window.__TAURI__.invoke('set_project_root', { path: '/path/to/test/project' });
     await window.__TAURI__.invoke('list_workflows', { projectRoot: '/path/to/test/project' });
     ```
   - Verify correct responses.

### Acceptance Criteria
- All 13 IPC commands are implemented and registered.
- API key is stored in and retrieved from OS keyring.
- Project root is persisted across app restarts via `tauri-plugin-store`.
- `run_workflow` returns immediately with `run_dir` while execution continues in background.
- `list_workflows` returns all valid YAML files in the workflows directory.
- `list_runs` returns all run directories with inferred status.
- `read_file_content` rejects paths outside project root.

### Files Created/Modified
- `src-tauri/src/config.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/src/main.rs` or `src-tauri/src/lib.rs`

---

## WP8 — Frontend Foundation

**Objective**: Set up the React application structure, state management, and Tauri API bridge.

**Prerequisites**: WP7 complete.

### Tasks

1. **Create `src/api/tauri.ts` — Typed IPC wrappers**
   ```typescript
   import { invoke } from '@tauri-apps/api/core';
   import type { Workflow, RunInfo, RunStepStatus } from '../types';

   export async function listWorkflows(projectRoot: string): Promise<WorkflowSummary[]> {
     return invoke<WorkflowSummary[]>('list_workflows', { projectRoot });
   }

   export async function runWorkflow(workflowPath: string, projectRoot: string): Promise<string> {
     return invoke<string>('run_workflow', { workflowPath, projectRoot });
   }

   // ... implement all 13 command wrappers
   ```

   - Each function wraps `invoke` with proper typing.
   - Errors are thrown as `Error` objects with the backend error string as message.

2. **Create `src/hooks/useTauriEvent.ts`**
   ```typescript
   import { useEffect, useState } from 'react';
   import { listen, type UnlistenFn } from '@tauri-apps/api/event';

   export function useTauriEvent<T>(eventName: string, handler: (payload: T) => void) {
     useEffect(() => {
       let unlisten: UnlistenFn;
       listen<T>(eventName, (event) => handler(event.payload)).then((fn) => {
         unlisten = fn;
       });
       return () => {
         if (unlisten) unlisten();
       };
     }, [eventName, handler]);
   }
   ```

   `[PROPOSED DESIGN DECISION]`: The event hook should be carefully managed to avoid stale closures. The handler should be wrapped in `useCallback` by the consumer, or the hook should use a ref to always call the latest handler.

3. **Create `src/hooks/useRunState.ts`**
   - Manages the current run's state.
   - Listens to `run_started`, `step_started`, `step_completed`, `run_completed`, `run_error` events.
   - Exposes: `currentRun`, `runStatus`, `stepStatuses`, `error`.
   - Resets state when a new run starts.

4. **Create `src/hooks/useProjectRoot.ts`**
   - Loads project root from backend on mount.
   - Exposes `projectRoot`, `setProjectRoot`, `isLoading`.

5. **Create `src/App.tsx` — Main application shell**
   - Layout:
     ```
     ┌─────────────────────────────────────────┐
     │ Plotline                    [Settings]   │  ← Header
     ├──────────────┬──────────────────────────┤
     │              │                          │
     │  Sidebar     │  Main Content Area       │
     │              │                          │
     │  - Workflows │  (RunMonitor or          │
     │  - Runs      │   WorkflowSelector or    │
     │              │   OutputEditor)          │
     │              │                          │
     ├──────────────┴──────────────────────────┤
     │ Status Bar (project root, run status)   │  ← Footer
     └─────────────────────────────────────────┘
     ```
   - Use simple state-based view switching (no router needed for MVP).
   - Views: `'selector'`, `'monitor'`, `'settings'`.

6. **Create `src/styles/global.css`**
   - Reset styles.
   - CSS variables for color scheme (dark theme: `#1a1a2e` background, `#16213e` panels, `#0f3460` accents, `#e94560` primary action).
   - Monospace font for status displays, sans-serif for UI text.
   - Responsive layout using CSS Grid.

7. **Create placeholder components**
   - `WorkflowSelector.tsx` — renders "Select a workflow" placeholder.
   - `RunMonitor.tsx` — renders "No active run" placeholder.
   - `OutputEditor.tsx` — renders "No output selected" placeholder.
   - `SettingsModal.tsx` — renders "Settings" placeholder.

8. **Verify the app launches and renders the shell layout.**

### Acceptance Criteria
- App launches with the three-panel layout (sidebar, main content, status bar).
- `api/tauri.ts` exports typed wrappers for all 13 IPC commands.
- `useTauriEvent` hook correctly subscribes and unsubscribes.
- `useRunState` hook tracks all run events and exposes current state.
- Project root loads from backend on app startup.
- Dark theme is applied.

### Files Created/Modified
- `src/api/tauri.ts`
- `src/hooks/useTauriEvent.ts`
- `src/hooks/useRunState.ts`
- `src/hooks/useProjectRoot.ts`
- `src/App.tsx`
- `src/styles/global.css`
- `src/components/WorkflowSelector.tsx` (placeholder)
- `src/components/RunMonitor.tsx` (placeholder)
- `src/components/OutputEditor.tsx` (placeholder)
- `src/components/SettingsModal.tsx` (placeholder)

---

## WP9 — Settings & API Key Management UI

**Objective**: Build the Settings modal for API key entry and project root selection.

**Prerequisites**: WP8 complete.

### Tasks

1. **Implement `SettingsModal.tsx`**
   - Modal overlay with two sections:
     - **Project Root**: Display current path. Button "Change..." opens a directory picker (use `@tauri-apps/plugin-dialog` — add to dependencies if not present).
     - **OpenRouter API Key**: Password input field. "Save" button. Status indicator (green check if set, red X if not).
   - On mount, call `has_api_key` and `get_project_root` to populate current state.
   - On "Save" (API key): call `set_api_key`. Show success/error toast.
   - On "Change..." (project root): open directory dialog, call `set_project_root` with selected path. Update display.
   - "Close" button hides modal.

2. **Add `@tauri-apps/plugin-dialog` dependency**
   ```bash
   npm install @tauri-apps/plugin-dialog
   ```
   - Add to Tauri capabilities:
     ```json
     "permissions": [
       ...,
       "dialog:allow-open"
     ]
     ```

3. **Wire Settings button in header**
   - Gear icon in `App.tsx` header.
   - Clicking opens `SettingsModal`.

4. **Implement toast notifications**
   - Simple toast system: `src/components/Toast.tsx`.
   - Types: `success`, `error`.
   - Auto-dismiss after 4 seconds.
   - Stack multiple toasts vertically.

5. **Manual verification**
   - Open Settings → enter API key → save → close → reopen → verify key is marked as set.
   - Change project root → verify status bar updates.
   - Try saving empty API key → verify error toast.

### Acceptance Criteria
- API key can be entered, saved, and its status is visible.
- Project root can be changed via directory picker.
- Changes persist across app restarts.
- Invalid operations show error toasts.
- Modal can be opened and closed cleanly.

### Files Created/Modified
- `src/components/SettingsModal.tsx`
- `src/components/Toast.tsx`
- `src/App.tsx` (add settings button and modal)
- `package.json` (add `@tauri-apps/plugin-dialog`)
- `src-tauri/capabilities/default.json` (add dialog permission)

---

## WP10 — Workflow Selector UI

**Objective**: Display available workflows and allow the user to start a run.

**Prerequisites**: WP8 complete.

### Tasks

1. **Implement `WorkflowSelector.tsx`**
   - On mount, call `listWorkflows(projectRoot)`.
   - Display loading state while fetching.
   - If no workflows found: show empty state with instructions ("Create a workflow YAML file in your project's workflows/ directory.").
   - If workflows found: render a list of cards, each showing:
     - Workflow name
     - Step count
     - "Run" button
   - Clicking "Run":
     - Call `runWorkflow(workflowPath, projectRoot)`.
     - Receive `run_dir` from backend.
     - Switch view to `RunMonitor` with the `run_dir`.

2. **Implement run history list in sidebar**
   - Call `listRuns(projectRoot)`.
   - Display runs sorted by date (newest first).
   - Each run entry shows:
     - Workflow name
     - Date/time
     - Progress (e.g., "3/5 steps")
   - Clicking a run loads it in `RunMonitor`.

3. **Handle loading and error states**
   - If `listWorkflows` fails: show error message in the selector area.
   - If `listRuns` fails: show error message in the sidebar.
   - If `runWorkflow` fails: show error toast, stay on selector view.

4. **Manual verification**
   - Create a test project with 2-3 workflow YAML files.
   - Set project root in Settings.
   - Verify workflows appear in the selector.
   - Click "Run" on a workflow.
   - Verify view switches to RunMonitor.

### Acceptance Criteria
- Available workflows are listed with name and step count.
- Empty state is shown when no workflows exist.
- Clicking "Run" starts the workflow and navigates to the run monitor.
- Run history appears in the sidebar.
- Clicking a past run loads it in the monitor.
- Loading and error states are handled gracefully.

### Files Created/Modified
- `src/components/WorkflowSelector.tsx`
- `src/App.tsx` (integrate selector view and sidebar runs list)

---

## WP11 — Run Monitor UI

**Objective**: Display real-time execution progress and step statuses.

**Prerequisites**: WP10 complete.

### Tasks

1. **Implement `RunMonitor.tsx`**
   - Accept `runDir` as prop.
   - On mount, call `getRunStatus(runDir)` to load initial state.
   - Subscribe to Tauri events using `useRunState` hook:
     - `run_started` → set run as active.
     - `step_started` → update step status to `running`.
     - `step_completed` → update step status to `completed`, store output path.
     - `run_completed` → set run as finished.
     - `run_error` → set step status to `error`, store error message.
   - Render a vertical list of `StepCard` components, one per step.

2. **Implement `StepCard.tsx`**
   - Props: `stepIndex`, `stepName`, `status`, `outputPath`, `error`, `onViewOutput`.
   - Visual states:
     - `pending`: gray circle `○`, dimmed text.
     - `running`: pulsing blue circle `►`, normal text.
     - `completed`: green check `✓`, normal text, "View Output" button.
     - `error`: red X `✗`, error text displayed below.
   - Clicking "View Output" calls `onViewOutput(outputPath)` which switches to `OutputEditor`.

3. **Implement run header**
   - Display workflow name.
   - Display run directory path (truncated with tooltip).
   - Display overall progress: "2/5 steps completed".
   - Display elapsed time (updates every second while running).
   - If run is complete: show "Completed" badge.
   - If run has error: show "Failed" badge with error summary.

4. **Implement "Re-run from Step" UI**
   - Each completed or errored step card has a "Re-run from here" button (circular arrow icon).
   - Clicking it:
     - Calls `rerunFromStep(runDir, stepIndex)`.
     - Resets all subsequent step cards to `pending`.
     - The `useRunState` hook handles event-driven updates as the re-run progresses.

5. **Handle active run state**
   - While a run is active, disable the "Run" buttons in the WorkflowSelector (prevent concurrent runs).
   - Show a "Running..." indicator in the status bar.

6. **Manual verification**
   - Start a workflow run.
   - Verify step cards transition from pending → running → completed in real-time.
   - Verify elapsed time counter works.
   - Verify error state displays correctly (temporarily break API key to test).
   - Click "View Output" on a completed step → verify OutputEditor loads.

### Acceptance Criteria
- Step statuses update in real-time during execution.
- Visual indicators clearly show pending, running, completed, and error states.
- Elapsed time displays and updates while running.
- "View Output" button appears only on completed steps.
- "Re-run from here" button appears on completed and errored steps.
- Error messages are displayed inline on the failed step card.
- Concurrent run prevention is in place.

### Files Created/Modified
- `src/components/RunMonitor.tsx`
- `src/components/StepCard.tsx`

---

## WP12 — Output Editor UI

**Objective**: Display and allow editing of step outputs using CodeMirror.

**Prerequisites**: WP11 complete.

### Tasks

1. **Implement `OutputEditor.tsx`**
   - Props: `runDir`, `stepIndex`, `stepName`, `onClose`.
   - On mount, call `readFileContent(outputPath)` to load content.
   - Render two modes:
     - **View mode**: Read-only Markdown rendering using `react-markdown`.
     - **Edit mode**: CodeMirror editor with Markdown language support.
   - Toggle button to switch between View and Edit modes.
   - "Save" button in edit mode:
     - Calls `saveOutput(runDir, stepIndex, stepName, content)`.
     - Shows success toast.
     - Switches back to view mode.
   - "Close" button returns to RunMonitor.

2. **Configure CodeMirror**
   ```typescript
   import CodeMirror from '@uiw/react-codemirror';
   import { markdown } from '@uiw/codemirror-extensions-langs';

   <CodeMirror
     value={content}
     extensions={[markdown()]}
     onChange={(value) => setContent(value)}
     theme="dark"
     height="100%"
   />
   ```

3. **Configure react-markdown**
   ```typescript
   import ReactMarkdown from 'react-markdown';

   <ReactMarkdown>{content}</ReactMarkdown>
   ```

4. **Handle unsaved changes**
   - If user clicks "Close" while in edit mode with unsaved changes:
     - Show confirmation dialog: "You have unsaved changes. Discard?"
     - "Discard" → close without saving.
     - "Cancel" → stay in editor.

5. **Handle large outputs**
   - If output exceeds 100KB, show a warning: "Large output may be slow to render."
   - Still allow editing (CodeMirror handles large files better than react-markdown).

6. **Manual verification**
   - Run a workflow to completion.
   - Click "View Output" on a step.
   - Verify Markdown renders correctly in view mode.
   - Switch to edit mode.
   - Make changes.
   - Save.
   - Verify file on disk contains the edited content.
   - Close and reopen → verify edited content persists.

### Acceptance Criteria
- Step outputs render as formatted Markdown in view mode.
- Edit mode provides a functional Markdown editor with syntax highlighting.
- Changes are saved to disk and persist across app restarts.
- Unsaved changes prompt a confirmation dialog before closing.
- Large outputs are handled without crashing.

### Files Created/Modified
- `src/components/OutputEditor.tsx`

---

## WP13 — Re-run Functionality Integration

**Objective**: End-to-end integration of the re-run from step feature.

**Prerequisites**: WP12 complete.

### Tasks

1. **Wire "Re-run from here" in `StepCard.tsx`**
   - On click, call `rerunFromStep(runDir, stepIndex)`.
   - The backend will:
     - Delete output files for this step and all subsequent steps.
     - Start execution from this step.
     - Emit `run_started`, then `step_started` for this step.
   - The `useRunState` hook will receive events and update the UI.

2. **Handle UI state during re-run**
   - When re-run starts:
     - All step cards from the selected step onward reset to `pending`.
     - The selected step card transitions to `running`.
   - As steps complete, they transition to `completed` one by one.
   - The run header updates to show "Re-running from Step N".

3. **Handle edited outputs in re-run**
   - If the user edited step 2's output and then re-runs from step 3:
     - The backend reads step 2's output from disk (which now contains the edited content).
     - Step 3's prompt will include the edited step 2 output as context.
   - This is the core value proposition — verify it works end-to-end.

4. **Manual verification — full scenario**
   - Create a 4-step workflow.
   - Run to completion.
   - Open step 2 output in editor.
   - Edit the output significantly (e.g., add a unique marker string like "EDITED_12345").
   - Save.
   - Click "Re-run from here" on step 3.
   - Wait for completion.
   - Open step 3 output.
   - Verify the edited content from step 2 appears in step 3's context (the model's response should reference or be influenced by the edit).

5. **Edge case: re-run from step 0**
   - Click "Re-run from here" on step 1 (index 0).
   - Verify all steps are re-executed.
   - Verify no previous output is appended to step 1's prompt (since there is no previous step).

6. **Edge case: re-run after error**
   - Run a workflow that fails at step 3 (e.g., temporarily use an invalid model name).
   - Fix the issue (edit `_workflow.yaml` in the run directory — wait, this is a snapshot...).

   `[CONFLICT]`: The workflow snapshot in the run directory cannot be edited to fix a model name, because the engine reads from the snapshot.

   `[RESOLUTION]`: For MVP, if a step fails due to a bad model name, the user must fix the source workflow YAML and start a new run. Re-run from step uses the snapshotted workflow. This is acceptable because model names rarely change mid-workflow. Document this limitation in the UI: "Re-run uses the workflow definition from the time of the original run."

   - Add a tooltip or info text on the re-run button: "Uses the original workflow snapshot."

### Acceptance Criteria
- Re-run from any step executes that step and all subsequent steps.
- Edited outputs from prior steps are used as context for the re-run.
- Re-run from step 0 (first step) works correctly with no previous context.
- UI state updates correctly during re-run (pending → running → completed).
- The limitation of using snapshotted workflow definitions is communicated to the user.

### Files Created/Modified
- `src/components/StepCard.tsx` (wire re-run button)
- `src/components/RunMonitor.tsx` (handle re-run state)

---

## WP14 — Error Handling & Edge Case Polish

**Objective**: Handle all identified edge cases and ensure error states are user-friendly.

**Prerequisites**: WP13 complete.

### Tasks

1. **API key edge cases**
   - If API key is not set and user clicks "Run": show toast "Please set your OpenRouter API key in Settings." and open Settings modal automatically.
   - If API key is invalid (401 from OpenRouter): show error on step card: "Invalid API key. Update it in Settings." with a "Open Settings" button.

2. **Network error handling**
   - If OpenRouter is unreachable (connection refused): show error "Cannot connect to OpenRouter. Check your internet connection."
   - If request times out: show error "Request timed out after 30 seconds. Try re-running from this step."

3. **Filesystem edge cases**
   - If project root doesn't have a `workflows/` directory: show empty state with instructions.
   - If a run directory is missing expected files (e.g., user deleted `_workflow.yaml`): show error "Run directory is corrupted. Missing workflow snapshot."
   - If file write fails (disk full, permissions): show error "Failed to save output. Check disk space and permissions."

4. **Empty workflow directory**
   - If `listWorkflows` returns empty array: show helpful empty state in `WorkflowSelector` with a sample workflow YAML.

5. **Invalid workflow YAML**
   - If `listWorkflows` encounters a file that fails to parse: skip it, but show a warning banner: "Some workflow files could not be loaded. Check the console for details."

6. **Run directory naming collisions**
   - If two runs start within the same minute: append `-2`, `-3`, etc. to the directory name.
   - Update `create_run_directory` to check for existing directory and append suffix.

7. **Frontend error boundaries**
   - Wrap the main content area in a React error boundary.
   - If a component crashes: show "Something went wrong" with a "Reload" button that resets the view to WorkflowSelector.

### Acceptance Criteria
- Missing API key prompts user to set it before running.
- Network errors show actionable messages.
- Corrupted run directories show clear error messages.
- Empty states guide the user toward next steps.
- Run directory collisions are handled gracefully.
- React error boundaries prevent white-screen crashes.

### Files Created/Modified
- `src/components/WorkflowSelector.tsx` (empty state)
- `src/components/RunMonitor.tsx` (error states)
- `src/components/StepCard.tsx` (error actions)
- `src/components/ErrorBoundary.tsx` (new)
- `src-tauri/src/run_manager.rs` (collision handling)
- `src/App.tsx` (error boundary wrapper)

---

## WP15 — Testing & QA

**Objective**: Comprehensive testing pass to verify all acceptance criteria.

**Prerequisites**: WP14 complete.

### Tasks

1. **Run all Rust tests**
   ```bash
   cd src-tauri && cargo test
   ```
   - Verify all tests pass.
   - Check test coverage for: workflow parsing, variable substitution, run management, OpenRouter client, engine.

2. **Run all frontend tests**
   ```bash
   npm test
   ```
   - Verify all tests pass.

3. **Execute manual test plan** (from Doc 2, Section 12)
   - Test 1: Create project, set API key, run 3-step workflow → verify completion.
   - Test 2: Edit step 2 output → save → re-run from step 3 → verify edited content used.
   - Test 3: Delete API key → run → verify error.
   - Test 4: Close app mid-run → reopen → re-run from last completed step.
   - Test 5: Test with invalid model name → verify error on step card.
   - Test 6: Test with missing prompt file → verify validation error before run starts.
   - Test 7: Test with missing variable file → verify error during run.

4. **Cross-platform verification** (if possible)
   - Test on macOS, Windows, and Linux.
   - Verify keyring works on all platforms.
   - Verify file paths work on all platforms (use `PathBuf`, not string concatenation).

5. **Performance check**
   - Run a 10-step workflow.
   - Verify UI remains responsive during execution.
   - Verify no memory leaks (run 5 workflows in sequence, check memory usage doesn't grow unbounded).

6. **Fix any issues found during testing**
   - Document bugs found.
   - Fix and re-test.

### Acceptance Criteria
- All automated tests pass.
- All manual test plan items pass.
- No known critical or high-severity bugs.
- UI remains responsive during long-running workflows.
- Application works on target platforms.

### Files Created/Modified
- Bug fixes across the codebase as needed.

---

## WP16 — Build & Package

**Objective**: Produce distributable binaries for macOS, Windows, and Linux.

**Prerequisites**: WP15 complete.

### Tasks

1. **Update `tauri.conf.json` for production**
   - Verify `productName` is `Plotline`.
   - Verify `version` is `1.0.0`.
   - Set `bundle.active: true`.
   - Configure bundle targets:
     - macOS: `dmg`, `app`
     - Windows: `msi`, `nsis`
     - Linux: `appimage`, `deb`

2. **Add application icon**
   - Create or obtain a Plotline icon (1024×1024 PNG).
   - Use `tauri icon` command to generate all required sizes:
     ```bash
     npm run tauri icon path/to/icon.png
     ```
   - Verify icons appear in `src-tauri/icons/`.

3. **Build for current platform**
   ```bash
   npm run tauri build
   ```
   - Verify build succeeds.
   - Locate output binaries in `src-tauri/target/release/bundle/`.

4. **Test the production build**
   - Install/run the built binary.
   - Verify all features work in production mode (not just dev mode).
   - Verify API key storage works in production.
   - Verify file operations work in production.

5. **Create a sample project for testing**
   - Create a `examples/` directory in the repo.
   - Add a sample project with:
     ```
     examples/sample-project/
       workflows/write_chapter.yaml
       prompts/outline.md
       prompts/draft.md
       prompts/critique.md
       prompts/rewrite.md
       variables/style.md
       variables/protagonist.md
     ```
   - This serves as both documentation and a test fixture.

6. **Write README.md**
   - Project overview.
   - Development setup instructions.
   - Build instructions.
   - Usage guide (how to create a project, workflow, run it).
   - Sample workflow YAML.
   - Link to OpenRouter for API key.

7. **Tag the release**
   ```bash
   git tag -a v1.0.0 -m "Plotline MVP"
   git push origin v1.0.0
   ```

### Acceptance Criteria
- `npm run tauri build` succeeds on the target platform.
- Production binary launches and all features work.
- Application icon is displayed in the OS taskbar/dock.
- Sample project is included and works with the app.
- README is comprehensive and accurate.
- Git tag `v1.0.0` is created.

### Files Created/Modified
- `tauri.conf.json` (bundle configuration)
- `src-tauri/icons/*` (generated icons)
- `examples/sample-project/*` (sample project)
- `README.md`

---

## Dependency Graph

```
WP0 (Scaffolding)
  │
  ├── WP1 (Types & Errors)
  │     │
  │     ├── WP2 (Workflow Parser)
  │     │     │
  │     │     └── WP4 (Run Manager)
  │     │           │
  │     ├── WP3 (Variable Substitution)
  │     │
  │     └── WP5 (OpenRouter Client)
  │           │
  │           └── WP6 (Execution Engine)
  │                 │
  │                 └── WP7 (IPC Commands)
  │                       │
  │                       └── WP8 (Frontend Foundation)
  │                             │
  │                             ├── WP9 (Settings UI)
  │                             │
  │                             ├── WP10 (Workflow Selector)
  │                             │     │
  │                             │     └── WP11 (Run Monitor)
  │                             │           │
  │                             │           └── WP12 (Output Editor)
  │                             │                 │
  │                             │                 └── WP13 (Re-run Integration)
  │                             │                       │
  │                             │                       └── WP14 (Error Polish)
  │                             │                             │
  │                             │                             └── WP15 (Testing & QA)
  │                             │                                   │
  │                             │                                   └── WP16 (Build & Package)
  │                             │
  │                             └── (WP9 can run in parallel with WP10-WP12)
```

---

## Quick Reference: Work Package Summary

| WP | Name | Est. Effort | Dependencies |
|---|---|---|---|
| 0 | Project Scaffolding | 45 min | None |
| 1 | Core Types & Error Handling | 30 min | WP0 |
| 2 | Workflow Parser | 60 min | WP1 |
| 3 | Variable Substitution | 45 min | WP1 |
| 4 | Run Manager | 75 min | WP1, WP2 |
| 5 | OpenRouter Client | 60 min | WP1 |
| 6 | Execution Engine | 90 min | WP2, WP3, WP4, WP5 |
| 7 | IPC Commands & Config | 60 min | WP6 |
| 8 | Frontend Foundation | 75 min | WP7 |
| 9 | Settings UI | 45 min | WP8 |
| 10 | Workflow Selector | 60 min | WP8 |
| 11 | Run Monitor | 75 min | WP10 |
| 12 | Output Editor | 60 min | WP11 |
| 13 | Re-run Integration | 45 min | WP12 |
| 14 | Error Handling Polish | 60 min | WP13 |
| 15 | Testing & QA | 90 min | WP14 |
| 16 | Build & Package | 45 min | WP15 |
| **Total** | | **~13 hours** | |

---
