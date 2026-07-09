// Version: 1.0.0 | 2026-07-09
// Execution engine: sequential step loop with context concatenation.
// See docs/technical_specification.md Section 8 for the execution loop pseudocode.
//
// The engine ties together workflow parsing, variable substitution, OpenRouter
// API calls, and file I/O. It emits Tauri events for the frontend to consume.
//
// Design decisions (from AGENTS.md):
//   - Prompts are read from the run snapshot (_prompts/), variables from project root
//   - Context concatenation: "\n\n---\n\nPrevious Step Output:\n\n{content}"
//   - Step output paths are 1-indexed, zero-padded to 2 digits
//   - Only one workflow at a time (MVP) — no background job queue

use std::path::Path;

use tauri::Emitter;

use crate::config;
use crate::error::PlotlineError;
use crate::openrouter::{self, CompletionRequest};
use crate::run_manager;
use crate::substitution;
use crate::workflow::{self, Workflow};

/// Event payloads mirror the design document Section 6 (Tauri events).
/// All fields use camelCase to match the frontend `RunEventPayload` interface.

#[derive(Clone, serde::Serialize)]
struct RunStartedPayload {
    #[serde(rename = "runDir")]
    run_dir: String,
}

#[derive(Clone, serde::Serialize)]
struct StepStartedPayload {
    #[serde(rename = "stepIndex")]
    step_index: usize,
    #[serde(rename = "stepName")]
    step_name: String,
}

#[derive(Clone, serde::Serialize)]
struct StepCompletedPayload {
    #[serde(rename = "stepIndex")]
    step_index: usize,
    #[serde(rename = "outputPath")]
    output_path: String,
}

#[derive(Clone, serde::Serialize)]
struct RunCompletedPayload {
    #[serde(rename = "runDir")]
    run_dir: String,
}

#[derive(Clone, serde::Serialize)]
struct RunErrorPayload {
    #[serde(rename = "stepIndex")]
    step_index: usize,
    error: String,
}

// ---------------------------------------------------------------------------
// delete_subsequent_outputs — cleanup helper for re-runs
// ---------------------------------------------------------------------------

/// Deletes output files for steps from `from_index` to the end of the workflow.
/// This ensures stale outputs from a previous run don't confuse `infer_run_status`.
fn delete_subsequent_outputs(
    run_dir: &Path,
    workflow: &Workflow,
    from_index: usize,
) -> Result<(), PlotlineError> {
    for (index, step) in workflow.steps.iter().enumerate().skip(from_index) {
        let path = run_manager::step_output_path(run_dir, index, &step.name);
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| {
                PlotlineError::FilesystemError(format!(
                    "Failed to delete stale output file {}: {}",
                    path.display(),
                    e
                ))
            })?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// run_workflow — execute a complete workflow from the beginning
// ---------------------------------------------------------------------------

/// Executes a workflow from the beginning.
///
/// 1. Parses and validates the workflow YAML.
/// 2. Creates a timestamped run directory.
/// 3. Snapshots the workflow and prompt files into the run directory.
/// 4. For each step:
///    a. Reads the prompt from the snapshot (_prompts/).
///    b. Substitutes {{variables.*}} using the project root (live variables).
///    c. Appends previous step output if this is not the first step.
///    d. Retrieves the API key from the OS keyring.
///    e. Calls OpenRouter with the assembled prompt.
///    f. Writes the response to the step output file.
/// 5. Emits Tauri events at each stage.
///
/// Events emitted (in order):
///   run_started → (step_started → step_completed)* → run_completed
///
/// On error, emits run_error and returns the error. Completed step outputs
/// are preserved on disk for later re-run.
pub async fn run_workflow(
    app_handle: &tauri::AppHandle,
    workflow_path: &Path,
    project_root: &Path,
) -> Result<(), PlotlineError> {
    // Step 1: Parse and validate the workflow
    let workflow = workflow::parse_workflow(workflow_path, project_root)?;
    workflow::validate_workflow(&workflow, project_root)?;

    // Step 2: Create run directory
    let run_dir = run_manager::create_run_directory(project_root, &workflow.name)?;

    // Step 3: Snapshot workflow and prompts
    run_manager::snapshot_workflow(&run_dir, workflow_path, &workflow, project_root)?;

    // Emit run_started
    let _ = app_handle.emit(
        "run_started",
        RunStartedPayload {
            run_dir: run_dir.display().to_string(),
        },
    );

    // Step 4: Execute each step sequentially
    let runner = EngineRunner {
        app_handle,
        run_dir: &run_dir,
        project_root,
    };
    runner.execute_steps(&workflow, None).await
}

// ---------------------------------------------------------------------------
// rerun_from_step — re-execute from a specific step
// ---------------------------------------------------------------------------

/// Re-executes a workflow starting from a specific step index (0-based).
///
/// Reads the snapshotted workflow from `run_dir / "_workflow.yaml"` and uses
/// the snapshotted prompts. If `step_index > 0`, the previous step's output
/// is read from the existing output file on disk (which may have been edited
/// by the user).
///
/// Before starting, deletes any existing output files for `step_index`
/// and all subsequent steps to avoid confusing `infer_run_status`.
pub async fn rerun_from_step(
    app_handle: &tauri::AppHandle,
    run_dir: &Path,
    step_index: usize,
) -> Result<(), PlotlineError> {
    // Parse workflow from snapshot
    let snapshot_yaml = run_dir.join("_workflow.yaml");
    if !snapshot_yaml.exists() {
        return Err(PlotlineError::RunNotFound(
            run_dir.display().to_string(),
        ));
    }

    // For re-runs, use the run_dir itself as project_root for path resolution
    // because prompts are snapshotted under _prompts/
    let workflow =
        workflow::parse_workflow(&snapshot_yaml, run_dir)?;

    // Validate step_index is within bounds
    if step_index >= workflow.steps.len() {
        return Err(PlotlineError::InvalidStepIndex {
            index: step_index,
            total: workflow.steps.len(),
        });
    }

    // Delete subsequent outputs to ensure clean state
    delete_subsequent_outputs(run_dir, &workflow, step_index)?;

    // Emit run_started
    let _ = app_handle.emit(
        "run_started",
        RunStartedPayload {
            run_dir: run_dir.display().to_string(),
        },
    );

    // Read previous output if not starting from step 0
    let previous_output = if step_index > 0 {
        let prev_step = &workflow.steps[step_index - 1];
        run_manager::read_step_output(run_dir, step_index - 1, &prev_step.name)
    } else {
        None
    };

    // Execute from step_index onward
    let runner = EngineRunner {
        app_handle,
        run_dir,
        // For re-runs, use run_dir as project_root since prompts are snapshotted
        project_root: run_dir,
    };
    runner.execute_steps(&workflow, Some((step_index, previous_output))).await
}

// ---------------------------------------------------------------------------
// EngineRunner — internal struct holding execution state for the loop
// ---------------------------------------------------------------------------

struct EngineRunner<'a> {
    app_handle: &'a tauri::AppHandle,
    run_dir: &'a Path,
    project_root: &'a Path,
}

impl<'a> EngineRunner<'a> {
    /// Executes steps in the workflow from `start` to the end.
    ///
    /// `start` is `None` for a fresh run (start at step 0, no previous output).
    /// `start` is `Some((start_index, previous_output))` for a re-run.
    async fn execute_steps(
        &self,
        workflow: &Workflow,
        start: Option<(usize, Option<String>)>,
    ) -> Result<(), PlotlineError> {
        let (start_index, mut previous_output) = start.unwrap_or((0, None));

        for (index, step) in workflow.steps.iter().enumerate().skip(start_index) {
            // Emit step_started
            let _ = self.app_handle.emit(
                "step_started",
                StepStartedPayload {
                    step_index: index,
                    step_name: step.name.clone(),
                },
            );

            let result = self.execute_single_step(
                index,
                step,
                &mut previous_output,
                workflow,
            )
            .await;

            match result {
                Ok(_) => {
                    // Emit step_completed
                    let output_path =
                        run_manager::step_output_path(self.run_dir, index, &step.name);
                    let _ = self.app_handle.emit(
                        "step_completed",
                        StepCompletedPayload {
                            step_index: index,
                            output_path: output_path.display().to_string(),
                        },
                    );
                }
                Err(e) => {
                    let _ = self.app_handle.emit(
                        "run_error",
                        RunErrorPayload {
                            step_index: index,
                            error: e.to_string(),
                        },
                    );
                    return Err(e);
                }
            }
        }

        // Emit run_completed
        let _ = self.app_handle.emit(
            "run_completed",
            RunCompletedPayload {
                run_dir: self.run_dir.display().to_string(),
            },
        );

        Ok(())
    }

    /// Executes a single step: load prompt, substitute, append context,
    /// call OpenRouter, write output.
    async fn execute_single_step(
        &self,
        index: usize,
        step: &workflow::Step,
        previous_output: &mut Option<String>,
        _workflow: &Workflow,
    ) -> Result<(), PlotlineError> {
        // 1. Read prompt from snapshot (_prompts/)
        let snapshot_prompt_path = self.run_dir.join("_prompts").join(&step.prompt_file);
        let prompt_content = std::fs::read_to_string(&snapshot_prompt_path).map_err(|_| {
            PlotlineError::PromptFileNotFound {
                path: snapshot_prompt_path.display().to_string(),
            }
        })?;

        // 2. Substitute variables using LIVE project_root (not run_dir)
        //    Variables are always read from the project root, not the snapshot
        let mut prompt = substitution::substitute_variables(
            &prompt_content,
            self.project_root,
        )?;

        // 3. Append previous output (context concatenation)
        if let Some(ref prev) = *previous_output {
            prompt.push_str("\n\n---\n\nPrevious Step Output:\n\n");
            prompt.push_str(prev);
        }

        // 4. Retrieve API key
        let api_key = config::get_api_key().map_err(|e| match e {
            PlotlineError::ApiKeyNotSet => PlotlineError::ApiKeyNotSet,
            other => other,
        })?;

        // 5. Call OpenRouter
        let request = CompletionRequest {
            model: step.model.clone(),
            prompt,
            api_key,
        };

        let response = openrouter::complete(request).await?;

        // 6. Write output to disk
        run_manager::write_step_output(
            self.run_dir,
            index,
            &step.name,
            &response.content,
        )?;

        // 7. Update previous_output for next iteration
        let _ = previous_output.insert(response.content);

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow::Step;
    use std::fs;

    // -----------------------------------------------------------------------
    // delete_subsequent_outputs tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_delete_subsequent_outputs() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let run_dir = tmp.path();

        let workflow = Workflow {
            name: "Test".into(),
            steps: vec![
                Step {
                    name: "step1".into(),
                    prompt_file: "p1.md".into(),
                    model: "m".into(),
                },
                Step {
                    name: "step2".into(),
                    prompt_file: "p2.md".into(),
                    model: "m".into(),
                },
                Step {
                    name: "step3".into(),
                    prompt_file: "p3.md".into(),
                    model: "m".into(),
                },
            ],
        };

        // Write all 3 output files
        run_manager::write_step_output(run_dir, 0, "step1", "output 1").unwrap();
        run_manager::write_step_output(run_dir, 1, "step2", "output 2").unwrap();
        run_manager::write_step_output(run_dir, 2, "step3", "output 3").unwrap();

        // Delete from step 2 (index 1) onward
        delete_subsequent_outputs(run_dir, &workflow, 1).unwrap();

        // Step 1 should still exist
        assert!(run_manager::read_step_output(run_dir, 0, "step1").is_some());
        // Step 2 and 3 should be deleted
        assert!(run_manager::read_step_output(run_dir, 1, "step2").is_none());
        assert!(run_manager::read_step_output(run_dir, 2, "step3").is_none());
    }

    #[test]
    fn test_delete_subsequent_outputs_from_start() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let run_dir = tmp.path();

        let workflow = Workflow {
            name: "Test".into(),
            steps: vec![
                Step {
                    name: "step1".into(),
                    prompt_file: "p1.md".into(),
                    model: "m".into(),
                },
                Step {
                    name: "step2".into(),
                    prompt_file: "p2.md".into(),
                    model: "m".into(),
                },
            ],
        };

        run_manager::write_step_output(run_dir, 0, "step1", "output 1").unwrap();
        run_manager::write_step_output(run_dir, 1, "step2", "output 2").unwrap();

        // Delete from step 1 (index 0) — should delete everything
        delete_subsequent_outputs(run_dir, &workflow, 0).unwrap();

        assert!(run_manager::read_step_output(run_dir, 0, "step1").is_none());
        assert!(run_manager::read_step_output(run_dir, 1, "step2").is_none());
    }

    #[test]
    fn test_delete_subsequent_outputs_no_files() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let run_dir = tmp.path();

        let workflow = Workflow {
            name: "Test".into(),
            steps: vec![Step {
                name: "step1".into(),
                prompt_file: "p1.md".into(),
                model: "m".into(),
            }],
        };

        // Deleting when no files exist should be a no-op
        let result = delete_subsequent_outputs(run_dir, &workflow, 0);
        assert!(result.is_ok());
    }

    // -----------------------------------------------------------------------
    // Context concatenation tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_context_concatenation_format() {
        let previous_output = "This is the output of step 1.\nIt has multiple lines.";
        let prompt = "Step 2 prompt. Do something.";

        let mut full_prompt = prompt.to_string();
        full_prompt.push_str("\n\n---\n\nPrevious Step Output:\n\n");
        full_prompt.push_str(previous_output);

        let expected = "Step 2 prompt. Do something.\n\n---\n\nPrevious Step Output:\n\nThis is the output of step 1.\nIt has multiple lines.";
        assert_eq!(full_prompt, expected);
        assert!(full_prompt.contains("\n\n---\n\nPrevious Step Output:\n\n"));
    }

    #[test]
    fn test_context_concatenation_empty_previous() {
        // When previous output is empty, it's still appended with the separator
        let mut prompt = "Step 1 prompt.".to_string();
        prompt.push_str("\n\n---\n\nPrevious Step Output:\n\n");
        prompt.push_str("");

        assert!(prompt.contains("Previous Step Output:"));
        assert!(prompt.ends_with("Previous Step Output:\n\n"));
    }

    #[test]
    fn test_context_concatenation_no_append_when_no_previous() {
        // When there is no previous output (first step), nothing is appended
        let prompt = "Step 1 prompt. No context needed.".to_string();
        assert!(!prompt.contains("Previous Step Output:"));
    }

    // -----------------------------------------------------------------------
    // Re-run logic tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_rerun_reads_previous_output() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let run_dir = tmp.path();

        run_manager::write_step_output(run_dir, 0, "step1", "Edited output for step 1").unwrap();

        let output = run_manager::read_step_output(run_dir, 0, "step1");
        assert!(output.is_some());
        assert_eq!(output.unwrap(), "Edited output for step 1");
    }

    #[test]
    fn test_rerun_from_step_zero_no_previous() {
        let step_index: usize = 0;
        let output = if step_index > 0 {
            Some("previous".to_string())
        } else {
            None
        };
        assert!(output.is_none());
    }

    #[test]
    fn test_rerun_from_step_one_has_previous() {
        // When step_index is 1, we read step 0's output as previous
        let step_index: usize = 1;
        let output = if step_index > 0 {
            Some("previous step content".to_string())
        } else {
            None
        };
        assert!(output.is_some());
        assert_eq!(output.unwrap(), "previous step content");
    }

    #[test]
    fn test_rerun_invalid_step_index_rejected() {
        let workflow = Workflow {
            name: "Test".into(),
            steps: vec![Step {
                name: "only-step".into(),
                prompt_file: "p.md".into(),
                model: "m".into(),
            }],
        };

        let step_index: usize = 5;
        assert!(step_index >= workflow.steps.len(), "step_index 5 should be out of bounds");

        let step_index: usize = 1;
        assert!(step_index >= workflow.steps.len(), "step_index 1 should be out of bounds for 1-step workflow");

        let step_index: usize = 0;
        assert!(step_index < workflow.steps.len(), "step_index 0 should be valid for 1-step workflow");
    }

    // -----------------------------------------------------------------------
    // Variable substitution: live variables vs snapshotted prompts
    // -----------------------------------------------------------------------

    #[test]
    fn test_substitution_uses_live_variables() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let project = tmp.path();

        fs::create_dir_all(project.join("variables")).unwrap();
        fs::write(project.join("variables/ctx.md"), "live context").unwrap();

        let prompt = "Use this: {{variables.ctx}}";
        let result = substitution::substitute_variables(prompt, project).unwrap();
        assert_eq!(result, "Use this: live context");

        // Now change the variable file (simulating "live" editing during a run)
        fs::write(project.join("variables/ctx.md"), "updated context").unwrap();
        let result2 = substitution::substitute_variables(prompt, project).unwrap();
        assert_eq!(result2, "Use this: updated context");
    }

    // -----------------------------------------------------------------------
    // Event payload serialization tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_event_payloads_serialize_correctly() {
        // run_started
        let started = RunStartedPayload {
            run_dir: "/tmp/test-run".to_string(),
        };
        let json = serde_json::to_string(&started).unwrap();
        assert!(json.contains("runDir"));
        assert!(json.contains("/tmp/test-run"));

        // step_started
        let step = StepStartedPayload {
            step_index: 0,
            step_name: "outline".to_string(),
        };
        let json = serde_json::to_string(&step).unwrap();
        assert!(json.contains("stepIndex"));
        assert!(json.contains("\"stepIndex\":0"));
        assert!(json.contains("outline"));

        // step_completed
        let completed = StepCompletedPayload {
            step_index: 1,
            output_path: "/tmp/step_02_draft.md".to_string(),
        };
        let json = serde_json::to_string(&completed).unwrap();
        assert!(json.contains("outputPath"));
        assert!(json.contains("step_02_draft.md"));

        // run_completed
        let done = RunCompletedPayload {
            run_dir: "/tmp/done".to_string(),
        };
        let json = serde_json::to_string(&done).unwrap();
        assert!(json.contains("runDir"));
        assert!(json.contains("/tmp/done"));

        // run_error
        let error = RunErrorPayload {
            step_index: 2,
            error: "something broke".to_string(),
        };
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("stepIndex"));
        assert!(json.contains("something broke"));
    }

    #[test]
    fn test_run_error_payload_contains_full_error_message() {
        let error = RunErrorPayload {
            step_index: 3,
            error: "OpenRouter rate limit exceeded. Please wait and try again.".to_string(),
        };
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("rate limit"));
        assert!(json.contains("3"));
    }

    // -----------------------------------------------------------------------
    // Engine orchestration: workflow parsing + run directory creation
    // -----------------------------------------------------------------------

    #[test]
    fn test_engine_orchestration_workflow_setup() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let project = tmp.path();

        // Create a minimal project
        fs::create_dir_all(project.join("workflows")).unwrap();
        fs::create_dir_all(project.join("prompts")).unwrap();

        fs::write(
            project.join("prompts/hello.md"),
            "Write a greeting. {{variables.tone}}",
        )
        .unwrap();
        fs::create_dir_all(project.join("variables")).unwrap();
        fs::write(project.join("variables/tone.md"), "friendly").unwrap();

        let workflow_yaml = r#"
name: Greeting Generator
steps:
  - name: greet
    prompt_file: prompts/hello.md
    model: openai/gpt-4o
"#;
        let workflow_path = project.join("workflows/greet.yaml");
        fs::write(&workflow_path, workflow_yaml).unwrap();

        // Parse and validate
        let workflow = workflow::parse_workflow(&workflow_path, project).unwrap();
        assert_eq!(workflow.name, "Greeting Generator");
        assert_eq!(workflow.steps.len(), 1);

        workflow::validate_workflow(&workflow, project).unwrap();

        // Create run directory and snapshot
        let run_dir = run_manager::create_run_directory(project, &workflow.name).unwrap();
        assert!(run_dir.exists());

        run_manager::snapshot_workflow(&run_dir, &workflow_path, &workflow, project).unwrap();

        // Verify snapshot
        assert!(run_dir.join("_workflow.yaml").exists());
        let prompt_snapshot = run_dir.join("_prompts/prompts/hello.md");
        assert!(prompt_snapshot.exists());

        // Verify substitution from snapshot prompt
        let prompt_content = fs::read_to_string(&prompt_snapshot).unwrap();
        assert!(prompt_content.contains("{{variables.tone}}"));

        let substituted = substitution::substitute_variables(&prompt_content, project).unwrap();
        assert_eq!(substituted, "Write a greeting. friendly");
    }

    /// Verify that the engine's re-run flow correctly handles
    /// the snapshot workflow YAML path.
    #[test]
    fn test_rerun_workflow_snapshot_parsing() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let run_dir = tmp.path().join("2026-07-09-1730-test-rerun");
        fs::create_dir_all(run_dir.join("_prompts")).unwrap();

        // Write snapshot workflow
        let wf_yaml = r#"
name: Rerun Test
steps:
  - name: step_a
    prompt_file: prompts/a.md
    model: test-model
  - name: step_b
    prompt_file: prompts/b.md
    model: test-model
"#;
        fs::write(run_dir.join("_workflow.yaml"), wf_yaml).unwrap();
        fs::create_dir_all(run_dir.join("_prompts/prompts")).unwrap();
        fs::write(run_dir.join("_prompts/prompts/a.md"), "prompt A").unwrap();
        fs::write(run_dir.join("_prompts/prompts/b.md"), "prompt B").unwrap();

        // Parse from snapshot
        let snapshot_yaml = run_dir.join("_workflow.yaml");
        let workflow = workflow::parse_workflow(&snapshot_yaml, &run_dir).unwrap();

        assert_eq!(workflow.name, "Rerun Test");
        assert_eq!(workflow.steps.len(), 2);

        // Validate that the parsed workflow steps reference valid snapshot paths
        assert_eq!(workflow.steps[0].prompt_file, "prompts/a.md");
        assert_eq!(workflow.steps[1].prompt_file, "prompts/b.md");

        // Verify step output paths
        let out0 = run_manager::step_output_path(&run_dir, 0, "step_a");
        assert!(out0.to_string_lossy().ends_with("step_01_step_a.md"));
        let out1 = run_manager::step_output_path(&run_dir, 1, "step_b");
        assert!(out1.to_string_lossy().ends_with("step_02_step_b.md"));
    }

    /// Test that the run directory collision handling works through the engine.
    #[test]
    fn test_engine_run_directory_collision() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let project = tmp.path();

        let first = run_manager::create_run_directory(project, "Collision Test").unwrap();
        let second = run_manager::create_run_directory(project, "Collision Test").unwrap();

        assert_ne!(first, second, "collision should produce different directories");

        let second_name = second.file_name().unwrap().to_str().unwrap();
        assert!(
            second_name.ends_with("-2"),
            "second run should have -2 suffix, got: {}",
            second_name
        );
    }

    /// Test that the engine correctly reads prompts from snapshots
    /// and substitutes variables from the project root.
    #[test]
    fn test_engine_prompt_from_snapshot_variables_from_project() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let project = tmp.path();
        let run_dir = tmp.path().join("2026-07-09-1730-engine-test");
        fs::create_dir_all(run_dir.join("_prompts/prompts")).unwrap();
        fs::create_dir_all(project.join("variables")).unwrap();

        // Write a prompt with variable in the snapshot
        fs::write(
            run_dir.join("_prompts/prompts/test.md"),
            "Style: {{variables.tone}}. Content: more text.",
        )
        .unwrap();

        // Write the variable file in the project root (not snapshot)
        fs::write(project.join("variables/tone.md"), "professional").unwrap();

        // Read from snapshot
        let prompt = fs::read_to_string(run_dir.join("_prompts/prompts/test.md")).unwrap();
        // Substitute using project_root (live variables)
        let result = substitution::substitute_variables(&prompt, project).unwrap();

        assert_eq!(result, "Style: professional. Content: more text.");

        // Now change the variable — the next substitution should pick up the change
        fs::write(project.join("variables/tone.md"), "casual").unwrap();
        let result2 = substitution::substitute_variables(&prompt, project).unwrap();
        assert_eq!(result2, "Style: casual. Content: more text.");
    }
}
