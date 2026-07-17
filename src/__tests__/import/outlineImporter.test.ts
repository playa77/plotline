/**
 * Tests for the markdown outline importer (v0.2.0 — LLM-based).
 *
 * Two testing strategies:
 *   a. `buildOutlineAndStructure` unit tests — construct mock LLMParsedOutline
 *      inputs and verify correct ParsePreview assembly (ULID generation,
 *      RichBlock conversion, structure building, edge cases).
 *   b. `parseOutlineMarkdown` integration tests — mock globalThis.fetch to
 *      provide known LLM responses and verify the full end-to-end pipeline.
 *
 * Version: 0.2.0 | 2026-07-17
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseOutlineMarkdown,
  buildOutlineAndStructure,
  type LLMParsedOutline,
} from '../../main/services/outlineImporter';
import type { RichBlock } from '../../shared/schemas/outline';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a minimal valid LLMParsedOutline for testing. */
function minimalOutline(overrides?: Partial<LLMParsedOutline>): LLMParsedOutline {
  return {
    projectTitle: 'Test Book',
    frontMatterText: [],
    backMatterText: [],
    parts: [],
    ...overrides,
  };
}

/** Extract all section IDs from a ParsePreview for structural assertion. */
function allSectionIds(preview: ReturnType<typeof buildOutlineAndStructure>): string[] {
  return preview.parts.flatMap((p) =>
    p.chapters.flatMap((ch) => ch.sections.map((s) => s.id)),
  );
}

// ── Suite: buildOutlineAndStructure ──────────────────────────────────────────

describe('buildOutlineAndStructure (pure assembly)', () => {
  // ── 1. Empty outline ─────────────────────────────────────────────────────
  it('handles an empty outline (no parts, no front/back matter)', () => {
    const input = minimalOutline();
    const result = buildOutlineAndStructure(input);

    expect(result.projectTitle).toBe('Test Book');
    expect(result.parts).toHaveLength(0);
    expect(result.frontMatter).toHaveLength(0);
    expect(result.backMatter).toHaveLength(0);
    expect(result.structure).toHaveLength(0);
    expect(result.outline.schemaVersion).toBe(1);
  });

  // ── 2. Parts and chapters ─────────────────────────────────────────────────
  it('builds parts and chapters with generated ULIDs', () => {
    const input = minimalOutline({
      parts: [
        {
          title: 'ONE: The Fire That Carries Us',
          chapters: [
            {
              title: 'Chapter 1: The Last Shore',
              wordTargetMin: 7000,
              wordTargetMax: 8000,
              sections: [
                {
                  number: '1.1',
                  title: 'The Myth of Fortress Singapore',
                  wordTarget: 1200,
                  beats: ['British propaganda about impregnability'],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = buildOutlineAndStructure(input);

    // Project title
    expect(result.projectTitle).toBe('Test Book');

    // Part count
    expect(result.parts).toHaveLength(1);
    expect(result.structure).toHaveLength(1);

    // Part
    const part = result.parts[0]!;
    expect(part.title).toBe('ONE: The Fire That Carries Us');
    expect(part.id).toBeTruthy();
    expect(part.id.length).toBeGreaterThan(10); // ULID

    // Chapter
    expect(part.chapters).toHaveLength(1);
    const ch = part.chapters[0]!;
    expect(ch.title).toBe('Chapter 1: The Last Shore');
    expect(ch.chapterId).toBeTruthy();
    expect(ch.chapterId.length).toBeGreaterThan(10);
    expect(ch.wordTarget).toEqual({ min: 7000, max: 8000 });

    // Section
    expect(ch.sections).toHaveLength(1);
    const sec = ch.sections[0]!;
    expect(sec.number).toBe('1.1');
    expect(sec.title).toBe('The Myth of Fortress Singapore');
    expect(sec.wordTarget).toBe(1200);
    expect(sec.beats).toEqual(['British propaganda about impregnability']);
    expect(sec.id).toBeTruthy();
    expect(sec.id.length).toBeGreaterThan(10);

    // Structure item (part kind)
    const struct = result.structure[0]!;
    expect(struct.kind).toBe('part');
    if (struct.kind === 'part') {
      expect(struct.title).toBe('ONE: The Fire That Carries Us');
      expect(struct.chapters).toHaveLength(1);
      expect(struct.chapters[0]!.id).toBe(ch.chapterId);
    }
  });

  // ── 3. Outline validates ─────────────────────────────────────────────────
  it('produces an outline that passes OutlineSchema validation', () => {
    const input = minimalOutline({
      parts: [
        {
          title: 'Part I',
          chapters: [
            {
              title: 'Chapter 1: Start',
              wordTargetMin: null,
              wordTargetMax: null,
              sections: [],
            },
          ],
        },
      ],
    });

    const result = buildOutlineAndStructure(input);
    const { outline } = result;

    expect(outline.schemaVersion).toBe(1);
    for (const part of outline.parts) {
      expect(part.id).toBeTruthy();
      expect(part.title).toBeTruthy();
      for (const ch of part.chapters) {
        expect(ch.chapterId).toBeTruthy();
        expect(ch.title).toBeTruthy();
        expect(Array.isArray(ch.sections)).toBe(true);
      }
    }
  });

  // ── 4. Front matter conversion ────────────────────────────────────────────
  it('converts frontMatterText lines into RichBlock paragraphs', () => {
    const input = minimalOutline({
      frontMatterText: [
        "Author's Note",
        '',
        'This book is a work of historical fiction.',
      ],
    });

    const result = buildOutlineAndStructure(input);

    expect(result.frontMatter).toHaveLength(2);
    const block0 = result.frontMatter[0]!;
    expect(block0.type).toBe('paragraph');
    if (block0.type === 'paragraph') {
      expect(block0.text).toBe("Author's Note");
    }
    const block1 = result.frontMatter[1]!;
    expect(block1.type).toBe('paragraph');
    if (block1.type === 'paragraph') {
      expect(block1.text).toBe('This book is a work of historical fiction.');
    }
  });

  // ── 5. Back matter conversion ─────────────────────────────────────────────
  it('converts backMatterText lines into RichBlock paragraphs', () => {
    const input = minimalOutline({
      backMatterText: [
        '## Appendix A: Timeline',
        '',
        '1942 - Fall of Singapore',
      ],
    });

    const result = buildOutlineAndStructure(input);

    expect(result.backMatter.length).toBeGreaterThan(0);
    // Back matter is passed as-is through linesToParagraphBlocks
    const block0 = result.backMatter[0]!;
    expect(block0.type).toBe('paragraph');
  });

  // ── 6. Epilogue standalone → unwrapped in structure ───────────────────────
  it('unwraps a standalone Epilogue part in the structure', () => {
    const input = minimalOutline({
      parts: [
        {
          title: 'ONE: Beginning',
          chapters: [
            {
              title: 'Chapter 1: Start',
              sections: [],
            },
          ],
        },
        {
          title: 'Epilogue',
          chapters: [
            {
              title: 'Epilogue: The End',
              wordTargetMin: 3000,
              wordTargetMax: 4000,
              sections: [
                {
                  number: '',
                  title: '',
                  beats: ['Final reflection'],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = buildOutlineAndStructure(input);

    // Structure should have 2 items: part + unwrapped chapter
    expect(result.structure).toHaveLength(2);

    // First item: part
    expect(result.structure[0]!.kind).toBe('part');

    // Second item: unwrapped chapter (not a part)
    const epilogueItem = result.structure[1]!;
    expect(epilogueItem.kind).toBe('chapter');
    if (epilogueItem.kind === 'chapter') {
      expect(epilogueItem.title).toBe('Epilogue: The End');
      expect(epilogueItem.wordTarget).toEqual({ min: 3000, max: 4000 });
    }

    // Outline should still have the Epilogue part (not flattened)
    const outlineParts = result.outline.parts;
    expect(outlineParts).toHaveLength(2);
    expect(outlineParts[1]!.title).toBe('Epilogue');
  });

  // ── 7. No word targets ────────────────────────────────────────────────────
  it('handles null word targets for chapters and sections', () => {
    const input = minimalOutline({
      parts: [
        {
          title: 'Part I',
          chapters: [
            {
              title: 'Chapter 1: Intro',
              sections: [
                {
                  number: '1.1',
                  title: 'Section One',
                  beats: [],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = buildOutlineAndStructure(input);

    const ch = result.parts[0]!.chapters[0]!;
    expect(ch.wordTarget).toBeNull();

    const sec = ch.sections[0]!;
    expect(sec.wordTarget).toBeNull();
  });

  // ── 8. Empty project title ────────────────────────────────────────────────
  it('defaults to empty string when projectTitle is missing', () => {
    const input = minimalOutline({ projectTitle: '' });
    const result = buildOutlineAndStructure(input);
    expect(result.projectTitle).toBe('');
  });

  // ── 9. Multiple parts and chapters generate unique ULIDs ─────────────────
  it('generates unique ULIDs for every structural node', () => {
    const input = minimalOutline({
      parts: [
        {
          title: 'Part I',
          chapters: [
            {
              title: 'Ch 1',
              sections: [
                { number: '1.1', title: 'S1', beats: ['beat1'] },
                { number: '1.2', title: 'S2', beats: [] },
              ],
            },
            {
              title: 'Ch 2',
              sections: [{ number: '2.1', title: 'S3', beats: [] }],
            },
          ],
        },
        {
          title: 'Part II',
          chapters: [
            {
              title: 'Ch 3',
              sections: [],
            },
          ],
        },
      ],
    });

    const result = buildOutlineAndStructure(input);

    // Collect all IDs
    const partIds = result.parts.map((p) => p.id);
    const chapterIds = result.parts.flatMap((p) => p.chapters.map((c) => c.chapterId));
    const sectionIds = allSectionIds(result);

    const allIds = [...partIds, ...chapterIds, ...sectionIds];
    expect(new Set(allIds).size).toBe(allIds.length); // all unique
  });
});

// ── Suite: parseOutlineMarkdown (mocked fetch) ───────────────────────────────

describe('parseOutlineMarkdown (mocked LLM)', () => {
  const mockApiKey = 'sk-test-key-12345';

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── 10. Successful parse ──────────────────────────────────────────────────
  it('parses a known LLM response into a valid ParsePreview', async () => {
    const llmResponse = {
      projectTitle: 'Tether',
      frontMatterText: ['A generation-ship story.'],
      backMatterText: [],
      parts: [
        {
          title: 'ONE: The Fire That Carries Us',
          chapters: [
            {
              title: 'Chapter 1: The Last Shore',
              wordTargetMin: null,
              wordTargetMax: null,
              sections: [
                {
                  number: '1.1',
                  title: 'Departure',
                  wordTarget: null,
                  beats: ['Ship leaves Earth'],
                },
              ],
            },
          ],
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(llmResponse),
            },
          },
        ],
      }),
    } as unknown as Response);

    const markdown = '# Tether\n\n## PART ONE: The Fire That Carries Us\n...';
    const result = await parseOutlineMarkdown(markdown, mockApiKey);

    expect(result.projectTitle).toBe('Tether');
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]!.title).toBe('ONE: The Fire That Carries Us');
    expect(result.parts[0]!.chapters).toHaveLength(1);
    expect(result.parts[0]!.chapters[0]!.title).toBe('Chapter 1: The Last Shore');

    // Front matter should be converted
    expect(result.frontMatter).toHaveLength(1);
    const fm = result.frontMatter[0] as RichBlock;
    expect(fm.type).toBe('paragraph');
    if (fm.type === 'paragraph') {
      expect(fm.text).toContain('generation-ship');
    }
  });

  // ── 11. Missing API key ───────────────────────────────────────────────────
  it('throws when API key is empty', async () => {
    await expect(
      parseOutlineMarkdown('# test', ''),
    ).rejects.toThrow('API key required for outline import');
  });

  // ── 12. HTTP error from API ───────────────────────────────────────────────
  it('throws descriptive error on HTTP 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { message: 'Invalid API key' },
      }),
    } as unknown as Response);

    await expect(
      parseOutlineMarkdown('# test', 'bad-key'),
    ).rejects.toThrow('LLM API error (401)');
  });

  it('throws descriptive error on HTTP 500 with no body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
      json: async () => { throw new Error('not json'); },
    } as unknown as Response);

    await expect(
      parseOutlineMarkdown('# test', mockApiKey),
    ).rejects.toThrow('LLM API error (500)');
  });

  // ── 13. Empty/malformed LLM response ─────────────────────────────────────
  it('throws when LLM response has no choices', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    } as unknown as Response);

    await expect(
      parseOutlineMarkdown('# test', mockApiKey),
    ).rejects.toThrow('LLM response was empty or could not be parsed as JSON');
  });

  it('throws when LLM response content is not valid JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'not-json-at-all' } }],
      }),
    } as unknown as Response);

    await expect(
      parseOutlineMarkdown('# test', mockApiKey),
    ).rejects.toThrow('LLM response was empty or could not be parsed as JSON');
  });

  // ── 14. Missing parts array ───────────────────────────────────────────────
  it('throws when LLM response lacks parts array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ projectTitle: 'X' }) } }],
      }),
    } as unknown as Response);

    await expect(
      parseOutlineMarkdown('# test', mockApiKey),
    ).rejects.toThrow('missing required "parts" array');
  });

  // ── 15. Custom baseUrl ────────────────────────────────────────────────────
  it('uses custom baseUrl when provided', async () => {
    let capturedUrl = '';

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, _opts: unknown) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(minimalOutline()) } }],
        }),
      };
    });

    await parseOutlineMarkdown('# test', mockApiKey, 'https://custom.api/v1');
    expect(capturedUrl).toContain('custom.api');
  });

  // ── 16. Network failure ───────────────────────────────────────────────────
  it('throws on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      parseOutlineMarkdown('# test', mockApiKey),
    ).rejects.toThrow('Failed to reach LLM API');
  });
});
