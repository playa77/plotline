/**
 * Tests for the outline schema.
 *
 * @group schemas
 */

import { describe, it, expect } from 'vitest';
import { OutlineSchema, RichBlockSchema, OutlineChapterSchema } from '../../shared/schemas/outline';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function validMinimalOutline() {
  return {
    schemaVersion: 1 as const,
    frontMatter: [],
    parts: [],
    backMatter: [],
  };
}

function fullOutline() {
  return {
    schemaVersion: 1 as const,
    frontMatter: [
      { type: 'paragraph' as const, text: 'A note from the author...' },
      { type: 'heading' as const, level: 2, text: 'Dedication' },
      { type: 'list' as const, ordered: false, items: ['Item 1', 'Item 2'] },
      {
        type: 'table' as const,
        headers: ['Name', 'Role'],
        rows: [['Alice', 'Hero'], ['Bob', 'Villain']],
      },
    ],
    parts: [
      {
        id: '01ARZ3NDEKTSV4RRFFQ69G5FA1',
        title: 'Act I',
        chapters: [
          {
            chapterId: '01ARZ3NDEKTSV4RRFFQ69G5FA2',
            title: 'The Beginning',
            wordTarget: { min: 7000, max: 8000 },
            sections: [
              {
                id: '01ARZ3NDEKTSV4RRFFQ69G5FA3',
                number: '1.1',
                title: 'First Light',
                wordTarget: 2000,
                beats: ['Introduce setting', 'Establish mood'],
              },
              {
                id: '01ARZ3NDEKTSV4RRFFQ69G5FA4',
                number: '1.2',
                title: 'The Call',
                wordTarget: 1500,
                beats: ['Inciting incident'],
              },
            ],
          },
        ],
      },
    ],
    backMatter: [
      { type: 'paragraph' as const, text: 'About the author' },
    ],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OutlineSchema', () => {
  it('validates an empty outline', () => {
    const result = OutlineSchema.safeParse(validMinimalOutline());
    expect(result.success).toBe(true);
  });

  it('round-trips a full outline with parts, chapters, sections', () => {
    const input = fullOutline();
    const parsed = OutlineSchema.parse(input);
    const serialized = JSON.parse(JSON.stringify(parsed));
    const result = OutlineSchema.safeParse(serialized);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(parsed);
  });

  it('rejects an outline with an invalid schemaVersion', () => {
    const input = { ...validMinimalOutline(), schemaVersion: 2 };
    const result = OutlineSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('RichBlockSchema', () => {
  it('validates a paragraph block', () => {
    const result = RichBlockSchema.safeParse({ type: 'paragraph', text: 'Hello' });
    expect(result.success).toBe(true);
  });

  it('validates a heading block (level 2–4)', () => {
    expect(RichBlockSchema.safeParse({ type: 'heading', level: 2, text: 'H2' }).success).toBe(true);
    expect(RichBlockSchema.safeParse({ type: 'heading', level: 3, text: 'H3' }).success).toBe(true);
    expect(RichBlockSchema.safeParse({ type: 'heading', level: 4, text: 'H4' }).success).toBe(true);
  });

  it('rejects a heading with level 1', () => {
    const result = RichBlockSchema.safeParse({ type: 'heading', level: 1, text: 'H1' });
    expect(result.success).toBe(false);
  });

  it('validates a list block', () => {
    const result = RichBlockSchema.safeParse({ type: 'list', ordered: true, items: ['a', 'b'] });
    expect(result.success).toBe(true);
  });

  it('validates a table block', () => {
    const result = RichBlockSchema.safeParse({
      type: 'table',
      headers: ['A', 'B'],
      rows: [['1', '2']],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown block type', () => {
    const result = RichBlockSchema.safeParse({ type: 'unknown', text: '?' });
    expect(result.success).toBe(false);
  });
});

describe('OutlineChapterSchema', () => {
  it('validates word target parsing: { min: 7000, max: 8000 }', () => {
    const input = {
      chapterId: '01ARZ3NDEKTSV4RRFFQ69G5FA2',
      title: 'Test',
      wordTarget: { min: 7000, max: 8000 },
      sections: [],
    };
    const result = OutlineChapterSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('allows null wordTarget', () => {
    const input = {
      chapterId: '01ARZ3NDEKTSV4RRFFQ69G5FA2',
      title: 'Test',
      wordTarget: null,
      sections: [],
    };
    const result = OutlineChapterSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
