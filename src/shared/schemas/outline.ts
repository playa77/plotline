/**
 * Book outline schema (§3.2).
 *
 * Represents the full structural outline of a book project: parts, chapters,
 * sections with beats, and rich-text front/back matter.
 *
 * @module
 * @version 1.0.0 | 2026-07-16
 */

import { z } from 'zod';

// ── Rich-block (discriminated union on `type`) ────────────────────────────────

export const RichBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string() }),
  z.object({ type: z.literal('heading'), level: z.number().min(2).max(4), text: z.string() }),
  z.object({ type: z.literal('list'), ordered: z.boolean(), items: z.array(z.string()) }),
  z.object({ type: z.literal('table'), headers: z.array(z.string()), rows: z.array(z.array(z.string())) }),
]);

export type RichBlock = z.infer<typeof RichBlockSchema>;

// ── Section within a chapter ──────────────────────────────────────────────────

const SectionSchema = z.object({
  id: z.string(), // ULID
  number: z.string(), // e.g. "1.1", "1.2"
  title: z.string(),
  wordTarget: z.number().nullable(),
  beats: z.array(z.string()),
});

// ── Chapter within an outline part ────────────────────────────────────────────

export const OutlineChapterSchema = z.object({
  chapterId: z.string(), // ULID
  title: z.string(),
  wordTarget: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .nullable(),
  sections: z.array(SectionSchema),
});

export type OutlineChapter = z.infer<typeof OutlineChapterSchema>;

// ── Part grouping ─────────────────────────────────────────────────────────────

const OutlinePartSchema = z.object({
  id: z.string(), // ULID
  title: z.string(),
  chapters: z.array(OutlineChapterSchema),
});

// ── Top-level outline ─────────────────────────────────────────────────────────

export const OutlineSchema = z.object({
  schemaVersion: z.literal(1),
  frontMatter: z.array(RichBlockSchema),
  parts: z.array(OutlinePartSchema),
  backMatter: z.array(RichBlockSchema),
});

export type Outline = z.infer<typeof OutlineSchema>;
