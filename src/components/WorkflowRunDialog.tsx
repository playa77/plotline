// Version: 1.1.0 | 2026-07-10
// WorkflowRunDialog — pre-flight checklist for workflow variables.
//
// Appears when the user clicks "Run" on a workflow that references
// {{variables.<name>}} placeholders. Shows each variable with an editable
// textarea pre-filled from the variable file (if it exists). On "Run", the
// edited values are passed back to the parent as a Record<string, string>,
// which sends them to the backend as variable_overrides — these take
// precedence over file-based values without mutating project files.
//
// Chapter-like variables (name matching /^chapter/i) are rendered as a
// ChapterPickerField — a combobox that offers chapters parsed from the
// book_outline variable as a dropdown, with free-text fallback. When a
// chapter is selected from the dropdown, the value sent to the parent is
// the chapter number (e.g. "3"), but the input displays the full label
// (e.g. "Chapter 3: The Method"). This makes the chapter selector the
// visually prominent "action target" among the dialog's variables.
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
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { VariableInfo } from "../utils/variables";
import { parseChaptersFromOutline, type ChapterOption } from "../utils/chapters";
import * as api from "../api/tauri";
import styles from "./WorkflowRunDialog.module.css";
import { PromptEditorModal } from "./PromptEditorModal";

interface WorkflowRunDialogProps {
  /** Display name of the workflow being run. */
  workflowName: string;
  /** Variables detected by scanWorkflowVariables. Always non-empty — the
   *  parent only opens this dialog when at least one variable exists. */
  variables: VariableInfo[];
  /** Step names, models and prompt files extracted from the workflow YAML,
   *  shown as a compact preview before the variable list. */
  steps?: { name: string; model: string; promptFile: string }[];
  isOpen: boolean;
  /** Absolute path to the project root — used for save-as-default and
   *  prompt editing. */
  projectRoot: string;
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

/** Matches variable names that should render as a ChapterPicker instead of
 *  a plain textarea. Catches "chapter", "chapter_spec", "chapter_number",
 *  etc. — any name starting with "chapter". */
const CHAPTER_VAR_REGEX = /^chapter/i;

function isChapterVariable(name: string): boolean {
  return CHAPTER_VAR_REGEX.test(name);
}

export function WorkflowRunDialog({
  workflowName,
  variables,
  steps,
  isOpen,
  projectRoot,
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

  // Parse chapters from the book_outline variable so chapter-picker fields
  // can offer a dropdown of detected chapters. We read from the live `values`
  // state (not defaultValue) so the picker reacts when the user edits the
  // outline textarea in this same dialog. If no book_outline variable exists
  // or the outline has no chapter headings, chapters will be empty and the
  // picker falls back to a plain text input.
  const hasBookOutline = variables.some((v) => v.name === "book_outline");
  const bookOutlineValue = values["book_outline"] ?? "";
  const chapters = useMemo(
    () => parseChaptersFromOutline(bookOutlineValue),
    [bookOutlineValue]
  );

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

  // Per-variable save state: saving, error, or recently-saved indicator.
  const [savingStates, setSavingStates] = useState<
    Record<string, { saving: boolean; error?: string; saved?: boolean }>
  >({});

  // Prompt editor modal state: null = closed, { name, path } = open.
  const [editingPrompt, setEditingPrompt] = useState<{
    name: string;
    path: string;
  } | null>(null);

  // Save-as-default handler: persists the current value of a variable to disk.
  const handleSaveDefault = useCallback(
    async (name: string) => {
      const value = valuesRef.current[name] ?? "";
      setSavingStates((prev) => ({
        ...prev,
        [name]: { saving: true },
      }));
      try {
        await api.saveVariable(projectRoot, name, value);
        setSavingStates((prev) => ({
          ...prev,
          [name]: { saving: false, saved: true },
        }));
        // Clear the saved badge after 2 seconds.
        setTimeout(() => {
          setSavingStates((prev) => {
            const next = { ...prev };
            delete next[name];
            return next;
          });
        }, 2000);
      } catch (err) {
        setSavingStates((prev) => ({
          ...prev,
          [name]: { saving: false, error: String(err) },
        }));
      }
    },
    [projectRoot]
  );

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

          {/* Step summary — compact collapsible preview */}
          {steps && steps.length > 0 && (
            <details className={styles.stepSummary}>
              <summary className={styles.stepSummaryToggle}>
                This workflow runs {steps.length} step{steps.length !== 1 ? "s" : ""} sequentially
              </summary>
              <div className={styles.stepSummaryList}>
                {steps.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className={styles.stepSummaryItem}
                    onClick={() => {
                      if (s.promptFile) {
                        setEditingPrompt({
                          name: s.name,
                          path: `${projectRoot}/${s.promptFile}`,
                        });
                      }
                    }}
                    title={
                      s.promptFile
                        ? `Edit prompt: ${s.promptFile}`
                        : undefined
                    }
                  >
                    <span className={styles.stepSummaryIndex}>{i + 1}.</span>
                    <span className={styles.stepSummaryName}>{s.name}</span>
                    {s.model && (
                      <span className={styles.stepSummaryModel}>{s.model}</span>
                    )}
                  </button>
                ))}
              </div>
            </details>
          )}

          <div className={styles.varList}>
            {variables.map((v, index) => {
              if (isChapterVariable(v.name)) {
                return (
                  <ChapterPickerField
                    key={v.name}
                    info={v}
                    value={values[v.name] ?? ""}
                    onChange={(val) => handleChange(v.name, val)}
                    disabled={isStarting}
                    index={index}
                    chapters={chapters}
                    hasBookOutline={hasBookOutline}
                    bookOutlineValue={bookOutlineValue}
                    onSaveDefault={() => handleSaveDefault(v.name)}
                    saveState={savingStates[v.name]}
                  />
                );
              }
              return (
                <VariableField
                  key={v.name}
                  info={v}
                  value={values[v.name] ?? ""}
                  onChange={(val) => handleChange(v.name, val)}
                  disabled={isStarting}
                  index={index}
                  onSaveDefault={() => handleSaveDefault(v.name)}
                  saveState={savingStates[v.name]}
                />
              );
            })}
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

      {/* Prompt editor modal — opens when a step name is clicked */}
      {editingPrompt && (
        <PromptEditorModal
          isOpen={true}
          projectRoot={projectRoot}
          promptPath={editingPrompt.path}
          promptName={editingPrompt.name}
          onClose={() => setEditingPrompt(null)}
        />
      )}
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
  /** Called to persist the current value as the file-based default. */
  onSaveDefault?: () => void;
  /** Current save state for this variable. */
  saveState?: { saving: boolean; error?: string; saved?: boolean };
}

function VariableField({
  info,
  value,
  onChange,
  disabled,
  index,
  onSaveDefault,
  saveState,
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

      {/* Save as default — only shown when the value has been edited */}
      {value !== info.defaultValue && onSaveDefault && (
        <div className={styles.saveRow}>
          {saveState?.saving ? (
            <span className={styles.savingText}>Saving…</span>
          ) : saveState?.saved ? (
            <span className={styles.savedBadge}>✓ saved</span>
          ) : saveState?.error ? (
            <span className={styles.saveError}>{saveState.error}</span>
          ) : (
            <button
              type="button"
              className={styles.saveBtn}
              onClick={onSaveDefault}
              disabled={disabled}
            >
              Save as default
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChapterPickerField — combobox for chapter-like variables.
//
// Renders a text input with an optional dropdown of chapters parsed from the
// book_outline variable. When a chapter is selected from the dropdown, the
// value sent to onChange is the chapter number (e.g. "3"), but the input
// displays the full label (e.g. "Chapter 3: The Method"). When the user
// types freely, the raw text is both the display and the value.
//
// This display/value divergence is managed with a skipSyncRef: after a
// dropdown selection, we set the flag so the value-sync effect doesn't
// overwrite the display label with the raw chapter number.
//
// Keyboard: ArrowDown/Up navigate, Enter selects, Escape/Tab closes.
// Cmd/Ctrl+Enter passes through to the dialog's global Run handler.
// ---------------------------------------------------------------------------

interface ChapterPickerFieldProps {
  info: VariableInfo;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  /** Index in the list — used for staggered animation delay. */
  index: number;
  /** Chapters parsed from the book_outline variable. Empty if no outline
   *  exists or no chapters were detected. */
  chapters: ChapterOption[];
  /** Whether a book_outline variable exists in the workflow. Used to
   *  distinguish "no outline" from "outline with no chapters". */
  hasBookOutline: boolean;
  /** Current content of the book_outline variable. Used to determine
   *  whether to show the "No chapters detected" hint. */
  bookOutlineValue: string;
  /** Called to persist the current value as the file-based default. */
  onSaveDefault?: () => void;
  /** Current save state for this variable. */
  saveState?: { saving: boolean; error?: string; saved?: boolean };
}

function ChapterPickerField({
  info,
  value,
  onChange,
  disabled,
  index,
  chapters,
  hasBookOutline,
  bookOutlineValue,
  onSaveDefault,
  saveState,
}: ChapterPickerFieldProps) {
  // inputValue is the display text in the input. It can diverge from the
  // value prop: when a chapter is selected from the dropdown, inputValue
  // shows the full label while value (sent to the parent) is the chapter
  // number. When the user types freely, inputValue and value are the same.
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // When a dropdown selection occurs, we set this flag so the value-sync
  // effect below knows to skip — otherwise it would overwrite the display
  // label with the raw chapter number.
  const skipSyncRef = useRef(false);

  const hasChapters = chapters.length > 0;

  // Show the "No chapters detected" hint only when a book_outline variable
  // exists and has content, but no chapters were parsed from it. If there's
  // no book_outline at all, we silently fall back to a text input.
  const showNoChaptersMessage =
    hasBookOutline && bookOutlineValue.trim().length > 0 && !hasChapters;

  // Sync inputValue from value when the value changes externally (e.g.
  // dialog reset on re-open). Skipped after a dropdown selection to
  // preserve the display label.
  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    setInputValue(value);
  }, [value]);

  // Reset highlight when chapters change (e.g., user edits the outline
  // and the parsed chapter list shifts).
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [chapters]);

  const handleSelectChapter = useCallback(
    (chapter: ChapterOption) => {
      skipSyncRef.current = true;
      setInputValue(chapter.label);
      onChange(chapter.value);
      setIsOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.focus();
    },
    [onChange]
  );

  const handleInputChange = useCallback(
    (e: ReactChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setInputValue(text);
      onChange(text);
      if (hasChapters) {
        setIsOpen(true);
        setHighlightedIndex(-1);
      }
    },
    [onChange, hasChapters]
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (!hasChapters) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setIsOpen(true);
          setHighlightedIndex((prev) => {
            if (chapters.length === 0) return -1;
            const next = prev + 1;
            return next >= chapters.length ? 0 : next;
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setIsOpen(true);
          setHighlightedIndex((prev) => {
            if (chapters.length === 0) return -1;
            const next = prev - 1;
            return next < 0 ? chapters.length - 1 : next;
          });
          break;
        case "Enter":
          // Let Cmd/Ctrl+Enter pass through to the dialog's global Run handler.
          if (e.metaKey || e.ctrlKey) return;
          if (
            isOpen &&
            highlightedIndex >= 0 &&
            highlightedIndex < chapters.length
          ) {
            e.preventDefault();
            handleSelectChapter(chapters[highlightedIndex]);
          } else if (isOpen) {
            e.preventDefault();
            setIsOpen(false);
          }
          break;
        case "Escape":
          if (isOpen) {
            e.preventDefault();
            setIsOpen(false);
            setHighlightedIndex(-1);
          }
          break;
        case "Tab":
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
      }
    },
    [hasChapters, isOpen, highlightedIndex, chapters, handleSelectChapter]
  );

  // Close dropdown when clicking outside the picker container. Uses
  // mousedown (not click) so the dropdown closes before the click target's
  // own handler fires — matches the dialog backdrop pattern.
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: globalThis.MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Scroll the highlighted option into view when navigating with arrow keys.
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[highlightedIndex] as
      | HTMLElement
      | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const placeholder = hasChapters
    ? "Select or type a chapter…"
    : "e.g., 3 or Chapter 3";

  return (
    <div
      className={`${styles.varCard} ${styles.chapterCard}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className={styles.varHead}>
        <div className={styles.varLabelGroup}>
          <span className={styles.varLabel}>{info.label}</span>
          <code className={styles.varName}>{info.name}</code>
          <span className={styles.chapterBadge}>chapter picker</span>
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

      <div className={styles.pickerContainer} ref={containerRef}>
        <div className={styles.pickerInputWrap}>
          <input
            ref={inputRef}
            type="text"
            className={styles.pickerInput}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onClick={() => {
              if (hasChapters && !isOpen) setIsOpen(true);
            }}
            disabled={disabled}
            placeholder={placeholder}
            spellCheck={false}
            aria-label={info.label}
            aria-expanded={isOpen}
            aria-autocomplete="list"
            role="combobox"
          />
          {hasChapters && (
            <button
              type="button"
              className={styles.pickerToggle}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setIsOpen((prev) => !prev);
                inputRef.current?.focus();
              }}
              disabled={disabled}
              aria-label="Toggle chapter list"
              tabIndex={-1}
            >
              ▾
            </button>
          )}
        </div>

        {showNoChaptersMessage && (
          <p className={styles.pickerHint}>No chapters detected in outline</p>
        )}

        {isOpen && hasChapters && (
          <div className={styles.pickerDropdown} ref={listRef} role="listbox">
            {chapters.map((chapter, i) => (
              <button
                key={chapter.value}
                type="button"
                role="option"
                aria-selected={i === highlightedIndex}
                className={`${styles.pickerOption} ${
                  i === highlightedIndex ? styles.pickerOptionActive : ""
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectChapter(chapter)}
                onMouseEnter={() => setHighlightedIndex(i)}
              >
                <span className={styles.pickerOptionNum}>{chapter.value}</span>
                <span className={styles.pickerOptionLabel}>
                  {chapter.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Save as default — only shown when the value has been edited */}
      {value !== info.defaultValue && onSaveDefault && (
        <div className={styles.saveRow}>
          {saveState?.saving ? (
            <span className={styles.savingText}>Saving…</span>
          ) : saveState?.saved ? (
            <span className={styles.savedBadge}>✓ saved</span>
          ) : saveState?.error ? (
            <span className={styles.saveError}>{saveState.error}</span>
          ) : (
            <button
              type="button"
              className={styles.saveBtn}
              onClick={onSaveDefault}
              disabled={disabled}
            >
              Save as default
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default WorkflowRunDialog;
