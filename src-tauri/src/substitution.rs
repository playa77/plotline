// Version: 1.0.0 | 2026-07-09
// Variable substitution: replaces {{variables.<name>}} in prompt text with file contents.
// See docs/technical_specification.md Section 8 for the substitution logic.
// Regex: \{\{variables\.([a-zA-Z0-9_-]+)\}\}
// Files are read from <project_root>/variables/<name>.md

use regex::Regex;
use std::collections::HashMap;
use std::path::Path;
use std::sync::LazyLock;

use crate::error::PlotlineError;

/// Compiled regex matching {{variables.<name>}} with alphanumeric, hyphens, and underscores.
static VARIABLE_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{\{variables\.([a-zA-Z0-9_-]+)\}\}").expect("variable regex must compile")
});

/// Scans prompt_content for {{variables.<name>}} patterns.
/// For each match, checks variable_overrides first, then falls back
/// to reading <project_root>/variables/<name>.md.
/// Replaces the placeholder with the resolved value.
///
/// Returns error if a referenced variable file does not exist and no
/// override was provided. Unknown {{...}} patterns (not matching
/// `variables.` prefix) are left untouched.
pub fn substitute_variables(
    prompt_content: &str,
    project_root: &Path,
    variable_overrides: &HashMap<String, String>,
) -> Result<String, PlotlineError> {
    let mut result = String::with_capacity(prompt_content.len());
    let mut last_end = 0;

    for captures in VARIABLE_REGEX.captures_iter(prompt_content) {
        let full_match = captures.get(0).expect("match 0 must exist");
        let var_name = captures.get(1).expect("capture group 1 must exist");
        let var_str = var_name.as_str();

        // Copy text between matches unchanged
        result.push_str(&prompt_content[last_end..full_match.start()]);

        // Check overrides first, then fall back to file
        let content = if let Some(override_val) = variable_overrides.get(var_str) {
            override_val.clone()
        } else {
            let var_path = project_root
                .join("variables")
                .join(format!("{}.md", var_str));

            std::fs::read_to_string(&var_path).map_err(|_| {
                PlotlineError::VariableFileNotFound {
                    path: var_path.display().to_string(),
                }
            })?
        };

        result.push_str(&content);
        last_end = full_match.end();
    }

    // Copy remaining text after last match
    result.push_str(&prompt_content[last_end..]);

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project_root() -> std::path::PathBuf {
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        manifest_dir.join("tests/fixtures/project")
    }

    fn read_var(name: &str) -> String {
        let path = project_root().join("variables").join(format!("{}.md", name));
        std::fs::read_to_string(&path).expect("fixture variable file should exist")
    }

    #[test]
    fn test_single_substitution() {
        let input = "Write a story. Use this style: {{variables.style}}";
        let result = substitute_variables(input, &project_root(), &HashMap::new()).expect("substitution should succeed");
        let expected_style = read_var("style");
        assert_eq!(
            result,
            format!("Write a story. Use this style: {}", expected_style)
        );
        // Ensure the variable content was actually inserted (not just empty string)
        assert!(result.contains("dark, brooding tone"));
        // The placeholder should be gone
        assert!(!result.contains("{{variables.style}}"));
    }

    #[test]
    fn test_multiple_substitutions() {
        let input = "Style: {{variables.style}}\nProtagonist: {{variables.protagonist}}";
        let result = substitute_variables(input, &project_root(), &HashMap::new()).expect("substitution should succeed");
        let expected_style = read_var("style");
        let expected_protagonist = read_var("protagonist");
        assert_eq!(
            result,
            format!(
                "Style: {}\nProtagonist: {}",
                expected_style, expected_protagonist
            )
        );
        assert!(result.contains("dark, brooding tone"));
        assert!(result.contains("John Doe"));
        assert!(!result.contains("{{variables."));
    }

    #[test]
    fn test_same_variable_twice() {
        let input = "Before: {{variables.style}}. After: {{variables.style}}.";
        let result = substitute_variables(input, &project_root(), &HashMap::new()).expect("substitution should succeed");
        let expected_style = read_var("style");
        assert_eq!(
            result,
            format!("Before: {}. After: {}.", expected_style, expected_style)
        );
        // Count occurrences of the variable content
        let occurrences = result.matches("dark, brooding tone").count();
        assert_eq!(occurrences, 2, "variable should be substituted twice");
        assert!(!result.contains("{{variables.style}}"));
    }

    #[test]
    fn test_no_variables() {
        let input = "This prompt has no variable references at all.";
        let result = substitute_variables(input, &project_root(), &HashMap::new()).expect("substitution should succeed");
        assert_eq!(result, input);
    }

    #[test]
    fn test_unknown_placeholder_ignored() {
        let input = "Here is {{unknown.thing}} and {{variables.style}} and {{other.place}}";
        let result = substitute_variables(input, &project_root(), &HashMap::new()).expect("substitution should succeed");
        let expected_style = read_var("style");
        assert_eq!(
            result,
            format!(
                "Here is {{{{unknown.thing}}}} and {} and {{{{other.place}}}}",
                expected_style
            )
        );
        // Non-variable placeholders must remain untouched
        assert!(result.contains("{{unknown.thing}}"));
        assert!(result.contains("{{other.place}}"));
        assert!(!result.contains("{{variables.style}}"));
    }

    #[test]
    fn test_missing_variable_file() {
        let input = "Style: {{variables.nonexistent_var}}";
        let result = substitute_variables(input, &project_root(), &HashMap::new());
        assert!(result.is_err(), "Expected error for missing variable file");
        let err = result.unwrap_err();
        match err {
            PlotlineError::VariableFileNotFound { path } => {
                assert!(
                    path.contains("nonexistent_var.md"),
                    "Error path should contain the variable name. Got: {}",
                    path
                );
                assert!(
                    path.contains("variables"),
                    "Error path should contain variables subdirectory. Got: {}",
                    path
                );
            }
            other => panic!("Expected VariableFileNotFound, got: {:?}", other),
        }
    }

    #[test]
    fn test_variable_with_special_chars_in_name() {
        let input = "Var: {{variables.my-var_name}}";
        let result =
            substitute_variables(input, &project_root(), &HashMap::new()).expect("substitution should succeed");
        assert!(result.contains("Test variable with hyphens and underscores"));
        assert!(!result.contains("{{variables.my-var_name}}"));
    }

    #[test]
    fn test_mixed_placeholders() {
        let input = "A: {{variables.style}} B: {{not.variable}} C: {{variables.protagonist}} D: {{other}}";
        let result = substitute_variables(input, &project_root(), &HashMap::new()).expect("substitution should succeed");
        let expected_style = read_var("style");
        let expected_protagonist = read_var("protagonist");
        assert_eq!(
            result,
            format!(
                "A: {} B: {{{{not.variable}}}} C: {} D: {{{{other}}}}",
                expected_style, expected_protagonist
            )
        );
        assert!(result.contains("dark, brooding tone"));
        assert!(result.contains("John Doe"));
        assert!(result.contains("{{not.variable}}"));
        assert!(result.contains("{{other}}"));
    }

    #[test]
    fn test_empty_prompt() {
        let input = "";
        let result = substitute_variables(input, &project_root(), &HashMap::new()).expect("substitution should succeed");
        assert_eq!(result, "");
    }

    #[test]
    fn test_only_variable() {
        // Entire prompt is just a variable
        let input = "{{variables.style}}";
        let result = substitute_variables(input, &project_root(), &HashMap::new()).expect("substitution should succeed");
        let expected_style = read_var("style");
        assert_eq!(result, expected_style);
        assert!(!result.contains("{{"));
    }

    #[test]
    fn test_adjacent_variables() {
        let input = "{{variables.style}}{{variables.protagonist}}";
        let result = substitute_variables(input, &project_root(), &HashMap::new()).expect("substitution should succeed");
        let expected_style = read_var("style");
        let expected_protagonist = read_var("protagonist");
        assert_eq!(result, format!("{}{}", expected_style, expected_protagonist));
        assert!(result.contains("dark, brooding tone"));
        assert!(result.contains("John Doe"));
        assert!(!result.contains("{{variables."));
    }
}
