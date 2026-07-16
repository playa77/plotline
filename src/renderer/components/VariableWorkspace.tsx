/**
 * VariableWorkspace — Variable Studio for managing story variables.
 *
 * Two-column layout: scrollable sidebar list on the left (~280px),
 * selected variable's content and controls on the right.
 *
 * Core variables (tone, style, constraints, characters) are always
 * shown — if not yet created they appear dimmed with a "+ Create" action.
 * Custom variables appear in their own section.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react';

import { Editor } from './Editor';
import { useVariableStore, SCOPE_LABELS } from '../stores/variableStore';
import type { Variable, VariableScope, CoreVariableType } from '../../shared/schemas/variable';

import './Editor.css';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Human-readable labels for the four core variable types. */
const CORE_LABELS: Record<CoreVariableType, string> = {
  tone: 'Tone',
  style: 'Writing Style',
  constraints: 'Plot Constraints',
  characters: 'Character / Voice Sheets',
};

/** Default scope for newly created core variables. */
const DEFAULT_CORE_SCOPE: VariableScope = 'manual';

/** Scope options for the dropdown. */
const SCOPE_OPTIONS: VariableScope[] = ['always', 'expand', 'write', 'manual'];

// ── Props ───────────────────────────────────────────────────────────────────────

interface VariableWorkspaceProps {
  /** Project ID. Hardcoded to 'demo' until project selection exists. */
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
    updateScope,
    toggleActive,
    saveContent,
    loadCards,
    selectCard,
    addCard,
    saveCardContent,
    removeCard,
  } = useVariableStore();

  // ── Local UI state ──────────────────────────────────────────────────────────

  const [creatingCore, setCreatingCore] = useState<CoreVariableType | null>(null);
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [deletingCard, setDeletingCard] = useState<string | null>(null);
  const [newVariableName, setNewVariableName] = useState('');
  const [addingCustom, setAddingCustom] = useState(false);
  const newVarInputRef = useRef<HTMLInputElement>(null);

  // ── Load variables on mount ──────────────────────────────────────────────────

  useEffect(() => {
    loadVariables(projectId);
  }, [loadVariables, projectId]);

  // ── Derived state ────────────────────────────────────────────────────────────

  const selectedVariable = variables.find((v) => v.id === selectedVariableId) ?? null;

  /** Which core types have a corresponding variable already. */
  const existingCoreTypes = new Set(
    variables.filter((v) => v.core !== null).map((v) => v.core as CoreVariableType),
  );

  /** Variables that are not core (user-created). */
  const customVariables = variables.filter((v) => v.core === null);

  // ── Determine which content to show in the editor ───────────────────────────

  const isCharacterVariable = selectedVariable?.core === 'characters';
  const activeCard = cards.find((c) => c.cardId === selectedCardId) ?? null;

  // If viewing a character variable with a selected card, show card content;
  // otherwise show the variable content directly.
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

  const handleCreateCore = useCallback(
    async (core: CoreVariableType) => {
      setCreatingCore(core);
      const variable = await createVariable(projectId, CORE_LABELS[core], core, DEFAULT_CORE_SCOPE);
      setCreatingCore(null);
      if (variable) {
        selectVariable(projectId, variable.id);
      }
    },
    [projectId, createVariable, selectVariable],
  );

  const handleScopeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (selectedVariableId) {
        updateScope(projectId, selectedVariableId, e.target.value as VariableScope);
      }
    },
    [projectId, selectedVariableId, updateScope],
  );

  const handleToggleActive = useCallback(() => {
    if (selectedVariable) {
      toggleActive(projectId, selectedVariable.id, !selectedVariable.active);
    }
  }, [projectId, selectedVariable, toggleActive]);

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
    // Focus the input after render
    setTimeout(() => newVarInputRef.current?.focus(), 0);
  }, []);

  const handleConfirmAddCustom = useCallback(() => {
    if (newVariableName.trim()) {
      createVariable(projectId, newVariableName.trim(), null);
    }
    setAddingCustom(false);
    setNewVariableName('');
  }, [projectId, newVariableName, createVariable]);

  const handleCancelAddCustom = useCallback(() => {
    setAddingCustom(false);
    setNewVariableName('');
  }, []);

  // ── Render helpers ───────────────────────────────────────────────────────────

  const renderScopeBadge = (scope: VariableScope): JSX.Element => (
    <span className={`variable-scope-badge variable-scope-badge--${scope}`}>
      {SCOPE_LABELS[scope]}
    </span>
  );

  const renderActiveDot = (active: boolean): JSX.Element => (
    <span
      className={`variable-active-dot${active ? ' variable-active-dot--active' : ' variable-active-dot--paused'}`}
      title={active ? 'Active' : 'Paused'}
    />
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="variable-workspace">
      {/* ═══ Left sidebar ═══════════════════════════════════════════════════════ */}
      <aside className="variable-sidebar">
        <div className="variable-sidebar__list">
          {/* ── Core section ───────────────────────────────────────────────── */}
          <div className="variable-sidebar__section-header">Core</div>

          {CORE_VARIABLE_TYPES.map((coreType) => {
            const existing = variables.find((v) => v.core === coreType);
            const isSelected = existing?.id === selectedVariableId;

            if (existing) {
              return (
                <div
                  key={coreType}
                  className={`variable-row${isSelected ? ' variable-row--selected' : ''}`}
                  onClick={() => handleSelectRow(existing.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSelectRow(existing.id);
                  }}
                >
                  <span className="variable-row__name">{existing.name}</span>
                  {renderScopeBadge(existing.scope)}
                  {renderActiveDot(existing.active)}
                </div>
              );
            }

            // Not yet created — show dimmed placeholder
            return (
              <div
                key={coreType}
                className="variable-row variable-row--dimmed"
              >
                <span className="variable-row__name">{CORE_LABELS[coreType]}</span>
                {creatingCore === coreType ? (
                  <span className="variable-row__create">Creating...</span>
                ) : (
                  <span
                    className="variable-row__create"
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateCore(coreType);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        handleCreateCore(coreType);
                      }
                    }}
                  >
                    + Create
                  </span>
                )}
              </div>
            );
          })}

          {/* ── Custom section ──────────────────────────────────────────────── */}
          {customVariables.length > 0 && (
            <>
              <div className="variable-sidebar__section-header">
                Custom
              </div>
              {customVariables.map((v) => (
                <div
                  key={v.id}
                  className={`variable-row${v.id === selectedVariableId ? ' variable-row--selected' : ''}`}
                  onClick={() => handleSelectRow(v.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSelectRow(v.id);
                  }}
                >
                  <span className="variable-row__name">{v.name}</span>
                  {renderScopeBadge(v.scope)}
                  {renderActiveDot(v.active)}
                </div>
              ))}
            </>
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

              <div className="variable-content__spacer" />

              {/* Scope selector */}
              <select
                className="variable-scope-select"
                value={selectedVariable.scope}
                onChange={handleScopeChange}
                aria-label="Variable scope"
              >
                {SCOPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {SCOPE_LABELS[opt]}
                  </option>
                ))}
              </select>

              {/* Active toggle */}
              <button
                type="button"
                className={`variable-active-toggle${selectedVariable.active ? ' variable-active-toggle--active' : ''}`}
                onClick={handleToggleActive}
                title={selectedVariable.active ? 'Click to pause' : 'Click to activate'}
                aria-label={selectedVariable.active ? 'Pause variable' : 'Activate variable'}
              >
                <span className="variable-active-toggle__dot" />
                <span>{selectedVariable.active ? 'Active' : 'Paused'}</span>
              </button>
            </div>

            {/* ── Card list (character variables only) ──────────────────────── */}
            {isCharacterVariable && (
              <div className="variable-cards">
                {cards.map((card) =>
                  deletingCard === card.cardId ? (
                    <div key={card.cardId} className="variable-delete-confirm">
                      <span className="variable-delete-confirm__text">
                        Delete "{card.title}"?
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
                <Editor
                  content={editorContent}
                  onSave={handleSave}
                />
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

// ── Re-export for convenience ──────────────────────────────────────────────────

// The four core variable types as a tuple for iteration
const CORE_VARIABLE_TYPES: CoreVariableType[] = ['tone', 'style', 'constraints', 'characters'];
