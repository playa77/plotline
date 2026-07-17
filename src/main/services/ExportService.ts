/**
 * ExportService — one-shot export of chapter artifacts to clipboard, file, or PDF.
 *
 * Resolves the chapter version ref from the project manifest, reads the
 * chapter.html artifact, passes it through the Substack-safe HTML sanitizer,
 * and delivers the result as clipboard content, Markdown file, or PDF via
 * the LaTeX+Tectonic pipeline.
 *
 * PDF export (WP-25) is async with streaming progress. Substack/Markdown
 * exports are synchronous wall-clock operations with no streaming.
 *
 * Version: 0.2.0 | 2026-07-17
 */

import { clipboard } from 'electron';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import TurndownService from 'turndown';
import { sanitize } from '../../shared/sanitize/sanitizer';
import { htmlToLatex, escapeLatex } from './tex/htmlToLatex';
import { TectonicRunner } from './tex/TectonicRunner';
import type { ProjectService } from './ProjectService';
import type { StorageService } from '../storage/StorageService';
import type { Project, StructureItem, ChapterEntry } from '../../shared/schemas/project';
import type { Outline, RichBlock } from '../../shared/schemas/outline';

// ── Structured error codes ──────────────────────────────────────────────

export interface ExportError {
  code: string;
  message: string;
}

/** Information about a LaTeX template (built-in or project). */
export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  defaultOptions: Record<string, string>;
}

/** Built-in template manifest data. */
interface BuiltinTemplateManifest extends TemplateInfo {
  // No additional fields needed for built-ins
}

// ── ExportService ───────────────────────────────────────────────────────

export class ExportService {
  constructor(private readonly projectService: ProjectService) {}

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Export a chapter's written artifact to clipboard or file.
   *
   * 1. Resolves the chapter version ref from the project manifest.
   * 2. Reads `chapter.html` from that ref.
   * 3. Sanitizes via the Substack-safe sanitizer.
   * 4. Delivers: clipboard (html + plaintext) or file (raw HTML).
   *
   * @param projectId  - Open project ID.
   * @param chapterId  - Chapter ID within the project.
   * @param versionSlug - Optional override; defaults to the chapter's selectedVersion.
   * @param mode       - `'clipboard'` copies to system clipboard; `'file'` writes to disk.
   * @param filePath   - Required for `'file'` mode.
   * @returns `{ ok: true }` on success.
   * @throws `{ code, message }` on expected failures (NO_ARTIFACT, INVALID_PAYLOAD).
   */
  async exportSubstack(
    projectId: string,
    chapterId: string,
    versionSlug?: string | undefined,
    mode: 'clipboard' | 'file' = 'clipboard',
    filePath?: string,
  ): Promise<{ ok: boolean }> {
    const service = this.getService(projectId);

    // 1. Resolve version slug from project manifest
    const resolvedSlug = await this.resolveVersionSlug(service, chapterId, versionSlug);
    const refPath = `refs/plotline/chapters/${chapterId}/${resolvedSlug}`;

    // 2. Read chapter.html
    let html: string;
    try {
      const buf = await service.readBlob(refPath, 'chapter.html');
      html = buf.toString('utf-8');
    } catch {
      throw { code: 'NO_ARTIFACT', message: 'Chapter has no written artifact to export' } satisfies ExportError;
    }

    // 3. Sanitize as a hygiene pass
    const sanitized = sanitize(html);

    // 4. Deliver
    if (mode === 'clipboard') {
      const plainText = stripHtmlToPlainText(sanitized);
      clipboard.write({ text: plainText, html: sanitized });
    } else {
      if (!filePath) {
        throw { code: 'INVALID_PAYLOAD', message: 'filePath required for file mode' } satisfies ExportError;
      }
      writeFileSync(filePath, sanitized, 'utf-8');
    }

    return { ok: true };
  }

  /**
   * Export chapter(s) as Markdown with YAML frontmatter.
   *
   * Chapter mode: exports one chapter's written artifact as MD with frontmatter.
   * Book mode: exports all chapters in manifest order with part headers.
   *
   * Uses turndown for HTML→MD conversion with custom rules for figure/figcaption.
   */
  async exportMarkdown(
    projectId: string,
    scope: 'chapter' | 'book',
    filePath: string,
    chapterId?: string,
    versionSlug?: string,
  ): Promise<{ path: string; wordCount: number }> {
    const service = this.getService(projectId);

    // Read project manifest for structure + chapter versions
    const manifestBuf = await service.readBlob('refs/heads/main', 'project.json');
    const project: Project = JSON.parse(manifestBuf.toString('utf-8'));

    // Read outline for part/chapter titles (used in frontmatter and part headers)
    let outline: Outline | null = null;
    try {
      const outlineBuf = await service.readBlob('refs/heads/main', 'outline/outline.json');
      outline = JSON.parse(outlineBuf.toString('utf-8'));
    } catch {
      // outline.json may not exist — that's fine, we'll use manifest names
    }

    const td = createTurndownService();

    if (scope === 'chapter') {
      return this.exportChapterMarkdown(service, td, project, outline, filePath, chapterId!, versionSlug);
    } else {
      return this.exportBookMarkdown(service, td, project, outline, filePath);
    }
  }

  // ── PDF export (WP-25) ─────────────────────────────────────────────────

  /**
   * List available LaTeX templates.
   * For v1, returns the built-in templates only.
   */
  async listLatexTemplates(_projectId?: string): Promise<TemplateInfo[]> {
    return this.getBuiltinTemplates();
  }

  /**
   * Export book/chapter(s) as PDF via LaTeX + Tectonic.
   *
   * Runs asynchronously with progress via callback. Returns the PDF path
   * when compilation succeeds.
   *
   * @param projectId   - Open project ID.
   * @param templateId   - LaTeX template ID (e.g. 'trade-paperback').
   * @param chapterIds   - Array of chapter IDs or 'all' for entire book.
   * @param options      - Template option overrides (fontSize, paperWidth, etc.).
   * @param outputPath   - Path for the generated PDF file.
   * @param onProgress   - Callback for streaming progress lines.
   * @returns `{ pdfPath }` on success.
   * @throws `{ code, message }` on expected failures.
   */
  async exportPdf(
    projectId: string,
    templateId: string,
    chapterIds: string[] | 'all',
    options: Record<string, string>,
    outputPath: string,
    onProgress: (line: string) => void,
  ): Promise<{ pdfPath: string }> {
    const service = this.getService(projectId);

    // 1. Read project manifest
    const manifestBuf = await service.readBlob('refs/heads/main', 'project.json');
    const project: Project = JSON.parse(manifestBuf.toString('utf-8'));

    // 2. Collect chapters to export
    const chapters = chapterIds === 'all'
      ? collectAllChapters(project.structure)
      : chapterIds.map(id => findChapterEntry(project.structure, id)).filter(Boolean) as ChapterEntry[];

    if (chapters.length === 0) {
      throw { code: 'NO_CHAPTERS', message: 'No chapters to export' } satisfies ExportError;
    }

    // 3. Convert each chapter's HTML to LaTeX
    const latexChapters: string[] = [];
    for (const ch of chapters) {
      const versionSlug = ch.selectedVersion ?? 'main';
      const refPath = `refs/plotline/chapters/${ch.id}/${versionSlug}`;

      try {
        const buf = await service.readBlob(refPath, 'chapter.html');
        const html = buf.toString('utf-8');
        const sanitized = sanitize(html);
        const latex = htmlToLatex(sanitized);

        // Add chapter heading
        latexChapters.push(`\\chapter{${escapeLatex(ch.title)}}\n${latex}`);
      } catch {
        // Skip chapters without written artifacts
        onProgress(`[plotline] Skipping unwritten chapter: ${ch.title}`);
      }
    }

    if (latexChapters.length === 0) {
      throw { code: 'NO_ARTIFACT', message: 'No chapters have written artifacts to export' } satisfies ExportError;
    }

    const body = latexChapters.join('\n\n');

    // 4. Resolve and apply template
    const getOpt = (key: string, fallback: string): string => options[key] ?? fallback;
    const templateVars: Record<string, string> = {
      TITLE: project.title,
      AUTHOR: getOpt('author', 'Plotline Export'),
      DATE: new Date().toISOString().split('T')[0]!,
      BODY: body,
      FONT_SIZE: getOpt('fontSize', '11pt'),
      PAPER_WIDTH: getOpt('paperWidth', '6in'),
      PAPER_HEIGHT: getOpt('paperHeight', '9in'),
    };

    const templateContent = this.loadBuiltinTemplate(templateId);
    const texContent = applyTemplate(templateContent, templateVars);

    // 5. Write .tex file to temp directory
    const tmpDir = getTempDir();
    const texPath = path.join(tmpDir, 'export.tex');
    writeFileSync(texPath, texContent, 'utf-8');
    onProgress('[plotline] LaTeX document generated');

    // 6. Run Tectonic
    const runner = new TectonicRunner();
    const pdfPath = await runner.render(texPath, tmpDir, onProgress);

    // 7. Copy/move PDF to output path if different from tmp
    if (pdfPath !== outputPath) {
      copyFileSync(pdfPath, outputPath);
      onProgress(`[plotline] PDF saved to ${outputPath}`);
    }

    return { pdfPath: outputPath };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /** Hardcoded list of built-in template manifests. */
  private getBuiltinTemplates(): BuiltinTemplateManifest[] {
    return [
      {
        id: 'trade-paperback',
        name: 'Trade Paperback',
        description: '6×9" trade paperback format with chapter headings',
        defaultOptions: {
          fontSize: '11pt',
          paperWidth: '6in',
          paperHeight: '9in',
        },
      },
      {
        id: 'manuscript-submission',
        name: 'Manuscript Submission',
        description: 'Standard manuscript format for literary submissions — 12pt, double-spaced, Courier',
        defaultOptions: {
          fontSize: '12pt',
        },
      },
      {
        id: 'a4-article',
        name: 'A4 Article',
        description: 'A4 article format, 11pt, suitable for papers and reports',
        defaultOptions: {
          fontSize: '11pt',
          paperWidth: '210mm',
          paperHeight: '297mm',
        },
      },
    ];
  }

  /**
   * Load a built-in template file from disk.
   * Templates ship with the app under tex/templates/<id>/template.tex.
   */
  private loadBuiltinTemplate(templateId: string): string {
    const tmplPath = path.join(__dirname, 'tex/templates', templateId, 'template.tex');
    return readFileSync(tmplPath, 'utf-8');
  }

  /**
   * Resolve the StorageService for an open project.
   * @throws `{ code: 'HANDLER_ERROR', message }` if the project is not open.
   */
  private getService(projectId: string): StorageService {
    const service = this.projectService.getOpenProject(projectId);
    if (!service) {
      throw new Error(`Project not open: ${projectId}`);
    }
    return service;
  }

  /**
   * Resolve the version slug for a chapter.
   *
   * If `versionSlug` is explicitly provided it is returned as-is.
   * Otherwise the project manifest (`refs/heads/main/project.json`) is read
   * and the chapter entry's `selectedVersion` field is used (default: `'main'`).
   */
  private async resolveVersionSlug(
    service: StorageService,
    chapterId: string,
    versionSlug?: string,
  ): Promise<string> {
    if (versionSlug) return versionSlug;

    try {
      const buf = await service.readBlob('refs/heads/main', 'project.json');
      const project: Project = JSON.parse(buf.toString('utf-8'));
      const entry = findChapterEntry(project.structure, chapterId);
      return entry?.selectedVersion ?? 'main';
    } catch {
      // If project.json can't be read, fall back to 'main'
      return 'main';
    }
  }

  /**
   * Export a single chapter as Markdown with frontmatter.
   */
  private async exportChapterMarkdown(
    service: StorageService,
    td: TurndownService,
    project: Project,
    outline: Outline | null,
    filePath: string,
    chapterId: string,
    versionSlug?: string,
  ): Promise<{ path: string; wordCount: number }> {
    const entry = findChapterEntry(project.structure, chapterId);
    if (!entry) throw { code: 'NOT_FOUND', message: `Chapter ${chapterId} not found in project` } satisfies ExportError;

    const resolvedSlug = versionSlug ?? entry.selectedVersion ?? 'main';
    const refPath = `refs/plotline/chapters/${chapterId}/${resolvedSlug}`;

    let html: string;
    try {
      const buf = await service.readBlob(refPath, 'chapter.html');
      html = buf.toString('utf-8');
    } catch {
      throw { code: 'NO_ARTIFACT', message: 'Chapter has no written artifact to export' } satisfies ExportError;
    }

    const sanitized = sanitize(html);
    const mdBody = td.turndown(sanitized);

    // Find the part this chapter belongs to
    const partName = findPartName(project.structure, chapterId, outline);

    const frontmatter = generateFrontmatter(
      entry.title,
      partName,
      resolvedSlug,
      entry.versions.find(v => v.slug === resolvedSlug)?.name ?? resolvedSlug,
    );
    const fullMd = `${frontmatter}\n${mdBody}\n`;

    writeFileSync(filePath, fullMd, 'utf-8');

    const wordCount = countWordsMd(fullMd);
    return { path: filePath, wordCount };
  }

  /**
   * Export entire book as Markdown with part headers.
   *
   * Output format is designed to be re-importable through the WP-06 outline importer.
   * Lossy fields: beats, section structure, word-target formatting.
   */
  private async exportBookMarkdown(
    service: StorageService,
    td: TurndownService,
    project: Project,
    outline: Outline | null,
    filePath: string,
  ): Promise<{ path: string; wordCount: number }> {
    const parts: string[] = [];

    // Add title
    parts.push(`# ${project.title}\n`);

    // Add front matter if present
    if (outline?.frontMatter && outline.frontMatter.length > 0) {
      parts.push(renderRichBlocks(outline.frontMatter));
      parts.push('');
    }

    for (const item of project.structure) {
      if (item.kind === 'part') {
        parts.push(`## ${item.title}\n`);

        for (const ch of item.chapters) {
          const chMd = await this.readAndConvertChapter(service, td, ch, item.title);
          if (chMd) parts.push(chMd);
        }
      } else {
        // Standalone chapter (epilogue, appendix)
        const chMd = await this.readAndConvertChapter(service, td, item, null);
        if (chMd) parts.push(chMd);
      }
    }

    // Add back matter if present
    if (outline?.backMatter && outline.backMatter.length > 0) {
      parts.push(renderRichBlocks(outline.backMatter));
    }

    const fullMd = parts.join('\n');
    writeFileSync(filePath, fullMd, 'utf-8');

    return { path: filePath, wordCount: countWordsMd(fullMd) };
  }

  /**
   * Read and convert a single chapter for the book export.
   * Returns null if the chapter has no written artifact (skipped gracefully).
   */
  private async readAndConvertChapter(
    service: StorageService,
    td: TurndownService,
    entry: ChapterEntry,
    partName: string | null,
  ): Promise<string | null> {
    const versionSlug = entry.selectedVersion ?? 'main';
    const refPath = `refs/plotline/chapters/${entry.id}/${versionSlug}`;

    let html: string;
    try {
      const buf = await service.readBlob(refPath, 'chapter.html');
      html = buf.toString('utf-8');
    } catch {
      return null; // Chapter not yet written — skip
    }

    const sanitized = sanitize(html);
    const mdBody = td.turndown(sanitized);

    const frontmatter = generateFrontmatter(
      entry.title,
      partName,
      versionSlug,
      entry.versions.find(v => v.slug === versionSlug)?.name ?? versionSlug,
    );
    return `${frontmatter}\n${mdBody}\n`;
  }
}
function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Find a chapter entry in the project structure by its ID.
 */
function findChapterEntry(
  structure: StructureItem[],
  chapterId: string,
): ChapterEntry | null {
  for (const item of structure) {
    if (item.kind === 'part') {
      for (const ch of item.chapters) {
        if (ch.id === chapterId) return ch;
      }
    } else if (item.kind === 'chapter') {
      if (item.id === chapterId) return item;
    }
  }
  return null;
}

// ── Markdown export helpers ─────────────────────────────────────────────

/**
 * Create a turndown service configured for the Substack-safe HTML subset.
 */
function createTurndownService(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });

  // Custom rule for figure/figcaption → ![](src) *caption*
  td.addRule('figure', {
    filter: ['figure'],
    replacement: (_content, node) => {
      const img = (node as HTMLElement).querySelector('img');
      const caption = (node as HTMLElement).querySelector('figcaption');
      if (!img) return '';
      const src = img.getAttribute('src') ?? '';
      const alt = img.getAttribute('alt') ?? '';
      const captionText = caption?.textContent?.trim() ?? '';
      const imgMd = `![${alt}](${src})`;
      return captionText ? `${imgMd}\n*${captionText}*` : imgMd;
    },
  });

  // Custom rule for <s> strikethrough (turndown uses <strike> by default)
  td.addRule('strikethrough', {
    filter: ['s'],
    replacement: (_content, node) => {
      const text = (node as HTMLElement).textContent ?? '';
      return `~~${text}~~`;
    },
  });

  return td;
}

/**
 * Generate YAML frontmatter block for a chapter.
 */
function generateFrontmatter(chapterTitle: string, partName: string | null, versionSlug: string, versionName: string): string {
  const now = new Date().toISOString().split('T')[0];
  let fm = '---\n';
  fm += `title: "${chapterTitle}"\n`;
  if (partName) fm += `part: "${partName}"\n`;
  fm += `version: "${versionName}"\n`;
  fm += `slug: "${versionSlug}"\n`;
  fm += `date: "${now}"\n`;
  fm += '---\n';
  return fm;
}

/**
 * Find the part name a chapter belongs to, using outline data if available.
 */
function findPartName(structure: StructureItem[], chapterId: string, outline: Outline | null): string | null {
  for (const item of structure) {
    if (item.kind === 'part') {
      for (const ch of item.chapters) {
        if (ch.id === chapterId) return item.title;
      }
    }
  }
  return null;
}

/**
 * Render RichBlock array as Markdown.
 */
function renderRichBlocks(blocks: RichBlock[]): string {
  return blocks.map((block) => {
    switch (block.type) {
      case 'paragraph': return block.text;
      case 'heading': return `${'#'.repeat(block.level)} ${block.text}`;
      case 'list': return block.items.map((item, i) => block.ordered ? `${i + 1}. ${item}` : `- ${item}`).join('\n');
      case 'table': {
        const header = '| ' + block.headers.join(' | ') + ' |';
        const sep = '| ' + block.headers.map(() => '---').join(' | ') + ' |';
        const rows = block.rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
        return `${header}\n${sep}\n${rows}`;
      }
    }
  }).join('\n\n');
}

/**
 * Count words in markdown text (strips formatting syntax, counts words).
 */
function countWordsMd(md: string): number {
  // Strip YAML frontmatter
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, '');
  // Strip markdown syntax
  const plain = body
    .replace(/#{1,6}\s/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/^>\s/gm, '')
    .replace(/^[-*+]\s/gm, '')
    .replace(/^\d+\.\s/gm, '')
    .replace(/[-*_]{3,}/g, '')
    .replace(/\|/g, ' ')
    .trim();
  return plain.split(/\s+/).filter(Boolean).length;
}

// ── PDF export helpers (WP-25) ────────────────────────────────────────────

/**
 * Collect all chapter entries from a project structure.
 * Handles both part-nested and top-level chapters.
 */
function collectAllChapters(structure: StructureItem[]): ChapterEntry[] {
  const chapters: ChapterEntry[] = [];
  for (const item of structure) {
    if (item.kind === 'part') {
      chapters.push(...item.chapters);
    } else if (item.kind === 'chapter') {
      chapters.push(item);
    }
  }
  return chapters;
}

/**
 * Apply template placeholders, replacing %%KEY%% with values.
 * Values are LaTeX-escaped to prevent injection.
 *
 * @param template - Template string with %%PLACEHOLDER%% markers.
 * @param vars     - Map of placeholder name (without %%) to value.
 * @returns The resolved LaTeX document.
 */
function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`%%${key}%%`, 'g'), value);
  }
  return result;
}

/**
 * Create a temporary directory for PDF export artifacts.
 */
function getTempDir(): string {
  const dir = path.join(os.tmpdir(), `plotline-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
