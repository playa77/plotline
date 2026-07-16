// Version: 1.1.0 | 2026-07-10
// SettingsModal — project root + OpenRouter API key management.

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import * as api from "../api/tauri";
import styles from "./SettingsModal.module.css";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Feedback = { type: "success" | "error"; message: string } | null;

/** Masks an OpenRouter API key, showing prefix + first 2 chars after prefix + "..." + last 3 chars.
 *  Example: "sk-or-v1-abcd1234...xyz" → "sk-or-v1-ab.................xyz" */
function maskApiKey(key: string): string {
  const prefix = "sk-or-v1-";
  if (!key.startsWith(prefix)) {
    // Not a recognizable OpenRouter key — show first 5 + ellipsis + last 3
    if (key.length <= 8) return key;
    return key.slice(0, 5) + "..." + key.slice(-3);
  }
  const afterPrefix = key.slice(prefix.length);
  if (afterPrefix.length <= 5) return key; // too short to mask meaningfully
  const visibleStart = afterPrefix.slice(0, 2);
  const visibleEnd = afterPrefix.slice(-3);
  const maskedMiddle = ".".repeat(17); // 17 dots for the ellipsis
  return prefix + visibleStart + maskedMiddle + visibleEnd;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  // null = "checking"; boolean = resolved presence. Drives the ✓/✕ indicator.
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  // null = "not yet loaded". Stores the raw key for masked display.
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pickingDir, setPickingDir] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Load current settings whenever the modal is opened. Re-fetching on each
  // open (rather than only on component mount) guarantees the displayed state
  // reflects what is persisted, even if it changed elsewhere since last view.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setFeedback(null);

    async function load() {
      try {
        const [root, has, key] = await Promise.all([
          api.getProjectRoot(),
          api.hasApiKey(),
          api.getApiKey().catch(() => null),
        ]);
        if (cancelled) return;
        setProjectRoot(root);
        setHasKey(has);
        setMaskedKey(key);
      } catch (err) {
        if (cancelled) return;
        setFeedback({
          type: "error",
          message: `Failed to load settings: ${String(err)}`,
        });
      }
    }
    load();

    // Give keyboard users an immediate focus target inside the dialog.
    closeBtnRef.current?.focus();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Close on Escape. Kept as its own effect so the listener is not re-bound
  // on every settings refresh.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handlePickDirectory = useCallback(async () => {
    setFeedback(null);
    setPickingDir(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Directory",
      });
      // open() returns null when the user cancels — treat as a no-op.
      if (typeof selected !== "string" || selected.length === 0) {
        return;
      }
      await api.setProjectRoot(selected);
      setProjectRoot(selected);
      setFeedback({ type: "success", message: "Project root updated." });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          "Directory picker unavailable. Install @tauri-apps/plugin-dialog " +
          `and register it in Tauri. (${String(err)})`,
      });
    } finally {
      setPickingDir(false);
    }
  }, []);

  const handleSaveKey = useCallback(async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setFeedback({ type: "error", message: "API key cannot be empty." });
      return;
    }
    setFeedback(null);
    setSavingKey(true);
    try {
      await api.setApiKey(trimmed);
      // Re-read presence from the keyring rather than trusting the write, so
      // the indicator reflects the actual persisted state.
      setHasKey(await api.hasApiKey());
      setMaskedKey(await api.getApiKey().catch(() => null));
      setApiKeyInput("");
      setFeedback({ type: "success", message: "API key saved to keyring." });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Failed to save API key: ${String(err)}`,
      });
    } finally {
      setSavingKey(false);
    }
  }, [apiKeyInput]);

  // mousedown (not click) so closing triggers the instant the user presses on
  // the backdrop, and so dragging a text selection out of the panel does not
  // accidentally close the dialog.
  const handleBackdropMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!isOpen) return null;

  const statusClass = hasKey === null
    ? styles.statusPending
    : hasKey
    ? styles.statusOk
    : styles.statusBad;
  const statusText = hasKey === null ? "… checking" : hasKey ? "✓ stored" : "✗ missing";

  return (
    <div
      className={styles.overlay}
      onMouseDown={handleBackdropMouseDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <h2 className={styles.title} id="settings-title">
            Settings
          </h2>
          <button
            ref={closeBtnRef}
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close settings"
            type="button"
          >
            ×
          </button>
        </header>

        <div className={styles.body}>
          {/* Project Root ------------------------------------------------- */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.label}>Project Root</span>
              <span className={`${styles.status} ${projectRoot ? styles.statusOk : styles.statusPending}`}>
                {projectRoot ? "● set" : "○ not set"}
              </span>
            </div>
            <div className={styles.pathBox}>
              <span
                className={
                  projectRoot
                    ? styles.path
                    : `${styles.path} ${styles.pathEmpty}`
                }
              >
                {projectRoot ?? "Not set"}
              </span>
            </div>
            <div className={styles.actions}>
              <button
                className={styles.btn}
                onClick={handlePickDirectory}
                disabled={pickingDir}
                type="button"
              >
                {pickingDir ? "Opening…" : "Change…"}
              </button>
            </div>
          </section>

          {/* OpenRouter API Key ------------------------------------------ */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.label}>OpenRouter API Key</span>
              <span className={`${styles.status} ${statusClass}`}>{statusText}</span>
            </div>
            {hasKey && maskedKey && (
              <div className={styles.maskedKey}>
                <code>{maskApiKey(maskedKey)}</code>
              </div>
            )}
            <input
              className={styles.input}
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveKey();
              }}
              placeholder={
                hasKey
                  ? "Enter a new key to replace the stored one"
                  : "Paste your OpenRouter API key"
              }
              autoComplete="off"
              spellCheck={false}
            />
            <div className={styles.actions}>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleSaveKey}
                disabled={savingKey}
                type="button"
              >
                {savingKey ? "Saving…" : "Save"}
              </button>
            </div>
          </section>

          {/* Inline feedback --------------------------------------------- */}
          <div
            className={`${styles.feedback} ${
              feedback?.type === "success"
                ? styles.feedbackOk
                : feedback?.type === "error"
                ? styles.feedbackErr
                : ""
            }`}
            role={feedback?.type === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {feedback?.message ?? ""}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
