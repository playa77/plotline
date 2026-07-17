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

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

import { ManuscriptTree } from './ManuscriptTree';
import { Workspace } from './Workspace';
import type { WorkspaceSelection } from './Workspace';
import { ContextRail } from './ContextRail';
import { CommandPalette } from './CommandPalette';
import { ImportDialog } from './ImportDialog';
import { Toast } from './Toast';

import {
  getAvailableActions,
  type ActionContext,
  type ActionCallbacks,
} from '../actions';
import { useGenerationStore } from '../stores/generationStore';
import { useVersionStore } from '../stores/versionStore';
import { useVariableStore } from '../stores/variableStore';
import { useToastStore } from '../stores/toastStore';
import { invoke } from '../ipc/client';

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

  // Command palette state
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Project identity — loaded from IPC on mount
  const [projectId, setProjectId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // Load the active project on mount
  useEffect(() => {
    invoke('project:getActive', {})
      .then((active) => {
        if (active) {
          setProjectId(active.projectId);
        } else {
          setProjectId('');
        }
      })
      .catch((err) => {
        console.warn('[AppShell] Failed to load active project:', err);
        setProjectId('');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Store hooks
  const genStore = useGenerationStore();
  const versionStore = useVersionStore();
  const variableStore = useVariableStore();

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

  // ── Command palette keyboard listener ───────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === 'Escape' && paletteOpen) {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [paletteOpen]);

  // ── Rail toggle ──────────────────────────────────────────────────────────────

  const handleToggleRail = useCallback(() => {
    setRailCollapsed((prev) => {
      const next = !prev;
      saveRailCollapsed(next);
      return next;
    });
  }, []);

  // ── Project create / open ──────────────────────────────────────────────────

  const handleCreateProject = useCallback(async () => {
    try {
      const project = await invoke('project:create', { title: 'Untitled Project' });
      setProjectId(project.projectId);
    } catch (err: unknown) {
      const e = err as { message?: string };
      useToastStore.getState().error('PROJECT_ERROR', 'Failed to create project', e.message);
    }
  }, []);

  const handleOpenProject = useCallback(async () => {
    const input = window.prompt('Enter the project ID to open:');
    if (!input || !input.trim()) return;
    try {
      const project = await invoke('project:open', { projectId: input.trim() });
      setProjectId(project.projectId);
    } catch (err: unknown) {
      const e = err as { message?: string };
      useToastStore.getState().error('PROJECT_ERROR', 'Failed to open project', e.message);
    }
  }, []);

  // ── Compute effective right width ────────────────────────────────────────────

  const effectiveRightWidth = railCollapsed ? 36 : rightWidth;

  // ── Command palette context & callbacks ────────────────────────────────────

  const actionContext: ActionContext = useMemo(
    () => ({
      projectId,
      chapterId: selectedChapterId,
      selection,
      genStatus: genStore.status,
      railCollapsed,
      chapters: demoParts.flatMap((part) =>
        part.chapters.map((ch) => ({
          id: ch.chapterId,
          title: ch.title,
        })),
      ),
      versions: versionStore.versions.map((v) => ({
        slug: v.slug,
        name: v.name,
        selected: v.selected,
      })),
      variables: variableStore.variables.map((v) => ({
        id: v.id,
        name: v.name,
        scope: v.scope,
        active: v.active,
      })),
      hasIterateProposal:
        genStore.status === 'done' && genStore.activeJob?.step === 'iterate',
    }),
    [
      selectedChapterId,
      selection,
      genStore.status,
      genStore.activeJob,
      railCollapsed,
      versionStore.versions,
      variableStore.variables,
    ],
  );

  const actionCallbacks: ActionCallbacks = useMemo(
    () => ({
      navigate: (sel) => setSelection(sel),

      selectChapter: (chapterId, title) => {
        setSelectedChapterId(chapterId);
        setSelection({ type: 'chapter', chapterId, chapterTitle: title });
      },

      toggleRail: handleToggleRail,

      expand: async () => {
        try {
          if (selectedChapterId)
            await invoke('generate:expand', { projectId, chapterId: selectedChapterId });
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'GEN_ERROR', e.message ?? 'Expand failed', e.detail);
        }
      },

      reExpand: async () => {
        try {
          if (selectedChapterId)
            await invoke('generate:expand', { projectId, chapterId: selectedChapterId, asNewVersion: undefined });
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'GEN_ERROR', e.message ?? 'Re-expand failed', e.detail);
        }
      },

      write: async () => {
        try {
          if (selectedChapterId)
            await invoke('generate:write', { projectId, chapterId: selectedChapterId });
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'GEN_ERROR', e.message ?? 'Write failed', e.detail);
        }
      },

      reWrite: async () => {
        try {
          if (selectedChapterId)
            await invoke('generate:write', { projectId, chapterId: selectedChapterId });
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'GEN_ERROR', e.message ?? 'Re-write failed', e.detail);
        }
      },

      stopGeneration: async () => {
        try {
          const jobId = genStore.activeJob?.jobId;
          if (jobId) await invoke('generate:cancel', { jobId });
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'GEN_ERROR', e.message ?? 'Stop generation failed', e.detail);
        }
      },

      focusIterate: () => {
        if (selectedChapterId) {
          setSelection({
            type: 'chapter',
            chapterId: selectedChapterId,
            chapterTitle:
              selection.type === 'chapter' ? selection.chapterTitle : '',
          });
        }
      },

      createVersion: async (name) => {
        try {
          await versionStore.createVersion(projectId, selectedChapterId ?? '', name);
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'VERSION_ERROR', e.message ?? 'Create version failed', e.detail);
        }
      },
      selectVersion: async (slug) => {
        try {
          await versionStore.selectVersion(projectId, selectedChapterId ?? '', slug);
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'VERSION_ERROR', e.message ?? 'Select version failed', e.detail);
        }
      },
      renameVersion: async (slug, newName) => {
        try {
          await versionStore.renameVersion(projectId, selectedChapterId ?? '', slug, newName);
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'VERSION_ERROR', e.message ?? 'Rename version failed', e.detail);
        }
      },
      archiveVersion: async (slug) => {
        try {
          await versionStore.archiveVersion(projectId, selectedChapterId ?? '', slug);
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'VERSION_ERROR', e.message ?? 'Archive version failed', e.detail);
        }
      },

      restoreRevision: async (sha) => {
        try {
          if (selectedChapterId)
            await invoke('history:restore', { projectId: projectId, ref: selectedChapterId, sha });
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'HISTORY_ERROR', e.message ?? 'Restore revision failed', e.detail);
        }
      },

      createVariable: async (name) => {
        try {
          await variableStore.createVariable(projectId, name);
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Create variable failed', e.detail);
        }
      },
      setVariableActive: async (id, active) => {
        try {
          await variableStore.toggleActive(projectId, id, active);
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Toggle variable failed', e.detail);
        }
      },
      setVariableScope: async (id, scope) => {
        try {
          await variableStore.updateScope(projectId, id, scope);
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Update variable scope failed', e.detail);
        }
      },

      addCard: async (variableId, title) => {
        try {
          await variableStore.addCard(projectId, title);
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Add card failed', e.detail);
        }
      },

      acceptProposal: async () => {
        try {
          const jobId = genStore.activeJob?.jobId;
          if (jobId) await invoke('iterate:accept', { projectId: projectId, jobId });
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'ITERATE_ERROR', e.message ?? 'Accept proposal failed', e.detail);
        }
      },

      discardProposal: async () => {
        try {
          const jobId = genStore.activeJob?.jobId;
          if (jobId) await invoke('iterate:discard', { jobId });
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'ITERATE_ERROR', e.message ?? 'Discard proposal failed', e.detail);
        }
      },

      acceptAsVersion: async (name) => {
        try {
          const jobId = genStore.activeJob?.jobId;
          if (jobId)
            await invoke('iterate:acceptAsVersion', { projectId: projectId, jobId, versionName: name });
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'ITERATE_ERROR', e.message ?? 'Accept as version failed', e.detail);
        }
      },

      exportSubstack: async () => {
        try {
          if (selectedChapterId)
            await invoke('export:substack', { projectId: projectId, chapterId: selectedChapterId, mode: 'clipboard' });
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'EXPORT_ERROR', e.message ?? 'Export to Substack failed', e.detail);
        }
      },

      exportHtml: async () => {
        try {
          if (selectedChapterId)
            await invoke('export:substack', { projectId: projectId, chapterId: selectedChapterId, mode: 'file', filePath: '' });
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'EXPORT_ERROR', e.message ?? 'Export HTML failed', e.detail);
        }
      },

      exportMarkdownChapter: async () => {
        try {
          if (selectedChapterId)
            await invoke('export:markdown', { projectId: projectId, scope: 'chapter', chapterId: selectedChapterId, filePath: '' });
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'EXPORT_ERROR', e.message ?? 'Export markdown chapter failed', e.detail);
        }
      },

      exportMarkdownBook: async () => {
        try {
          await invoke('export:markdown', { projectId: projectId, scope: 'book', filePath: '' });
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'EXPORT_ERROR', e.message ?? 'Export markdown book failed', e.detail);
        }
      },

      exportPdf: async () => {
        try {
          await invoke('export:pdf', { projectId: projectId, templateId: 'trade-paperback', chapterIds: 'all', options: {}, outputPath: '' });
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string; detail?: string };
          useToastStore.getState().error(e.code ?? 'EXPORT_ERROR', e.message ?? 'Export PDF failed', e.detail);
        }
      },

      promptInput: (placeholder) => window.prompt(placeholder),

      importOutline: () => setImportDialogOpen(true),
    }),
    [
      selectedChapterId,
      genStore.activeJob,
      selection,
      versionStore,
      variableStore,
      handleToggleRail,
    ],
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  // Loading state while IPC fetch is in-flight
  if (loading) {
    return (
      <div className="app-shell app-shell--loading">
        <div className="app-shell__loading-text">Loading…</div>
      </div>
    );
  }

  // Welcome screen when no project is active
  if (!projectId) {
    return (
      <div className="app-shell app-shell--welcome">
        <div className="welcome-screen">
          <h1 className="welcome-screen__title">Plotline</h1>
          <p className="welcome-screen__subtitle">Write your book, chapter by chapter.</p>
          <div className="welcome-screen__actions">
            <button
              type="button"
              className="welcome-screen__btn welcome-screen__btn--primary"
              onClick={handleCreateProject}
            >
              New Project
            </button>
            <button
              type="button"
              className="welcome-screen__btn"
              onClick={handleOpenProject}
            >
              Open Project
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`app-shell${resizeTarget ? ' app-shell--resizing' : ''}`}
    >
      {/* ── Library pane (left) ──────────────────────────────── */}
      <aside className="library-pane" style={{ width: leftWidth }}>
        <div className="library-pane__tree">
          <ManuscriptTree
            parts={demoParts}
            projectId={projectId}
            selectedChapterId={selectedChapterId}
            onSelectChapter={handleSelectChapter}
            onImportOutline={() => setImportDialogOpen(true)}
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
            onClick={() => setSelection({ type: 'variables' })}
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
            onClick={() => setSelection({ type: 'settings' })}
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
        <Workspace selection={selection} projectId={projectId} onImportOutline={() => setImportDialogOpen(true)} />
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
          projectId={projectId}
          chapterId={selectedChapterId ?? undefined}
        />
      </aside>

      {paletteOpen && (
        <CommandPalette
          open={paletteOpen}
          actions={getAvailableActions(actionContext, actionCallbacks)}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {importDialogOpen && (
        <ImportDialog
          projectId={projectId}
          onClose={() => setImportDialogOpen(false)}
          onImported={() => {
            setImportDialogOpen(false);
          }}
        />
      )}

      <Toast />
    </div>
  );
}
