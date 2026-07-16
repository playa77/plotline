// Version: 1.0.0 | 2026-07-09
// Run directory creation, workflow snapshots, step output file I/O, and
// run metadata management.
// See docs/technical_specification.md Section 8 for the interface contract.
//
// Public interface:
//   create_run_directory(project_root, workflow_name) -> Result<PathBuf>
//   snapshot_workflow(run_dir, workflow_path, workflow, project_root) -> Result<()>
//   step_output_path(run_dir, step_index, step_name) -> PathBuf
//   read_step_output(run_dir, step_index, step_name) -> Option<String>
//   write_step_output(run_dir, step_index, step_name, content) -> Result<()>
//   infer_run_status(run_dir, workflow) -> RunInfo
//   write_meta_json(run_dir, meta) -> Result<()>
//   read_meta_json(run_dir) -> Option<RunMeta>
//   update_meta_status(run_dir, status) -> Result<()>
//   list_run_files(run_dir) -> Result<Vec<RunFileEntry>>
//
// Design decisions:
//   - Step output paths are 1-indexed (step 0 produces step_01_<name>.md)
//   - Run directory naming: YYYY-MM-DD-HHMM-<slug>, with -2/-3 collision suffixes
//   - Slugify rules: lowercase, spaces→hyphens, strip non-[a-z0-9-], collapse
//     consecutive hyphens, strip leading/trailing, truncate to 50, fallback "unnamed"
//   - Workflow snapshots preserve subdirectory structure in _prompts/
//   - infer_run_status infers completion from file existence on disk
//   - _meta.json uses camelCase keys, stores run lifecycle state
//   - list_run_files skips hidden files and the _prompts/ directory entry itself

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::PlotlineError;
use crate::workflow::{RunInfo, RunStepStatus, StepStatus, Workflow};

// ---------------------------------------------------------------------------
// RunMeta — serialized to _meta.json for run lifecycle tracking
// ---------------------------------------------------------------------------

/// Metadata about a run, persisted as `_meta.json` inside the run directory.
/// Uses camelCase keys in the JSON file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunMeta {
    pub run_id: String,
    pub timestamp: String,
    pub workflow_name: String,
    pub status: String, // "running" | "completed" | "failed" | "cancelled"
    pub parent_run_id: Option<String>,
}

/// A single entry in a run directory listing, returned by list_run_files.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

// ---------------------------------------------------------------------------
// slugify — converts a workflow name into a filesystem-safe directory slug
// ---------------------------------------------------------------------------

/// Converts a workflow name into a sanitized slug for run directory naming.
///
/// Rules (applied in order):
/// 1. Lowercase.
/// 2. Replace spaces with hyphens.
/// 3. Remove all characters except `a-z`, `0-9`, `-`.
/// 4. Collapse consecutive hyphens into one.
/// 5. Strip leading and trailing hyphens.
/// 6. Truncate to 50 characters.
/// 7. If the result is empty, return `"unnamed"`.
fn slugify(name: &str) -> String {
    let mut slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c == ' ' { '-' } else { c })
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '-')
        .collect();

    // Collapse consecutive hyphens: iterate and build, skipping duplicates
    let mut collapsed = String::with_capacity(slug.len());
    let mut prev_dash = false;
    for ch in slug.chars() {
        if ch == '-' {
            if !prev_dash {
                collapsed.push(ch);
            }
            prev_dash = true;
        } else {
            collapsed.push(ch);
            prev_dash = false;
        }
    }

    // Strip leading and trailing hyphens
    slug = collapsed.trim_matches('-').to_string();

    // Truncate to 50 characters
    if slug.len() > 50 {
        slug.truncate(50);
        // Re-trim in case truncation left trailing hyphen
        slug = slug.trim_end_matches('-').to_string();
    }

    if slug.is_empty() {
        "unnamed".to_string()
    } else {
        slug
    }
}

// ---------------------------------------------------------------------------
// create_run_directory — timestamped run directory with collision handling
// ---------------------------------------------------------------------------

/// Creates a timestamped run directory under `<project_root>/runs/`.
///
/// Format: `YYYY-MM-DD-HHMM-<workflow_slug>`.
/// If the directory already exists, appends `-2`, `-3`, etc. until a unique
/// name is found.
///
/// Also creates the `_prompts/` subdirectory inside the run directory.
///
/// Returns the absolute path to the newly created run directory.
pub fn create_run_directory(
    project_root: &Path,
    workflow_name: &str,
) -> Result<PathBuf, PlotlineError> {
    let timestamp = chrono::Local::now().format("%Y-%m-%d-%H%M").to_string();
    let slug = slugify(workflow_name);
    let runs_dir = project_root.join("runs");

    // Ensure runs/ directory exists
    fs::create_dir_all(&runs_dir).map_err(|e| {
        PlotlineError::FilesystemError(format!(
            "Failed to create runs directory {}: {}",
            runs_dir.display(),
            e
        ))
    })?;

    // Build directory name with collision handling
    let base_name = format!("{}-{}", timestamp, slug);
    let mut dir_name = base_name.clone();
    let mut counter = 2;

    while runs_dir.join(&dir_name).exists() {
        dir_name = format!("{}-{}", base_name, counter);
        counter += 1;
    }

    let run_dir = runs_dir.join(&dir_name);
    fs::create_dir(&run_dir).map_err(|e| {
        PlotlineError::FilesystemError(format!(
            "Failed to create run directory {}: {}",
            run_dir.display(),
            e
        ))
    })?;

    // Create _prompts/ subdirectory
    let prompts_dir = run_dir.join("_prompts");
    fs::create_dir(&prompts_dir).map_err(|e| {
        PlotlineError::FilesystemError(format!(
            "Failed to create prompts snapshot directory {}: {}",
            prompts_dir.display(),
            e
        ))
    })?;

    Ok(run_dir)
}

// ---------------------------------------------------------------------------
// snapshot_workflow — copy workflow YAML and prompt files into run directory
// ---------------------------------------------------------------------------

/// Copies the workflow YAML file and all referenced prompt files into the
/// run directory under `_workflow.yaml` and `_prompts/` respectively.
///
/// Preserves subdirectory structure within `_prompts/` if a prompt_file path
/// contains subdirectories (e.g. `sub/folder/prompt.md` → `_prompts/sub/folder/prompt.md`).
pub fn snapshot_workflow(
    run_dir: &Path,
    workflow_path: &Path,
    workflow: &Workflow,
    project_root: &Path,
) -> Result<(), PlotlineError> {
    // Copy workflow YAML to _workflow.yaml
    let dest_yaml = run_dir.join("_workflow.yaml");
    fs::copy(workflow_path, &dest_yaml).map_err(|e| {
        PlotlineError::FilesystemError(format!(
            "Failed to copy workflow YAML from {} to {}: {}",
            workflow_path.display(),
            dest_yaml.display(),
            e
        ))
    })?;

    // Copy each referenced prompt file to _prompts/
    for step in &workflow.steps {
        let src = project_root.join(&step.prompt_file);
        // Preserve any subdirectory structure
        let rel_path = Path::new(&step.prompt_file);
        let dest = run_dir.join("_prompts").join(rel_path);

        // Create parent directories if needed (for subdirectories in prompt files)
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                PlotlineError::FilesystemError(format!(
                    "Failed to create snapshot subdirectory {}: {}",
                    parent.display(),
                    e
                ))
            })?;
        }

        fs::copy(&src, &dest).map_err(|e| {
            PlotlineError::FilesystemError(format!(
                "Failed to snapshot prompt file from {} to {}: {}",
                src.display(),
                dest.display(),
                e
            ))
        })?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// step_output_path — generate output filename for a step
// ---------------------------------------------------------------------------

/// Generates the output file path for a step.
///
/// Format: `step_01_<name>.md` (zero-padded to 2 digits, 1-indexed).
/// Example: step index 0, name "outline" → `step_01_outline.md`.
pub fn step_output_path(run_dir: &Path, step_index: usize, step_name: &str) -> PathBuf {
    run_dir.join(format!("step_{:02}_{}.md", step_index + 1, step_name))
}

// ---------------------------------------------------------------------------
// read_step_output — read a completed step's output file
// ---------------------------------------------------------------------------

/// Reads the output of a specific step from a run directory.
///
/// Returns `None` if the file does not exist (step not yet completed / pending).
/// Returns `Some(contents)` if the file exists.
pub fn read_step_output(
    run_dir: &Path,
    step_index: usize,
    step_name: &str,
) -> Option<String> {
    let path = step_output_path(run_dir, step_index, step_name);
    fs::read_to_string(&path).ok()
}

// ---------------------------------------------------------------------------
// write_step_output — write a step's output content to file
// ---------------------------------------------------------------------------

/// Writes output content to a step's output file.
///
/// Overwrites the file if it already exists (used during re-runs).
pub fn write_step_output(
    run_dir: &Path,
    step_index: usize,
    step_name: &str,
    content: &str,
) -> Result<(), PlotlineError> {
    let path = step_output_path(run_dir, step_index, step_name);
    fs::write(&path, content).map_err(|e| {
        PlotlineError::FilesystemError(format!(
            "Failed to write step output to {}: {}",
            path.display(),
            e
        ))
    })?;
    Ok(())
}

// ---------------------------------------------------------------------------
// infer_run_status — determine run completion state from filesystem
// ---------------------------------------------------------------------------

/// Infers the run status by checking which step output files exist on disk.
///
/// Parses `_workflow.yaml` from the run directory, then checks for each
/// step's output file. If the output file exists, the step is `Completed`;
/// otherwise, it is `Pending`.
///
/// The started_at timestamp is parsed from the directory name's
/// `YYYY-MM-DD-HHMM` prefix.
pub fn infer_run_status(run_dir: &Path, workflow: &Workflow) -> RunInfo {
    // Parse timestamp from directory name prefix (YYYY-MM-DD-HHMM)
    let dir_name = run_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");
    // Extract the first 15 characters which should be YYYY-MM-DD-HHMM
    let started_at = if dir_name.len() >= 15 {
        let prefix = &dir_name[..15];
        // Format as ISO 8601: YYYY-MM-DD-THH:MM:00
        // Input: "YYYY-MM-DD-HHMM" → Output: "YYYY-MM-DDTHH:MM:00"
        if prefix.len() == 15 {
            let date_part = &prefix[..10]; // YYYY-MM-DD
            let hour = &prefix[11..13];
            let minute = &prefix[13..15];
            format!("{}T{}:{}:00", date_part, hour, minute)
        } else {
            "unknown".to_string()
        }
    } else {
        "unknown".to_string()
    };

    let steps: Vec<RunStepStatus> = workflow
        .steps
        .iter()
        .enumerate()
        .map(|(index, step)| {
            let output_path = step_output_path(run_dir, index, &step.name);
            if output_path.exists() {
                RunStepStatus {
                    index,
                    name: step.name.clone(),
                    status: StepStatus::Completed,
                    output_path: Some(output_path),
                }
            } else {
                RunStepStatus {
                    index,
                    name: step.name.clone(),
                    status: StepStatus::Pending,
                    output_path: None,
                }
            }
        })
        .collect();

    RunInfo {
        run_dir: run_dir.to_path_buf(),
        workflow_name: workflow.name.clone(),
        started_at,
        steps,
    }
}

// ---------------------------------------------------------------------------
// write_meta_json — persist RunMeta to _meta.json inside the run directory
// ---------------------------------------------------------------------------

/// Writes a `_meta.json` file into the run directory with the given `RunMeta`.
/// Serializes with `serde_json::to_string_pretty`. Overwrites any existing file.
pub fn write_meta_json(run_dir: &Path, meta: &RunMeta) -> Result<(), PlotlineError> {
    let meta_path = run_dir.join("_meta.json");
    let json = serde_json::to_string_pretty(meta).map_err(|e| {
        PlotlineError::FilesystemError(format!("Failed to serialize _meta.json: {}", e))
    })?;
    fs::write(&meta_path, &json).map_err(|e| {
        PlotlineError::FilesystemError(format!("Failed to write _meta.json: {}", e))
    })?;
    Ok(())
}

// ---------------------------------------------------------------------------
// read_meta_json — read RunMeta from _meta.json
// ---------------------------------------------------------------------------

/// Reads `_meta.json` from a run directory.
/// Returns `None` if the file doesn't exist or can't be parsed.
pub fn read_meta_json(run_dir: &Path) -> Option<RunMeta> {
    let meta_path = run_dir.join("_meta.json");
    let content = fs::read_to_string(&meta_path).ok()?;
    serde_json::from_str(&content).ok()
}

// ---------------------------------------------------------------------------
// update_meta_status — read _meta.json, update status, write back
// ---------------------------------------------------------------------------

/// Reads the existing `_meta.json`, updates the `status` field, and writes it
/// back. If the file doesn't exist or can't be parsed, this is a no-op.
pub fn update_meta_status(run_dir: &Path, status: &str) -> Result<(), PlotlineError> {
    let meta_path = run_dir.join("_meta.json");
    let content = match fs::read_to_string(&meta_path) {
        Ok(c) => c,
        Err(_) => return Ok(()), // no-op if file doesn't exist
    };
    let mut meta: RunMeta = match serde_json::from_str(&content) {
        Ok(m) => m,
        Err(_) => return Ok(()), // no-op if can't parse
    };
    meta.status = status.to_string();
    let json = serde_json::to_string_pretty(&meta).map_err(|e| {
        PlotlineError::FilesystemError(format!("Failed to serialize updated _meta.json: {}", e))
    })?;
    fs::write(&meta_path, &json).map_err(|e| {
        PlotlineError::FilesystemError(format!("Failed to write updated _meta.json: {}", e))
    })?;
    Ok(())
}

// ---------------------------------------------------------------------------
// list_run_files — recursive listing of a run directory
// ---------------------------------------------------------------------------

/// Recursively lists all files and subdirectories inside a run directory.
///
/// Returns `Vec<RunFileEntry>` where:
/// - `name` is just the file/directory name
/// - `path` is the relative path from `run_dir` root
/// - `is_dir` indicates if the entry is a directory
/// - `size` is the file size in bytes (0 for directories)
///
/// Skips:
/// - Hidden files (names starting with `.`)
/// - The `_prompts/` directory itself (but includes all files within it)
///
/// Sorted with directories first, then files, alphabetically within each group.
pub fn list_run_files(run_dir: &Path) -> Result<Vec<RunFileEntry>, PlotlineError> {
    let mut entries = Vec::new();
    list_run_files_recursive(run_dir, run_dir, &mut entries).map_err(|e| {
        PlotlineError::FilesystemError(format!(
            "Failed to list run directory {}: {}",
            run_dir.display(),
            e
        ))
    })?;

    // Sort: directories first, then files; alphabetically within each group
    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            // `true > false` sorts directories before files when b.is_dir is true and a.is_dir is false
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(entries)
}

/// Recursive helper for list_run_files.
fn list_run_files_recursive(
    base: &Path,
    current: &Path,
    entries: &mut Vec<RunFileEntry>,
) -> std::io::Result<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();

        // Skip hidden files (starting with .)
        if name.starts_with('.') {
            continue;
        }

        // Compute relative path from the run_dir root
        let rel_path = path.strip_prefix(base).unwrap_or(&path);
        let rel_str = rel_path.to_string_lossy().to_string();

        if path.is_dir() {
            if name == "_prompts" {
                // Skip _prompts/ directory entry itself but recurse into it
                list_run_files_recursive(base, &path, entries)?;
            } else {
                entries.push(RunFileEntry {
                    name,
                    path: rel_str,
                    is_dir: true,
                    size: 0,
                });
                list_run_files_recursive(base, &path, entries)?;
            }
        } else {
            let metadata = entry.metadata()?;
            entries.push(RunFileEntry {
                name,
                path: rel_str,
                is_dir: false,
                size: metadata.len(),
            });
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow::Step;
    use std::fs;

    // -- slugify tests -------------------------------------------------------

    #[test]
    fn test_slugify_basic() {
        assert_eq!(slugify("Write Chapter"), "write-chapter");
    }

    #[test]
    fn test_slugify_special_chars() {
        assert_eq!(slugify("Chapter 1: The Beginning!"), "chapter-1-the-beginning");
    }

    #[test]
    fn test_slugify_empty() {
        assert_eq!(slugify(""), "unnamed");
        assert_eq!(slugify("   "), "unnamed");
        assert_eq!(slugify("!!!@#$%"), "unnamed");
    }

    #[test]
    fn test_slugify_truncation() {
        let long_name = "a".repeat(100);
        let result = slugify(&long_name);
        assert!(result.len() <= 50);
        // "a" repeated 100 times → "a"*50 after truncation
        assert_eq!(result, "a".repeat(50));
    }

    #[test]
    fn test_slugify_truncation_with_hyphen_end() {
        // Truncation at 50 that leaves a trailing hyphen should strip it
        // "a-" * 50 = 100 chars → after truncation to 50, might end with '-'
        let long_name = "a-".repeat(50);
        let result = slugify(&long_name);
        assert!(result.len() <= 50);
        assert!(!result.ends_with('-'), "trailing hyphen should be stripped: '{}'", result);
        assert!(!result.starts_with('-'), "leading hyphen should be stripped");
    }

    #[test]
    fn test_slugify_consecutive_hyphens() {
        assert_eq!(slugify("Chapter  1"), "chapter-1");
        assert_eq!(slugify("a   b   c"), "a-b-c");
    }

    #[test]
    fn test_slugify_leading_trailing_hyphens() {
        assert_eq!(slugify("-Chapter-"), "chapter");
        assert_eq!(slugify("--hello--world--"), "hello-world");
    }

    // -- create_run_directory tests ------------------------------------------

    #[test]
    fn test_create_run_directory() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let run_dir = create_run_directory(tmp.path(), "Write Chapter")
            .expect("create_run_directory should succeed");

        assert!(run_dir.exists(), "run directory should exist");
        assert!(run_dir.to_string_lossy().contains("runs/"), "should be under runs/");
        assert!(run_dir.to_string_lossy().contains("write-chapter"), "should contain slug");

        // _prompts/ subdirectory should exist
        let prompts_dir = run_dir.join("_prompts");
        assert!(prompts_dir.exists(), "_prompts/ subdirectory should exist");
        assert!(prompts_dir.is_dir(), "_prompts/ should be a directory");

        // Verify timestamp prefix format YYYY-MM-DD-HHMM
        let dir_name = run_dir.file_name().unwrap().to_str().unwrap();
        let prefix = &dir_name[..15];
        // Should match YYYY-MM-DD-HHMM pattern
        assert!(prefix.chars().nth(4) == Some('-'), "timestamp prefix should have date hyphens");
        assert!(prefix.chars().nth(7) == Some('-'), "timestamp prefix should have date hyphens");
        assert!(prefix.chars().nth(10) == Some('-'), "timestamp prefix should have separator hyphen");
        assert!(prefix[..4].parse::<u32>().is_ok(), "should start with year");
        assert!(prefix[5..7].parse::<u32>().is_ok(), "should have month");
        assert!(prefix[8..10].parse::<u32>().is_ok(), "should have day");
    }

    #[test]
    fn test_create_run_directory_collision() {
        let tmp = tempfile::tempdir().expect("tempdir");

        let first = create_run_directory(tmp.path(), "Test").expect("first should succeed");
        let second = create_run_directory(tmp.path(), "Test").expect("second should handle collision");

        assert_ne!(first, second, "collision should produce different directory names");

        let first_name = first.file_name().unwrap().to_str().unwrap();
        let second_name = second.file_name().unwrap().to_str().unwrap();

        assert!(
            second_name.ends_with("-2"),
            "second run should have -2 suffix, got: {}",
            second_name
        );

        // First should NOT have a collision suffix
        let base = first_name.strip_suffix("-test").unwrap_or(first_name);
        assert!(
            !base.ends_with("-2") && !base.ends_with("-3"),
            "first run should not have collision suffix: {}",
            first_name
        );
    }

    // -- snapshot_workflow tests ---------------------------------------------

    fn fixture_project_root() -> PathBuf {
        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        manifest_dir.join("tests/fixtures/project")
    }

    #[test]
    fn test_snapshot_workflow() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let run_dir = create_run_directory(tmp.path(), "test_workflow")
            .expect("create_run_directory should succeed");
        let project = fixture_project_root();
        let workflow_path = project.join("workflows/valid.yaml");

        let workflow = Workflow {
            name: "Test Workflow".into(),
            steps: vec![
                Step {
                    name: "step1".into(),
                    prompt_file: "prompts/step1.md".into(),
                    model: "test-model".into(),
                },
                Step {
                    name: "step2".into(),
                    prompt_file: "prompts/step2.md".into(),
                    model: "test-model".into(),
                },
            ],
        };

        snapshot_workflow(&run_dir, &workflow_path, &workflow, &project)
            .expect("snapshot_workflow should succeed");

        // _workflow.yaml should exist
        let yaml_dest = run_dir.join("_workflow.yaml");
        assert!(yaml_dest.exists(), "_workflow.yaml should exist");
        let yaml_content = fs::read_to_string(&yaml_dest).expect("should read _workflow.yaml");
        assert!(yaml_content.contains("Test Workflow"), "YAML content should match");

        // Prompt files should be copied
        let step1_dest = run_dir.join("_prompts/prompts/step1.md");
        let step2_dest = run_dir.join("_prompts/prompts/step2.md");
        assert!(step1_dest.exists(), "step1 prompt should be copied");
        assert!(step2_dest.exists(), "step2 prompt should be copied");

        let step1_content = fs::read_to_string(&step1_dest).expect("should read step1 prompt");
        let step2_content = fs::read_to_string(&step2_dest).expect("should read step2 prompt");
        assert!(!step1_content.is_empty(), "step1 prompt should have content");
        assert!(!step2_content.is_empty(), "step2 prompt should have content");
    }

    #[test]
    fn test_snapshot_workflow_preserves_subdirs() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let run_dir = create_run_directory(tmp.path(), "test_subdirs")
            .expect("create_run_directory should succeed");
        let project = fixture_project_root();

        // Create a prompt file in a subdirectory
        let prompts_sub = project.join("prompts/subdir");
        fs::create_dir_all(&prompts_sub).expect("should create subdir");
        fs::write(prompts_sub.join("nested.md"), "nested content").expect("should write nested file");

        let workflow_path = project.join("workflows/valid.yaml");
        let workflow = Workflow {
            name: "Subdir Test".into(),
            steps: vec![Step {
                name: "nested-step".into(),
                prompt_file: "prompts/subdir/nested.md".into(),
                model: "test-model".into(),
            }],
        };

        snapshot_workflow(&run_dir, &workflow_path, &workflow, &project)
            .expect("snapshot_workflow should succeed");

        let dest = run_dir.join("_prompts/prompts/subdir/nested.md");
        assert!(dest.exists(), "nested prompt should be copied with subdir structure");
        let content = fs::read_to_string(&dest).expect("should read nested prompt");
        assert_eq!(content, "nested content");

        // Cleanup
        let _ = fs::remove_dir_all(project.join("prompts/subdir"));
    }

    // -- step_output_path tests ----------------------------------------------

    #[test]
    fn test_step_output_path() {
        let run_dir = Path::new("/tmp/test-run");
        let path = step_output_path(run_dir, 0, "outline");
        assert_eq!(
            path.to_str().unwrap(),
            "/tmp/test-run/step_01_outline.md"
        );

        let path2 = step_output_path(run_dir, 9, "final");
        assert_eq!(
            path2.to_str().unwrap(),
            "/tmp/test-run/step_10_final.md"
        );

        let path3 = step_output_path(run_dir, 99, "review");
        assert_eq!(
            path3.to_str().unwrap(),
            "/tmp/test-run/step_100_review.md"
        );
    }

    // -- read_step_output / write_step_output tests --------------------------

    #[test]
    fn test_read_step_output_exists() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let run_dir = tmp.path();
        let content = "This is the output of step one.";
        write_step_output(run_dir, 0, "outline", content)
            .expect("write_step_output should succeed");

        let read = read_step_output(run_dir, 0, "outline");
        assert!(read.is_some(), "should return Some when file exists");
        assert_eq!(read.unwrap(), content);
    }

    #[test]
    fn test_read_step_output_missing() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let read = read_step_output(tmp.path(), 0, "missing_step");
        assert!(read.is_none(), "should return None when file doesn't exist");
    }

    #[test]
    fn test_write_step_output() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let content = "Output content for testing.";
        write_step_output(tmp.path(), 2, "draft", content)
            .expect("write_step_output should succeed");

        let path = step_output_path(tmp.path(), 2, "draft");
        assert!(path.exists(), "output file should be created");

        let written = fs::read_to_string(&path).expect("should read written file");
        assert_eq!(written, content);
    }

    #[test]
    fn test_write_step_output_overwrite() {
        let tmp = tempfile::tempdir().expect("tempdir");
        write_step_output(tmp.path(), 1, "edit", "original content")
            .expect("first write should succeed");
        write_step_output(tmp.path(), 1, "edit", "overwritten content")
            .expect("second write should succeed");

        let read = read_step_output(tmp.path(), 1, "edit");
        assert_eq!(read.unwrap(), "overwritten content");
    }

    // -- infer_run_status tests ----------------------------------------------

    #[test]
    fn test_infer_run_status_all_complete() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let run_dir = tmp.path().join("2026-07-09-1730-test-workflow");
        fs::create_dir_all(run_dir.join("_prompts")).expect("create _prompts");
        fs::write(run_dir.join("_workflow.yaml"), "name: Test Workflow\nsteps:\n  - name: step1\n    prompt_file: p1.md\n    model: m\n  - name: step2\n    prompt_file: p2.md\n    model: m\n").expect("write _workflow.yaml");

        // Create both output files
        write_step_output(&run_dir, 0, "step1", "output 1").unwrap();
        write_step_output(&run_dir, 1, "step2", "output 2").unwrap();

        let workflow = Workflow {
            name: "Test Workflow".into(),
            steps: vec![
                Step { name: "step1".into(), prompt_file: "p1.md".into(), model: "m".into() },
                Step { name: "step2".into(), prompt_file: "p2.md".into(), model: "m".into() },
            ],
        };

        let info = infer_run_status(&run_dir, &workflow);
        assert_eq!(info.workflow_name, "Test Workflow");
        assert_eq!(info.steps.len(), 2);
        assert!(matches!(info.steps[0].status, StepStatus::Completed));
        assert!(info.steps[0].output_path.is_some());
        assert!(matches!(info.steps[1].status, StepStatus::Completed));
        assert!(info.steps[1].output_path.is_some());
        assert_eq!(info.started_at, "2026-07-09T17:30:00");
    }

    #[test]
    fn test_infer_run_status_partial() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let run_dir = tmp.path().join("2026-07-09-1731-partial");
        fs::create_dir_all(run_dir.join("_prompts")).expect("create _prompts");
        fs::write(run_dir.join("_workflow.yaml"), "name: Partial\nsteps:\n  - name: s1\n    prompt_file: p1.md\n    model: m\n  - name: s2\n    prompt_file: p2.md\n    model: m\n  - name: s3\n    prompt_file: p3.md\n    model: m\n").expect("write _workflow.yaml");

        // Only write step 1 output
        write_step_output(&run_dir, 0, "s1", "output 1").unwrap();

        let workflow = Workflow {
            name: "Partial".into(),
            steps: vec![
                Step { name: "s1".into(), prompt_file: "p1.md".into(), model: "m".into() },
                Step { name: "s2".into(), prompt_file: "p2.md".into(), model: "m".into() },
                Step { name: "s3".into(), prompt_file: "p3.md".into(), model: "m".into() },
            ],
        };

        let info = infer_run_status(&run_dir, &workflow);
        assert_eq!(info.steps.len(), 3);
        assert!(matches!(info.steps[0].status, StepStatus::Completed));
        assert!(matches!(info.steps[1].status, StepStatus::Pending));
        assert!(matches!(info.steps[2].status, StepStatus::Pending));
        assert!(info.steps[0].output_path.is_some());
        assert!(info.steps[1].output_path.is_none());
        assert!(info.steps[2].output_path.is_none());
    }

    #[test]
    fn test_infer_run_status_all_pending() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let run_dir = tmp.path().join("2026-07-09-1732-pending");
        fs::create_dir_all(run_dir.join("_prompts")).expect("create _prompts");
        fs::write(run_dir.join("_workflow.yaml"), "name: All Pending\nsteps:\n  - name: stepA\n    prompt_file: pa.md\n    model: m\n  - name: stepB\n    prompt_file: pb.md\n    model: m\n").expect("write _workflow.yaml");

        // Write NO output files

        let workflow = Workflow {
            name: "All Pending".into(),
            steps: vec![
                Step { name: "stepA".into(), prompt_file: "pa.md".into(), model: "m".into() },
                Step { name: "stepB".into(), prompt_file: "pb.md".into(), model: "m".into() },
            ],
        };

        let info = infer_run_status(&run_dir, &workflow);
        assert_eq!(info.steps.len(), 2);
        assert!(matches!(info.steps[0].status, StepStatus::Pending));
        assert!(matches!(info.steps[1].status, StepStatus::Pending));
        assert!(info.steps[0].output_path.is_none());
        assert!(info.steps[1].output_path.is_none());
    }
}
