/**
 * Tests for slug utilities.
 *
 * @group utils
 */

import { describe, it, expect } from 'vitest';
import { slugify, versionSlug } from '../../shared/utils/slug';

describe('slugify', () => {
  it('converts "My Cool Version" to "my-cool-version"', () => {
    expect(slugify('My Cool Version')).toBe('my-cool-version');
  });

  it('converts "café & bistro" to "cafe-bistro"', () => {
    expect(slugify('café & bistro')).toBe('cafe-bistro');
  });

  it('preserves "already-kebab" unchanged', () => {
    expect(slugify('already-kebab')).toBe('already-kebab');
  });

  it('converts "!!!hello!!!" to "hello"', () => {
    expect(slugify('!!!hello!!!')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('collapses multiple spaces and hyphens', () => {
    expect(slugify('foo   bar--baz')).toBe('foo-bar-baz');
  });

  it('handles strings with only special characters', () => {
    expect(slugify('@#$%^&*()')).toBe('');
  });
});

describe('versionSlug', () => {
  it('returns base slug when no collisions', () => {
    expect(versionSlug('test', [])).toBe('test');
  });

  it('appends "-1" when base slug is taken', () => {
    expect(versionSlug('test', ['test'])).toBe('test-1');
  });

  it('appends "-2" when base and "-1" are taken', () => {
    expect(versionSlug('test', ['test', 'test-1'])).toBe('test-2');
  });

  it('handles space conversion + collision (AC #2)', () => {
    expect(versionSlug('my version', ['my-version'])).toBe('my-version-1');
  });

  it('skips over gaps in suffix numbering', () => {
    expect(versionSlug('test', ['test', 'test-2'])).toBe('test-1');
  });

  it('handles non-consecutive taken suffixes', () => {
    expect(versionSlug('ver', ['ver', 'ver-1', 'ver-2', 'ver-3'])).toBe('ver-4');
  });

  it('does not modify the base when collisions are from other names', () => {
    expect(versionSlug('unique', ['test', 'test-1'])).toBe('unique');
  });
});
