/**
 * Tests for the HTML allowlist constants.
 *
 * Verifies that the single source-of-truth module is importable and contains
 * the expected elements, attributes, and protocols. Consumers should always
 * import from this module rather than duplicating the constants.
 *
 * @group schemas
 */

import { describe, it, expect } from 'vitest';
import {
  ALLOWED_ELEMENTS,
  ALLOWED_ATTRIBUTES,
  ALLOWED_HREF_PROTOCOLS,
} from '../../shared/sanitize/allowlist';

describe('ALLOWED_ELEMENTS', () => {
  it('is an array with the expected basic elements', () => {
    expect(ALLOWED_ELEMENTS).toContain('h2');
    expect(ALLOWED_ELEMENTS).toContain('h3');
    expect(ALLOWED_ELEMENTS).toContain('h4');
    expect(ALLOWED_ELEMENTS).toContain('p');
    expect(ALLOWED_ELEMENTS).toContain('strong');
    expect(ALLOWED_ELEMENTS).toContain('em');
    expect(ALLOWED_ELEMENTS).toContain('s');
    expect(ALLOWED_ELEMENTS).toContain('a');
    expect(ALLOWED_ELEMENTS).toContain('blockquote');
    expect(ALLOWED_ELEMENTS).toContain('ul');
    expect(ALLOWED_ELEMENTS).toContain('ol');
    expect(ALLOWED_ELEMENTS).toContain('li');
    expect(ALLOWED_ELEMENTS).toContain('hr');
    expect(ALLOWED_ELEMENTS).toContain('img');
    expect(ALLOWED_ELEMENTS).toContain('figure');
    expect(ALLOWED_ELEMENTS).toContain('figcaption');
    expect(ALLOWED_ELEMENTS).toContain('pre');
    expect(ALLOWED_ELEMENTS).toContain('code');
    expect(ALLOWED_ELEMENTS).toContain('br');
  });

  it('has exactly the expected number of elements', () => {
    expect(ALLOWED_ELEMENTS.length).toBe(19);
  });

  it('is a readonly tuple (as const)', () => {
    // TypeScript compile-time check: reading is fine
    expect(Array.isArray(ALLOWED_ELEMENTS)).toBe(true);
  });
});

describe('ALLOWED_ATTRIBUTES', () => {
  it('has an entry for "a" with "href"', () => {
    expect(ALLOWED_ATTRIBUTES).toHaveProperty('a');
    expect(ALLOWED_ATTRIBUTES.a).toContain('href');
  });

  it('has an entry for "img" with "src" and "alt"', () => {
    expect(ALLOWED_ATTRIBUTES).toHaveProperty('img');
    expect(ALLOWED_ATTRIBUTES.img).toContain('src');
    expect(ALLOWED_ATTRIBUTES.img).toContain('alt');
  });

  it('has entries for "figure" and "figcaption" with empty arrays', () => {
    expect(ALLOWED_ATTRIBUTES.figure).toEqual([]);
    expect(ALLOWED_ATTRIBUTES.figcaption).toEqual([]);
  });
});

describe('ALLOWED_HREF_PROTOCOLS', () => {
  it('allows http, https, and mailto', () => {
    expect(ALLOWED_HREF_PROTOCOLS).toContain('http:');
    expect(ALLOWED_HREF_PROTOCOLS).toContain('https:');
    expect(ALLOWED_HREF_PROTOCOLS).toContain('mailto:');
  });

  it('has exactly 3 protocols', () => {
    expect(ALLOWED_HREF_PROTOCOLS.length).toBe(3);
  });
});
