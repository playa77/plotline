// Version: 1.0.0 | 2026-07-09
// Workflow YAML parsing and validation.
// See docs/technical_specification.md Section 5 for type definitions.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use std::path::PathBuf;

use crate::error::PlotlineError;

/// Represents a parsed workflow definition from a YAML file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub name: String,
    pub steps: Vec<Step>,
}

/// A single step within a workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Step {
    pub name: String,
    /// Relative path from project root to the prompt file.
    pub prompt_file: String,
    /// OpenRouter model identifier.
    pub model: String,
}

/// A fully resolved step with absolute paths and loaded content.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedStep {
    pub index: usize,
    pub name: String,
    /// Absolute path to the prompt file.
    pub prompt_file: PathBuf,
    pub model: String,
    /// Loaded + substituted prompt text.
    pub prompt_content: String,
}

/// Information about a run, inferred from the filesystem.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunInfo {
    pub run_dir: PathBuf,
    pub workflow_name: String,
    /// ISO 8601 timestamp.
    pub started_at: String,
    pub steps: Vec<RunStepStatus>,
}

/// The execution status of a single step.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StepStatus {
    Pending,
    Running,
    Completed,
    Error,
}

/// Status information for a single step within a run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunStepStatus {
    pub index: usize,
    pub name: String,
    pub status: StepStatus,
    pub output_path: Option<PathBuf>,
}

/// Lightweight summary of a workflow file, returned by list_workflows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowSummary {
    pub name: String,
    pub file_path: String,
    pub step_count: usize,
}

/// Lightweight summary of a run directory, returned by list_runs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunSummary {
    pub run_dir: String,
    pub workflow_name: String,
    pub started_at: String,
    pub completed_steps: usize,
    pub total_steps: usize,
    pub status: String,
    pub parent_run_id: Option<String>,
}

/// Parses a workflow YAML file from the given path.
/// Validates that all required fields are present.
pub fn parse_workflow(
    workflow_path: &Path,
    _project_root: &Path,
) -> Result<Workflow, PlotlineError> {
    // Read file at workflow_path.
    let content = std::fs::read_to_string(workflow_path).map_err(|_| {
        PlotlineError::WorkflowNotFound(workflow_path.display().to_string())
    })?;

    // Deserialize as YAML into Workflow struct.
    let workflow: Workflow = serde_yaml::from_str(&content)?;

    Ok(workflow)
}

/// Validates that a workflow definition is correct and all referenced files exist.
pub fn validate_workflow(
    workflow: &Workflow,
    project_root: &Path,
) -> Result<(), PlotlineError> {
    // - `name` is non-empty.
    if workflow.name.is_empty() || workflow.name.trim().is_empty() {
        return Err(PlotlineError::WorkflowValidationError(
            "workflow name is empty".to_string(),
        ));
    }

    // - `steps` is non-empty.
    if workflow.steps.is_empty() {
        return Err(PlotlineError::WorkflowValidationError(
            "steps array is empty".to_string(),
        ));
    }

    let re = regex::Regex::new(r"^[a-zA-Z0-9_-]+$").unwrap();
    let mut seen_names = HashSet::new();

    for step in &workflow.steps {
        // - Each step `name` is non-empty.
        if step.name.is_empty() {
            return Err(PlotlineError::WorkflowValidationError(
                "step name is empty".to_string(),
            ));
        }

        // - Each step `name` is unique within the workflow.
        if !seen_names.insert(step.name.clone()) {
            return Err(PlotlineError::WorkflowValidationError(format!(
                "duplicate step name: {}",
                step.name
            )));
        }

        // - Each step `name` matches regex `^[a-zA-Z0-9_-]+$`.
        if !re.is_match(&step.name) {
            return Err(PlotlineError::WorkflowValidationError(format!(
                "invalid step name: {} (must match [a-zA-Z0-9_-]+)",
                step.name
            )));
        }

        // - Each `prompt_file` is non-empty.
        if step.prompt_file.is_empty() {
            return Err(PlotlineError::WorkflowValidationError(
                "prompt file is empty".to_string(),
            ));
        }

        // - Each `prompt_file` resolves to an existing file within `project_root`.
        //   Resolve relative to project_root: reject path traversal (any `..` components).
        // Check for path traversal: look for ".." as a path component
        for component in step.prompt_file.split(&['/', '\\', std::path::MAIN_SEPARATOR][..]) {
            if component == ".." {
                return Err(PlotlineError::WorkflowValidationError(format!(
                    "prompt file path contains disallowed '..' component: {}",
                    step.prompt_file
                )));
            }
        }
        // Also check for any ".." substring as a simple heuristic for edge cases
        if step.prompt_file.contains("..") {
            return Err(PlotlineError::WorkflowValidationError(format!(
                "prompt file path contains disallowed '..' component: {}",
                step.prompt_file
            )));
        }

        let prompt_path = project_root.join(&step.prompt_file);
        if !prompt_path.exists() {
            return Err(PlotlineError::WorkflowValidationError(format!(
                "prompt file not found: {}",
                prompt_path.display()
            )));
        }

        // - Each `model` is non-empty.
        if step.model.is_empty() {
            return Err(PlotlineError::WorkflowValidationError(
                "model identifier is empty".to_string(),
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_path(relative: &str) -> std::path::PathBuf {
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        manifest_dir
            .join("tests/fixtures/project")
            .join(relative)
    }

    fn project_root() -> std::path::PathBuf {
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        manifest_dir.join("tests/fixtures/project")
    }

    #[test]
    fn test_parse_valid_workflow() {
        let path = fixture_path("workflows/valid.yaml");
        let project = project_root();
        let workflow = parse_workflow(&path, &project).expect("Expected Ok");
        assert_eq!(workflow.name, "Test Workflow");
        assert_eq!(workflow.steps.len(), 2);
        assert_eq!(workflow.steps[0].name, "step1");
        assert_eq!(workflow.steps[1].name, "step2");
    }

    #[test]
    fn test_parse_missing_file() {
        let path = fixture_path("workflows/nonexistent.yaml");
        let project = project_root();
        let err = parse_workflow(&path, &project).unwrap_err();
        assert!(matches!(err, PlotlineError::WorkflowNotFound(_)));
        assert!(err.to_string().contains("nonexistent.yaml"));
    }

    #[test]
    fn test_parse_invalid_yaml() {
        let path = fixture_path("workflows/invalid.yaml");
        let project = project_root();
        let err = parse_workflow(&path, &project).unwrap_err();
        assert!(matches!(err, PlotlineError::WorkflowParseError(_)));
    }

    #[test]
    fn test_validate_empty_name() {
        let path = fixture_path("workflows/empty_name.yaml");
        let project = project_root();
        let workflow = parse_workflow(&path, &project).expect("Expected parse Ok");
        let err = validate_workflow(&workflow, &project).unwrap_err();
        assert!(matches!(err, PlotlineError::WorkflowValidationError(_)));
        assert!(err.to_string().contains("workflow name is empty"));
    }

    #[test]
    fn test_validate_empty_steps() {
        let path = fixture_path("workflows/empty_steps.yaml");
        let project = project_root();
        let workflow = parse_workflow(&path, &project).expect("Expected parse Ok");
        let err = validate_workflow(&workflow, &project).unwrap_err();
        assert!(matches!(err, PlotlineError::WorkflowValidationError(_)));
        assert!(err.to_string().contains("steps array is empty"));
    }

    #[test]
    fn test_validate_empty_step_name() {
        let path = fixture_path("workflows/empty_step_name.yaml");
        let project = project_root();
        let workflow = parse_workflow(&path, &project).expect("Expected parse Ok");
        let err = validate_workflow(&workflow, &project).unwrap_err();
        assert!(matches!(err, PlotlineError::WorkflowValidationError(_)));
        assert!(err.to_string().contains("step name is empty"));
    }

    #[test]
    fn test_validate_duplicate_names() {
        let path = fixture_path("workflows/duplicate_names.yaml");
        let project = project_root();
        let workflow = parse_workflow(&path, &project).expect("Expected parse Ok");
        let err = validate_workflow(&workflow, &project).unwrap_err();
        assert!(matches!(err, PlotlineError::WorkflowValidationError(_)));
        assert!(err.to_string().contains("duplicate step name"));
        assert!(err.to_string().contains("outline"));
    }

    #[test]
    fn test_validate_invalid_step_name() {
        let path = fixture_path("workflows/invalid_step_name.yaml");
        let project = project_root();
        let workflow = parse_workflow(&path, &project).expect("Expected parse Ok");
        let err = validate_workflow(&workflow, &project).unwrap_err();
        assert!(matches!(err, PlotlineError::WorkflowValidationError(_)));
        assert!(err.to_string().contains("invalid step name"));
        assert!(err.to_string().contains("step one"));
    }

    #[test]
    fn test_validate_missing_prompt_file() {
        let path = fixture_path("workflows/missing_prompt.yaml");
        let project = project_root();
        let workflow = parse_workflow(&path, &project).expect("Expected parse Ok");
        let err = validate_workflow(&workflow, &project).unwrap_err();
        assert!(matches!(err, PlotlineError::WorkflowValidationError(_)));
        assert!(err.to_string().contains("prompt file not found"));
        assert!(err.to_string().contains("nonexistent.md"));
    }

    #[test]
    fn test_validate_path_traversal() {
        let path = fixture_path("workflows/path_traversal.yaml");
        let project = project_root();
        let workflow = parse_workflow(&path, &project).expect("Expected parse Ok");
        let err = validate_workflow(&workflow, &project).unwrap_err();
        assert!(matches!(err, PlotlineError::WorkflowValidationError(_)));
        assert!(err.to_string().contains("disallowed '..' component"));
    }

    #[test]
    fn test_validate_empty_prompt_file() {
        let path = fixture_path("workflows/empty_prompt_file.yaml");
        let project = project_root();
        let workflow = parse_workflow(&path, &project).expect("Expected parse Ok");
        let err = validate_workflow(&workflow, &project).unwrap_err();
        assert!(matches!(err, PlotlineError::WorkflowValidationError(_)));
        assert!(err.to_string().contains("prompt file is empty"));
    }

    #[test]
    fn test_validate_empty_model() {
        let path = fixture_path("workflows/empty_model.yaml");
        let project = project_root();
        let workflow = parse_workflow(&path, &project).expect("Expected parse Ok");
        let err = validate_workflow(&workflow, &project).unwrap_err();
        assert!(matches!(err, PlotlineError::WorkflowValidationError(_)));
        assert!(err.to_string().contains("model identifier is empty"));
    }

    #[test]
    fn test_validate_valid_workflow_passes() {
        let path = fixture_path("workflows/valid.yaml");
        let project = project_root();
        let workflow = parse_workflow(&path, &project).expect("Expected parse Ok");
        let result = validate_workflow(&workflow, &project);
        assert!(result.is_ok());
    }
}
