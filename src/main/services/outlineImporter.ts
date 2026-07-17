/**
 * Markdown outline importer — converts a reference outline into Plotline's
 * structured outline.json format via LLM-based parsing.
 *
 * Part A: buildOutlineAndStructure — pure assembly from LLM-parsed data.
 * Part B: parseOutlineMarkdown — async LLM-based parsing via OpenRouter.
 *
 * The regex-based state machine was replaced with an LLM approach in v0.2.0.
 * The assembly logic (ULID generation, RichBlock conversion, schema validation)
 * remains as a pure function for testability.
 *
 * Version: 0.2.0 | 2026-07-17
 */

import { generateULID } from '../../shared/utils/ulid';
import type { RichBlock, Outline, ParsedPart, ParsedChapter, ParsedSection, ParsePreview } from '../../shared/schemas/outline';
import type { ChapterEntry, StructureItem } from '../../shared/schemas/project';
import { OutlineSchema } from '../../shared/schemas/outline';

// ── LLM-parsed data interfaces ──────────────────────────────────────────────

/**
 * Raw outline data as returned by the LLM.
 * All IDs are absent — they are generated during assembly.
 */
export interface LLMParsedOutline {
  projectTitle: string;
  frontMatterText: string[];
  backMatterText: string[];
  parts: LLMParsedPart[];
}

export interface LLMParsedPart {
  title: string;
  chapters: LLMParsedChapter[];
}

export interface LLMParsedChapter {
  title: string;
  wordTargetMin?: number | null;
  wordTargetMax?: number | null;
  sections: LLMParsedSection[];
}

export interface LLMParsedSection {
  number: string;
  title: string;
  wordTarget?: number | null;
  beats: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert accumulated plain-text lines into RichBlock paragraphs.
 * Each block of text separated by blank lines becomes one paragraph.
 */
function linesToParagraphBlocks(lines: string[]): RichBlock[] {
  const blocks: RichBlock[] = [];
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

// ── Part A: Pure assembly ────────────────────────────────────────────────────

/**
 * Build the project-manifest structure array from parsed parts.
 *
 * Real parts are emitted as `{ kind: 'part', ... }` items.
 * A virtual "Epilogue" part (title === 'Epilogue', exactly one chapter)
 * is unwrapped into a `{ kind: 'chapter', ... }` item so the outline
 * tree stays flat for single-chapter appendices.
 */
function buildStructure(parts: ParsedPart[]): StructureItem[] {
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
      part.title === 'Epilogue' &&
      part.chapters.length === 1
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

/**
 * Assemble an LLM-parsed outline into a fully-formed ParsePreview.
 *
 * 1. Converts frontMatterText / backMatterText → RichBlock[]
 * 2. Generates ULIDs for every part, chapter, and section
 * 3. Combines wordTargetMin/Max into the canonical `{ min, max } | null` format
 * 4. Builds the `Outline` object (preserving virtual epilogue parts)
 * 5. Validates against `OutlineSchema`
 * 6. Builds `StructureItem[]` (unwrapping virtual epilogue)
 * 7. Returns the complete `ParsePreview`
 *
 * Edge cases handled:
 *   - Empty front/back matter → empty RichBlock arrays
 *   - Part title 'Epilogue' with one chapter → unwrapped in structure
 *   - Missing/null word targets → null
 */
export function buildOutlineAndStructure(parsed: LLMParsedOutline): ParsePreview {
  // 1. Convert front/back matter text lines to RichBlocks
  const frontMatter = linesToParagraphBlocks(parsed.frontMatterText ?? []);
  const backMatter = linesToParagraphBlocks(parsed.backMatterText ?? []);

  // 2–3. Build parts with generated ULIDs and combined word targets
  const parts: ParsedPart[] = parsed.parts.map((llmPart) => ({
    id: generateULID(),
    title: llmPart.title || 'Untitled Part',
    chapters: llmPart.chapters.map((llmCh) => ({
      chapterId: generateULID(),
      title: llmCh.title,
      wordTarget:
        llmCh.wordTargetMin != null && llmCh.wordTargetMax != null
          ? { min: llmCh.wordTargetMin, max: llmCh.wordTargetMax }
          : null,
      sections: llmCh.sections.map((llmSec) => ({
        id: generateULID(),
        number: llmSec.number || '',
        title: llmSec.title || '',
        wordTarget: llmSec.wordTarget ?? null,
        beats: llmSec.beats ?? [],
      })),
    })),
  }));

  // 4. Build the Outline object (preserves virtual epilogue parts in data)
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

  // 5. Validate against OutlineSchema
  const validation = OutlineSchema.safeParse(outline);
  if (!validation.success) {
    const details = validation.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Outline schema validation failed: ${details}`);
  }

  // 6. Build structure (unwraps virtual epilogue)
  const structure = buildStructure(parts);

  // 7. Return the complete preview
  return {
    projectTitle: parsed.projectTitle || '',
    frontMatter,
    parts,
    backMatter,
    outline,
    structure,
  };
}

// ── Part B: Async LLM-based parsing ──────────────────────────────────────────

/**
 * System prompt that instructs the LLM how to parse a book outline markdown
 * into the expected structured JSON format.
 */
const SYSTEM_PROMPT = `You are a book outline parser. Your task is to read a markdown book outline and extract its structural elements as JSON. Be thorough and detect ALL parts, chapters, sections, and beats present in the text.

Return a JSON object with this exact structure:
{
  "projectTitle": "string — the book title from the first # heading, or empty string if none",
  "frontMatterText": ["array of strings — every line of content before the first ## PART heading, preserved exactly as-is"],
  "backMatterText": ["array of strings — every line after the last chapter/section, including appendix headings, tables, notes, exactly as-is"],
  "parts": [
    {
      "title": "string — the part title, without the '## PART ' prefix, without Roman numeral prefix like 'I —'. E.g. 'ONE: The Fire That Carries Us' not '## PART ONE: The Fire That Carries Us'",
      "chapters": [
        {
          "title": "string — the chapter title without '### ' prefix. E.g. 'Chapter 1: The Last Shore' or 'Chapter 1 — The Last Shore'",
          "wordTargetMin": number or null,
          "wordTargetMax": number or null,
          "sections": [
            {
              "number": "string — section number like '1.1', '1.2', or empty string for unnumbered",
              "title": "string — section title without '#### ' prefix",
              "wordTarget": number or null,
              "beats": ["array of strings — bullet point beats under the section, without the '- ' prefix"]
            }
          ]
        }
      ]
    }
  ]
}

RULES:
- Detect parts ONLY from lines starting with '## PART' (case-insensitive). A part may appear as '## PART ONE', '## PART I —', '## PART 1:' etc.
- Detect chapters from lines starting with '### Chapter' or '### Epilogue'. Separators after 'Chapter N' can be ':', '—', '–', '-', or nothing. 
- Detect sections from '#### N.M Title' patterns or any subheading under a chapter (h4 level).
- Detect beats from bullet points ('- ') under a section.
- Detect word targets from patterns like '**Target: 7000-8000**', '**Length:** 7000-8000', '*(7,000 words)*', etc. For chapter-level targets, set both wordTargetMin and wordTargetMax. For section-level, use single wordTarget.
- If a chapter has no sections but has bullet points directly under it, create one section with empty number and title containing those bullets as beats.
- An Epilogue outside any part should still be included — create it as a standalone part with title "Epilogue".
- Do NOT fabricate chapters, sections, or beats that aren't in the text. 
- Do NOT include the markdown headers (###, ####, ##) in titles.
- Preserve the original text exactly — do not paraphrase or modify titles.`;

/**
 * Parse a structured book-outline markdown file using an LLM via OpenRouter.
 *
 * Sends the markdown to deepseek/deepseek-v4-flash with a structured parsing
 * prompt, then validates and assembles the result into a ParsePreview.
 *
 * @param markdown - Raw markdown content of the book outline
 * @param apiKey   - OpenRouter API key for authentication
 * @param baseUrl  - Optional custom OpenRouter-compatible base URL
 * @returns A fully populated ParsePreview
 * @throws If the API key is missing, the LLM call fails, or parsing fails
 */
export async function parseOutlineMarkdown(
  markdown: string,
  apiKey: string,
  baseUrl?: string,
  /** Model override (defaults to deepseek/deepseek-v4-flash). */
  model?: string,
): Promise<ParsePreview> {
  if (!apiKey) {
    throw new Error(
      'API key required for outline import. Set your OpenRouter API key in Settings.',
    );
  }

  const url = `${baseUrl || 'https://openrouter.ai/api/v1'}/chat/completions`;

  // ── Call the LLM API ────────────────────────────────────────────────────
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek/deepseek-v4-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: markdown },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
    });
  } catch (err) {
    throw new Error(
      `Failed to reach LLM API: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── Handle HTTP errors ─────────────────────────────────────────────────
  if (!response.ok) {
    let errorBody = '';
    try {
      const errJson = (await response.json()) as { error?: { message?: string } };
      errorBody = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      errorBody = await response.text().catch(() => '(no body)');
    }
    throw new Error(`LLM API error (${response.status}): ${errorBody}`);
  }

  // ── Parse the response envelope ────────────────────────────────────────
  let responseData: { choices?: Array<{ message?: { content?: string } }> };
  try {
    responseData = (await response.json()) as typeof responseData;
  } catch (err) {
    throw new Error(
      `Failed to parse LLM API response as JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const content = responseData?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('LLM response was empty or could not be parsed as JSON');
  }

  // ── Parse the inner JSON payload ───────────────────────────────────────
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `LLM response was empty or could not be parsed as JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── Structural validation ──────────────────────────────────────────────
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM response JSON is not an object');
  }
  if (!Array.isArray(parsed.parts)) {
    throw new Error('LLM response missing required "parts" array');
  }

  for (let i = 0; i < parsed.parts.length; i++) {
    const part = parsed.parts[i] as Record<string, unknown> | undefined;
    if (!part || typeof part !== 'object') {
      throw new Error(`LLM response part[${i}] is not an object`);
    }
    if (!Array.isArray(part.chapters)) {
      throw new Error(`LLM response part[${i}] missing required "chapters" array`);
    }
    for (let j = 0; j < part.chapters.length; j++) {
      const ch = (part.chapters as Array<Record<string, unknown>>)[j]!;
      if (!ch || typeof ch !== 'object') {
        throw new Error(`LLM response part[${i}].chapters[${j}] is not an object`);
      }
      if (!Array.isArray(ch.sections)) {
        throw new Error(
          `LLM response part[${i}].chapters[${j}] missing required "sections" array`,
        );
      }
    }
  }

  // ── Build the typed LLMParsedOutline ───────────────────────────────────
  const llmParsed: LLMParsedOutline = {
    projectTitle:
      typeof parsed.projectTitle === 'string' ? parsed.projectTitle : '',
    frontMatterText: Array.isArray(parsed.frontMatterText)
      ? (parsed.frontMatterText as unknown[]).map(String)
      : [],
    backMatterText: Array.isArray(parsed.backMatterText)
      ? (parsed.backMatterText as unknown[]).map(String)
      : [],
    parts: (parsed.parts as unknown[]).map((part: unknown) => {
      const p = part as Record<string, unknown>;
      return {
        title: typeof p.title === 'string' ? p.title : '',
        chapters: ((p.chapters as unknown[]) || []).map((ch: unknown) => {
          const c = ch as Record<string, unknown>;
          return {
            title: typeof c.title === 'string' ? c.title : '',
            wordTargetMin:
              c.wordTargetMin != null ? Number(c.wordTargetMin) : null,
            wordTargetMax:
              c.wordTargetMax != null ? Number(c.wordTargetMax) : null,
            sections: ((c.sections as unknown[]) || []).map((sec: unknown) => {
              const s = sec as Record<string, unknown>;
              return {
                number: typeof s.number === 'string' ? s.number : '',
                title: typeof s.title === 'string' ? s.title : '',
                wordTarget: s.wordTarget != null ? Number(s.wordTarget) : null,
                beats: Array.isArray(s.beats)
                  ? (s.beats as unknown[]).map(String)
                  : [],
              };
            }),
          };
        }),
      };
    }),
  };

  // ── Assemble and return ─────────────────────────────────────────────────
  return buildOutlineAndStructure(llmParsed);
}
