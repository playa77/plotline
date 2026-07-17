/**
 * WP-31 — WCAG AA contrast CI check.
 *
 * Parses the shipped tokens.css, extracts hex color values for the key
 * text-on-background pairs listed in DD v0.2.0 §9 reference table, and
 * asserts each pair meets its WCAG 2.1 AA ratio requirement.
 *
 * Runs in node environment (no DOM needed — reads tokens.css directly).
 *
 * @vitest-environment node
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// WCAG contrast helpers
// ---------------------------------------------------------------------------

/**
 * SRGB-relative luminance (WCAG 2.1 definition).
 * Accepts a 6-digit hex string (with or without leading `#`).
 */
function relativeLuminance(hex: string): number {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) throw new Error(`Invalid hex: ${hex}`);

  const r = sRGBChannel(parseInt(raw.slice(0, 2), 16) / 255);
  const g = sRGBChannel(parseInt(raw.slice(2, 4), 16) / 255);
  const b = sRGBChannel(parseInt(raw.slice(4, 6), 16) / 255);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function sRGBChannel(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * WCAG 2.1 contrast ratio. L1 must be the lighter luminance, L2 the darker.
 * This function sorts internally — callers pass in any order.
 */
function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Token extraction
// ---------------------------------------------------------------------------

/**
 * Parses the tokens.css raw text, extracting hex values for named tokens
 * from both the :root block (light theme) and the [data-theme="dark"] block.
 *
 * Only handles flat `--token-name: #RRGGBB;` lines — rgba(), var(),
 * and computed tokens are not parsed.
 */
function parseTokenHexes(raw: string): Map<string, { light: string; dark: string }> {
  const tokenMap = new Map<string, { light: string; dark: string }>();

  // Split into light (root) and dark blocks
  const rootMatch = raw.match(/:root\s*\{([^}]+)\}/s);
  const darkMatch = raw.match(/\[data-theme="dark"\][^{]*\{([^]+?)\}\s*(?:\/\*|$)/s);

  function extractBlock(block: string, theme: 'light' | 'dark'): void {
    const lines = block.split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*--([a-zA-Z0-9_-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/);
      if (match?.[1] && match[2]) {
        const name: string = match[1];
        const value: string = match[2];
        const existing = tokenMap.get(name) ?? { light: '', dark: '' };
        existing[theme] = value;
        tokenMap.set(name, existing);
      }
    }
  }

  if (rootMatch?.[1]) extractBlock(rootMatch[1], 'light');
  if (darkMatch?.[1]) extractBlock(darkMatch[0], 'dark');

  return tokenMap;
}

// ---------------------------------------------------------------------------
// Token pairs under test
// ---------------------------------------------------------------------------

interface ContrastPair {
  textToken: string;
  bgToken: string;
  minRatio: number; // WCAG threshold
  description: string;
}

const TEXT_CONTRAST_PAIRS: ContrastPair[] = [
  { textToken: 'text-primary', bgToken: 'surface', minRatio: 7, description: 'text-primary on surface' },
  { textToken: 'text-primary', bgToken: 'surface-raised', minRatio: 7, description: 'text-primary on surface-raised' },
  { textToken: 'text-secondary', bgToken: 'surface', minRatio: 4.5, description: 'text-secondary on surface' },
  { textToken: 'accent', bgToken: 'surface', minRatio: 4.5, description: 'accent on surface (link text)' },
  { textToken: 'stale', bgToken: 'surface', minRatio: 4.5, description: 'stale on surface' },
  { textToken: 'danger', bgToken: 'surface', minRatio: 4.5, description: 'danger on surface' },
  { textToken: 'text-primary', bgToken: 'diff-added-bg', minRatio: 7, description: 'text-primary on diff-added-bg' },
  { textToken: 'text-primary', bgToken: 'diff-removed-bg', minRatio: 7, description: 'text-primary on diff-removed-bg' },
  { textToken: 'nontext-ui', bgToken: 'surface', minRatio: 3, description: 'nontext-ui (border) on surface' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const tokensPath = resolve(__dirname, '../../renderer/styles/tokens.css');

describe('WP-31 — Contrast CI', () => {
  let tokenMap: Map<string, { light: string; dark: string }>;

  it('tokens.css exists and is parseable', () => {
    const raw = readFileSync(tokensPath, 'utf-8');
    tokenMap = parseTokenHexes(raw);
    expect(tokenMap.size).toBeGreaterThan(10);
  });

  for (const pair of TEXT_CONTRAST_PAIRS) {
    it(`light: ${pair.description} ≥ ${pair.minRatio}:1`, () => {
      const raw = readFileSync(tokensPath, 'utf-8');
      tokenMap = parseTokenHexes(raw);

      const textName = `color-${pair.textToken}`;
      const bgName = `color-${pair.bgToken}`;

      const t = tokenMap.get(textName);
      if (!t) {
        // eslint-disable-next-line jest/no-conditional-expect
        throw new Error(`Token --${textName} not found in tokens.css (light block)`);
      }
      const b = tokenMap.get(bgName);
      if (!b) {
        // eslint-disable-next-line jest/no-conditional-expect
        throw new Error(`Token --${bgName} not found in tokens.css (light block)`);
      }

      expect(t.light, `--${textName} missing in :root`).toBeTruthy();
      expect(b.light, `--${bgName} missing in :root`).toBeTruthy();

      const ratio = contrastRatio(t.light, b.light);
      expect(
        ratio,
        `Light ${pair.description}: ${t.light} on ${b.light} = ${ratio.toFixed(1)}:1 (need ≥ ${pair.minRatio}:1)`,
      ).toBeGreaterThanOrEqual(pair.minRatio);
    });

    it(`dark: ${pair.description} ≥ ${pair.minRatio}:1`, () => {
      const raw = readFileSync(tokensPath, 'utf-8');
      tokenMap = parseTokenHexes(raw);

      const textName = `color-${pair.textToken}`;
      const bgName = `color-${pair.bgToken}`;

      const t = tokenMap.get(textName);
      if (!t) {
        // eslint-disable-next-line jest/no-conditional-expect
        throw new Error(`Token --${textName} not found in tokens.css (dark block)`);
      }
      const b = tokenMap.get(bgName);
      if (!b) {
        // eslint-disable-next-line jest/no-conditional-expect
        throw new Error(`Token --${bgName} not found in tokens.css (dark block)`);
      }

      expect(t.dark, `--${textName} missing in [data-theme="dark"]`).toBeTruthy();
      expect(b.dark, `--${bgName} missing in [data-theme="dark"]`).toBeTruthy();

      const ratio = contrastRatio(t.dark, b.dark);
      expect(
        ratio,
        `Dark ${pair.description}: ${t.dark} on ${b.dark} = ${ratio.toFixed(1)}:1 (need ≥ ${pair.minRatio}:1)`,
      ).toBeGreaterThanOrEqual(pair.minRatio);
    });
  }

  it('theme direction: light on :root, dark on [data-theme="dark"]', () => {
    const raw = readFileSync(tokensPath, 'utf-8');
    // Light block must come first (before dark block)
    const rootIdx = raw.indexOf(':root');
    const darkIdx = raw.indexOf('[data-theme="dark"]');
    expect(rootIdx, ':root block missing').toBeGreaterThan(-1);
    expect(darkIdx, '[data-theme="dark"] block missing').toBeGreaterThan(-1);
    // light is the default, so :root must appear before the dark override
    // (CSS cascade order): this isn't strictly necessary but verifies intent
    expect(rootIdx, ':root (light) must appear before [data-theme="dark"]').toBeLessThan(darkIdx);
  });
});
