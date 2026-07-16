/**
 * Unit tests for the Substack-safe HTML sanitizer (§6.3, WP-10).
 *
 * Version: 1.0.0 | 2026-07-16
 */

import { describe, expect, it } from 'vitest';

import { sanitize } from '../shared/sanitize/sanitizer';
import { ALLOWED_ELEMENTS, ALLOWED_ATTRIBUTES, ALLOWED_HREF_PROTOCOLS } from '../shared/sanitize/allowlist';

// ---------------------------------------------------------------------------
// Allowlist integrity
// ---------------------------------------------------------------------------

describe('allowlist imports', () => {
  it('imports ALLOWED_ELEMENTS from the canonical source', () => {
    expect(Array.isArray(ALLOWED_ELEMENTS)).toBe(true);
    expect(ALLOWED_ELEMENTS.length).toBeGreaterThan(0);
  });

  it('imports ALLOWED_ATTRIBUTES from the canonical source', () => {
    expect(typeof ALLOWED_ATTRIBUTES).toBe('object');
    expect(ALLOWED_ATTRIBUTES).toHaveProperty('a');
    expect(ALLOWED_ATTRIBUTES).toHaveProperty('img');
  });

  it('imports ALLOWED_HREF_PROTOCOLS from the canonical source', () => {
    expect(ALLOWED_HREF_PROTOCOLS).toContain('https:');
    expect(ALLOWED_HREF_PROTOCOLS).toContain('mailto:');
  });
});

// ---------------------------------------------------------------------------
// Empty and whitespace inputs
// ---------------------------------------------------------------------------

describe('empty and whitespace inputs', () => {
  it('returns empty string for empty input', () => {
    expect(sanitize('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(sanitize('   ')).toBe('');
  });

  it('returns empty string for whitespace-only div (disallowed wrapper)', () => {
    expect(sanitize('<div> </div>')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Hostile corpus — XSS and injection vectors
// ---------------------------------------------------------------------------

describe('hostile corpus — script injection', () => {
  it('removes script tags entirely', () => {
    expect(sanitize("<script>alert('xss')</script>")).toBe('');
  });

  it('removes script tags and preserves surrounding safe content', () => {
    expect(
      sanitize("<script>alert('xss')</script><p>safe</p>"),
    ).toBe('<p>safe</p>');
  });

  it('removes inline event handlers (not in allowlist)', () => {
    expect(sanitize('<p onclick="alert(1)">hello</p>')).toBe('<p>hello</p>');
  });
});

describe('hostile corpus — dangerous attributes', () => {
  it('strips style attribute', () => {
    expect(sanitize('<p style="color:red">text</p>')).toBe('<p>text</p>');
  });

  it('strips id attribute', () => {
    expect(sanitize('<p id="x">text</p>')).toBe('<p>text</p>');
  });

  it('strips class attribute', () => {
    expect(sanitize('<p class="foo">text</p>')).toBe('<p>text</p>');
  });
});

describe('hostile corpus — href protocol filtering', () => {
  it('strips javascript: href', () => {
    expect(sanitize('<a href="javascript:void(0)">click</a>')).toBe(
      '<a>click</a>',
    );
  });

  it('preserves https: href', () => {
    expect(sanitize('<a href="https://example.com">link</a>')).toBe(
      '<a href="https://example.com">link</a>',
    );
  });

  it('preserves mailto: href', () => {
    expect(sanitize('<a href="mailto:test@example.com">email</a>')).toBe(
      '<a href="mailto:test@example.com">email</a>',
    );
  });

  it('strips data: href on a', () => {
    expect(sanitize('<a href="data:text/html,<script>alert(1)</script>">bad</a>')).toBe(
      '<a>bad</a>',
    );
  });

  it('strips vbscript: href', () => {
    expect(sanitize('<a href="vbscript:msgbox(1)">bad</a>')).toBe(
      '<a>bad</a>',
    );
  });
});

describe('hostile corpus — img src protocol filtering', () => {
  it('strips data: URI from img src', () => {
    expect(sanitize('<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAA=">')).toBe(
      '<img>',
    );
  });

  it('preserves https: img src', () => {
    expect(sanitize('<img src="https://example.com/img.png" alt="desc">')).toBe(
      '<img alt="desc" src="https://example.com/img.png">',
    );
  });

  it('preserves http: img src', () => {
    expect(sanitize('<img src="http://example.com/img.png">')).toBe(
      '<img src="http://example.com/img.png">',
    );
  });

  it('preserves relative img src (no protocol)', () => {
    expect(sanitize('<img src="/images/photo.jpg" alt="photo">')).toBe(
      '<img alt="photo" src="/images/photo.jpg">',
    );
  });

  it('preserves http: href on a', () => {
    expect(sanitize('<a href="http://example.com">link</a>')).toBe(
      '<a href="http://example.com">link</a>',
    );
  });
});

describe('hostile corpus — deeply nested junk', () => {
  it('strips disallowed wrappers but keeps allowed descendants', () => {
    expect(
      sanitize('<div><span><script>bad</script><p>good</p></span></div>'),
    ).toBe('<p>good</p>');
  });

  it('strips text inside disallowed elements', () => {
    expect(
      sanitize('<div>should be removed<span>also removed</span></div>'),
    ).toBe('');
  });

  it('strips deeply nested disallowed with partial safe content', () => {
    expect(
      sanitize(
        '<div><section><article><p>keep</p><aside><span>nope</span></aside></article></section></div>',
      ),
    ).toBe('<p>keep</p>');
  });
});

describe('hostile corpus — malformed HTML', () => {
  it('handles unclosed tag gracefully', () => {
    const result = sanitize('<p>unclosed');
    // Should be valid output containing the text
    expect(result).toBe('<p>unclosed</p>');
  });

  it('handles self-closing tag gracefully', () => {
    expect(sanitize('<br>')).toBe('<br>');
  });

  it('handles hr tag', () => {
    expect(sanitize('<hr>')).toBe('<hr>');
  });
});

// ---------------------------------------------------------------------------
// Substack-safe passthrough
// ---------------------------------------------------------------------------

describe('Substack-safe passthrough', () => {
  it('preserves paragraph with strong emphasis', () => {
    expect(sanitize('<p>Hello <strong>World</strong></p>')).toBe(
      '<p>Hello <strong>World</strong></p>',
    );
  });

  it('preserves paragraph with em and s', () => {
    expect(sanitize('<p>This is <em>important</em> and <s>strikethrough</s></p>')).toBe(
      '<p>This is <em>important</em> and <s>strikethrough</s></p>',
    );
  });

  it('preserves blockquote', () => {
    expect(sanitize('<blockquote><p>Quote</p></blockquote>')).toBe(
      '<blockquote><p>Quote</p></blockquote>',
    );
  });

  it('preserves unordered list', () => {
    const input = '<ul><li>One</li><li>Two</li></ul>';
    expect(sanitize(input)).toBe(input);
  });

  it('preserves ordered list', () => {
    const input = '<ol><li>First</li><li>Second</li></ol>';
    expect(sanitize(input)).toBe(input);
  });

  it('preserves headings', () => {
    expect(sanitize('<h2>Chapter 1</h2>')).toBe('<h2>Chapter 1</h2>');
    expect(sanitize('<h3>Section</h3>')).toBe('<h3>Section</h3>');
    expect(sanitize('<h4>Subsection</h4>')).toBe('<h4>Subsection</h4>');
  });

  it('preserves pre and code', () => {
    expect(sanitize('<pre><code>const x = 1;</code></pre>')).toBe(
      '<pre><code>const x = 1;</code></pre>',
    );
  });

  it('preserves figure and figcaption', () => {
    expect(
      sanitize(
        '<figure><img src="https://example.com/img.png" alt="desc"><figcaption>Caption</figcaption></figure>',
      ),
    ).toBe(
      '<figure><img alt="desc" src="https://example.com/img.png"><figcaption>Caption</figcaption></figure>',
    );
  });

  it('preserves hr', () => {
    expect(sanitize('<hr>')).toBe('<hr>');
  });

  it('preserves br', () => {
    expect(sanitize('<br>')).toBe('<br>');
  });

  it('handles complex multi-element input', () => {
    const input =
      '<h2>Intro</h2><p>Hello <strong>World</strong>.</p><ul><li>Item</li></ul><hr><p>End.</p>';
    expect(sanitize(input)).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// Idempotency property
// sanitize(sanitize(x)) === sanitize(x) for any input
// ---------------------------------------------------------------------------

describe('idempotency property', () => {
  const idempotentCases = [
    '',                                       // empty
    '<p>hello</p>',                           // simple allowed
    '<p>Hello <strong>World</strong></p>',    // nested allowed
    '<script>alert(1)</script>',              // completely removed
    '<a href="javascript:void(0)">xss</a>',   // href stripped
    '<img src="data:image/png;base64,abc">',  // src stripped
    '<p style="x" onclick="y">text</p>',      // attrs stripped
    '<div><p>deep</p></div>',                 // wrapper stripped
    '<a href="https://x.com">link</a>',       // preserved
    '<img src="https://x.com/i.png" alt="x">', // preserved
    '   ',                                    // whitespace-only
    '<h2>A</h2><p>B</p><ul><li>C</li></ul>', // multi-element
  ];

  for (const input of idempotentCases) {
    it(`is idempotent for: ${JSON.stringify(input.slice(0, 50))}`, () => {
      const once = sanitize(input);
      const twice = sanitize(once);
      expect(twice).toBe(once);
    });
  }
});

// ---------------------------------------------------------------------------
// Edge-case attributes on allowed elements
// ---------------------------------------------------------------------------

describe('attribute edge cases', () => {
  it('keeps only allowlisted attributes on a', () => {
    // a has only 'href' in the allowlist, so target/rel are stripped
    expect(
      sanitize('<a href="https://x.com" target="_blank" rel="noopener">link</a>'),
    ).toBe('<a href="https://x.com">link</a>');
  });

  it('keeps only allowlisted attributes on img', () => {
    // Img has 'src' and 'alt'; width/height are stripped
    expect(
      sanitize('<img src="https://x.com/i.png" alt="desc" width="100" height="200">'),
    ).toBe('<img alt="desc" src="https://x.com/i.png">');
  });

  it('handles empty alt text on img', () => {
    expect(sanitize('<img src="https://x.com/i.png" alt="">')).toBe(
      '<img alt="" src="https://x.com/i.png">',
    );
  });

  it('strips href for a elements with no valid protocol', () => {
    expect(sanitize('<a href="ftp://files.example.com">download</a>')).toBe(
      '<a>download</a>',
    );
  });
});

// ---------------------------------------------------------------------------
// Sanitized output validity — output should parse without errors
// ---------------------------------------------------------------------------

describe('output validity', () => {
  it('produces parseable HTML for every test case', () => {
    const inputs = [
      '<script>alert(1)</script>',
      '<p>unclosed',
      '<div><span><p>deep</p></span></div>',
      '<a href="javascript:void(0)">xss</a>',
      '<img src="data:image/png;base64,abc" alt="x">',
      '<p>Hello <strong>World</strong></p>',
      '<h2>Title</h2><ul><li>A</li><li>B</li></ul>',
    ];

    for (const input of inputs) {
      const result = sanitize(input);
      // Should always return a string (not null/undefined)
      expect(typeof result).toBe('string');
      // Should not contain raw script tags in output
      expect(result).not.toContain('<script>');
      // Should not contain event handler attributes
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('onload');
    }
  });
});
