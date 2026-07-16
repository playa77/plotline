/**
 * Manuscript tree — hierarchical outline browser.
 *
 * Renders parts, chapters, and sections from parsed outline data.
 * Supports expand/collapse of parts, chapter selection, and section
 * sub-tree toggling.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { useState, useCallback } from 'react';
import type { ParsedPart, ParsedChapter } from '../../shared/schemas/outline';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ManuscriptTreeProps {
  /** Outline parts with their chapters and sections. */
  parts: ParsedPart[];

  /** Currently selected chapter ID, or null if nothing selected. */
  selectedChapterId: string | null;

  /** Called when user clicks a chapter to select it. */
  onSelectChapter: (chapterId: string, title: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Format a word target range as "7k-8k". */
function formatWordTarget(target: { min: number; max: number }): string {
  const fmt = (n: number): string =>
    n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  return `${fmt(target.min)}-${fmt(target.max)}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ManuscriptTree({
  parts,
  selectedChapterId,
  onSelectChapter,
}: ManuscriptTreeProps): JSX.Element {
  // Track which parts are collapsed (none by default)
  const [collapsedParts, setCollapsedParts] = useState<Set<string>>(new Set());
  // Track which chapters have their sections expanded (none by default)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

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

  if (parts.length === 0) {
    return (
      <div className="tree-empty">
        No outline imported yet.
        <br />
        Use Import Outline to get started.
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

                        {/* Stage dots */}
                        {chapter.wordTarget && (
                          <span className="tree-stage-dots" aria-label="Stage indicators">
                            <span className="tree-stage-dot" title="Expand" />
                            <span className="tree-stage-dot" title="Write" />
                          </span>
                        )}

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
