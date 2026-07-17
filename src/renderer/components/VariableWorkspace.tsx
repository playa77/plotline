/**
 * VariableWorkspace — Variable Studio for managing story variables.
 *
 * Three-group layout in the left sidebar:
 *   - System: Global Constraints (scope locked, name not editable, no delete)
 *   - Built-in: Tone, Writing Style, Plot Constraints, Character Sheets
 *              (scope editable, name not editable, no delete)
 *   - Custom: user-created variables (full editing, reorder, delete)
 *
 * Right panel: TipTap rich-text editor for the selected variable's content.
 * Character / Voice Sheet variables show card tabs above the editor.
 *
 * Version: 0.2.0 | 2026-07-17
 */

import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react';

import { Editor } from './Editor';
import { useVariableStore } from '../stores/variableStore';
import type { StoryVariable, VariableScope } from '../../shared/schemas/variable';
import {
  VARIABLE_SCOPES,
  BUILTIN_SLUGS,
  RESERVED_DISPLAY_NAMES,
} from '../../shared/schemas/variable';

import './Editor.css';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Scope options for the dropdown. */
const SCOPE_OPTIONS: VariableScope[] = [...VARIABLE_SCOPES];

/** Scope labels for the dropdown. */
const SCOPE_LABELS: Record<VariableScope, string> = {
  always: 'Always',
  expand: 'On Expand',
  write: 'On Write',
  manual: 'Manual',
};

// ── Props ───────────────────────────────────────────────────────────────────────

interface VariableWorkspaceProps {
  projectId?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function VariableWorkspace({
  projectId = 'demo',
}: VariableWorkspaceProps): JSX.Element {
  const {
    variables,
    selectedVariableId,
    variableContent,
    cards,
    selectedCardId,
    cardContent,
    loadVariables,
    selectVariable,
    createVariable,
    renameVariable,
    updateScope,
    saveContent,
    deleteVariable,
    reorderVariables,
    selectCard,
    addCard,
    saveCardContent,
    removeCard,
  } = useVariableStore();

  // ── Local UI state ──────────────────────────────────────────────────────────

  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [deletingCard, setDeletingCard] = useState<string | null>(null);
  const [newVariableName, setNewVariableName] = useState('');
  const [addingCustom, setAddingCustom] = useState(false);
  const newVarInputRef = useRef<HTMLInputElement>(null);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Load variables on mount ──────────────────────────────────────────────────

  useEffect(() => {
    loadVariables(projectId);
  }, [loadVariables, projectId]);

  // ── Derived state ────────────────────────────────────────────────────────────

  const selectedVariable = variables.find((v) => v.id === selectedVariableId) ?? null;

  /** System variables (Global Constraints). */
  const systemVars = variables
    .filter((v) => v.kind === 'system')
    .sort((a, b) => a.position - b.position);

  /** Built-in variables (tone, style, constraints, characters). */
  const builtinVars = variables
    .filter((v) => v.kind === 'builtin')
    .sort((a, b) => a.position - b.position);

  /** Custom variables, sorted by position. */
  const customVars = variables
    .filter((v) => v.kind === 'custom')
    .sort((a, b) => a.position - b.position);

  // Which builtin slugs are not yet created
  const existingBuiltinIds = new Set(builtinVars.map((v) => v.id));
  const missingBuiltins = BUILTIN_SLUGS.filter((s) => !existingBuiltinIds.has(s));

  // ── Determine which content to show in the editor ───────────────────────────

  const isCharacterVariable =
    selectedVariable?.kind === 'builtin' && selectedVariable.id === 'characters';

  const editorContent: string = (() => {
    if (isCharacterVariable && selectedCardId) {
      return cardContent[selectedCardId] ?? '<p></p>';
    }
    if (selectedVariableId) {
      return variableContent[selectedVariableId] ?? '<p></p>';
    }
    return '<p></p>';
  })();

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSelectRow = useCallback(
    (id: string) => {
      selectVariable(projectId, id);
    },
    [projectId, selectVariable],
  );

  const handleScopeChange = useCallback(
    (varId: string, scope: VariableScope) => {
      updateScope(projectId, varId, scope);
    },
    [projectId, updateScope],
  );

  const handleSave = useCallback(
    (html: string) => {
      if (isCharacterVariable && selectedCardId) {
        saveCardContent(projectId, selectedCardId, html);
      } else if (selectedVariableId) {
        saveContent(projectId, selectedVariableId, html);
      }
    },
    [
      projectId,
      isCharacterVariable,
      selectedCardId,
      selectedVariableId,
      saveContent,
      saveCardContent,
    ],
  );

  const handleAddCard = useCallback(() => {
    setAddingCard(true);
    setNewCardTitle('');
  }, []);

  const handleConfirmAddCard = useCallback(() => {
    if (newCardTitle.trim()) {
      addCard(projectId, newCardTitle.trim());
    }
    setAddingCard(false);
    setNewCardTitle('');
  }, [projectId, newCardTitle, addCard]);

  const handleCancelAddCard = useCallback(() => {
    setAddingCard(false);
    setNewCardTitle('');
  }, []);

  const handleRemoveCard = useCallback(
    (cardId: string) => {
      removeCard(projectId, cardId);
      setDeletingCard(null);
    },
    [projectId, removeCard],
  );

  const handleStartAddCustom = useCallback(() => {
    setAddingCustom(true);
    setNewVariableName('');
    setTimeout(() => newVarInputRef.current?.focus(), 0);
  }, []);

  const handleConfirmAddCustom = useCallback(() => {
    if (newVariableName.trim()) {
      createVariable(projectId, newVariableName.trim());
    }
    setAddingCustom(false);
    setNewVariableName('');
  }, [projectId, newVariableName, createVariable]);

  const handleCancelAddCustom = useCallback(() => {
    setAddingCustom(false);
    setNewVariableName('');
  }, []);

  // ── Inline rename handlers ──────────────────────────────────────────────────

  const handleStartRename = useCallback((varId: string, currentName: string) => {
    setRenamingId(varId);
    setRenameValue(currentName);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }, []);

  const handleConfirmRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameVariable(projectId, renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }, [projectId, renamingId, renameValue, renameVariable]);

  const handleCancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue('');
  }, []);

  // ── Delete handler ──────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    (varId: string) => {
      deleteVariable(projectId, varId);
      setDeletingId(null);
    },
    [projectId, deleteVariable],
  );

  // ── Reorder handlers ────────────────────────────────────────────────────────

  const handleMoveUp = useCallback(
    (varId: string, currentPos: number) => {
      if (currentPos > 0) {
        reorderVariables(projectId, varId, currentPos - 1);
      }
    },
    [projectId, reorderVariables],
  );

  const handleMoveDown = useCallback(
    (varId: string, currentPos: number) => {
      reorderVariables(projectId, varId, currentPos + 1);
    },
    [projectId, reorderVariables],
  );

  // ── Render helpers ───────────────────────────────────────────────────────────

  const renderScopeBadge = (scope: VariableScope): JSX.Element => (
    <span className={`variable-scope-badge variable-scope-badge--${scope}`}>
      {SCOPE_LABELS[scope]}
    </span>
  );

  const renderScopeSelect = (
    v: StoryVariable,
    disabled: boolean,
    tooltip?: string,
  ): JSX.Element => {
    const select = (
      <select
        className={`variable-scope-select${disabled ? ' variable-scope-select--disabled' : ''}`}
        value={v.scope}
        onChange={(e) => handleScopeChange(v.id, e.target.value as VariableScope)}
        disabled={disabled}
        aria-label="Variable scope"
        title={tooltip}
      >
        {SCOPE_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {SCOPE_LABELS[opt]}
          </option>
        ))}
      </select>
    );

    if (tooltip && disabled) {
      return (
        <span className="variable-tooltip-wrapper" title={tooltip}>
          {select}
        </span>
      );
    }
    return select;
  };

  const renderRowName = (v: StoryVariable): JSX.Element => {
    if (renamingId === v.id) {
      return (
        <input
          ref={renameInputRef}
          className="variable-row__name-input"
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleCancelRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirmRename();
            if (e.key === 'Escape') handleCancelRename();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      );
    }

    return (
      <span
        className={`variable-row__name${v.renamable ? ' variable-row__name--editable' : ''}`}
        onClick={
          v.renamable
            ? (e) => {
                e.stopPropagation();
                handleStartRename(v.id, v.name);
              }
            : undefined
        }
        title={v.renamable ? 'Click to rename' : undefined}
      >
        {v.name}
      </span>
    );
  };

  const renderRow = (v: StoryVariable, isSelected: boolean): JSX.Element => {
    const showDelete = v.deletable;
    const showReorder = v.kind === 'custom';
    const scopeDisabled = v.scopeLocked;
    const scopeTooltip = scopeDisabled
      ? 'Global Constraints are injected into every generation call. Scope is not configurable.'
      : undefined;

    return (
      <div
        key={v.id}
        className={`variable-row${isSelected ? ' variable-row--selected' : ''}`}
        onClick={() => handleSelectRow(v.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSelectRow(v.id);
        }}
      >
        {showReorder && (
          <span className="variable-row__grip" title="Drag to reorder">
            ⠿
          </span>
        )}
        {renderRowName(v)}
        {v.kind === 'system' && (
          <span className="variable-kind-badge variable-kind-badge--system">
            System
          </span>
        )}
        {renderScopeSelect(v, scopeDisabled, scopeTooltip)}
        {showReorder && (
          <span className="variable-row__reorder-arrows">
            <button
              type="button"
              className="variable-row__reorder-btn"
              title="Move up"
              aria-label="Move up"
              onClick={(e) => {
                e.stopPropagation();
                handleMoveUp(v.id, v.position);
              }}
            >
              ▲
            </button>
            <button
              type="button"
              className="variable-row__reorder-btn"
              title="Move down"
              aria-label="Move down"
              onClick={(e) => {
                e.stopPropagation();
                handleMoveDown(v.id, v.position);
              }}
            >
              ▼
            </button>
          </span>
        )}
        {showDelete &&
          (deletingId === v.id ? (
            <span className="variable-delete-inline">
              <span className="variable-delete-inline__text">Delete?</span>
              <button
                type="button"
                className="variable-delete-inline__btn variable-delete-inline__btn--confirm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(v.id);
                }}
              >
                Yes
              </button>
              <button
                type="button"
                className="variable-delete-inline__btn variable-delete-inline__btn--cancel"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingId(null);
                }}
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="variable-row__delete-btn"
              title="Delete variable"
              aria-label={`Delete ${v.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setDeletingId(v.id);
              }}
            >
              ×
            </button>
          ))}
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="variable-workspace">
      {/* ═══ Left sidebar ═══════════════════════════════════════════════════════ */}
      <aside className="variable-sidebar">
        <div className="variable-sidebar__list">
          {/* ── System group ─────────────────────────────────────────────────── */}
          <div className="variable-sidebar__section-header">System</div>
          {systemVars.length > 0 ? (
            systemVars.map((v) => renderRow(v, v.id === selectedVariableId))
          ) : (
            <div className="variable-empty-group">
              Global Constraints not yet initialized.
            </div>
          )}

          {/* ── Built-in group ───────────────────────────────────────────────── */}
          <div className="variable-sidebar__section-header">Built-in</div>
          {builtinVars.map((v) => renderRow(v, v.id === selectedVariableId))}
          {missingBuiltins.map((slug) => (
            <div key={slug} className="variable-row variable-row--dimmed">
              <span className="variable-row__name">
                {RESERVED_DISPLAY_NAMES[slug as keyof typeof RESERVED_DISPLAY_NAMES]}
              </span>
              <span className="variable-row__create-placeholder">Not created</span>
            </div>
          ))}

          {/* ── Custom group ─────────────────────────────────────────────────── */}
          <div className="variable-sidebar__section-header">Custom</div>
          {customVars.length > 0 ? (
            customVars.map((v) => renderRow(v, v.id === selectedVariableId))
          ) : (
            <div className="variable-empty-group">
              No custom variables yet. Create one to guide generation with your own context.
            </div>
          )}
        </div>

        {/* ── Footer: New Variable ─────────────────────────────────────────── */}
        <div className="variable-sidebar__footer">
          {addingCustom ? (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                handleConfirmAddCustom();
              }}
              style={{ display: 'flex', gap: 'var(--space-sm)' }}
            >
              <input
                ref={newVarInputRef}
                className="variable-card-input"
                type="text"
                value={newVariableName}
                placeholder="Variable name..."
                onChange={(e) => setNewVariableName(e.target.value)}
                onBlur={handleCancelAddCustom}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') handleCancelAddCustom();
                }}
                style={{ flex: 1 }}
              />
            </form>
          ) : (
            <button
              type="button"
              className="variable-new-btn"
              onClick={handleStartAddCustom}
            >
              <span className="variable-new-btn__icon">+</span>
              <span>New Variable</span>
            </button>
          )}
        </div>
      </aside>

      {/* ═══ Right content area ═════════════════════════════════════════════════ */}
      <div className="variable-content">
        {selectedVariable ? (
          <>
            {/* ── Header ────────────────────────────────────────────────────── */}
            <div className="variable-content__header">
              <span className="variable-content__name">
                {selectedVariable.name}
              </span>
              {selectedVariable.kind === 'system' && (
                <span className="variable-kind-badge variable-kind-badge--system">
                  System
                </span>
              )}

              <div className="variable-content__spacer" />

              {/* Scope selector */}
              {renderScopeSelect(
                selectedVariable,
                selectedVariable.scopeLocked,
                selectedVariable.scopeLocked
                  ? 'Global Constraints are injected into every generation call. Scope is not configurable.'
                  : undefined,
              )}
            </div>

            {/* ── Card list (character variables only) ──────────────────────── */}
            {isCharacterVariable && (
              <div className="variable-cards">
                {cards.map((card) =>
                  deletingCard === card.cardId ? (
                    <div key={card.cardId} className="variable-delete-confirm">
                      <span className="variable-delete-confirm__text">
                        Delete &ldquo;{card.title}&rdquo;?
                      </span>
                      <button
                        type="button"
                        className="variable-delete-confirm__btn variable-delete-confirm__btn--confirm"
                        onClick={() => handleRemoveCard(card.cardId)}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className="variable-delete-confirm__btn variable-delete-confirm__btn--cancel"
                        onClick={() => setDeletingCard(null)}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <div
                      key={card.cardId}
                      className={`variable-card-chip${card.cardId === selectedCardId ? ' variable-card-chip--selected' : ''}`}
                      onClick={() => selectCard(projectId, card.cardId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') selectCard(projectId, card.cardId);
                      }}
                    >
                      <span>{card.title}</span>
                      <button
                        type="button"
                        className="variable-card-chip__delete"
                        aria-label={`Delete card "${card.title}"`}
                        title={`Delete "${card.title}"`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingCard(card.cardId);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ),
                )}

                {addingCard ? (
                  <input
                    className="variable-card-input"
                    type="text"
                    value={newCardTitle}
                    placeholder="Card title..."
                    autoFocus
                    onChange={(e) => setNewCardTitle(e.target.value)}
                    onBlur={handleCancelAddCard}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmAddCard();
                      if (e.key === 'Escape') handleCancelAddCard();
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="variable-add-card-btn"
                    aria-label="Add character card"
                    title="Add card"
                    onClick={handleAddCard}
                  >
                    +
                  </button>
                )}
              </div>
            )}

            {/* ── Editor ────────────────────────────────────────────────────── */}
            <div className="variable-content__body">
              <div className="variable-content__editor">
                <Editor content={editorContent} onSave={handleSave} />
              </div>
            </div>
          </>
        ) : (
          /* ── Empty state ────────────────────────────────────────────────── */
          <div className="variable-empty">
            <div className="variable-empty__content">
              <div className="variable-empty__heading">Variable Studio</div>
              <div className="variable-empty__text">
                Select a variable from the list on the left, or create a new one
                to begin setting up story context for generation.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
