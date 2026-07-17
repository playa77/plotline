/**
 * Tests for the StoryVariableSchema.
 *
 * @group schemas
 */

import { describe, it, expect } from 'vitest';
import { StoryVariableSchema, isReservedName, RESERVED_NAMES, VARIABLE_SCOPES, VARIABLE_KINDS } from '../../shared/schemas/variable';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function validBuiltinVariable() {
  return {
    schemaVersion: 2 as const,
    id: 'tone',
    name: 'Tone',
    kind: 'builtin' as const,
    scope: 'always' as const,
    scopeLocked: false,
    deletable: false,
    renamable: false,
    position: 0,
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T10:00:00.000Z',
  };
}

function validCustomVariable() {
  return {
    schemaVersion: 2 as const,
    id: '01ARZ3NDEKTSV4RRFFQ69G5FB1',
    name: 'Character: Alice',
    kind: 'custom' as const,
    scope: 'manual' as const,
    scopeLocked: false,
    deletable: true,
    renamable: true,
    position: 5,
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T10:00:00.000Z',
  };
}

function validSystemVariable() {
  return {
    schemaVersion: 2 as const,
    id: 'global-constraints',
    name: 'Global Constraints',
    kind: 'system' as const,
    scope: 'always' as const,
    scopeLocked: true,
    deletable: false,
    renamable: false,
    position: 0,
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T10:00:00.000Z',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StoryVariableSchema', () => {
  it('validates a builtin variable', () => {
    const result = StoryVariableSchema.safeParse(validBuiltinVariable());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('builtin');
      expect(result.data.scope).toBe('always');
    }
  });

  it('validates a custom variable', () => {
    const result = StoryVariableSchema.safeParse(validCustomVariable());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('custom');
      expect(result.data.scope).toBe('manual');
      expect(result.data.deletable).toBe(true);
      expect(result.data.renamable).toBe(true);
    }
  });

  it('validates a system variable', () => {
    const result = StoryVariableSchema.safeParse(validSystemVariable());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('system');
      expect(result.data.scopeLocked).toBe(true);
      expect(result.data.deletable).toBe(false);
    }
  });

  it('round-trips a builtin variable', () => {
    const input = validBuiltinVariable();
    const parsed = StoryVariableSchema.parse(input);
    const serialized = JSON.parse(JSON.stringify(parsed));
    const result = StoryVariableSchema.safeParse(serialized);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(parsed);
  });

  it('rejects an invalid kind value', () => {
    const input = { ...validBuiltinVariable(), kind: 'unknown' };
    const result = StoryVariableSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid scope value', () => {
    const input = { ...validBuiltinVariable(), scope: 'never' };
    const result = StoryVariableSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects a negative position', () => {
    const input = { ...validBuiltinVariable(), position: -1 };
    const result = StoryVariableSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('accepts all valid kinds', () => {
    for (const kind of VARIABLE_KINDS) {
      const result = StoryVariableSchema.safeParse({ ...validBuiltinVariable(), kind });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid scopes', () => {
    for (const scope of VARIABLE_SCOPES) {
      const result = StoryVariableSchema.safeParse({ ...validBuiltinVariable(), scope });
      expect(result.success).toBe(true);
    }
  });

  it('schemaVersion must be exactly 2', () => {
    const input = { ...validBuiltinVariable(), schemaVersion: 1 };
    const result = StoryVariableSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('isReservedName', () => {
  it('returns true for all reserved slug names', () => {
    for (const name of RESERVED_NAMES) {
      expect(isReservedName(name)).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(isReservedName('TONE')).toBe(true);
    expect(isReservedName('Style')).toBe(true);
    expect(isReservedName('GLOBAL-CONSTRAINTS')).toBe(true);
  });

  it('returns false for non-reserved names', () => {
    expect(isReservedName('custom-name')).toBe(false);
    expect(isReservedName('My Variable')).toBe(false);
    expect(isReservedName('')).toBe(false);
  });

  it('trims whitespace before matching', () => {
    expect(isReservedName('  tone  ')).toBe(true);
  });
});
