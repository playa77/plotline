// Version: 1.0.0 | 2026-07-09
// HTTP client for OpenRouter API.
// Sends non-streaming completion requests with required headers.
// See docs/technical_specification.md Section 6 for API specification.
//
// All requests include:
//   - Authorization: Bearer <api_key>
//   - Content-Type: application/json
//   - HTTP-Referer: https://plotline.app
//   - X-Title: Plotline
//
// Uses a 30-second timeout. Non-streaming only.

use crate::error::PlotlineError;
use chrono::Local;
use serde::Serialize;

/// Request payload for an OpenRouter completion call.
/// The `prompt` field holds the full message text (with variables
/// substituted and previous step output already concatenated by the engine).
#[derive(Debug, Clone)]
pub struct CompletionRequest {
    pub model: String,
    pub prompt: String,
    pub api_key: String,
}

/// Parsed response from a successful OpenRouter completion.
/// Token counts are captured (for future cost tracking) but discarded by the
/// engine for MVP.
#[derive(Debug, Clone)]
pub struct CompletionResponse {
    pub content: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

// ---- Serde helper structs for JSON serialization/deserialization ----

#[derive(Serialize)]
struct OpenRouterRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

impl OpenRouterRequest {
    fn new(model: String, prompt: String) -> Self {
        Self {
            model,
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt,
            }],
            stream: false,
        }
    }
}

/// Sends a non-streaming completion request to the OpenRouter API.
///
/// # Timeout
/// 30 seconds. Exceeded timeouts map to `PlotlineError::NetworkTimeout`.
///
/// # Error mapping
/// | HTTP Status | Error Variant                     |
/// |-------------|-----------------------------------|
/// | 200         | Parsed `CompletionResponse`       |
/// | 401         | `ApiKeyInvalid`                   |
/// | 429         | `RateLimited`                     |
/// | 5xx         | `ProviderError { status, body }`  |
/// | other       | `ProviderError { status, body }`  |
/// | malformed   | `ResponseParseError`              |
/// Maximum number of retry attempts (0 retries = 1 total attempt, 3 retries = 4 total).
const MAX_RETRIES: u32 = 3;
/// Base backoff delay in seconds. Doubles each retry: 1s, 2s, 4s.
const BASE_BACKOFF_SECS: u64 = 1;

/// Sends a non-streaming completion request to the OpenRouter API.
///
/// Retries up to `MAX_RETRIES` times with exponential backoff for retryable
/// errors (transient network issues, HTTP 5xx, body decode/parse glitches).
/// Non-retryable errors (auth, rate limit, API key, config issues) fail
/// immediately.
///
/// # Timeout
/// 30 seconds per attempt. Exceeded timeouts map to `PlotlineError::NetworkTimeout`.
///
/// # Error mapping (single attempt)
/// | HTTP Status | Error Variant                     |
/// |-------------|-----------------------------------|
/// | 200         | Parsed `CompletionResponse`       |
/// | 401         | `ApiKeyInvalid`                   |
/// | 429         | `RateLimited`                     |
/// | 5xx         | `ProviderError { status, body }`  |
/// | other       | `ProviderError { status, body }`  |
/// | malformed   | `ResponseParseError`              |
pub async fn complete(request: CompletionRequest) -> Result<CompletionResponse, PlotlineError> {
    let mut last_error: Option<String> = None;

    for attempt in 0..=MAX_RETRIES {
        if attempt > 0 {
            let delay_secs = BASE_BACKOFF_SECS * 2u64.pow(attempt - 1);
            eprintln!(
                "[{}] OpenRouter attempt {}/{} failed; retrying in {}s — {}",
                Local::now().format("%Y-%m-%dT%H:%M:%S"),
                attempt,
                MAX_RETRIES,
                delay_secs,
                last_error.as_deref().unwrap_or("unknown error"),
            );
            tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
        }

        match try_complete(&request).await {
            Ok(response) => return Ok(response),
            Err(e) => {
                let retryable = is_retryable_error(&e);
                // Always log the attempt, regardless of retryability
                eprintln!(
                    "[{}] OpenRouter attempt {} error: {} (retryable: {})",
                    Local::now().format("%Y-%m-%dT%H:%M:%S"),
                    attempt,
                    e,
                    retryable,
                );
                if !retryable {
                    return Err(e);
                }
                last_error = Some(e.to_string());
            }
        }
    }

    Err(PlotlineError::ProviderError {
        status: 0,
        body: format!(
            "All {} retry attempts failed. Last error: {}",
            MAX_RETRIES,
            last_error.unwrap_or_else(|| "unknown".into()),
        ),
    })
}

/// Performs a single HTTP request to the OpenRouter API.
///
/// This is the inner one-shot implementation extracted from the original
/// `complete()`. It builds the HTTP client, sends the request, reads the
/// response body, and maps the HTTP status to the appropriate error variant.
/// It is called by the retry-wrapping `complete()`.
async fn try_complete(request: &CompletionRequest) -> Result<CompletionResponse, PlotlineError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| PlotlineError::ProviderError {
            status: 0,
            body: format!("Failed to create HTTP client: {}", e),
        })?;

    let body = OpenRouterRequest::new(request.model.clone(), request.prompt.clone());

    let response = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", request.api_key))
        .header("Content-Type", "application/json")
        .header("HTTP-Referer", "https://plotline.app")
        .header("X-Title", "Plotline")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                PlotlineError::NetworkTimeout
            } else if e.is_connect() {
                PlotlineError::ProviderError {
                    status: 0,
                    body: "Connection failed".to_string(),
                }
            } else {
                PlotlineError::ProviderError {
                    status: 0,
                    body: e.to_string(),
                }
            }
        })?;

    let status = response.status();
    let status_code = status.as_u16();

    let body_text = response.text().await.map_err(|e| {
        PlotlineError::ProviderError {
            status: status_code,
            body: format!("Failed to read response body: {}", e),
        }
    })?;

    match status_code {
        200 => parse_success_body(&body_text),
        401 => Err(PlotlineError::ApiKeyInvalid),
        429 => Err(PlotlineError::RateLimited),
        _ => Err(PlotlineError::ProviderError {
            status: status_code,
            body: body_text,
        }),
    }
}

/// Determines whether an error is transient and worth retrying.
///
/// Retryable: transient network issues, HTTP 5xx, body decode failures,
///            response parse errors (malformed JSON could be a network glitch).
/// Not retryable: auth failures (401), rate limits (429), API key not set,
///               missing variable files, filesystem errors (permanent config issues).
fn is_retryable_error(error: &PlotlineError) -> bool {
    match error {
        // Never retry auth/rate-limit/config errors
        PlotlineError::ApiKeyInvalid
        | PlotlineError::ApiKeyNotSet
        | PlotlineError::RateLimited => false,

        // Transient transport errors
        PlotlineError::NetworkTimeout => true,

        // Provider errors: retry on connection failures (status 0) and 5xx,
        // but NOT on 4xx (except the ones already handled above).
        PlotlineError::ProviderError { status, body } => {
            if *status == 0 {
                // Connection-level failure (reqwest couldn't reach the server,
                // or the response body couldn't be read).
                return true;
            }
            if *status >= 500 && *status < 600 {
                return true;
            }
            // Body decode with 200 status should be retried.
            if *status == 200 && body.starts_with("Failed to read response body") {
                return true;
            }
            // 4xx client errors (besides 401/429 already caught) are not retryable.
            false
        }

        // Parse errors: the response came back but couldn't be parsed.
        // This could be a truncated response or a provider glitch — retry.
        PlotlineError::ResponseParseError(_) => true,

        // All other errors (filesystem, workflow validation, variable files, etc.)
        // are permanent configuration issues — don't retry API calls won't fix them.
        _ => false,
    }
}

/// Parses the JSON response body from a 200 OK response.
/// Extracts `choices[0].message.content`, `usage.prompt_tokens`,
/// and `usage.completion_tokens`.
fn parse_success_body(body_text: &str) -> Result<CompletionResponse, PlotlineError> {
    let json: serde_json::Value =
        serde_json::from_str(body_text)
            .map_err(|e| PlotlineError::ResponseParseError(e.to_string()))?;

    let choices = json
        .get("choices")
        .and_then(|c| c.as_array())
        .ok_or_else(|| {
            PlotlineError::ResponseParseError("Response missing 'choices' array".to_string())
        })?;

    let first_choice = choices.first().ok_or_else(|| {
        PlotlineError::ResponseParseError("Response 'choices' array is empty".to_string())
    })?;

    let content = first_choice
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or_else(|| {
            PlotlineError::ResponseParseError(
                "Response missing 'message.content' field".to_string(),
            )
        })?
        .to_string();

    let usage = json.get("usage").ok_or_else(|| {
        PlotlineError::ResponseParseError("Response missing 'usage' object".to_string())
    })?;

    let prompt_tokens = usage
        .get("prompt_tokens")
        .and_then(|t| t.as_u64())
        .ok_or_else(|| {
            PlotlineError::ResponseParseError(
                "Response missing 'usage.prompt_tokens' field".to_string(),
            )
        })? as u32;

    let completion_tokens = usage
        .get("completion_tokens")
        .and_then(|t| t.as_u64())
        .ok_or_else(|| {
            PlotlineError::ResponseParseError(
                "Response missing 'usage.completion_tokens' field".to_string(),
            )
        })? as u32;

    Ok(CompletionResponse {
        content,
        prompt_tokens,
        completion_tokens,
    })
}

// ---- Wiremock integration tests ----

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// Build a valid-looking OpenRouter success JSON response body.
    fn success_body(content: &str) -> String {
        serde_json::json!({
            "id": "gen-test-123",
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": content
                },
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150
            }
        })
        .to_string()
    }

    /// Test-only version of `complete` that accepts a configurable URL.
    /// This lets wiremock control the endpoint while keeping the production
    /// `complete()` function clean (no URL parameter injection).
    async fn complete_with_url(
        request: CompletionRequest,
        url: &str,
    ) -> Result<CompletionResponse, PlotlineError> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| PlotlineError::ProviderError {
                status: 0,
                body: format!("Failed to create HTTP client: {}", e),
            })?;

        let body = OpenRouterRequest::new(request.model, request.prompt);

        let response = client
            .post(url)
            .header("Authorization", format!("Bearer {}", request.api_key))
            .header("Content-Type", "application/json")
            .header("HTTP-Referer", "https://plotline.app")
            .header("X-Title", "Plotline")
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    PlotlineError::NetworkTimeout
                } else if e.is_connect() {
                    PlotlineError::ProviderError {
                        status: 0,
                        body: "Connection failed".to_string(),
                    }
                } else {
                    PlotlineError::ProviderError {
                        status: 0,
                        body: e.to_string(),
                    }
                }
            })?;

        let status_code = response.status().as_u16();
        let body_text = response.text().await.map_err(|e| {
            PlotlineError::ProviderError {
                status: status_code,
                body: format!("Failed to read response body: {}", e),
            }
        })?;

        match status_code {
            200 => parse_success_body(&body_text),
            401 => Err(PlotlineError::ApiKeyInvalid),
            429 => Err(PlotlineError::RateLimited),
            _ => Err(PlotlineError::ProviderError {
                status: status_code,
                body: body_text,
            }),
        }
    }

    /// Helper to construct a test `CompletionRequest`.
    fn make_request(model: &str, prompt: &str) -> CompletionRequest {
        CompletionRequest {
            model: model.to_string(),
            prompt: prompt.to_string(),
            api_key: "sk-test-key".to_string(),
        }
    }

    #[tokio::test]
    async fn test_complete_success() {
        let server = MockServer::start().await;
        let url = format!("{}/api/v1/chat/completions", server.uri());

        Mock::given(method("POST"))
            .and(path("/api/v1/chat/completions"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_string(success_body("Hello from OpenRouter")),
            )
            .mount(&server)
            .await;

        let response = complete_with_url(make_request("openai/gpt-4o", "Say hello."), &url)
            .await
            .expect("successful response");

        assert_eq!(response.content, "Hello from OpenRouter");
        assert_eq!(response.prompt_tokens, 100);
        assert_eq!(response.completion_tokens, 50);
    }

    #[tokio::test]
    async fn test_complete_401() {
        let server = MockServer::start().await;
        let url = format!("{}/api/v1/chat/completions", server.uri());

        Mock::given(method("POST"))
            .and(path("/api/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(401).set_body_string("Unauthorized"))
            .mount(&server)
            .await;

        let result = complete_with_url(make_request("openai/gpt-4o", "test"), &url).await;

        assert!(matches!(result, Err(PlotlineError::ApiKeyInvalid)));
    }

    #[tokio::test]
    async fn test_complete_429() {
        let server = MockServer::start().await;
        let url = format!("{}/api/v1/chat/completions", server.uri());

        Mock::given(method("POST"))
            .and(path("/api/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(429).set_body_string("Rate limited"))
            .mount(&server)
            .await;

        let result = complete_with_url(make_request("openai/gpt-4o", "test"), &url).await;

        assert!(matches!(result, Err(PlotlineError::RateLimited)));
    }

    #[tokio::test]
    async fn test_complete_500() {
        let server = MockServer::start().await;
        let url = format!("{}/api/v1/chat/completions", server.uri());

        Mock::given(method("POST"))
            .and(path("/api/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(500).set_body_string("Internal error"))
            .mount(&server)
            .await;

        let result = complete_with_url(make_request("openai/gpt-4o", "test"), &url).await;

        match result {
            Err(PlotlineError::ProviderError { status, body }) => {
                assert_eq!(status, 500);
                assert_eq!(body, "Internal error");
            }
            other => panic!("Expected ProviderError(500), got {:?}", other),
        }
    }

    #[tokio::test]
    async fn test_complete_502() {
        let server = MockServer::start().await;
        let url = format!("{}/api/v1/chat/completions", server.uri());

        Mock::given(method("POST"))
            .and(path("/api/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(502).set_body_string("Bad gateway"))
            .mount(&server)
            .await;

        let result = complete_with_url(make_request("openai/gpt-4o", "test"), &url).await;

        match result {
            Err(PlotlineError::ProviderError { status, body }) => {
                assert_eq!(status, 502);
                assert_eq!(body, "Bad gateway");
            }
            other => panic!("Expected ProviderError(502), got {:?}", other),
        }
    }

    #[tokio::test]
    async fn test_complete_malformed_json() {
        let server = MockServer::start().await;
        let url = format!("{}/api/v1/chat/completions", server.uri());

        Mock::given(method("POST"))
            .and(path("/api/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_string("this is not json {{"))
            .mount(&server)
            .await;

        let result = complete_with_url(make_request("openai/gpt-4o", "test"), &url).await;

        assert!(matches!(result, Err(PlotlineError::ResponseParseError(_))));
    }

    #[tokio::test]
    async fn test_complete_timeout() {
        let server = MockServer::start().await;
        let url = format!("{}/api/v1/chat/completions", server.uri());

        Mock::given(method("POST"))
            .and(path("/api/v1/chat/completions"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_string(success_body("never received"))
                    .set_delay(std::time::Duration::from_secs(60)),
            )
            .mount(&server)
            .await;

        let result = complete_with_url(make_request("openai/gpt-4o", "test"), &url).await;

        assert!(matches!(result, Err(PlotlineError::NetworkTimeout)));
    }

    #[tokio::test]
    async fn test_complete_connection_failed() {
        // Use a non-routable IP to force a connection error.
        let url = "http://0.0.0.0:1/api/v1/chat/completions";

        let result =
            complete_with_url(make_request("openai/gpt-4o", "test"), url).await;

        match result {
            Err(PlotlineError::ProviderError { status, body }) => {
                assert_eq!(status, 0);
                assert_eq!(body, "Connection failed");
            }
            other => panic!(
                "Expected ProviderError(0, 'Connection failed'), got {:?}",
                other
            ),
        }
    }

    #[tokio::test]
    async fn test_complete_missing_choices() {
        let server = MockServer::start().await;
        let url = format!("{}/api/v1/chat/completions", server.uri());

        let body = serde_json::json!({
            "id": "gen-test",
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 5
            }
        })
        .to_string();

        Mock::given(method("POST"))
            .and(path("/api/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_string(body))
            .mount(&server)
            .await;

        let result = complete_with_url(make_request("openai/gpt-4o", "test"), &url).await;

        assert!(matches!(result, Err(PlotlineError::ResponseParseError(_))));
    }

    #[tokio::test]
    async fn test_complete_missing_usage() {
        let server = MockServer::start().await;
        let url = format!("{}/api/v1/chat/completions", server.uri());

        let body = serde_json::json!({
            "id": "gen-test",
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "some content"
                },
                "finish_reason": "stop"
            }]
        })
        .to_string();

        Mock::given(method("POST"))
            .and(path("/api/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_string(body))
            .mount(&server)
            .await;

        let result = complete_with_url(make_request("openai/gpt-4o", "test"), &url).await;

        assert!(matches!(result, Err(PlotlineError::ResponseParseError(_))));
    }

    #[tokio::test]
    async fn test_headers_include_referer_and_title() {
        let server = MockServer::start().await;
        let url = format!("{}/api/v1/chat/completions", server.uri());

        Mock::given(method("POST"))
            .and(path("/api/v1/chat/completions"))
            .and(header("HTTP-Referer", "https://plotline.app"))
            .and(header("X-Title", "Plotline"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_string(success_body("headers verified")),
            )
            .mount(&server)
            .await;

        let result =
            complete_with_url(make_request("openai/gpt-4o", "test headers"), &url).await;

        assert!(result.is_ok());
        // If the mock doesn't match, wiremock returns 404 and the test fails.
        // The headers were verified by wiremock's matchers.
    }

    #[tokio::test]
    async fn test_complete_missing_content_field() {
        let server = MockServer::start().await;
        let url = format!("{}/api/v1/chat/completions", server.uri());

        let body = serde_json::json!({
            "id": "gen-test",
            "choices": [{
                "message": {
                    "role": "assistant"
                },
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 5
            }
        })
        .to_string();

        Mock::given(method("POST"))
            .and(path("/api/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_string(body))
            .mount(&server)
            .await;

        let result = complete_with_url(make_request("openai/gpt-4o", "test"), &url).await;

        assert!(matches!(result, Err(PlotlineError::ResponseParseError(_))));
    }
}
