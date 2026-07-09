// Version: 1.0.0 | 2026-07-09
// Workflow YAML parsing and validation.
// See docs/technical_specification.md Section 5 for type definitions.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

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
