/**
 * Chapter meta schema (§3.4).
 *
 * Describes how a chapter version was generated, including the model used,
 * the template, the instruction, and a set of fingerprints that tie the output
 * to its exact inputs (outline slice, variable content, upstream chapter,
 * continuity context).
 *
 * @module
 * @version 1.0.0 | 2026-07-16
 */

import { z } from 'zod';
import { ModelRefSchema } from './project';

// ── Generation record (attached to expanded + chapter generation) ─────────────

export const GenRecordSchema = z.object({
  generatedAt: z.string(), // ISO 8601
  model: ModelRefSchema,
  templateId: z.string(),
  templateVersion: z.string(), // semver
  kind: z.enum(['expand', 'write', 'iterate']),
  instruction: z.string().nullable(),
  fingerprints: z.object({
    outlineSlice: z.string(), // SHA
    variables: z.array(
      z.object({
        variableId: z.string(),
        contentSha: z.string(),
      }),
    ),
    upstream: z.string().nullable(),
    continuity: z
      .object({
        chapterId: z.string(),
        sha: z.string(),
      })
      .nullable(),
  }),
});

export type GenRecord = z.infer<typeof GenRecordSchema>;

// ── Top-level chapter meta ────────────────────────────────────────────────────

export const MetaSchema = z.object({
  schemaVersion: z.literal(1),
  chapterId: z.string(), // ULID
  expanded: GenRecordSchema.nullable(),
  chapter: GenRecordSchema.nullable(),
});

export type Meta = z.infer<typeof MetaSchema>;
