/**
 * WP-31 — Font-size minima CI check.
 *
 * Parses the shipped tokens.css and asserts every --font-size-* token
 * meets the DD v0.2.0 §9 minimum. Also scans renderer CSS files for
 * hardcoded px values below the minimum and reports them.
 *
 * @vitest-environment node
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { globSync } from 'fast-glob';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum allowed font-size in px for any UI text (DD v0.2.0 §9). */
const FONT_SIZE_MIN_PX = 12;

/** CSS files under the renderer tree (exclude node_modules). */
const CSS_GLOB = 'src/renderer/**/*.css';

/**
 * CSS selectors / contexts where font sizes below the minimum are allowed.
 *
 * These are typically:
 *   - Code blocks (`pre`, `code`) — the spec allows mono, and code contexts
 *     may use smaller sizes intentionally.
 *   - Editor content (`.ProseMirror`) — its base font size is 18px (≥ min);
 *     any relative font-size (e.g., `0.9em` on `code`) is scaled from that.
 *   - Zero values (`0px`).
 */
const ALLOWED_BELOW_MIN: RegExp[] = [
  // Code / pre blocks (intentional small mono in code contexts — spec permits)
  /code/i,
  /\bpre\b/i,
  // Zero values are never visual sizes
  /\b0px\b/,
];

// ---------------------------------------------------------------------------
// Token extraction
// ---------------------------------------------------------------------------

interface TokenEntry {
  name: string;
  /** Full source line for error messages. */
  line: string;
  value: number; // px
}

/**
 * Extract all `--font-size-*` tokens from a CSS string and return their
 * pixel values. Returns an empty array if no font-size tokens are found.
 */
function extractFontSizeTokens(raw: string): TokenEntry[] {
  const tokens: TokenEntry[] = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const match = line.match(/^\s*--(font-size-\w+)\s*:\s*(\d+)px\s*;/);
    if (match?.[1] && match[2]) {
      tokens.push({
        name: match[1],
        line,
        value: parseInt(match[2], 10),
      });
    }
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const tokensPath = resolve(__dirname, '../../renderer/styles/tokens.css');
const rendererRoot = resolve(__dirname, '../..');

describe('WP-31 — Font-size Minima', () => {
  describe('token values', () => {
    it('all --font-size-* values ≥ 12px', () => {
      const raw = readFileSync(tokensPath, 'utf-8');
      const tokens = extractFontSizeTokens(raw);

      expect(tokens.length, 'No --font-size-* tokens found in tokens.css').toBeGreaterThan(0);

      for (const token of tokens) {
        expect(
          token.value,
          `--${token.name} = ${token.value}px is below minimum ${FONT_SIZE_MIN_PX}px`,
        ).toBeGreaterThanOrEqual(FONT_SIZE_MIN_PX);
      }
    });

    it('expected font-size tokens exist', () => {
      const raw = readFileSync(tokensPath, 'utf-8');
      const tokens = extractFontSizeTokens(raw);
      const names = new Set(tokens.map((t) => t.name));
      for (const expected of ['xs', 'sm', 'md', 'lg', 'xl']) {
        expect(names.has(`font-size-${expected}`), `Missing --font-size-${expected}`).toBe(true);
      }
    });
  });

  describe('hardcoded px values in renderer CSS', () => {
    const cssFiles = globSync(CSS_GLOB, { cwd: rendererRoot, absolute: true });
    // Collect violations for a single reporting assertion
    const violations: string[] = [];

    for (const filePath of cssFiles) {
      const raw = readFileSync(filePath, 'utf-8');
      const lines = raw.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (!line) continue;

        const pxMatch = line.match(/\bfont-size\s*:\s*(\d+)px\b/i);
        if (!pxMatch?.[1]) continue;

        const value = parseInt(pxMatch[1], 10);
        if (value >= FONT_SIZE_MIN_PX) continue;
        if (value === 0) continue; // zero is reset, not text

        // Check if this line is in an allowed context
        const lineLower = line.toLowerCase();
        if (ALLOWED_BELOW_MIN.some((r) => r.test(lineLower))) continue;

        const relPath = relative(rendererRoot, filePath);
        violations.push(
          `${relPath}:${i + 1}: font-size: ${value}px (below min ${FONT_SIZE_MIN_PX}px) — "${line.trim()}"`,
        );
      }
    }

    it('no hardcoded font-size below 12px outside allowed contexts', () => {
      // Fail with all violations at once for easier remediation
      expect(violations, `Found ${violations.length} sub-minima font-size(s):\n${violations.join('\n')}`).toEqual([]);
    });
  });
});
