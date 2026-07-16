/**
 * Word-count utility (§8.3).
 *
 * A single, shared implementation for counting words in HTML content. Used by
 * the status bar, History deltas, and tree badges — all three must produce
 * identical results.
 *
 * Algorithm:
 * 1. Strip HTML tags (replace with spaces to preserve word boundaries)
 * 2. Decode common HTML entities
 * 3. Split on Unicode-aware whitespace and count non-empty segments
 *
 * @module
 * @version 1.0.0 | 2026-07-16
 */

/** Map of HTML entity names to their decoded character. */
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * Count the number of words in an HTML string.
 * Returns 0 for empty or tag-only input.
 *
 * @param html - Raw HTML content (may contain tags, entities, whitespace)
 * @returns Word count (non-negative integer)
 *
 * @example countWords('<p>Hello world</p>')                    // => 2
 * @example countWords('<h2>Chapter One</h2><p>The quick fox.</p>') // => 5
 * @example countWords('<p>Hello&amp;nbsp;World</p>')           // => 2
 * @example countWords('')                                       // => 0
 * @example countWords('<p></p>')                                // => 0
 */
export function countWords(html: string): number {
  if (!html) return 0;

  // 1. Strip HTML tags — replace with space so "word</p><p>word" splits correctly
  let text = html.replace(/<[^>]*>/g, ' ');

  // 2. Decode HTML entities
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    text = text.replaceAll(entity, char);
  }
  // Handle numeric entities like &#x27; and &#39;
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) =>
    String.fromCodePoint(parseInt(hex, 16)),
  );
  text = text.replace(/&#(\d+);/g, (_match, dec) =>
    String.fromCodePoint(parseInt(dec, 10)),
  );

  // 3. Replace isolated punctuation (from tag stripping) with spaces
  text = text.replace(/[^\p{L}\p{N}\s]/gu, ' ');

  // 4. Split on Unicode-aware whitespace and count non-empty
  const segments = text.split(/\s+/u).filter(Boolean);
  return segments.length;
}
