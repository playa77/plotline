/**
 * Unit tests for IPC schema validation and shared types.
 *
 * These tests are Electron-free — they only exercise zod schemas
 * and type-level contracts that can be verified without a runtime.
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { describe, expect, it } from 'vitest';
import { PingRequestSchema } from '../main/ipc/schemas';

describe('IPC Schema Validation', () => {
  describe('PingRequestSchema', () => {
    it('validates { timestamp: 123 }', () => {
      const result = PingRequestSchema.safeParse({ timestamp: 123 });
      expect(result.success).toBe(true);
    });

    it('validates { timestamp: 0 }', () => {
      const result = PingRequestSchema.safeParse({ timestamp: 0 });
      expect(result.success).toBe(true);
    });

    it('validates { timestamp: -1 }', () => {
      const result = PingRequestSchema.safeParse({ timestamp: -1 });
      expect(result.success).toBe(true);
    });

    it('rejects empty object', () => {
      const result = PingRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects { timestamp: "abc" }', () => {
      const result = PingRequestSchema.safeParse({ timestamp: 'abc' });
      expect(result.success).toBe(false);
    });

    it('rejects null', () => {
      const result = PingRequestSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it('rejects undefined', () => {
      const result = PingRequestSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it('rejects { timestamp: true }', () => {
      const result = PingRequestSchema.safeParse({ timestamp: true });
      expect(result.success).toBe(false);
    });

    it('rejects extra properties gracefully', () => {
      const result = PingRequestSchema.safeParse({
        timestamp: 123,
        extraField: 'should be ignored by default',
      });
      // zod strips extra props by default, so this should succeed
      // (no .strict() on the schema)
      expect(result.success).toBe(true);
    });

    it('produces structured error message on rejection', () => {
      const result = PingRequestSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
        expect(result.error.issues[0]?.message).toBe('Required');
        expect(result.error.issues[0]?.path).toContain('timestamp');
      }
    });
  });
});
