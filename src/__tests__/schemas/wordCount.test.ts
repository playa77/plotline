/**
 * Tests for word count utility.
 *
 * @group utils
 */

import { describe, it, expect } from 'vitest';
import { countWords } from '../../shared/utils/wordCount';

describe('countWords', () => {
  it('counts words in a simple paragraph (AC #3 baseline)', () => {
    expect(countWords('<p>Hello world</p>')).toBe(2);
  });

  it('counts words across headings and paragraphs', () => {
    expect(countWords('<h2>Chapter One</h2><p>The quick fox.</p>')).toBe(5);
  });

  it('decodes HTML entities and counts correctly', () => {
    expect(countWords('<p>Hello&amp;nbsp;World</p>')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for an empty tag', () => {
    expect(countWords('<p></p>')).toBe(0);
  });

  it('returns 0 for only whitespace', () => {
    expect(countWords('   ')).toBe(0);
  });

  it('handles mixed tags and text', () => {
    const html = '<p>The <strong>quick</strong> brown <em>fox</em>.</p>';
    expect(countWords(html)).toBe(4);
  });

  it('decodes numeric HTML entities', () => {
    expect(countWords('<p>Hello&#32;World</p>')).toBe(2);
  });

  it('decodes hex HTML entities', () => {
    expect(countWords('<p>Hello&#x20;World</p>')).toBe(2);
  });

  it('treats tags as word boundaries (no concatenation)', () => {
    // Without the space-replacement for tags, "word</p><p>word" would concatenate
    expect(countWords('<p>First</p><p>Second</p>')).toBe(2);
  });

  it('counts Unicode words', () => {
    expect(countWords('<p>Élève français</p>')).toBe(2);
  });
});
