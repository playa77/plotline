// Version: 1.0.0 | 2026-07-09
// Typed IPC wrappers for Tauri backend commands.
// Every function wraps `invoke` with proper TypeScript types matching the
// Rust backend exactly.
// Errors are thrown as `Error` objects with the backend error string as message.

import { invoke } from "@tauri-apps/api/core";
import type {
  WorkflowSummary,
  RunSummary,
  RunInfo,
  RunFileEntry,
  RunMeta,
} from "../types";

// ---------------------------------------------------------------------------
// Workflow & Run Commands
// ---------------------------------------------------------------------------

/**
 * Starts a new workflow run.
 *
 * @param variableOverrides — map of variable name → value to override file-based
 *   variable content. Empty map or null means use file-based values for all variables.
 *   Keys are variable names (e.g. "chapter_number"), not file paths.
 */
export async function runWorkflow(
  workflowPath: string,
  projectRoot: string,
  variableOverrides?: Record<string, string>
): Promise<string> {
  return invoke<string>("run_workflow", {
    workflowPath,
    projectRoot,
    variableOverrides: variableOverrides ?? {},
  });
}

export async function rerunFromStep(
  runDir: string,
  stepIndex: number,
  variableOverrides?: Record<string, string>
): Promise<void> {
  return invoke<void>("rerun_from_step", {
    runDir,
    stepIndex,
    variableOverrides: variableOverrides ?? {},
  });
}

/** Persistently saves a variable value to project_root/variables/<name>.md */
export async function saveVariable(
  projectRoot: string,
  name: string,
  content: string
): Promise<void> {
  return invoke<void>("save_variable", { projectRoot, name, content });
}

/** Cancels the currently running workflow. Returns true if a run was active. */
export async function cancelWorkflow(): Promise<boolean> {
  return invoke<boolean>("cancel_workflow");
}

/** Writes content to an arbitrary file path (for prompt editing). */
export async function writeFileContent(
  filePath: string,
  content: string
): Promise<void> {
  return invoke<void>("write_file_content", { filePath, content });
}

export async function saveOutput(
  runDir: string,
  stepIndex: number,
  stepName: string,
  content: string
): Promise<void> {
  return invoke<void>("save_output", {
    runDir,
    stepIndex,
    stepName,
    content,
  });
}

export async function getRunStatus(runDir: string): Promise<RunInfo> {
  return invoke<RunInfo>("get_run_status", { runDir });
}

export async function listWorkflows(
  projectRoot: string
): Promise<WorkflowSummary[]> {
  return invoke<WorkflowSummary[]>("list_workflows", { projectRoot });
}

export async function listRuns(projectRoot: string): Promise<RunSummary[]> {
  return invoke<RunSummary[]>("list_runs", { projectRoot });
}

/** Lists all files and directories recursively inside a run directory. */
export async function listRunFiles(runDir: string): Promise<RunFileEntry[]> {
  return invoke<RunFileEntry[]>("list_run_files", { runDir });
}

export async function readFileContent(filePath: string): Promise<string> {
  return invoke<string>("read_file_content", { filePath });
}

/** Reads a run's _meta.json and returns it. Returns null if the file doesn't exist. */
export async function readRunMeta(runDir: string): Promise<RunMeta | null> {
  try {
    return await invoke<RunMeta>("read_run_meta", { runDir });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// API Key Management Commands
// ---------------------------------------------------------------------------

export async function setApiKey(key: string): Promise<void> {
  return invoke<void>("set_api_key", { key });
}

export async function getApiKey(): Promise<string> {
  return invoke<string>("get_api_key");
}

export async function hasApiKey(): Promise<boolean> {
  return invoke<boolean>("has_api_key");
}

// ---------------------------------------------------------------------------
// Project Root Management Commands
// ---------------------------------------------------------------------------

export async function setProjectRoot(path: string): Promise<void> {
  return invoke<void>("set_project_root", { path });
}

export async function getProjectRoot(): Promise<string | null> {
  return invoke<string | null>("get_project_root");
}
