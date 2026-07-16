/**
 * Block-level HTML parser for the diff engine.
 *
 * Splits an HTML document into an array of block-level element outer HTML
 * strings. Elements not inside any block are implicitly wrapped in <p>.
 *
 * Block-level elements recognised: p, h2, h3, h4, ul, ol, li, blockquote,
 * hr, pre. List containers (ul/ol) are flattened — their <li> children are
 * emitted as individual blocks. <blockquote> is emitted as a single block
 * (its inner content is not flattened).
 *
 * @module
 * @version 1.0.0 | 2026-07-16
 */

/** Tag names treated as block-level elements by the diff engine. */
const BLOCK_TAGS = new Set([
  'p',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'pre',
]);

/** Tags whose children are always safe to extract as flat content. */
const LIST_CONTAINERS = new Set(['ul', 'ol']);

// ---------------------------------------------------------------------------
// HTML scanning helpers
// ---------------------------------------------------------------------------

/**
 * Information about a tag found at a position.
 */
interface TagInfo {
  /** Lowercased tag name. */
  tagName: string;
  /** Whether this is a closing tag (</…>). */
  isClosing: boolean;
  /** Index one past the closing `>`. */
  endIdx: number;
}

/**
 * Parse the tag starting at `startIdx` (which must point at `<`).
 * Returns null if no valid tag is found.
 */
function parseTagAt(html: string, startIdx: number): TagInfo | null {
  if (html[startIdx] !== '<') return null;

  let i = startIdx + 1;
  if (i >= html.length) return null;

  const isClosing = html[i] === '/';
  if (isClosing) i++;

  // Skip whitespace between </ and tag name (malformed but resilient)
  while (i < html.length && html[i] === ' ') i++;

  // Read tag name (alphabetic characters only)
  const nameStart = i;
  while (i < html.length && /[a-zA-Z]/.test(html[i]!)) i++;
  if (i === nameStart) return null;
  const tagName = html.slice(nameStart, i).toLowerCase();

  // Advance past attributes to the closing >
  while (i < html.length && html[i] !== '>') {
    // Skip quoted attribute values so we don't stop on > inside quotes
    if (html[i] === '"') {
      i++;
      while (i < html.length && html[i] !== '"') i++;
    }
    if (html[i] === "'") {
      i++;
      while (i < html.length && html[i] !== "'") i++;
    }
    i++;
  }
  if (i >= html.length) return null;

  return { tagName, isClosing, endIdx: i + 1 };
}

/**
 * Find the matching close tag for an opening tag at `openIdx`.
 * Handles nested tags of the same name by tracking depth.
 * Returns the index one past the closing `>`.
 */
function findCloseTag(html: string, openIdx: number, tagName: string): number {
  let depth = 1;
  let i = openIdx + 1; // start after the opening tag

  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf('<', i);
    if (nextOpen === -1) return html.length; // unbalanced — return rest

    const info = parseTagAt(html, nextOpen);
    if (!info) {
      i = nextOpen + 1;
      continue;
    }

    if (!info.isClosing && info.tagName === tagName) {
      depth++;
    } else if (info.isClosing && info.tagName === tagName) {
      depth--;
    }

    i = info.endIdx;
  }

  return i;
}

/**
 * Extract the outer HTML of a block-level element starting at `openIdx`.
 * Returns the full string from `<` to the matching close tag's `>`.
 */
function extractElement(html: string, openIdx: number): string {
  const info = parseTagAt(html, openIdx);
  if (!info) return html[openIdx]!; // bare <

  const closeIdx = findCloseTag(html, openIdx, info.tagName);
  return html.slice(openIdx, closeIdx);
}

/**
 * Extract all `<li>` children from a `<ul>` or `<ol>` container.
 * Returns the outer HTML of each li element.
 */
function extractListItems(listHtml: string): string[] {
  const items: string[] = [];
  let pos = 0;
  while (pos < listHtml.length) {
    const lt = listHtml.indexOf('<', pos);
    if (lt === -1) break;

    const info = parseTagAt(listHtml, lt);
    if (!info) {
      pos = lt + 1;
      continue;
    }

    if (!info.isClosing && info.tagName === 'li') {
      const liHtml = extractElement(listHtml, lt);
      items.push(liHtml);
      pos = lt + liHtml.length;
    } else {
      pos = info.endIdx;
    }
  }
  return items;
}

/**
 * Flush any accumulated text content as an implicit `<p>` block.
 */
function flushTextBlock(buffer: string[], text: string): void {
  const trimmed = text.trim();
  if (trimmed.length > 0) {
    buffer.push(`<p>${trimmed}</p>`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse an HTML document into an array of block-level element outer HTML
 * strings. Bare text not wrapped in a block-level element is implicitly
 * wrapped in `<p>`.
 *
 * @param html - The HTML document to parse.
 * @returns An array of outer-HTML strings, one per block.
 */
export function parseBlocks(html: string): string[] {
  if (html.length === 0) return [];

  const blocks: string[] = [];
  let pos = 0;
  let textBuffer = '';

  while (pos < html.length) {
    const lt = html.indexOf('<', pos);
    if (lt === -1) {
      // Remaining text content
      textBuffer += html.slice(pos);
      break;
    }

    // Text before the tag
    if (lt > pos) {
      textBuffer += html.slice(pos, lt);
    }

    const info = parseTagAt(html, lt);
    if (!info) {
      textBuffer += '<';
      pos = lt + 1;
      continue;
    }

    if (!info.isClosing && BLOCK_TAGS.has(info.tagName)) {
      // This is a block-level opening tag — flush any pending text first
      flushTextBlock(blocks, textBuffer);
      textBuffer = '';

      // --- Handle self-closing hr ---
      if (info.tagName === 'hr') {
        blocks.push('<hr>');
        pos = info.endIdx;
        continue;
      }

      // --- Handle list containers — flatten to li blocks ---
      if (LIST_CONTAINERS.has(info.tagName)) {
        const listHtml = extractElement(html, lt);
        const liBlocks = extractListItems(listHtml);
        blocks.push(...liBlocks);
        pos = lt + listHtml.length;
        continue;
      }

      // --- Regular block element ---
      const blockHtml = extractElement(html, lt);
      blocks.push(blockHtml);
      pos = lt + blockHtml.length;
    } else {
      // Non-block or closing tag — treat as inline/ignored content
      textBuffer += html.slice(pos, info.endIdx);
      pos = info.endIdx;
    }
  }

  // Flush remaining text
  flushTextBlock(blocks, textBuffer);

  return blocks;
}
