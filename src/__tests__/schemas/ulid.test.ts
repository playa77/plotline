/**
 * Tests for ULID generation and validation.
 *
 * @group utils
 */

import { describe, it, expect } from 'vitest';
import { generateULID, isValidULID } from '../../shared/utils/ulid';

describe('generateULID', () => {
  it('returns a 26-character string (AC #5)', () => {
    const id = generateULID();
    expect(id).toBeTruthy();
    expect(id.length).toBe(26);
  });

  it('two successive calls produce different values (AC #5)', () => {
    const a = generateULID();
    const b = generateULID();
    expect(a).not.toBe(b);
  });

  it('generated values are lexicographically sortable by time', () => {
    const ids = Array.from({ length: 10 }, () => generateULID());
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });
});

describe('isValidULID', () => {
  it('returns true for a freshly generated ULID (AC #5)', () => {
    const id = generateULID();
    expect(isValidULID(id)).toBe(true);
  });

  it('returns false for a non-ULID string (AC #5)', () => {
    expect(isValidULID('not-a-ulid')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidULID('')).toBe(false);
  });

  it('returns false for a UUID', () => {
    expect(isValidULID('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('returns false for a lowercase ULID-like string', () => {
    // ULIDs use uppercase Crockford base32
    expect(isValidULID('01arz3ndektsv4rrffq69g5fav')).toBe(false);
  });

  it('returns false for strings with vowels (I, L, O, U excluded)', () => {
    // 'A' is not in Crockford base32 (no vowels)
    expect(isValidULID('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
    // contains 'I' which is excluded
    expect(isValidULID('01ARZ3NDEKTSV4RRFFQ69G5FIB')).toBe(false);
  });
});
