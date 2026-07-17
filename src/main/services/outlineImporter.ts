/**
 * Markdown outline importer — converts a reference outline into Plotline's
 * structured outline.json format.
 *
 * Pure function: no disk access, no Git operations. Takes markdown text,
 * returns a ParsePreview with the parsed outline, validated Outline object,
 * and project-manifest structure array.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { generateULID } from '../../shared/utils/ulid';
import type { RichBlock, Outline, ParsedPart, ParsedChapter, ParsedSection, ParsePreview } from '../../shared/schemas/outline';
import type { ChapterEntry, StructureItem } from '../../shared/schemas/project';
import { OutlineSchema } from '../../shared/schemas/outline';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a word target line like:
 *   `**Target: 7,000–8,000 words**`
 *   `**Target: 3,000–4,000 words**`
 *
 * Handles both endash (–) and regular dash (-), with optional commas.
 */
function parseWordTarget(line: string): { min: number; max: number } | null {
  const match = line.match(/([\d,]+)\s*[–\-]\s*([\d,]+)/);
  if (!match) return null;

  const min = parseInt(match[1]!.replace(/,/g, ''), 10);
  const max = parseInt(match[2]!.replace(/,/g, ''), 10);

  if (isNaN(min) || isNaN(max)) return null;
  return { min, max };
}

/**
 * Parse a table row like `| Year | Event |` into cell strings.
 */
function parseTableRow(line: string): string[] {
  return line
    .split('|')
    .filter((_, i, arr) => i > 0 && i < arr.length - 1)
    .map((cell) => cell.trim());
}

/**
 * Convert collected `|` lines into a RichBlock `table`.
 * Expects at least header + separator rows; skips the separator row.
 */
function buildTableBlock(tableLines: string[]): RichBlock {
  if (tableLines.length < 2) {
    return { type: 'paragraph', text: tableLines.join('\n') };
  }

  const headers = parseTableRow(tableLines[0]!);
  const rows: string[][] = [];

  for (let i = 2; i < tableLines.length; i++) {
    const row = parseTableRow(tableLines[i]!);
    if (row.length > 0 && row.some((c) => c.length > 0)) {
      rows.push(row);
    }
  }

  return { type: 'table', headers, rows };
}

/**
 * Build the project-manifest structure array from parsed parts.
 *
 * Real parts are emitted as `{ kind: 'part', ... }` items.
 * A virtual "Epilogue" part holding only the standalone epilogue chapter
 * is unwrapped into a `{ kind: 'chapter', ... }` item.
 */
function buildStructure(
  parts: ParsedPart[],
  standaloneEpilogueChapterId: string | null,
): StructureItem[] {
  const structure: StructureItem[] = [];
  const now = new Date().toISOString();

  function makeChapterEntry(chapter: ParsedChapter): ChapterEntry {
    return {
      id: chapter.chapterId,
      title: chapter.title,
      selectedVersion: 'main',
      versions: [
        {
          slug: 'main',
          name: 'Main',
          createdAt: now,
          createdFrom: null,
          archived: false,
        },
      ],
      wordTarget: chapter.wordTarget,
    };
  }

  for (const part of parts) {
    // Detect the virtual Epilogue part (only the standalone epilogue chapter)
    if (
      standaloneEpilogueChapterId &&
      part.chapters.length === 1 &&
      part.chapters[0]!.chapterId === standaloneEpilogueChapterId
    ) {
      const chapter = part.chapters[0]!;
      structure.push({
        kind: 'chapter',
        ...makeChapterEntry(chapter),
      });
    } else {
      structure.push({
        kind: 'part',
        id: part.id,
        title: part.title,
        chapters: part.chapters.map(makeChapterEntry),
      });
    }
  }

  return structure;
}

// ── Front / back matter parsing ──────────────────────────────────────────────

/**
 * Convert accumulated plain-text lines into RichBlock paragraphs.
 * Each block of text separated by blank lines becomes one paragraph.
 */
function linesToParagraphBlocks(lines: string[]): RichBlock[] {
  const blocks: RichBlock[] = [];
  // Group consecutive non-empty lines into paragraphs, splitting on blank lines
  const paraLines: string[] = [];

  for (const line of lines) {
    if (line.trim() === '') {
      if (paraLines.length > 0) {
        blocks.push({ type: 'paragraph', text: paraLines.join('\n') });
        paraLines.length = 0;
      }
    } else {
      paraLines.push(line);
    }
  }
  if (paraLines.length > 0) {
    blocks.push({ type: 'paragraph', text: paraLines.join('\n') });
  }

  return blocks;
}

// ── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse a structured book-outline markdown file into Plotline's internal format.
 *
 * Supported conventions:
 *  - `# Title` → project title
 *  - `## PART ...` → part heading
 *  - `### Chapter N: Title` → chapter start
 *  - `### Epilogue: Title` → epilogue (treated as chapter)
 *  - `**Target: X–Y words**` → chapter word target
 *  - `#### N.M Title *(n words)*` → section with optional word target
 *  - `- beat text` → section beat
 *  - `(description)` → placeholder chapter (no sections)
 *  - `## Appendix ...` → back-matter heading
 *  - Tables (`| ... |`) → back-matter table blocks
 */
export function parseOutlineMarkdown(markdown: string): ParsePreview {
  const lines = markdown.split('\n');

  let projectTitle = '';
  const parts: ParsedPart[] = [];
  const backMatter: RichBlock[] = [];

  // Parsing state
  let inFrontMatter = true;
  let inBackMatter = false;
  let currentPart: ParsedPart | null = null;
  let currentChapter: ParsedChapter | null = null;
  let currentSection: ParsedSection | null = null;

  // Front matter accumulated lines (everything before first `## PART`)
  const frontMatterLines: string[] = [];

  // Back matter table accumulator
  let pendingTable: string[] | null = null;

  // Epilogue that appears outside any part
  let standaloneEpilogue: ParsedChapter | null = null;

  // ── State helpers ───────────────────────────────────────────────────────

  function closeSection(): void {
    currentSection = null;
  }

  function closeChapter(): void {
    currentChapter = null;
    currentSection = null;
  }

  function closePart(): void {
    currentPart = null;
    closeChapter();
  }

  /** Flush accumulated front-matter lines into RichBlock paragraphs. */
  function commitFrontMatter(): void {
    // empty — frontMatterLines will be consumed at the end
  }

  // ── Line processing ─────────────────────────────────────────────────────

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trimEnd(); // preserve intentional leading space (for tables etc.)
    const plain = trimmed.trim();

    // ── Project title (first `# ` line, not `##`) ────────────────
    if (i === 0 && plain.startsWith('# ') && !plain.startsWith('## ')) {
      projectTitle = plain.slice(2).trim();
      continue;
    }

    // ── Part detection ────────────────────────────────────────────
    if (/^##\s+PART\b/i.test(plain)) {
      // Flush front matter before first part
      if (inFrontMatter) {
        inFrontMatter = false;
      }

      closeChapter();
      closePart();

      const title = plain
        .replace(/^##\s+PART\s*/i, '')
        .replace(/^[IVXLCDM]+\s*[—\-–]\s*/, '')
        .trim() || 'Untitled Part';

      currentPart = { id: generateULID(), title, chapters: [] };
      parts.push(currentPart);
      continue;
    }

    // ── Back matter detection (## Appendix) ───────────────────────
    if (plain.startsWith('## Appendix') || plain.startsWith('## APPENDIX')) {
      if (inFrontMatter) {
        inFrontMatter = false;
      }
      closeChapter();
      closePart();
      inBackMatter = true;

      // Flush any pending table first
      if (pendingTable !== null) {
        if (pendingTable.length >= 2) {
          backMatter.push(buildTableBlock(pendingTable));
        }
        pendingTable = null;
      }

      backMatter.push({
        type: 'heading',
        level: 2,
        text: plain.replace(/^##\s+/, '').trim(),
      });
      continue;
    }

    // ── Horizontal rules / separators (ignore) ────────────────────
    if (/^[-*_]{3,}$/.test(plain)) {
      continue;
    }

    // ── Empty lines ───────────────────────────────────────────────
    if (plain === '') {
      // Reset any "pendingWordTarget" assumption on blank lines
      if (inBackMatter && pendingTable !== null) {
        // Table finished by blank line
        if (pendingTable.length >= 2) {
          backMatter.push(buildTableBlock(pendingTable));
        }
        pendingTable = null;
      }
      continue;
    }

    // ── Front matter accumulation ────────────────────────────────
    if (inFrontMatter) {
      frontMatterLines.push(plain);
      continue;
    }

    // ── Back matter ──────────────────────────────────────────────
    if (inBackMatter) {
      if (plain.startsWith('|')) {
        if (pendingTable === null) {
          pendingTable = [];
        }
        pendingTable.push(plain);
      } else {
        // Flush pending table
        if (pendingTable !== null) {
          if (pendingTable.length >= 2) {
            backMatter.push(buildTableBlock(pendingTable));
          }
          pendingTable = null;
        }

        // Italic / emphasis lines → paragraph
        if (/^[*_]/.test(plain) && /[*_]$/.test(plain)) {
          const text = plain.replace(/^[*_]+/, '').replace(/[*_]+$/, '').trim();
          backMatter.push({ type: 'paragraph', text });
        } else if (plain.startsWith('## ')) {
          // Another heading in back matter
          backMatter.push({
            type: 'heading',
            level: 2,
            text: plain.replace(/^##\s+/, '').trim(),
          });
        } else if (plain.startsWith('- ')) {
          // List item in back matter
          backMatter.push({ type: 'list', ordered: false, items: [plain.slice(2).trim()] });
        } else {
          backMatter.push({ type: 'paragraph', text: plain });
        }
      }
      continue;
    }

    // ── Chapter detection ─────────────────────────────────────────
    const chapterMatch = plain.match(
      /^###\s*(Chapter\s+\d+|Epilogue)\s*[:—–-]?\s*(.+)$/,
    );
    if (chapterMatch) {
      closeChapter();

      const prefix = chapterMatch[1]!; // "Chapter N" or "Epilogue"
      const titlePart = chapterMatch[2]!.trim();
      const chapterId = generateULID();
      currentChapter = {
        chapterId,
        title: `${prefix}: ${titlePart}`,
        wordTarget: null,
        sections: [],
      };

      if (currentPart) {
        currentPart.chapters.push(currentChapter);
      } else if (prefix === 'Epilogue') {
        // Epilogue outside any part — save as standalone
        standaloneEpilogue = currentChapter;
      }
      continue;
    }

    // ── Word target (right after chapter title) ────────────────────
    if (currentChapter && plain.startsWith('**Target:')) {
      currentChapter.wordTarget = parseWordTarget(plain);
      continue;
    }

    // ── Section detection ─────────────────────────────────────────
    if (currentChapter) {
      // Match: #### N.M Title *(n words)*  OR  #### N.M Title
      const sectionMatch = plain.match(
        /^####\s+(\d+\.\d+)\s+(.+?)(?:\s+\*[\((]([\d,]+)\s*words[\))]\*)?$/,
      );
      if (sectionMatch) {
        currentSection = null;
        const sectionId = generateULID();
        const number = sectionMatch[1]!;
        const title = sectionMatch[2]!.trim();
        const wordTargetStr = sectionMatch[3];
        const wordTarget = wordTargetStr
          ? parseInt(wordTargetStr.replace(/,/g, ''), 10)
          : null;
        currentSection = {
          id: sectionId,
          number,
          title,
          wordTarget,
          beats: [],
        };
        currentChapter.sections.push(currentSection);
        continue;
      }
    }

    // ── Beat detection (under a section) ──────────────────────────
    if (currentSection && plain.startsWith('- ')) {
      currentSection.beats.push(plain.slice(2).trim());
      continue;
    }

    // ── Epilogue beats (directly under chapter, no section headers) ──
    if (currentChapter && !currentSection && plain.startsWith('- ')) {
      // Auto-create a synthetic section for epilogue-style chapters
      if (currentChapter.sections.length === 0) {
        currentSection = {
          id: generateULID(),
          number: '',
          title: '',
          wordTarget: null,
          beats: [],
        };
        currentChapter.sections.push(currentSection);
      }
      currentSection!.beats.push(plain.slice(2).trim());
      continue;
    }

    // ── Placeholder chapters: (description text in parentheses) ────
    if (currentChapter && /^\(.+\)$/.test(plain)) {
      // Chapter is a placeholder — just skip it (section list stays empty)
      continue;
    }

    // ── Any other line in structured area (ignore) ─────────────────
    // This catches stray content, e.g. separator descriptions.
  }

  // ── Flush pending table ─────────────────────────────────────────────
  if (pendingTable !== null && pendingTable.length >= 2) {
    backMatter.push(buildTableBlock(pendingTable));
  }

  // ── Convert front-matter lines to RichBlocks ────────────────────────
  const frontMatter = linesToParagraphBlocks(frontMatterLines);

  // ── Handle standalone epilogue → virtual part ────────────────────────
  if (standaloneEpilogue) {
    const epiloguePart: ParsedPart = {
      id: generateULID(),
      title: 'Epilogue',
      chapters: [standaloneEpilogue],
    };
    parts.push(epiloguePart);
  }

  // ── Build the Outline ────────────────────────────────────────────────
  const outline: Outline = {
    schemaVersion: 1,
    frontMatter,
    parts: parts.map((part) => ({
      id: part.id,
      title: part.title,
      chapters: part.chapters.map((ch) => ({
        chapterId: ch.chapterId,
        title: ch.title,
        wordTarget: ch.wordTarget,
        sections: ch.sections,
      })),
    })),
    backMatter,
  };

  // Validate against OutlineSchema
  const validation = OutlineSchema.safeParse(outline);
  if (!validation.success) {
    const details = validation.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Outline schema validation failed: ${details}`);
  }

  // ── Build structure ─────────────────────────────────────────────────
  const standaloneId = standaloneEpilogue?.chapterId ?? null;
  const structure = buildStructure(parts, standaloneId);

  return {
    projectTitle,
    frontMatter,
    parts,
    backMatter,
    outline,
    structure,
  };
}
