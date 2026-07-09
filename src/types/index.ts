// Version: 1.0.0 | 2026-07-09
// Shared TypeScript type definitions matching the Rust backend types exactly.
// See docs/technical_specification.md Section 5 for the full type definitions.

export interface Workflow {
  name: string;
  steps: Step[];
}

export interface Step {
  name: string;
  /** Relative path from project root to the prompt file. */
  prompt_file: string;
  /** OpenRouter model identifier. */
  model: string;
}

export interface RunStepStatus {
  index: number;
  name: string;
  status: "pending" | "running" | "completed" | "error";
  output_path: string | null;
}

export interface RunInfo {
  run_dir: string;
  workflow_name: string;
  /** ISO 8601 timestamp. */
  started_at: string;
  steps: RunStepStatus[];
}

/** Lightweight summary of a workflow file, returned by list_workflows. */
export interface WorkflowSummary {
  name: string;
  file_path: string;
  step_count: number;
}

/** Lightweight summary of a run directory, returned by list_runs. */
export interface RunSummary {
  run_dir: string;
  workflow_name: string;
  started_at: string;
  completed_steps: number;
  total_steps: number;
}

/**
 * Payload shape for Tauri events emitted by the backend:
 *   run_started, step_started, step_completed, run_completed, run_error
 */
export interface RunEventPayload {
  runDir: string;
  stepIndex?: number;
  stepName?: string;
  outputPath?: string;
  error?: string;
}
