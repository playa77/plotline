/**
 * Generation store — Zustand-based state for AI generation jobs.
 *
 * Tracks streaming content and job lifecycle for expand/write/iterate
 * operations. Only processes events matching the active jobId — events
 * from other jobs (e.g., concurrent generations on different chapters)
 * are silently ignored.
 *
 * The ChapterWorkspace subscribes to IPC events and routes them into
 * this store so multiple components can observe generation state without
 * duplicating IPC subscriptions.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { create } from 'zustand';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GenerationState {
  /** The currently active generation, or null if idle. */
  activeJob: { jobId: string; chapterId: string; step: string } | null;

  /** Accumulated streaming text for the active job. */
  streamingContent: string;

  /** High-level status of the active job. */
  status: 'idle' | 'streaming' | 'done' | 'error';

  /** Error payload when status === 'error', null otherwise. */
  error: { code: string; message: string } | null;

  /** Current section being written (for per-section write). Null when not in sectioned write. */
  currentSection: { index: number; total: number; title: string } | null;

  // ── Actions ──────────────────────────────────────────────────────────────────

  /** Start tracking a new generation job. Sets streamingContent to ''. */
  startStream: (jobId: string, chapterId: string, step: string) => void;

  /** Append a token delta (ignored if jobId doesn't match the active job). */
  appendToken: (jobId: string, delta: string) => void;

  /** Mark the active job as completed (ignored if jobId doesn't match). */
  finishStream: (jobId: string) => void;

  /** Set an error on the active job (ignored if jobId doesn't match). */
  setError: (jobId: string, code: string, message: string) => void;

  /** Reset to idle, clearing streaming content and error. */
  reset: () => void;

  /** Record that a new section is being generated. */
  startSection: (jobId: string, sectionIndex: number, totalSections: number, sectionTitle: string) => void;

  /** Record that a section completed. */
  finishSection: (jobId: string, sectionIndex: number) => void;
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useGenerationStore = create<GenerationState>()((set, get) => ({
  activeJob: null,
  streamingContent: '',
  status: 'idle',
  error: null,
  currentSection: null,

  startStream: (jobId: string, chapterId: string, step: string) => {
    set({
      activeJob: { jobId, chapterId, step },
      streamingContent: '',
      status: 'streaming',
      error: null,
    });
  },

  appendToken: (jobId: string, delta: string) => {
    const { activeJob } = get();
    // Ignore tokens from jobs we aren't tracking
    if (!activeJob || activeJob.jobId !== jobId) return;
    set((state) => ({
      streamingContent: state.streamingContent + delta,
    }));
  },

  finishStream: (jobId: string) => {
    const { activeJob } = get();
    if (!activeJob || activeJob.jobId !== jobId) return;
    set({ status: 'done' });
  },

  setError: (jobId: string, code: string, message: string) => {
    const { activeJob } = get();
    // Guard: ignore errors for jobs we aren't tracking, but allow
    // errors even when no active job exists (e.g., pre-flight failures
    // like missing API key that prevent startStream from being called).
    if (activeJob && activeJob.jobId !== jobId) return;
    set({
      status: 'error',
      error: { code, message },
    });
  },

  reset: () => {
    set({
      activeJob: null,
      streamingContent: '',
      status: 'idle',
      error: null,
      currentSection: null,
    });
  },

  startSection: (jobId: string, sectionIndex: number, totalSections: number, sectionTitle: string) => {
    const { activeJob } = get();
    if (!activeJob || activeJob.jobId !== jobId) return;
    set({
      currentSection: { index: sectionIndex, total: totalSections, title: sectionTitle },
    });
  },

  finishSection: (jobId: string, sectionIndex: number) => {
    const { activeJob } = get();
    if (!activeJob || activeJob.jobId !== jobId) return;
    // Don't clear currentSection — keep showing last section info until done
  },
}));
