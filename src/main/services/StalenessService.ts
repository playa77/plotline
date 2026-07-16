/**
 * StalenessService — fingerprint recomputation and artifact staleness tracking.
 *
 * Computes whether a chapter's generated artifacts (expanded-outline.html and
 * chapter.html) are stale relative to their current input fingerprints. Results
 * are cached in main-process memory and invalidated on any input change.
 *
 * Fingerprint model (§2.3 / §3.4):
 *   - outlineSlice: SHA1 of canonicalized JSON of the chapter's outline sections
 *   - variables:     [{ variableId, contentSha }] for each active variable that
 *                    matches the generation step's scope
 *   - upstream:      SHA1 of the upstream artifact (expanded-outline.html → ch.)
 *   - continuity:    { chapterId, sha } or null
 *
 * Version: 0.1.0 | 2026-07-16
 */

import crypto from 'node:crypto';
import type { StorageService } from '../storage/StorageService';
import type { ProjectService } from './ProjectService';
import type { VariableService } from './VariableService';
import type { GenRecord, Meta } from '../../shared/schemas/meta';
import type { Outline, OutlineChapter } from '../../shared/schemas/outline';
import type { Variable, VariableScope } from '../../shared/schemas/variable';

// ── Exported types ──────────────────────────────────────────────────────────

export interface StageStaleness {
  expanded: 'fresh' | 'stale';
  chapter: 'fresh' | 'stale';
}

// ── SHA helpers ─────────────────────────────────────────────────────────────

/**
 * Compute the SHA1 of a canonicalized JSON serialisation.
 *
 * The input is serialised with `JSON.stringify(input, null, 2)` with
 * sorted object keys for deterministic output.
 */
export function computeCanonicalJsonSha(input: unknown): string {
  const normalized = canonicalize(input);
  const json = JSON.stringify(normalized, null, 2);
  return crypto.createHash('sha1').update(json, 'utf-8').digest('hex');
}

/**
 * Compute the Git-compatible blob SHA1 hash of a string's UTF-8 content.
 *
 * Uses the Git blob format: SHA1("blob <byteLength>\\0<content>").
 * Matches the blob SHAs returned by isomorphic-git's readTree.
 */
export function computeBlobSha(content: string): string {
  const buf = Buffer.from(content, 'utf-8');
  const prefix = Buffer.from(`blob ${buf.length}\0`, 'utf-8');
  return crypto.createHash('sha1').update(prefix).update(buf).digest('hex');
}

/**
 * Deeply canonicalize a value: sort object keys, sort arrays of primitives.
 */
function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === 'object' && !(value instanceof Date)) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = canonicalize(obj[key]);
    }
    return result;
  }
  return value;
}

// ── StalenessService ────────────────────────────────────────────────────────

export class StalenessService {
  /** Cache keyed by `${projectId}:${chapterId}`. */
  private cache = new Map<string, StageStaleness>();

  constructor(
    private projectService: ProjectService,
    private variableService: VariableService,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Compute staleness for a chapter's artifacts.
   *
   * Checks the in-memory cache first. On cache miss, reads the stored
   * GenRecord fingerprints from `meta.json`, recomputes current
   * fingerprints from the repo state, and compares.
   *
   * @returns `{ expanded, chapter }` — each `'fresh'` or `'stale'`.
   */
  async computeStaleness(projectId: string, chapterId: string): Promise<StageStaleness> {
    const cacheKey = `${projectId}:${chapterId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const service = this.projectService.getOpenProject(projectId);
    if (!service) throw new Error(`Project not open: ${projectId}`);

    // Read meta.json from chapter ref
    const refPath = `refs/plotline/chapters/${chapterId}/main`;
    let meta: Meta;
    try {
      const metaBuf = await service.readBlob(refPath, 'meta.json');
      meta = JSON.parse(metaBuf.toString('utf-8'));
    } catch {
      // No meta.json — no generation has happened yet
      const result: StageStaleness = { expanded: 'fresh', chapter: 'fresh' };
      this.cache.set(cacheKey, result);
      return result;
    }

    // Compute expanded staleness
    let expanded: 'fresh' | 'stale' = 'fresh';
    if (meta.expanded) {
      const current = await this.computeExpandFingerprints(service, projectId, chapterId);
      if (!this.fingerprintsMatch(current, meta.expanded.fingerprints)) {
        expanded = 'stale';
      }
    }

    // Compute chapter staleness
    let chapter: 'fresh' | 'stale' = 'fresh';
    if (meta.chapter) {
      const current = await this.computeWriteFingerprints(service, projectId, chapterId);
      if (!this.fingerprintsMatch(current, meta.chapter.fingerprints)) {
        chapter = 'stale';
      }
    }

    const result: StageStaleness = { expanded, chapter };
    this.cache.set(cacheKey, result);
    return result;
  }

  /** Invalidate all cached staleness entries. */
  invalidateAll(): void {
    this.cache.clear();
  }

  /** Invalidate staleness cache for specific chapters in a project. */
  invalidate(projectId: string, chapterIds: string[]): void {
    for (const chapterId of chapterIds) {
      this.cache.delete(`${projectId}:${chapterId}`);
    }
  }

  // ── Fingerprint computation ────────────────────────────────────────────

  /**
   * Compute current expand-step fingerprints for a chapter.
   * Inputs that affect expanded-outline.html: outline slice + always/expand variables.
   */
  private async computeExpandFingerprints(
    service: StorageService,
    projectId: string,
    chapterId: string,
  ): Promise<GenRecord['fingerprints']> {
    const outlineSlice = await this.computeOutlineSliceSha(service, chapterId);
    const variables = await this.computeVariableFingerprints(service, projectId, ['always', 'expand']);

    return {
      outlineSlice,
      variables,
      upstream: null,
      continuity: null,
    };
  }

  /**
   * Compute current write-step fingerprints for a chapter.
   * Additional inputs vs expand: upstream artifact + continuity context.
   */
  private async computeWriteFingerprints(
    service: StorageService,
    projectId: string,
    chapterId: string,
  ): Promise<GenRecord['fingerprints']> {
    const outlineSlice = await this.computeOutlineSliceSha(service, chapterId);
    const variables = await this.computeVariableFingerprints(service, projectId, ['always', 'write']);

    // Upstream: expanded-outline.html blob SHA
    let upstream: string | null = null;
    try {
      const buf = await service.readBlob(
        `refs/plotline/chapters/${chapterId}/main`,
        'expanded-outline.html',
      );
      upstream = computeBlobSha(buf.toString('utf-8'));
    } catch {
      // No upstream artifact yet
    }

    // Continuity: preceding chapter's chapter.html blob SHA (if enabled)
    let continuity: GenRecord['fingerprints']['continuity'] = null;
    try {
      const projectBuf = await service.readBlob('refs/heads/main', 'project.json');
      const project = JSON.parse(projectBuf.toString('utf-8'));
      const continuityEnabled = project.settings?.continuityContext?.enabled;

      if (continuityEnabled) {
        const outlineBuf = await service.readBlob('refs/heads/main', 'outline/outline.json');
        const outline: Outline = JSON.parse(outlineBuf.toString('utf-8'));
        const preceding = findPrecedingChapter(outline, chapterId);
        if (preceding) {
          try {
            const cb = await service.readBlob(
              `refs/plotline/chapters/${preceding.chapterId}/main`,
              'chapter.html',
            );
            continuity = {
              chapterId: preceding.chapterId,
              sha: computeBlobSha(cb.toString('utf-8')),
            };
          } catch {
            // Preceding chapter has no chapter.html yet
          }
        }
      }
    } catch {
      // Project settings or outline not available — continuity stays null
    }

    return {
      outlineSlice,
      variables,
      upstream,
      continuity,
    };
  }

  // ── Fingerprint helpers ─────────────────────────────────────────────────

  /**
   * Compute the outline-slice SHA for a chapter: extract its sections from
   * `outline/outline.json`, canonicalise to JSON, return SHA1.
   */
  private async computeOutlineSliceSha(
    service: StorageService,
    chapterId: string,
  ): Promise<string> {
    try {
      const outlineBuf = await service.readBlob('refs/heads/main', 'outline/outline.json');
      const outline: Outline = JSON.parse(outlineBuf.toString('utf-8'));
      const chapter = findChapterInOutline(outline, chapterId);
      if (!chapter) return '';
      // Extract just the sections (the part that matters for generation)
      const slice = chapter.sections.map((s) => ({
        id: s.id,
        number: s.number,
        title: s.title,
        wordTarget: s.wordTarget,
        beats: s.beats,
      }));
      return computeCanonicalJsonSha(slice);
    } catch {
      return '';
    }
  }

  /**
   * Compute current variable fingerprints for the given scopes.
   *
   * Only active variables whose scope is in `scopes` are included.
   * Returns an array of `{ variableId, contentSha }` sorted by variableId
   * for deterministic comparison.
   */
  private async computeVariableFingerprints(
    service: StorageService,
    projectId: string,
    scopes: VariableScope[],
  ): Promise<Array<{ variableId: string; contentSha: string }>> {
    const allVariables = await this.variableService.list(projectId);
    const active = allVariables.filter((v) => v.active && scopes.includes(v.scope));

    const result: Array<{ variableId: string; contentSha: string }> = [];
    for (const v of active) {
      let content = '';
      try {
        const buf = await service.readBlob(
          'refs/heads/main',
          `variables/${v.id}/content.html`,
        );
        content = buf.toString('utf-8');
      } catch {
        // content.html may not exist yet
      }
      result.push({ variableId: v.id, contentSha: computeBlobSha(content) });
    }

    // Sort by variableId for deterministic comparison
    result.sort((a, b) => a.variableId.localeCompare(b.variableId));
    return result;
  }

  // ── Comparison ──────────────────────────────────────────────────────────

  /**
   * Compare current fingerprints against stored fingerprints.
   *
   * Rules:
   *   - `outlineSlice` must match exactly.
   *   - For variables: each *current* variable must have a matching entry in
   *     `stored` with the same `contentSha`. Stored variables that no longer
   *     appear in `current` (deactivated / deleted) are ignored.
   *   - `upstream` must match exactly (both null or same SHA).
   *   - `continuity` must match exactly (both null, or same chapterId + sha).
   */
  private fingerprintsMatch(
    current: GenRecord['fingerprints'],
    stored: GenRecord['fingerprints'],
  ): boolean {
    // Outline slice
    if (current.outlineSlice !== stored.outlineSlice) return false;

    // Variables: build lookup maps for O(1) comparison
    const currentVarMap = new Map(current.variables.map((v) => [v.variableId, v.contentSha]));
    for (const [varId, currentSha] of currentVarMap) {
      const storedVar = stored.variables.find((v) => v.variableId === varId);
      if (!storedVar || storedVar.contentSha !== currentSha) return false;
    }

    // Upstream
    if (current.upstream !== stored.upstream) return false;

    // Continuity
    if (current.continuity === null && stored.continuity === null) return true;
    if (current.continuity === null || stored.continuity === null) return false;
    if (current.continuity.chapterId !== stored.continuity.chapterId) return false;
    if (current.continuity.sha !== stored.continuity.sha) return false;

    return true;
  }
}

// ── Outline helpers ─────────────────────────────────────────────────────────

/**
 * Find a chapter in the outline by its chapterId.
 *
 * Searches all parts and returns the first matching OutlineChapter,
 * or `null` if not found.
 */
function findChapterInOutline(
  outline: Outline,
  chapterId: string,
): OutlineChapter | null {
  for (const part of outline.parts) {
    for (const chapter of part.chapters) {
      if (chapter.chapterId === chapterId) {
        return chapter;
      }
    }
  }
  return null;
}

/**
 * Find the chapter that precedes the given chapterId in the outline.
 *
 * Returns `null` if the chapter is the first in the book or not found.
 */
function findPrecedingChapter(
  outline: Outline,
  chapterId: string,
): OutlineChapter | null {
  const allChapters = outline.parts.flatMap((p) => p.chapters);
  const idx = allChapters.findIndex((c) => c.chapterId === chapterId);
  if (idx > 0) return allChapters[idx - 1]!;
  return null;
}
