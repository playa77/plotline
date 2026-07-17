/**
 * Command palette action registry.
 *
 * Every user-facing action is defined as a CommandAction with typed metadata
 * (id, label, category, shortcut, keywords) and an availability check function.
 *
 * The registry is consumed by CommandPalette to build the filtered, grouped
 * action list. `getAvailableActions(context, callbacks)` is a pure function
 * that returns only the actions relevant to the current app state.
 *
 * Design: modeled on Raycast/VS Code/Linear — dense, tool-like, no decoration.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import type { WorkspaceSelection } from './components/Workspace';
import type { VariableScope } from '../shared/schemas/variable';
import { getActiveEditor } from './editorRef';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CommandAction {
  /** Unique action identifier. */
  id: string;
  /** Human-readable label shown in the palette list. */
  label: string;
  /** Category for grouping in the palette (section header). */
  category:
    | 'generation'
    | 'chapter'
    | 'outline'
    | 'variables'
    | 'versions'
    | 'history'
    | 'export'
    | 'navigation'
    | 'editor'
    | 'iterate';
  /** Keyboard shortcut display string, e.g. 'Cmd+Shift+E'. */
  shortcut?: string;
  /** Additional search terms to match beyond the label. */
  keywords?: string[];
  /** Whether the action can execute right now. */
  available: () => boolean;
  /** Run the action. */
  execute: () => void;
}

export interface ActionContext {
  projectId: string;
  chapterId: string | null;
  selection: WorkspaceSelection;
  genStatus: 'idle' | 'streaming' | 'done' | 'error';
  railCollapsed: boolean;
  /** Flat list of chapters from demoParts for "Select Chapter" dynamic actions. */
  chapters: Array<{ id: string; title: string }>;
  /** Current versions for the selected chapter. */
  versions: Array<{ slug: string; name: string; selected: boolean }>;
  /** Current variables for "Change variable scope" / toggle actions. */
  variables: Array<{ id: string; name: string; scope: VariableScope; active: boolean }>;
  /** Whether there is an active iterate proposal. */
  hasIterateProposal: boolean;
}

export interface ActionCallbacks {
  navigate: (selection: WorkspaceSelection) => void;
  selectChapter: (chapterId: string, title: string) => void;
  toggleRail: () => void;
  expand: () => Promise<void>;
  reExpand: () => Promise<void>;
  write: () => Promise<void>;
  reWrite: () => Promise<void>;
  stopGeneration: () => Promise<void>;
  focusIterate: () => void;
  createVersion: (name: string) => Promise<void>;
  selectVersion: (slug: string) => Promise<void>;
  renameVersion: (slug: string, newName: string) => Promise<void>;
  archiveVersion: (slug: string) => Promise<void>;
  restoreRevision: (sha: string) => void;
  createVariable: (name: string) => void;
  setVariableActive: (id: string, active: boolean) => void;
  setVariableScope: (id: string, scope: VariableScope) => void;
  addCard: (variableId: string, title: string) => void;
  acceptProposal: () => Promise<void>;
  discardProposal: () => Promise<void>;
  acceptAsVersion: (name: string) => Promise<void>;
  exportSubstack: () => Promise<void>;
  exportHtml: () => Promise<void>;
  exportMarkdownChapter: () => Promise<void>;
  exportMarkdownBook: () => Promise<void>;
  exportPdf: () => Promise<void>;
  /** Prompt for text input inline (used by rename/restore/create). */
  promptInput: (placeholder: string) => string | null;
}

// ── Fuzzy matching ─────────────────────────────────────────────────────────────

/**
 * Score how well `query` matches `target` for filtering.
 * Returns -1 if no match, higher scores are better.
 */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact substring match gets a bonus
  const exactIdx = t.indexOf(q);
  const exactBonus = exactIdx !== -1 ? 1 / (exactIdx + 1) : 0;

  // Fuzzy sequential character matching
  let score = 0;
  let qi = 0;
  let consecutive = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1;
      consecutive++;
      if (consecutive > 1) score += consecutive * 1.5; // consecutive bonus
      // Word boundary bonus (space, hyphen, or start of string)
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '-') {
        score += 2;
      }
      qi++;
    } else {
      consecutive = 0;
    }
  }

  if (qi < q.length) return -1; // Not all query chars matched
  return score + exactBonus * 3;
}

/**
 * Filter and sort actions by query. Groups are preserved — actions within
 * a category are returned in their original order if they match.
 */
export function filterActions(
  actions: CommandAction[],
  query: string,
): CommandAction[] {
  if (!query.trim()) return actions;

  const scored = actions
    .map((a) => {
      const labelScore = fuzzyScore(query, a.label);
      const keywordScore = a.keywords
        ? Math.max(-1, ...a.keywords.map((k) => fuzzyScore(query, k)))
        : -1;
      const bestScore = Math.max(labelScore, keywordScore);
      return { action: a, score: bestScore };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((entry) => entry.action);
}

/** Group actions by category, preserving sort order. */
export function groupActions(
  actions: CommandAction[],
): Map<string, CommandAction[]> {
  const groups = new Map<string, CommandAction[]>();
  for (const action of actions) {
    const list = groups.get(action.category) ?? [];
    list.push(action);
    groups.set(action.category, list);
  }
  return groups;
}

// ── Category display labels ────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<CommandAction['category'], string> = {
  generation: 'Generation',
  chapter: 'Chapter',
  outline: 'Outline',
  variables: 'Variables',
  versions: 'Versions',
  history: 'History',
  export: 'Export',
  navigation: 'Navigation',
  editor: 'Editor',
  iterate: 'Iterate',
};

// ── Action definitions ─────────────────────────────────────────────────────────

/**
 * Build the full action list from context and callbacks.
 * Each action's `available` and `execute` functions are bound to the
 * provided context and callbacks. Dynamic actions (select chapter,
 * select version, scope change, etc.) are expanded from context data.
 */
export function getAvailableActions(
  ctx: ActionContext,
  cb: ActionCallbacks,
): CommandAction[] {
  const isGenIdle = ctx.genStatus === 'idle' || ctx.genStatus === 'done' || ctx.genStatus === 'error';
  const hasChapter = ctx.chapterId !== null;
  const isStreaming = ctx.genStatus === 'streaming';
  const isOutlineView = ctx.selection.type === 'outline';
  const isChapterView = ctx.selection.type === 'chapter';
  const isVariablesView = ctx.selection.type === 'variables';
  const editor = getActiveEditor();
  const hasEditableEditor = editor !== null && editor.isEditable;

  const actions: CommandAction[] = [];

  // ── Navigation ──────────────────────────────────────────────────────

  actions.push({
    id: 'nav:outline',
    label: 'Go to Outline workspace',
    category: 'navigation',
    keywords: ['workspace', 'structure'],
    available: () => true,
    execute: () => cb.navigate({ type: 'outline' }),
  });

  actions.push({
    id: 'nav:variables',
    label: 'Go to Variables workspace',
    category: 'navigation',
    keywords: ['workspace', 'characters', 'worldbuilding'],
    available: () => true,
    execute: () => cb.navigate({ type: 'variables' }),
  });

  actions.push({
    id: 'nav:settings',
    label: 'Go to Settings workspace',
    category: 'navigation',
    keywords: ['config', 'preferences'],
    available: () => true,
    execute: () => cb.navigate({ type: 'none' }),
  });

  actions.push({
    id: 'nav:toggle-rail',
    label: ctx.railCollapsed ? 'Expand context rail' : 'Collapse context rail',
    category: 'navigation',
    keywords: ['sidebar', 'panel'],
    available: () => true,
    execute: () => cb.toggleRail(),
  });

  // Dynamic: select chapter
  for (const ch of ctx.chapters) {
    const isSelected = ctx.chapterId === ch.id;
    actions.push({
      id: `nav:select-chapter:${ch.id}`,
      label: `Select chapter: ${ch.title}`,
      category: 'navigation',
      keywords: ['go to', 'focus', ch.title],
      available: () => !isSelected,
      execute: () => cb.selectChapter(ch.id, ch.title),
    });
  }

  // ── Generation ───────────────────────────────────────────────────────

  actions.push({
    id: 'gen:expand',
    label: 'Expand',
    category: 'generation',
    shortcut: 'Cmd+Shift+E',
    keywords: ['generate', 'ai', 'outline expanded'],
    available: () => hasChapter && isGenIdle,
    execute: () => void cb.expand(),
  });

  actions.push({
    id: 'gen:re-expand',
    label: 'Re-expand',
    category: 'generation',
    keywords: ['regenerate', 'ai', 'redo'],
    available: () => hasChapter && isGenIdle,
    execute: () => void cb.reExpand(),
  });

  actions.push({
    id: 'gen:write',
    label: 'Write',
    category: 'generation',
    shortcut: 'Cmd+Shift+W',
    keywords: ['generate', 'ai', 'prose', 'chapter'],
    available: () => hasChapter && isGenIdle,
    execute: () => void cb.write(),
  });

  actions.push({
    id: 'gen:re-write',
    label: 'Re-write',
    category: 'generation',
    keywords: ['regenerate', 'ai', 'redo prose'],
    available: () => hasChapter && isGenIdle,
    execute: () => void cb.reWrite(),
  });

  actions.push({
    id: 'gen:stop',
    label: 'Stop generation',
    category: 'generation',
    keywords: ['cancel', 'abort', 'halt'],
    available: () => isStreaming,
    execute: () => void cb.stopGeneration(),
  });

  actions.push({
    id: 'gen:regenerate',
    label: 'Regenerate',
    category: 'generation',
    keywords: ['re-run', 'redo', 'retry'],
    available: () => hasChapter && isGenIdle,
    execute: () => void cb.reExpand(),
  });

  // ── Iterate ──────────────────────────────────────────────────────────

  actions.push({
    id: 'iterate:focus',
    label: 'Focus iterate input',
    category: 'iterate',
    shortcut: 'Cmd+I',
    keywords: ['improve', 'refine', 'edit ai'],
    available: () => hasChapter,
    execute: () => cb.focusIterate(),
  });

  actions.push({
    id: 'iterate:start',
    label: 'Start iteration',
    category: 'iterate',
    keywords: ['submit', 'request change'],
    available: () => hasChapter && isGenIdle,
    execute: () => cb.focusIterate(),
  });

  actions.push({
    id: 'iterate:accept',
    label: 'Accept proposal',
    category: 'iterate',
    keywords: ['approve', 'apply changes'],
    available: () => ctx.hasIterateProposal,
    execute: () => void cb.acceptProposal(),
  });

  actions.push({
    id: 'iterate:accept-as-version',
    label: 'Accept as new version',
    category: 'iterate',
    keywords: ['approve', 'create version'],
    available: () => ctx.hasIterateProposal,
    execute: () => {
      const name = cb.promptInput('Version name');
      if (name) void cb.acceptAsVersion(name);
    },
  });

  actions.push({
    id: 'iterate:discard',
    label: 'Discard proposal',
    category: 'iterate',
    keywords: ['reject', 'undo', 'dismiss'],
    available: () => ctx.hasIterateProposal,
    execute: () => void cb.discardProposal(),
  });

  // ── Versions ─────────────────────────────────────────────────────────

  actions.push({
    id: 'ver:new',
    label: 'New version',
    category: 'versions',
    keywords: ['create', 'branch', 'fork'],
    available: () => hasChapter,
    execute: () => {
      const name = cb.promptInput('Version name');
      if (name) void cb.createVersion(name);
    },
  });

  // Dynamic: select version
  for (const v of ctx.versions) {
    const isSelected = v.selected;
    actions.push({
      id: `ver:select:${v.slug}`,
      label: `Select version: ${v.name}`,
      category: 'versions',
      keywords: ['switch', v.name],
      available: () => hasChapter && !isSelected,
      execute: () => void cb.selectVersion(v.slug),
    });
  }

  // Dynamic: rename version
  for (const v of ctx.versions) {
    if (v.slug === 'main') continue;
    actions.push({
      id: `ver:rename:${v.slug}`,
      label: `Rename version: ${v.name}`,
      category: 'versions',
      keywords: ['edit name', v.name],
      available: () => hasChapter,
      execute: () => {
        const newName = cb.promptInput(`Rename "${v.name}" to`);
        if (newName) void cb.renameVersion(v.slug, newName);
      },
    });
  }

  // Dynamic: archive version
  for (const v of ctx.versions) {
    if (v.slug === 'main') continue;
    actions.push({
      id: `ver:archive:${v.slug}`,
      label: `Archive version: ${v.name}`,
      category: 'versions',
      keywords: ['delete', 'remove', v.name],
      available: () => hasChapter && !v.selected,
      execute: () => void cb.archiveVersion(v.slug),
    });
  }

  // ── History ──────────────────────────────────────────────────────────

  actions.push({
    id: 'hist:restore',
    label: 'Restore this revision',
    category: 'history',
    keywords: ['revert', 'undo', 'rollback'],
    available: () => hasChapter,
    execute: () => {
      const sha = cb.promptInput('Commit SHA to restore');
      if (sha) cb.restoreRevision(sha);
    },
  });

  // ── Editor ───────────────────────────────────────────────────────────

  actions.push({
    id: 'editor:bold',
    label: 'Bold',
    category: 'editor',
    keywords: ['strong', 'emphasis'],
    available: () => hasEditableEditor,
    execute: () => {
      editor?.chain().focus().toggleBold().run();
    },
  });

  actions.push({
    id: 'editor:italic',
    label: 'Italic',
    category: 'editor',
    keywords: ['emphasis', 'em'],
    available: () => hasEditableEditor,
    execute: () => {
      editor?.chain().focus().toggleItalic().run();
    },
  });

  actions.push({
    id: 'editor:strikethrough',
    label: 'Strikethrough',
    category: 'editor',
    keywords: ['strike', 'delete'],
    available: () => hasEditableEditor,
    execute: () => {
      editor?.chain().focus().toggleStrike().run();
    },
  });

  actions.push({
    id: 'editor:h2',
    label: 'Heading 2',
    category: 'editor',
    keywords: ['h2', 'section title'],
    available: () => hasEditableEditor,
    execute: () => {
      editor?.chain().focus().toggleHeading({ level: 2 }).run();
    },
  });

  actions.push({
    id: 'editor:h3',
    label: 'Heading 3',
    category: 'editor',
    keywords: ['h3', 'subsection title'],
    available: () => hasEditableEditor,
    execute: () => {
      editor?.chain().focus().toggleHeading({ level: 3 }).run();
    },
  });

  actions.push({
    id: 'editor:h4',
    label: 'Heading 4',
    category: 'editor',
    keywords: ['h4', 'sub-subsection'],
    available: () => hasEditableEditor,
    execute: () => {
      editor?.chain().focus().toggleHeading({ level: 4 }).run();
    },
  });

  actions.push({
    id: 'editor:blockquote',
    label: 'Blockquote',
    category: 'editor',
    keywords: ['quote', 'citation'],
    available: () => hasEditableEditor,
    execute: () => {
      editor?.chain().focus().toggleBlockquote().run();
    },
  });

  actions.push({
    id: 'editor:bullet-list',
    label: 'Bullet list',
    category: 'editor',
    keywords: ['ul', 'unordered', 'items'],
    available: () => hasEditableEditor,
    execute: () => {
      editor?.chain().focus().toggleBulletList().run();
    },
  });

  actions.push({
    id: 'editor:ordered-list',
    label: 'Ordered list',
    category: 'editor',
    keywords: ['ol', 'numbered', 'items'],
    available: () => hasEditableEditor,
    execute: () => {
      editor?.chain().focus().toggleOrderedList().run();
    },
  });

  actions.push({
    id: 'editor:link',
    label: 'Insert link',
    category: 'editor',
    keywords: ['url', 'href', 'hyperlink'],
    available: () => hasEditableEditor,
    execute: () => {
      if (!editor) return;
      const previousUrl = editor.getAttributes('link').href as string | undefined;
      const url = window.prompt('URL:', previousUrl ?? 'https://');
      if (url === null) return;
      if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        return;
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    },
  });

  actions.push({
    id: 'editor:horizontal-rule',
    label: 'Horizontal rule',
    category: 'editor',
    keywords: ['divider', 'separator', 'hr'],
    available: () => hasEditableEditor,
    execute: () => {
      editor?.chain().focus().setHorizontalRule().run();
    },
  });

  // ── Export ───────────────────────────────────────────────────────────

  actions.push({
    id: 'export:substack',
    label: 'Copy for Substack',
    category: 'export',
    keywords: ['clipboard', 'substack', 'copy'],
    available: () => hasChapter,
    execute: () => void cb.exportSubstack(),
  });

  actions.push({
    id: 'export:html',
    label: 'Save as HTML',
    category: 'export',
    keywords: ['file', 'download', 'html'],
    available: () => hasChapter,
    execute: () => void cb.exportHtml(),
  });

  actions.push({
    id: 'export:md-chapter',
    label: 'Export Markdown (chapter)',
    category: 'export',
    keywords: ['md', 'file', 'download'],
    available: () => hasChapter,
    execute: () => void cb.exportMarkdownChapter(),
  });

  actions.push({
    id: 'export:md-book',
    label: 'Export Markdown (whole book)',
    category: 'export',
    keywords: ['md', 'file', 'download', 'complete'],
    available: () => ctx.chapters.length > 0,
    execute: () => void cb.exportMarkdownBook(),
  });

  actions.push({
    id: 'export:pdf',
    label: 'Export PDF',
    category: 'export',
    keywords: ['pdf', 'print', 'download', 'tectonic'],
    available: () => ctx.chapters.length > 0,
    execute: () => void cb.exportPdf(),
  });

  // ── Outline ──────────────────────────────────────────────────────────

  actions.push({
    id: 'outline:add-part',
    label: 'Add Part',
    category: 'outline',
    keywords: ['create', 'new', 'section'],
    available: () => isOutlineView,
    execute: () => dispatchOutlineAction('addPart', {}),
  });

  actions.push({
    id: 'outline:add-chapter',
    label: 'Add Chapter',
    category: 'outline',
    keywords: ['create', 'new', 'chapter'],
    available: () => isOutlineView && ctx.chapters.length > 0,
    execute: () => {
      const partId = cb.promptInput('Part ID to add chapter to') ?? ctx.chapters[0]?.id ?? '';
      if (partId) dispatchOutlineAction('addChapter', { partId });
    },
  });

  actions.push({
    id: 'outline:add-section',
    label: 'Add Section',
    category: 'outline',
    keywords: ['create', 'new'],
    available: () => isOutlineView,
    execute: () => {
      const chapterId = cb.promptInput('Chapter ID to add section to') ?? ctx.chapterId ?? '';
      if (chapterId) dispatchOutlineAction('addSection', { chapterId });
    },
  });

  actions.push({
    id: 'outline:add-beat',
    label: 'Add Beat',
    category: 'outline',
    keywords: ['create', 'new', 'scene'],
    available: () => isOutlineView,
    execute: () => {
      const sectionId = cb.promptInput('Section ID to add beat to') ?? '';
      if (sectionId) dispatchOutlineAction('addBeat', { sectionId });
    },
  });

  actions.push({
    id: 'outline:delete-part',
    label: 'Delete Part',
    category: 'outline',
    keywords: ['remove', 'destroy'],
    available: () => isOutlineView,
    execute: () => dispatchOutlineAction('deletePart', {}),
  });

  actions.push({
    id: 'outline:delete-chapter',
    label: 'Delete Chapter',
    category: 'outline',
    keywords: ['remove', 'destroy'],
    available: () => isOutlineView,
    execute: () => dispatchOutlineAction('deleteChapter', {}),
  });

  actions.push({
    id: 'outline:delete-section',
    label: 'Delete Section',
    category: 'outline',
    keywords: ['remove', 'destroy'],
    available: () => isOutlineView,
    execute: () => dispatchOutlineAction('deleteSection', {}),
  });

  actions.push({
    id: 'outline:delete-beat',
    label: 'Delete Beat',
    category: 'outline',
    keywords: ['remove', 'destroy', 'scene'],
    available: () => isOutlineView,
    execute: () => dispatchOutlineAction('deleteBeat', {}),
  });

  actions.push({
    id: 'outline:rename-part',
    label: 'Rename Part',
    category: 'outline',
    keywords: ['edit', 'title'],
    available: () => isOutlineView,
    execute: () => {
      const partId = cb.promptInput('Part ID to rename') ?? '';
      if (partId) dispatchOutlineAction('renamePart', { partId });
    },
  });

  actions.push({
    id: 'outline:rename-chapter',
    label: 'Rename Chapter',
    category: 'outline',
    keywords: ['edit', 'title'],
    available: () => isOutlineView,
    execute: () => {
      const chapterId = cb.promptInput('Chapter ID to rename') ?? '';
      if (chapterId) dispatchOutlineAction('renameChapter', { chapterId });
    },
  });

  actions.push({
    id: 'outline:rename-section',
    label: 'Rename Section',
    category: 'outline',
    keywords: ['edit', 'title'],
    available: () => isOutlineView,
    execute: () => {
      const sectionId = cb.promptInput('Section ID to rename') ?? '';
      if (sectionId) dispatchOutlineAction('renameSection', { sectionId });
    },
  });

  // ── Variables ────────────────────────────────────────────────────────

  actions.push({
    id: 'var:create',
    label: 'Create variable',
    category: 'variables',
    keywords: ['new', 'add'],
    available: () => true,
    execute: () => {
      const name = cb.promptInput('Variable name');
      if (name) cb.createVariable(name);
    },
  });

  // Dynamic: toggle variable active/paused
  for (const v of ctx.variables) {
    const actionLabel = v.active ? `Pause variable: ${v.name}` : `Activate variable: ${v.name}`;
    actions.push({
      id: `var:toggle:${v.id}`,
      label: actionLabel,
      category: 'variables',
      keywords: [v.active ? 'pause' : 'activate', 'toggle', v.name],
      available: () => true,
      execute: () => cb.setVariableActive(v.id, !v.active),
    });
  }

  // Dynamic: change variable scope
  const scopes: VariableScope[] = ['always', 'expand', 'write', 'manual'];
  for (const v of ctx.variables) {
    for (const scope of scopes) {
      if (v.scope === scope) continue;
      actions.push({
        id: `var:scope:${v.id}:${scope}`,
        label: `Set "${v.name}" scope to ${scope}`,
        category: 'variables',
        keywords: ['scope', v.name, scope],
        available: () => true,
        execute: () => cb.setVariableScope(v.id, scope),
      });
    }
  }

  // Dynamic: add card
  for (const v of ctx.variables) {
    actions.push({
      id: `var:addCard:${v.id}`,
      label: `Add card to "${v.name}"`,
      category: 'variables',
      keywords: ['card', 'sheet', 'character', v.name],
      available: () => true,
      execute: () => {
        const title = cb.promptInput(`Card title for "${v.name}"`);
        if (title) cb.addCard(v.id, title);
      },
    });
  }

  return actions;
}

// ── Outline action dispatch (CustomEvent bridge) ────────────────────────────────

export interface OutlineActionPayload {
  action: string;
  params: Record<string, string>;
}

export function dispatchOutlineAction(
  action: string,
  params: Record<string, string>,
): void {
  document.dispatchEvent(
    new CustomEvent<OutlineActionPayload>('plotline:outline-action', {
      detail: { action, params },
    }),
  );
}

export function listenOutlineActions(
  handler: (payload: OutlineActionPayload) => void,
): () => void {
  const listener = (e: Event) => {
    const ce = e as CustomEvent<OutlineActionPayload>;
    handler(ce.detail);
  };
  document.addEventListener('plotline:outline-action', listener);
  return () => document.removeEventListener('plotline:outline-action', listener);
}
