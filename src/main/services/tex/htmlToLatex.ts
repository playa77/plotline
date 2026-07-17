/**
 * HTML → LaTeX converter for the Substack-safe HTML subset.
 *
 * Walks the DOM tree recursively (via linkedom) and produces LaTeX markup.
 * Handles all 20 elements in the allowlist and escapes LaTeX special characters.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { parseHTML } from 'linkedom';

// ── LaTeX escaping ────────────────────────────────────────────────────────

/**
 * Escape LaTeX special characters for use in normal text.
 * Does NOT escape for verbatim environments.
 */
export function escapeLatex(text: string): string {
  // Use a temporary marker to avoid double-escaping braces in \textbackslash{}
  return text
    .replace(/\\/g, '§BS§')             // Temporarily protect backslashes
    .replace(/[{}]/g, (m) => '\\' + m)   // Escape braces
    .replace(/\$/g, '\\$')               // Escape dollar
    .replace(/&/g, '\\&')                // Escape ampersand
    .replace(/#/g, '\\#')                // Escape hash
    .replace(/%/g, '\\%')                // Escape percent
    .replace(/_/g, '\\_')                // Escape underscore
    .replace(/~/g, '\\textasciitilde{}') // Escape tilde
    .replace(/\^/g, '\\textasciicircum{}') // Escape caret
    .replace(/§BS§/g, '\\textbackslash{}'); // Restore backslashes
}

// ── HTML → LaTeX conversion ───────────────────────────────────────────────

/** Set of block-level tags that produce their own paragraph breaks. */
const BLOCK_TAGS = new Set([
  'p', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li',
  'figure', 'pre', 'hr', 'div',
]);

/**
 * Convert a Substack-safe HTML string to LaTeX.
 *
 * @param html - The HTML string to convert.
 * @returns LaTeX markup string.
 */
export function htmlToLatex(html: string): string {
  if (!html || html.trim().length === 0) return '';

  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const body = document.querySelector('body');
  if (!body) return '';

  const parts: string[] = [];
  for (let i = 0; i < body.childNodes.length; i++) {
    parts.push(nodeToLatex(body.childNodes[i]));
  }

  return parts.join('').replace(/^\s+/, '');
}

/**
 * Convert a single DOM node to LaTeX.
 */
function nodeToLatex(node: any): string {
  if (!node) return '';

  // Text node
  if (node.nodeType === 3) {
    let text = node.textContent ?? '';
    // Collapse whitespace for non-pre contexts
    text = text.replace(/\s+/g, ' ');
    text = text.trim();
    if (!text) return '';
    return escapeLatex(text);
  }

  // Element node
  if (node.nodeType === 1 && node.tagName) {
    const tag = node.tagName.toLowerCase();
    return elementToLatex(tag, node);
  }

  return '';
}

/**
 * Convert an element node to LaTeX based on its tag name.
 */
function elementToLatex(tag: string, node: any): string {
  switch (tag) {
    // ── Headings ──────────────────────────────────────────────────────
    case 'h2':
      return `\\section{${processInlineChildren(node)}}\n\n`;
    case 'h3':
      return `\\subsection{${processInlineChildren(node)}}\n\n`;
    case 'h4':
      return `\\subsubsection{${processInlineChildren(node)}}\n\n`;

    // ── Paragraphs ────────────────────────────────────────────────────
    case 'p':
      return `${processInlineChildren(node)}\n\n`;

    // ── Inline formatting ────────────────────────────────────────────
    case 'strong':
    case 'b':
      return `\\textbf{${processInlineChildren(node)}}`;
    case 'em':
    case 'i':
      return `\\textit{${processInlineChildren(node)}}`;
    case 's':
    case 'strike':
      return `\\sout{${processInlineChildren(node)}}`;

    // ── Links ─────────────────────────────────────────────────────────
    case 'a': {
      const href = node.getAttribute('href') ?? '';
      const text = processInlineChildren(node);
      if (!href) return text;
      return `\\href{${escapeLatex(href)}}{${text}}`;
    }

    // ── Blockquotes ───────────────────────────────────────────────────
    case 'blockquote': {
      const inner = processBlockChildren(node);
      return `\\begin{quote}\n${inner}\n\\end{quote}\n\n`;
    }

    // ── Lists ─────────────────────────────────────────────────────────
    case 'ul':
      return `\\begin{itemize}\n${processListItems(node)}\n\\end{itemize}\n\n`;
    case 'ol':
      return `\\begin{enumerate}\n${processListItems(node)}\n\\end{enumerate}\n\n`;
    case 'li':
      return `\\item ${processInlineChildren(node)}\n`;

    // ── Horizontal rule ───────────────────────────────────────────────
    case 'hr':
      return `\\bigskip\\noindent\\hrulefill\\bigskip\n\n`;

    // ── Images ────────────────────────────────────────────────────────
    case 'img': {
      const src = node.getAttribute('src') ?? '';
      return `\\includegraphics[width=\\textwidth]{${escapeLatex(src)}}`;
    }

    // ── Figures ───────────────────────────────────────────────────────
    case 'figure': {
      const parts: string[] = [];
      for (let i = 0; i < node.childNodes.length; i++) {
        parts.push(nodeToLatex(node.childNodes[i]));
      }
      return `\\begin{figure}[htbp]\n${parts.join('')}\n\\end{figure}\n\n`;
    }
    case 'figcaption':
      return `\\caption{${processInlineChildren(node)}}\n`;

    // ── Code / preformatted ──────────────────────────────────────────
    case 'pre': {
      // Use textContent directly to avoid LaTeX escaping (verbatim)
      const code = node.textContent ?? '';
      return `\\begin{verbatim}\n${code}\n\\end{verbatim}\n\n`;
    }
    case 'code':
      if (isInsidePre(node)) {
        // Inside <pre>, <code> content is unwrapped — return empty
        return '';
      }
      return `\\texttt{${processInlineChildren(node)}}`;

    // ── Line breaks ───────────────────────────────────────────────────
    case 'br':
      return `\\\\\n`;

    // ── Unknown / disallowed — recurse children (strip wrapper) ──────
    default:
      // For unknown block elements, process children directly
      // (strips the wrapper like the HTML sanitizer does)
      return processBlockChildren(node);
  }
}

/**
 * Process children of an inline context (text nodes + inline elements only).
 * Collapses whitespace and concatenates.
 */
function processInlineChildren(node: any): string {
  const parts: string[] = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === 3) {
      // Text node
      let text = child.textContent ?? '';
      text = text.replace(/\s+/g, ' ');
      text = text.trim();
      if (text) parts.push(escapeLatex(text));
    } else if (child.nodeType === 1 && child.tagName) {
      const tag = child.tagName.toLowerCase();
      // Only render inline elements inside inline context
      if (isInlineTag(tag)) {
        parts.push(elementToLatex(tag, child));
      } else {
        // Block-level children inside inline context — recurse
        parts.push(nodeToLatex(child));
      }
    }
  }
  return parts.join('');
}

/**
 * Process children of a block context.
 * Each child is recursed through the full nodeToLatex conversion.
 */
function processBlockChildren(node: any): string {
  const parts: string[] = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    parts.push(nodeToLatex(node.childNodes[i]));
  }
  return parts.join('');
}

/**
 * Process list item children, converting each <li> child.
 */
function processListItems(node: any): string {
  const parts: string[] = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === 1 && child.tagName && child.tagName.toLowerCase() === 'li') {
      parts.push(elementToLatex('li', child));
    }
  }
  return parts.join('');
}

/**
 * Check if a node is inside a <pre> element.
 */
function isInsidePre(node: any): boolean {
  let current = node.parentNode;
  while (current) {
    if (current.tagName && current.tagName.toLowerCase() === 'pre') return true;
    current = current.parentNode;
  }
  return false;
}

/**
 * Check if a tag is an inline-level element.
 */
function isInlineTag(tag: string): boolean {
  return new Set([
    'strong', 'b', 'em', 'i', 's', 'strike', 'a', 'code', 'span',
    'img', 'br', 'figcaption',
  ]).has(tag);
}
