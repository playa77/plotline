/**
 * Block-level HTML alignment and word-level inline diff engine.
 *
 * Compares two HTML documents (original vs. modified) and produces a
 * decoration list that an editor (TipTap / ProseMirror) can render as
 * diff highlights.
 *
 * Algorithm:
 *   1. Parse both HTML documents into block-level slices (parseBlocks).
 *   2. Longest-common-subsequence (LCS) alignment of blocks by text content.
 *   3. Similarity check on aligned pairs: >50 % → "changed" (word-level
 *      inline diff), ≤50 % → split into deleted + inserted.
 *   4. Word-level LCS inside each changed block to produce segments.
 *
 * Pure computation — no IPC, no async, no external libraries.
 *
 * @module
 * @version 1.0.0 | 2026-07-16
 */

import { parseBlocks } from './parseBlocks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiffSegment {
  text: string;
  type: 'unchanged' | 'inserted' | 'deleted';
}

export interface DiffDecoration {
  /** Sequential index in the decoration list (document order). */
  blockIndex: number;
  status: 'unchanged' | 'inserted' | 'deleted' | 'changed';
  /** Word-level inline segments (only for `changed` blocks). */
  segments?: DiffSegment[];
  /** HTML content of the original block (before diff). */
  originalHtml: string;
  /** HTML content of the modified block (after diff). */
  modifiedHtml: string;
}

export interface DiffResult {
  decorations: DiffDecoration[];
  stats: {
    blocksInserted: number;
    blocksDeleted: number;
    blocksChanged: number;
    blocksUnchanged: number;
  };
}

// ---------------------------------------------------------------------------
// LCS — generic, no external deps
// ---------------------------------------------------------------------------

type LcsDirection = 'diag' | 'up' | 'left' | 'end';

/**
 * Compute the LCS length table for two sequences.
 * Returns a (m+1) × (n+1) matrix and a direction matrix for backtracking.
 */
function computeLCSTable<T>(
  a: T[],
  b: T[],
  equal: (x: T, y: T) => boolean,
): { length: number[][]; dir: LcsDirection[][] } {
  const m = a.length;
  const n = b.length;

  // Build DP table
  const length: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  const dir: LcsDirection[][] = Array.from({ length: m + 1 }, () =>
    new Array<LcsDirection>(n + 1).fill('end'),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (equal(a[i - 1]!, b[j - 1]!)) {
        length[i]![j] = length[i - 1]![j - 1]! + 1;
        dir[i]![j] = 'diag';
      } else if (length[i - 1]![j]! >= length[i]![j - 1]!) {
        length[i]![j] = length[i - 1]![j]!;
        dir[i]![j] = 'up';
      } else {
        length[i]![j] = length[i]![j - 1]!;
        dir[i]![j] = 'left';
      }
    }
  }

  return { length, dir };
}

/**
 * Backtrack through an LCS direction table to produce an alignment.
 *
 * Each entry in the result is one of:
 *  - `{ type: 'unchanged', aVal, bVal }` — matched elements
 *  - `{ type: 'deleted', aVal }`          — element only in A
 *  - `{ type: 'inserted', bVal }`         — element only in B
 *
 * Results are in forward (document) order.
 */
interface LcsAlignmentEntry<T> {
  type: 'unchanged' | 'deleted' | 'inserted';
  aVal?: T;
  bVal?: T;
}

function backtrackLcs<T>(
  a: T[],
  b: T[],
  dir: LcsDirection[][],
): LcsAlignmentEntry<T>[] {
  const result: LcsAlignmentEntry<T>[] = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    switch (dir[i]?.[j]) {
      case 'diag':
        result.push({
          type: 'unchanged',
          aVal: a[i - 1],
          bVal: b[j - 1],
        });
        i--;
        j--;
        break;
      case 'up':
        result.push({ type: 'deleted', aVal: a[i - 1] });
        i--;
        break;
      case 'left':
        result.push({ type: 'inserted', bVal: b[j - 1] });
        j--;
        break;
      default:
        // Exhausted the LCS path — flush any remaining unmatched
        // elements at the boundary.  Remaining originals → deletions;
        // remaining modifieds → insertions.
        while (i > 0) {
          result.push({ type: 'deleted' as const, aVal: a[i - 1] });
          i--;
        }
        while (j > 0) {
          result.push({ type: 'inserted' as const, bVal: b[j - 1] });
          j--;
        }
        break;
    }
  }

  return result.reverse();
}

/**
 * Generic LCS diff of two sequences.
 * Returns an alignment in forward order.
 */
function diffSequences<T>(
  a: T[],
  b: T[],
  equal: (x: T, y: T) => boolean,
): LcsAlignmentEntry<T>[] {
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return b.map((v) => ({ type: 'inserted' as const, bVal: v }));
  if (b.length === 0) return a.map((v) => ({ type: 'deleted' as const, aVal: v }));

  const { dir } = computeLCSTable(a, b, equal);
  return backtrackLcs(a, b, dir);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags and return trimmed text content. */
function stripTags(html: string): string {
  // Linkedom-like output: remove anything that looks like a tag
  return html.replace(/<[^>]*>/g, '').trim();
}

/** Split text into tokens alternating between word and whitespace sequences. */
function tokenizeText(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const start = i;
    if (/\s/.test(text[i]!)) {
      while (i < text.length && /\s/.test(text[i]!)) i++;
    } else {
      while (i < text.length && !/\s/.test(text[i]!)) i++;
    }
    tokens.push(text.slice(start, i));
  }
  return tokens;
}

/**
 * Compute word-overlap similarity between two text strings.
 * Returns a value in [0, 1] where 1 = identical.
 */
function wordOverlapSimilarity(textA: string, textB: string): number {
  const wordsA = textA.toLowerCase().split(/\s+/).filter(Boolean);
  const wordsB = textB.toLowerCase().split(/\s+/).filter(Boolean);

  if (wordsA.length === 0 && wordsB.length === 0) return 1;
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  // Count word frequencies for proper multiset overlap
  const freqA = new Map<string, number>();
  const freqB = new Map<string, number>();
  for (const w of wordsA) freqA.set(w, (freqA.get(w) ?? 0) + 1);
  for (const w of wordsB) freqB.set(w, (freqB.get(w) ?? 0) + 1);

  let common = 0;
  for (const [w, c] of freqA) {
    common += Math.min(c, freqB.get(w) ?? 0);
  }

  return (2 * common) / (wordsA.length + wordsB.length);
}

// ---------------------------------------------------------------------------
// Word-level inline diff
// ---------------------------------------------------------------------------

/**
 * Produce word-level diff segments for a pair of matched text strings.
 *
 * Runs LCS on word tokens and merges adjacent same-type entries into
 * contiguous segments. Whitespace tokens are preserved as part of their
 * adjacent context.
 */
function diffWords(originalText: string, modifiedText: string): DiffSegment[] {
  if (originalText === modifiedText) {
    return []; // no inline changes — caller should mark as unchanged
  }

  const tokensA = tokenizeText(originalText);
  const tokensB = tokenizeText(modifiedText);

  const alignment = diffSequences(tokensA, tokensB, (x, y) => x === y);
  if (alignment.length === 0) return [];

  // Merge consecutive same-type entries
  const merged: DiffSegment[] = [];
  let current: { text: string; type: 'unchanged' | 'inserted' | 'deleted' } | null = null;

  for (const entry of alignment) {
    const text = entry.type === 'deleted' ? (entry.aVal ?? '') : (entry.bVal ?? '');
    if (text.length === 0) continue;

    if (current && current.type === entry.type) {
      current.text += text;
    } else {
      if (current) merged.push(current);
      current = { text, type: entry.type };
    }
  }
  if (current) merged.push(current);

  return merged;
}

// ---------------------------------------------------------------------------
// Block-level diff
// ---------------------------------------------------------------------------

/**
 * Diff two arrays of block HTML strings.
 *
 * Uses LCS on the stripped (lowercased) text content of each block.
 * Returns decorations in document order.
 */
function diffBlockLists(
  originalBlocks: string[],
  modifiedBlocks: string[],
  origTexts: string[],
  modTexts: string[],
): DiffDecoration[] {
  const equal = (i: number, j: number) => origTexts[i]! === modTexts[j]!;

  // Compute LCS table on indices
  const m = originalBlocks.length;
  const n = modifiedBlocks.length;

  const length: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  const dir: LcsDirection[][] = Array.from({ length: m + 1 }, () =>
    new Array<LcsDirection>(n + 1).fill('end'),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (equal(i - 1, j - 1)) {
        length[i]![j] = length[i - 1]![j - 1]! + 1;
        dir[i]![j] = 'diag';
      } else if (length[i - 1]![j]! >= length[i]![j - 1]!) {
        length[i]![j] = length[i - 1]![j]!;
        dir[i]![j] = 'up';
      } else {
        length[i]![j] = length[i]![j - 1]!;
        dir[i]![j] = 'left';
      }
    }
  }

  // Backtrack to build alignment (store indices)
  const alignment: Array<{
    type: 'unchanged' | 'deleted' | 'inserted';
    origIdx?: number;
    modIdx?: number;
  }> = [];

  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    switch (dir[i]?.[j]) {
      case 'diag':
        alignment.push({ type: 'unchanged', origIdx: i - 1, modIdx: j - 1 });
        i--;
        j--;
        break;
      case 'up':
        alignment.push({ type: 'deleted', origIdx: i - 1 });
        i--;
        break;
      case 'left':
        alignment.push({ type: 'inserted', modIdx: j - 1 });
        j--;
        break;
      default:
        // Flush remaining unmatched elements at the boundary.
        while (i > 0) {
          alignment.push({ type: 'deleted', origIdx: i - 1 });
          i--;
        }
        while (j > 0) {
          alignment.push({ type: 'inserted', modIdx: j - 1 });
          j--;
        }
        break;
    }
  }
  alignment.reverse();

  // Post-process: check similarity for matched pairs.
  // Aligned blocks with ≤50 % word overlap are split into deleted+inserted.
  const decorations: DiffDecoration[] = [];
  let blockIndex = 0;

  for (const entry of alignment) {
    switch (entry.type) {
      case 'unchanged': {
        const origHtml = originalBlocks[entry.origIdx!]!;
        const modHtml = modifiedBlocks[entry.modIdx!]!;
        const origText = origTexts[entry.origIdx!]!;
        const modText = modTexts[entry.modIdx!]!;

        // Check similarity
        const sim = wordOverlapSimilarity(origText, modText);
        if (sim <= 0.5) {
          // Below threshold — treat as deletion + insertion
          decorations.push({
            blockIndex: blockIndex++,
            status: 'deleted',
            originalHtml: origHtml,
            modifiedHtml: '',
          });
          decorations.push({
            blockIndex: blockIndex++,
            status: 'inserted',
            originalHtml: '',
            modifiedHtml: modHtml,
          });
        } else if (origText === modText) {
          // Identical text content — unchanged
          decorations.push({
            blockIndex: blockIndex++,
            status: 'unchanged',
            originalHtml: origHtml,
            modifiedHtml: modHtml,
          });
        } else {
          // Same-ish block with word-level changes
          const segments = diffWords(origText, modText);
          decorations.push({
            blockIndex: blockIndex++,
            status: 'changed',
            segments,
            originalHtml: origHtml,
            modifiedHtml: modHtml,
          });
        }
        break;
      }

      case 'deleted': {
        const origHtml = originalBlocks[entry.origIdx!]!;
        decorations.push({
          blockIndex: blockIndex++,
          status: 'deleted',
          originalHtml: origHtml,
          modifiedHtml: '',
        });
        break;
      }

      case 'inserted': {
        const modHtml = modifiedBlocks[entry.modIdx!]!;
        decorations.push({
          blockIndex: blockIndex++,
          status: 'inserted',
          originalHtml: '',
          modifiedHtml: modHtml,
        });
        break;
      }
    }
  }

  return decorations;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compare two HTML documents and return block-level + word-level diff
 * decorations suitable for rendering in a TipTap/ProseMirror editor.
 *
 * @param original - The original HTML document.
 * @param modified - The modified HTML document.
 * @returns A DiffResult with decorations and summary statistics.
 */
export function diffHtml(original: string, modified: string): DiffResult {
  const originalBlocks = parseBlocks(original);
  const modifiedBlocks = parseBlocks(modified);

  const strip = (html: string) => stripTags(html).toLowerCase();
  const origTexts = originalBlocks.map(strip);
  const modTexts = modifiedBlocks.map(strip);

  const decorations = diffBlockLists(originalBlocks, modifiedBlocks, origTexts, modTexts);

  // Compute stats
  let blocksInserted = 0;
  let blocksDeleted = 0;
  let blocksChanged = 0;
  let blocksUnchanged = 0;

  for (const d of decorations) {
    switch (d.status) {
      case 'inserted':
        blocksInserted++;
        break;
      case 'deleted':
        blocksDeleted++;
        break;
      case 'changed':
        blocksChanged++;
        break;
      case 'unchanged':
        blocksUnchanged++;
        break;
    }
  }

  return {
    decorations,
    stats: {
      blocksInserted,
      blocksDeleted,
      blocksChanged,
      blocksUnchanged,
    },
  };
}
