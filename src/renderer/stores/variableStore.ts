/**
 * Variable store — Zustand-based state for the Variable Studio.
 *
 * Wraps the typed IPC client so the VariableWorkspace never calls
 * window.plotline directly. Handles errors gracefully: every action
 * logs failures and surfaces them via toast rather than throwing.
 *
 * Schema: StoryVariable (v2) — no active field, kind replaces core,
 * position replaces order. Content is fetched separately via variables:get.
 *
 * Version: 0.2.0 | 2026-07-17
 */

import { create } from 'zustand';
import type { StoryVariable, VariableScope } from '../../shared/schemas/variable';
import { invoke } from '../ipc/client';
import { useToastStore } from './toastStore';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CardSummary {
  cardId: string;
  title: string;
}

export interface VariableStore {
  // ── State ────────────────────────────────────────────────────────────────────

  /** All variables (metadata only — no content). */
  variables: StoryVariable[];
  selectedVariableId: string | null;
  /** variableId → HTML content (loaded on demand via variables:get). */
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
    scope?: VariableScope,
  ) => Promise<StoryVariable | null>;
  renameVariable: (
    projectId: string,
    variableId: string,
    name: string,
  ) => Promise<void>;
  updateScope: (
    projectId: string,
    variableId: string,
    scope: VariableScope,
  ) => Promise<void>;
  saveContent: (
    projectId: string,
    variableId: string,
    content: string,
  ) => Promise<void>;
  deleteVariable: (projectId: string, variableId: string) => Promise<void>;
  reorderVariables: (
    projectId: string,
    variableId: string,
    newPosition: number,
  ) => Promise<void>;
  loadContent: (projectId: string, variableId: string) => Promise<void>;

  // ── Card actions ─────────────────────────────────────────────────────────────

  loadCards: (projectId: string, variableId: string) => Promise<void>;
  selectCard: (projectId: string, cardId: string | null) => Promise<void>;
  addCard: (projectId: string, title: string) => Promise<void>;
  saveCardContent: (projectId: string, cardId: string, content: string) => Promise<void>;
  removeCard: (projectId: string, cardId: string) => Promise<void>;
  loadCardContent: (projectId: string, cardId: string) => Promise<void>;
}

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
  // Calls variables:list which returns StoryVariable[] (metadata only, no content).

  loadVariables: async (projectId: string) => {
    set({ loading: true });
    try {
      const variables = await invoke('variables:list', { projectId });
      set({ variables, loading: false });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(
        e.code ?? 'VARIABLE_ERROR',
        e.message ?? 'Failed to load variables',
      );
      console.warn('[variableStore] variables:list failed:', err);
      set({ loading: false });
    }
  },

  // ── selectVariable ───────────────────────────────────────────────────────────
  // Loads content via variables:get. For Character / Voice Sheet variables
  // (builtin kind with id 'characters'), also loads the card list.

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

      // If this is the Character / Voice Sheet builtin, load cards too
      const variable = get().variables.find((v) => v.id === id);
      if (variable && variable.kind === 'builtin' && variable.id === 'characters') {
        try {
          const cards = await invoke('variables:listCards', {
            projectId,
            variableId: id,
          });
          set({ cards });
        } catch (cardErr) {
          const e2 = cardErr as { code?: string; message?: string };
          useToastStore.getState().error(
            e2.code ?? 'VARIABLE_ERROR',
            e2.message ?? 'Failed to load character cards',
          );
          console.warn('[variableStore] variables:listCards failed:', cardErr);
          set({ cards: [] });
        }
      }
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(
        e.code ?? 'VARIABLE_ERROR',
        e.message ?? 'Failed to load variable',
      );
      console.warn('[variableStore] variables:get failed:', err);
    }
  },

  // ── createVariable ───────────────────────────────────────────────────────────
  // No `core` parameter — the kind is determined server-side.

  createVariable: async (
    projectId: string,
    name: string,
    scope?: VariableScope,
  ) => {
    try {
      const variable = await invoke('variables:create', {
        projectId,
        name,
        scope: scope ?? 'manual',
      });
      set((state) => ({
        variables: [...state.variables, variable],
      }));
      return variable;
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(
        e.code ?? 'VARIABLE_ERROR',
        e.message ?? 'Failed to create variable',
      );
      console.warn('[variableStore] variables:create failed:', err);
      return null;
    }
  },

  // ── renameVariable ───────────────────────────────────────────────────────────

  renameVariable: async (projectId, variableId, name) => {
    try {
      const updated = await invoke('variables:rename', {
        projectId,
        variableId,
        name,
      });
      set((state) => ({
        variables: state.variables.map((v) =>
          v.id === variableId ? updated : v,
        ),
      }));
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(
        e.code ?? 'VARIABLE_ERROR',
        e.message ?? 'Failed to rename variable',
      );
      console.warn('[variableStore] variables:rename failed:', err);
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
      useToastStore.getState().error(
        e.code ?? 'VARIABLE_ERROR',
        e.message ?? 'Failed to update scope',
      );
      console.warn('[variableStore] variables:setScope failed:', err);
    }
  },

  // ── saveContent ──────────────────────────────────────────────────────────────
  // Calls variables:setContent (was variables:save in legacy). Optimistic update.

  saveContent: async (projectId, variableId, content) => {
    set((state) => ({
      variableContent: {
        ...state.variableContent,
        [variableId]: content,
      },
    }));
    try {
      await invoke('variables:setContent', { projectId, variableId, content });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(
        e.code ?? 'VARIABLE_ERROR',
        e.message ?? 'Failed to save content',
      );
      console.warn(
        '[variableStore] variables:setContent failed (content held in memory):',
        err,
      );
    }
  },

  // ── deleteVariable ───────────────────────────────────────────────────────────
  // Calls variables:delete (was variables:archive in legacy). Confirmation
  // happens in the component, not here.

  deleteVariable: async (projectId, variableId) => {
    try {
      await invoke('variables:delete', { projectId, variableId });
      set((state) => ({
        variables: state.variables.filter((v) => v.id !== variableId),
        selectedVariableId:
          state.selectedVariableId === variableId
            ? null
            : state.selectedVariableId,
      }));
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(
        e.code ?? 'VARIABLE_ERROR',
        e.message ?? 'Failed to delete variable',
      );
      console.warn('[variableStore] variables:delete failed:', err);
    }
  },

  // ── reorderVariables ─────────────────────────────────────────────────────────

  reorderVariables: async (projectId, variableId, newPosition) => {
    try {
      const updated = await invoke('variables:reorder', {
        projectId,
        variableId,
        newPosition,
      });
      set({ variables: updated });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      useToastStore.getState().error(
        e.code ?? 'VARIABLE_ERROR',
        e.message ?? 'Failed to reorder variables',
      );
      console.warn('[variableStore] variables:reorder failed:', err);
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
      useToastStore.getState().error(
        e.code ?? 'VARIABLE_ERROR',
        e.message ?? 'Failed to load variable content',
      );
      console.warn('[variableStore] variables:get failed:', err);
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
      useToastStore.getState().error(
        e.code ?? 'VARIABLE_ERROR',
        e.message ?? 'Failed to load cards',
      );
      console.warn('[variableStore] variables:listCards failed:', err);
    }
  },

  selectCard: async (_projectId, cardId) => {
    set({ selectedCardId: cardId });

    if (cardId === null) return;

    // Ensure cardContent has a fallback entry so the editor doesn't error
    const state = get();
    if (!(cardId in state.cardContent)) {
      set((s) => ({
        cardContent: {
          ...s.cardContent,
          [cardId]: s.cardContent[cardId] ?? '<p></p>',
        },
      }));
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
      useToastStore.getState().error(
        e.code ?? 'VARIABLE_ERROR',
        e.message ?? 'Failed to add card',
      );
      console.warn('[variableStore] variables:addCard failed:', err);
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
      useToastStore.getState().error(
        e.code ?? 'VARIABLE_ERROR',
        e.message ?? 'Failed to save card content',
      );
      console.warn(
        '[variableStore] variables:saveCard failed (content held in memory):',
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
      useToastStore.getState().error(
        e.code ?? 'VARIABLE_ERROR',
        e.message ?? 'Failed to remove card',
      );
      console.warn('[variableStore] variables:removeCard failed:', err);
    }
  },

  loadCardContent: async (_projectId, cardId) => {
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
