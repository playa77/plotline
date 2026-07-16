/**
 * Context rail — right-hand tools sidebar.
 *
 * Sections (collapsible):
 *   - Iterate       (expanded by default)
 *   - Variables in effect
 *   - History
 *   - Versions
 *
 * The entire rail can be toggled collapsed/expanded.
 *
 * Version: 0.2.0 | 2026-07-16
 */

import { useState, useCallback, useEffect } from 'react';

import { useVariableStore, SCOPE_LABELS } from '../stores/variableStore';
import type { VariableScope } from '../../shared/schemas/variable';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ContextRailProps {
  /** Whether the rail is collapsed. Managed by parent (AppShell). */
  collapsed: boolean;
  /** Called when the user toggles the rail collapse state. */
  onToggleCollapse: () => void;
}

// ── Rail section definition ────────────────────────────────────────────────────

interface RailSectionDef {
  id: string;
  label: string;
}

const RAIL_SECTIONS: RailSectionDef[] = [
  { id: 'iterate', label: 'Iterate' },
  { id: 'variables', label: 'Variables in effect' },
  { id: 'history', label: 'History' },
  { id: 'versions', label: 'Versions' },
];

// ── Scope badge colors (matching variable-workspace) ───────────────────────────

const SCOPE_COLORS: Record<VariableScope, string> = {
  always: 'var(--color-accent)',
  expand: 'var(--color-on-target)',
  write: 'var(--color-stale)',
  manual: 'var(--color-text-muted)',
};

// ── Component ──────────────────────────────────────────────────────────────────

export function ContextRail({
  collapsed,
  onToggleCollapse,
}: ContextRailProps): JSX.Element {
  // Track which sections are expanded (first one by default)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set([RAIL_SECTIONS[0]!.id]),
  );

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  // ── Variable data (read from store, auto-load on mount) ──────────────────────

  const { variables, loadVariables } = useVariableStore();

  useEffect(() => {
    loadVariables('demo');
  }, [loadVariables]);

  const activeVariables = variables.filter((v) => v.active);
  const pausedVariables = variables.filter((v) => !v.active);

  return (
    <div className={`context-rail${collapsed ? ' context-rail--collapsed' : ''}`}>
      {/* Header with toggle button */}
      <div className="context-rail__header">
        <span className="context-rail__title">Context</span>
        <button
          type="button"
          className="context-rail__toggle"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand context rail' : 'Collapse context rail'}
          aria-label={collapsed ? 'Expand context rail' : 'Collapse context rail'}
        >
          {collapsed ? '\u25C0' : '\u25B6'}
        </button>
      </div>

      {/* Sections */}
      <div className="context-rail__body">
        {RAIL_SECTIONS.map((section) => {
          const isExpanded = expandedSections.has(section.id);
          return (
            <div key={section.id} className="rail-section">
              <div
                className="rail-section__header"
                onClick={() => toggleSection(section.id)}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleSection(section.id);
                  }
                }}
              >
                <span
                  className={`rail-section__toggle${isExpanded ? '' : ' rail-section__toggle--collapsed'}`}
                  aria-hidden="true"
                >
                  {'\u25BE'}
                </span>
                <span>{section.label}</span>
              </div>

              {isExpanded && (
                <div className="rail-section__body">
                  {section.id === 'iterate' && (
                    <textarea
                      className="rail-placeholder"
                      disabled
                      rows={3}
                      defaultValue="Enter your iteration prompt here..."
                    />
                  )}
                  {section.id === 'variables' && (
                    <div className="rail-variables">
                      {variables.length === 0 ? (
                        <div className="rail-placeholder-text">
                          No variables active in the current selection.
                        </div>
                      ) : (
                        <>
                          {activeVariables.length > 0 && (
                            <div className="rail-variables__group">
                              <div className="rail-variables__group-label">
                                Active ({activeVariables.length})
                              </div>
                              {activeVariables.map((v) => (
                                <div key={v.id} className="rail-variable-item">
                                  <span
                                    className="rail-variable-item__dot rail-variable-item__dot--active"
                                    title="Active"
                                  />
                                  <span className="rail-variable-item__name">
                                    {v.name}
                                  </span>
                                  <span
                                    className="rail-variable-item__scope"
                                    style={{ color: SCOPE_COLORS[v.scope] }}
                                  >
                                    {SCOPE_LABELS[v.scope]}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {pausedVariables.length > 0 && (
                            <div className="rail-variables__group">
                              <div className="rail-variables__group-label">
                                Paused ({pausedVariables.length})
                              </div>
                              {pausedVariables.map((v) => (
                                <div key={v.id} className="rail-variable-item">
                                  <span
                                    className="rail-variable-item__dot"
                                    title="Paused"
                                  />
                                  <span className="rail-variable-item__name">
                                    {v.name}
                                  </span>
                                  <span
                                    className="rail-variable-item__scope"
                                    style={{ color: SCOPE_COLORS[v.scope] }}
                                  >
                                    {SCOPE_LABELS[v.scope]}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {section.id === 'history' && (
                    <div className="rail-placeholder-text">
                      Revision history will appear here.
                    </div>
                  )}
                  {section.id === 'versions' && (
                    <div className="rail-placeholder-text">
                      Chapter versions will appear here.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
