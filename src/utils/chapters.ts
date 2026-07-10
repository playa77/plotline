// Version: 1.0.0 | 2026-07-10

/**
 * Represents a parsed chapter from a book outline markdown file.
 *
 * Fields:
 *   - number: the numeric chapter identifier (e.g., 3)
 *   - title:  the chapter title text only (e.g., "The Method")
 *   - label:  human-readable display string (e.g., "Chapter 3: The Method")
 *   - value:  stringified chapter number for use as e.g. a select value ("3")
 */
export interface ChapterOption {
  number: number;
  title: string;
  label: string;
  value: string;
}

/**
 * Parses chapter headings from a book outline in markdown format.
 *
 * The regex matches lines that contain a chapter heading with an optional
 * markdown heading prefix (one or more `#` characters), the literal word
 * "Chapter", a numeric chapter number, a separator (`:`, `—` em dash,
 * `–` en dash, or `-` hyphen), and the chapter title.
 *
 * Supported patterns:
 *   ### Chapter 1: The World You Think You Know
 *   ## Chapter 2: The Diagnosis
 *   ### Chapter 3 — The Method
 *   Chapter 4 - The Conclusion          (no heading markers)
 *   # Chapter 5: The Beginning          (single #)
 *
 * Regex breakdown: /^#{0,3}\s*Chapter\s+(\d+)\s*[:—–-]\s*(.+)$/gm
 *
 *   ^              - start of line (with multiline flag)
 *   #{0,3}         - zero to three # heading markers
 *   \s*            - optional whitespace between markers and "Chapter"
 *   Chapter\s+     - literal "Chapter" followed by required whitespace
 *   (\d+)          - capture group 1: chapter number (one or more digits)
 *   \s*            - optional whitespace around separator
 *   [:—–-]         - separator: colon, em dash, en dash, or hyphen
 *   \s*            - optional whitespace
 *   (.+)           - capture group 2: chapter title (rest of line)
 *
 * @param outlineMarkdown - Raw markdown content of a book outline.
 * @returns An array of ChapterOption objects sorted by chapter number ascending.
 *          Returns an empty array if no chapters are found.
 */
export function parseChaptersFromOutline(outlineMarkdown: string): ChapterOption[] {
  const chapterRegex = /^#{0,3}\s*Chapter\s+(\d+)\s*[:—–-]\s*(.+)$/gm;

  const chapters: ChapterOption[] = [];
  let match: RegExpExecArray | null;

  while ((match = chapterRegex.exec(outlineMarkdown)) !== null) {
    const number = parseInt(match[1], 10);
    const title = match[2].trim();
    chapters.push({
      number,
      title,
      label: `Chapter ${number}: ${title}`,
      value: String(number),
    });
  }

  // Sort by chapter number ascending in case the markdown is out of order
  chapters.sort((a, b) => a.number - b.number);

  return chapters;
}
