# Plotline MVP — Implementation Roadmap (Contractual Edition)

## ZERO-TOLERANCE CONTRACT

**THIS DOCUMENT IS A BINDING IMPLEMENTATION CONTRACT.** The coding agent SHALL NOT interpret any requirement loosely, broadly, or creatively. Every task, every acceptance criterion, and every verification step is MANDATORY. There are no optional steps. There are no "nice to haves." There is no "good enough."

### Absolute Rules (Violation = Immediate Halt)

1. **SEQUENTIAL EXECUTION ONLY**: Work Packages MUST be completed in strict numerical order (WP0, WP1, WP2, ... WP16). No exceptions. No parallel execution. No "getting ahead."

2. **NO PRESENTATION WITHOUT 100% VERIFICATION**: The coding agent is PROHIBITED from presenting a Work Package as complete until ALL of the following are proven with explicit evidence:
   - Every task in the Work Package is implemented exactly as specified.
   - Every acceptance criterion is individually verified and proven to pass.
   - 100% test coverage exists for ALL new code written in the Work Package.
   - The ENTIRE test suite (all Rust tests + all frontend tests from ALL previous Work Packages) is executed and passes with ZERO failures.
   - `cargo check` completes with ZERO errors and ZERO warnings.
   - `npm run build` completes with ZERO errors and ZERO warnings.
   - `npx tsc --noEmit` completes with ZERO errors and ZERO warnings.

3. **REGRESSION TESTING IS NON-NEGOTIABLE**: Before presenting ANY Work Package, the coding agent MUST execute `cargo test` (entire Rust test suite) and `npm test` (entire frontend test suite). If ANY previously passing test now fails, the Work Package is NOT complete. The agent MUST fix the regression and re-run the full suite until it passes.

4. **EXPLICIT PROOF REQUIRED**: Vague statements like "tests pass" or "it works" are FORBIDDEN. The agent MUST provide:
   - Exact command output (truncated if necessary, but showing the final pass/fail summary).
   - Exact build output showing zero errors/warnings.
   - A per-criterion checklist with PASS/FAIL status for each item.
   - If a criterion is marked PASS, the agent MUST cite the specific test name, file, or observable behavior that proves it.

5. **HALT ON FAILURE**: If any test fails, any build fails, any criterion fails, or any regression is detected, the agent MUST:
   - STOP immediately.
   - NOT proceed to the next Work Package.
   - NOT present the current Work Package as complete.
   - Diagnose the root cause.
   - Fix the issue.
   - Re-run the ENTIRE verification suite from scratch.
   - Only after 100% success may the agent present the Verification Report.

6. **NO BROAD INTERPRETATION**: Acceptance criteria are to be verified LITERALLY and INDIVIDUALLY. Each criterion is a separate, mandatory proof point. "Covers all failure modes" means the agent MUST list every failure mode and show the corresponding error variant or test case. "All types defined" means the agent MUST list every type and show its definition.

7. **NO INVENTED DEPENDENCIES**: Only use crates and npm packages explicitly listed in the technical specification. Adding unapproved dependencies is a contract violation.

8. **NO SKIPPED TESTS**: The agent is PROHIBITED from marking tests as `#[ignore]`, `skip`, or otherwise bypassing them. Every test MUST run and pass.

9. **VERIFICATION REPORT FORMAT**: The output for each completed Work Package MUST follow the exact format in Appendix A. Deviation from this format is a contract violation.

10. **NO PARTIAL COMPLETION**: A Work Package is either 0% complete or 100% complete. There is no "mostly done." There is no "just one small thing left." If the agent cannot complete a Work Package, it MUST halt and ask for clarification. It MUST NOT present partial work.

---

## Overview

This roadmap breaks the Plotline MVP into 16 sequential work packages. Each package is self-contained, has explicit dependencies, and produces verifiable output. The coding agent MUST complete packages in exact order.

**Critical path**: WP0 → WP1 → WP2 → WP3 → WP4 → WP5 → WP6 → WP7 → WP8 → WP9 → WP10 → WP11 → WP12 → WP13 → WP14 → WP15 → WP16

**Note**: WP9 was previously marked as parallelizable. This is REVOKED. ALL Work Packages are sequential. No exceptions.

---

## WP0 — Project Scaffolding

**Objective**: Create a working Tauri 2.0 + React + TypeScript project that launches and displays a placeholder screen.

**Prerequisites**: Node.js 20+, Rust toolchain (stable), Tauri 2.0 CLI.

### Tasks (ALL MANDATORY)

1. **Initialize Tauri project**
   ```bash
   npm create tauri-app@latest plotline -- --template react-ts
   cd plotline
   ```
   - Verify the command completes without errors.
   - Verify `plotline/` directory exists with expected subdirectories.

2. **Verify and create project structure**
   - Create ALL directories listed in Doc 2, Section 2.
   - Create empty placeholder files for ALL Rust modules: `workflow.rs`, `engine.rs`, `substitution.rs`, `openrouter.rs`, `run_manager.rs`, `config.rs`, `error.rs`, `commands.rs`.
   - In `lib.rs`, add `mod` declarations for ALL modules listed above.
   - Verify no compiler errors from missing modules.

3. **Add Rust dependencies to `Cargo.toml`**
   - Add ALL crates listed in Doc 2, Section 3 with EXACTLY the specified versions.
   - Run `cargo check` and verify it resolves with ZERO errors.
   - If resolution fails, fix before proceeding.

4. **Add frontend dependencies to `package.json`**
   - Install ALL packages listed in Doc 2, Section 3.
   - Run `npm install` and verify it completes with ZERO errors.

5. **Configure `tauri.conf.json`**
   - Set `productName` to `Plotline` (case-sensitive).
   - Set `identifier` to `com.plotline.app`.
   - Set window dimensions: 1200×800, min 800×600.
   - Set CSP policy EXACTLY as specified in Doc 2, Section 4.
   - Configure `beforeDevCommand` and `beforeBuildCommand`.
   - Verify JSON is valid (no trailing commas, correct nesting).

6. **Configure `vite.config.ts`**
   - Set port to 1420, `strictPort: true`.
   - Set build target to `es2021`.
   - Verify config file syntax.

7. **Configure `tsconfig.json`**
   - Use the configuration from Doc 2, Section 13 EXACTLY.
   - Verify JSON validity.

8. **Configure Tauri capabilities**
   - Create `src-tauri/capabilities/default.json` with permissions from Doc 2, Section 4.
   - Verify file exists and contains valid JSON.

9. **Create placeholder `App.tsx`**
   - Render a centered `<h1>Plotline</h1>` and NOTHING else.
   - Verify the app launches with `npm run tauri dev`.
   - The window MUST display the text "Plotline" as an `<h1>` element.

10. **Create `.gitignore`**
    ```
    node_modules/
    dist/
    src-tauri/target/
    src-tauri/gen/
    .DS_Store
    *.log
    ```
    - Verify file exists and contains exactly these entries.

11. **Initialize git repository**
    ```bash
    git init
    git add -A
    git commit -m "WP0: Project scaffolding"
    ```
    - Verify `git log` shows the commit.
    - Verify `git status` shows clean working tree.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP0-01**: `npm run tauri dev` launches a desktop window titled "Plotline".
  - *Proof required*: Screenshot description or explicit statement that window title is "Plotline".
- [ ] **AC-WP0-02**: The launched window displays "Plotline" as a centered `<h1>` heading.
  - *Proof required*: Explicit confirmation of rendered content.
- [ ] **AC-WP0-03**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output showing `Finished dev [unoptimized + debuginfo] target(s) in ...` with no errors/warnings.
- [ ] **AC-WP0-04**: `npm run build` succeeds with ZERO errors.
  - *Proof required*: Command output showing successful build.
- [ ] **AC-WP0-05**: All dependencies from Doc 2, Section 3 are installed and resolvable.
  - *Proof required*: `Cargo.toml` and `package.json` listing all required dependencies; `cargo check` and `npm install` both succeeding.
- [ ] **AC-WP0-06**: All placeholder Rust modules exist and are declared in `lib.rs`.
  - *Proof required*: File listing or explicit confirmation of each module file and `mod` declaration.
- [ ] **AC-WP0-07**: `.gitignore` exists with exactly the specified entries.
  - *Proof required*: File content verification.
- [ ] **AC-WP0-08**: Git repository is initialized with at least one commit.
  - *Proof required*: `git log --oneline` output showing the WP0 commit.

### Files Created/Modified
- `Cargo.toml`
- `tauri.conf.json`
- `package.json`
- `vite.config.ts`
- `tsconfig.json`
- `src-tauri/capabilities/default.json`
- `src-tauri/src/*.rs` (empty placeholders with `mod` declarations)
- `src/App.tsx` (placeholder)
- `.gitignore`

---

## WP1 — Core Types & Error Handling

**Objective**: Define all Rust data types and error types that the rest of the backend depends on.

**Prerequisites**: WP0 complete AND verified.

### Tasks (ALL MANDATORY)

1. **Implement `error.rs`**
   - Copy the `PlotlineError` enum from Doc 2, Section 8 EXACTLY.
   - `thiserror::Error` derive MUST be applied.
   - EVERY variant MUST have `#[error("...")]` message.
   - Implement `From<std::io::Error>` for `PlotlineError` → maps to `FilesystemError`.
   - Implement `From<serde_yaml::Error>` for `PlotlineError` → maps to `WorkflowParseError`.
   - Implement `From<reqwest::Error>` for `PlotlineError` → timeout maps to `NetworkTimeout`, all others map to `ProviderError`.
   - Verify each `From` implementation compiles.

2. **Implement `workflow.rs` type definitions**
   - Copy `Workflow`, `Step`, `ResolvedStep`, `RunInfo`, `RunStepStatus`, `StepStatus` structs from Doc 2, Section 5 EXACTLY.
   - ALL structs MUST derive `Debug, Clone, Serialize, Deserialize`.
   - `StepStatus` MUST use `#[serde(rename_all = "snake_case")]`.
   - Verify field names, types, and nullability match the spec exactly.

3. **Create frontend type definitions**
   - Create `src/types/index.ts` with ALL interfaces from Doc 2, Section 5.
   - Types MUST match Rust structs exactly (field names, types, nullability).
   - Export all types from the index file.

4. **Verify compilation**
   - `cargo check` MUST pass with ZERO errors and ZERO warnings.
   - `npx tsc --noEmit` MUST pass with ZERO errors.

5. **Write tests for error conversions**
   - Test `From<std::io::Error>`: create an IO error, convert to `PlotlineError`, assert it is `FilesystemError`.
   - Test `From<serde_yaml::Error>`: create invalid YAML, parse it, assert error is `WorkflowParseError`.
   - Test `From<reqwest::Error>` timeout: verify timeout maps to `NetworkTimeout`.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP1-01**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP1-02**: `npx tsc --noEmit` passes with ZERO errors.
  - *Proof required*: Command output.
- [ ] **AC-WP1-03**: `PlotlineError` enum is defined in `error.rs` with ALL variants from Doc 2, Section 8.
  - *Proof required*: List every variant and show it exists.
- [ ] **AC-WP1-04**: Every `PlotlineError` variant has `#[error("...")]` message.
  - *Proof required*: Show each variant's error message.
- [ ] **AC-WP1-05**: `From<std::io::Error>` is implemented and maps to `FilesystemError`.
  - *Proof required*: Show implementation + test output.
- [ ] **AC-WP1-06**: `From<serde_yaml::Error>` is implemented and maps to `WorkflowParseError`.
  - *Proof required*: Show implementation + test output.
- [ ] **AC-WP1-07**: `From<reqwest::Error>` is implemented; timeout maps to `NetworkTimeout`, others to `ProviderError`.
  - *Proof required*: Show implementation + test output.
- [ ] **AC-WP1-08**: ALL Rust structs (`Workflow`, `Step`, `ResolvedStep`, `RunInfo`, `RunStepStatus`, `StepStatus`) are defined with correct derives.
  - *Proof required*: Show each struct definition.
- [ ] **AC-WP1-09**: `StepStatus` uses `#[serde(rename_all = "snake_case")]`.
  - *Proof required*: Show the derive line.
- [ ] **AC-WP1-10**: ALL TypeScript interfaces exist in `src/types/index.ts` and match Rust structs exactly.
  - *Proof required*: Show TypeScript interface definitions side-by-side with Rust structs.
- [ ] **AC-WP1-11**: Error types cover ALL failure modes listed in Doc 2, Section 11.
  - *Proof required*: List every failure mode from Doc 2, Section 11 and map it to the corresponding `PlotlineError` variant.
- [ ] **AC-WP1-12**: Error conversion tests pass.
  - *Proof required*: `cargo test` output showing all error tests pass.

### Files Created/Modified
- `src-tauri/src/error.rs`
- `src-tauri/src/workflow.rs` (types only, no functions yet)
- `src/types/index.ts`

---

## WP2 — Workflow Parser

**Objective**: Parse and validate workflow YAML files.

**Prerequisites**: WP1 complete AND verified.

### Tasks (ALL MANDATORY)

1. **Implement `parse_workflow` function in `workflow.rs`**
   ```rust
   pub fn parse_workflow(
       workflow_path: &Path,
       project_root: &Path,
   ) -> Result<Workflow, PlotlineError>
   ```
   - Read file at `workflow_path`.
   - Deserialize as YAML into `Workflow` struct.
   - If file doesn't exist → return `WorkflowNotFound`.
   - If YAML is invalid → return `WorkflowParseError`.
   - Write unit tests for ALL branches.

2. **Implement `validate_workflow` function in `workflow.rs`**
   ```rust
   pub fn validate_workflow(
       workflow: &Workflow,
       project_root: &Path,
   ) -> Result<(), PlotlineError>
   ```
   Validation rules (MUST be checked in this exact order):
   - `name` is non-empty string.
   - `steps` is non-empty array.
   - Each step `name` is non-empty.
   - Each step `name` is unique within the workflow.
   - Each step `name` matches regex `^[a-zA-Z0-9_-]+$`.
   - Each `prompt_file` is non-empty.
   - Each `prompt_file` resolves to an existing file within `project_root` (resolve relative to project root, reject path traversal — no `..` components allowed).
   - Each `model` is non-empty.
   - Write unit tests for EVERY validation rule.

3. **Create test fixtures**
   - Create directory: `src-tauri/tests/fixtures/project/`.
   - Create `workflows/valid.yaml` with exactly 2 steps.
   - Create `workflows/empty_steps.yaml` with `steps: []`.
   - Create `workflows/duplicate_names.yaml` with two steps having the same name.
   - Create `workflows/missing_prompt.yaml` referencing a non-existent file.
   - Create `workflows/path_traversal.yaml` with `prompt_file: "../secret.txt"`.
   - Create `prompts/step1.md` and `prompts/step2.md`.
   - Create `workflows/empty_name.yaml` with `name: ""`.
   - Create `workflows/invalid_step_name.yaml` with a step name containing spaces.
   - Create `workflows/empty_prompt_file.yaml` with `prompt_file: ""`.
   - Create `workflows/empty_model.yaml` with `model: ""`.

4. **Write unit tests in `workflow.rs`**
   - `test_parse_valid_workflow` — parses successfully, returns `Workflow` with correct name and 2 steps.
   - `test_parse_missing_file` — returns `WorkflowNotFound`.
   - `test_parse_invalid_yaml` — returns `WorkflowParseError`.
   - `test_validate_empty_name` — returns `WorkflowValidationError`.
   - `test_validate_empty_steps` — returns `WorkflowValidationError`.
   - `test_validate_duplicate_names` — returns `WorkflowValidationError`.
   - `test_validate_invalid_step_name` — returns `WorkflowValidationError`.
   - `test_validate_missing_prompt_file` — returns `WorkflowValidationError`.
   - `test_validate_path_traversal` — prompt_file containing `..` returns `WorkflowValidationError`.
   - `test_validate_empty_prompt_file` — returns `WorkflowValidationError`.
   - `test_validate_empty_model` — returns `WorkflowValidationError`.

5. **Run tests**
   ```bash
   cd src-tauri && cargo test workflow
   ```
   - ALL tests MUST pass.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP2-01**: `parse_workflow` correctly parses a valid YAML file into a `Workflow` struct.
  - *Proof required*: `test_parse_valid_workflow` passes; show parsed struct fields.
- [ ] **AC-WP2-02**: `parse_workflow` returns `WorkflowNotFound` for missing files.
  - *Proof required*: `test_parse_missing_file` passes; show error variant.
- [ ] **AC-WP2-03**: `parse_workflow` returns `WorkflowParseError` for invalid YAML.
  - *Proof required*: `test_parse_invalid_yaml` passes; show error variant.
- [ ] **AC-WP2-04**: `validate_workflow` rejects empty workflow name.
  - *Proof required*: `test_validate_empty_name` passes.
- [ ] **AC-WP2-05**: `validate_workflow` rejects empty steps array.
  - *Proof required*: `test_validate_empty_steps` passes.
- [ ] **AC-WP2-06**: `validate_workflow` rejects duplicate step names.
  - *Proof required*: `test_validate_duplicate_names` passes.
- [ ] **AC-WP2-07**: `validate_workflow` rejects step names not matching `^[a-zA-Z0-9_-]+$`.
  - *Proof required*: `test_validate_invalid_step_name` passes.
- [ ] **AC-WP2-08**: `validate_workflow` rejects missing prompt files.
  - *Proof required*: `test_validate_missing_prompt_file` passes.
- [ ] **AC-WP2-09**: `validate_workflow` rejects path traversal in `prompt_file` (`..` components).
  - *Proof required*: `test_validate_path_traversal` passes.
- [ ] **AC-WP2-10**: `validate_workflow` rejects empty `prompt_file`.
  - *Proof required*: `test_validate_empty_prompt_file` passes.
- [ ] **AC-WP2-11**: `validate_workflow` rejects empty `model`.
  - *Proof required*: `test_validate_empty_model` passes.
- [ ] **AC-WP2-12**: ALL test fixtures exist and are correctly structured.
  - *Proof required*: Directory tree listing of `tests/fixtures/project/`.
- [ ] **AC-WP2-13**: `cargo test workflow` passes with ZERO failures.
  - *Proof required*: Command output.
- [ ] **AC-WP2-14**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP2-15**: No regressions from WP0 or WP1.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

### Files Created/Modified
- `src-tauri/src/workflow.rs`
- `src-tauri/tests/fixtures/project/workflows/*.yaml`
- `src-tauri/tests/fixtures/project/prompts/*.md`

---

## WP3 — Variable Substitution

**Objective**: Replace `{{variables.<name>}}` placeholders in prompt text with file contents.

**Prerequisites**: WP1 complete AND verified.

### Tasks (ALL MANDATORY)

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
   - If file does not exist, return `VariableFileNotFound { path }` with the EXACT path.
   - If no matches found, return original string unchanged.
   - Unknown `{{...}}` patterns (not matching `variables.` prefix) are left untouched.

2. **Create test fixtures**
   - `tests/fixtures/project/variables/style.md` containing exactly "Write in a dark, brooding tone."
   - `tests/fixtures/project/variables/protagonist.md` containing exactly "John Doe, a retired detective."
   - `tests/fixtures/project/variables/my-var_name.md` containing "Test variable with hyphens and underscores."

3. **Write unit tests in `substitution.rs`**
   - `test_single_substitution` — one `{{variables.style}}` replaced with correct content.
   - `test_multiple_substitutions` — two different variables replaced correctly.
   - `test_same_variable_twice` — `{{variables.style}}` appears twice, BOTH replaced.
   - `test_no_variables` — text with no placeholders returned unchanged (same pointer not required, but same content).
   - `test_unknown_placeholder_ignored` — `{{unknown.thing}}` left untouched in output.
   - `test_missing_variable_file` — returns `VariableFileNotFound` with correct path.
   - `test_variable_with_special_chars_in_name` — `{{variables.my-var_name}}` works.
   - `test_mixed_placeholders` — `{{variables.style}}` replaced, `{{other.thing}}` untouched in same string.

4. **Run tests**
   ```bash
   cd src-tauri && cargo test substitution
   ```
   - ALL tests MUST pass.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP3-01**: Single variable substitution works correctly.
  - *Proof required*: `test_single_substitution` passes; show input/output.
- [ ] **AC-WP3-02**: Multiple different variables are all replaced correctly.
  - *Proof required*: `test_multiple_substitutions` passes.
- [ ] **AC-WP3-03**: Multiple occurrences of the same variable are ALL replaced.
  - *Proof required*: `test_same_variable_twice` passes; show output contains replacement twice.
- [ ] **AC-WP3-04**: Text with no placeholders is returned unchanged.
  - *Proof required*: `test_no_variables` passes.
- [ ] **AC-WP3-05**: Non-variable placeholders (`{{unknown.thing}}`) are left untouched.
  - *Proof required*: `test_unknown_placeholder_ignored` and `test_mixed_placeholders` pass.
- [ ] **AC-WP3-06**: Missing variable files produce `VariableFileNotFound` with the exact file path.
  - *Proof required*: `test_missing_variable_file` passes; show error contains path.
- [ ] **AC-WP3-07**: Variable names with hyphens and underscores work correctly.
  - *Proof required*: `test_variable_with_special_chars_in_name` passes.
- [ ] **AC-WP3-08**: `cargo test substitution` passes with ZERO failures.
  - *Proof required*: Command output.
- [ ] **AC-WP3-09**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP3-10**: No regressions from WP0, WP1, or WP2.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

### Files Created/Modified
- `src-tauri/src/substitution.rs`
- `src-tauri/tests/fixtures/project/variables/*.md`

---

## WP4 — Run Manager

**Objective**: Create and manage run directories on the filesystem.

**Prerequisites**: WP1 and WP2 complete AND verified.

### Tasks (ALL MANDATORY)

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
   - Write tests for ALL edge cases.

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
   - Handle directory name collisions (if directory exists, append `-2`, `-3`, etc.).

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
     - Preserve directory structure if prompt_file has subdirectories.
   - Verify all files are copied correctly.

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
   - Verify file was written correctly.

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
   - `test_slugify_basic` — "Write Chapter" → "write-chapter".
   - `test_slugify_special_chars` — "Chapter 1: The Beginning!" → "chapter-1-the-beginning".
   - `test_slugify_empty` — "" → "unnamed".
   - `test_slugify_truncation` — 100-char name → 50 chars max.
   - `test_slugify_consecutive_hyphens` — "Chapter  1" → "chapter-1".
   - `test_slugify_leading_trailing_hyphens` — "-Chapter-" → "chapter".
   - `test_create_run_directory` — directory created with correct name format.
   - `test_create_run_directory_collision` — two runs in same minute get different names.
   - `test_snapshot_workflow` — `_workflow.yaml` and `_prompts/` populated correctly.
   - `test_snapshot_workflow_preserves_subdirs` — subdirectory structure preserved.
   - `test_step_output_path` — correct zero-padded filename.
   - `test_read_step_output_exists` — returns `Some` with correct content.
   - `test_read_step_output_missing` — returns `None`.
   - `test_write_step_output` — file is created with correct content.
   - `test_write_step_output_overwrite` — existing file is overwritten.
   - `test_infer_run_status_all_complete` — all output files exist → all `Completed`.
   - `test_infer_run_status_partial` — some output files exist → mix of `Completed` and `Pending`.
   - `test_infer_run_status_all_pending` — no output files exist → all `Pending`.

9. **Run tests**
   ```bash
   cd src-tauri && cargo test run_manager
   ```
   - ALL tests MUST pass.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP4-01**: `slugify` produces correct output for basic input.
  - *Proof required*: `test_slugify_basic` passes.
- [ ] **AC-WP4-02**: `slugify` strips special characters.
  - *Proof required*: `test_slugify_special_chars` passes.
- [ ] **AC-WP4-03**: `slugify` handles empty string.
  - *Proof required*: `test_slugify_empty` passes.
- [ ] **AC-WP4-04**: `slugify` truncates to 50 characters.
  - *Proof required*: `test_slugify_truncation` passes.
- [ ] **AC-WP4-05**: `slugify` collapses consecutive hyphens.
  - *Proof required*: `test_slugify_consecutive_hyphens` passes.
- [ ] **AC-WP4-06**: `slugify` strips leading/trailing hyphens.
  - *Proof required*: `test_slugify_leading_trailing_hyphens` passes.
- [ ] **AC-WP4-07**: Run directories are named with timestamp prefix and slugified workflow name.
  - *Proof required*: `test_create_run_directory` passes; show directory name format.
- [ ] **AC-WP4-08**: Directory name collisions are handled (append `-2`, `-3`, etc.).
  - *Proof required*: `test_create_run_directory_collision` passes.
- [ ] **AC-WP4-09**: Workflow snapshots include the YAML file and all referenced prompt files.
  - *Proof required*: `test_snapshot_workflow` passes; show directory contents.
- [ ] **AC-WP4-10**: Snapshot preserves subdirectory structure in prompt files.
  - *Proof required*: `test_snapshot_workflow_preserves_subdirs` passes.
- [ ] **AC-WP4-11**: Step output filenames are zero-padded and correctly indexed (1-indexed).
  - *Proof required*: `test_step_output_path` passes; show expected filename.
- [ ] **AC-WP4-12**: `read_step_output` returns `Some(contents)` when file exists.
  - *Proof required*: `test_read_step_output_exists` passes.
- [ ] **AC-WP4-13**: `read_step_output` returns `None` when file does not exist.
  - *Proof required*: `test_read_step_output_missing` passes.
- [ ] **AC-WP4-14**: `write_step_output` creates file with correct content.
  - *Proof required*: `test_write_step_output` passes.
- [ ] **AC-WP4-15**: `write_step_output` overwrites existing files.
  - *Proof required*: `test_write_step_output_overwrite` passes.
- [ ] **AC-WP4-16**: `infer_run_status` correctly identifies all completed steps.
  - *Proof required*: `test_infer_run_status_all_complete` passes.
- [ ] **AC-WP4-17**: `infer_run_status` correctly identifies partial completion.
  - *Proof required*: `test_infer_run_status_partial` passes.
- [ ] **AC-WP4-18**: `infer_run_status` correctly identifies all pending steps.
  - *Proof required*: `test_infer_run_status_all_pending` passes.
- [ ] **AC-WP4-19**: `cargo test run_manager` passes with ZERO failures.
  - *Proof required*: Command output.
- [ ] **AC-WP4-20**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP4-21**: No regressions from WP0, WP1, WP2, or WP3.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

### Files Created/Modified
- `src-tauri/src/run_manager.rs`

---

## WP5 — OpenRouter Client

**Objective**: Send HTTP requests to OpenRouter and parse responses.

**Prerequisites**: WP1 complete AND verified.

### Tasks (ALL MANDATORY)

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
   - Create `reqwest::Client` with 30-second timeout.
   - Construct request body with exact JSON structure.
   - Set ALL required headers:
     - `Authorization: Bearer <api_key>`
     - `Content-Type: application/json`
     - `HTTP-Referer: https://plotline.app`
     - `X-Title: Plotline`
   - POST to `https://openrouter.ai/api/v1/chat/completions`.
   - Map status codes EXACTLY:
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

4. **Add `wiremock` to dev-dependencies**
   - Add to `Cargo.toml` `[dev-dependencies]`.
   - Verify `cargo check` still passes.

5. **Write integration tests using `wiremock`**
   - `test_complete_success` — mock returns 200 with valid JSON → returns `CompletionResponse` with correct fields.
   - `test_complete_401` — mock returns 401 → returns `ApiKeyInvalid`.
   - `test_complete_429` — mock returns 429 → returns `RateLimited`.
   - `test_complete_500` — mock returns 500 → returns `ProviderError` with correct status.
   - `test_complete_502` — mock returns 502 → returns `ProviderError`.
   - `test_complete_malformed_json` — mock returns 200 with invalid JSON → returns `ResponseParseError`.
   - `test_complete_timeout` — mock delays longer than timeout → returns `NetworkTimeout`.
   - `test_complete_connection_failed` — mock server unavailable → returns `ProviderError` with status 0.
   - `test_complete_missing_choices` — mock returns 200 with empty choices → returns `ResponseParseError`.
   - `test_complete_missing_usage` — mock returns 200 with missing usage → returns `ResponseParseError`.
   - Verify headers are sent correctly in at least one test.

6. **Run tests**
   ```bash
   cd src-tauri && cargo test openrouter
   ```
   - ALL tests MUST pass.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP5-01**: Successful API calls return parsed content and token counts.
  - *Proof required*: `test_complete_success` passes; show returned struct fields.
- [ ] **AC-WP5-02**: HTTP 401 is mapped to `ApiKeyInvalid`.
  - *Proof required*: `test_complete_401` passes.
- [ ] **AC-WP5-03**: HTTP 429 is mapped to `RateLimited`.
  - *Proof required*: `test_complete_429` passes.
- [ ] **AC-WP5-04**: HTTP 5xx is mapped to `ProviderError` with status and body.
  - *Proof required*: `test_complete_500` and `test_complete_502` pass.
- [ ] **AC-WP5-05**: Network timeouts are caught and mapped to `NetworkTimeout`.
  - *Proof required*: `test_complete_timeout` passes.
- [ ] **AC-WP5-06**: Connection failures are mapped to `ProviderError { status: 0, body: "Connection failed" }`.
  - *Proof required*: `test_complete_connection_failed` passes.
- [ ] **AC-WP5-07**: Malformed JSON responses return `ResponseParseError`.
  - *Proof required*: `test_complete_malformed_json` passes.
- [ ] **AC-WP5-08**: Missing `choices` or `usage` in response returns `ResponseParseError`.
  - *Proof required*: `test_complete_missing_choices` and `test_complete_missing_usage` pass.
- [ ] **AC-WP5-09**: Headers include `HTTP-Referer` and `X-Title` as required by OpenRouter.
  - *Proof required*: Wiremock verification showing headers in test.
- [ ] **AC-WP5-10**: `cargo test openrouter` passes with ZERO failures.
  - *Proof required*: Command output.
- [ ] **AC-WP5-11**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP5-12**: No regressions from WP0–WP4.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

### Files Created/Modified
- `src-tauri/src/openrouter.rs`
- `src-tauri/Cargo.toml` (add `wiremock` to dev-dependencies)

---

## WP6 — Execution Engine

**Objective**: Implement the core sequential execution loop that ties together parsing, substitution, API calls, and file I/O.

**Prerequisites**: WP2, WP3, WP4, WP5 complete AND verified.

### Tasks (ALL MANDATORY)

1. **Implement `run_workflow` in `engine.rs`**
   ```rust
   pub async fn run_workflow(
       app_handle: &AppHandle,
       workflow_path: &Path,
       project_root: &Path,
   ) -> Result<(), PlotlineError>
   ```
   - Call `workflow::parse_workflow` and `workflow::validate_workflow`.
   - Call `run_manager::create_run_directory`.
   - Call `run_manager::snapshot_workflow`.
   - Emit `run_started` event with `{ run_dir }`.
   - Initialize `previous_output: Option<String> = None`.
   - For each step (0-indexed):
     - Emit `step_started` with `{ step_index, step_name }`.
     - Read prompt file from `run_dir / "_prompts" / <prompt_file>`.
     - Call `substitution::substitute_variables` (use `project_root`, NOT `run_dir`).
     - If `previous_output` is `Some`:
       - Append `"\n\n---\n\nPrevious Step Output:\n\n"` + `previous_output` to prompt.
     - Retrieve API key from keyring via `config::get_api_key`.
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
   - Parse workflow from `run_dir / "_workflow.yaml"` (use `run_dir` as project root for path resolution since prompts are snapshotted there).
   - Validate `step_index` is within bounds.
   - Emit `run_started` with `{ run_dir }`.
   - If `step_index > 0`:
     - Read previous step's output from disk using `run_manager::read_step_output`.
     - Set `previous_output` to that content.
   - Else: `previous_output = None`.
   - For each step from `step_index` onward:
     - Same loop body as `run_workflow`.
     - Before writing a step's output, delete any existing output files for this step AND all subsequent steps.
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
   - `test_run_workflow_complete` — all 3 steps execute, output files created, events emitted in correct order.
   - `test_run_workflow_error_halts` — step 2 returns 500 → run stops, step 3 never executes, step 1 output preserved.
   - `test_run_workflow_api_key_missing` — no API key set → returns `ApiKeyNotSet`, emits `run_error`.
   - `test_rerun_from_step` — run completes, then re-run from step 2 → step 1 output preserved, steps 2 and 3 overwritten.
   - `test_rerun_deletes_subsequent` — run completes, then re-run from step 1 → all outputs overwritten.
   - `test_context_concatenation` — step 2's API call contains step 1's output in the prompt.
   - `test_rerun_from_step_zero` — re-run from step 0 → no previous output appended to step 1.
   - `test_rerun_uses_edited_output` — edit step 1 output, re-run from step 2 → step 2 prompt contains edited content.
   - Verify event emission order in every test.

5. **Run tests**
   ```bash
   cd src-tauri && cargo test engine
   ```
   - ALL tests MUST pass.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP6-01**: Full workflow runs execute all steps sequentially.
  - *Proof required*: `test_run_workflow_complete` passes; show all 3 output files exist.
- [ ] **AC-WP6-02**: Each step's prompt includes the previous step's output appended with the exact separator `"\n\n---\n\nPrevious Step Output:\n\n"`.
  - *Proof required*: `test_context_concatenation` passes; show prompt content sent to mock.
- [ ] **AC-WP6-03**: Errors halt execution and preserve completed step outputs.
  - *Proof required*: `test_run_workflow_error_halts` passes; show step 1 output exists, step 3 output does not exist.
- [ ] **AC-WP6-04**: Missing API key returns `ApiKeyNotSet` and emits `run_error`.
  - *Proof required*: `test_run_workflow_api_key_missing` passes.
- [ ] **AC-WP6-05**: Re-run from step uses existing prior outputs as context.
  - *Proof required*: `test_rerun_from_step` passes; show step 2 prompt contains step 1 output.
- [ ] **AC-WP6-06**: Re-run from step overwrites subsequent outputs.
  - *Proof required*: `test_rerun_deletes_subsequent` passes; show files are overwritten.
- [ ] **AC-WP6-07**: Re-run from step 0 does not append previous output to first step.
  - *Proof required*: `test_rerun_from_step_zero` passes; show step 1 prompt has no previous output.
- [ ] **AC-WP6-08**: Re-run uses edited outputs from disk as context.
  - *Proof required*: `test_rerun_uses_edited_output` passes; show edited content appears in subsequent prompt.
- [ ] **AC-WP6-09**: Events are emitted in correct order: `run_started` → (`step_started` → `step_completed`)* → `run_completed`.
  - *Proof required*: Show event log from test verifying order.
- [ ] **AC-WP6-10**: `cargo test engine` passes with ZERO failures.
  - *Proof required*: Command output.
- [ ] **AC-WP6-11**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP6-12**: No regressions from WP0–WP5.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

### Files Created/Modified
- `src-tauri/src/engine.rs`

---

## WP7 — Tauri IPC Commands & Config

**Objective**: Expose backend functionality to the frontend via Tauri commands. Implement API key storage.

**Prerequisites**: WP6 complete AND verified.

### Tasks (ALL MANDATORY)

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
   - Write tests for all three functions (mock keyring if necessary, or test with real OS keyring).

2. **Implement ALL commands in `commands.rs`**
   - Implement EVERY command listed in Doc 2, Section 8 (`commands.rs` module spec).
   - Each command:
     - Converts string parameters to `PathBuf` where needed.
     - Calls the appropriate backend module function.
     - Maps `PlotlineError` to `String` via `.map_err(|e| e.to_string())`.
     - Returns `Result<T, String>`.
   - Commands to implement:
     - `run_workflow`
     - `rerun_from_step`
     - `save_output`
     - `get_run_status`
     - `list_workflows`
     - `list_runs`
     - `read_file_content`
     - `set_api_key`
     - `get_api_key`
     - `has_api_key`
     - `set_project_root`
     - `get_project_root`
   - For `run_workflow` and `rerun_from_step`:
     - These are async and long-running.
     - Use `tauri::async_runtime::spawn` to run the engine in a background task.
     - Pass a clone of `AppHandle` to the spawned task for event emission.
     - Return the `run_dir` immediately so the frontend can start listening.

3. **Register commands in `main.rs` / `lib.rs`**
   - ALL 12 commands MUST be registered in `invoke_handler`.
   - Verify `cargo check` passes after registration.

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
   - Skip unparsable files but log warning.

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
   - Return error string if path is outside project root.

7. **Implement project root management**
   - Use `tauri-plugin-store` to persist `project_root` in `settings.json`.
   - `set_project_root`: validate directory exists, store in plugin.
   - `get_project_root`: read from plugin, return `None` if not set.

8. **Write tests for commands**
   - Test each command with valid and invalid inputs.
   - Test `read_file_content` path traversal rejection.
   - Test `list_workflows` with empty directory.
   - Test `list_runs` with no runs directory.

9. **Manual verification**
   - Launch app in dev mode.
   - Use Tauri devtools console to invoke commands and verify responses.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP7-01**: ALL 12 IPC commands are implemented and registered.
  - *Proof required*: List all commands with their function signatures; show `invoke_handler` registration.
- [ ] **AC-WP7-02**: `get_api_key` retrieves key from OS keyring; returns `ApiKeyNotSet` if missing.
  - *Proof required*: Test output showing both cases.
- [ ] **AC-WP7-03**: `set_api_key` stores key in OS keyring.
  - *Proof required*: Test output showing storage and retrieval.
- [ ] **AC-WP7-04**: `has_api_key` returns correct boolean.
  - *Proof required*: Test output showing both true and false cases.
- [ ] **AC-WP7-05**: `run_workflow` returns immediately with `run_dir` while execution continues in background.
  - *Proof required*: Test showing return value before events complete.
- [ ] **AC-WP7-06**: `rerun_from_step` returns immediately while execution continues in background.
  - *Proof required*: Test showing return value before events complete.
- [ ] **AC-WP7-07**: `list_workflows` returns all valid YAML files in the workflows directory.
  - *Proof required*: Test with multiple YAML files; show returned summaries.
- [ ] **AC-WP7-08**: `list_workflows` skips unparsable files without crashing.
  - *Proof required*: Test with one valid and one invalid YAML file.
- [ ] **AC-WP7-09**: `list_runs` returns all run directories with inferred status.
  - *Proof required*: Test with multiple run directories; show returned summaries.
- [ ] **AC-WP7-10**: `read_file_content` rejects paths outside project root.
  - *Proof required*: Test showing path traversal attempt is rejected.
- [ ] **AC-WP7-11**: `set_project_root` persists across app restarts via `tauri-plugin-store`.
  - *Proof required*: Test setting, then reading back from store.
- [ ] **AC-WP7-12**: `get_project_root` returns `None` if not set.
  - *Proof required*: Test on fresh store.
- [ ] **AC-WP7-13**: ALL commands map `PlotlineError` to `String` correctly.
  - *Proof required*: Show error handling in at least 3 commands.
- [ ] **AC-WP7-14**: `cargo test` (full suite) passes with ZERO failures.
  - *Proof required*: Command output.
- [ ] **AC-WP7-15**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP7-16**: No regressions from WP0–WP6.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

### Files Created/Modified
- `src-tauri/src/config.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/src/main.rs` or `src-tauri/src/lib.rs`

---

## WP8 — Frontend Foundation

**Objective**: Set up the React application structure, state management, and Tauri API bridge.

**Prerequisites**: WP7 complete AND verified.

### Tasks (ALL MANDATORY)

1. **Create `src/api/tauri.ts` — Typed IPC wrappers**
   - Implement wrappers for ALL 12 commands:
     - `listWorkflows(projectRoot: string): Promise<WorkflowSummary[]>`
     - `runWorkflow(workflowPath: string, projectRoot: string): Promise<string>`
     - `rerunFromStep(runDir: string, stepIndex: number): Promise<void>`
     - `saveOutput(runDir: string, stepIndex: number, stepName: string, content: string): Promise<void>`
     - `getRunStatus(runDir: string): Promise<RunInfo>`
     - `listRuns(projectRoot: string): Promise<RunSummary[]>`
     - `readFileContent(filePath: string): Promise<string>`
     - `setApiKey(key: string): Promise<void>`
     - `getApiKey(): Promise<string>`
     - `hasApiKey(): Promise<boolean>`
     - `setProjectRoot(path: string): Promise<void>`
     - `getProjectRoot(): Promise<string | null>`
   - Each function wraps `invoke` with proper typing.
   - Errors are thrown as `Error` objects with the backend error string as message.
   - Write tests for all wrappers (mock `invoke` if necessary).

2. **Create `src/hooks/useTauriEvent.ts`**
   - Implement `useTauriEvent<T>` hook.
   - Correctly subscribes to Tauri events.
   - Correctly unsubscribes on unmount.
   - Handles stale closures correctly (use ref or `useCallback` pattern).
   - Write tests verifying subscribe/unsubscribe behavior.

3. **Create `src/hooks/useRunState.ts`**
   - Manages the current run's state.
   - Listens to `run_started`, `step_started`, `step_completed`, `run_completed`, `run_error` events.
   - Exposes: `currentRun`, `runStatus`, `stepStatuses`, `error`.
   - Resets state when a new run starts.
   - Write tests for all event transitions.

4. **Create `src/hooks/useProjectRoot.ts`**
   - Loads project root from backend on mount.
   - Exposes `projectRoot`, `setProjectRoot`, `isLoading`.
   - Write tests for loading, success, and error states.

5. **Create `src/App.tsx` — Main application shell**
   - Layout:
     - Header: "Plotline" + Settings button
     - Sidebar: Workflows list + Runs list
     - Main Content Area: RunMonitor or WorkflowSelector or OutputEditor
     - Footer: Status bar (project root, run status)
   - Use simple state-based view switching (no router needed for MVP).
   - Views: `'selector'`, `'monitor'`, `'settings'`.
   - Write tests verifying layout renders and view switching works.

6. **Create `src/styles/global.css`**
   - Reset styles.
   - CSS variables for color scheme (dark theme: `#1a1a2e` background, `#16213e` panels, `#0f3460` accents, `#e94560` primary action).
   - Monospace font for status displays, sans-serif for UI text.
   - Responsive layout using CSS Grid.
   - Verify styles are imported in `App.tsx` or `main.tsx`.

7. **Create placeholder components**
   - `WorkflowSelector.tsx` — renders "Select a workflow" placeholder.
   - `RunMonitor.tsx` — renders "No active run" placeholder.
   - `OutputEditor.tsx` — renders "No output selected" placeholder.
   - `SettingsModal.tsx` — renders "Settings" placeholder.
   - Each component must be a valid React component with proper TypeScript types.
   - Write tests verifying each placeholder renders.

8. **Verify the app launches and renders the shell layout.**
   - `npm run tauri dev` must show the three-panel layout.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP8-01**: `src/api/tauri.ts` exports typed wrappers for ALL 12 IPC commands.
  - *Proof required*: Show all 12 exported functions with signatures.
- [ ] **AC-WP8-02**: API wrappers throw `Error` objects with backend error messages.
  - *Proof required*: Test showing error thrown with correct message.
- [ ] **AC-WP8-03**: `useTauriEvent` hook correctly subscribes to events.
  - *Proof required*: Test showing event listener is registered.
- [ ] **AC-WP8-04**: `useTauriEvent` hook correctly unsubscribes on unmount.
  - *Proof required*: Test showing unlisten function is called on unmount.
- [ ] **AC-WP8-05**: `useRunState` hook tracks all run events and exposes correct state.
  - *Proof required*: Test showing state transitions for each event type.
- [ ] **AC-WP8-06**: `useRunState` resets state when a new run starts.
  - *Proof required*: Test showing state reset on `run_started`.
- [ ] **AC-WP8-07**: `useProjectRoot` loads project root from backend on mount.
  - *Proof required*: Test showing `getProjectRoot` is called on mount.
- [ ] **AC-WP8-08**: App renders three-panel layout (sidebar, main content, status bar).
  - *Proof required*: Test or visual verification showing all three panels.
- [ ] **AC-WP8-09**: View switching works between selector, monitor, and settings.
  - *Proof required*: Test showing state changes update rendered view.
- [ ] **AC-WP8-10**: Dark theme CSS variables are applied.
  - *Proof required*: Test or inspection showing CSS variables in computed styles.
- [ ] **AC-WP8-11**: All placeholder components render without errors.
  - *Proof required*: Tests for each placeholder component pass.
- [ ] **AC-WP8-12**: `npm run build` succeeds with ZERO errors.
  - *Proof required*: Command output.
- [ ] **AC-WP8-13**: `npx tsc --noEmit` passes with ZERO errors.
  - *Proof required*: Command output.
- [ ] **AC-WP8-14**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP8-15**: No regressions from WP0–WP7.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

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

**Prerequisites**: WP8 complete AND verified.

### Tasks (ALL MANDATORY)

1. **Implement `SettingsModal.tsx`**
   - Modal overlay with two sections:
     - **Project Root**: Display current path. Button "Change..." opens a directory picker.
     - **OpenRouter API Key**: Password input field. "Save" button. Status indicator (green check if set, red X if not).
   - On mount, call `has_api_key` and `get_project_root` to populate current state.
   - On "Save" (API key): call `set_api_key`. Show success/error toast.
   - On "Change..." (project root): open directory dialog, call `set_project_root` with selected path. Update display.
   - "Close" button hides modal.
   - Write tests for all interactions.

2. **Add `@tauri-apps/plugin-dialog` dependency**
   - `npm install @tauri-apps/plugin-dialog`
   - Add to Tauri capabilities: `"dialog:allow-open"`.
   - Verify `cargo check` and `npm run build` pass.

3. **Wire Settings button in header**
   - Gear icon in `App.tsx` header.
   - Clicking opens `SettingsModal`.
   - Write test verifying button opens modal.

4. **Implement toast notifications**
   - `src/components/Toast.tsx`.
   - Types: `success`, `error`.
   - Auto-dismiss after 4 seconds.
   - Stack multiple toasts vertically.
   - Write tests for toast rendering, auto-dismiss, and stacking.

5. **Manual verification**
   - Open Settings → enter API key → save → close → reopen → verify key is marked as set.
   - Change project root → verify status bar updates.
   - Try saving empty API key → verify error toast.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP9-01**: Settings modal opens and closes correctly.
  - *Proof required*: Test showing modal visibility toggles.
- [ ] **AC-WP9-02**: API key can be entered and saved.
  - *Proof required*: Test showing `set_api_key` is called with input value.
- [ ] **AC-WP9-03**: API key status is visible (set/unset indicator).
  - *Proof required*: Test showing indicator changes based on `has_api_key` result.
- [ ] **AC-WP9-04**: Project root can be changed via directory picker.
  - *Proof required*: Test showing dialog opens and `set_project_root` is called with selected path.
- [ ] **AC-WP9-05**: Changes persist across app restarts (via `tauri-plugin-store`).
  - *Proof required*: Test or manual verification showing project root persists.
- [ ] **AC-WP9-06**: Invalid operations show error toasts.
  - *Proof required*: Test showing error toast on failed operation.
- [ ] **AC-WP9-07**: Success operations show success toasts.
  - *Proof required*: Test showing success toast on successful save.
- [ ] **AC-WP9-08**: Toasts auto-dismiss after 4 seconds.
  - *Proof required*: Test using fake timers showing toast disappears.
- [ ] **AC-WP9-09**: Multiple toasts stack vertically.
  - *Proof required*: Test showing multiple toasts rendered in stack.
- [ ] **AC-WP9-10**: `@tauri-apps/plugin-dialog` is installed and configured.
  - *Proof required*: `package.json` shows dependency; capabilities file has permission.
- [ ] **AC-WP9-11**: `npm run build` succeeds with ZERO errors.
  - *Proof required*: Command output.
- [ ] **AC-WP9-12**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP9-13**: No regressions from WP0–WP8.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

### Files Created/Modified
- `src/components/SettingsModal.tsx`
- `src/components/Toast.tsx`
- `src/App.tsx` (add settings button and modal)
- `package.json` (add `@tauri-apps/plugin-dialog`)
- `src-tauri/capabilities/default.json` (add dialog permission)

---

## WP10 — Workflow Selector UI

**Objective**: Display available workflows and allow the user to start a run.

**Prerequisites**: WP8 complete AND verified.

### Tasks (ALL MANDATORY)

1. **Implement `WorkflowSelector.tsx`**
   - On mount, call `listWorkflows(projectRoot)`.
   - Display loading state while fetching.
   - If no workflows found: show empty state with exact text: "Create a workflow YAML file in your project's workflows/ directory."
   - If workflows found: render a list of cards, each showing:
     - Workflow name
     - Step count
     - "Run" button
   - Clicking "Run":
     - Call `runWorkflow(workflowPath, projectRoot)`.
     - Receive `run_dir` from backend.
     - Switch view to `RunMonitor` with the `run_dir`.
   - Write tests for all states and interactions.

2. **Implement run history list in sidebar**
   - Call `listRuns(projectRoot)`.
   - Display runs sorted by date (newest first).
   - Each run entry shows:
     - Workflow name
     - Date/time
     - Progress (e.g., "3/5 steps")
   - Clicking a run loads it in `RunMonitor`.
   - Write tests for rendering and interaction.

3. **Handle loading and error states**
   - If `listWorkflows` fails: show error message in the selector area.
   - If `listRuns` fails: show error message in the sidebar.
   - If `runWorkflow` fails: show error toast, stay on selector view.
   - Write tests for error states.

4. **Manual verification**
   - Create a test project with 2-3 workflow YAML files.
   - Set project root in Settings.
   - Verify workflows appear in the selector.
   - Click "Run" on a workflow.
   - Verify view switches to RunMonitor.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP10-01**: Available workflows are listed with name and step count.
  - *Proof required*: Test showing workflow cards with correct data.
- [ ] **AC-WP10-02**: Empty state is shown when no workflows exist with exact specified text.
  - *Proof required*: Test showing empty state message.
- [ ] **AC-WP10-03**: Clicking "Run" starts the workflow and navigates to the run monitor.
  - *Proof required*: Test showing `runWorkflow` is called and view switches to monitor.
- [ ] **AC-WP10-04**: Run history appears in the sidebar sorted newest first.
  - *Proof required*: Test showing runs in correct order.
- [ ] **AC-WP10-05**: Clicking a past run loads it in the monitor.
  - *Proof required*: Test showing `getRunStatus` is called and monitor receives run data.
- [ ] **AC-WP10-06**: Loading states are displayed while fetching.
  - *Proof required*: Test showing loading indicator during fetch.
- [ ] **AC-WP10-07**: Error states are displayed gracefully.
  - *Proof required*: Test showing error message on failed fetch.
- [ ] **AC-WP10-08**: `runWorkflow` failure shows error toast and stays on selector.
  - *Proof required*: Test showing toast and no view change on error.
- [ ] **AC-WP10-09**: `npm run build` succeeds with ZERO errors.
  - *Proof required*: Command output.
- [ ] **AC-WP10-10**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP10-11**: No regressions from WP0–WP9.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

### Files Created/Modified
- `src/components/WorkflowSelector.tsx`
- `src/App.tsx` (integrate selector view and sidebar runs list)

---

## WP11 — Run Monitor UI

**Objective**: Display real-time execution progress and step statuses.

**Prerequisites**: WP10 complete AND verified.

### Tasks (ALL MANDATORY)

1. **Implement `RunMonitor.tsx`**
   - Accept `runDir` as prop.
   - On mount, call `getRunStatus(runDir)` to load initial state.
   - Subscribe to Tauri events using `useRunState` hook.
   - Render a vertical list of `StepCard` components, one per step.
   - Write tests for all event-driven state updates.

2. **Implement `StepCard.tsx`**
   - Props: `stepIndex`, `stepName`, `status`, `outputPath`, `error`, `onViewOutput`, `onRerunFromHere`.
   - Visual states:
     - `pending`: gray circle `○`, dimmed text.
     - `running`: pulsing blue circle `►`, normal text.
     - `completed`: green check `✓`, normal text, "View Output" button.
     - `error`: red X `✗`, error text displayed below.
   - Clicking "View Output" calls `onViewOutput(outputPath)`.
   - Clicking "Re-run from here" calls `onRerunFromHere(stepIndex)`.
   - Write tests for all visual states.

3. **Implement run header**
   - Display workflow name.
   - Display run directory path (truncated with tooltip).
   - Display overall progress: "X/Y steps completed".
   - Display elapsed time (updates every second while running).
   - If run is complete: show "Completed" badge.
   - If run has error: show "Failed" badge with error summary.
   - Write tests for header rendering and updates.

4. **Implement "Re-run from Step" UI**
   - Each completed or errored step card has a "Re-run from here" button.
   - Clicking it:
     - Calls `rerunFromStep(runDir, stepIndex)`.
     - Resets all subsequent step cards to `pending`.
     - `useRunState` hook handles event-driven updates.
   - Write tests for re-run UI flow.

5. **Handle active run state**
   - While a run is active, disable the "Run" buttons in the WorkflowSelector.
   - Show a "Running..." indicator in the status bar.
   - Write tests for disabled state and indicator.

6. **Manual verification**
   - Start a workflow run.
   - Verify step cards transition from pending → running → completed in real-time.
   - Verify elapsed time counter works.
   - Verify error state displays correctly (temporarily break API key to test).
   - Click "View Output" on a completed step → verify OutputEditor loads.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP11-01**: Step statuses update in real-time during execution.
  - *Proof required*: Test simulating events and showing status changes.
- [ ] **AC-WP11-02**: Visual indicators clearly show pending (gray `○`), running (blue `►`), completed (green `✓`), and error (red `✗`).
  - *Proof required*: Tests for each state showing correct icon/color.
- [ ] **AC-WP11-03**: Elapsed time displays and updates while running.
  - *Proof required*: Test using fake timers showing time increments.
- [ ] **AC-WP11-04**: "View Output" button appears only on completed steps.
  - *Proof required*: Test showing button exists for completed, absent for pending/running/error.
- [ ] **AC-WP11-05**: "Re-run from here" button appears on completed and errored steps.
  - *Proof required*: Test showing button exists for completed/error, absent for pending/running.
- [ ] **AC-WP11-06**: Error messages are displayed inline on the failed step card.
  - *Proof required*: Test showing error text is rendered.
- [ ] **AC-WP11-07**: Run header shows correct workflow name and progress.
  - *Proof required*: Test showing header content matches run data.
- [ ] **AC-WP11-08**: Run header shows "Completed" badge when done.
  - *Proof required*: Test showing badge appears on `run_completed`.
- [ ] **AC-WP11-09**: Run header shows "Failed" badge when error occurs.
  - *Proof required*: Test showing badge appears on `run_error`.
- [ ] **AC-WP11-10**: Active run disables "Run" buttons in WorkflowSelector.
  - *Proof required*: Test showing buttons are disabled during active run.
- [ ] **AC-WP11-11**: Status bar shows "Running..." indicator during active run.
  - *Proof required*: Test showing indicator is present during run.
- [ ] **AC-WP11-12**: `npm run build` succeeds with ZERO errors.
  - *Proof required*: Command output.
- [ ] **AC-WP11-13**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP11-14**: No regressions from WP0–WP10.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

### Files Created/Modified
- `src/components/RunMonitor.tsx`
- `src/components/StepCard.tsx`

---

## WP12 — Output Editor UI

**Objective**: Display and allow editing of step outputs using CodeMirror.

**Prerequisites**: WP11 complete AND verified.

### Tasks (ALL MANDATORY)

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
   - Write tests for all modes and interactions.

2. **Configure CodeMirror**
   - Use `@uiw/react-codemirror` with `markdown()` extension.
   - Dark theme.
   - Height 100%.
   - Verify editor renders and accepts input.

3. **Configure react-markdown**
   - Use `react-markdown` to render content.
   - Verify Markdown renders correctly (headings, lists, code blocks).

4. **Handle unsaved changes**
   - If user clicks "Close" while in edit mode with unsaved changes:
     - Show confirmation dialog: "You have unsaved changes. Discard?"
     - "Discard" → close without saving.
     - "Cancel" → stay in editor.
   - Write tests for confirmation dialog flow.

5. **Handle large outputs**
   - If output exceeds 100KB, show warning: "Large output may be slow to render."
   - Still allow editing.
   - Write test for warning display.

6. **Manual verification**
   - Run a workflow to completion.
   - Click "View Output" on a step.
   - Verify Markdown renders correctly in view mode.
   - Switch to edit mode.
   - Make changes.
   - Save.
   - Verify file on disk contains the edited content.
   - Close and reopen → verify edited content persists.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP12-01**: Step outputs render as formatted Markdown in view mode.
  - *Proof required*: Test showing `react-markdown` renders content.
- [ ] **AC-WP12-02**: Edit mode provides a functional Markdown editor with syntax highlighting.
  - *Proof required*: Test showing CodeMirror renders with `markdown()` extension.
- [ ] **AC-WP12-03**: Changes are saved to disk via `saveOutput` command.
  - *Proof required*: Test showing `saveOutput` is called with correct arguments.
- [ ] **AC-WP12-04**: Success toast is shown after saving.
  - *Proof required*: Test showing toast on successful save.
- [ ] **AC-WP12-05**: Unsaved changes prompt a confirmation dialog before closing.
  - *Proof required*: Test showing dialog appears and handles both discard and cancel.
- [ ] **AC-WP12-06**: Large outputs (>100KB) show a warning but remain editable.
  - *Proof required*: Test showing warning message for large content.
- [ ] **AC-WP12-07**: Close button returns to RunMonitor.
  - *Proof required*: Test showing `onClose` is called.
- [ ] **AC-WP12-08**: `npm run build` succeeds with ZERO errors.
  - *Proof required*: Command output.
- [ ] **AC-WP12-09**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP12-10**: No regressions from WP0–WP11.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

### Files Created/Modified
- `src/components/OutputEditor.tsx`

---

## WP13 — Re-run Functionality Integration

**Objective**: End-to-end integration of the re-run from step feature.

**Prerequisites**: WP12 complete AND verified.

### Tasks (ALL MANDATORY)

1. **Wire "Re-run from here" in `StepCard.tsx`**
   - On click, call `rerunFromStep(runDir, stepIndex)`.
   - The backend will:
     - Delete output files for this step and all subsequent steps.
     - Start execution from this step.
     - Emit `run_started`, then `step_started` for this step.
   - The `useRunState` hook receives events and updates the UI.
   - Write tests for the click handler.

2. **Handle UI state during re-run**
   - When re-run starts:
     - All step cards from the selected step onward reset to `pending`.
     - The selected step card transitions to `running`.
   - As steps complete, they transition to `completed` one by one.
   - The run header updates to show "Re-running from Step N".
   - Write tests for state transitions during re-run.

3. **Handle edited outputs in re-run**
   - If the user edited step 2's output and then re-runs from step 3:
     - The backend reads step 2's output from disk (which now contains the edited content).
     - Step 3's prompt will include the edited step 2 output as context.
   - Write integration test verifying this behavior.

4. **Manual verification — full scenario**
   - Create a 4-step workflow.
   - Run to completion.
   - Open step 2 output in editor.
   - Edit the output significantly (add unique marker string like "EDITED_12345").
   - Save.
   - Click "Re-run from here" on step 3.
   - Wait for completion.
   - Open step 3 output.
   - Verify the edited content from step 2 appears in step 3's context.

5. **Edge case: re-run from step 0**
   - Click "Re-run from here" on step 1 (index 0).
   - Verify all steps are re-executed.
   - Verify no previous output is appended to step 1's prompt.

6. **Edge case: re-run after error**
   - Run a workflow that fails at step 3.
   - Click "Re-run from here" on step 3.
   - Verify step 3 re-executes and step 4 follows if successful.
   - Add tooltip/info text on re-run button: "Uses the original workflow snapshot."

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP13-01**: Re-run from any step executes that step and all subsequent steps.
  - *Proof required*: Integration test showing steps from N onward execute.
- [ ] **AC-WP13-02**: Edited outputs from prior steps are used as context for the re-run.
  - *Proof required*: Integration test showing edited content appears in subsequent prompt.
- [ ] **AC-WP13-03**: Re-run from step 0 (first step) works correctly with no previous context.
  - *Proof required*: Test showing step 1 prompt has no previous output.
- [ ] **AC-WP13-04**: UI state updates correctly during re-run (pending → running → completed).
  - *Proof required*: Test showing state transitions for re-run.
- [ ] **AC-WP13-05**: Run header shows "Re-running from Step N" during re-run.
  - *Proof required*: Test showing header text updates.
- [ ] **AC-WP13-06**: The limitation of using snapshotted workflow definitions is communicated to the user.
  - *Proof required*: Test showing tooltip/info text exists.
- [ ] **AC-WP13-07**: `npm run build` succeeds with ZERO errors.
  - *Proof required*: Command output.
- [ ] **AC-WP13-08**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP13-09**: No regressions from WP0–WP12.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

### Files Created/Modified
- `src/components/StepCard.tsx` (wire re-run button)
- `src/components/RunMonitor.tsx` (handle re-run state)

---

## WP14 — Error Handling & Edge Case Polish

**Objective**: Handle all identified edge cases and ensure error states are user-friendly.

**Prerequisites**: WP13 complete AND verified.

### Tasks (ALL MANDATORY)

1. **API key edge cases**
   - If API key is not set and user clicks "Run": show toast "Please set your OpenRouter API key in Settings." and open Settings modal automatically.
   - If API key is invalid (401 from OpenRouter): show error on step card: "Invalid API key. Update it in Settings." with an "Open Settings" button.
   - Write tests for both scenarios.

2. **Network error handling**
   - If OpenRouter is unreachable: show error "Cannot connect to OpenRouter. Check your internet connection."
   - If request times out: show error "Request timed out after 30 seconds. Try re-running from this step."
   - Write tests for both scenarios.

3. **Filesystem edge cases**
   - If project root doesn't have a `workflows/` directory: show empty state with instructions.
   - If a run directory is missing expected files (e.g., `_workflow.yaml` deleted): show error "Run directory is corrupted. Missing workflow snapshot."
   - If file write fails (disk full, permissions): show error "Failed to save output. Check disk space and permissions."
   - Write tests for all scenarios.

4. **Empty workflow directory**
   - If `listWorkflows` returns empty array: show helpful empty state in `WorkflowSelector` with a sample workflow YAML.

5. **Invalid workflow YAML**
   - If `listWorkflows` encounters a file that fails to parse: skip it, show warning banner: "Some workflow files could not be loaded. Check the console for details."
   - Write test for warning banner.

6. **Run directory naming collisions**
   - If two runs start within the same minute: append `-2`, `-3`, etc. to the directory name.
   - Update `create_run_directory` to check for existing directory and append suffix.
   - Write test for collision handling.

7. **Frontend error boundaries**
   - Wrap the main content area in a React error boundary.
   - If a component crashes: show "Something went wrong" with a "Reload" button that resets the view to WorkflowSelector.
   - Write test for error boundary behavior.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP14-01**: Missing API key prompts user to set it before running, with auto-open Settings.
  - *Proof required*: Test showing Settings modal opens on run without key.
- [ ] **AC-WP14-02**: Invalid API key (401) shows actionable error with "Open Settings" button.
  - *Proof required*: Test showing error message and button.
- [ ] **AC-WP14-03**: Network unreachable shows actionable error message.
  - *Proof required*: Test showing correct error text.
- [ ] **AC-WP14-04**: Request timeout shows actionable error message.
  - *Proof required*: Test showing correct error text.
- [ ] **AC-WP14-05**: Missing `workflows/` directory shows helpful empty state.
  - *Proof required*: Test showing empty state with instructions.
- [ ] **AC-WP14-06**: Corrupted run directory shows clear error message.
  - *Proof required*: Test showing error on missing `_workflow.yaml`.
- [ ] **AC-WP14-07**: File write failures show actionable error message.
  - *Proof required*: Test showing error on write failure.
- [ ] **AC-WP14-08**: Empty workflow directory shows sample workflow YAML.
  - *Proof required*: Test showing sample YAML in empty state.
- [ ] **AC-WP14-09**: Invalid workflow files are skipped with warning banner.
  - *Proof required*: Test showing banner when one file fails to parse.
- [ ] **AC-WP14-10**: Run directory collisions are handled gracefully.
  - *Proof required*: Test showing `-2`, `-3` suffixes.
- [ ] **AC-WP14-11**: React error boundary prevents white-screen crashes.
  - *Proof required*: Test showing error boundary catches and renders fallback.
- [ ] **AC-WP14-12**: `npm run build` succeeds with ZERO errors.
  - *Proof required*: Command output.
- [ ] **AC-WP14-13**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP14-14**: No regressions from WP0–WP13.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

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

**Prerequisites**: WP14 complete AND verified.

### Tasks (ALL MANDATORY)

1. **Run ALL Rust tests**
   ```bash
   cd src-tauri && cargo test
   ```
   - Verify ALL tests pass.
   - Count total tests. Report number.
   - If ANY test fails, fix and re-run until 100% pass.

2. **Run ALL frontend tests**
   ```bash
   npm test
   ```
   - Verify ALL tests pass.
   - Count total tests. Report number.
   - If ANY test fails, fix and re-run until 100% pass.

3. **Execute manual test plan** (from Doc 2, Section 12)
   - **Test 1**: Create project, set API key, run 3-step workflow → verify completion.
   - **Test 2**: Edit step 2 output → save → re-run from step 3 → verify edited content used.
   - **Test 3**: Delete API key → run → verify error.
   - **Test 4**: Close app mid-run → reopen → re-run from last completed step.
   - **Test 5**: Test with invalid model name → verify error on step card.
   - **Test 6**: Test with missing prompt file → verify validation error before run starts.
   - **Test 7**: Test with missing variable file → verify error during run.
   - Document results for each test.

4. **Cross-platform verification**
   - Test on macOS, Windows, and Linux if possible.
   - Verify keyring works on all platforms.
   - Verify file paths work on all platforms (use `PathBuf`, not string concatenation).
   - Document platform results.

5. **Performance check**
   - Run a 10-step workflow.
   - Verify UI remains responsive during execution.
   - Run 5 workflows in sequence.
   - Check memory usage doesn't grow unbounded.
   - Document performance results.

6. **Fix any issues found**
   - Document every bug found.
   - Fix and re-test.
   - Re-run full test suite after each fix.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP15-01**: ALL automated Rust tests pass (100% pass rate).
  - *Proof required*: `cargo test` output showing `test result: ok` with zero failures.
- [ ] **AC-WP15-02**: ALL automated frontend tests pass (100% pass rate).
  - *Proof required*: `npm test` output showing all tests pass.
- [ ] **AC-WP15-03**: Manual Test 1 passes (create, set key, run 3-step workflow).
  - *Proof required*: Documented result.
- [ ] **AC-WP15-04**: Manual Test 2 passes (edit output, re-run, verify context).
  - *Proof required*: Documented result.
- [ ] **AC-WP15-05**: Manual Test 3 passes (missing API key error).
  - *Proof required*: Documented result.
- [ ] **AC-WP15-06**: Manual Test 4 passes (close mid-run, re-run from last completed).
  - *Proof required*: Documented result.
- [ ] **AC-WP15-07**: Manual Test 5 passes (invalid model name error).
  - *Proof required*: Documented result.
- [ ] **AC-WP15-08**: Manual Test 6 passes (missing prompt file validation).
  - *Proof required*: Documented result.
- [ ] **AC-WP15-09**: Manual Test 7 passes (missing variable file error).
  - *Proof required*: Documented result.
- [ ] **AC-WP15-10**: UI remains responsive during 10-step workflow.
  - *Proof required*: Documented observation.
- [ ] **AC-WP15-11**: No memory leaks observed after 5 sequential workflows.
  - *Proof required*: Documented memory usage.
- [ ] **AC-WP15-12**: No known critical or high-severity bugs.
  - *Proof required*: Explicit statement with bug list (should be empty).
- [ ] **AC-WP15-13**: `cargo check` passes with ZERO errors and ZERO warnings.
  - *Proof required*: Command output.
- [ ] **AC-WP15-14**: `npm run build` succeeds with ZERO errors.
  - *Proof required*: Command output.
- [ ] **AC-WP15-15**: No regressions from WP0–WP14.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

### Files Created/Modified
- Bug fixes across the codebase as needed.
- Test documentation.

---

## WP16 — Build & Package

**Objective**: Produce distributable binaries for macOS, Windows, and Linux.

**Prerequisites**: WP15 complete AND verified.

### Tasks (ALL MANDATORY)

1. **Update `tauri.conf.json` for production**
   - Verify `productName` is `Plotline`.
   - Verify `version` is `1.0.0`.
   - Set `bundle.active: true`.
   - Configure bundle targets:
     - macOS: `dmg`, `app`
     - Windows: `msi`, `nsis`
     - Linux: `appimage`, `deb`
   - Verify JSON validity.

2. **Add application icon**
   - Create or obtain a Plotline icon (1024×1024 PNG).
   - Use `tauri icon` command to generate all required sizes.
   - Verify icons appear in `src-tauri/icons/`.

3. **Build for current platform**
   ```bash
   npm run tauri build
   ```
   - Verify build succeeds with ZERO errors.
   - Locate output binaries in `src-tauri/target/release/bundle/`.
   - Document all generated files.

4. **Test the production build**
   - Install/run the built binary.
   - Verify ALL features work in production mode (not just dev mode).
   - Verify API key storage works in production.
   - Verify file operations work in production.
   - Document any production-only issues.

5. **Create a sample project for testing**
   - Create `examples/sample-project/` with:
     - `workflows/write_chapter.yaml`
     - `prompts/outline.md`
     - `prompts/draft.md`
     - `prompts/critique.md`
     - `prompts/rewrite.md`
     - `variables/style.md`
     - `variables/protagonist.md`
   - Verify sample project works with the app.

6. **Write README.md**
   - Project overview.
   - Development setup instructions.
   - Build instructions.
   - Usage guide (how to create a project, workflow, run it).
   - Sample workflow YAML.
   - Link to OpenRouter for API key.
   - Verify README is comprehensive and accurate.

7. **Tag the release**
   ```bash
   git tag -a v1.0.0 -m "Plotline MVP"
   git push origin v1.0.0
   ```
   - Verify tag exists.

### Acceptance Criteria (Verify EACH ONE Individually)

- [ ] **AC-WP16-01**: `npm run tauri build` succeeds on the target platform with ZERO errors.
  - *Proof required*: Build output showing success.
- [ ] **AC-WP16-02**: Production binary launches without errors.
  - *Proof required*: Explicit statement that binary runs.
- [ ] **AC-WP16-03**: ALL features work in production mode.
  - *Proof required*: Checklist of features tested in production.
- [ ] **AC-WP16-04**: API key storage works in production build.
  - *Proof required*: Test showing key persists in production.
- [ ] **AC-WP16-05**: File operations work in production build.
  - *Proof required*: Test showing workflow runs complete in production.
- [ ] **AC-WP16-06**: Application icon is displayed in the OS taskbar/dock.
  - *Proof required*: Visual confirmation.
- [ ] **AC-WP16-07**: Sample project is included and works with the app.
  - *Proof required*: Test running sample workflow.
- [ ] **AC-WP16-08**: README is comprehensive and accurate.
  - *Proof required*: Review of README sections.
- [ ] **AC-WP16-09**: Git tag `v1.0.0` is created.
  - *Proof required*: `git tag` output showing tag.
- [ ] **AC-WP16-10**: No regressions from WP0–WP15.
  - *Proof required*: `cargo test` (full suite) and `npm test` (full suite) pass.

### Files Created/Modified
- `tauri.conf.json` (bundle configuration)
- `src-tauri/icons/*` (generated icons)
- `examples/sample-project/*` (sample project)
- `README.md`

---

## Dependency Graph (Revised — Sequential Only)

```
WP0 (Scaffolding)
  │
  └── WP1 (Types & Errors)
        │
        ├── WP2 (Workflow Parser)
        │     │
        │     └── WP4 (Run Manager)
        │
        ├── WP3 (Variable Substitution)
        │
        └── WP5 (OpenRouter Client)
              │
              └── WP6 (Execution Engine)
                    │
                    └── WP7 (IPC Commands)
                          │
                          └── WP8 (Frontend Foundation)
                                │
                                ├── WP9 (Settings UI)
                                │
                                ├── WP10 (Workflow Selector)
                                │     │
                                │     └── WP11 (Run Monitor)
                                │           │
                                │           └── WP12 (Output Editor)
                                │                 │
                                │                 └── WP13 (Re-run Integration)
                                │                       │
                                │                       └── WP14 (Error Polish)
                                │                             │
                                │                             └── WP15 (Testing & QA)
                                │                                   │
                                │                                   └── WP16 (Build & Package)
```

**NO PARALLEL EXECUTION. Every Work Package depends on ALL previous Work Packages being 100% complete.**

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

## Appendix A — Mandatory Verification Report Format

For EVERY Work Package completed, the coding agent MUST produce a report in this EXACT format. Deviations are NOT permitted.

```
================================================================================
VERIFICATION REPORT: WP{N} — {Work Package Name}
================================================================================

1. SUMMARY OF CHANGES
--------------------------------------------------------------------------------
{List every file created or modified, with a one-line description of what changed.}

2. PROOF OF TEST EXECUTION
--------------------------------------------------------------------------------
### Rust Test Suite (FULL — not filtered)
```
{Paste the COMPLETE output of `cargo test` showing:
  - Total test count
  - Pass count
  - Fail count (must be 0)
  - Any warnings (must be 0)
}
```

### Frontend Test Suite (FULL)
```
{Paste the COMPLETE output of `npm test` showing:
  - Total test count
  - Pass count
  - Fail count (must be 0)
  - Any warnings (must be 0)
}
```

3. PROOF OF BUILD SUCCESS
--------------------------------------------------------------------------------
### cargo check
```
{Paste output showing `Finished dev` with ZERO errors and ZERO warnings}
```

### npm run build
```
{Paste output showing successful build with ZERO errors}
```

### npx tsc --noEmit (if applicable)
```
{Paste output showing zero errors}
```

4. ACCEPTANCE CRITERIA CHECKLIST
--------------------------------------------------------------------------------
{Copy EVERY acceptance criterion from the Work Package and mark each as PASS or FAIL.}

Example:
- [x] **AC-WP0-01**: `npm run tauri dev` launches a desktop window titled "Plotline".
  - Proof: Verified visually. Window title is "Plotline".
- [x] **AC-WP0-02**: The launched window displays "Plotline" as a centered `<h1>` heading.
  - Proof: Verified visually. Heading text is "Plotline".
- [x] **AC-WP0-03**: `cargo check` passes with ZERO errors and ZERO warnings.
  - Proof: See section 3, cargo check output.
... etc for EVERY criterion.

5. REGRESSION CHECK
--------------------------------------------------------------------------------
- [x] All Rust tests from previous Work Packages pass: {Yes/No}
- [x] All frontend tests from previous Work Packages pass: {Yes/No}
- [x] `cargo check` passes with zero errors/warnings: {Yes/No}
- [x] `npm run build` passes with zero errors: {Yes/No}

6. SIGN-OFF
--------------------------------------------------------------------------------
I certify that:
  a) Every task in WP{N} is implemented exactly as specified.
  b) Every acceptance criterion is individually verified and proven to pass.
  c) 100% test coverage exists for all new code in this Work Package.
  d) The ENTIRE test suite passes with ZERO failures.
  e) ALL builds complete with ZERO errors and ZERO warnings.
  f) NO regressions were introduced.

Signed: {Coding Agent Name}
Date: {Date}

================================================================================
END OF VERIFICATION REPORT: WP{N}
================================================================================
```

**The agent MUST NOT ask to proceed to the next Work Package until this report is complete and presented in full.**
