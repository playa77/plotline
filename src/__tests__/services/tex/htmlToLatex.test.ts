/**
 * htmlToLatex tests (WP-25).
 *
 * Tests cover all 20 element mappings in the Substack-safe subset,
 * LaTeX special character escaping, pre/code verbatim handling,
 * and edge cases like empty input and disallowed elements.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { describe, it, expect } from 'vitest';
import { htmlToLatex, escapeLatex } from '../../../main/services/tex/htmlToLatex';

describe('htmlToLatex', () => {
  // ── Headings ─────────────────────────────────────────────────────────

  it('converts h2 to \\section{}', () => {
    const result = htmlToLatex('<h2>Chapter One</h2>');
    expect(result).toBe('\\section{Chapter One}\n\n');
  });

  it('converts h3 to \\subsection{}', () => {
    const result = htmlToLatex('<h3>Section One</h3>');
    expect(result).toBe('\\subsection{Section One}\n\n');
  });

  it('converts h4 to \\subsubsection{}', () => {
    const result = htmlToLatex('<h4>Subsection One</h4>');
    expect(result).toBe('\\subsubsection{Subsection One}\n\n');
  });

  // ── Paragraphs ───────────────────────────────────────────────────────

  it('converts paragraph to text with double newline', () => {
    const result = htmlToLatex('<p>Hello world</p>');
    expect(result).toBe('Hello world\n\n');
  });

  // ── Inline formatting ────────────────────────────────────────────────

  it('converts <strong> to \\textbf{}', () => {
    const result = htmlToLatex('<p>This is <strong>bold</strong> text</p>');
    expect(result).toContain('\\textbf{bold}');
  });

  it('converts <b> to \\textbf{}', () => {
    const result = htmlToLatex('<p><b>bold</b></p>');
    expect(result).toContain('\\textbf{bold}');
  });

  it('converts <em> to \\textit{}', () => {
    const result = htmlToLatex('<p>This is <em>italic</em> text</p>');
    expect(result).toContain('\\textit{italic}');
  });

  it('converts <i> to \\textit{}', () => {
    const result = htmlToLatex('<p><i>italic</i></p>');
    expect(result).toContain('\\textit{italic}');
  });

  it('converts <s> to \\sout{}', () => {
    const result = htmlToLatex('<p>This is <s>strikethrough</s></p>');
    expect(result).toContain('\\sout{strikethrough}');
  });

  it('converts <strike> to \\sout{}', () => {
    const result = htmlToLatex('<p><strike>struck</strike></p>');
    expect(result).toContain('\\sout{struck}');
  });

  // ── Links ────────────────────────────────────────────────────────────

  it('converts <a> to \\href{url}{text}', () => {
    const result = htmlToLatex('<p><a href="https://example.com">click here</a></p>');
    expect(result).toContain('\\href{https://example.com}{click here}');
  });

  it('handles <a> without href as plain text', () => {
    const result = htmlToLatex('<p><a>no link</a></p>');
    expect(result).toContain('no link');
    expect(result).not.toContain('\\href');
  });

  // ── Blockquotes ──────────────────────────────────────────────────────

  it('converts <blockquote> to quote environment', () => {
    const result = htmlToLatex('<blockquote><p>Quoted text</p></blockquote>');
    expect(result).toContain('\\begin{quote}');
    expect(result).toContain('Quoted text');
    expect(result).toContain('\\end{quote}');
  });

  // ── Lists ────────────────────────────────────────────────────────────

  it('converts <ul> to itemize environment', () => {
    const result = htmlToLatex('<ul><li>Item one</li><li>Item two</li></ul>');
    expect(result).toContain('\\begin{itemize}');
    expect(result).toContain('\\item Item one');
    expect(result).toContain('\\item Item two');
    expect(result).toContain('\\end{itemize}');
  });

  it('converts <ol> to enumerate environment', () => {
    const result = htmlToLatex('<ol><li>First</li><li>Second</li></ol>');
    expect(result).toContain('\\begin{enumerate}');
    expect(result).toContain('\\item First');
    expect(result).toContain('\\item Second');
    expect(result).toContain('\\end{enumerate}');
  });

  // ── Code / preformatted ─────────────────────────────────────────────

  it('converts <pre><code> to verbatim environment', () => {
    const result = htmlToLatex('<pre><code>const x = 1;\nconsole.log(x);</code></pre>');
    expect(result).toContain('\\begin{verbatim}');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('console.log(x);');
    expect(result).toContain('\\end{verbatim}');
  });

  it('converts standalone <code> to \\texttt{}', () => {
    const result = htmlToLatex('<p>Use the <code>foo()</code> function</p>');
    expect(result).toContain('\\texttt{foo()}');
  });

  // ── Horizontal rule ──────────────────────────────────────────────────

  it('converts <hr> to \\bigskip\\noindent\\hrulefill\\bigskip', () => {
    const result = htmlToLatex('<hr>');
    expect(result).toContain('\\bigskip');
    expect(result).toContain('\\noindent');
    expect(result).toContain('\\hrulefill');
  });

  // ── Images and figures ───────────────────────────────────────────────

  it('converts <img> to \\includegraphics', () => {
    const result = htmlToLatex('<img src="image.png" alt="test">');
    expect(result).toContain('\\includegraphics');
    expect(result).toContain('image.png');
  });

  it('converts <figure> with <figcaption>', () => {
    const html = '<figure><img src="photo.jpg"><figcaption>A nice photo</figcaption></figure>';
    const result = htmlToLatex(html);
    expect(result).toContain('\\begin{figure}[htbp]');
    expect(result).toContain('\\includegraphics');
    expect(result).toContain('photo.jpg');
    expect(result).toContain('\\caption{A nice photo}');
    expect(result).toContain('\\end{figure}');
  });

  // ── Line breaks ──────────────────────────────────────────────────────

  it('converts <br> to \\\\', () => {
    const result = htmlToLatex('<p>Line one<br>Line two</p>');
    expect(result).toContain('\\\\');
  });

  // ── LaTeX escaping ──────────────────────────────────────────────────

  it('escapes LaTeX special characters', () => {
    const result = htmlToLatex('<p>Backslash \\ {curly} $dollar &amp; #hash %percent _underscore ~tilde ^caret</p>');
    expect(result).toContain('\\textbackslash{}');
    expect(result).toContain('\\{');
    expect(result).toContain('\\}');
    expect(result).toContain('\\$');
    expect(result).toContain('\\&');
    expect(result).toContain('\\#');
    expect(result).toContain('\\%');
    expect(result).toContain('\\_');
    expect(result).toContain('\\textasciitilde{}');
    expect(result).toContain('\\textasciicircum{}');
  });

  // ── Unknown elements ──────────────────────────────────────────────

  it('recurses into children of unknown block elements (strips wrapper)', () => {
    const html = `
      <h2>Clean Title</h2>
      <p>Safe paragraph.</p>
      <div><p>Inside div</p></div>
    `;
    const result = htmlToLatex(html);
    expect(result).toContain('\\section{Clean Title}');
    expect(result).toContain('Safe paragraph');
    expect(result).toContain('Inside div');
  });

  // ── Empty input ──────────────────────────────────────────────────────

  it('returns empty string for empty input', () => {
    expect(htmlToLatex('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(htmlToLatex('   \n  \t  ')).toBe('');
  });

  // ── Integration: complex document ───────────────────────────────────

  it('converts a complex document with mixed elements', () => {
    const html = `<h2>Chapter 1</h2>
<p>The first paragraph with <strong>bold</strong> and <em>italic</em>.</p>
<blockquote><p>A wise quote.</p></blockquote>
<ul>
  <li>Item A</li>
  <li>Item B</li>
</ul>
<figure><img src="fig.png"><figcaption>Figure 1</figcaption></figure>`;

    const result = htmlToLatex(html);
    expect(result).toContain('\\section{Chapter 1}');
    expect(result).toContain('\\textbf{bold}');
    expect(result).toContain('\\textit{italic}');
    expect(result).toContain('\\begin{quote}');
    expect(result).toContain('A wise quote');
    expect(result).toContain('\\end{quote}');
    expect(result).toContain('\\begin{itemize}');
    expect(result).toContain('\\item Item A');
    expect(result).toContain('\\item Item B');
    expect(result).toContain('\\end{itemize}');
    expect(result).toContain('\\begin{figure}[htbp]');
    expect(result).toContain('\\includegraphics');
    expect(result).toContain('\\caption{Figure 1}');
    expect(result).toContain('\\end{figure}');
  });
});

describe('escapeLatex', () => {
  it('escapes backslash', () => {
    expect(escapeLatex('\\')).toBe('\\textbackslash{}');
  });

  it('escapes curly braces', () => {
    expect(escapeLatex('{hello}')).toBe('\\{hello\\}');
  });

  it('escapes dollar sign', () => {
    expect(escapeLatex('$10')).toBe('\\$10');
  });

  it('escapes ampersand', () => {
    expect(escapeLatex('A&B')).toBe('A\\&B');
  });

  it('escapes hash', () => {
    expect(escapeLatex('#1')).toBe('\\#1');
  });

  it('escapes percent', () => {
    expect(escapeLatex('100%')).toBe('100\\%');
  });

  it('escapes underscore', () => {
    expect(escapeLatex('hello_world')).toBe('hello\\_world');
  });

  it('escapes tilde', () => {
    expect(escapeLatex('~')).toBe('\\textasciitilde{}');
  });

  it('escapes caret', () => {
    expect(escapeLatex('^')).toBe('\\textasciicircum{}');
  });

  it('escapes all special characters together', () => {
    const result = escapeLatex('\\ { } $ & # % _ ~ ^');
    expect(result).toBe('\\textbackslash{} \\{ \\} \\$ \\& \\# \\% \\_ \\textasciitilde{} \\textasciicircum{}');
  });
});
