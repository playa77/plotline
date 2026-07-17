/**
 * History store — Zustand-based state for the History panel in ContextRail.
 *
 * Wraps the typed IPC client so the ContextRail never calls window.plotline
 * directly. Follows the same pattern as variableStore: errors are logged and
 * surfaced in state rather than thrown.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { create } from 'zustand';
import { invoke } from '../ipc/client';
import { useToastStore } from './toastStore';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CommitInfo {
  sha: string;
  label: string;
  kind: string;
  timestamp: string;
  wordDelta?: number | null;
}

export interface HistoryStore {
  // ── State ────────────────────────────────────────────────────────────────────

  commits: CommitInfo[];
  loading: boolean;
  previewSha: string | null;
  previewHtml: string;
  previewLoading: boolean;
  error: string | null;

  // ── Actions ──────────────────────────────────────────────────────────────────

  loadCommits: (projectId: string, ref: string) => Promise<void>;
  loadMore: (projectId: string, ref: string, before: string) => Promise<void>;
  loadPreview: (projectId: string, ref: string, sha: string) => Promise<void>;
  restore: (projectId: string, ref: string, sha: string) => Promise<void>;
  dismissPreview: () => void;
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useHistoryStore = create<HistoryStore>()((set, get) => ({
  // ── Initial state ────────────────────────────────────────────────────────────

  commits: [],
  loading: false,
  previewSha: null,
  previewHtml: '',
  previewLoading: false,
  error: null,

  // ── loadCommits — reset and fetch initial batch ───────────────────────────────

  loadCommits: async (projectId: string, ref: string) => {
    set({ commits: [], loading: true, error: null, previewSha: null, previewHtml: '' });
    try {
      const { commits } = await invoke('history:list', {
        projectId,
        ref,
        limit: 20,
      });
      set({ commits, loading: false });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'HISTORY_ERROR', e.message ?? 'Failed to load revision history.');
      console.warn(
        `[historyStore] history:list failed:`,
        err,
      );
      set({ loading: false, error: 'Failed to load revision history.' });
    }
  },

  // ── loadMore — pagination, appends older commits ─────────────────────────────

  loadMore: async (projectId: string, ref: string, before: string) => {
    set({ loading: true });
    try {
      const { commits } = await invoke('history:list', {
        projectId,
        ref,
        limit: 20,
        before,
      });
      set((state) => ({
        commits: [...state.commits, ...commits],
        loading: false,
      }));
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'HISTORY_ERROR', e.message ?? 'Failed to load more history entries.');
      console.warn(
        `[historyStore] history:list (loadMore) failed:`,
        err,
      );
      set({ loading: false, error: 'Failed to load more history entries.' });
    }
  },

  // ── loadPreview — fetch artifact HTML for a specific commit ──────────────────

  loadPreview: async (projectId: string, ref: string, sha: string) => {
    // Toggle: if clicking the already-expanded commit, dismiss
    const currentPreview = get().previewSha;
    if (currentPreview === sha) {
      set({ previewSha: null, previewHtml: '' });
      return;
    }

    set({ previewSha: sha, previewHtml: '', previewLoading: true, error: null });
    try {
      const { html } = await invoke('history:preview', { projectId, ref, sha });
      set({ previewHtml: html, previewLoading: false });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'HISTORY_ERROR', e.message ?? 'Failed to load revision preview.');
      console.warn(
        `[historyStore] history:preview failed (sha=${sha}):`,
        err,
      );
      set({ previewLoading: false, error: 'Failed to load revision preview.' });
    }
  },

  // ── restore — revert to a previous revision, then refresh ────────────────────

  restore: async (projectId: string, ref: string, sha: string) => {
    try {
      await invoke('history:restore', { projectId, ref, sha });
      // Refresh the commit list — the restored revision becomes the newest
      await get().loadCommits(projectId, ref);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'HISTORY_ERROR', e.message ?? 'Failed to restore revision.');
      console.warn(
        `[historyStore] history:restore failed (sha=${sha}):`,
        err,
      );
      set({ error: 'Failed to restore revision.' });
    }
  },

  // ── dismissPreview — collapse any expanded preview ───────────────────────────

  dismissPreview: () => {
    set({ previewSha: null, previewHtml: '', previewLoading: false });
  },
}));
