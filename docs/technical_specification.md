# Technical Specification

## 1. Implementation Scope

**Project Name**: Plotline
**Version**: 1.0.0 (MVP)
**Stack**: Tauri 2.0 (Rust backend) + React 18 / TypeScript (Frontend) + Vite

**In Scope**:
- Tauri desktop application shell with React frontend
- YAML workflow parsing and validation
- Sequential execution engine with automatic context concatenation
- Variable substitution from local files
- OpenRouter HTTP integration (non-streaming)
- Filesystem-based run management with workflow snapshots
- GUI for workflow selection, run monitoring, and output editing
- OS keyring API key storage

**Out of Scope**: Streaming, parallel execution, branching, multiple providers, prompt versioning, cost tracking, auto-retries, visual DAG editor.

---

## 2. Project Structure

```text
plotline/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs              # Tauri entry point, command registration
│   │   ├── lib.rs               # Module declarations
│   │   ├── commands.rs          # Tauri IPC command handlers
│   │   ├── workflow.rs          # Workflow YAML parsing & validation
│   │   ├── engine.rs            # Execution loop
│   │   ├── substitution.rs      # Variable substitution logic
│   │   ├── openrouter.rs        # HTTP client for OpenRouter API
│   │   ├── run_manager.rs       # Run directory creation & file I/O
│   │   ├── config.rs            # App config, API key management
│   │   └── error.rs             # Unified error types
│   └── capabilities/
│       └── default.json
├── src/
│   ├── main.tsx                 # React entry point
│   ├── App.tsx                  # Root component, routing
│   ├── components/
│   │   ├── WorkflowSelector.tsx
│   │   ├── RunMonitor.tsx
│   │   ├── StepCard.tsx
│   │   ├── OutputEditor.tsx
│   │   └── SettingsModal.tsx
│   ├── hooks/
│   │   ├── useTauriEvent.ts
│   │   └── useRunState.ts
│   ├── types/
│   │   └── index.ts
│   ├── api/
│   │   └── tauri.ts             # Typed wrappers around invoke()
│   └── styles/
│       └── global.css
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 3. Dependencies

### Rust (`Cargo.toml`)

| Crate | Version | Purpose |
|---|---|---|
| `tauri` | 2.0 | Application framework |
| `serde` | 1.0 | Serialization/deserialization |
| `serde_yaml` | 0.9 | YAML parsing for workflow files |
| `reqwest` | 0.12 | HTTP client for OpenRouter |
| `tokio` | 1.0 | Async runtime |
| `tauri-plugin-store` | 2.0 | Lightweight settings persistence |
| `keyring` | 3.0 | OS keyring access for API key |
| `regex` | 1.0 | Variable substitution pattern matching |
| `thiserror` | 2.0 | Ergonomic error types |
| `chrono` | 0.4 | Timestamp generation for run dirs |

### Frontend (`package.json`)

| Package | Version | Purpose |
|---|---|---|
| `react` | ^18.3 | UI framework |
| `react-dom` | ^18.3 | DOM rendering |
| `@tauri-apps/api` | ^2.0 | Tauri IPC bridge |
| `@tauri-apps/plugin-store` | ^2.0 | Settings persistence (frontend side) |
| `@uiw/react-codemirror` | ^4.23 | Markdown editor component |
| `@uiw/codemirror-extensions-langs` | ^4.23 | Markdown language support |
| `react-markdown` | ^9.0 | Markdown rendering (read-only view) |
| `typescript` | ^5.5 | Type safety |
| `vite` | ^5.4 | Build tooling |
| `@vitejs/plugin-react` | ^4.3 | React fast refresh |

`[COMPLEXITY JUSTIFICATION]`: CodeMirror is chosen over simpler textarea-based editors because the MVP requires in-GUI editing of Markdown outputs. CodeMirror provides syntax highlighting, line numbers, and standard editing keybindings out of the box. It is the minimal viable editor that doesn't feel broken.

---

## 4. Configuration

### `tauri.conf.json` (Key Fields)

```json
{
  "productName": "Plotline",
  "version": "1.0.0",
  "identifier": "com.plotline.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Plotline",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": "default-src 'self'; connect-src 'self' https://openrouter.ai; style-src 'self' 'unsafe-inline'"
    }
  },
  "plugins": {
    "store": {}
  }
}
```

`[PROPOSED DESIGN DECISION]`: CSP restricts `connect-src` to `self` and `https://openrouter.ai`. All HTTP calls go through the Rust backend, but the CSP is defense-in-depth in case any frontend code attempts direct calls.

### Tauri Capabilities (`capabilities/default.json`)

```json
{
  "identifier": "default",
  "description": "Default capabilities for Plotline",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:event:allow-listen",
    "core:event:allow-emit",
    "store:default"
  ]
}
```

### App Settings (via `tauri-plugin-store`)

Stored at platform-specific config path as `settings.json`:

```json
{
  "project_root": "/Users/user/my-writing-project",
  "openrouter_model_defaults": {}
}
```

`[ASSUMPTION]`: The API key is NOT stored in settings.json. It is stored in the OS keyring under the service name `plotline` and account name `openrouter`.

---

## 5. Data Layer

### Rust Types

```rust
// workflow.rs

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub name: String,
    pub steps: Vec<Step>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Step {
    pub name: String,
    pub prompt_file: String,      // Relative path from project root
    pub model: String,            // OpenRouter model identifier
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedStep {
    pub index: usize,
    pub name: String,
    pub prompt_file: PathBuf,     // Absolute path
    pub model: String,
    pub prompt_content: String,   // Loaded + substituted prompt text
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunInfo {
    pub run_dir: PathBuf,
    pub workflow_name: String,
    pub started_at: String,       // ISO 8601
    pub steps: Vec<RunStepStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StepStatus {
    Pending,
    Running,
    Completed,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunStepStatus {
    pub index: usize,
    pub name: String,
    pub status: StepStatus,
    pub output_path: Option<PathBuf>,
}
```

### Frontend Types (`src/types/index.ts`)

```typescript
export interface Workflow {
  name: string;
  steps: Step[];
}

export interface Step {
  name: string;
  prompt_file: string;
  model: string;
}

export interface RunStepStatus {
  index: number;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  output_path: string | null;
}

export interface RunInfo {
  run_dir: string;
  workflow_name: string;
  started_at: string;
  steps: RunStepStatus[];
}

export interface RunEventPayload {
  runDir: string;
  stepIndex?: number;
  stepName?: string;
  outputPath?: string;
  error?: string;
}
```

### Filesystem Schema

**Workflow YAML** (`workflows/<name>.yaml`):
```yaml
name: <string, required>
steps:
  - name: <string, required, unique within workflow>
    prompt_file: <string, required, relative path>
    model: <string, required, OpenRouter model ID>
```

**Prompt files** (`prompts/<name>.md`):
- Plain Markdown files.
- May contain `{{variables.<name>}}` placeholders.
- Must NOT contain references to previous step outputs — the engine appends those automatically.

**Variable files** (`variables/<name>.md`):
- Plain text or Markdown files.
- Referenced by filename without extension: `{{variables.style}}` → `variables/style.md`.

**Run directory** (`runs/<timestamp>-<workflow-slug>/`):
```
_workflow.yaml              # Exact copy of workflow YAML at run time
_prompts/                   # Copies of all referenced prompt files
    <name>.md
step_01_<name>.md           # Output of step 1 (zero-padded index)
step_02_<name>.md           # Output of step 2
...
```

`[PROPOSED DESIGN DECISION]`: Step output filenames use zero-padded indices (`step_01`, `step_02`) to ensure correct lexicographic sorting in file browsers and diff tools.

---

## 6. API Specification

### OpenRouter API Integration

**Endpoint**: `POST https://openrouter.ai/api/v1/chat/completions`

**Request Headers**:
```
Authorization: Bearer <API_KEY>
Content-Type: application/json
HTTP-Referer: https://plotline.app    # OpenRouter requirement for app identification
X-Title: Plotline                      # OpenRouter requirement for app identification
```

**Request Body**:
```json
{
  "model": "<model_id_from_workflow>",
  "messages": [
    {
      "role": "user",
      "content": "<full_prompt_text_with_variables_substituted_and_previous_output_appended>"
    }
  ],
  "stream": false
}
```

**Response Body** (success):
```json
{
  "id": "gen-...",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "<generated_text>"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 1234,
    "completion_tokens": 567,
    "total_tokens": 1801
  }
}
```

**Error Handling**:
- HTTP 401 → Return `PlotlineError::ApiKeyInvalid`
- HTTP 429 → Return `PlotlineError::RateLimited`
- HTTP 5xx → Return `PlotlineError::ProviderError(status, body)`
- Network timeout (30s) → Return `PlotlineError::NetworkTimeout`
- Malformed JSON → Return `PlotlineError::ResponseParseError`

`[ASSUMPTION]`: 30-second timeout is sufficient for non-streaming requests. OpenRouter supports long-running requests, but 30s is a reasonable default. If models take longer, the user will see an error and can retry.

---

## 7. AuthN/AuthZ

### API Key Management

**Storage**: OS keyring via `keyring` crate.
- Service name: `plotline`
- Account name: `openrouter`

**Flow**:
1. On first launch, frontend checks if API key exists via `invoke('has_api_key')`.
2. If not, Settings modal prompts user to paste key.
3. Frontend calls `invoke('set_api_key', { key })`.
4. Rust backend stores in keyring.
5. On every workflow run, engine retrieves key from keyring.
6. If key is missing or invalid, `run_error` event is emitted with descriptive message.

**No user authentication**: This is a local single-user desktop application. There is no login, no multi-tenancy, no session management.

---

## 8. Module Specifications

### `workflow.rs` — Workflow Parser

**Responsibility**: Parse and validate workflow YAML files.

**Interface**:
```rust
/// Parses a workflow YAML file from the given path.
/// Validates that all required fields are present.
/// Resolves prompt_file paths to absolute paths relative to project root.
/// Returns error if: file not found, YAML invalid, steps empty, 
/// step names not unique, or prompt_file paths don't exist.
pub fn parse_workflow(workflow_path: &Path, project_root: &Path) 
    -> Result<Workflow, PlotlineError>;

/// Validates that prompt files referenced in the workflow exist on disk.
pub fn validate_workflow(workflow: &Workflow, project_root: &Path) 
    -> Result<(), PlotlineError>;
```

**Validation Rules**:
- `name` must be non-empty string.
- `steps` must be non-empty array.
- Each step `name` must be unique within the workflow.
- Each step `name` must be slug-safe (alphanumeric + hyphens/underscores).
- Each `prompt_file` must resolve to an existing file within the project root.
- Each `model` must be a non-empty string.

### `substitution.rs` — Variable Substitutor

**Responsibility**: Replace `{{variables.<name>}}` placeholders in prompt text with file contents.

**Interface**:
```rust
/// Scans prompt_content for {{variables.<name>}} patterns.
/// For each match, reads <project_root>/variables/<name>.md.
/// Replaces the placeholder with the file contents.
/// Returns error if a referenced variable file does not exist.
/// Leaves unknown {{...}} patterns untouched (does not error).
pub fn substitute_variables(
    prompt_content: &str, 
    project_root: &Path
) -> Result<String, PlotlineError>;
```

**Regex Pattern**: `\{\{variables\.([a-zA-Z0-9_-]+)\}\}`

**Pseudocode**:
```
fn substitute_variables(content, project_root):
    pattern = regex(r"\{\{variables\.([a-zA-Z0-9_-]+)\}\}")
    result = pattern.replace_all(content, |captures| {
        var_name = captures[1]
        var_path = project_root / "variables" / f"{var_name}.md"
        if var_path.exists():
            return read_file(var_path)
        else:
            return error(f"Variable file not found: {var_path}")
    })
    return result
```

### `engine.rs` — Execution Engine

**Responsibility**: Execute workflow steps sequentially, managing context flow and emitting events.

**Interface**:
```rust
/// Executes a workflow from the beginning.
/// Creates run directory, snapshots workflow, runs all steps.
/// Emits Tauri events for state changes.
pub async fn run_workflow(
    app_handle: &AppHandle,
    workflow_path: &Path,
    project_root: &Path,
) -> Result<(), PlotlineError>;

/// Re-executes a workflow starting from a specific step index.
/// Uses existing run directory and prior step outputs.
/// Overwrites output files from the starting step onward.
pub async fn rerun_from_step(
    app_handle: &AppHandle,
    run_dir: &Path,
    step_index: usize,
) -> Result<(), PlotlineError>;
```

**Execution Loop Pseudocode**:
```
fn run_workflow(app, workflow_path, project_root):
    workflow = parse_workflow(workflow_path, project_root)
    run_dir = create_run_directory(project_root, workflow.name)
    snapshot_workflow(run_dir, workflow_path, workflow)
  
    emit("run_started", { run_dir })
  
    previous_output = None
  
    for (index, step) in workflow.steps.enumerate():
        emit("step_started", { index, step.name })
      
        # Load prompt from snapshot
        prompt_content = read_file(run_dir / "_prompts" / step.prompt_file)
      
        # Substitute variables
        prompt_content = substitute_variables(prompt_content, project_root)
      
        # Append previous output if exists
        if previous_output is Some:
            prompt_content = prompt_content 
                + "\n\n---\n\nPrevious Step Output:\n\n" 
                + previous_output
      
        # Call OpenRouter
        api_key = get_api_key()
        response = openrouter::complete(
            model=step.model,
            prompt=prompt_content,
            api_key=api_key
        )
      
        # Write output
        output_path = run_dir / f"step_{pad(index+1, 2)}_{step.name}.md"
        write_file(output_path, response.content)
      
        emit("step_completed", { index, output_path })
      
        previous_output = Some(response.content)
  
    emit("run_completed", { run_dir })
```

**Re-run Pseudocode**:
```
fn rerun_from_step(app, run_dir, step_index):
    workflow = parse_workflow(run_dir / "_workflow.yaml", run_dir)
  
    emit("run_started", { run_dir })
  
    # Load previous output from the step before step_index
    if step_index > 0:
        prev_step = workflow.steps[step_index - 1]
        prev_output_path = run_dir / f"step_{pad(step_index, 2)}_{prev_step.name}.md"
        previous_output = read_file(prev_output_path)
    else:
        previous_output = None
  
    for (index, step) in workflow.steps.enumerate().skip(step_index):
        emit("step_started", { index, step.name })
      
        # Same as run_workflow: load, substitute, append, call, write
        ...
      
        # Delete any existing output files for this step and later steps
        # (they are being overwritten)
      
        previous_output = Some(response.content)
  
    emit("run_completed", { run_dir })
```

`[COMPLEXITY JUSTIFICATION]`: The re-run logic reuses the same loop body but starts from a different index and reads the prior output from disk instead of memory. This is simpler than maintaining a shared execution context object.

### `openrouter.rs` — OpenRouter Client

**Responsibility**: Send HTTP requests to OpenRouter and parse responses.

**Interface**:
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

/// Sends a non-streaming completion request to OpenRouter.
/// Timeout: 30 seconds.
/// Returns error on HTTP errors, network issues, or malformed responses.
pub async fn complete(request: CompletionRequest) 
    -> Result<CompletionResponse, PlotlineError>;
```

**Implementation Notes**:
- Uses `reqwest::Client` with a 30-second timeout.
- Sets `HTTP-Referer` and `X-Title` headers as required by OpenRouter.
- Extracts `choices[0].message.content` from the JSON response.
- Token usage is parsed but discarded for MVP (no cost tracking). `[ASSUMPTION]` — parsing it now makes future cost tracking trivial to add.

### `run_manager.rs` — Run Manager

**Responsibility**: Create run directories, snapshot files, read/write step outputs.

**Interface**:
```rust
/// Creates a timestamped run directory under <project_root>/runs/.
/// Format: YYYY-MM-DD-HHMM-<workflow_slug>
/// Returns the absolute path to the run directory.
pub fn create_run_directory(
    project_root: &Path, 
    workflow_name: &str
) -> Result<PathBuf, PlotlineError>;

/// Copies the workflow YAML and all referenced prompt files 
/// into the run directory under _workflow.yaml and _prompts/.
pub fn snapshot_workflow(
    run_dir: &Path,
    workflow_path: &Path,
    workflow: &Workflow,
    project_root: &Path,
) -> Result<(), PlotlineError>;

/// Generates the output filename for a step.
/// Format: step_01_<name>.md (zero-padded to 2 digits)
pub fn step_output_path(
    run_dir: &Path, 
    step_index: usize, 
    step_name: &str
) -> PathBuf;

/// Reads the output of a specific step from a run directory.
/// Returns None if the file does not exist (step not yet completed).
pub fn read_step_output(
    run_dir: &Path, 
    step_index: usize, 
    step_name: &str
) -> Option<String>;

/// Writes output content to a step's output file.
pub fn write_step_output(
    run_dir: &Path, 
    step_index: usize, 
    step_name: &str, 
    content: &str
) -> Result<(), PlotlineError>;

/// Infers run status by checking which output files exist.
pub fn infer_run_status(
    run_dir: &Path,
    workflow: &Workflow,
) -> RunInfo;
```

**Slug Generation**: Workflow name is converted to a slug by:
1. Lowercasing.
2. Replacing spaces with hyphens.
3. Removing non-alphanumeric characters (except hyphens).
4. Truncating to 50 characters.

### `commands.rs` — Tauri IPC Commands

**Responsibility**: Bridge between frontend and backend. All commands are async.

```rust
#[tauri::command]
pub async fn run_workflow(
    workflow_path: String,
    project_root: String,
    app_handle: AppHandle,
) -> Result<String, String>;  // Returns run_dir path

#[tauri::command]
pub async fn rerun_from_step(
    run_dir: String,
    step_index: usize,
    app_handle: AppHandle,
) -> Result<(), String>;

#[tauri::command]
pub async fn save_output(
    run_dir: String,
    step_index: usize,
    step_name: String,
    content: String,
) -> Result<(), String>;

#[tauri::command]
pub async fn get_run_status(
    run_dir: String,
) -> Result<RunInfo, String>;

#[tauri::command]
pub async fn list_workflows(
    project_root: String,
) -> Result<Vec<WorkflowSummary>, String>;

#[tauri::command]
pub async fn list_runs(
    project_root: String,
) -> Result<Vec<RunSummary>, String>;

#[tauri::command]
pub async fn read_file_content(
    file_path: String,
) -> Result<String, String>;

#[tauri::command]
pub async fn set_api_key(key: String) -> Result<(), String>;

#[tauri::command]
pub async fn get_api_key() -> Result<Option<String>, String>;

#[tauri::command]
pub async fn has_api_key() -> Result<bool, String>;

#[tauri::command]
pub async fn set_project_root(path: String) -> Result<(), String>;

#[tauri::command]
pub async fn get_project_root() -> Result<Option<String>, String>;
```

`[PROPOSED DESIGN DECISION]`: All commands return `Result<T, String>` where the error is a user-friendly string. The Rust `PlotlineError` enum implements `Display` to convert to string. This avoids the need for frontend error-type mapping.

### `error.rs` — Error Types

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PlotlineError {
    #[error("Workflow file not found: {0}")]
    WorkflowNotFound(String),

    #[error("Invalid workflow YAML: {0}")]
    WorkflowParseError(String),

    #[error("Workflow validation failed: {0}")]
    WorkflowValidationError(String),

    #[error("Prompt file not found: {path}")]
    PromptFileNotFound { path: String },

    #[error("Variable file not found: {path}")]
    VariableFileNotFound { path: String },

    #[error("API key not set. Please set your OpenRouter API key in Settings.")]
    ApiKeyNotSet,

    #[error("API key is invalid. Please check your OpenRouter API key.")]
    ApiKeyInvalid,

    #[error("OpenRouter rate limit exceeded. Please wait and try again.")]
    RateLimited,

    #[error("OpenRouter request timed out after 30 seconds.")]
    NetworkTimeout,

    #[error("OpenRouter returned an error (HTTP {status}): {body}")]
    ProviderError { status: u16, body: String },

    #[error("Failed to parse OpenRouter response: {0}")]
    ResponseParseError(String),

    #[error("Filesystem error: {0}")]
    FilesystemError(String),

    #[error("Keyring error: {0}")]
    KeyringError(String),

    #[error("Run directory not found: {0}")]
    RunNotFound(String),

    #[error("Invalid step index: {index} (workflow has {total} steps)")]
    InvalidStepIndex { index: usize, total: usize },
}
```

---

## 9. Background Jobs

**No background job system for MVP.** 

Workflow execution runs as a Tauri async command. The command holds a reference to the `AppHandle` and emits events as it progresses. The frontend listens to these events to update the UI.

`[COMPLEXITY JUSTIFICATION]`: A proper background job queue (e.g., a tokio task pool with job persistence) would add complexity without MVP value. Only one workflow can run at a time. If the user closes the app mid-run, the run is interrupted and can be resumed via "re-run from step" using the filesystem state.

**Concurrency Constraint**: `[PROPOSED DESIGN DECISION]` The frontend must disable the "Run" button while a workflow is executing. The backend does not need a mutex because Tauri commands are queued, but the UI should prevent the user from starting a second run.

---

## 10. Observability

### Logging
- Rust backend uses `env_logger` with log level configurable via environment variable (`RUST_LOG=debug`).
- Logs are written to stderr (visible in terminal during dev, suppressed in production).
- Log format: `[timestamp] [level] [module] message`

**Key Log Points**:
- Workflow parsed: `INFO`
- Run directory created: `INFO`
- Step started: `INFO`
- OpenRouter request sent (model, prompt length): `DEBUG`
- OpenRouter response received (status, tokens): `DEBUG`
- Step output written: `INFO`
- Step failed: `ERROR`
- Run completed: `INFO`

### Frontend Observability
- No telemetry or analytics for MVP.
- Errors are displayed in the UI as toast notifications.
- The Run Monitor shows step status and error messages inline.

`[ASSUMPTION]`: No centralized error reporting or crash analytics for MVP. Desktop apps can rely on user-reported issues for V1.

---

## 11. Error Handling

### Backend Error Flow
1. Any `PlotlineError` in the execution loop immediately halts the run.
2. The engine emits a `run_error` event with the step index and error message.
3. The IPC command returns `Err(error_string)`.
4. Partial outputs (steps completed before the error) remain on disk.
5. The user can fix the issue (e.g., set API key) and re-run from the failed step.

### Frontend Error Display
- IPC errors are caught in the `api/tauri.ts` wrappers and thrown as typed `PlotlineFrontendError`.
- The `RunMonitor` component listens for `run_error` events and displays the error inline on the failed step card.
- Settings errors (API key save failure) are shown as toast notifications.

### Error Recovery
| Error | Recovery Action |
|---|---|
| `ApiKeyNotSet` | Open Settings modal, prompt for key |
| `ApiKeyInvalid` | Open Settings modal, show error, prompt for new key |
| `RateLimited` | Display message, user waits and clicks "Retry from Step" |
| `NetworkTimeout` | Display message, user clicks "Retry from Step" |
| `ProviderError` | Display HTTP status and body, user investigates |
| `PromptFileNotFound` | Display path, user creates or fixes workflow YAML |
| `VariableFileNotFound` | Display path, user creates variable file |

---

## 12. Testing Strategy

### Rust Backend Tests

| Module | Test Type | Coverage |
|---|---|---|
| `workflow.rs` | Unit | Parse valid YAML, reject invalid YAML, validate unique step names, validate prompt file existence |
| `substitution.rs` | Unit | Single variable substitution, multiple variables, nested paths, missing variable file error, no variables present (passthrough) |
| `run_manager.rs` | Unit | Run directory naming, slug generation, step output path formatting, snapshot creation |
| `openrouter.rs` | Integration | Mock HTTP server (wiremock) returning valid response, 401, 429, 500, timeout |
| `engine.rs` | Integration | Full workflow run with mocked OpenRouter, re-run from step, error halts run |

**Test fixtures**:
```text
src-tauri/tests/fixtures/
├── project/
│   ├── workflows/
│   │   └── test_workflow.yaml
│   ├── prompts/
│   │   ├── step1.md
│   │   └── step2.md
│   └── variables/
│       └── context.md
```

### Frontend Tests

| Component | Test Type | Coverage |
|---|---|---|
| `WorkflowSelector` | Unit (vitest) | Renders workflow list, calls run callback |
| `RunMonitor` | Unit (vitest) | Renders step statuses, displays error state |
| `OutputEditor` | Unit (vitest) | Loads content, saves on edit, switches read/write modes |
| `useTauriEvent` | Unit (vitest) | Subscribes to event, unsubscribes on unmount |
| `api/tauri.ts` | Unit (vitest) | Wraps invoke calls, handles errors |

`[ASSUMPTION]`: Frontend tests mock `@tauri-apps/api` invoke and event functions. No end-to-end tests for MVP.

### Manual Test Plan
1. Create a project with 3-step workflow, 2 prompt files, 1 variable file.
2. Set API key in Settings.
3. Run workflow → verify all 3 steps complete, outputs appear in UI.
4. Edit step 2 output in UI → verify file saved to disk.
5. Re-run from step 3 → verify step 3 uses edited step 2 output.
6. Delete API key → run workflow → verify error displayed.
7. Close app mid-run → reopen → re-run from failed step.

---

## 13. Build/Run/Deploy

### Development

```bash
# Install dependencies
npm install

# Run in development mode (starts Vite + Tauri)
npm run tauri dev

# Run Rust tests
cd src-tauri && cargo test

# Run frontend tests
npm test
```

### Production Build

```bash
# Build for current platform
npm run tauri build

# Output locations:
# macOS:   src-tauri/target/release/bundle/dmg/Plotline_1.0.0_aarch64.dmg
# Windows: src-tauri/target/release/bundle/msi/Plotline_1.0.0_x64-setup.exe
# Linux:   src-tauri/target/release/bundle/appimage/Plotline_1.0.0_amd64.AppImage
```

### Vite Configuration (`vite.config.ts`)

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
});
```

### TypeScript Configuration (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "useDefineForClassFields": true,
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

---

## 14. Acceptance Criteria

| ID | Criterion | Verification |
|---|---|---|
| AC1 | User can select a project directory containing `workflows/`, `prompts/`, and `variables/` | `list_workflows` returns available workflows |
| AC2 | User can select a workflow and start a run | `run_workflow` creates run directory, emits `run_started` |
| AC3 | Each step executes sequentially, passing output to next step | Step N+1 prompt contains Step N output appended |
| AC4 | Variable placeholders are replaced with file contents | `{{variables.style}}` in prompt is replaced with `variables/style.md` content |
| AC5 | Step outputs are displayed in the GUI as they complete | `step_completed` event updates UI in real-time |
| AC6 | User can edit any completed step's output in the GUI | CodeMirror editor loads, edits save to disk via `save_output` |
| AC7 | User can re-run from a specific step | `rerun_from_step` overwrites outputs from that step onward, uses edited prior output |
| AC8 | Run directory contains `_workflow.yaml`, `_prompts/`, and step output files | Filesystem inspection confirms snapshot and outputs |
| AC9 | API key is stored in OS keyring, not in plaintext | `keyring` crate retrieves key; no key in settings.json |
| AC10 | If a step fails, error is displayed and partial outputs are preserved | `run_error` event fires; completed step files remain on disk |
| AC11 | If app is closed mid-run, user can reopen and re-run from last completed step | Filesystem state inference identifies completed steps |
| AC12 | Application builds for macOS, Windows, and Linux | `npm run tauri build` produces platform-specific installers |

---

## 15. Final Consistency Checklist

| Check | Status |
|---|---|
| Doc 1 architecture matches Doc 2 implementation scope | ✅ |
| All confirmed answers from interview are reflected | ✅ |
| All assumptions are explicitly marked | ✅ |
| No placeholders (TBD, TODO, etc.) | ✅ |
| No invented third-party services | ✅ |
| Error handling covers all identified failure modes | ✅ |
| Data model is internally consistent (Rust types ↔ TS types ↔ filesystem schema) | ✅ |
| IPC commands cover all frontend use cases | ✅ |
| OpenRouter API spec matches their documented format | ✅ |
| Non-goals from brief are respected (no chat, no RAG, no branching) | ✅ |
| Tauri 2.0 APIs used correctly (commands, events, plugins) | ✅ |
| Frontend uses `frontend-patterns` skill (noted in instructions) | ✅ |
| Project name "Plotline" used throughout | ✅ |

---
