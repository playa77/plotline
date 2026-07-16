/**
 * ChapterService — chapter artifact read/write and status reporting.
 *
 * Manages chapter version artifacts stored under
 * `refs/plotline/chapters/<chapterId>/<versionSlug>/` as Git objects:
 *   - expanded-outline.html  — post-expand (outline → prose)
 *   - chapter.html           — post-write (expanded → chapter prose)
 *   - meta.json              — GenRecord describing how the artifact was created
 *
 * Every durable operation flows through StorageService.commit() — there
 * is no direct filesystem access or working tree manipulation.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { StorageService } from '../storage/StorageService';
import type { ProjectService } from './ProjectService';
import type { StalenessService } from './StalenessService';
import { GenRecordSchema } from '../../shared/schemas/meta';
import type { GenRecord } from '../../shared/schemas/meta';
import type { Outline, OutlineChapter } from '../../shared/schemas/outline';

// ── ChapterService ──────────────────────────────────────────────────────────

export class ChapterService {
  constructor(
    private projectService: ProjectService,
    private stalenessService?: StalenessService,
  ) {}

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Resolve the StorageService for an open project.
   * @throws If the project is not open.
   */
  private getService(projectId: string): StorageService {
    const service = this.projectService.getOpenProject(projectId);
    if (!service) throw new Error(`Project not open: ${projectId}`);
    return service;
  }

  // ── getArtifact ─────────────────────────────────────────────────────────

  /**
   * Read a chapter artifact (outline, expanded outline, or chapter prose).
   *
   * For `'outline'` stage: reads the book outline from `refs/heads/main`
   * and returns an HTML rendering of the chapter's sections and beats.
   * Meta is always `null` (no GenRecord for outline slices).
   *
   * For `'expanded'` / `'chapter'` stages: reads from the chapter version
   * ref. Returns empty strings when the ref or blob does not exist.
   *
   * Stale is `false` for all stages (staleness checks are WP-20).
   */
  async getArtifact(
    projectId: string,
    chapterId: string,
    versionSlug?: string,
    stage: 'outline' | 'expanded' | 'chapter' = 'outline',
  ): Promise<{ html: string; meta?: GenRecord | null; stale: boolean }> {
    const service = this.getService(projectId);

    if (stage === 'outline') {
      return this.getOutlineArtifact(service, chapterId);
    }

    const resolvedSlug = versionSlug ?? 'main';
    const refPath = `refs/plotline/chapters/${chapterId}/${resolvedSlug}`;
    const filename =
      stage === 'expanded' ? 'expanded-outline.html' : 'chapter.html';

    // Read the artifact blob
    let html = '';
    try {
      const buf = await service.readBlob(refPath, filename);
      html = buf.toString('utf-8');
    } catch {
      // File or ref doesn't exist yet — return empty string
    }

    // Try to read meta.json for the GenRecord
    let meta: GenRecord | null = null;
    try {
      const metaBuf = await service.readBlob(refPath, 'meta.json');
      meta = GenRecordSchema.parse(JSON.parse(metaBuf.toString('utf-8')));
    } catch {
      // meta.json may be absent
    }

    return { html, meta, stale: false };
  }

  // ── saveArtifact ─────────────────────────────────────────────────────────

  /**
   * Save a chapter artifact (expanded-outline.html or chapter.html).
   *
   * Only `'expanded'` and `'chapter'` stages are supported — outline
   * edits go through `outline:mutate` and should not be saved here.
   *
   * If the chapter ref does not exist, it is created lazily by the
   * underlying commit call.
   *
   * @throws If `stage === 'outline'` (outline is managed separately).
   */
  async saveArtifact(
    projectId: string,
    chapterId: string,
    stage: 'outline' | 'expanded' | 'chapter',
    html: string,
    versionSlug?: string,
  ): Promise<{ sha: string }> {
    if (stage === 'outline') {
      throw new Error(
        'Outline edits are not supported via saveArtifact — use outline:mutate',
      );
    }

    const service = this.getService(projectId);
    const resolvedSlug = versionSlug ?? 'main';
    const refPath = `refs/plotline/chapters/${chapterId}/${resolvedSlug}`;
    const filename =
      stage === 'expanded' ? 'expanded-outline.html' : 'chapter.html';

    const sha = await service.commit(
      refPath,
      { [filename]: Buffer.from(html, 'utf-8') },
      { kind: 'autosave' as const, label: 'Save artifact' },
    );

    // Invalidate staleness cache — inputs may have changed
    this.stalenessService?.invalidateAll();

    return { sha };
  }

  // ── getStatus ────────────────────────────────────────────────────────────

  /**
   * Get the status of a chapter's workspace.
   *
   * Returns stage dots indicating the presence of each artifact type,
   * the currently-selected version (default: 'main'), and the list of
   * available version names.
   *
   * For WP-15, version management is simplified — only 'main' is
   * returned. Multi-version support is WP-21.
   */
  async getStatus(
    projectId: string,
    chapterId: string,
  ): Promise<{
    stageDots: {
      outline: 'empty' | 'filled' | 'stale';
      expanded: 'empty' | 'filled' | 'stale';
      chapter: 'empty' | 'filled' | 'stale';
    };
    selectedVersion: string;
    versionNames: Array<{ slug: string; name: string; selected: boolean }>;
  }> {
    const service = this.getService(projectId);

    // Check if chapter exists in the outline
    let outline: 'filled' | 'empty' = 'empty';
    try {
      const outlineBuf = await service.readBlob(
        'refs/heads/main',
        'outline/outline.json',
      );
      const parsed: Outline = JSON.parse(outlineBuf.toString('utf-8'));
      outline = findChapterInOutline(parsed, chapterId) ? 'filled' : 'empty';
    } catch {
      // No outline committed yet
    }

    // Check expanded/chapter artifact presence
    let expanded: 'empty' | 'filled' = 'empty';
    let chapter: 'empty' | 'filled' = 'empty';

    const refPath = `refs/plotline/chapters/${chapterId}/main`;
    try {
      const tree = await service.readTree(refPath);
      if ('expanded-outline.html' in tree) expanded = 'filled';
      if ('chapter.html' in tree) chapter = 'filled';
    } catch {
      // Ref doesn't exist — no artifacts
    }

    // Compute staleness if service is available
    let staleExpanded = false;
    let staleChapter = false;
    if (this.stalenessService) {
      try {
        const staleness = await this.stalenessService.computeStaleness(projectId, chapterId);
        staleExpanded = staleness.expanded === 'stale';
        staleChapter = staleness.chapter === 'stale';
      } catch {
        // Staleness computation unavailable — leave defaults
      }
    }

    return {
      stageDots: {
        outline,
        expanded: staleExpanded ? 'stale' : expanded,
        chapter: staleChapter ? 'stale' : chapter,
      },
      selectedVersion: 'main',
      versionNames: [
        { slug: 'main', name: 'Main', selected: true },
      ],
    };
  }

  // ── Internal: outline rendering ──────────────────────────────────────────

  /**
   * Read the outline and return an HTML rendering of a single chapter's
   * sections and beats.
   *
   * Returns `{ html: '', meta: null, stale: false }` when the outline
   * does not exist or the chapter ID is not found.
   */
  private async getOutlineArtifact(
    service: StorageService,
    chapterId: string,
  ): Promise<{ html: string; meta?: GenRecord | null; stale: boolean }> {
    try {
      const buf = await service.readBlob(
        'refs/heads/main',
        'outline/outline.json',
      );
      const outline: Outline = JSON.parse(buf.toString('utf-8'));
      const chapter = findChapterInOutline(outline, chapterId);

      if (!chapter) {
        return { html: '', meta: null, stale: false };
      }

      const html = renderChapterOutlineHtml(chapter);
      return { html, meta: null, stale: false };
    } catch {
      // No outline or parse error
      return { html: '', meta: null, stale: false };
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

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
 * Render a chapter's sections as simple HTML.
 *
 * Output format:
 * ```html
 * <h3>Section 1.1: Section Title</h3>
 * <ul>
 *   <li>Beat text one</li>
 *   <li>Beat text two</li>
 * </ul>
 * ```
 */
function renderChapterOutlineHtml(chapter: OutlineChapter): string {
  const parts: string[] = [];

  for (const section of chapter.sections) {
    parts.push(`<h3>Section ${escapeHtml(section.number)}: ${escapeHtml(section.title)}</h3>`);

    if (section.beats.length > 0) {
      parts.push('<ul>');
      for (const beat of section.beats) {
        parts.push(`  <li>${escapeHtml(beat)}</li>`);
      }
      parts.push('</ul>');
    }
  }

  return parts.join('\n');
}

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
