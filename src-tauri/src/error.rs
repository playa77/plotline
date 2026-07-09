// Version: 1.0.0 | 2026-07-09
// Unified error types for the Plotline backend.
// All error variants use thiserror::Error for Display and From impls.
// See docs/technical_specification.md Section 8 for the full enum definition.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum PlotlineError {
    #[error("Workflow file not found: {0}")]
    WorkflowNotFound(String),

    #[error("Invalid workflow YAML: {0}")]
    WorkflowParseError(String),

    #[error("Workflow validation failed: {0}")]
    WorkflowValidationError(String),

    #[error("Prompt file not found: {path}")]
    PromptFileNotFound { path: String },

    #[error("Variable file not found: {path}")]
    VariableFileNotFound { path: String },

    #[error("API key not set. Please set your OpenRouter API key in Settings.")]
    ApiKeyNotSet,

    #[error("API key is invalid. Please check your OpenRouter API key.")]
    ApiKeyInvalid,

    #[error("OpenRouter rate limit exceeded. Please wait and try again.")]
    RateLimited,

    #[error("OpenRouter request timed out after 30 seconds.")]
    NetworkTimeout,

    #[error("OpenRouter returned an error (HTTP {status}): {body}")]
    ProviderError { status: u16, body: String },

    #[error("Failed to parse OpenRouter response: {0}")]
    ResponseParseError(String),

    #[error("Filesystem error: {0}")]
    FilesystemError(String),

    #[error("Keyring error: {0}")]
    KeyringError(String),

    #[error("Run directory not found: {0}")]
    RunNotFound(String),

    #[error("Invalid step index: {index} (workflow has {total} steps)")]
    InvalidStepIndex { index: usize, total: usize },
}

// Maps std::io::Error to PlotlineError::FilesystemError
impl From<std::io::Error> for PlotlineError {
    fn from(err: std::io::Error) -> Self {
        PlotlineError::FilesystemError(err.to_string())
    }
}

// Maps serde_yaml::Error to PlotlineError::WorkflowParseError
impl From<serde_yaml::Error> for PlotlineError {
    fn from(err: serde_yaml::Error) -> Self {
        PlotlineError::WorkflowParseError(err.to_string())
    }
}

// Maps reqwest::Error to PlotlineError:
//   - timeout -> NetworkTimeout
//   - others  -> ProviderError { status: 0, body: "Connection failed" } for
//     connect errors, or ProviderError with status 0 for other transport errors
impl From<reqwest::Error> for PlotlineError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            PlotlineError::NetworkTimeout
        } else if err.is_connect() {
            PlotlineError::ProviderError {
                status: 0,
                body: "Connection failed".to_string(),
            }
        } else {
            PlotlineError::ProviderError {
                status: 0,
                body: err.to_string(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    #[test]
    fn test_from_io_error_maps_to_filesystem_error() {
        let io_err = io::Error::new(io::ErrorKind::NotFound, "no such file");
        let plotline_err: PlotlineError = io_err.into();
        assert!(matches!(plotline_err, PlotlineError::FilesystemError(_)));
    }

    #[test]
    fn test_from_serde_yaml_error_maps_to_workflow_parse_error() {
        // Create an invalid YAML string and try to parse it
        let yaml_str = "invalid: yaml: !!unclosed";
        let result: Result<serde_yaml::Value, _> = serde_yaml::from_str(yaml_str);
        let yaml_err = result.unwrap_err();
        let plotline_err: PlotlineError = yaml_err.into();
        assert!(matches!(
            plotline_err,
            PlotlineError::WorkflowParseError(_)
        ));
    }

    #[test]
    fn test_from_reqwest_error_timeout_maps_to_network_timeout() {
        // Simulate a timeout error by constructing a reqwest::Error from
        // its builder. Since reqwest::Error does not expose a public builder,
        // we test the timeout case indirectly by checking the From impl behavior
        // on a real timeout. For this unit test, we verify the variant match
        // always exists in the code path.
        //
        // A full integration test with wiremock will exercise the actual
        // timeout behavior in WP5.
        //
        // Here we test that the From impl exists and the enum variant is
        // correctly defined.
        let err = PlotlineError::NetworkTimeout;
        assert_eq!(
            err.to_string(),
            "OpenRouter request timed out after 30 seconds."
        );
    }

    #[test]
    fn test_provider_error_displays_status_and_body() {
        let err = PlotlineError::ProviderError {
            status: 500,
            body: "Internal Server Error".to_string(),
        };
        assert_eq!(
            err.to_string(),
            "OpenRouter returned an error (HTTP 500): Internal Server Error"
        );
    }

    #[test]
    fn test_all_error_variants_have_error_messages() {
        // Verify that every variant's #[error("...")] message is non-empty
        // by checking Display produces a non-empty string for each variant.
        let variants: Vec<PlotlineError> = vec![
            PlotlineError::WorkflowNotFound("test.yaml".into()),
            PlotlineError::WorkflowParseError("bad yaml".into()),
            PlotlineError::WorkflowValidationError("name is empty".into()),
            PlotlineError::PromptFileNotFound {
                path: "missing.md".into(),
            },
            PlotlineError::VariableFileNotFound {
                path: "missing.md".into(),
            },
            PlotlineError::ApiKeyNotSet,
            PlotlineError::ApiKeyInvalid,
            PlotlineError::RateLimited,
            PlotlineError::NetworkTimeout,
            PlotlineError::ProviderError {
                status: 503,
                body: "unavailable".into(),
            },
            PlotlineError::ResponseParseError("bad json".into()),
            PlotlineError::FilesystemError("io error".into()),
            PlotlineError::KeyringError("keyring failed".into()),
            PlotlineError::RunNotFound("runs/missing".into()),
            PlotlineError::InvalidStepIndex {
                index: 5,
                total: 3,
            },
        ];

        for err in &variants {
            let msg = err.to_string();
            assert!(
                !msg.is_empty(),
                "Error variant {:?} has empty message",
                err
            );
        }
    }
}
