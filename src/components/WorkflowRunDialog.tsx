// Version: 1.0.0 | 2026-07-10
// WorkflowRunDialog — pre-flight checklist for workflow variables.
//
// Appears when the user clicks "Run" on a workflow that references
// {{variables.<name>}} placeholders. Shows each variable with an editable
// textarea pre-filled from the variable file (if it exists). On "Run", the
// edited values are passed back to the parent as a Record<string, string>,
// which sends them to the backend as variable_overrides — these take
// precedence over file-based values without mutating project files.
//
// If a workflow has zero variables, the dialog is never opened — the parent
// (WorkflowSelector) starts the run immediately.
//
// Design: CSS module (not inline styles) for hover/focus states, staggered
// card animations, and media-query-friendly layout. This is the pattern
// we want new components to follow.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { VariableInfo } from "../utils/variables";
import styles from "./WorkflowRunDialog.module.css";

interface WorkflowRunDialogProps {
  /** Display name of the workflow being run. */
  workflowName: string;
  /** Variables detected by scanWorkflowVariables. Always non-empty — the
   *  parent only opens this dialog when at least one variable exists. */
  variables: VariableInfo[];
  isOpen: boolean;
  /** True while the parent starts the run with the provided overrides.
   *  Disables all inputs and shows "Starting…" on the Run button. */
  isStarting: boolean;
  /** Error message from the parent (run failure), or null. Displayed
   *  in the footer so the user can retry without losing their edits. */
  error: string | null;
  /** Called with the edited values when the user clicks "Run". The parent
   *  sends them to the backend as variable_overrides. */
  onRun: (values: Record<string, string>) => void;
  /** Called when the user clicks "Cancel", presses Escape, or clicks the
   *  backdrop. The parent closes the dialog. */
  onCancel: () => void;
}

/** Caps textarea height so long defaults (e.g. book_outline) scroll instead
 *  of growing unbounded. ~15 rows at 13px/1.5 line-height. */
const MAX_TEXTAREA_HEIGHT = 300;

export function WorkflowRunDialog({
  workflowName,
  variables,
  isOpen,
  isStarting,
  error,
  onRun,
  onCancel,
}: WorkflowRunDialogProps) {
  // One piece of state per variable, keyed by variable name. Initialized from
  // defaultValue when the dialog opens. We use a single object rather than
  // individual states so we can update any field without re-mounting.
  const [values, setValues] = useState<Record<string, string>>({});

  // valuesRef keeps the latest values accessible to the window-level keyboard
  // handler without forcing a re-bind on every keystroke.
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const runBtnRef = useRef<HTMLButtonElement>(null);

  // Initialize / reset values whenever the dialog opens or the variable set
  // changes. This ensures the textareas always reflect the current on-disk
  // defaults, even if the user previously edited them and cancelled.
  useEffect(() => {
    if (!isOpen) return;
    const initial: Record<string, string> = {};
    for (const v of variables) {
      initial[v.name] = v.defaultValue;
    }
    setValues(initial);
  }, [isOpen, variables]);

  const handleRun = useCallback(() => {
    onRun(valuesRef.current);
  }, [onRun]);

  // Escape → cancel, Cmd/Ctrl+Enter → run. Bound on window so it works
  // regardless of which element has focus. Disabled while isStarting so the
  // user can't trigger a double-run during the start.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape" && !isStarting) {
        e.preventDefault();
        onCancel();
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !isStarting) {
        e.preventDefault();
        handleRun();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, isStarting, onCancel, handleRun]);

  // Focus the Run button when the dialog opens, giving keyboard users an
  // immediate action target. Slight delay lets the panel animation settle.
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => runBtnRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [isOpen]);

  // mousedown on backdrop (not click) so dragging a text selection out of the
  // panel doesn't accidentally close the dialog. Matches SettingsModal pattern.
  const handleBackdropMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && !isStarting) onCancel();
    },
    [isStarting, onCancel]
  );

  const handleChange = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      onMouseDown={handleBackdropMouseDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-dialog-title"
    >
      <div className={styles.panel}>
        {/* Header ------------------------------------------------------- */}
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title} id="run-dialog-title">
              Run Workflow
            </h2>
            <p className={styles.subtitle}>{workflowName}</p>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onCancel}
            disabled={isStarting}
            aria-label="Close dialog"
            type="button"
          >
            ×
          </button>
        </header>

        {/* Variable list ------------------------------------------------ */}
        <div className={styles.body}>
          <p className={styles.hint}>
            {variables.length} variable{variables.length !== 1 ? "s" : ""} need{" "}
            {variables.length !== 1 ? "values" : "a value"} before running.
            Edit below, then click Run.
          </p>

          <div className={styles.varList}>
            {variables.map((v, index) => (
              <VariableField
                key={v.name}
                info={v}
                value={values[v.name] ?? ""}
                onChange={(val) => handleChange(v.name, val)}
                disabled={isStarting}
                index={index}
              />
            ))}
          </div>
        </div>

        {/* Footer / actions --------------------------------------------- */}
        <footer className={styles.footer}>
          {error && <div className={styles.error}>{error}</div>}
          <button
            className={styles.btnCancel}
            onClick={onCancel}
            disabled={isStarting}
            type="button"
          >
            Cancel
          </button>
          <button
            ref={runBtnRef}
            className={styles.btnRun}
            onClick={handleRun}
            disabled={isStarting}
            type="button"
          >
            {isStarting ? "Starting…" : "Run Workflow"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VariableField — a single variable's label + auto-resizing textarea
// ---------------------------------------------------------------------------

interface VariableFieldProps {
  info: VariableInfo;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  /** Index in the list — used for staggered animation delay. */
  index: number;
}

function VariableField({
  info,
  value,
  onChange,
  disabled,
  index,
}: VariableFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize: grow with content up to MAX_TEXTAREA_HEIGHT, then scroll.
  // Re-runs whenever value changes (including the initial fill from
  // defaultValue). Setting height to "auto" first forces the browser to
  // recalculate scrollHeight from the natural content height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  // Prevent Enter from inserting a newline when the user presses Cmd/Ctrl+Enter
  // — the global handler will trigger Run instead. This stops a stray newline
  // from appearing in the textarea before the dialog closes.
  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
    }
  }, []);

  return (
    <div
      className={styles.varCard}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className={styles.varHead}>
        <div className={styles.varLabelGroup}>
          <span className={styles.varLabel}>{info.label}</span>
          <code className={styles.varName}>{info.name}</code>
        </div>
        {info.hasDefault && (
          <span className={styles.varBadge}>from file</span>
        )}
      </div>

      {info.referencedBy.length > 0 && (
        <p className={styles.varContext}>
          Used in: {info.referencedBy.join(", ")}
        </p>
      )}

      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={`Enter a value for ${info.label.toLowerCase()}…`}
        spellCheck={false}
        aria-label={info.label}
      />
    </div>
  );
}

export default WorkflowRunDialog;
