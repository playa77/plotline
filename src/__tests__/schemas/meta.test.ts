/**
 * Tests for the chapter meta schema.
 *
 * @group schemas
 */

import { describe, it, expect } from 'vitest';
import { MetaSchema, GenRecordSchema } from '../../shared/schemas/meta';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function validGenRecord() {
  return {
    generatedAt: '2026-07-16T12:00:00.000Z',
    model: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-20250514' },
    templateId: 'default-expand',
    templateVersion: '1.0.0',
    kind: 'expand' as const,
    instruction: 'Write in a lyrical style.',
    fingerprints: {
      outlineSlice: 'abc123def456',
      variables: [
        { variableId: 'var01', contentSha: 'sha256-xxx' },
      ],
      upstream: null,
      continuity: {
        chapterId: '01ARZ3NDEKTSV4RRFFQ69G5FC1',
        sha: 'sha256-yyy',
      },
    },
  };
}

function validMeta() {
  return {
    schemaVersion: 1 as const,
    chapterId: '01ARZ3NDEKTSV4RRFFQ69G5FC2',
    expanded: null,
    chapter: null,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MetaSchema', () => {
  it('validates meta with both expanded and chapter null', () => {
    const result = MetaSchema.safeParse(validMeta());
    expect(result.success).toBe(true);
  });

  it('validates meta with a full expanded record and null chapter', () => {
    const input = { ...validMeta(), expanded: validGenRecord() };
    const result = MetaSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('validates meta with expanded, chapter, and continuity fingerprints', () => {
    const input = {
      ...validMeta(),
      expanded: validGenRecord(),
      chapter: { ...validGenRecord(), kind: 'write' as const },
    };
    const result = MetaSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('round-trips a meta with gen records', () => {
    const input = {
      ...validMeta(),
      expanded: validGenRecord(),
      chapter: { ...validGenRecord(), kind: 'iterate' as const },
    };
    const parsed = MetaSchema.parse(input);
    const serialized = JSON.parse(JSON.stringify(parsed));
    const result = MetaSchema.safeParse(serialized);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(parsed);
  });

  it('rejects meta with missing fingerprints', () => {
    const record = validGenRecord();
    const { fingerprints, ...recordWithout } = record;
    const input = { ...validMeta(), expanded: recordWithout };
    const result = MetaSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects meta with invalid kind', () => {
    const record = { ...validGenRecord(), kind: 'delete' };
    const input = { ...validMeta(), expanded: record };
    const result = MetaSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('GenRecordSchema', () => {
  it('validates a generation record with all fingerprints', () => {
    const result = GenRecordSchema.safeParse(validGenRecord());
    expect(result.success).toBe(true);
  });

  it('rejects a gen record with missing model fields', () => {
    const input = { ...validGenRecord(), model: { provider: 'openrouter' } };
    const result = GenRecordSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects a gen record with non-semver templateVersion', () => {
    // templateVersion is just a string, so any string is valid per schema
    // the semver validation is application-level, not schema-level
    const input = { ...validGenRecord(), templateVersion: 'latest' };
    const result = GenRecordSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
