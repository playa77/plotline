// Version: 1.0.0 | 2026-07-10
// PromptEditorModal — lightweight overlay for editing markdown prompt files.
//
// Pattern: overlay + centered panel with CodeMirror, matching the SettingsModal
// overlay pattern. Provides save/cancel with unsaved-changes discard confirmation.
//
// The Escape key closes the modal. Cmd/Ctrl+Enter saves.

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import * as api from "../api/tauri";

interface PromptEditorModalProps {
  isOpen: boolean;
  projectRoot: string;
  /** Absolute path to the prompt file. */
  promptPath: string;
  /** Display name for the prompt (typically the step name). */
  promptName: string;
  onClose: () => void;
}

export function PromptEditorModal({
  isOpen,
  projectRoot: _projectRoot,
  promptPath,
  promptName,
  onClose,
}: PromptEditorModalProps) {
  // projectRoot is kept in the interface for API consistency; the promptPath
  // is already absolute, so projectRoot is not directly referenced below.
  void _projectRoot;

  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const valuesRef = useRef(content);
  valuesRef.current = content;

  // Load prompt file content on open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      setShowDiscardConfirm(false);
      try {
        const text = await api.readFileContent(promptPath);
        if (!cancelled) {
          setContent(text);
          setOriginalContent(text);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(`Failed to load prompt: ${String(err)}`);
          setIsLoading(false);
        }
      }
    }

    load();

    // Focus close button for keyboard users
    setTimeout(() => closeBtnRef.current?.focus(), 100);

    return () => {
      cancelled = true;
    };
  }, [isOpen, promptPath]);

  // Close on Escape. Re-bound on every isOpen change.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !isSaving) {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, isSaving]);

  const hasUnsavedChanges = content !== originalContent;

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      await api.writeFileContent(promptPath, content);
      setOriginalContent(content);
      setIsSaving(false);
      onClose();
    } catch (err) {
      setError(String(err));
      setIsSaving(false);
    }
  }, [promptPath, content, onClose]);

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges && !showDiscardConfirm) {
      setShowDiscardConfirm(true);
    } else {
      setShowDiscardConfirm(false);
      onClose();
    }
  }, [hasUnsavedChanges, showDiscardConfirm, onClose]);

  const handleDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  const handleCancelDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
  }, []);

  const handleBackdropMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        handleClose();
      }
    },
    [handleClose]
  );

  if (!isOpen) return null;

  return (
    <div
      style={styles.overlay}
      onMouseDown={handleBackdropMouseDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-editor-title"
    >
      <div style={styles.panel}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.headerText}>
            <h2 style={styles.title} id="prompt-editor-title">
              Edit Prompt
            </h2>
            <p style={styles.subtitle}>{promptName}</p>
            <p style={styles.path}>{promptPath}</p>
          </div>
          <button
            ref={closeBtnRef}
            style={styles.closeBtn}
            onClick={handleClose}
            disabled={isSaving}
            aria-label="Close prompt editor"
            type="button"
          >
            ×
          </button>
        </header>

        {/* Body */}
        <div style={styles.body}>
          {isLoading && (
            <div style={styles.loadingState}>Loading prompt content...</div>
          )}

          {error && !isLoading && (
            <div style={styles.errorState}>{error}</div>
          )}

          {!isLoading && !error && (
            <CodeMirror
              value={content}
              onChange={(val) => setContent(val)}
              extensions={[markdown()]}
              style={styles.editor}
              theme="dark"
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                autocompletion: true,
              }}
            />
          )}

          {!isLoading && !error && hasUnsavedChanges && (
            <div style={styles.unsavedBar}>Unsaved changes</div>
          )}
        </div>

        {/* Footer / actions */}
        <footer style={styles.footer}>
          {error && <div style={styles.footerError}>{error}</div>}
          <button
            style={styles.cancelButton}
            onClick={handleClose}
            disabled={isSaving}
            type="button"
          >
            Cancel
          </button>
          <button
            style={styles.saveButton}
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges || isLoading || !!error}
            type="button"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>

      {/* Discard confirmation overlay */}
      {showDiscardConfirm && (
        <div style={styles.overlayInner}>
          <div style={styles.dialog}>
            <p style={styles.dialogText}>
              You have unsaved changes. Discard them?
            </p>
            <div style={styles.dialogButtons}>
              <button
                style={styles.discardCancelButton}
                onClick={handleCancelDiscard}
                type="button"
              >
                Keep Editing
              </button>
              <button
                style={styles.discardButton}
                onClick={handleDiscard}
                type="button"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 1100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background:
      "radial-gradient(ellipse at center, rgba(15, 52, 96, 0.35), rgba(10, 10, 25, 0.72) 70%), rgba(0, 0, 0, 0.55)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  },
  panel: {
    position: "relative" as const,
    width: "100%",
    maxWidth: "700px",
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--color-panel)",
    border: "1px solid rgba(233, 69, 96, 0.18)",
    borderRadius: "14px",
    boxShadow:
      "0 24px 60px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.03) inset",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
    padding: "20px 24px 12px",
    borderBottom: "1px solid rgba(136, 136, 170, 0.15)",
    flexShrink: 0,
  },
  headerText: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
    flex: 1,
  },
  title: {
    fontSize: "18px",
    fontWeight: 600,
    letterSpacing: "0.2px",
    color: "var(--color-text)",
    margin: 0,
  },
  subtitle: {
    fontSize: "13px",
    color: "var(--color-text-dim)",
    fontFamily: "var(--font-mono)",
    margin: 0,
  },
  path: {
    fontSize: "11px",
    color: "var(--color-text-dim)",
    fontFamily: "var(--font-mono)",
    opacity: 0.7,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    margin: 0,
  },
  closeBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "30px",
    height: "30px",
    borderRadius: "8px",
    border: "none",
    background: "transparent",
    color: "var(--color-text-dim)",
    fontSize: "18px",
    lineHeight: 1,
    cursor: "pointer",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
  },
  loadingState: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "200px",
    color: "var(--color-text-dim)",
    fontSize: "0.9rem",
  },
  errorState: {
    padding: "16px 24px",
    color: "var(--color-error)",
    fontSize: "0.85rem",
    fontFamily: "var(--font-mono)",
  },
  editor: {
    flex: 1,
    overflow: "auto",
  },
  unsavedBar: {
    padding: "6px 24px",
    fontSize: "0.75rem",
    color: "var(--color-warning)",
    fontWeight: 500,
    flexShrink: 0,
    borderTop: "1px solid rgba(136, 136, 170, 0.1)",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "10px",
    padding: "14px 24px 18px",
    borderTop: "1px solid rgba(136, 136, 170, 0.15)",
    flexShrink: 0,
  },
  footerError: {
    flex: 1,
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    color: "var(--color-error)",
    marginRight: "auto",
    paddingRight: "8px",
  },
  cancelButton: {
    padding: "9px 16px",
    borderRadius: "9px",
    border: "1px solid rgba(136, 136, 170, 0.2)",
    background: "transparent",
    color: "var(--color-text-dim)",
    fontFamily: "var(--font-ui)",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
  },
  saveButton: {
    padding: "9px 22px",
    borderRadius: "9px",
    border: "none",
    background: "var(--color-primary)",
    color: "#fff",
    fontFamily: "var(--font-ui)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  // Inner overlay for discard confirmation
  overlayInner: {
    position: "fixed" as const,
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1200,
  },
  dialog: {
    backgroundColor: "var(--color-panel)",
    padding: "24px",
    borderRadius: "8px",
    maxWidth: "400px",
    width: "90%",
  },
  dialogText: {
    margin: "0 0 16px 0",
    color: "var(--color-text)",
    fontSize: "0.95rem",
  },
  dialogButtons: {
    display: "flex",
    gap: "8px",
    justifyContent: "flex-end",
  },
  discardCancelButton: {
    padding: "6px 14px",
    backgroundColor: "transparent",
    color: "var(--color-text-dim)",
    border: "1px solid var(--color-accent)",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  discardButton: {
    padding: "6px 14px",
    backgroundColor: "var(--color-error)",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
};

export default PromptEditorModal;
