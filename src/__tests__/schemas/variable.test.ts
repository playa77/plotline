/**
 * Tests for the variable schema.
 *
 * @group schemas
 */

import { describe, it, expect } from 'vitest';
import { VariableSchema } from '../../shared/schemas/variable';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function validCoreVariable() {
  return {
    schemaVersion: 1 as const,
    id: '01ARZ3NDEKTSV4RRFFQ69G5FB1',
    name: 'Tone',
    core: 'tone' as const,
    scope: 'always' as const,
    active: true,
    order: 0,
  };
}

function validCustomVariable() {
  return {
    schemaVersion: 1 as const,
    id: '01ARZ3NDEKTSV4RRFFQ69G5FB2',
    name: 'Character: Alice',
    core: null,
    scope: 'manual' as const,
    active: true,
    order: 5,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('VariableSchema', () => {
  it('validates a core variable (tone, always scope)', () => {
    const result = VariableSchema.safeParse(validCoreVariable());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.core).toBe('tone');
      expect(result.data.scope).toBe('always');
    }
  });

  it('validates a custom variable (null core, manual scope)', () => {
    const result = VariableSchema.safeParse(validCustomVariable());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.core).toBeNull();
      expect(result.data.scope).toBe('manual');
    }
  });

  it('round-trips a core variable', () => {
    const input = validCoreVariable();
    const parsed = VariableSchema.parse(input);
    const serialized = JSON.parse(JSON.stringify(parsed));
    const result = VariableSchema.safeParse(serialized);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(parsed);
  });

  it('defaults active to true', () => {
    const input = {
      schemaVersion: 1 as const,
      id: '01ARZ3NDEKTSV4RRFFQ69G5FB3',
      name: 'Style',
      core: 'style' as const,
      scope: 'expand' as const,
      order: 1,
    };
    const parsed = VariableSchema.parse(input);
    expect(parsed.active).toBe(true);
  });

  it('rejects an invalid scope value', () => {
    const input = { ...validCoreVariable(), scope: 'never' };
    const result = VariableSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects a negative order', () => {
    const input = { ...validCoreVariable(), order: -1 };
    const result = VariableSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid core value', () => {
    const input = { ...validCoreVariable(), core: 'pacing' };
    const result = VariableSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('allows all four core types', () => {
    const cores = ['tone', 'style', 'constraints', 'characters'] as const;
    for (const core of cores) {
      const result = VariableSchema.safeParse({ ...validCoreVariable(), core });
      expect(result.success).toBe(true);
    }
  });

  it('allows all four scope types', () => {
    const scopes = ['always', 'expand', 'write', 'manual'] as const;
    for (const scope of scopes) {
      const result = VariableSchema.safeParse({ ...validCoreVariable(), scope });
      expect(result.success).toBe(true);
    }
  });
});
