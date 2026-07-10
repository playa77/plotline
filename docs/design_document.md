# Design Document

## 1. Overview & Goals

**Product**: Plotline 

**Mission**: "GitHub Actions for knowledge work." A thin, local-first orchestration layer that automates repeatable, multi-model AI workflows by treating prompts, models, and outputs as version-controlled files.

**MVP Goals**:
- Execute sequential workflows defined in YAML.
- Integrate exclusively with OpenRouter.
- Automatically pass previous step outputs as context to the next step.
- Support variable substitution from local files.
- Allow post-hoc editing of outputs in the GUI and re-running from a specific step.
- Persist runs entirely on the local filesystem with full workflow snapshots.

**Design Philosophy**: Thin orchestration, BYOK, provider-agnostic (future), minimal configuration, git-friendly, human-in-control. `[Operator Requirement]`

## 2. Requirements Summary

| Requirement | Source | Status |
|---|---|---|
| Desktop application (Tauri + React/TS) | `[Confirmed Answer]` | Approved |
| Sequential execution only | `[Confirmed Answer]` | Approved |
| Auto-run to completion, edit post-hoc | `[Confirmed Answer]` | Approved |
| Filesystem-only persistence | `[Confirmed Answer]` | Approved |
| OpenRouter as sole MVP provider | `[Operator Requirement]` | Approved |
| Automatic concatenation of previous output | `[Confirmed Answer]` | Approved |
| Variable substitution (`{{variables.name}}`) | `[Confirmed Answer]` | Approved |
| Run directory contains outputs + snapshot | `[Confirmed Answer]` | Approved |
| Non-streaming API calls for MVP | `[ASSUMPTION]` | Confirmed |

## 3. System Architecture

The system is a Tauri 2.0 desktop application. The architecture strictly separates the execution engine (Rust) from the presentation layer (React/TypeScript).

```text
┌─────────────────────────────────────────────────────────┐
│                    Tauri Application                     │
│                                                          │
│  ┌──────────────────────┐      ┌──────────────────────┐ │
│  │   React / TypeScript │      │       Rust Core       │ │
│  │      (Webview)       │      │   (Execution Engine)  │ │
│  │                      │ IPC  │                       │ │
│  │  - Workflow Selector │◄────►│  - Workflow Parser    │ │
│  │  - Run Monitor       │      │  - Variable Substitutor│ │
│  │  - Markdown Editor   │      │  - Execution Loop     │ │
│  │  - Settings (API Key)│      │  - OpenRouter Client  │ │
│  │                      │      │  - Run Manager        │ │
│  └──────────────────────┘      └──────────┬───────────┘ │
│                                           │             │
└───────────────────────────────────────────┼─────────────┘
                                            │
                            ┌───────────────┼───────────────┐
                            │               │               │
                      ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
                      │ Local FS  │   │OpenRouter │   │ OS Keyring│
                      │ (Project) │   │   (HTTP)  │   │ (API Key) │
                      └───────────┘   └───────────┘   └───────────┘
```

`[COMPLEXITY JUSTIFICATION]`: Tauri is chosen over Electron to adhere to the "thin orchestration" philosophy, reducing memory footprint and binary size while leveraging Rust's safety for filesystem and HTTP operations.

## 4. Component Responsibilities

### Rust Core (Backend)
1. **Workflow Parser**: Reads and validates `workflow.yaml`. Resolves relative paths to prompt and variable files.
2. **Variable Substitutor**: Scans prompt text for `{{variables.<name>}}` and replaces with corresponding file contents.
3. **Execution Engine**: Manages the sequential execution loop. Appends previous step output to current prompt. Emits state changes via Tauri events.
4. **OpenRouter Client**: Constructs and sends HTTP POST requests to OpenRouter API. Handles non-streaming JSON responses.
5. **Run Manager**: Creates run directories, copies workflow snapshots, and writes step outputs to disk.

### React Frontend (Webview)
1. **Project Context**: Displays available workflows from the loaded project directory.
2. **Run Monitor**: Listens to Tauri events to display real-time step status (`pending`, `running`, `completed`, `error`).
3. **Output Editor**: Renders Markdown outputs. Allows user editing and saves changes back to the Rust core via IPC.
4. **Settings**: Captures and stores the OpenRouter API key.

## 5. Data Model

### Project Structure
```text
project_root/
├── workflows/
│   └── write_chapter.yaml
├── prompts/
│   ├── outline.md
│   └── draft.md
└── variables/
    └── style.md
```

### Workflow Definition (`workflow.yaml`)
```yaml
name: Write Chapter
steps:
  - name: outline
    prompt_file: prompts/outline.md
    model: openai/gpt-4o
  - name: draft
    prompt_file: prompts/draft.md
    model: anthropic/claude-3.5-sonnet
```

### Run Directory Structure
```text
runs/
└── 2026-07-09-1020-write-chapter/
    ├── _workflow.yaml          # Snapshot of workflow def
    ├── _prompts/               # Snapshot of prompt files
    │   ├── outline.md
    │   └── draft.md
    ├── step_01_outline.md      # Output of step 1
    └── step_02_draft.md        # Output of step 2
```
`[PROPOSED DESIGN DECISION]`: Run directories are named with a timestamp prefix (`YYYY-MM-DD-HHMM`) to ensure chronological sorting and uniqueness.

## 6. API & Interface Design

### Tauri IPC Commands (Frontend → Backend)
- `invoke('run_workflow', { workflowPath: string })`: Starts a new run.
- `invoke('rerun_from_step', { runDir: string, stepIndex: number })`: Resumes an existing run from a specific step.
- `invoke('save_output', { runDir: string, stepIndex: number, content: string })`: Saves user edits to a step output file.
- `invoke('set_api_key', { key: string })`: Stores the API key.
- `invoke('get_run_status', { runDir: string })`: Returns the current state of a run based on file existence.

### Tauri Events (Backend → Frontend)
- `run_started`: Payload `{ runDir: string }`
- `step_started`: Payload `{ stepIndex: number, stepName: string }`
- `step_completed`: Payload `{ stepIndex: number, outputPath: string }`
- `run_completed`: Payload `{ runDir: string }`
- `run_error`: Payload `{ stepIndex: number, error: string }`

## 7. Security Architecture

- **API Key Storage**: `[PROPOSED DESIGN DECISION]` The OpenRouter API key is stored in the OS-specific keyring (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux) using the `keyring` Rust crate (service: `plotline`, account: `openrouter`). It is never written to plaintext project files or `settings.json`.
- **File Access**: The Rust backend restricts file operations to the user-selected project directory and its subdirectories. Path traversal in workflow definitions will be sanitized.

## 8. Infrastructure & Deployment

- **Build Tool**: Tauri CLI.
- **Frontend Bundler**: Vite.
- **Target Platforms**: macOS (`.dmg`/`.app`), Windows (`.msi`/`.exe`), Linux (`.AppImage`/`.deb`).
- **Distribution**: Direct download for MVP. No auto-updater configured for V1.

## 9. Operational Model

### Execution Loop
1. User selects a workflow and clicks "Run".
2. Backend creates a timestamped run directory.
3. Backend copies `workflow.yaml` and referenced prompt files into `_workflow.yaml` and `_prompts/`.
4. For each step `i`:
   a. Read prompt file from `_prompts/`.
   b. Substitute `{{variables.*}}`.
   c. If `i > 0`, append `\n\n---\n\nPrevious Step Output:\n\n{content of step i-1 output}`.
   d. Emit `step_started`.
   e. Send HTTP POST to OpenRouter.
   f. Write response to `step_XX_name.md`.
   g. Emit `step_completed`.
5. Emit `run_completed`.

### Re-run from Step
1. User edits `step_02_draft.md` in the UI.
2. UI calls `save_output` to write changes to disk.
3. User clicks "Re-run from Step 3".
4. Backend reads existing run directory, locates step 3, and begins the execution loop at step 3, using the edited `step_02_draft.md` as input.

## 10. Key Design Decisions

1. **Non-streaming API**: `[ASSUMPTION]` Using non-streaming HTTP requests simplifies the execution loop and file writing. The UI will show a generic "running" spinner. `[COMPLEXITY JUSTIFICATION]` Streaming adds significant complexity to Tauri IPC and state management for minimal MVP value.
2. **Filesystem State**: State is inferred by file existence. If `step_02_draft.md` exists, step 2 is complete. `[Confirmed Answer]`
3. **Automatic Concatenation**: The engine strictly appends the previous output. The prompt author does not need to specify where the context goes; it is always at the end. `[Confirmed Answer]`

## 11. Open Questions & Assumptions

1. **[ASSUMPTION]**: OpenRouter API responses are standard JSON objects where the text output is located at `choices[0].message.content`.
2. **[ASSUMPTION]**: Variable substitution syntax is strictly `{{variables.filename_without_extension}}`.
3. **[ASSUMPTION]**: The frontend will use a standard Markdown editor component (e.g., CodeMirror or react-markdown) compatible with the `frontend-patterns` skill.

---
