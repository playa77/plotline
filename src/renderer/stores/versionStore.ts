/**
 * Version store — Zustand-based state for chapter version management.
 *
 * Wraps typed IPC commands for listing, creating, selecting, renaming,
 * and archiving chapter versions. Follows the same pattern as variableStore
 * and historyStore: every method logs failures instead of throwing, leaving
 * the caller to handle UI feedback.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { create } from 'zustand';
import { invoke } from '../ipc/client';
import { useToastStore } from './toastStore';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VersionInfo {
  slug: string;
  name: string;
  selected: boolean;
  createdAt: string;
  commitCount: number;
  hasExpanded: boolean;
  hasChapter: boolean;
}

export interface VersionStore {
  // ── State ────────────────────────────────────────────────────────────────────

  versions: VersionInfo[];
  loading: boolean;
  error: string | null;

  // ── Actions ──────────────────────────────────────────────────────────────────

  /** Fetch all versions for a chapter. */
  loadVersions: (projectId: string, chapterId: string) => Promise<void>;

  /** Create a new version, optionally branched from another. Refreshes list. */
  createVersion: (
    projectId: string,
    chapterId: string,
    name: string,
    fromVersion?: string,
  ) => Promise<void>;

  /** Switch to a different version. Updates selected flags optimistically. */
  selectVersion: (
    projectId: string,
    chapterId: string,
    slug: string,
  ) => Promise<void>;

  /** Rename a version (not 'main'). Updates name locally on success. */
  renameVersion: (
    projectId: string,
    chapterId: string,
    slug: string,
    newName: string,
  ) => Promise<void>;

  /** Archive a version (not 'main', not selected). Removes from list. */
  archiveVersion: (
    projectId: string,
    chapterId: string,
    slug: string,
  ) => Promise<void>;
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useVersionStore = create<VersionStore>()((set, get) => ({
  versions: [],
  loading: false,
  error: null,

  loadVersions: async (projectId: string, chapterId: string) => {
    set({ loading: true, error: null });
    try {
      const result = await invoke('versions:list', { projectId, chapterId });
      set({ versions: result.versions, loading: false });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VERSION_ERROR', e.message ?? 'Failed to load versions');
      console.warn('[versionStore] versions:list failed:', err);
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load versions',
      });
    }
  },

  createVersion: async (projectId, chapterId, name, fromVersion) => {
    try {
      await invoke('versions:create', {
        projectId,
        chapterId,
        name,
        fromVersion,
      });
      // Refresh the full list so sort order and metadata are correct
      await get().loadVersions(projectId, chapterId);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VERSION_ERROR', e.message ?? 'Failed to create version');
      console.warn('[versionStore] versions:create failed:', err);
      throw err; // rethrow so UI can show inline error
    }
  },

  selectVersion: async (projectId, chapterId, slug) => {
    try {
      await invoke('versions:select', { projectId, chapterId, slug });
      // Optimistic: mark only the chosen slug as selected
      set((state) => ({
        versions: state.versions.map((v) => ({
          ...v,
          selected: v.slug === slug,
        })),
      }));
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VERSION_ERROR', e.message ?? 'Failed to select version');
      console.warn('[versionStore] versions:select failed:', err);
    }
  },

  renameVersion: async (projectId, chapterId, slug, newName) => {
    try {
      const result = await invoke('versions:rename', {
        projectId,
        chapterId,
        slug,
        newName,
      });
      // Update the display name for the renamed slug
      set((state) => ({
        versions: state.versions.map((v) =>
          v.slug === result.slug ? { ...v, name: result.name } : v,
        ),
      }));
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VERSION_ERROR', e.message ?? 'Failed to rename version');
      console.warn('[versionStore] versions:rename failed:', err);
      throw err;
    }
  },

  archiveVersion: async (projectId, chapterId, slug) => {
    try {
      await invoke('versions:archive', { projectId, chapterId, slug });
      // Remove the archived version from local state
      set((state) => ({
        versions: state.versions.filter((v) => v.slug !== slug),
      }));
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VERSION_ERROR', e.message ?? 'Failed to archive version');
      console.warn('[versionStore] versions:archive failed:', err);
      throw err;
    }
  },
}));
