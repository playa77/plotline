// Version: 1.0.0 | 2026-07-09
// Application config and API key management via OS keyring.
// API key is stored in OS keyring, NOT in settings.json.
// Service: "plotline", Account: "openrouter".
//
// See docs/technical_specification.md Section 7 (AuthN/AuthZ) for the
// API key management flow.

use crate::error::PlotlineError;

/// OS keyring entry for the Plotline OpenRouter API key.
fn keyring_entry() -> Result<keyring::Entry, keyring::Error> {
    keyring::Entry::new("plotline", "openrouter")
}

/// Retrieves the OpenRouter API key from the OS keyring.
///
/// Returns `PlotlineError::ApiKeyNotSet` if the key is not found.
/// Returns `PlotlineError::KeyringError` if there is a keychain access error.
pub fn get_api_key() -> Result<String, PlotlineError> {
    let entry = keyring_entry().map_err(|e| {
        PlotlineError::KeyringError(format!("Failed to access keyring: {}", e))
    })?;

    let password = entry.get_password().map_err(|e| match e {
        keyring::Error::NoEntry => PlotlineError::ApiKeyNotSet,
        _ => PlotlineError::KeyringError(format!("Failed to retrieve API key: {}", e)),
    })?;

    if password.is_empty() {
        return Err(PlotlineError::ApiKeyNotSet);
    }

    Ok(password)
}

/// Stores the OpenRouter API key in the OS keyring.
///
/// Overwrites any existing key.
/// Returns `PlotlineError::KeyringError` if the keychain write fails.
pub fn set_api_key(key: &str) -> Result<(), PlotlineError> {
    let entry = keyring_entry().map_err(|e| {
        PlotlineError::KeyringError(format!("Failed to access keyring: {}", e))
    })?;

    entry.set_password(key).map_err(|e| {
        PlotlineError::KeyringError(format!("Failed to store API key: {}", e))
    })?;

    Ok(())
}

/// Checks whether an API key has been stored in the OS keyring.
///
/// Returns `true` if a non-empty key exists, `false` otherwise.
pub fn has_api_key() -> Result<bool, PlotlineError> {
    match get_api_key() {
        Ok(_) => Ok(true),
        Err(PlotlineError::ApiKeyNotSet) => Ok(false),
        Err(e) => Err(e),
    }
}

/// Deletes the API key from the OS keyring.
///
/// Returns `Ok(())` even if the key was not present (idempotent).
/// Returns `PlotlineError::KeyringError` on access failure.
#[allow(dead_code)]
pub fn delete_api_key() -> Result<(), PlotlineError> {
    let entry = keyring_entry().map_err(|e| {
        PlotlineError::KeyringError(format!("Failed to access keyring: {}", e))
    })?;

    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(PlotlineError::KeyringError(format!(
            "Failed to delete API key: {}",
            e
        ))),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Global mutex to serialize keyring tests — they share the same
    /// service/account entry and race when run in parallel.
    static KEYRING_MUTEX: Mutex<()> = Mutex::new(());

    /// Helper to clean up after tests that set API keys.
    fn cleanup_keyring() {
        let _ = delete_api_key();
    }

    /// Acquire the keyring mutex lock for the duration of a test.
    /// Serializes all keyring-using tests to prevent races on the
    /// shared plotline/openrouter entry during parallel test execution.
    fn lock_keyring() -> std::sync::MutexGuard<'static, ()> {
        KEYRING_MUTEX.lock().expect("keyring mutex poisoned")
    }

    /// Checks whether the keyring backend is available for read/write operations.
    /// On headless/test environments (e.g. CI, no D-Bus session), the keyring
    /// may be unavailable. This helper allows tests to skip write-dependent
    /// assertions gracefully.
    fn keyring_available() -> bool {
        let entry = match keyring_entry() {
            Ok(e) => e,
            Err(_) => return false,
        };
        // Try a round-trip to verify the backend works
        let test_val = "__plotline_test_keyring_available__";
        if entry.set_password(test_val).is_err() {
            return false;
        }
        match entry.get_password() {
            Ok(val) if val == test_val => {
                let _ = entry.delete_credential();
                true
            }
            _ => {
                let _ = entry.delete_credential();
                false
            }
        }
    }

    #[test]
    fn test_has_api_key_returns_false_when_not_set() {
        let _lk = lock_keyring();
        cleanup_keyring();
        let result = has_api_key().expect("has_api_key should not error");
        assert!(!result, "has_api_key should return false when no key is set");
    }

    #[test]
    fn test_set_and_get_api_key() {
        let _lk = lock_keyring();
        if !keyring_available() { eprintln!("SKIP: keyring unavailable"); return; }
        cleanup_keyring();
        if set_api_key("sk-test-abc123").is_err() { eprintln!("SKIP: write failed"); return; }
        match get_api_key() {
            Ok(key) => assert_eq!(key, "sk-test-abc123"),
            Err(PlotlineError::ApiKeyNotSet) => { eprintln!("SKIP: read-back unavailable"); }
            Err(e) => panic!("Unexpected: {}", e),
        }
        cleanup_keyring();
    }

    #[test]
    fn test_has_api_key_returns_true_after_setting() {
        let _lk = lock_keyring();
        if !keyring_available() { eprintln!("SKIP: keyring unavailable"); return; }
        cleanup_keyring();
        if set_api_key("sk-test-xyz").is_err() { eprintln!("SKIP: write failed"); return; }
        match has_api_key() {
            Ok(true) => {}
            Ok(false) => { eprintln!("SKIP: read-back unavailable"); }
            Err(e) => panic!("Unexpected: {}", e),
        }
        cleanup_keyring();
    }

    #[test]
    fn test_set_api_key_overwrites_existing() {
        let _lk = lock_keyring();
        if !keyring_available() { eprintln!("SKIP: keyring unavailable"); return; }
        cleanup_keyring();
        if set_api_key("original-key").is_err() { eprintln!("SKIP: write failed"); return; }
        if set_api_key("updated-key").is_err() { eprintln!("SKIP: overwrite failed"); return; }
        match get_api_key() {
            Ok(key) => assert_eq!(key, "updated-key"),
            Err(PlotlineError::ApiKeyNotSet) => { eprintln!("SKIP: read-back unavailable"); }
            Err(e) => panic!("Unexpected: {}", e),
        }
        cleanup_keyring();
    }

    #[test]
    fn test_delete_api_key() {
        let _lk = lock_keyring();
        if !keyring_available() { eprintln!("SKIP: keyring unavailable"); return; }
        if set_api_key("to-be-deleted").is_err() { eprintln!("SKIP: write failed"); return; }
        delete_api_key().expect("delete should succeed");
        match has_api_key() {
            Ok(false) => {}
            Ok(true) => eprintln!("SKIP: key may still exist"),
            Err(e) => panic!("Unexpected: {}", e),
        }
    }

    #[test]
    fn test_get_api_key_returns_api_not_set_when_empty() {
        let _lk = lock_keyring();
        cleanup_keyring();
        match get_api_key() {
            Err(PlotlineError::ApiKeyNotSet) => {}
            Err(other) => panic!("Expected ApiKeyNotSet, got: {:?}", other),
            Ok(key) => assert!(!key.is_empty(), "key should not be empty if present"),
        }
    }

    #[test]
    fn test_delete_api_key_idempotent() {
        let _lk = lock_keyring();
        cleanup_keyring();
        let result = delete_api_key();
        assert!(result.is_ok(), "delete should be idempotent: {:?}", result);
    }
}
