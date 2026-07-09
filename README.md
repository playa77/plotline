# Plotline

> GitHub Actions for knowledge work.

Plotline is a thin, local-first orchestration layer for repeatable AI-assisted workflows. Instead of manually copying context between different AI chat windows, Plotline treats prompts, models, and intermediate outputs as version-controlled files.

It is not a chatbot. It is an execution engine for human-directed cognitive workflows.

## Features

- **File-Based Workflows**: Define workflows in YAML. Prompts and variables are plain Markdown files.
- **Sequential Execution**: Automatically passes the output of step N as context to step N+1.
- **Variable Substitution**: Inject reusable context using `{{variables.filename}}` syntax.
- **Human-in-the-Loop**: Auto-runs to completion, but allows you to edit any step's output in the GUI and re-run from that point.
- **Reproducibility**: Every run creates a snapshot of the workflow and prompts, ensuring results are always traceable.
- **BYOK**: Bring your own OpenRouter API key. Stored securely in your OS keyring.

## Project Structure

Plotline operates on a standard project directory structure:

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

## Workflow Definition Example

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

### Production Build

To create a distributable binary for your current operating system:

```bash
npm run tauri build
```

The installer/binary will be located in `src-tauri/target/release/bundle/`.

## Usage Guide

1. **Configure Settings**: Launch Plotline, click the Settings gear, and enter your OpenRouter API key. Set your Project Root to your working directory.
2. **Select a Workflow**: Choose a workflow from the sidebar.
3. **Run**: Click "Run". The engine will execute steps sequentially, displaying progress in real-time.
4. **Edit & Re-run**: Once a run is complete (or if it fails), click "View Output" on any step to edit the result in the built-in Markdown editor. Click "Re-run from here" on any step to resume the workflow using your edited output as context.
