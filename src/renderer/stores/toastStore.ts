/**
 * Toast store — Zustand-based state for the toast notification system.
 *
 * Manages a stack of toast messages with auto-dismiss timing.
 * Every IPC error should be rendered through this store's `error` method
 * using the {code, message} envelope from the backend.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { create } from 'zustand';

// ── Module-level ID counter ────────────────────────────────────────────────

let _nextId = 0;

// ── Types ──────────────────────────────────────────────────────────────────

export interface ToastMessage {
  id: string;
  code: string;
  message: string;
  detail?: string;
  type: 'error' | 'info' | 'success';
}

export interface ToastStore {
  toasts: ToastMessage[];

  /** Add a toast with an auto-generated id and auto-dismiss timer. */
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;

  /** Remove a toast by id. Called by auto-dismiss timers and the UI. */
  dismissToast: (id: string) => void;

  /** Convenience: add an error toast with the {code, message} envelope. */
  error: (code: string, message: string, detail?: string) => void;

  /** Convenience: add an info toast. */
  info: (message: string) => void;

  /** Convenience: add a success toast. */
  success: (message: string) => void;
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useToastStore = create<ToastStore>()((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++_nextId}`;
    const full: ToastMessage = { ...toast, id };

    set((state) => ({
      toasts: [...state.toasts, full],
    }));

    // Auto-dismiss: 7000ms for errors, 6000ms for everything else
    const delay = toast.type === 'error' ? 7000 : 6000;
    setTimeout(() => {
      get().dismissToast(id);
    }, delay);
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  error: (code, message, detail) => {
    get().addToast({ code, message, detail, type: 'error' });
  },

  info: (message) => {
    get().addToast({ code: 'INFO', message, type: 'info' });
  },

  success: (message) => {
    get().addToast({ code: 'SUCCESS', message, type: 'success' });
  },
}));
