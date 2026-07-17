/**
 * VariableService — unified story variable lifecycle management.
 *
 * Manages CRUD for story variables stored as Git objects under
 * `variables/<variableId>/` on `refs/heads/main`. All variables — builtin,
 * system, and custom — live in one registry with one schema.
 *
 * Storage layout:
 *   variables/<id>/variable.json      — StoryVariable metadata (schemaVersion: 2)
 *   variables/<id>/content.html       — HTML content (stored separately)
 *   variables/<id>/cards/<cardId>.html — cards (Character / Voice Sheets only)
 *   variables/archived/<id>/           — deleted (moved here, not destroyed)
 *
 * Every durable operation flows through StorageService.commit() — there
 * is no direct filesystem access or working tree manipulation.
 *
 * Version: 2.0.0 | 2026-07-17
 */

import { StorageService } from '../storage/StorageService';
import type { ProjectService } from './ProjectService';
import type { HistoryService } from './HistoryService';
import {
  StoryVariableSchema,
  BUILTIN_SLUGS,
  RESERVED_NAMES,
  RESERVED_DISPLAY_NAMES,
  isReservedName,
} from '../../shared/schemas/variable';
import type { StoryVariable, VariableScope } from '../../shared/schemas/variable';
import { generateULID } from '../../shared/utils/ulid';

// ── Built-in / system definitions ───────────────────────────────────────────

interface BuiltinDef {
  slug: string;
  name: string;
  kind: 'builtin' | 'system';
  scope: VariableScope;
  scopeLocked: boolean;
  position: number;
}

const BUILTIN_DEFS: BuiltinDef[] = [
  { slug: 'tone', name: 'Tone', kind: 'builtin', scope: 'always', scopeLocked: false, position: 0 },
  { slug: 'style', name: 'Writing Style', kind: 'builtin', scope: 'always', scopeLocked: false, position: 1 },
  { slug: 'constraints', name: 'Plot Constraints', kind: 'builtin', scope: 'always', scopeLocked: false, position: 2 },
  { slug: 'characters', name: 'Character / Voice Sheets', kind: 'builtin', scope: 'always', scopeLocked: false, position: 3 },
];

const SYSTEM_DEFS: BuiltinDef[] = [
  { slug: 'global-constraints', name: 'Global Constraints', kind: 'system', scope: 'always', scopeLocked: false, position: 0 },
];

// ── Error types ─────────────────────────────────────────────────────────────

export class VariableError extends Error {
  constructor(
    public code: 'SCOPE_LOCKED' | 'NOT_DELETABLE' | 'NOT_RENAMABLE' | 'NAME_TAKEN' | 'NAME_RESERVED' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'VariableError';
  }
}

// ── VariableService ─────────────────────────────────────────────────────────

export class VariableService {
  constructor(
    private projectService: ProjectService,
    private historyService?: HistoryService,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────

  private getService(projectId: string): StorageService {
    const service = this.projectService.getOpenProject(projectId);
    if (!service) throw new Error(`Project not open: ${projectId}`);
    return service;
  }

  private now(): string {
    return new Date().toISOString();
  }

  // ── seedBuiltins ────────────────────────────────────────────────────────

  /**
   * Seed the four built-in variables for a project. Idempotent — if any
   * builtin already exists, does nothing.
   *
   * Builtin variables use their slug as the variable ID for deterministic
   * addressing. They are created with empty content.
   */
  async seedBuiltins(projectId: string): Promise<StoryVariable[]> {
    const service = this.getService(projectId);
    const tree = await service.readTree('refs/heads/main');

    // Check if any builtin already exists
    const existing = new Set<string>();
    for (const filepath of Object.keys(tree)) {
      const match = filepath.match(/^variables\/([^/]+)\/variable\.json$/);
      if (match) existing.add(match[1]!);
    }

    const allDefs = [...SYSTEM_DEFS, ...BUILTIN_DEFS];
    const created: StoryVariable[] = [];

    for (const def of allDefs) {
      if (existing.has(def.slug)) continue;

      const variable: StoryVariable = StoryVariableSchema.parse({
        schemaVersion: 2,
        id: def.slug,
        name: def.name,
        kind: def.kind,
        scope: def.scope,
        scopeLocked: def.scopeLocked,
        deletable: false,
        renamable: false,
        position: def.position,
        createdAt: this.now(),
        updatedAt: this.now(),
      });

      await service.commit(
        'refs/heads/main',
        {
          [`variables/${def.slug}/variable.json`]: Buffer.from(
            JSON.stringify(variable, null, 2),
            'utf-8',
          ),
          [`variables/${def.slug}/content.html`]: Buffer.from('', 'utf-8'),
        },
        { label: `Seeded variable: ${def.name}`, kind: 'manual' },
      );

      created.push(variable);
    }

    return created;
  }

  // ── migrateFromV1 ───────────────────────────────────────────────────

  /**
   * Migrate variables from legacy v1 schema (core-based) to v2 (kind-based).
   * Returns file changes without committing — the caller (ProjectService)
   * is responsible for committing the migration (including the manifest bump)
   * as a single commit with kind 'variable:migration'.
   *
   * For each variable found in the old format:
   * 1. Reads variable.json (schemaVersion 1, core field)
   * 2. Converts to StoryVariable (schemaVersion 2, kind field)
   * 3. Preserves content.html unchanged
   * 4. Seeds Global Constraints if not present
   *
   * Conversion mapping:
   *   core: 'tone'|'style'|'constraints'|'characters' → kind: 'builtin'
   *   core: null → kind: 'custom'
   *   active → REMOVED (field absent in v2)
   *   order → position
   *   NEW: scopeLocked, deletable, renamable, createdAt, updatedAt
   *
   * Idempotent — variables already at schemaVersion 2 are skipped.
   */
  async migrateFromV1(projectId: string): Promise<{
    files: Record<string, Buffer>;
    migrated: number;
    seededSystem: boolean;
  }> {
    const service = this.getService(projectId);
    const tree = await service.readTree('refs/heads/main');

    const files: Record<string, Buffer> = {};
    let migrated = 0;

    for (const [filepath] of Object.entries(tree)) {
      const match = filepath.match(/^variables\/([^/]+)\/variable\.json$/);
      if (!match || filepath.startsWith('variables/archived/')) continue;

      try {
        const buf = await service.readBlob('refs/heads/main', filepath);
        const oldVar = JSON.parse(buf.toString('utf-8'));

        // Skip already-migrated variables
        if (oldVar.schemaVersion === 2) continue;

        const core: string | null = oldVar.core ?? null;
        const isBuiltin = core !== null;

        const newVar: StoryVariable = {
          schemaVersion: 2,
          id: oldVar.id,
          name: oldVar.name,
          kind: isBuiltin ? 'builtin' : 'custom',
          scope: oldVar.scope ?? 'always',
          scopeLocked: false,
          deletable: !isBuiltin,
          renamable: !isBuiltin,
          position: oldVar.order ?? 0,
          createdAt: oldVar.createdAt ?? this.now(),
          updatedAt: this.now(),
        };

        files[filepath] = Buffer.from(JSON.stringify(newVar, null, 2), 'utf-8');
        migrated++;
      } catch {
        // Skip unparseable entries
      }
    }

    // Add Global Constraints if not present
    let seededSystem = false;
    const gcPath = 'variables/global-constraints/variable.json';
    if (!tree[gcPath]) {
      // Also check if it was already added by our file changes
      const alreadyAdded = (Object.keys(files).includes(gcPath));
      if (!alreadyAdded) {
        const gcVar: StoryVariable = {
          schemaVersion: 2,
          id: 'global-constraints',
          name: 'Global Constraints',
          kind: 'system',
          scope: 'always',
          scopeLocked: false,
          deletable: false,
          renamable: false,
          position: 0,
          createdAt: this.now(),
          updatedAt: this.now(),
        };
        files[gcPath] = Buffer.from(JSON.stringify(gcVar, null, 2), 'utf-8');
        files['variables/global-constraints/content.html'] = Buffer.from('', 'utf-8');
        seededSystem = true;
      }
    }

    return { files, migrated, seededSystem };
  }

  // ── list ───────────────────────────────────────────────────────────────

  /**
   * Return all non-archived variables, sorted:
   *   system by position → builtins by slug order → custom by position.
   */
  async list(projectId: string): Promise<StoryVariable[]> {
    const service = this.getService(projectId);
    const tree = await service.readTree('refs/heads/main');

    const variableIds = new Set<string>();
    for (const filepath of Object.keys(tree)) {
      const match = filepath.match(/^variables\/([^/]+)\/variable\.json$/);
      if (match && !filepath.startsWith('variables/archived/')) {
        variableIds.add(match[1]!);
      }
    }

    const variables: StoryVariable[] = [];
    for (const id of variableIds) {
      try {
        const buf = await service.readBlob(
          'refs/heads/main',
          `variables/${id}/variable.json`,
        );
        variables.push(StoryVariableSchema.parse(JSON.parse(buf.toString('utf-8'))));
      } catch {
        // Skip malformed entries
      }
    }

    // Sort: system first (by position), then builtins (by slug order),
    // then custom (by position)
    const builtinSlugs: string[] = [...BUILTIN_SLUGS];
    variables.sort((a, b) => {
      // Kind-group order: system (0), builtin (1), custom (2)
      const kindOrder: Record<string, number> = { system: 0, builtin: 1, custom: 2 };
      const ka = kindOrder[a.kind] ?? 2;
      const kb = kindOrder[b.kind] ?? 2;
      if (ka !== kb) return ka - kb;

      // Within same kind group, sort by position
      return a.position - b.position;
    });

    return variables;
  }

  // ── get ────────────────────────────────────────────────────────────────

  async get(
    projectId: string,
    variableId: string,
  ): Promise<{ variable: StoryVariable; content: string }> {
    const service = this.getService(projectId);

    let variable: StoryVariable;
    try {
      const buf = await service.readBlob(
        'refs/heads/main',
        `variables/${variableId}/variable.json`,
      );
      variable = StoryVariableSchema.parse(JSON.parse(buf.toString('utf-8')));
    } catch {
      throw new VariableError('NOT_FOUND', `Variable not found: ${variableId}`);
    }

    let content = '';
    try {
      const contentBuf = await service.readBlob(
        'refs/heads/main',
        `variables/${variableId}/content.html`,
      );
      content = contentBuf.toString('utf-8');
    } catch {
      // content.html may be absent for freshly-created variables
    }

    return { variable, content };
  }

  // ── create ─────────────────────────────────────────────────────────────

  /**
   * Create a custom variable.
   *
   * @throws VariableError if the name is reserved or taken.
   */
  async create(
    projectId: string,
    name: string,
    scope?: VariableScope,
  ): Promise<StoryVariable> {
    const id = generateULID();
    const resolvedScope: VariableScope = scope ?? 'manual';

    // Reject reserved names
    if (isReservedName(name)) {
      throw new VariableError('NAME_RESERVED', `Name "${name}" is reserved and cannot be used for custom variables`);
    }

    // Check for duplicate name (case-insensitive)
    const existing = await this.list(projectId);
    const nameLower = name.toLowerCase().trim();
    const duplicate = existing.find((v) => v.name.toLowerCase().trim() === nameLower);
    if (duplicate) {
      throw new VariableError('NAME_TAKEN', `Variable name "${name}" is already in use`);
    }

    // Compute position: max custom position + 1
    const customVars = existing.filter((v) => v.kind === 'custom');
    const maxPosition = customVars.length > 0
      ? Math.max(...customVars.map((v) => v.position))
      : -1;
    const position = maxPosition + 1;

    const variable: StoryVariable = StoryVariableSchema.parse({
      schemaVersion: 2,
      id,
      name: name.trim(),
      kind: 'custom',
      scope: resolvedScope,
      scopeLocked: false,
      deletable: true,
      renamable: true,
      position,
      createdAt: this.now(),
      updatedAt: this.now(),
    });

    const service = this.getService(projectId);

    await service.commit(
      'refs/heads/main',
      {
        [`variables/${id}/variable.json`]: Buffer.from(
          JSON.stringify(variable, null, 2),
          'utf-8',
        ),
        [`variables/${id}/content.html`]: Buffer.from('', 'utf-8'),
      },
      { label: `Created variable: ${variable.name}`, kind: 'manual' },
    );

    return variable;
  }

  // ── rename ─────────────────────────────────────────────────────────────

  async rename(
    projectId: string,
    variableId: string,
    name: string,
  ): Promise<StoryVariable> {
    const service = this.getService(projectId);
    const variable = await this.readVariableOrThrow(service, variableId);

    if (!variable.renamable) {
      throw new VariableError('NOT_RENAMABLE', `Variable "${variable.name}" cannot be renamed`);
    }

    const trimmed = name.trim();

    // Reject reserved names
    if (isReservedName(trimmed)) {
      throw new VariableError('NAME_RESERVED', `Name "${trimmed}" is reserved`);
    }

    // Check for duplicate name (case-insensitive, excluding self)
    const existing = await this.list(projectId);
    const nameLower = trimmed.toLowerCase();
    const duplicate = existing.find(
      (v) => v.id !== variableId && v.name.toLowerCase().trim() === nameLower,
    );
    if (duplicate) {
      throw new VariableError('NAME_TAKEN', `Variable name "${trimmed}" is already in use`);
    }

    const updated: StoryVariable = {
      ...variable,
      name: trimmed,
      updatedAt: this.now(),
    };

    await service.commit(
      'refs/heads/main',
      {
        [`variables/${variableId}/variable.json`]: Buffer.from(
          JSON.stringify(updated, null, 2),
          'utf-8',
        ),
      },
      { label: `Renamed variable: ${variable.name} → ${trimmed}`, kind: 'manual' },
    );

    return updated;
  }

  // ── setScope ───────────────────────────────────────────────────────────

  async setScope(
    projectId: string,
    variableId: string,
    scope: VariableScope,
  ): Promise<StoryVariable> {
    const service = this.getService(projectId);
    const variable = await this.readVariableOrThrow(service, variableId);

    if (variable.scopeLocked) {
      throw new VariableError('SCOPE_LOCKED', `Scope of variable "${variable.name}" is locked`);
    }

    const updated: StoryVariable = {
      ...variable,
      scope,
      updatedAt: this.now(),
    };

    await service.commit(
      'refs/heads/main',
      {
        [`variables/${variableId}/variable.json`]: Buffer.from(
          JSON.stringify(updated, null, 2),
          'utf-8',
        ),
      },
      { label: `Changed variable scope: ${variable.name} → ${scope}`, kind: 'manual' },
    );

    return updated;
  }

  // ── setContent ─────────────────────────────────────────────────────────

  async setContent(
    projectId: string,
    variableId: string,
    content: string,
  ): Promise<{ sha: string }> {
    const service = this.getService(projectId);

    // Verify variable exists
    await this.readVariableOrThrow(service, variableId);

    const sha = await service.commit(
      'refs/heads/main',
      {
        [`variables/${variableId}/content.html`]: Buffer.from(content, 'utf-8'),
      },
      { label: 'Saved variable content', kind: 'manual' },
    );

    return { sha };
  }

  // ── reorder ────────────────────────────────────────────────────────────

  /**
   * Reorder a custom variable. Renumbers all custom variables to maintain
   * consecutive positions starting from 0.
   */
  async reorder(
    projectId: string,
    variableId: string,
    newPosition: number,
  ): Promise<StoryVariable[]> {
    const service = this.getService(projectId);
    const variable = await this.readVariableOrThrow(service, variableId);

    // Only custom variables can be reordered
    if (variable.kind !== 'custom') {
      throw new VariableError('SCOPE_LOCKED', 'Only custom variables can be reordered');
    }

    const all = await this.list(projectId);
    const customVars = all
      .filter((v) => v.kind === 'custom')
      .sort((a, b) => a.position - b.position);

    // Remove the target from its current position
    const idx = customVars.findIndex((v) => v.id === variableId);
    if (idx === -1) throw new VariableError('NOT_FOUND', `Variable not found: ${variableId}`);

    const moved = customVars.splice(idx, 1)[0]!;
    const clampedPosition = Math.max(0, Math.min(newPosition, customVars.length));
    customVars.splice(clampedPosition, 0, moved);

    // Renumber
    const updatedVars: StoryVariable[] = [];
    for (let i = 0; i < customVars.length; i++) {
      if (customVars[i]!.position !== i) {
        const updated: StoryVariable = {
          ...customVars[i]!,
          position: i,
          updatedAt: this.now(),
        };
        updatedVars.push(updated);
      } else {
        updatedVars.push(customVars[i]!);
      }
    }

    // Commit changes
    const files: Record<string, Buffer> = {};
    for (const v of updatedVars) {
      files[`variables/${v.id}/variable.json`] = Buffer.from(
        JSON.stringify(v, null, 2),
        'utf-8',
      );
    }

    if (Object.keys(files).length > 0) {
      await service.commit(
        'refs/heads/main',
        files,
        { label: 'Reordered variables', kind: 'manual' },
      );
    }

    return this.list(projectId);
  }

  // ── delete (archive) ──────────────────────────────────────────────────

  /**
   * Delete a deletable variable by moving it to the archived/ path.
   */
  async delete(projectId: string, variableId: string): Promise<StoryVariable> {
    const service = this.getService(projectId);
    const tree = await service.readTree('refs/heads/main');

    const variable = await this.readVariableOrThrow(service, variableId);

    if (!variable.deletable) {
      throw new VariableError('NOT_DELETABLE', `Variable "${variable.name}" cannot be deleted`);
    }

    // Collect all files under variables/<variableId>/ to delete
    const deletePrefix = `variables/${variableId}/`;
    const filesToDelete: Record<string, null> = {};
    const filesToArchive: Record<string, Buffer> = {};
    for (const filepath of Object.keys(tree)) {
      if (filepath.startsWith(deletePrefix)) {
        filesToDelete[filepath] = null;
        // Copy to archive
        const archivePath = filepath.replace(
          `variables/${variableId}/`,
          `variables/archived/${variableId}/`,
        );
        try {
          const buf = await service.readBlob('refs/heads/main', filepath);
          filesToArchive[archivePath] = buf;
        } catch {
          // Skip unreadable files
        }
      }
    }

    await service.commit(
      'refs/heads/main',
      { ...filesToDelete, ...filesToArchive },
      { label: `Deleted variable: ${variable.name}`, kind: 'manual' },
    );

    return variable;
  }

  // ── Card operations ────────────────────────────────────────────────────

  async listCards(
    projectId: string,
    variableId: string,
  ): Promise<Array<{ cardId: string; title: string }>> {
    const service = this.getService(projectId);
    const tree = await service.readTree('refs/heads/main');

    const cardsDir = `variables/${variableId}/cards/`;
    const cards: Array<{ cardId: string; title: string }> = [];

    for (const filepath of Object.keys(tree)) {
      if (!filepath.startsWith(cardsDir) || !filepath.endsWith('.html')) continue;
      const cardId = filepath.slice(cardsDir.length, -'.html'.length);
      if (!cardId) continue;

      let title: string;
      try {
        const buf = await service.readBlob('refs/heads/main', filepath);
        title = extractCardTitle(buf.toString('utf-8')) ?? cardId;
      } catch {
        title = cardId;
      }

      cards.push({ cardId, title });
    }

    return cards;
  }

  async addCard(
    projectId: string,
    variableId: string,
    title: string,
  ): Promise<{ cardId: string }> {
    const service = this.getService(projectId);
    const variable = await this.readVariableOrThrow(service, variableId);

    // Cards are only available for the 'characters' builtin variable
    if (variable.id !== 'characters') {
      throw new Error(
        'Cards are only available for Character / Voice Sheet variables',
      );
    }

    const cardId = generateULID();
    const content = `<h3>${escapeHtml(title)}</h3>\n`;

    await service.commit(
      'refs/heads/main',
      {
        [`variables/${variableId}/cards/${cardId}.html`]: Buffer.from(content, 'utf-8'),
      },
      { label: `Added card: ${title}`, kind: 'manual' },
    );

    return { cardId };
  }

  async saveCard(
    projectId: string,
    variableId: string,
    cardId: string,
    content: string,
  ): Promise<{ sha: string }> {
    const service = this.getService(projectId);

    const cardPath = `variables/${variableId}/cards/${cardId}.html`;
    try {
      await service.readBlob('refs/heads/main', cardPath);
    } catch {
      throw new Error(`Card not found: ${cardId}`);
    }

    const sha = await service.commit(
      'refs/heads/main',
      {
        [cardPath]: Buffer.from(content, 'utf-8'),
      },
      { label: 'Saved card content', kind: 'manual' },
    );

    return { sha };
  }

  async removeCard(
    projectId: string,
    variableId: string,
    cardId: string,
  ): Promise<{ ok: true }> {
    const service = this.getService(projectId);

    const cardPath = `variables/${variableId}/cards/${cardId}.html`;
    try {
      await service.readBlob('refs/heads/main', cardPath);
    } catch {
      throw new Error(`Card not found: ${cardId}`);
    }

    await service.commit(
      'refs/heads/main',
      {
        [cardPath]: null,
      },
      { label: 'Removed card', kind: 'manual' },
    );

    return { ok: true };
  }

  // ── assemble ───────────────────────────────────────────────────────────

  /**
   * Assemble story variables for prompt injection.
   *
   * Selection rules (AD-4):
   *   - always → all steps
   *   - expand → expand only
   *   - write  → write only
   *   - manual → only when variableId is in manualVariableIds
   *
   * Ordering (AD-5): system first → builtins → customs, each by position.
   *
   * Output format: clean Markdown sections (not fenced blocks).
   * Empty content produces nothing (no empty headings).
   */
  async assemble(
    step: 'expand' | 'write' | 'iterate',
    projectId: string,
    opts?: { excludeVariableIds?: string[]; manualVariableIds?: string[] },
  ): Promise<string> {
    const allVariables = await this.list(projectId);

    const matches = allVariables.filter((v) => {
      // Exclude filter
      if (opts?.excludeVariableIds?.includes(v.id)) return false;

      // Scope matching (AD-4)
      if (v.scope === 'always') return true;
      if (v.scope === 'expand') return step === 'expand';
      if (v.scope === 'write') return step === 'write';
      if (v.scope === 'manual') return opts?.manualVariableIds?.includes(v.id) ?? false;
      return false;
    });

    // Sort: system → builtin → custom, each by position
    const kindOrder: Record<string, number> = { system: 0, builtin: 1, custom: 2 };
    matches.sort((a, b) => {
      const ka = kindOrder[a.kind] ?? 2;
      const kb = kindOrder[b.kind] ?? 2;
      if (ka !== kb) return ka - kb;
      return a.position - b.position;
    });

    if (matches.length === 0) return '';

    const blocks: string[] = [];
    for (const v of matches) {
      const { content } = await this.get(projectId, v.id);
      const plainText = stripHtml(content);

      // Skip empty content
      if (!plainText) continue;

      // Build the heading
      let heading: string;
      if (v.id === 'global-constraints') {
        heading = '## Global Constraints (book-wide invariants — always apply)';
      } else {
        heading = `## ${v.name}`;
      }

      blocks.push(`${heading}\n\n${plainText}`);
    }

    return blocks.join('\n');
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private async readVariableOrThrow(
    service: StorageService,
    variableId: string,
  ): Promise<StoryVariable> {
    try {
      const buf = await service.readBlob(
        'refs/heads/main',
        `variables/${variableId}/variable.json`,
      );
      return StoryVariableSchema.parse(JSON.parse(buf.toString('utf-8')));
    } catch {
      throw new VariableError('NOT_FOUND', `Variable not found: ${variableId}`);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractCardTitle(html: string): string | null {
  const metaMatch = html.match(/<!--\s*title:\s*(.+?)\s*-->/);
  if (metaMatch?.[1]) {
    return metaMatch[1].trim();
  }

  const h3Match = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
  if (h3Match?.[1]) {
    return h3Match[1].trim();
  }

  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}
