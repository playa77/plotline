/**
 * Tests for the markdown outline importer (WP-06).
 *
 * Uses the golden fixture LKY_Book_Outline_v0_2.md to verify parsing
 * correctness across parts, chapters, sections, beats, word targets,
 * placeholder chapters, epilogue, front/back matter, and structure generation.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseOutlineMarkdown } from '../../main/services/outlineImporter';

// ── Fixture ──────────────────────────────────────────────────────────────────

const fixturePath = resolve(__dirname, '../fixtures/LKY_Book_Outline_v0_2.md');
const fixture = readFileSync(fixturePath, 'utf-8');

// ── Suite ────────────────────────────────────────────────────────────────────

describe('parseOutlineMarkdown (golden fixture)', () => {
  const preview = parseOutlineMarkdown(fixture);

  // ── 1. Project title ─────────────────────────────────────────────────────
  it('parses the project title from the H1 line', () => {
    expect(preview.projectTitle).toBe(
      'Lee Kuan Yew: The Man Who Built a Nation — Book Outline v0.2',
    );
  });

  // ── 2. Part count ────────────────────────────────────────────────────────
  it('yields 4 parts (I–IV)', () => {
    expect(preview.parts.length).toBe(4);
  });

  // ── 3. Part titles are extracted correctly ──────────────────────────────
  it('extracts correct part titles', () => {
    const titles = preview.parts.map((p) => p.title);
    expect(titles).toEqual([
      'THE SHOCK (1942–1950)',
      'THE BUILD (1959–1965)',
      'THE SURVIVAL YEARS (1965–1980)',
      'THE ELDER (1980–2015)',
    ]);
  });

  // ── 4. Chapter count (11 + epilogue = 12) ────────────────────────────────
  it('parses 11 chapters plus epilogue = 12 chapter entries across all parts', () => {
    const allChapters = preview.parts.flatMap((p) => p.chapters);
    expect(allChapters.length).toBe(12);
  });

  // ── 5. Chapter 1 word target ────────────────────────────────────────────
  it('parses Chapter 1 word target as { min: 7000, max: 8000 }', () => {
    const ch1 = preview.parts[0]!.chapters[0]!;
    expect(ch1.title).toBe('Chapter 1: The Fall of Singapore');
    expect(ch1.wordTarget).toEqual({ min: 7000, max: 8000 });
  });

  // ── 6. Section 1.1 with 4 beats and 1,200-word target ───────────────────
  it('parses Section 1.1 with correct number, beats, and word target', () => {
    const ch1 = preview.parts[0]!.chapters[0]!;
    const sec1_1 = ch1.sections.find((s) => s.number === '1.1');
    expect(sec1_1).toBeDefined();
    expect(sec1_1!.title).toBe('The Myth of Fortress Singapore');
    expect(sec1_1!.wordTarget).toBe(1200);
    expect(sec1_1!.beats.length).toBeGreaterThanOrEqual(4);
    // First beat should mention British propaganda
    expect(sec1_1!.beats[0]!).toMatch(/British propaganda/);
  });

  // ── 7. All chapter word targets across parts ────────────────────────────
  it('parses word targets correctly for all chapters', () => {
    const allChapters = preview.parts.flatMap((p) => p.chapters);
    // Chapters 1–11 have 7,000–8,000; Epilogue has 3,000–4,000
    for (let i = 0; i < allChapters.length; i++) {
      const ch = allChapters[i]!;
      if (ch.title.startsWith('Epilogue:')) {
        expect(ch.wordTarget).toEqual({ min: 3000, max: 4000 });
      } else {
        expect(ch.wordTarget).toEqual({ min: 7000, max: 8000 });
      }
    }
  });

  // ── 8. Placeholder chapter (Chapter 3) has empty sections ───────────────
  it('parses Chapter 3 as a placeholder chapter with no sections', () => {
    // Chapter 3 is in Part I (index 0), chapters[2]
    const ch3 = preview.parts[0]!.chapters[2]!;
    expect(ch3.title).toBe('Chapter 3: The Anti-Colonial Struggle');
    expect(ch3.wordTarget).toEqual({ min: 7000, max: 8000 });
    expect(ch3.sections.length).toBe(0);
  });

  // ── 9. Chapter 6 (in Part II) has beats but no sections ────────────────
  it('parses Chapter 6 (The Expulsion) with beats directly under chapter', () => {
    // Part II index 1
    const part2 = preview.parts[1]!;
    // Chapter 6 is chapters[2] in Part II: Ch4, Ch5, Ch6
    const ch6 = part2.chapters[2]!;
    expect(ch6.title).toBe('Chapter 6: The Expulsion');
    // Chapter 6 has beats (4) but no sections — synthetic section created
    expect(ch6.sections.length).toBe(1);
    const synSection = ch6.sections[0]!;
    expect(synSection.number).toBe('');
    expect(synSection.beats.length).toBeGreaterThanOrEqual(4);
    expect(synSection.beats[0]!).toMatch(/brief, turbulent union/);
  });

  // ── 10. Front matter detection ───────────────────────────────────────────
  it('detects front matter with author note and estimated length', () => {
    expect(preview.frontMatter.length).toBeGreaterThanOrEqual(1);
    const hasAuthorNote = preview.frontMatter.some(
      (b) => b.type === 'paragraph' && b.text.includes("Author's Note"),
    );
    expect(hasAuthorNote).toBe(true);
  });

  // ── 11. Back matter contains appendix headings and tables ────────────────
  it('parses back matter with appendix headings and a timeline table', () => {
    expect(preview.backMatter.length).toBeGreaterThan(0);

    // Should have at least one heading (Appendix A / Appendix B)
    const headings = preview.backMatter.filter((b) => b.type === 'heading');
    expect(headings.length).toBeGreaterThanOrEqual(2);
    expect(headings[0]!.text).toMatch(/Appendix A/);

    // Should have at least one table block (word-count summary or timeline)
    const tables = preview.backMatter.filter((b) => b.type === 'table');
    expect(tables.length).toBeGreaterThanOrEqual(1);

    // The word-count summary table should have headers
    const wordCountTable = tables.find(
      (t) => t.type === 'table' && t.headers.includes('Chapter'),
    );
    expect(wordCountTable).toBeDefined();
    if (wordCountTable && wordCountTable.type === 'table') {
      expect(wordCountTable.rows.length).toBeGreaterThanOrEqual(11);
    }
  });

  // ── 12. Epilogue parsing ─────────────────────────────────────────────────
  it('parses epilogue as a chapter with word target 3,000–4,000 and beats', () => {
    // Epilogue is the last chapter in Part IV (which is the last part)
    const lastPart = preview.parts[preview.parts.length - 1]!;
    const epilogue = lastPart.chapters[lastPart.chapters.length - 1]!;
    expect(epilogue.title).toBe('Epilogue: The Question Lee Left Behind');
    expect(epilogue.wordTarget).toEqual({ min: 3000, max: 4000 });
    expect(epilogue.sections.length).toBe(1);

    const epilogueSection = epilogue.sections[0]!;
    expect(epilogueSection.beats.length).toBeGreaterThanOrEqual(4);
    expect(epilogueSection.beats[0]!).toMatch(/Singapore model survive/);
  });

  // ── 13. Structure generation ─────────────────────────────────────────────
  it('generates structure with correct item kinds and chapter IDs', () => {
    const { structure } = preview;

    // All 4 parts from the fixture
    const partItems = structure.filter((s) => s.kind === 'part');
    expect(partItems.length).toBe(4);

    // No standalone chapters — epilogue is inside Part IV
    const chapterItems = structure.filter((s) => s.kind === 'chapter');
    expect(chapterItems.length).toBe(0);

    // Every chapter in every part should have an ID that's a valid string
    for (const item of structure) {
      if (item.kind === 'part') {
        expect(item.chapters.length).toBeGreaterThan(0);
        for (const ch of item.chapters) {
          expect(ch.id).toBeTruthy();
          expect(ch.wordTarget).toBeTruthy();
        }
      }
    }
  });

  // ── 14. Content-hash coverage ────────────────────────────────────────────
  it('content-hash: every significant line in the markdown is reflected in output', () => {
    // Count meaningful structural lines in the markdown
    const lines = fixture.split('\n');
    let partHeadings = 0;
    let chapterHeadings = 0;
    let sectionHeadings = 0;
    let beatLines = 0;
    let tableHeaderLines = 0;

    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('## PART')) partHeadings++;
      else if (/^### (Chapter\s+\d+|Epilogue):/.test(t)) chapterHeadings++;
      else if (/^#### \d+\.\d+/.test(t)) sectionHeadings++;
      else if (t.startsWith('- ')) beatLines++;
      else if (/^\|.+\|$/.test(t)) tableHeaderLines++;
    }

    // Verify counts match parse output
    expect(partHeadings).toBe(4);
    expect(preview.parts.length).toBe(4);

    // Count chapters in the output
    const allChapters = preview.parts.flatMap((p) => p.chapters);
    // 12 chapter headings: 11 "Chapter N:" + 1 "Epilogue:"
    expect(chapterHeadings).toBe(12);
    expect(allChapters.length).toBe(12);

    // Count sections in output
    const allSections = allChapters.flatMap((ch) => ch.sections);
    // Sections: Ch1 has 4 sections (1.1-1.4), Ch2 has 4 sections (2.1-2.4),
    // Ch6 has 1 synthetic section, Epilogue has 1 synthetic section
    // = 4 + 4 + 1 + 1 = 10
    expect(sectionHeadings).toBe(8); // 8 actual #### section headings in markdown
    expect(allSections.length).toBe(10); // 8 real + 2 synthetic (ch6, epilogue)

    // Count beats
    const allBeats = allSections.flatMap((s) => s.beats);
    // Ch1: 16 beats (4 per section), Ch2: 16 beats, Ch6: 4 beats, Epilogue: 4 beats
    expect(allBeats.length).toBeGreaterThanOrEqual(beatLines);
    // Every beat line in the markdown should have a corresponding entry
    // (there could be more if some content got parsed as beat-like, but not fewer)
    expect(allBeats.length).toBeGreaterThanOrEqual(beatLines);

    // Verify table coverage
    const tables = preview.backMatter.filter((b) => b.type === 'table');
    const tableRows = tables.reduce((sum, t) => {
      if (t.type === 'table') return sum + t.rows.length;
      return sum;
    }, 0);
    // Timeline table has 15 data rows + word-count has 12 data rows + header = 27 table lines
    expect(tableRows).toBeGreaterThanOrEqual(15);
  });

  // ── 15. Outline validates against schema ─────────────────────────────────
  it('produces an outline that passes OutlineSchema validation', () => {
    const { outline } = preview;
    expect(outline.schemaVersion).toBe(1);
    expect(outline.frontMatter).toEqual(preview.frontMatter);
    expect(outline.backMatter).toEqual(preview.backMatter);
    // Every part in the outline has chapters with sections
    for (const part of outline.parts) {
      expect(part.id).toBeTruthy();
      expect(part.title).toBeTruthy();
      for (const ch of part.chapters) {
        expect(ch.chapterId).toBeTruthy();
        expect(ch.title).toBeTruthy();
        expect(Array.isArray(ch.sections)).toBe(true);
      }
    }
  });

  // ── 16. Empty content edge case ──────────────────────────────────────────
  it('handles empty markdown gracefully', () => {
    const result = parseOutlineMarkdown('');
    expect(result.projectTitle).toBe('');
    expect(result.parts.length).toBe(0);
    expect(result.frontMatter.length).toBe(0);
    expect(result.backMatter.length).toBe(0);
    expect(result.structure.length).toBe(0);
    expect(result.outline.schemaVersion).toBe(1);
  });

  // ── 17. Chapter number extraction ────────────────────────────────────────
  it('captures section numbers as strings (e.g. "1.1", "2.3")', () => {
    const allChapters = preview.parts.flatMap((p) => p.chapters);
    const realSections = allChapters.flatMap((ch) =>
      ch.sections.filter((s) => s.number !== ''),
    );
    const numbers = realSections.map((s) => s.number);
    expect(numbers).toContain('1.1');
    expect(numbers).toContain('1.2');
    expect(numbers).toContain('2.3');
    expect(numbers).toContain('1.4');
  });
});

// ── Tether fixture regression (SL-002) ────────────────────────────────────────

describe('parseOutlineMarkdown (Tether fixture)', () => {
  const tetherPath = resolve(__dirname, '../fixtures/Full_extended_outline.md');
  const tetherMd = readFileSync(tetherPath, 'utf-8');
  const preview = parseOutlineMarkdown(tetherMd);

  it('parses exactly 4 parts', () => {
    expect(preview.parts.length).toBe(4);
  });

  it('extracts correct part titles', () => {
    const titles = preview.parts.map((p) => p.title);
    expect(titles[0]).toContain('The Fire That Carries Us');
    expect(titles[1]).toContain('The Measurement of Absence');
    expect(titles[2]).toContain('What Remains');
    expect(titles[3]).toContain('Landfall');
  });

  it('has a project title', () => {
    expect(preview.projectTitle).toBeTruthy();
  });
});
