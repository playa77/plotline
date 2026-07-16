/**
 * VariableService — story variable lifecycle management.
 *
 * Manages CRUD for story variables stored as Git objects under
 * `variables/<variableId>/` on `refs/heads/main`. Variables are global
 * (not per-chapter). Cards (for Character/Voice Sheet variables) live
 * under `variables/<variableId>/cards/<cardId>.html`.
 *
 * Every durable operation flows through StorageService.commit() — there
 * is no direct filesystem access or working tree manipulation.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { StorageService } from '../storage/StorageService';
import type { ProjectService } from './ProjectService';
import { VariableSchema, CORE_VARIABLE_TYPES } from '../../shared/schemas/variable';
import type { Variable, VariableScope, CoreVariableType } from '../../shared/schemas/variable';
import { generateULID } from '../../shared/utils/ulid';

// ── VariableService ──────────────────────────────────────────────────────

export class VariableService {
  constructor(private projectService: ProjectService) {}

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Resolve the StorageService for an open project.
   * @throws If the project is not open.
   */
  private getService(projectId: string): StorageService {
    const service = this.projectService.getOpenProject(projectId);
    if (!service) throw new Error(`Project not open: ${projectId}`);
    return service;
  }

  // ── List ───────────────────────────────────────────────────────────────

  /**
   * List all (non-archived) variables.
   *
   * Reads the `variables/` directory tree from `refs/heads/main`, parses
   * each `variable.json`, and returns a sorted array (core types first
   * in canonical order, then by `order` within each group).
   *
   * Archived variables (under `variables/archived/`) are excluded.
   */
  async list(projectId: string): Promise<Variable[]> {
    const service = this.getService(projectId);
    const tree = await service.readTree('refs/heads/main');

    // Collect variable IDs from paths like `variables/<id>/variable.json`
    const variableIds = new Set<string>();
    for (const filepath of Object.keys(tree)) {
      const match = filepath.match(/^variables\/([^/]+)\/variable\.json$/);
      if (match) {
        variableIds.add(match[1]!);
      }
    }

    // Parse each variable.json
    const variables: Variable[] = [];
    for (const id of variableIds) {
      try {
        const buf = await service.readBlob(
          'refs/heads/main',
          `variables/${id}/variable.json`,
        );
        const parsed = VariableSchema.parse(JSON.parse(buf.toString('utf-8')));
        variables.push(parsed);
      } catch {
        // Skip malformed entries
      }
    }

    // Sort: core first (in CORE_VARIABLE_TYPES order), then by order field
    variables.sort((a, b) => {
      if (a.core && !b.core) return -1;
      if (!a.core && b.core) return 1;
      if (a.core && b.core) {
        const ai = CORE_VARIABLE_TYPES.indexOf(a.core);
        const bi = CORE_VARIABLE_TYPES.indexOf(b.core);
        if (ai !== bi) return ai - bi;
      }
      return a.order - b.order;
    });

    return variables;
  }

  // ── Get ────────────────────────────────────────────────────────────────

  /**
   * Get a single variable's metadata (`variable.json`) and content
   * (`content.html`).
   *
   * @throws If the variable does not exist.
   */
  async get(
    projectId: string,
    variableId: string,
  ): Promise<{ variable: Variable; content: string }> {
    const service = this.getService(projectId);

    let variable: Variable;
    try {
      const buf = await service.readBlob(
        'refs/heads/main',
        `variables/${variableId}/variable.json`,
      );
      variable = VariableSchema.parse(JSON.parse(buf.toString('utf-8')));
    } catch {
      throw new Error(`Variable not found: ${variableId}`);
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

  // ── Save ───────────────────────────────────────────────────────────────

  /**
   * Save (overwrite) the content of a variable's `content.html`.
   *
   * @throws If the variable does not exist.
   */
  async save(
    projectId: string,
    variableId: string,
    content: string,
  ): Promise<{ sha: string }> {
    const service = this.getService(projectId);

    // Verify variable exists before committing
    try {
      await service.readBlob(
        'refs/heads/main',
        `variables/${variableId}/variable.json`,
      );
    } catch {
      throw new Error(`Variable not found: ${variableId}`);
    }

    const sha = await service.commit(
      'refs/heads/main',
      {
        [`variables/${variableId}/content.html`]: Buffer.from(content, 'utf-8'),
      },
      { label: 'Saved variable content', kind: 'manual' },
    );

    return { sha };
  }

  // ── Create ─────────────────────────────────────────────────────────────

  /**
   * Create a new variable.
   *
   * Generates a ULID for the variable ID, writes `variable.json` and
   * `content.html`, and commits to `refs/heads/main`.
   *
   * For core variables, throws if a variable of that core type already
   * exists. Sets `order` = max existing order + 1.
   *
   * @throws If a core variable of the same type already exists.
   */
  async create(
    projectId: string,
    name: string,
    core?: CoreVariableType | null,
    scope?: VariableScope,
  ): Promise<Variable> {
    const id = generateULID();
    const resolvedCore: CoreVariableType | null = core ?? null;
    const resolvedScope: VariableScope =
      scope ?? (resolvedCore ? 'always' : 'manual');

    // Check for duplicate core type and compute max order in one pass
    const existing = await this.list(projectId);

    if (resolvedCore) {
      const duplicate = existing.find((v) => v.core === resolvedCore);
      if (duplicate) {
        throw new Error(`Core variable "${resolvedCore}" already exists`);
      }
    }

    const maxOrder =
      existing.length > 0 ? Math.max(...existing.map((v) => v.order)) : -1;
    const order = maxOrder + 1;

    const variable: Variable = VariableSchema.parse({
      schemaVersion: 1,
      id,
      name,
      core: resolvedCore,
      scope: resolvedScope,
      active: true,
      order,
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
      { label: `Created variable: ${name}`, kind: 'manual' },
    );

    return variable;
  }

  // ── setScope ───────────────────────────────────────────────────────────

  /**
   * Update a variable's scope.
   *
   * @throws If the variable does not exist.
   */
  async setScope(
    projectId: string,
    variableId: string,
    scope: VariableScope,
  ): Promise<Variable> {
    const service = this.getService(projectId);

    const variable = await this.readVariableOrThrow(service, variableId);
    const updated: Variable = { ...variable, scope };

    await service.commit(
      'refs/heads/main',
      {
        [`variables/${variableId}/variable.json`]: Buffer.from(
          JSON.stringify(updated, null, 2),
          'utf-8',
        ),
      },
      { label: 'Changed variable scope', kind: 'manual' },
    );

    return updated;
  }

  // ── setActive ──────────────────────────────────────────────────────────

  /**
   * Set a variable's active/inactive state.
   *
   * @throws If the variable does not exist.
   */
  async setActive(
    projectId: string,
    variableId: string,
    active: boolean,
  ): Promise<Variable> {
    const service = this.getService(projectId);

    const variable = await this.readVariableOrThrow(service, variableId);
    const updated: Variable = { ...variable, active };

    await service.commit(
      'refs/heads/main',
      {
        [`variables/${variableId}/variable.json`]: Buffer.from(
          JSON.stringify(updated, null, 2),
          'utf-8',
        ),
      },
      { label: active ? 'Activated variable' : 'Deactivated variable', kind: 'manual' },
    );

    return updated;
  }

  // ── Archive ────────────────────────────────────────────────────────────

  /**
   * Archive a variable.
   *
   * Deletes all files under `variables/<variableId>/` and writes a new
   * `variables/archived/<variableId>/variable.json` with `active: false`.
   *
   * @throws If the variable does not exist or is already archived.
   */
  async archive(
    projectId: string,
    variableId: string,
  ): Promise<Variable> {
    const service = this.getService(projectId);
    const tree = await service.readTree('refs/heads/main');

    // Check if already archived
    const archivedPath = `variables/archived/${variableId}/variable.json`;
    if (archivedPath in tree) {
      throw new Error(`Variable already archived: ${variableId}`);
    }

    const variable = await this.readVariableOrThrow(service, variableId);

    // Collect all files under variables/<variableId>/ to delete
    const deletePrefix = `variables/${variableId}/`;
    const filesToDelete: Record<string, null> = {};
    for (const filepath of Object.keys(tree)) {
      if (filepath.startsWith(deletePrefix)) {
        filesToDelete[filepath] = null;
      }
    }

    const updated: Variable = { ...variable, active: false };

    await service.commit(
      'refs/heads/main',
      {
        ...filesToDelete,
        [archivedPath]: Buffer.from(
          JSON.stringify(updated, null, 2),
          'utf-8',
        ),
      },
      { label: `Archived variable: ${variable.name}`, kind: 'manual' },
    );

    return updated;
  }

  // ── Card operations ────────────────────────────────────────────────────

  /**
   * List all cards for a variable.
   *
   * Cards are HTML files under `variables/<variableId>/cards/<cardId>.html`.
   * The title is extracted from the first `<h3>` tag or a
   * `<!-- title: ... -->` metadata comment.
   */
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

  /**
   * Add a new card to a Character/Voice Sheet variable.
   *
   * Creates `variables/<variableId>/cards/<cardId>.html` with the title
   * as the first `<h3>` element.
   *
   * @throws If the variable is not a Character/Voice Sheet (core !== 'characters').
   * @throws If the variable does not exist.
   */
  async addCard(
    projectId: string,
    variableId: string,
    title: string,
  ): Promise<{ cardId: string }> {
    const service = this.getService(projectId);

    const variable = await this.readVariableOrThrow(service, variableId);

    if (variable.core !== 'characters') {
      throw new Error(
        'Cards are only available for Character/Voice Sheet variables',
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

  /**
   * Save (overwrite) the content of a card.
   *
   * @throws If the card does not exist.
   */
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

  /**
   * Remove a card.
   *
   * @throws If the card does not exist.
   */
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
   * Assemble story variables for injection into a generation prompt (TS §4.3).
   *
   * Selects variables where: `active` AND (`scope === 'always'` OR
   * `scope === step`) AND not in `excludeVariableIds`.
   *
   * Ordering: core variables first (in canonical order: tone, style,
   * constraints, characters), then custom variables by their `order` field.
   *
   * Each variable is emitted as a fenced, labeled data block:
   * ```
   * === STORY VARIABLE: Name (core|custom) ===
   * <plain text content (HTML stripped)>
   * === END VARIABLE ===
   * ```
   *
   * @param step               - The workflow step determining scope filtering.
   * @param projectId          - The open project.
   * @param excludeVariableIds - Optional variable IDs to exclude.
   * @returns Assembled variable blocks string (empty string if none match).
   */
  async assemble(
    step: 'expand' | 'write' | 'iterate',
    projectId: string,
    excludeVariableIds?: string[],
  ): Promise<string> {
    const allVariables = await this.list(projectId);

    // Filter: active, matching scope, not excluded
    const matches = allVariables.filter(
      (v) =>
        v.active &&
        (v.scope === 'always' || v.scope === step) &&
        !excludeVariableIds?.includes(v.id),
    );

    // Sort: core first (canonical order), then custom by order
    matches.sort((a, b) => {
      if (a.core && !b.core) return -1;
      if (!a.core && b.core) return 1;
      if (a.core && b.core) {
        const ai = CORE_VARIABLE_TYPES.indexOf(a.core);
        const bi = CORE_VARIABLE_TYPES.indexOf(b.core);
        if (ai !== bi) return ai - bi;
      }
      return a.order - b.order;
    });

    if (matches.length === 0) return '';

    const blocks: string[] = [];
    for (const v of matches) {
      const { content } = await this.get(projectId, v.id);
      const label = v.core ? '(core)' : '(custom)';
      const plainText = stripHtml(content);

      blocks.push(
        `=== STORY VARIABLE: ${v.name} ${label} ===\n${plainText}\n=== END VARIABLE ===`,
      );
    }

    return blocks.join('\n\n');
  }

  // ── Internal ───────────────────────────────────────────────────────────

  /**
   * Read and parse a variable.json from the repo.
   *
   * @throws `Error('Variable not found: <id>')` if the file cannot be read.
   */
  private async readVariableOrThrow(
    service: StorageService,
    variableId: string,
  ): Promise<Variable> {
    try {
      const buf = await service.readBlob(
        'refs/heads/main',
        `variables/${variableId}/variable.json`,
      );
      return VariableSchema.parse(JSON.parse(buf.toString('utf-8')));
    } catch {
      throw new Error(`Variable not found: ${variableId}`);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Escape HTML special characters for safe insertion into HTML content.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Extract the card title from card HTML content.
 *
 * Precedence:
 * 1. `<!-- title: ... -->` metadata comment
 * 2. First `<h3>...</h3>` tag content
 *
 * Returns `null` if neither is found.
 */
function extractCardTitle(html: string): string | null {
  // Try metadata comment first
  const metaMatch = html.match(/<!--\s*title:\s*(.+?)\s*-->/);
  if (metaMatch?.[1]) {
    return metaMatch[1].trim();
  }

  // Fall back to first h3
  const h3Match = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
  if (h3Match?.[1]) {
    return h3Match[1].trim();
  }

  return null;
}

/**
 * Strip HTML tags and decode common entities to produce plain text.
 *
 * - Converts `<br>` to newlines.
 * - Removes all other HTML tags.
 * - Decodes `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, `&nbsp;`.
 */
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
