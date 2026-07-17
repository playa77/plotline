/**
 * Manuscript tree — hierarchical outline browser.
 *
 * Renders parts, chapters, and sections from parsed outline data.
 * Supports expand/collapse of parts, chapter selection, and section
 * sub-tree toggling.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { useState, useEffect, useCallback } from 'react';
import type { ParsedPart, ParsedChapter } from '../../shared/schemas/outline';

import { invoke } from '../ipc/client';
import { useIpcEvent } from '../ipc/useEvent';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ManuscriptTreeProps {
  /** Outline parts with their chapters and sections. */
  parts: ParsedPart[];

  /** Project ID for fetching chapter status. */
  projectId?: string;

  /** Currently selected chapter ID, or null if nothing selected. */
  selectedChapterId: string | null;

  /** Called when user clicks a chapter to select it. */
  onSelectChapter: (chapterId: string, title: string) => void;

  /** Called when user wants to import an outline. */
  onImportOutline?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Format a word target range as "7k-8k". */
function formatWordTarget(target: { min: number; max: number }): string {
  const fmt = (n: number): string =>
    n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  return `${fmt(target.min)}-${fmt(target.max)}`;
}

type DotStatus = 'empty' | 'filled' | 'stale';

interface ChapterStageDots {
  outline: DotStatus;
  expanded: DotStatus;
  chapter: DotStatus;
}

/** Compute a single aggregate dot status for a chapter. */
function aggregateDotStatus(dots: ChapterStageDots | undefined): DotStatus {
  if (!dots) return 'empty';
  // Stale wins
  if (dots.outline === 'stale' || dots.expanded === 'stale' || dots.chapter === 'stale') {
    return 'stale';
  }
  // Filled wins over empty
  if (dots.outline === 'filled' || dots.expanded === 'filled' || dots.chapter === 'filled') {
    return 'filled';
  }
  return 'empty';
}

/** CSS class for the aggregate dot. */
const DOT_CLASS_MAP: Record<DotStatus, string> = {
  empty: 'tree-stage-dot--empty',
  filled: 'tree-stage-dot--filled',
  stale: 'tree-stage-dot--stale',
};

// ── Component ──────────────────────────────────────────────────────────────────

export function ManuscriptTree({
  parts,
  projectId = 'demo',
  selectedChapterId,
  onSelectChapter,
  onImportOutline,
}: ManuscriptTreeProps): JSX.Element {
  // Track which parts are collapsed (none by default)
  const [collapsedParts, setCollapsedParts] = useState<Set<string>>(new Set());
  // Track which chapters have their sections expanded (none by default)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  // Per-chapter stage dot statuses, keyed by chapterId
  const [chapterStatuses, setChapterStatuses] = useState<Map<string, ChapterStageDots>>(new Map());

  const togglePart = useCallback((partId: string) => {
    setCollapsedParts((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) {
        next.delete(partId);
      } else {
        next.add(partId);
      }
      return next;
    });
  }, []);

  const toggleSections = useCallback((chapterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }, []);

  const handleSelectChapter = useCallback(
    (chapter: ParsedChapter) => {
      onSelectChapter(chapter.chapterId, chapter.title);
    },
    [onSelectChapter],
  );

  // Fetch chapter status dots for all chapters in the outline
  useEffect(() => {
    const chapterIds = parts.flatMap((p) => p.chapters.map((c) => c.chapterId));
    if (chapterIds.length === 0) return;

    let cancelled = false;

    async function fetchAllStatuses() {
      const next = new Map<string, ChapterStageDots>();
      for (const id of chapterIds) {
        try {
          const status = await invoke('chapter:getStatus', { projectId, chapterId: id });
          if (!cancelled) next.set(id, status.stageDots);
        } catch {
          // IPC may not be wired yet — keep existing status for this chapter
        }
      }
      if (!cancelled) setChapterStatuses(next);
    }

    fetchAllStatuses();

    return () => {
      cancelled = true;
    };
  }, [projectId, parts]);

  // Listen for staleness changes and refresh affected chapters
  const handleStalenessChanged = useCallback(
    (payload: { chapterIds: string[] }) => {
      const treeChapterIds = new Set(
        parts.flatMap((p) => p.chapters.map((c) => c.chapterId)),
      );
      const relevant = payload.chapterIds.filter((id) => treeChapterIds.has(id));
      if (relevant.length === 0) return;

      // Re-fetch the changed chapters
      relevant.forEach((id) => {
        invoke('chapter:getStatus', { projectId, chapterId: id })
          .then((status) => {
            setChapterStatuses((prev) => {
              const next = new Map(prev);
              next.set(id, status.stageDots);
              return next;
            });
          })
          .catch(() => {
            // swallow — keep last known status
          });
      });
    },
    [projectId, parts],
  );

  useIpcEvent('staleness:changed', handleStalenessChanged);

  if (parts.length === 0) {
    return (
      <div className="tree-empty">
        No outline imported yet.
        <br />
        Use Import Outline to get started.
        <br />
        {onImportOutline && (
          <button
            type="button"
            className="tree-empty__import-btn"
            onClick={onImportOutline}
          >
            Import Outline
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="manuscript-tree">
      {parts.map((part) => {
        const isPartCollapsed = collapsedParts.has(part.id);
        return (
          <div key={part.id} className="tree-part">
            {/* Part header */}
            <div
              className="tree-part__header"
              onClick={() => togglePart(part.id)}
              role="button"
              tabIndex={0}
              aria-expanded={!isPartCollapsed}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  togglePart(part.id);
                }
              }}
            >
              <span
                className={`tree-part__toggle${isPartCollapsed ? ' tree-part__toggle--collapsed' : ''}`}
                aria-hidden="true"
              >
                {'\u25BE'}
              </span>
              <span>{part.title}</span>
            </div>

            {/* Chapters */}
            {!isPartCollapsed && (
              <div className="tree-part__chapters">
                {part.chapters.map((chapter) => {
                  const isSelected = chapter.chapterId === selectedChapterId;
                  const hasSections = chapter.sections.length > 0;
                  const sectionsExpanded = expandedSections.has(chapter.chapterId);

                  return (
                    <div key={chapter.chapterId}>
                      <div
                        className={`tree-chapter${isSelected ? ' tree-chapter--selected' : ''}`}
                        onClick={() => handleSelectChapter(chapter)}
                        role="treeitem"
                        tabIndex={0}
                        aria-selected={isSelected}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectChapter(chapter);
                          }
                        }}
                      >
                        {/* Section expand toggle */}
                        {hasSections && (
                          <span
                            className={`tree-chapter__expand${sectionsExpanded ? ' tree-chapter__expand--expanded' : ''}`}
                            onClick={(e) => toggleSections(chapter.chapterId, e)}
                            role="button"
                            tabIndex={-1}
                            aria-label={
                              sectionsExpanded ? 'Collapse sections' : 'Expand sections'
                            }
                          >
                            {'\u25B8'}
                          </span>
                        )}

                        {/* Chapter title */}
                        <span className="tree-chapter__title">
                          {chapter.title}
                        </span>

                        {/* Aggregate staleness dot */}
                        <span className="tree-stage-dots" aria-label="Chapter status">
                          <span
                            className={`tree-stage-dot ${DOT_CLASS_MAP[aggregateDotStatus(chapterStatuses.get(chapter.chapterId))]}`}
                            title="Chapter status"
                          />
                        </span>

                        {/* Word target */}
                        {chapter.wordTarget && (
                          <span className="tree-word-target">
                            {formatWordTarget(chapter.wordTarget)}
                          </span>
                        )}
                      </div>

                      {/* Sections */}
                      {hasSections && sectionsExpanded && (
                        <div className="tree-sections">
                          {chapter.sections.map((section) => (
                            <div key={section.id} className="tree-section">
                              <span className="tree-section__number">
                                {section.number}
                              </span>
                              <span className="tree-section__title">
                                {section.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
