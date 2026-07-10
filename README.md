# Plotline

> GitHub Actions for knowledge work.

Plotline is a thin, local-first orchestration layer for repeatable AI-assisted workflows. Instead of manually copying context between different AI chat windows, Plotline treats prompts, models, and intermediate outputs as version-controlled files.

It is not a chatbot. It is an execution engine for human-directed cognitive workflows.

## Features

- **File-Based Workflows**: Define workflows in YAML. Prompts and variables are plain Markdown files.
- **Sequential Execution**: Automatically passes the output of step N as context to step N+1.
- **Variable Substitution**: Inject reusable context using `{{variables.filename}}` syntax.
- **Human-in-the-Loop**: Auto-runs to completion, but allows you to edit any step's output in a built-in CodeMirror editor and re-run from that point.
- **Reproducibility**: Every run creates a snapshot of the workflow and prompts, ensuring results are always traceable.
- **BYOK**: Bring your own OpenRouter API key. Stored securely in your OS keyring.
- **Per-Step Model Selection**: Each workflow step declares its own OpenRouter model — mix and match models within a single workflow.
- **Pre-flight Variable Editor**: When a workflow uses `{{variables.*}}`, a dialog appears before execution letting you override variable values without editing files on disk.
- **Chapter Picker**: Chapter-like variables get an intelligent combobox that parses chapter lists from your book outline, making it fast to pick chapters by number.
- **Run Cancellation**: Cancel a running workflow at any time — the cancel button in the footer safely aborts execution.
- **Retry with Backoff**: OpenRouter API calls automatically retry up to 3 times with exponential backoff (1s, 2s, 4s) for transient failures like network timeouts and HTTP 5xx errors.

## Quick Start

### 1. First Launch

1. Open Plotline. You'll see an empty sidebar prompting you to "Set a project root in Settings."
2. Click the gear icon (&#9881; **Settings**) in the top-right header.
3. **Set your OpenRouter API key** — paste it into the password field and click Save. The key is stored securely in your OS keyring (never in plaintext files).
4. **Set your Project Root** — click "Pick Directory" and choose a folder on your filesystem. This is where your workflows, prompts, variables, and runs will live.

### 2. Create a Project

A Plotline project is just a directory on disk with this structure:

```text
my-writing-project/
├── workflows/
│   └── write_chapter.yaml    # Workflow definitions
├── prompts/
│   ├── outline.md            # Prompt templates
│   └── draft.md
├── variables/
│   └── style.md              # Reusable context variables
└── runs/                     # Auto-generated run histories
```

You create these folders and files yourself — Plotline reads them from disk.

### 3. Run a Workflow

1. Close Settings. The sidebar refreshes to show workflows found in `workflows/`.
2. Click a workflow card, then click **Run**.
3. The engine executes each step sequentially. Progress appears in real-time in the main panel.
4. When a run completes (or fails), click **View Output** on any step to see and edit the result in the built-in Markdown editor.
5. Edit an output, click **Save**, then click **Re-run from here** to regenerate downstream steps using your edits as context.

## Workflow Definition Format

Workflows are YAML files placed in your project's `workflows/` directory. Each step declares its own prompt file and OpenRouter model.

```yaml
name: Write Chapter
steps:
  - name: outline
    prompt_file: prompts/outline.md
    model: openai/gpt-4o
  - name: draft
    prompt_file: prompts/draft.md
    model: anthropic/claude-3.5-sonnet
  - name: review
    prompt_file: prompts/review.md
    model: openai/gpt-4o
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name for the workflow |
| `steps[].name` | Yes | Unique step identifier. Slug-safe: letters, numbers, hyphens, underscores only (e.g., `outline`, `final-draft`, `step_3`) |
| `steps[].prompt_file` | Yes | Path to the Markdown prompt file, relative to project root (e.g., `prompts/outline.md`) |
| `steps[].model` | Yes | OpenRouter model ID (e.g., `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`, `google/gemini-2.0-flash-001`) |

### Model Selection

The model is set **per step in the workflow YAML**. There is no global "default model" in Settings — every step must declare its own. This lets you mix models within a single workflow (e.g., use Claude for creative drafting, then GPT-4o for structured review).

Common OpenRouter model IDs:

| Model String | Description |
|---|---|
| `openai/gpt-4o` | OpenAI GPT-4o |
| `openai/gpt-4.1` | OpenAI GPT-4.1 |
| `anthropic/claude-3.5-sonnet` | Anthropic Claude 3.5 Sonnet |
| `anthropic/claude-sonnet-4-20250514` | Anthropic Claude Sonnet 4 |
| `google/gemini-2.0-flash-001` | Google Gemini 2.0 Flash |

### Validation Rules

Plotline validates workflows before execution:

- Names must be unique, non-empty, and slug-safe (`^[a-zA-Z0-9_-]+$`)
- Steps must be a non-empty array
- Prompt files must exist on disk (path traversal like `../secret.txt` is rejected)
- Model must be non-empty
- Unparseable workflow YAML files in `workflows/` are skipped with a warning

## How Execution Works

### Step-by-Step Flow

```
1. Parse + validate workflow YAML
2. Create a timestamped run directory
3. Snapshot the workflow and all prompt files into the run directory
4. For each step (sequentially):
   a. Read the prompt from the snapshot (_prompts/)
   b. Substitute {{variables.*}} placeholders with live file contents
   c. If this is not the first step, append previous step's output as context
    d. Send to OpenRouter API (non-streaming, 30-second timeout)
    e. If request fails with a transient error (network timeout, 5xx), retry up to 3 times with exponential backoff (1s, 2s, 4s)
    f. Write the response to step_XX_name.md
5. Emit completion events to the UI
```

### Context Chaining

When a step executes (other than the first), the previous step's output is automatically appended to the prompt:

```
[current step's prompt content]

---

Previous Step Output:

[full output from the previous step]
```

You do not control where context goes — it is always appended at the end.

### Prompts Are Frozen, Variables Are Live

- **Prompts**: Copied into the run directory's `_prompts/` folder at the start of a run. Editing the original prompt file mid-run won't affect the running workflow.
- **Variables**: Read from the project root's `variables/` directory every time a step executes. Editing a variable file IS reflected in the next step.

### Variable Substitution

Use `{{variables.<name>}}` in any prompt file to inject the contents of `<project_root>/variables/<name>.md`:

```markdown
# Outline the Chapter

Write a detailed chapter outline.

Style: {{variables.style}}
Protagonist: {{variables.protagonist}}
```

Regex: `\{\{variables\.([a-zA-Z0-9_-]+)\}\}` — names can contain letters, numbers, hyphens, and underscores. Other `{{...}}` patterns are left untouched (no error).

## Run Directory Structure

Every execution creates a timestamped run directory:

```text
runs/2026-07-09-1020-write-chapter/
├── _workflow.yaml              # Snapshot of the workflow definition used
├── _prompts/                   # Frozen copies of all prompt files
│   ├── outline.md
│   └── draft.md
├── step_01_outline.md          # Output of step 1 (1-indexed, zero-padded)
├── step_02_draft.md            # Output of step 2
└── ...
```

- Directories are named `YYYY-MM-DD-HHMM-<workflow-slug>/`
- If a directory already exists, `-2`, `-3`, etc. is appended
- Step output files use the format `step_{:02}_{name}.md` (1-indexed)
- All files are plain Markdown — editable outside Plotline with any text editor

### Re-run from Step

When you edit a step's output and click **Re-run from here**, Plotline:

1. Reads the workflow from the snapshot (`_workflow.yaml`)
2. Deletes all output files from that step onward
3. Reads the prior step's output from disk (potentially edited by you)
4. Resumes execution from the selected step

## Typical Use Cases

### Serial Writing Pipeline

Chain multiple workflows by passing results through variables:

1. Run **"Expand Chapter Outline"** — output saved to a run directory
2. Copy the outline into `variables/outline.md`
3. Run **"Write Chapter"** — references `{{variables.outline}}`
4. Copy the draft into `variables/draft.md`
5. Run **"Review Draft"** — references `{{variables.draft}}`

### Iterative Editing

1. Run a multi-step workflow to completion
2. Click **View Output** on step 2, edit the text, click Save
3. Click **Re-run from here** on step 3 — regenerates from step 3 using your edited output

### Parameterized Generation

Write reusable context files in `variables/`:

```text
variables/
├── style.md         # "Write in a dark, brooding tone."
├── character.md     # "John Doe, a retired detective in his 50s."
└── setting.md       # "A rain-soaked city in the Pacific Northwest."
```

Reference them across any prompt:

```markdown
Style: {{variables.style}}
Character: {{variables.character}}
Setting: {{variables.setting}}
```

Swap variable files between projects without touching your prompts.

### Multi-Step Reasoning

Chaining steps where each builds on the previous:

```yaml
name: Analyze Plot Hole
steps:
  - name: identify-gap
    prompt_file: prompts/identify.md
    model: anthropic/claude-3.5-sonnet
  - name: propose-fixes
    prompt_file: prompts/propose.md
    model: openai/gpt-4o
  - name: evaluate
    prompt_file: prompts/evaluate.md
    model: anthropic/claude-3.5-sonnet
```

Step 2 receives step 1's output as context. Step 3 receives step 2's. Each step can use a different model optimized for its role (analysis, ideation, evaluation).

### A/B Model Testing

Same prompt, different models in the same workflow to compare outputs.

### Research Summarization

Paste source material into `variables/source.md`, run a "Summarize" workflow that references it.

## UI Reference

```
┌──────────────────────────────────────────────────────────────────────┐
│  Plotline                                Set Project Root    ⚙ Settings│
├──────────────┬───────────────────────────────────────────────────────┤
│              │                                                        │
│  Sidebar     │              Main Content Panel                        │
│              │                                                        │
│  Workflows   │  • Welcome screen (when no run is active)              │
│  ─────────   │  • Run Monitor (step-by-step progress during a run)    │
│  ├─ Write..  │  • Output Editor (CodeMirror, for viewing/editing)     │
│  ├─ Expand.. │                                                        │
│  └─ Review.. │                                                        │
│              │                                                        │
│  Runs        │                                                        │
│  ─────────   │                                                        │
│  ├─ 07-09... │                                                        │
│  └─ 07-08... │                                                        │
├──────────────┴───────────────────────────────────────────────────────┤
│  Project: /home/user/my-writing-project           Running...  Cancel  Completed│
└──────────────────────────────────────────────────────────────────────┘
```

### Three-Panel Layout

| Panel | Content |
|-------|---------|
| **Sidebar** | Lists workflows from `workflows/` and past runs from `runs/` with status badges |
| **Main Content** | Run Monitor during execution, Output Editor for viewing/editing step outputs |
| **Footer** | Shows current project root path and run status (Running, Completed, Failed) |

### Settings Modal

Accessible via the gear icon (&#9881;) in the header. Contains two settings:

- **Project Root**: Directory picker — choose the folder containing your `workflows/`, `prompts/`, and `variables/`
- **OpenRouter API Key**: Password input — stored in your OS keyring, shown as &#10003; stored / &#10007; missing

### Keyboard Shortcuts

- **Escape**: Close Settings modal, close Output Editor, or navigate back (when applicable)

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **Non-streaming API calls** | Simplifies the execution loop and file writing. The UI shows a generic "Running" indicator per step. |
| **Filesystem as state** | Run status is inferred by file existence — if `step_02_draft.md` exists, step 2 is complete. No database needed. |
| **Automatic context appending** | The engine always appends previous output at the end of the prompt. The prompt author does not control where context goes — it's always `\n\n---\n\nPrevious Step Output:\n\n{content}`. |
| **Prompts snapshotted, variables live** | Prompt files are frozen at run start for reproducibility. Variable files are read live so you can tweak context mid-run. |
| **API key in OS keyring** | Never written to `settings.json` or project files. Service: `plotline`, account: `openrouter`. |
| **One workflow at a time** | No background job queue in MVP. The engine runs as a single async command. The UI disables Run buttons during execution. |
| **Per-step model selection** | Each step declares its own model in the workflow YAML. No global default — mix and match models within a workflow. |

## Limitations (MVP)

- **No streaming** — the UI shows a spinner per step, not token-by-token output
- **No parallel step execution** — steps always run sequentially
- **No workflow chaining** — you must run workflows one at a time and manually pipe results via variables
- **No branching or conditional steps** — linear sequences only
- **No cost tracking or usage dashboards**
- **No integrated prompt editor** — a CodeMirror-based prompt editor component (`PromptEditorModal.tsx`) exists but is not yet wired into the main UI. Write prompts in your text editor of choice for now.
- **OpenRouter only** — no direct provider integrations (OpenAI, Anthropic, etc.)
- **No workflow editor** — write YAML by hand

## Build Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or later)
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Tauri 2.0 Prerequisites](https://tauri.app/start/prerequisites/) (system dependencies for your OS)

### Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd plotline
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run tauri dev
   ```

### Running Tests

```bash
# Rust tests (86 tests, all 8 modules)
cd src-tauri && cargo test

# Frontend tests (35 tests via vitest)
npm test

# TypeScript typecheck
npx tsc --noEmit
```

### Production Build

To create a distributable binary for your current operating system:

```bash
npm run tauri build
```

The installer/binary will be located in `src-tauri/target/release/bundle/`.

## Architecture

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
│  │  - Output Editor     │      │  - Execution Loop     │ │
│  │  - Settings (API Key)│      │  - OpenRouter Client  │ │
│  │  - Toast/Error Bounds│      │  - Run Manager        │ │
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

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.
