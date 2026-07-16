/**
 * VersionPanel — chapter version management inside the ContextRail.
 *
 * Lists versions for the current chapter with inline actions:
 * select, rename, archive, plus a "New Version" create flow.
 *
 * Uses the versionStore for all IPC calls. Follows the same visual
 * language as the History section (dense rows, expandable actions).
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { useState, useEffect, useCallback } from 'react';

import { useVersionStore } from '../stores/versionStore';
import type { VersionInfo } from '../stores/versionStore';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VersionPanelProps {
  projectId: string;
  chapterId?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Format an ISO timestamp as a relative string: "2 days ago", "Jul 16". */
function formatCreatedAt(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;

  return new Date(isoTimestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

export function VersionPanel({
  projectId,
  chapterId,
}: VersionPanelProps): JSX.Element {
  const {
    versions,
    loading,
    error,
    loadVersions,
    createVersion,
    selectVersion,
    renameVersion,
    archiveVersion,
  } = useVersionStore();

  // ── Local UI state ───────────────────────────────────────────────────────

  const [showCreateInput, setShowCreateInput] = useState<boolean>(false);
  const [newVersionName, setNewVersionName] = useState<string>('');
  const [renameSlug, setRenameSlug] = useState<string | null>(null);
  const [renameText, setRenameText] = useState<string>('');
  const [archiveConfirmSlug, setArchiveConfirmSlug] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Load on mount & chapter change ───────────────────────────────────────

  useEffect(() => {
    if (chapterId) {
      loadVersions(projectId, chapterId);
    }
  }, [projectId, chapterId, loadVersions]);

  // ── No chapter selected ──────────────────────────────────────────────────

  if (!chapterId) {
    return (
      <div className="rail-version__empty">
        Select a chapter to manage versions.
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading && versions.length === 0) {
    return (
      <div className="rail-version__loading">
        <span className="rail-version__spinner" />
        <span>Loading versions…</span>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────

  if (error && versions.length === 0) {
    return <div className="rail-version__error">{error}</div>;
  }

  // ── Empty ────────────────────────────────────────────────────────────────

  if (!loading && versions.length === 0) {
    return (
      <div className="rail-version__empty">
        No versions for this chapter yet.
        <div className="rail-version__empty-create">
          <button
            type="button"
            className="rail-version__create-btn"
            onClick={() => setShowCreateInput(true)}
          >
            Create First Version
          </button>
        </div>
      </div>
    );
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (slug: string) => {
      if (!chapterId) return;
      const version = versions.find((v) => v.slug === slug);
      if (version?.selected) return; // already selected
      selectVersion(projectId, chapterId, slug);
    },
    [projectId, chapterId, versions, selectVersion],
  );

  const handleCreate = useCallback(async () => {
    if (!chapterId || !newVersionName.trim()) return;
    setActionError(null);
    try {
      await createVersion(projectId, chapterId, newVersionName.trim());
      setNewVersionName('');
      setShowCreateInput(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to create version',
      );
    }
  }, [projectId, chapterId, newVersionName, createVersion]);

  const handleRenameStart = useCallback(
    (slug: string, currentName: string) => {
      setRenameSlug(slug);
      setRenameText(currentName);
      setArchiveConfirmSlug(null);
      setActionError(null);
    },
    [],
  );

  const handleRenameSave = useCallback(async () => {
    if (!chapterId || !renameSlug || !renameText.trim()) return;
    setActionError(null);
    try {
      await renameVersion(projectId, chapterId, renameSlug, renameText.trim());
      setRenameSlug(null);
      setRenameText('');
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to rename version',
      );
    }
  }, [projectId, chapterId, renameSlug, renameText, renameVersion]);

  const handleRenameCancel = useCallback(() => {
    setRenameSlug(null);
    setRenameText('');
  }, []);

  const handleArchiveConfirm = useCallback((slug: string) => {
    setArchiveConfirmSlug(slug);
    setRenameSlug(null);
    setActionError(null);
  }, []);

  const handleArchive = useCallback(async () => {
    if (!chapterId || !archiveConfirmSlug) return;
    setActionError(null);
    try {
      await archiveVersion(projectId, chapterId, archiveConfirmSlug);
      setArchiveConfirmSlug(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to archive version',
      );
    }
  }, [projectId, chapterId, archiveConfirmSlug, archiveVersion]);

  const handleCancelArchive = useCallback(() => {
    setArchiveConfirmSlug(null);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="rail-version">
      {error && (
        <div className="rail-version__error rail-version__error--banner">
          {error}
        </div>
      )}

      {actionError && (
        <div className="rail-version__error rail-version__error--banner">
          {actionError}
        </div>
      )}

      <div className="rail-version__list">
        {versions.map((version) => {
          const isMain = version.slug === 'main';
          const isSelected = version.selected;
          const isRenaming = renameSlug === version.slug;
          const isConfirmingArchive = archiveConfirmSlug === version.slug;
          const canArchive = !isMain && !isSelected;
          const label = isMain ? `${version.name} (main)` : version.name;

          return (
            <div
              key={version.slug}
              className={`rail-version__item${isSelected ? ' rail-version__item--selected' : ''}`}
            >
              {/* Main row */}
              <div className="rail-version__row">
                {isRenaming ? (
                  <input
                    type="text"
                    className="rail-version__rename-input"
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSave();
                      if (e.key === 'Escape') handleRenameCancel();
                    }}
                    onBlur={handleRenameCancel}
                    autoFocus
                  />
                ) : (
                  <div
                    className="rail-version__info"
                    onClick={() => handleSelect(version.slug)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSelect(version.slug);
                    }}
                  >
                    <span className="rail-version__name">
                      {isSelected ? `${'\u25CF'} ${label}` : label}
                    </span>
                    <span className="rail-version__dots">
                      <span
                        className={`rail-version__dot${version.hasExpanded ? ' rail-version__dot--filled' : ''}`}
                        title={version.hasExpanded ? 'Expanded' : 'No expanded'}
                      />
                      <span
                        className={`rail-version__dot${version.hasChapter ? ' rail-version__dot--filled' : ''}`}
                        title={version.hasChapter ? 'Chapter' : 'No chapter'}
                      />
                    </span>
                  </div>
                )}

                {/* Action menu */}
                {!isRenaming && (
                  <button
                    type="button"
                    className="rail-version__more-btn"
                    onClick={() => {
                      if (isConfirmingArchive) {
                        handleCancelArchive();
                      } else {
                        // Toggle: if already has an action open, close it
                        if (renameSlug || archiveConfirmSlug) {
                          setRenameSlug(null);
                          setArchiveConfirmSlug(null);
                        }
                        // Cycle through: nothing → context actions visible
                        // We show actions inline via clicks on the row
                      }
                    }}
                    title="Version actions"
                    aria-label={`Actions for ${label}`}
                  >
                    …
                  </button>
                )}
              </div>

              {/* Meta line */}
              <div className="rail-version__meta">
                <span className="rail-version__created">
                  {formatCreatedAt(version.createdAt)}
                </span>
                <span className="rail-version__commits">
                  {version.commitCount}{' '}
                  {version.commitCount === 1 ? 'revision' : 'revisions'}
                </span>
              </div>

              {/* Inline actions */}
              <div className="rail-version__actions">
                <button
                  type="button"
                  className="rail-version__action-btn"
                  onClick={() =>
                    handleRenameStart(version.slug, version.name)
                  }
                  disabled={isMain}
                  title={isMain ? 'Cannot rename main' : 'Rename version'}
                >
                  Rename
                </button>
                {isConfirmingArchive ? (
                  <div className="rail-version__archive-confirm">
                    <span className="rail-version__archive-msg">
                      Archive &ldquo;{version.name}&rdquo;? It can be restored
                      later.
                    </span>
                    <div className="rail-version__archive-actions">
                      <button
                        type="button"
                        className="rail-version__action-btn rail-version__action-btn--danger"
                        onClick={handleArchive}
                      >
                        Yes, archive
                      </button>
                      <button
                        type="button"
                        className="rail-version__action-btn"
                        onClick={handleCancelArchive}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="rail-version__action-btn rail-version__action-btn--danger"
                    onClick={() => handleArchiveConfirm(version.slug)}
                    disabled={!canArchive}
                    title={
                      isMain
                        ? 'Cannot archive the main version'
                        : isSelected
                          ? 'Cannot archive the selected version'
                          : 'Archive version'
                    }
                  >
                    Archive
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create new version */}
      {showCreateInput ? (
        <div className="rail-version__create">
          <input
            type="text"
            className="rail-version__create-input"
            placeholder="Version name…"
            value={newVersionName}
            onChange={(e) => setNewVersionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') {
                setShowCreateInput(false);
                setNewVersionName('');
              }
            }}
            autoFocus
          />
          <div className="rail-version__create-actions">
            <button
              type="button"
              className="rail-version__action-btn rail-version__action-btn--primary"
              onClick={handleCreate}
              disabled={!newVersionName.trim()}
            >
              Create
            </button>
            <button
              type="button"
              className="rail-version__action-btn"
              onClick={() => {
                setShowCreateInput(false);
                setNewVersionName('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="rail-version__new-btn"
          onClick={() => setShowCreateInput(true)}
        >
          New Version
        </button>
      )}
    </div>
  );
}
