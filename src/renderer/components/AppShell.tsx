/**
 * App shell — three-pane layout with resizable split panels.
 *
 * Manages panel widths via React state (with localStorage fallback for
 * persistence). The actual ui-state.json IPC will land in WP-08.
 *
 * Library (left)  — manuscript tree + bottom actions
 * Workspace (ctr) — content router (editor / outline / empty state)
 * Context (right) — tools sidebar (collapsible)
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { useState, useCallback, useRef, useEffect } from 'react';

import { ManuscriptTree } from './ManuscriptTree';
import { Workspace } from './Workspace';
import type { WorkspaceSelection } from './Workspace';
import { ContextRail } from './ContextRail';

import { demoParts } from '../data/demoOutline';

// ── Constants ──────────────────────────────────────────────────────────────────

const MIN_PANEL_WIDTH = 160;

// ── Panel width persistence (localStorage until WP-08) ─────────────────────────

const STORAGE_KEY_LEFT = 'plotline:panel-left';
const STORAGE_KEY_RIGHT = 'plotline:panel-right';
const STORAGE_KEY_RAIL_COLLAPSED = 'plotline:rail-collapsed';

function loadPanelWidth(key: string, fallback: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= MIN_PANEL_WIDTH) return parsed;
    }
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
  return fallback;
}

function savePanelWidth(key: string, width: number): void {
  try {
    localStorage.setItem(key, String(width));
  } catch {
    // Silently ignore
  }
}

function loadRailCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_RAIL_COLLAPSED) === 'true';
  } catch {
    return false;
  }
}

function saveRailCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_RAIL_COLLAPSED, String(collapsed));
  } catch {
    // Silently ignore
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

type ResizeTarget = 'left' | 'right' | null;

// ── Component ──────────────────────────────────────────────────────────────────

export function AppShell(): JSX.Element {
  // Panel widths
  const [leftWidth, setLeftWidth] = useState<number>(() =>
    loadPanelWidth(STORAGE_KEY_LEFT, 240),
  );
  const [rightWidth, setRightWidth] = useState<number>(() =>
    loadPanelWidth(STORAGE_KEY_RIGHT, 260),
  );

  // Context rail collapsed state
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() =>
    loadRailCollapsed(),
  );

  // Selection state
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selection, setSelection] = useState<WorkspaceSelection>({ type: 'none' });

  // Resize state
  const [resizeTarget, setResizeTarget] = useState<ResizeTarget>(null);
  const resizeStartXRef = useRef<number>(0);
  const resizeStartWidthRef = useRef<number>(0);

  // Refs so mouseup handler reads latest widths without re-binding listeners
  const leftWidthRef = useRef(leftWidth);
  leftWidthRef.current = leftWidth;
  const rightWidthRef = useRef(rightWidth);
  rightWidthRef.current = rightWidth;

  // ── Chapter selection ────────────────────────────────────────────────────────

  const handleSelectChapter = useCallback(
    (chapterId: string, title: string) => {
      setSelectedChapterId(chapterId);
      setSelection({ type: 'chapter', chapterId, chapterTitle: title });
    },
    [],
  );

  // ── Resize handlers ──────────────────────────────────────────────────────────

  const handleResizeMouseDown = useCallback(
    (target: ResizeTarget) => (e: React.MouseEvent) => {
      e.preventDefault();
      setResizeTarget(target);
      resizeStartXRef.current = e.clientX;
      resizeStartWidthRef.current =
        target === 'left' ? leftWidthRef.current : rightWidthRef.current;
    },
    [],
  );

  useEffect(() => {
    if (!resizeTarget) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartXRef.current;

      if (resizeTarget === 'left') {
        const newWidth = Math.max(
          MIN_PANEL_WIDTH,
          resizeStartWidthRef.current + delta,
        );
        setLeftWidth(newWidth);
      } else if (resizeTarget === 'right') {
        // Dragging right handle moves it leftward to shrink
        const newWidth = Math.max(
          MIN_PANEL_WIDTH,
          resizeStartWidthRef.current - delta,
        );
        setRightWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      // Persist to localStorage using refs (always current)
      if (resizeTarget === 'left') {
        savePanelWidth(STORAGE_KEY_LEFT, leftWidthRef.current);
      } else if (resizeTarget === 'right') {
        savePanelWidth(STORAGE_KEY_RIGHT, rightWidthRef.current);
      }
      setResizeTarget(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizeTarget]);

  // ── Rail toggle ──────────────────────────────────────────────────────────────

  const handleToggleRail = useCallback(() => {
    setRailCollapsed((prev) => {
      const next = !prev;
      saveRailCollapsed(next);
      return next;
    });
  }, []);

  // ── Compute effective right width ────────────────────────────────────────────

  const effectiveRightWidth = railCollapsed ? 36 : rightWidth;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className={`app-shell${resizeTarget ? ' app-shell--resizing' : ''}`}
    >
      {/* ── Library pane (left) ──────────────────────────────── */}
      <aside className="library-pane" style={{ width: leftWidth }}>
        <div className="library-pane__tree">
          <ManuscriptTree
            parts={demoParts}
            selectedChapterId={selectedChapterId}
            onSelectChapter={handleSelectChapter}
          />
        </div>
        <div className="library-pane__actions">
          <button
            type="button"
            className="library-action-btn"
            onClick={() => setSelection({ type: 'outline' })}
          >
            Outline
          </button>
          <button
            type="button"
            className="library-action-btn"
            onClick={() => setSelection({ type: 'none' })}
          >
            Variables
          </button>
          <button
            type="button"
            className="library-action-btn"
            onClick={() => setSelection({ type: 'none' })}
          >
            Exports
          </button>
          <button
            type="button"
            className="library-action-btn"
            onClick={() => setSelection({ type: 'none' })}
          >
            Settings
          </button>
        </div>
      </aside>

      {/* ── Resize handle: left / center ─────────────────────── */}
      <div
        className={`resize-handle${resizeTarget === 'left' ? ' resize-handle--active' : ''}`}
        onMouseDown={handleResizeMouseDown('left')}
      />

      {/* ── Workspace pane (center) ──────────────────────────── */}
      <main className="workspace-pane">
        <Workspace selection={selection} />
      </main>

      {/* ── Resize handle: center / right ────────────────────── */}
      <div
        className={`resize-handle${resizeTarget === 'right' ? ' resize-handle--active' : ''}`}
        onMouseDown={handleResizeMouseDown('right')}
      />

      {/* ── Context rail (right) ─────────────────────────────── */}
      <aside className="context-rail" style={{ width: effectiveRightWidth }}>
        <ContextRail
          collapsed={railCollapsed}
          onToggleCollapse={handleToggleRail}
        />
      </aside>
    </div>
  );
}
