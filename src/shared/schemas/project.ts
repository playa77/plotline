/**
 * Project manifest schema (§3.1).
 *
 * The top-level envelope for a book project. Every project has exactly one
 * manifest, stored at the root of the book-project Git repo.
 *
 * @module
 * @version 1.0.0 | 2026-07-16
 */

import { z } from 'zod';

// ── Model reference ──────────────────────────────────────────────────────────

export const ModelRefSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

export type ModelRef = z.infer<typeof ModelRefSchema>;

// ── Version entry (inline, shared between structure variants) ─────────────────

const VersionEntrySchema = z.object({
  slug: z.string(),
  name: z.string(),
  createdAt: z.string(), // ISO 8601
  createdFrom: z
    .object({
      ref: z.string(),
      commit: z.string(),
    })
    .nullable(),
  archived: z.boolean().default(false),
});

// ── Chapter entry (used in both part-nested and top-level chapter items) ──────

export const ChapterEntrySchema = z.object({
  id: z.string(), // ULID
  title: z.string(),
  selectedVersion: z.string().default('main'),
  versions: z.array(VersionEntrySchema),
  wordTarget: z
    .object({
      min: z.number().int().positive(),
      max: z.number().int().positive(),
    })
    .nullable(),
});

export type ChapterEntry = z.infer<typeof ChapterEntrySchema>;

// ── Structure item (discriminated union on `kind`) ────────────────────────────

const PartItemSchema = z.object({
  kind: z.literal('part'),
  id: z.string(), // ULID
  title: z.string(),
  chapters: z.array(ChapterEntrySchema),
});

const ChapterItemSchema = z.object({
  kind: z.literal('chapter'),
  ...ChapterEntrySchema.shape,
});

const StructureItemSchema = z.discriminatedUnion('kind', [
  PartItemSchema,
  ChapterItemSchema,
]);

// ── Project settings ──────────────────────────────────────────────────────────

const ProjectSettingsSchema = z.object({
  continuityContext: z.object({
    enabled: z.boolean().default(true),
    words: z.number().int().positive().default(500),
  }),
  models: z.object({
    expand: ModelRefSchema,
    write: ModelRefSchema,
    iterate: ModelRefSchema,
  }),
  inference: z.object({
    baseUrl: z.string().url(),
  }),
});

// ── Top-level project manifest ────────────────────────────────────────────────

export const ProjectSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string(),
  title: z.string(),
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(), // ISO 8601
  settings: ProjectSettingsSchema,
  structure: z.array(StructureItemSchema),
});

export type Project = z.infer<typeof ProjectSchema>;
