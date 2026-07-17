/**
 * Variable store — Zustand-based state for the Variable Studio.
 *
 * Wraps the typed IPC client so the VariableWorkspace never calls
 * window.plotline directly. Handles errors gracefully: the IPC
 * backend (WP-11 main process) is built in parallel and may not
 * be wired yet, so every action logs failures instead of throwing.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { create } from 'zustand';
import type { Variable, VariableScope } from '../../shared/schemas/variable';
import { invoke } from '../ipc/client';
import { useToastStore } from './toastStore';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CardSummary {
  cardId: string;
  title: string;
}

export interface VariableStore {
  // ── State ────────────────────────────────────────────────────────────────────

  variables: Variable[];
  selectedVariableId: string | null;
  /** variableId → HTML content (as stored on disk) */
  variableContent: Record<string, string>;
  loading: boolean;

  // ── Card state (for Character / Voice Sheet variables) ────────────────────────

  /** Cards for the currently selected character variable. */
  cards: CardSummary[];
  selectedCardId: string | null;
  /** cardId → HTML content */
  cardContent: Record<string, string>;

  // ── Actions ──────────────────────────────────────────────────────────────────

  loadVariables: (projectId: string) => Promise<void>;
  selectVariable: (projectId: string, id: string | null) => Promise<void>;
  createVariable: (
    projectId: string,
    name: string,
    core?: string | null,
    scope?: string,
  ) => Promise<Variable | null>;
  updateScope: (
    projectId: string,
    variableId: string,
    scope: VariableScope,
  ) => Promise<void>;
  toggleActive: (
    projectId: string,
    variableId: string,
    active: boolean,
  ) => Promise<void>;
  saveContent: (
    projectId: string,
    variableId: string,
    content: string,
  ) => Promise<void>;
  archiveVariable: (projectId: string, variableId: string) => Promise<void>;
  loadContent: (projectId: string, variableId: string) => Promise<void>;

  // ── Card actions ─────────────────────────────────────────────────────────────

  loadCards: (projectId: string, variableId: string) => Promise<void>;
  selectCard: (projectId: string, cardId: string | null) => Promise<void>;
  addCard: (projectId: string, title: string) => Promise<void>;
  saveCardContent: (projectId: string, cardId: string, content: string) => Promise<void>;
  removeCard: (projectId: string, cardId: string) => Promise<void>;
  loadCardContent: (projectId: string, cardId: string) => Promise<void>;
}

// ── Scope label map ────────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<VariableScope, string> = {
  always: 'Always',
  expand: 'On Expand',
  write: 'On Write',
  manual: 'Manual',
};

export { SCOPE_LABELS };

// ── Store ──────────────────────────────────────────────────────────────────────

export const useVariableStore = create<VariableStore>()((set, get) => ({
  // ── Initial state ────────────────────────────────────────────────────────────

  variables: [],
  selectedVariableId: null,
  variableContent: {},
  loading: false,

  cards: [],
  selectedCardId: null,
  cardContent: {},

  // ── loadVariables ────────────────────────────────────────────────────────────

  loadVariables: async (projectId: string) => {
    set({ loading: true });
    try {
      const variables = await invoke('variables:list', { projectId });
      set({ variables, loading: false });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Failed to load variables');
      console.warn(
        `[variableStore] variables:list failed (IPC may not be wired yet):`,
        err,
      );
      set({ loading: false });
    }
  },

  // ── selectVariable ───────────────────────────────────────────────────────────

  selectVariable: async (projectId: string, id: string | null) => {
    set({
      selectedVariableId: id,
      cards: [],
      selectedCardId: null,
      cardContent: {},
    });

    if (id === null) return;

    // Load the variable's content
    try {
      const result = await invoke('variables:get', {
        projectId,
        variableId: id,
      });
      set((state) => ({
        variableContent: {
          ...state.variableContent,
          [id]: result.content,
        },
      }));

      // If this is a Character / Voice Sheet, load cards too
      const variable = get().variables.find((v) => v.id === id);
      if (variable?.core === 'characters') {
        try {
          const cards = await invoke('variables:listCards', {
            projectId,
            variableId: id,
          });
          set({ cards });
        } catch (cardErr) {
          const e2 = cardErr as { code?: string; message?: string };
          useToastStore.getState().error(e2.code ?? 'VARIABLE_ERROR', e2.message ?? 'Failed to load character cards');
          console.warn(
            `[variableStore] variables:listCards failed:`,
            cardErr,
          );
          set({ cards: [] });
        }
      }
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Failed to load variable');
      console.warn(
        `[variableStore] variables:get failed (IPC may not be wired yet):`,
        err,
      );
    }
  },

  // ── createVariable ───────────────────────────────────────────────────────────

  createVariable: async (
    projectId: string,
    name: string,
    core?: string | null,
    scope?: string,
  ) => {
    try {
      const variable = await invoke('variables:create', {
        projectId,
        name,
        core: (core as Variable['core']) ?? null,
        scope: (scope as VariableScope) ?? 'manual',
      });
      set((state) => ({
        variables: [...state.variables, variable],
      }));
      return variable;
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Failed to create variable');
      console.warn(
        `[variableStore] variables:create failed:`,
        err,
      );
      return null;
    }
  },

  // ── updateScope ──────────────────────────────────────────────────────────────

  updateScope: async (projectId, variableId, scope) => {
    try {
      const updated = await invoke('variables:setScope', {
        projectId,
        variableId,
        scope,
      });
      set((state) => ({
        variables: state.variables.map((v) =>
          v.id === variableId ? updated : v,
        ),
      }));
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Failed to update scope');
      console.warn(
        `[variableStore] variables:setScope failed:`,
        err,
      );
    }
  },

  // ── toggleActive ─────────────────────────────────────────────────────────────

  toggleActive: async (projectId, variableId, active) => {
    try {
      const updated = await invoke('variables:setActive', {
        projectId,
        variableId,
        active,
      });
      set((state) => ({
        variables: state.variables.map((v) =>
          v.id === variableId ? updated : v,
        ),
      }));
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Failed to toggle variable');
      console.warn(
        `[variableStore] variables:setActive failed:`,
        err,
      );
    }
  },

  // ── saveContent ──────────────────────────────────────────────────────────────

  saveContent: async (projectId, variableId, content) => {
    // Optimistic update: store content locally immediately
    set((state) => ({
      variableContent: {
        ...state.variableContent,
        [variableId]: content,
      },
    }));
    try {
      await invoke('variables:save', { projectId, variableId, content });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Failed to save content');
      console.warn(
        `[variableStore] variables:save failed (content held in memory):`,
        err,
      );
    }
  },

  // ── archiveVariable ──────────────────────────────────────────────────────────

  archiveVariable: async (projectId, variableId) => {
    try {
      await invoke('variables:archive', { projectId, variableId });
      set((state) => ({
        variables: state.variables.filter((v) => v.id !== variableId),
        selectedVariableId:
          state.selectedVariableId === variableId
            ? null
            : state.selectedVariableId,
      }));
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Failed to archive variable');
      console.warn(
        `[variableStore] variables:archive failed:`,
        err,
      );
    }
  },

  // ── loadContent ──────────────────────────────────────────────────────────────

  loadContent: async (projectId, variableId) => {
    try {
      const result = await invoke('variables:get', {
        projectId,
        variableId,
      });
      set((state) => ({
        variableContent: {
          ...state.variableContent,
          [variableId]: result.content,
        },
      }));
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Failed to load variable');
      console.warn(
        `[variableStore] variables:get failed:`,
        err,
      );
    }
  },

  // ── Card actions ─────────────────────────────────────────────────────────────

  loadCards: async (projectId, variableId) => {
    try {
      const cards = await invoke('variables:listCards', {
        projectId,
        variableId,
      });
      set({ cards, selectedCardId: null, cardContent: {} });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Failed to load cards');
      console.warn(
        `[variableStore] variables:listCards failed:`,
        err,
      );
    }
  },

  selectCard: async (projectId, cardId) => {
    set({ selectedCardId: cardId });

    if (cardId === null) return;

    // Load card content if not already loaded
    try {
      // The IPC doesn't have a dedicated "getCard" command; we reload
      // cards list for now. Card content loads via loadCardContent.
      const state = get();
      if (!(cardId in state.cardContent)) {
        // Content will be loaded when switching; for now just ensure
        // cardContent has an entry so the editor doesn't error.
        set((s) => ({
          cardContent: {
            ...s.cardContent,
            [cardId]: s.cardContent[cardId] ?? '<p></p>',
          },
        }));
      }
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Failed to select card');
      console.warn(
        `[variableStore] selectCard failed:`,
        err,
      );
    }
  },

  addCard: async (projectId, title) => {
    const variableId = get().selectedVariableId;
    if (!variableId) return;

    try {
      const { cardId } = await invoke('variables:addCard', {
        projectId,
        variableId,
        title,
      });
      set((state) => ({
        cards: [...state.cards, { cardId, title }],
        selectedCardId: cardId,
        cardContent: {
          ...state.cardContent,
          [cardId]: '<p></p>',
        },
      }));
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Failed to add card');
      console.warn(
        `[variableStore] variables:addCard failed:`,
        err,
      );
    }
  },

  saveCardContent: async (projectId, cardId, content) => {
    const variableId = get().selectedVariableId;
    if (!variableId) return;

    // Optimistic update
    set((state) => ({
      cardContent: {
        ...state.cardContent,
        [cardId]: content,
      },
    }));

    try {
      await invoke('variables:saveCard', {
        projectId,
        variableId,
        cardId,
        content,
      });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Failed to save card content');
      console.warn(
        `[variableStore] variables:saveCard failed (content held in memory):`,
        err,
      );
    }
  },

  removeCard: async (projectId, cardId) => {
    const variableId = get().selectedVariableId;
    if (!variableId) return;

    try {
      await invoke('variables:removeCard', {
        projectId,
        variableId,
        cardId,
      });
      set((state) => ({
        cards: state.cards.filter((c) => c.cardId !== cardId),
        selectedCardId:
          state.selectedCardId === cardId ? null : state.selectedCardId,
      }));
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(e.code ?? 'VARIABLE_ERROR', e.message ?? 'Failed to remove card');
      console.warn(
        `[variableStore] variables:removeCard failed:`,
        err,
      );
    }
  },

  loadCardContent: async (projectId, cardId) => {
    // Card content is stored as part of the variable content system.
    // The variables:saveCard command saves card content, but there's no
    // dedicated card-load IPC — cards are fetched via listCards and their
    // content would be loaded differently. For now, load from local state
    // or initialize with empty content.
    if (!(cardId in get().cardContent)) {
      set((state) => ({
        cardContent: {
          ...state.cardContent,
          [cardId]: '<p></p>',
        },
      }));
    }
  },
}));
