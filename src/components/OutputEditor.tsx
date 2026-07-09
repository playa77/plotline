// Version: 1.0.0 | 2026-07-09
// Output editor component: view (react-markdown) and edit (CodeMirror) modes
// for step outputs. Allows editing and saving back to disk.

import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import * as api from "../api/tauri";

interface OutputEditorProps {
  runDir: string;
  stepIndex: number;
  stepName: string;
  outputPath: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Threshold (in bytes) above which a warning is shown for large outputs. */
const LARGE_OUTPUT_THRESHOLD = 100 * 1024; // 100 KB

export function OutputEditor({
  runDir,
  stepIndex,
  stepName,
  outputPath,
  onClose,
  onSaved,
}: OutputEditorProps) {
  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLargeWarning, setShowLargeWarning] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Load content on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const text = await api.readFileContent(outputPath);
        if (!cancelled) {
          setContent(text);
          setOriginalContent(text);
          setIsLoading(false);

          if (text.length > LARGE_OUTPUT_THRESHOLD) {
            setShowLargeWarning(true);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [outputPath]);

  const hasUnsavedChanges = content !== originalContent;

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);

    try {
      await api.saveOutput(runDir, stepIndex, stepName, content);
      setOriginalContent(content);
      setIsEditing(false);
      onSaved();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSaving(false);
    }
  }, [runDir, stepIndex, stepName, content, onSaved]);

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  const handleDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  const handleCancelDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
  }, []);

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading output...</div>
      </div>
    );
  }

  if (error && !content) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>Failed to load output: {error}</div>
        <button style={styles.button} onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h2 style={styles.title}>
            Step {stepIndex + 1}: {stepName}
          </h2>
          <span style={styles.path}>{outputPath}</span>
        </div>
        <div style={styles.headerRight}>
          {!isEditing ? (
            <button style={styles.editButton} onClick={() => setIsEditing(true)}>
              Edit
            </button>
          ) : (
            <>
              <button
                style={styles.saveButton}
                onClick={handleSave}
                disabled={isSaving || !hasUnsavedChanges}
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button
                style={styles.cancelButton}
                onClick={() => {
                  setContent(originalContent);
                  setIsEditing(false);
                }}
                disabled={isSaving}
              >
                Cancel
              </button>
            </>
          )}
          <button style={styles.closeButton} onClick={handleClose}>
            Close
          </button>
        </div>
      </div>

      {/* Large output warning */}
      {showLargeWarning && (
        <div style={styles.warning}>
          Large output ({content.length.toLocaleString()} bytes). Rendering may
          be slow.
        </div>
      )}

      {/* Error during save */}
      {error && isEditing && (
        <div style={styles.error}>{error}</div>
      )}

      {/* Content area */}
      <div style={styles.contentArea}>
        {isEditing ? (
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
        ) : (
          <div style={styles.preview}>
            <ReactMarkdown>{content || "*No output yet.*"}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={styles.statusBar}>
        {isEditing && hasUnsavedChanges && (
          <span style={styles.unsavedIndicator}>Unsaved changes</span>
        )}
        <span style={styles.charCount}>
          {content.length.toLocaleString()} characters
        </span>
      </div>

      {/* Discard confirmation overlay */}
      {showDiscardConfirm && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <p style={styles.dialogText}>
              You have unsaved changes. Discard?
            </p>
            <div style={styles.dialogButtons}>
              <button style={styles.discardButton} onClick={handleDiscard}>
                Discard
              </button>
              <button style={styles.cancelButton} onClick={handleCancelDiscard}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (inline, referencing CSS variables)
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: "var(--color-bg)",
    color: "var(--color-text)",
  },
  loading: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    color: "var(--color-text-dim)",
    fontSize: "1rem",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "12px 16px",
    borderBottom: "1px solid var(--color-accent)",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  headerRight: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  title: {
    fontSize: "1.1rem",
    fontWeight: 600,
    margin: 0,
    color: "var(--color-text)",
  },
  path: {
    fontSize: "0.75rem",
    color: "var(--color-text-dim)",
    fontFamily: "var(--font-mono)",
  },
  editButton: {
    padding: "6px 14px",
    backgroundColor: "var(--color-accent)",
    color: "var(--color-text)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  saveButton: {
    padding: "6px 14px",
    backgroundColor: "var(--color-success)",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  cancelButton: {
    padding: "6px 14px",
    backgroundColor: "transparent",
    color: "var(--color-text-dim)",
    border: "1px solid var(--color-accent)",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  closeButton: {
    padding: "6px 14px",
    backgroundColor: "var(--color-primary)",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  warning: {
    padding: "8px 16px",
    backgroundColor: "rgba(255, 152, 0, 0.15)",
    color: "var(--color-warning)",
    fontSize: "0.8rem",
    flexShrink: 0,
  },
  error: {
    padding: "8px 16px",
    backgroundColor: "rgba(244, 67, 54, 0.15)",
    color: "var(--color-error)",
    fontSize: "0.85rem",
    flexShrink: 0,
  },
  contentArea: {
    flex: 1,
    overflow: "auto",
    minHeight: 0,
  },
  preview: {
    padding: "16px",
    lineHeight: 1.6,
  },
  editor: {
    height: "100%",
  },
  statusBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 16px",
    borderTop: "1px solid var(--color-accent)",
    fontSize: "0.75rem",
    color: "var(--color-text-dim)",
    flexShrink: 0,
  },
  unsavedIndicator: {
    color: "var(--color-warning)",
    fontWeight: 500,
  },
  charCount: {
    marginLeft: "auto",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
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
  discardButton: {
    padding: "6px 14px",
    backgroundColor: "var(--color-error)",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  button: {
    padding: "6px 14px",
    backgroundColor: "var(--color-accent)",
    color: "var(--color-text)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.85rem",
    margin: "8px 16px",
  },
};
