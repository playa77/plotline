/**
 * Substack-safe HTML sanitizer (§6.3).
 *
 * Parse-and-rebuild approach using linkedom (isomorphic DOM) so the same code
 * works in both Electron main process (Node.js) and the renderer (browser).
 * Never regex-based — always parse, walk, rebuild, serialize.
 *
 * @module
 * @version 1.0.0 | 2026-07-16
 */

import { parseHTML } from 'linkedom';

import {
  ALLOWED_ELEMENTS,
  ALLOWED_ATTRIBUTES,
  ALLOWED_HREF_PROTOCOLS,
} from './allowlist';

// ---------------------------------------------------------------------------
// Lookups built once at module load time
// ---------------------------------------------------------------------------

const allowedElementSet = new Set<string>(
  ALLOWED_ELEMENTS as unknown as string[],
);

const allowedAttrsByTag: Record<string, Set<string>> = {};
for (const [tag, attrs] of Object.entries(ALLOWED_ATTRIBUTES)) {
  allowedAttrsByTag[tag] = new Set(attrs);
}

const allowedProtocolSet = new Set<string>(
  ALLOWED_HREF_PROTOCOLS as unknown as string[],
);

/**
 * URL-like attributes that should have their protocol validated.
 * Currently: a[href], img[src]
 */
const urlAttrsByTag: Record<string, Set<string>> = {
  a: new Set(['href']),
  img: new Set(['src']),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the protocol scheme from a URL-like value, or null for relative
 * paths that have no scheme.
 *
 * @example getProtocol('https://example.com')   => 'https:'
 * @example getProtocol('data:image/png,...')     => 'data:'
 * @example getProtocol('/relative/path')         => null
 */
function getProtocol(value: string): string | null {
  const match = value.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/);
  return match ? match[1]!.toLowerCase() : null;
}

/**
 * Check whether a URL value uses an allowed protocol.
 * Relative URLs (no protocol) are always considered safe.
 */
function protocolIsAllowed(value: string): boolean {
  const protocol = getProtocol(value);
  if (protocol === null) return true;
  return allowedProtocolSet.has(protocol);
}

// ---------------------------------------------------------------------------
// Node type constants (DOM Level 2)
// ---------------------------------------------------------------------------

const NODE_TEXT = 3;
const NODE_ELEMENT = 1;

// ---------------------------------------------------------------------------
// Sanitizer
// ---------------------------------------------------------------------------

/**
 * Sanitize an HTML string to only allow Substack-safe elements and attributes.
 *
 * Uses a parse → walk → rebuild → serialize pipeline. Disallowed elements
 * are removed entirely (including their text content), while text nodes that
 * live *inside* allowed elements are preserved.
 *
 * @param html - Raw HTML input (may contain hostile markup)
 * @returns Sanitized HTML containing only allowlisted elements and attributes
 *
 * @example sanitize('<script>alert(1)</script><p>safe</p>') // => '<p>safe</p>'
 * @example sanitize('<a href="javascript:void(0)">link</a>') // => '<a>link</a>'
 */
export function sanitize(html: string): string {
  if (!html) return '';
  if (html.trim() === '') return '';

  const { document: srcDoc } = parseHTML(
    `<!doctype html><html><body>${html}</body></html>`,
  );
  const { document: dstDoc } = parseHTML(
    '<!doctype html><html><body></body></html>',
  );

  const srcBody = srcDoc.querySelector('body')!;
  const dstBody = dstDoc.querySelector('body')!;

  /**
   * Walk the source tree depth-first, building sanitized output into
   * `dstParent`.
   *
   * @param node         - Current source node
   * @param dstParent    - Output element to append sanitized children into
   * @param inAllowedAncestor - Whether we are inside a chain of allowed
   *                            elements (controls whether text nodes survive)
   */
  function walk(
    node: Node,
    dstParent: Element,
    inAllowedAncestor: boolean,
  ): void {
    // --- Text nodes --------------------------------------------------------
    if (node.nodeType === NODE_TEXT) {
      if (inAllowedAncestor) {
        dstParent.appendChild(dstDoc.createTextNode(node.textContent ?? ''));
      }
      return;
    }

    // --- Non-element nodes (comments, etc.) --------------------------------
    if (node.nodeType !== NODE_ELEMENT) return;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    // --- Disallowed element ------------------------------------------------
    if (!allowedElementSet.has(tag)) {
      // Recurse into children, but mark the chain as "not inside an allowed
      // element" so text nodes are stripped. This allows finding deeper
      // allowed elements (e.g. <div><span><p>good</p></span></div> → <p>good</p>)
      for (const child of Array.from(el.childNodes)) {
        walk(child, dstParent, false);
      }
      return;
    }

    // --- Allowed element: create, copy attrs, recurse ----------------------
    const newEl = dstDoc.createElement(tag);

    const allowedAttrs = allowedAttrsByTag[tag];
    const urlAttrs = urlAttrsByTag[tag];

    // Collect surviving attributes, then sort by name in REVERSE alphabetical
    // order. linkedom serialises setAttribute() in LIFO order (last-set attr
    // appears first), so setting in descending order produces ascending-order
    // output. This guarantees deterministic idempotency.
    const attrsToSet: Array<{ name: string; value: string }> = [];
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i]!;
      const { name, value } = attr;

      // Only keep allowlisted attributes
      if (!allowedAttrs?.has(name)) continue;

      // Protocol-check URL-valued attributes (href on <a>, src on <img>)
      if (urlAttrs?.has(name) && !protocolIsAllowed(value)) continue;

      attrsToSet.push({ name, value });
    }
    // Descending sort so linkedom's LIFO produces ascending output
    attrsToSet.sort((a, b) => b.name.localeCompare(a.name));
    for (const { name, value } of attrsToSet) {
      newEl.setAttribute(name, value);
    }

    for (const child of Array.from(el.childNodes)) {
      walk(child, newEl, true);
    }

    dstParent.appendChild(newEl);
  }

  // Walk direct children of the source body. Top-level nodes are treated as
  // being in an "allowed" context so that bare text isn't stripped.
  for (const child of Array.from(srcBody.childNodes)) {
    walk(child, dstBody, true);
  }

  return dstBody.innerHTML;
}
