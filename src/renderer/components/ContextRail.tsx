/**
 * Context rail — right-hand tools sidebar.
 *
 * Sections (collapsible):
 *   - Iterate       (expanded by default)
 *   - Variables in effect
 *   - History       (live — WP-17)
 *   - Versions
 *
 * The entire rail can be toggled collapsed/expanded.
 *
 * Version: 0.3.0 | 2026-07-16
 */

import { useState, useCallback, useEffect } from 'react';

import { useVariableStore, SCOPE_LABELS } from '../stores/variableStore';
import { useHistoryStore } from '../stores/historyStore';
import type { CommitInfo } from '../stores/historyStore';
import type { VariableScope } from '../../shared/schemas/variable';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ContextRailProps {
  /** Whether the rail is collapsed. Managed by parent (AppShell). */
  collapsed: boolean;
  /** Called when the user toggles the rail collapse state. */
  onToggleCollapse: () => void;
  /** Active project ID (e.g. 'demo'). Optional — may not have a project loaded. */
  projectId?: string;
  /** Active chapter ID to show history for. Optional — chapter may not be selected. */
  chapterId?: string;
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

// ── Kind badge colors ──────────────────────────────────────────────────────────

const KIND_CLASS: Record<string, string> = {
  auto: 'rail-history__kind--auto',
  manual: 'rail-history__kind--manual',
  restore: 'rail-history__kind--restore',
};

const KIND_LABEL: Record<string, string> = {
  auto: 'auto',
  manual: 'manual',
  restore: 'restored',
};

// ── Formatting helpers ─────────────────────────────────────────────────────────

/**
 * Format an ISO 8601 timestamp as a human-readable relative time string.
 *   < 1 min    → "just now"
 *   < 60 min   → "X min ago"
 *   < 24 h     → "Xh ago"
 *   older      → "Mon DD" (e.g. "Jul 16")
 */
function formatRelativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const date = new Date(isoTimestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a word delta integer as a signed, human-readable string.
 *   +1200  → "+1,200 words"
 *   −340   → "−340 words"
 */
function formatWordDelta(delta: number): string {
  const sign = delta > 0 ? '+' : '\u2212'; // minus sign, not hyphen
  const abs = Math.abs(delta);
  const formatted = abs.toLocaleString();
  return `${sign}${formatted} word${abs === 1 ? '' : 's'}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ContextRail({
  collapsed,
  onToggleCollapse,
  projectId,
  chapterId,
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
    // Use the projectId prop when available; fall back to 'demo' for now
    loadVariables(projectId ?? 'demo');
  }, [loadVariables, projectId]);

  const activeVariables = variables.filter((v) => v.active);
  const pausedVariables = variables.filter((v) => !v.active);

  // ── History data (read from store, auto-load when chapter changes) ───────────

  const {
    commits,
    loading: historyLoading,
    previewSha,
    previewHtml,
    previewLoading,
    error: historyError,
    loadCommits,
    loadMore,
    loadPreview,
    restore,
  } = useHistoryStore();

  useEffect(() => {
    if (projectId && chapterId) {
      const ref = `refs/plotline/chapters/${chapterId}/main`;
      loadCommits(projectId, ref);
    }
  }, [projectId, chapterId, loadCommits]);

  // ── Render ───────────────────────────────────────────────────────────────────

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
                    <HistorySection
                      chapterId={chapterId}
                      projectId={projectId}
                      commits={commits}
                      loading={historyLoading}
                      previewSha={previewSha}
                      previewHtml={previewHtml}
                      previewLoading={previewLoading}
                      error={historyError}
                      onLoadMore={() => {
                        if (projectId && chapterId && commits.length > 0) {
                          const oldest = commits[commits.length - 1]!;
                          const ref = `refs/plotline/chapters/${chapterId}/main`;
                          loadMore(projectId, ref, oldest.sha);
                        }
                      }}
                      onPreview={(sha: string) => {
                        if (projectId && chapterId) {
                          const ref = `refs/plotline/chapters/${chapterId}/main`;
                          loadPreview(projectId, ref, sha);
                        }
                      }}
                      onRestore={(sha: string) => {
                        if (projectId && chapterId) {
                          const ref = `refs/plotline/chapters/${chapterId}/main`;
                          restore(projectId, ref, sha);
                        }
                      }}
                    />
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

// ── History Section sub-component ──────────────────────────────────────────────

interface HistorySectionProps {
  chapterId?: string;
  projectId?: string;
  commits: CommitInfo[];
  loading: boolean;
  previewSha: string | null;
  previewHtml: string;
  previewLoading: boolean;
  error: string | null;
  onLoadMore: () => void;
  onPreview: (sha: string) => void;
  onRestore: (sha: string) => void;
}

function HistorySection({
  chapterId,
  commits,
  loading,
  previewSha,
  previewHtml,
  previewLoading,
  error,
  onLoadMore,
  onPreview,
  onRestore,
}: HistorySectionProps): JSX.Element {
  // ── No chapter selected ──────────────────────────────────────────────────────

  if (!chapterId) {
    return (
      <div className="rail-history__empty">
        Select a chapter to view its revision history.
      </div>
    );
  }

  // ── Initial loading (no commits yet) ─────────────────────────────────────────

  if (loading && commits.length === 0) {
    return (
      <div className="rail-history__loading">
        <span className="rail-history__spinner" />
        <span>Loading history...</span>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────

  if (error && commits.length === 0) {
    return <div className="rail-history__error">{error}</div>;
  }

  // ── Empty state (loaded, no commits) ─────────────────────────────────────────

  if (!loading && commits.length === 0) {
    return (
      <div className="rail-history__empty">
        No revision history for this chapter yet.
      </div>
    );
  }

  // ── Commit list ──────────────────────────────────────────────────────────────

  return (
    <div className="rail-history">
      {error && (
        <div className="rail-history__error rail-history__error--banner">
          {error}
        </div>
      )}

      <div className="rail-history__list">
        {commits.map((commit) => {
          const isExpanded = previewSha === commit.sha;
          const kindClass = KIND_CLASS[commit.kind] ?? 'rail-history__kind--auto';
          const kindLabel = KIND_LABEL[commit.kind] ?? commit.kind;

          return (
            <div key={commit.sha} className="rail-history__item">
              {/* Commit row */}
              <div
                className={`rail-history__commit${isExpanded ? ' rail-history__commit--expanded' : ''}`}
                onClick={() => onPreview(commit.sha)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPreview(commit.sha);
                  }
                }}
              >
                <span className="rail-history__commit-label">
                  {commit.label}
                </span>
                <div className="rail-history__commit-meta">
                  <span className={`rail-history__kind ${kindClass}`}>
                    {kindLabel}
                  </span>
                  <span className="rail-history__time">
                    {formatRelativeTime(commit.timestamp)}
                  </span>
                  {commit.wordDelta != null && (
                    <span
                      className={`rail-history__delta ${
                        commit.wordDelta >= 0
                          ? 'rail-history__delta--positive'
                          : 'rail-history__delta--negative'
                      }`}
                    >
                      {formatWordDelta(commit.wordDelta)}
                    </span>
                  )}
                </div>
              </div>

              {/* Expanded preview */}
              {isExpanded && (
                <div className="rail-history__commit-preview">
                  {previewLoading ? (
                    <div className="rail-history__loading">
                      <span className="rail-history__spinner" />
                      <span>Loading preview...</span>
                    </div>
                  ) : (
                    <>
                      <div
                        className="rail-history__preview-content"
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                      />
                      <button
                        type="button"
                        className="rail-history__commit-restore"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestore(commit.sha);
                        }}
                      >
                        Restore this revision
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Load more — shown when there are commits (backend may have more) */}
      {commits.length >= 20 && (
        <button
          type="button"
          className="rail-history__load-more"
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
