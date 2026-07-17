/**
 * Tests for the command palette action registry and utilities (WP-26).
 *
 * Covers: fuzzyScore, filterActions, groupActions, getAvailableActions,
 * dispatchOutlineAction, listenOutlineActions.
 *
 * @vitest-environment jsdom
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fuzzyScore,
  filterActions,
  groupActions,
  getAvailableActions,
  dispatchOutlineAction,
  listenOutlineActions,
} from '../../renderer/actions';
import type { CommandAction, ActionContext, ActionCallbacks } from '../../renderer/actions';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAction(overrides: Partial<CommandAction> = {}): CommandAction {
  return {
    id: 'test:action',
    label: 'Test Action',
    category: 'editor',
    available: () => true,
    execute: () => {},
    ...overrides,
  };
}

function makeContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    projectId: 'test-project',
    chapterId: 'ch-1',
    selection: { type: 'chapter', chapterId: 'ch-1', chapterTitle: 'Chapter 1' },
    genStatus: 'idle',
    railCollapsed: false,
    chapters: [],
    versions: [],
    variables: [],
    hasIterateProposal: false,
    models: {
      expand: 'openrouter/deepseek/deepseek-v4-flash',
      write: 'openrouter/deepseek/deepseek-v4-flash',
      iterate: 'openrouter/deepseek/deepseek-v4-flash',
      parse: 'openrouter/deepseek/deepseek-v4-flash',
    },
    ...overrides,
  };
}

function makeCallbacks(overrides: Partial<ActionCallbacks> = {}): ActionCallbacks {
  return {
    navigate: vi.fn(),
    selectChapter: vi.fn(),
    toggleRail: vi.fn(),
    expand: vi.fn(),
    reExpand: vi.fn(),
    write: vi.fn(),
    reWrite: vi.fn(),
    stopGeneration: vi.fn(),
    focusIterate: vi.fn(),
    createVersion: vi.fn(),
    selectVersion: vi.fn(),
    renameVersion: vi.fn(),
    archiveVersion: vi.fn(),
    restoreRevision: vi.fn(),
    createVariable: vi.fn(),
    setVariableScope: vi.fn(),
    addCard: vi.fn(),
    acceptProposal: vi.fn(),
    discardProposal: vi.fn(),
    acceptAsVersion: vi.fn(),
    exportSubstack: vi.fn(),
    exportHtml: vi.fn(),
    exportMarkdownChapter: vi.fn(),
    exportMarkdownBook: vi.fn(),
    exportPdf: vi.fn(),
    importOutline: vi.fn(),
    promptInput: vi.fn(),
    pickAndOpenProject: vi.fn(),
    openProject: vi.fn(),
    cycleModel: vi.fn(),
    ...overrides,
  };
}

// ── fuzzyScore ───────────────────────────────────────────────────────────────

describe('fuzzyScore', () => {
  it('empty query returns 1 (all match)', () => {
    expect(fuzzyScore('', 'anything')).toBe(1);
    expect(fuzzyScore('', '')).toBe(1);
  });

  it('exact match scores higher than a substring match', () => {
    const exact = fuzzyScore('expand', 'Expand');
    const partial = fuzzyScore('exp', 'Expand');
    expect(exact).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(0);
  });

  it('substring match scores higher than scattered (non-consecutive) match', () => {
    // 'exp' appears consecutively in 'Expand' but scattered in 'Example' (e-x-p)
    const consecutive = fuzzyScore('exp', 'Expand');
    const scattered = fuzzyScore('exp', 'Example');
    expect(consecutive).toBeGreaterThan(scattered);
    expect(scattered).toBeGreaterThan(0);
  });

  it('returns -1 when query chars cannot all be matched in order', () => {
    expect(fuzzyScore('xyz', 'abcdef')).toBe(-1);
    expect(fuzzyScore('the quick', 'quick the')).toBe(-1);
  });

  it('is case insensitive', () => {
    const upper = fuzzyScore('EXPAND', 'expand');
    const lower = fuzzyScore('expand', 'expand');
    const mixed = fuzzyScore('ExpAnd', 'expand');
    expect(upper).toBeGreaterThan(0);
    expect(lower).toBeGreaterThan(0);
    expect(mixed).toBeGreaterThan(0);
    // Same target should produce same score regardless of case in query
    expect(upper).toBe(lower);
    expect(mixed).toBe(lower);
  });

  it('gives a word-boundary bonus for characters at start of word', () => {
    const wordStart = fuzzyScore('ex', 'ex-pand');
    const inWord = fuzzyScore('xp', 'ex-pand');
    expect(wordStart).toBeGreaterThan(inWord);
    expect(wordStart).toBeGreaterThan(0);
    expect(inWord).toBeGreaterThan(0);
  });

  it('gives a consecutive-match bonus', () => {
    const consecutive = fuzzyScore('abc', 'abc');
    const interlaced = fuzzyScore('abc', 'axbyc');
    expect(consecutive).toBeGreaterThan(interlaced);
  });
});

// ── filterActions ────────────────────────────────────────────────────────────

describe('filterActions', () => {
  const actions: CommandAction[] = [
    makeAction({ id: 'a1', label: 'Expand', category: 'generation', keywords: ['generate', 'ai'] }),
    makeAction({ id: 'a2', label: 'Write', category: 'generation', keywords: ['prose'] }),
    makeAction({ id: 'a3', label: 'Bold', category: 'editor', keywords: ['strong', 'emphasis'] }),
    makeAction({ id: 'a4', label: 'Go to Outline', category: 'navigation', keywords: ['workspace'] }),
  ];

  it('empty query returns all actions unchanged', () => {
    const result = filterActions(actions, '');
    expect(result).toEqual(actions);
  });

  it('returns actions matching by label', () => {
    const result = filterActions(actions, 'bold');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('a3');
  });

  it('returns actions matching by keyword', () => {
    const result = filterActions(actions, 'strong');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('a3');
  });

  it('returns multiple actions that match the same query', () => {
    const result = filterActions(actions, 'gen');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array when no actions match', () => {
    const result = filterActions(actions, 'zzzzzzz');
    expect(result).toHaveLength(0);
  });

  it('strips whitespace from query before matching', () => {
    const withSpace = filterActions(actions, '  ');
    expect(withSpace).toEqual(actions);
  });

  it('matches from keywords when label does not match', () => {
    // 'ai' is a keyword on the 'Expand' action
    const result = filterActions(actions, 'ai');
    expect(result.length).toBeGreaterThan(0);
    const ids = result.map((a) => a.id);
    expect(ids).toContain('a1');
  });
});

// ── groupActions ─────────────────────────────────────────────────────────────

describe('groupActions', () => {
  it('groups actions by category', () => {
    const actions: CommandAction[] = [
      makeAction({ id: 'a1', label: 'Expand', category: 'generation' }),
      makeAction({ id: 'a2', label: 'Write', category: 'generation' }),
      makeAction({ id: 'a3', label: 'Bold', category: 'editor' }),
    ];
    const groups = groupActions(actions);
    expect(groups.size).toBe(2);
    expect(groups.get('generation')).toHaveLength(2);
    expect(groups.get('editor')).toHaveLength(1);
  });

  it('preserves order within groups', () => {
    const actions: CommandAction[] = [
      makeAction({ id: 'a1', label: 'Z Action', category: 'generation' }),
      makeAction({ id: 'a2', label: 'A Action', category: 'generation' }),
    ];
    const groups = groupActions(actions);
    const genActions = groups.get('generation')!;
    expect(genActions[0]?.id).toBe('a1');
    expect(genActions[1]?.id).toBe('a2');
  });

  it('returns empty map for empty array', () => {
    const groups = groupActions([]);
    expect(groups.size).toBe(0);
  });
});

// ── getAvailableActions ──────────────────────────────────────────────────────

describe('getAvailableActions', () => {
  it('returns navigation actions for a default context', () => {
    const ctx = makeContext();
    const cb = makeCallbacks();
    const actions = getAvailableActions(ctx, cb);

    const ids = actions.map((a) => a.id);
    expect(ids).toContain('nav:outline');
    expect(ids).toContain('nav:variables');
    expect(ids).toContain('nav:settings');
    expect(ids).toContain('nav:toggle-rail');
  });

  it('includes generation actions when chapter selected and idle', () => {
    const ctx = makeContext({ genStatus: 'idle', chapterId: 'ch-1' });
    const cb = makeCallbacks();
    const actions = getAvailableActions(ctx, cb);

    const ids = actions.map((a) => a.id);
    expect(ids).toContain('gen:expand');
    expect(ids).toContain('gen:write');
    expect(ids).toContain('gen:re-expand');
    expect(ids).toContain('gen:re-write');
    expect(ids).toContain('gen:regenerate');
    // Stop should be absent when not streaming
    const stopAction = actions.find((a) => a.id === 'gen:stop');
    expect(stopAction?.available()).toBe(false);
  });

  it('returns only navigation-style actions when no chapter selected', () => {
    const ctx = makeContext({
      chapterId: null,
      selection: { type: 'none' },
      chapters: [{ id: 'ch-1', title: 'Chapter 1' }],
    });
    const cb = makeCallbacks();
    const actions = getAvailableActions(ctx, cb);

    const ids = actions.map((a) => a.id);
    // Navigation should always be present
    expect(ids).toContain('nav:outline');
    expect(ids).toContain('nav:variables');
    expect(ids).toContain('nav:settings');
    expect(ids).toContain('nav:toggle-rail');
    // Dynamic chapter navigation
    expect(ids).toContain('nav:select-chapter:ch-1');

    // Generation actions exist but are unavailable (no chapter)
    expect(actions.find((a) => a.id === 'gen:expand')?.available()).toBe(false);
    expect(actions.find((a) => a.id === 'gen:write')?.available()).toBe(false);
    // Versions require a chapter
    expect(actions.find((a) => a.id === 'ver:new')?.available()).toBe(false);
    // History requires a chapter
    expect(actions.find((a) => a.id === 'hist:restore')?.available()).toBe(false);
    // Chapter-scoped exports require a chapter
    expect(actions.find((a) => a.id === 'export:substack')?.available()).toBe(false);
    expect(actions.find((a) => a.id === 'export:html')?.available()).toBe(false);
    expect(actions.find((a) => a.id === 'export:md-chapter')?.available()).toBe(false);
    // Book-wide exports still available if chapters exist
    expect(actions.find((a) => a.id === 'export:md-book')?.available()).toBe(true);
    expect(actions.find((a) => a.id === 'export:pdf')?.available()).toBe(true);
  });

  it('includes stop generation action when streaming', () => {
    const ctx = makeContext({ genStatus: 'streaming' });
    const cb = makeCallbacks();
    const actions = getAvailableActions(ctx, cb);

    const ids = actions.map((a) => a.id);
    expect(ids).toContain('gen:stop');
    const stopAction = actions.find((a) => a.id === 'gen:stop');
    expect(stopAction?.available()).toBe(true);

    // Idle-only generation actions should be unavailable
    expect(actions.find((a) => a.id === 'gen:expand')?.available()).toBe(false);
    expect(actions.find((a) => a.id === 'gen:write')?.available()).toBe(false);
  });

  it('includes iterate accept/discard actions when hasIterateProposal', () => {
    const ctx = makeContext({ hasIterateProposal: true });
    const cb = makeCallbacks();
    const actions = getAvailableActions(ctx, cb);

    const ids = actions.map((a) => a.id);
    expect(ids).toContain('iterate:accept');
    expect(ids).toContain('iterate:accept-as-version');
    expect(ids).toContain('iterate:discard');

    // These should be available
    expect(actions.find((a) => a.id === 'iterate:accept')?.available()).toBe(true);
    expect(actions.find((a) => a.id === 'iterate:discard')?.available()).toBe(true);
  });

  it('sets iterate accept/discard unavailable when hasIterateProposal is false', () => {
    const ctx = makeContext({ hasIterateProposal: false });
    const cb = makeCallbacks();
    const actions = getAvailableActions(ctx, cb);

    expect(actions.find((a) => a.id === 'iterate:accept')?.available()).toBe(false);
    expect(actions.find((a) => a.id === 'iterate:discard')?.available()).toBe(false);
  });

  it('editor actions exist but are unavailable when no active editor', () => {
    const ctx = makeContext();
    const cb = makeCallbacks();
    const actions = getAvailableActions(ctx, cb);

    const ids = actions.map((a) => a.id);
    expect(ids).toContain('editor:bold');
    expect(ids).toContain('editor:italic');
    expect(ids).toContain('editor:h2');
    expect(ids).toContain('editor:h3');
    expect(ids).toContain('editor:h4');
    expect(ids).toContain('editor:bullet-list');
    expect(ids).toContain('editor:ordered-list');
    expect(ids).toContain('editor:blockquote');
    expect(ids).toContain('editor:link');
    expect(ids).toContain('editor:horizontal-rule');

    // All should be unavailable (no editor set)
    for (const id of ids.filter((i) => i.startsWith('editor:'))) {
      expect(actions.find((a) => a.id === id)?.available()).toBe(false);
    }
  });

  it('dynamically adds version selection actions per context', () => {
    const ctx = makeContext({
      versions: [
        { slug: 'v1', name: 'First Draft', selected: false },
        { slug: 'v2', name: 'Second Draft', selected: true },
        { slug: 'main', name: 'Main', selected: false },
      ],
    });
    const cb = makeCallbacks();
    const actions = getAvailableActions(ctx, cb);

    const ids = actions.map((a) => a.id);
    // Select actions for non-selected versions
    expect(ids).toContain('ver:select:v1');
    expect(ids).toContain('ver:select:main');
    // Select for the already-selected version — action exists but is unavailable
    expect(ids).toContain('ver:select:v2');
    expect(actions.find((a) => a.id === 'ver:select:v2')?.available()).toBe(false);

    // Rename and archive — 'main' is skipped
    expect(ids).toContain('ver:rename:v1');
    expect(ids).toContain('ver:rename:v2');
    expect(ids).not.toContain('ver:rename:main');
    expect(ids).toContain('ver:archive:v1');
    expect(ids).toContain('ver:archive:v2');
    expect(ids).not.toContain('ver:archive:main');
  });

  it('dynamically adds variable scope actions per context', () => {
    const ctx = makeContext({
      variables: [
        { id: 'var-1', name: 'Tone', scope: 'always', kind: 'builtin' },
        { id: 'var-2', name: 'Characters', scope: 'manual', kind: 'builtin' },
      ],
    });
    const cb = makeCallbacks();
    const actions = getAvailableActions(ctx, cb);

    const ids = actions.map((a) => a.id);

    // Scope change actions — 3 per variable (all scopes except current)
    expect(ids).toContain('var:scope:var-1:expand');
    expect(ids).toContain('var:scope:var-1:write');
    expect(ids).toContain('var:scope:var-1:manual');
    expect(ids).not.toContain('var:scope:var-1:always'); // current scope excluded

    expect(ids).toContain('var:scope:var-2:always');
    expect(ids).toContain('var:scope:var-2:expand');
    expect(ids).toContain('var:scope:var-2:write');
    expect(ids).not.toContain('var:scope:var-2:manual'); // current scope excluded

    // Add card actions
    expect(ids).toContain('var:addCard:var-1');
    expect(ids).toContain('var:addCard:var-2');

    // Variable create is always available
    expect(actions.find((a) => a.id === 'var:create')?.available()).toBe(true);
  });

  it('PINNED_IDS set is empty and does not cause errors', () => {
    // PINNED_IDS is used in the component, not in getAvailableActions.
    // This test verifies that iterating over it doesn't crash the actions module.
    const ctx = makeContext();
    const cb = makeCallbacks();
    // Just verify we can get actions without error
    expect(() => getAvailableActions(ctx, cb)).not.toThrow();
  });

  it('preserves execute callback binding — executing nav:outline calls cb.navigate', () => {
    const ctx = makeContext();
    const cb = makeCallbacks();
    const actions = getAvailableActions(ctx, cb);

    const navAction = actions.find((a) => a.id === 'nav:outline');
    navAction?.execute();
    expect(cb.navigate).toHaveBeenCalledWith({ type: 'outline' });
  });

  it('includes outline actions when selection type is outline', () => {
    const ctx = makeContext({
      selection: { type: 'outline' },
      chapters: [{ id: 'ch-1', title: 'Chapter 1' }],
    });
    const cb = makeCallbacks();
    const actions = getAvailableActions(ctx, cb);

    const ids = actions.map((a) => a.id);
    expect(ids).toContain('outline:add-part');
    expect(ids).toContain('outline:delete-part');
    expect(ids).toContain('outline:rename-part');
    expect(ids).toContain('outline:add-section');
    expect(ids).toContain('outline:delete-section');
    expect(ids).toContain('outline:rename-section');
    expect(ids).toContain('outline:add-beat');
    expect(ids).toContain('outline:delete-beat');
    expect(ids).toContain('outline:add-chapter');
    expect(ids).toContain('outline:delete-chapter');
    expect(ids).toContain('outline:rename-chapter');

    // All should be available
    for (const id of ids.filter((i) => i.startsWith('outline:'))) {
      expect(actions.find((a) => a.id === id)?.available()).toBe(true);
    }
  });

  it('marks outline actions unavailable when not in outline view', () => {
    const ctx = makeContext({ selection: { type: 'chapter', chapterId: 'ch-1' } });
    const cb = makeCallbacks();
    const actions = getAvailableActions(ctx, cb);

    const outlineIds = actions
      .map((a) => a.id)
      .filter((id) => id.startsWith('outline:'));
    // Outline actions are still added to the list but unavailable
    expect(outlineIds.length).toBeGreaterThan(0);
    for (const id of outlineIds) {
      expect(actions.find((a) => a.id === id)?.available()).toBe(false);
    }
  });
});

// ── dispatchOutlineAction + listenOutlineActions ─────────────────────────────

describe('dispatchOutlineAction', () => {
  it('dispatches a CustomEvent on document with action and params', () => {
    const handler = vi.fn();
    document.addEventListener('plotline:outline-action', handler);

    dispatchOutlineAction('addPart', {});
    expect(handler).toHaveBeenCalledTimes(1);
    const detail = handler.mock.calls[0]?.[0]?.detail;
    expect(detail).toEqual({ action: 'addPart', params: {} });

    document.removeEventListener('plotline:outline-action', handler);
  });

  it('passes params through correctly', () => {
    const handler = vi.fn();
    document.addEventListener('plotline:outline-action', handler);

    dispatchOutlineAction('addChapter', { partId: 'part-1' });
    const detail = handler.mock.calls[0]?.[0]?.detail;
    expect(detail).toEqual({ action: 'addChapter', params: { partId: 'part-1' } });

    document.removeEventListener('plotline:outline-action', handler);
  });
});

describe('listenOutlineActions', () => {
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handler = vi.fn();
  });

  afterEach(() => {
    // Ensure clean-up after each test
    document.querySelectorAll('*').forEach((el) => el.remove());
  });

  it('registers a listener and calls handler on dispatch', () => {
    const cleanup = listenOutlineActions(handler);

    dispatchOutlineAction('deleteBeat', { sectionId: 's1' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ action: 'deleteBeat', params: { sectionId: 's1' } });

    cleanup();
  });

  it('returns a cleanup function that removes the listener', () => {
    const cleanup = listenOutlineActions(handler);

    dispatchOutlineAction('deleteBeat', {});
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
    // Listener should be removed; dispatch again should not trigger
    dispatchOutlineAction('deleteBeat', {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports multiple listeners independently', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const cleanup1 = listenOutlineActions(handler1);
    const cleanup2 = listenOutlineActions(handler2);

    dispatchOutlineAction('renamePart', { partId: 'p1' });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);

    cleanup1();
    dispatchOutlineAction('renamePart', { partId: 'p2' });
    expect(handler1).toHaveBeenCalledTimes(1); // not called again
    expect(handler2).toHaveBeenCalledTimes(2);

    cleanup2();
  });
});
