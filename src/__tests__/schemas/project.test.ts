/**
 * Tests for the project manifest schema.
 *
 * @group schemas
 */

import { describe, it, expect } from 'vitest';
import { ProjectSchema, ChapterEntrySchema } from '../../shared/schemas/project';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function validMinimalProject() {
  return {
    schemaVersion: 2 as const,
    projectId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    title: 'My Novel',
    createdAt: '2026-07-16T10:00:00.000Z',
    updatedAt: '2026-07-16T12:30:00.000Z',
    settings: {
      continuityContext: { enabled: true, words: 500 },
      models: {
        expand: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-20250514' },
        write: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-20250514' },
        iterate: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-20250514' },
      },
      inference: { baseUrl: 'https://openrouter.ai/api/v1' },
    },
    structure: [],
  };
}

function projectWithPartAndChapter() {
  return {
    ...validMinimalProject(),
    structure: [
      {
        kind: 'part',
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
        title: 'Part One',
        chapters: [
          {
            id: '01ARZ3NDEKTSV4RRFFQ69G5FAX',
            title: 'Chapter 1',
            selectedVersion: 'main',
            versions: [
              {
                slug: 'main',
                name: 'Main',
                createdAt: '2026-07-16T11:00:00.000Z',
                createdFrom: null,
                archived: false,
              },
            ],
            wordTarget: { min: 3000, max: 5000 },
          },
        ],
      },
      {
        kind: 'chapter',
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAY',
        title: 'Chapter 2',
        selectedVersion: 'main',
        versions: [],
        wordTarget: null,
      },
    ],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProjectSchema', () => {
  it('validates a minimal project with empty structure', () => {
    const result = ProjectSchema.safeParse(validMinimalProject());
    expect(result.success).toBe(true);
  });

  it('round-trips: parse → serialize → parse matches original', () => {
    const input = validMinimalProject();
    const parsed = ProjectSchema.parse(input);
    const serialized = JSON.parse(JSON.stringify(parsed));
    const result = ProjectSchema.safeParse(serialized);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(parsed);
  });

  it('rejects a project with missing title', () => {
    const input = { ...validMinimalProject(), title: undefined };
    const result = ProjectSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects a project with wrong schemaVersion', () => {
    const input = { ...validMinimalProject(), schemaVersion: 1 };
    const result = ProjectSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects a project with an invalid inference URL', () => {
    const input = {
      ...validMinimalProject(),
      settings: { ...validMinimalProject().settings, inference: { baseUrl: 'not-a-url' } },
    };
    const result = ProjectSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('validates a project with a part containing a chapter and a standalone chapter', () => {
    const input = projectWithPartAndChapter();
    const result = ProjectSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects structure items without a kind field', () => {
    const input = {
      ...validMinimalProject(),
      structure: [{ id: '01ARZ3NDEKTSV4RRFFQ69G5FAW', title: 'Orphan' }],
    };
    const result = ProjectSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('ChapterEntrySchema', () => {
  it('defaults selectedVersion to "main"', () => {
    const input = {
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAX',
      title: 'Chapter 1',
      versions: [],
      wordTarget: null,
    };
    const parsed = ChapterEntrySchema.parse(input);
    expect(parsed.selectedVersion).toBe('main');
  });

  it('defaults version archived to false', () => {
    const input = {
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAX',
      title: 'Chapter 1',
      selectedVersion: 'main',
      versions: [
        {
          slug: 'main',
          name: 'Main',
          createdAt: '2026-07-16T11:00:00.000Z',
          createdFrom: null,
        },
      ],
      wordTarget: null,
    };
    const parsed = ChapterEntrySchema.parse(input);
    expect(parsed.versions[0]?.archived).toBe(false);
  });
});
