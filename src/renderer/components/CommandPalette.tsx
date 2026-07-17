/**
 * CommandPalette — Raycast-style command palette overlay.
 *
 * Summoned by Cmd/Ctrl+K, covers every user-facing action including version
 * switching. Visual language: dense, monospace, dark theme, tool-like.
 * No decoration, no emojis.
 *
 * Features:
 *   - Dark semi-transparent backdrop (click to dismiss)
 *   - Centered floating panel with search input at top (auto-focused)
 *   - Filtered action list below, grouped by category
 *   - Arrow key navigation, Enter to execute, Esc to close
 *   - Fuzzy text matching on the search query
 *   - IBM Plex Mono, dark theme tokens, accent color for selected item
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

import type { CommandAction } from '../actions';
import { filterActions, groupActions, CATEGORY_LABELS } from '../actions';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CommandPaletteProps {
  /** Whether the palette is visible. */
  open: boolean;
  /** Full list of available actions (pre-filtered for availability). */
  actions: CommandAction[];
  /** Called when the palette should close. */
  onClose: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORY_ORDER: CommandAction['category'][] = [
  'generation',
  'chapter',
  'navigation',
  'editor',
  'iterate',
  'outline',
  'variables',
  'versions',
  'history',
  'export',
];

/** Actions that should always appear first, before filtered results. */
const PINNED_IDS = new Set<string>();

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Sort categories to the canonical order defined in CATEGORY_ORDER.
 */
function sortCategories(
  groups: Map<string, CommandAction[]>,
): [string, CommandAction[]][] {
  return CATEGORY_ORDER
    .filter((cat) => groups.has(cat))
    .map((cat) => [cat, groups.get(cat)!]);
}

/** Auto-detect platform for shortcut display: 'Cmd' on Mac, 'Ctrl' elsewhere. */
function shortcutDisplay(shortcut: string): string {
  // Replace "Cmd/Ctrl+" with "Cmd+" on Mac, "Ctrl+" everywhere else
  const isMac = /Mac/i.test(
    typeof navigator !== 'undefined' ? navigator.platform : '',
  );
  return shortcut.replace('Cmd/Ctrl+', isMac ? '⌘' : 'Ctrl+');
}

// ── Component ──────────────────────────────────────────────────────────────────

export function CommandPalette({
  open,
  actions,
  onClose,
}: CommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Filter and group actions ─────────────────────────────────────────────

  const filteredActions = useMemo(() => {
    if (!query.trim()) return actions;
    return filterActions(actions, query);
  }, [actions, query]);

  const groupedActions = useMemo(() => {
    return sortCategories(groupActions(filteredActions));
  }, [filteredActions]);

  // Build a flat index-to-action map so arrow keys can traverse the full list
  const flatList = useMemo(() => {
    const flat: Array<{ action: CommandAction; groupIndex: number }> = [];
    for (const [, groupActionsList] of groupedActions) {
      for (const action of groupActionsList) {
        flat.push({ action, groupIndex: flat.length });
      }
    }
    return flat;
  }, [groupedActions]);

  // ── Reset state when palette opens ───────────────────────────────────────

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      // Auto-focus the search input after the portal renders
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // Clamp selected index when list changes
  useEffect(() => {
    if (selectedIndex >= flatList.length && flatList.length > 0) {
      setSelectedIndex(flatList.length - 1);
    }
  }, [flatList.length, selectedIndex]);

  // ── Keyboard handling ────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, flatList.length - 1),
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Home':
          e.preventDefault();
          setSelectedIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setSelectedIndex(flatList.length - 1);
          break;
        case 'Enter': {
          e.preventDefault();
          const item = flatList[selectedIndex];
          if (item) {
            item.action.execute();
            onClose();
          }
          break;
        }
      }
    },
    [flatList, selectedIndex, onClose],
  );

  // ── Scroll selected item into view ───────────────────────────────────────

  useEffect(() => {
    const el = listRef.current?.querySelector(
      '.command-palette__item--selected',
    ) as HTMLElement | null;
    if (typeof el?.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // ── Mouse hover → select ─────────────────────────────────────────────────

  const handleItemMouseEnter = useCallback(
    (flatIndex: number) => {
      setSelectedIndex(flatIndex);
    },
    [],
  );

  // ── Backdrop click → close ───────────────────────────────────────────────

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  // ── Not visible ──────────────────────────────────────────────────────────

  if (!open) return null;

  // ── Render (via portal) ──────────────────────────────────────────────────

  return createPortal(
    <div className="command-palette__backdrop" onClick={handleBackdropClick}>
      <div className="command-palette" role="dialog" aria-label="Command palette">
        {/* Search input */}
        <div className="command-palette__search">
          <span className="command-palette__search-icon">{'>'}</span>
          <input
            ref={inputRef}
            className="command-palette__input"
            type="text"
            placeholder="Type a command…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            aria-label="Search commands"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* Action list */}
        <div className="command-palette__list" ref={listRef}>
          {groupedActions.length === 0 && query.trim() ? (
            <div className="command-palette__empty">
              No matching commands
            </div>
          ) : (
            groupedActions.map(([category, catActions]) => (
              <div key={category} className="command-palette__group">
                <div className="command-palette__group-label">
                  {CATEGORY_LABELS[category as CommandAction['category']] ?? category}
                </div>
                {catActions.map((action) => {
                  // Find this action's flat index
                  const flatIndex = flatList.findIndex(
                    (f) => f.action.id === action.id,
                  );
                  const isSelected = flatIndex === selectedIndex;

                  return (
                    <div
                      key={action.id}
                      className={`command-palette__item${isSelected ? ' command-palette__item--selected' : ''}`}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => handleItemMouseEnter(flatIndex)}
                      onClick={() => {
                        action.execute();
                        onClose();
                      }}
                    >
                      <span className="command-palette__item-label">
                        {action.label}
                      </span>
                      {action.shortcut && (
                        <span className="command-palette__item-shortcut">
                          {shortcutDisplay(action.shortcut)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="command-palette__footer">
          <span className="command-palette__footer-hint">
            ↑↓ navigate &middot; ↵ execute &middot; esc dismiss
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
