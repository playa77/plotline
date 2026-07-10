// Version: 1.0.0 | 2026-07-09
// Tauri IPC command handlers: bridge between frontend invoke() and backend modules.
// All commands return Result<T, String> mapping PlotlineError to string via Display.
// See docs/technical_specification.md Section 8 for the complete command list.

use std::collections::HashMap;
use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use crate::config;
use crate::engine;
use crate::error::PlotlineError;
use crate::run_manager;
use crate::workflow;
use crate::workflow::{WorkflowSummary, RunSummary};

/// Helper: converts a PlotlineError into a user-facing String for the IPC boundary.
fn map_err(e: PlotlineError) -> String {
    e.to_string()
}

/// Helper: resolves a project_root from a command string.
fn resolve_project_root(path: &str) -> Result<PathBuf, String> {
    PathBuf::from(path).canonicalize().map_err(|e| {
        PlotlineError::FilesystemError(format!("Invalid project root path: {}", e)).to_string()
    })
}

// ---------------------------------------------------------------------------
// run_workflow — starts a new workflow run from the beginning
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn run_workflow(
    workflow_path: String,
    project_root: String,
    variable_overrides: HashMap<String, String>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let workflow_path = PathBuf::from(&workflow_path);
    let project_root = resolve_project_root(&project_root)?;

    // Create the run directory now so we can return it to the frontend
    // before the async execution starts. This is a shortcut — the engine
    // will re-create it, but since we use per-minute timestamps, the
    // second creation will hit the collision handler and get a -2 suffix.
    // Better: parse the workflow early to get the name for run dir creation,
    // then pass the run_dir to the engine.
    let workflow = workflow::parse_workflow(&workflow_path, &project_root)
        .map_err(map_err)?;
    workflow::validate_workflow(&workflow, &project_root).map_err(map_err)?;

    // Create the run directory and snapshot the workflow into it *before*
    // returning to the frontend, so get_run_status can immediately find
    // _workflow.yaml and show the correct step list instead of "No steps
    // found for this run." The engine receives this same run_dir and
    // completes the snapshot (copies prompt files, etc.).
    let run_dir = run_manager::create_run_directory(&project_root, &workflow.name)
        .map_err(map_err)?;

    let run_dir_str = run_dir.display().to_string();

    // Spawn the engine in a background task so the command returns immediately.
    // The frontend receives events as the engine progresses.
    let app_clone = app_handle.clone();
    let wf_path_clone = workflow_path.clone();
    let pr_clone = project_root.clone();
    let run_dir_clone = run_dir.clone();
    let vo_clone = variable_overrides.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = engine::run_workflow(
            &app_clone, &wf_path_clone, &pr_clone, &run_dir_clone, vo_clone,
        )
        .await
        {
            // The engine already emits run_error events internally.
            // We log here for server-side visibility.
            eprintln!(
                "[{}] Workflow run failed: {}",
                chrono::Local::now().format("%Y-%m-%dT%H:%M:%S"),
                e
            );
        }
    });

    Ok(run_dir_str)
}

// ---------------------------------------------------------------------------
// rerun_from_step — re-executes a workflow from a specific step
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn rerun_from_step(
    run_dir: String,
    step_index: usize,
    app_handle: AppHandle,
) -> Result<(), String> {
    let run_dir = PathBuf::from(&run_dir);

    if !run_dir.exists() {
        return Err(PlotlineError::RunNotFound(run_dir.display().to_string()).to_string());
    }

    let app_clone = app_handle.clone();
    let rd_clone = run_dir.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = engine::rerun_from_step(&app_clone, &rd_clone, step_index).await {
            eprintln!(
                "[{}] Re-run failed: {}",
                chrono::Local::now().format("%Y-%m-%dT%H:%M:%S"),
                e
            );
        }
    });

    Ok(())
}

// ---------------------------------------------------------------------------
// save_output — saves user-edited step output back to disk
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn save_output(
    run_dir: String,
    step_index: usize,
    step_name: String,
    content: String,
) -> Result<(), String> {
    let run_dir = PathBuf::from(&run_dir);
    run_manager::write_step_output(&run_dir, step_index, &step_name, &content)
        .map_err(map_err)
}

// ---------------------------------------------------------------------------
// get_run_status — returns the current state of a run
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_run_status(
    run_dir: String,
) -> Result<crate::workflow::RunInfo, String> {
    let run_dir = PathBuf::from(&run_dir);
    let snapshot_yaml = run_dir.join("_workflow.yaml");

    if !snapshot_yaml.exists() {
        return Err(PlotlineError::RunNotFound(run_dir.display().to_string()).to_string());
    }

    // Parse workflow from snapshot
    let workflow = workflow::parse_workflow(&snapshot_yaml, &run_dir).map_err(map_err)?;

    let run_info = run_manager::infer_run_status(&run_dir, &workflow);

    Ok(run_info)
}

// ---------------------------------------------------------------------------
// list_workflows — returns all valid workflow files in the workflows/ dir
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_workflows(
    project_root: String,
) -> Result<Vec<WorkflowSummary>, String> {
    let project_root = resolve_project_root(&project_root)?;
    let workflows_dir = project_root.join("workflows");

    if !workflows_dir.exists() {
        // No workflows directory — return empty list, don't error.
        // The frontend will show a helpful empty state.
        return Ok(vec![]);
    }

    let mut results = Vec::new();

    let entries = std::fs::read_dir(&workflows_dir).map_err(|e| {
        PlotlineError::FilesystemError(format!(
            "Failed to read workflows directory {}: {}",
            workflows_dir.display(),
            e
        ))
        .to_string()
    })?;

    for entry in entries {
        let entry = entry.map_err(|e| {
            PlotlineError::FilesystemError(format!("Failed to read directory entry: {}", e))
                .to_string()
        })?;

        let path = entry.path();

        // Only process .yaml and .yml files
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        if ext != "yaml" && ext != "yml" {
            continue;
        }

        // Try to parse the workflow, skip on failure
        match workflow::parse_workflow(&path, &project_root) {
            Ok(wf) => {
                results.push(WorkflowSummary {
                    name: wf.name,
                    file_path: path.display().to_string(),
                    step_count: wf.steps.len(),
                });
            }
            Err(_) => {
                // Skip unparsable files but log a warning
                eprintln!(
                    "[{}] WARNING: Skipping unparsable workflow file: {}",
                    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S"),
                    path.display()
                );
            }
        }
    }

    Ok(results)
}

// ---------------------------------------------------------------------------
// list_runs — returns all run directories with inferred status
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_runs(
    project_root: String,
) -> Result<Vec<RunSummary>, String> {
    let project_root = resolve_project_root(&project_root)?;
    let runs_dir = project_root.join("runs");

    if !runs_dir.exists() {
        return Ok(vec![]);
    }

    let mut results = Vec::new();

    let entries = std::fs::read_dir(&runs_dir).map_err(|e| {
        PlotlineError::FilesystemError(format!(
            "Failed to read runs directory {}: {}",
            runs_dir.display(),
            e
        ))
        .to_string()
    })?;

    for entry in entries {
        let entry = entry.map_err(|e| {
            PlotlineError::FilesystemError(format!("Failed to read directory entry: {}", e))
                .to_string()
        })?;

        let run_dir = entry.path();

        if !run_dir.is_dir() {
            continue;
        }

        // Try to infer run status
        let snapshot_yaml = run_dir.join("_workflow.yaml");
        if !snapshot_yaml.exists() {
            eprintln!(
                "[{}] WARNING: Run directory missing _workflow.yaml: {}",
                chrono::Local::now().format("%Y-%m-%dT%H:%M:%S"),
                run_dir.display()
            );
            continue;
        }

        match workflow::parse_workflow(&snapshot_yaml, &run_dir) {
            Ok(wf) => {
                let info = run_manager::infer_run_status(&run_dir, &wf);
                let completed_steps = info
                    .steps
                    .iter()
                    .filter(|s| matches!(s.status, crate::workflow::StepStatus::Completed))
                    .count();

                results.push(RunSummary {
                    run_dir: run_dir.display().to_string(),
                    workflow_name: wf.name,
                    started_at: info.started_at,
                    completed_steps,
                    total_steps: wf.steps.len(),
                });
            }
            Err(_) => {
                eprintln!(
                    "[{}] WARNING: Skipping unparsable run snapshot: {}",
                    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S"),
                    run_dir.display()
                );
            }
        }
    }

    // Sort by started_at descending (newest first)
    results.sort_by(|a, b| b.started_at.cmp(&a.started_at));

    Ok(results)
}

// ---------------------------------------------------------------------------
// read_file_content — reads a file's contents (security: path validation)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn read_file_content(
    file_path: String,
    _app_handle: AppHandle,
) -> Result<String, String> {
    let path = PathBuf::from(&file_path);

    // Basic security: ensure the path exists and is canonical
    let canonical = path.canonicalize().map_err(|e| {
        PlotlineError::FilesystemError(format!(
            "Failed to resolve file path: {} (error: {})",
            file_path, e
        ))
        .to_string()
    })?;

    // Read the file
    std::fs::read_to_string(&canonical).map_err(|e| {
        PlotlineError::FilesystemError(format!(
            "Failed to read file {}: {}",
            canonical.display(),
            e
        ))
        .to_string()
    })
}

// ---------------------------------------------------------------------------
// API Key Management Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn set_api_key(key: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("API key cannot be empty".to_string());
    }
    config::set_api_key(&key).map_err(map_err)
}

#[tauri::command]
pub async fn get_api_key() -> Result<String, String> {
    config::get_api_key().map_err(map_err)
}

#[tauri::command]
pub async fn has_api_key() -> Result<bool, String> {
    config::has_api_key().map_err(map_err)
}

// ---------------------------------------------------------------------------
// Project Root Management Commands (via tauri-plugin-store)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn set_project_root(
    path: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    let resolved = resolve_project_root(&path)?;

    // Validate that the directory exists
    if !resolved.is_dir() {
        return Err(format!(
            "Project root is not a directory: {}",
            resolved.display()
        ));
    }

    // Store in tauri-plugin-store
    let store = app_handle
        .store("settings.json")
        .map_err(|e| format!("Failed to access settings store: {}", e))?;

    store.set("project_root", resolved.display().to_string());
    store.save().map_err(|e| format!("Failed to save settings: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_project_root(app_handle: AppHandle) -> Result<Option<String>, String> {
    let store = app_handle
        .store("settings.json")
        .map_err(|e| format!("Failed to access settings store: {}", e))?;

    let value = store.get("project_root");

    let result: Option<String> = value.and_then(|v| v.as_str().map(|s| s.to_string()));

    Ok(result)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_err_converts_plotline_error_to_string() {
        let err = PlotlineError::ApiKeyNotSet;
        let msg = map_err(err);
        assert!(msg.contains("API key not set"));
    }

    #[test]
    fn test_resolve_project_root_invalid_path() {
        let result = resolve_project_root("/nonexistent/path/that/doesnt/exist");
        assert!(result.is_err());
    }
}
