/**
 * Story variable schema — unified registry for all variable kinds.
 *
 * Every variable — builtin, system, or custom — lives in one registry
 * with one schema. Variables are stored in Git under
 * `variables/<id>/variable.json` (metadata) and `variables/<id>/content.html`
 * (content). Cards (for Character / Voice Sheets) live under
 * `variables/<id>/cards/<cardId>.html`.
 *
 * Schema version: 2 (was 1 in the legacy VariableSchema).
 *
 * @module
 * @version 2.0.0 | 2026-07-17
 */

import { z } from 'zod';

// ── Constants ────────────────────────────────────────────────────────────────

export const VARIABLE_SCOPES = ['always', 'expand', 'write', 'manual'] as const;
export type VariableScope = (typeof VARIABLE_SCOPES)[number];

export const VARIABLE_KINDS = ['builtin', 'system', 'custom'] as const;
export type StoryVariableKind = (typeof VARIABLE_KINDS)[number];

/**
 * Persistent slugs for the five non-custom variables.
 * These are used as variable IDs for builtin/system variables and can never
 * be used as names for custom variables (case-insensitive check).
 */
export const BUILTIN_SLUGS = ['tone', 'style', 'constraints', 'characters'] as const;
export const SYSTEM_SLUGS = ['global-constraints'] as const;
export const RESERVED_NAMES = [...BUILTIN_SLUGS, ...SYSTEM_SLUGS] as const;
type ReservedName = (typeof RESERVED_NAMES)[number];

// ── Display names for reserved-slug variables ─────────────────────────────────

export const RESERVED_DISPLAY_NAMES: Record<ReservedName, string> = {
  tone: 'Tone',
  style: 'Writing Style',
  constraints: 'Plot Constraints',
  characters: 'Character / Voice Sheets',
  'global-constraints': 'Global Constraints',
};

// ── isReservedName ────────────────────────────────────────────────────────────

/**
 * Check whether a name would conflict with a reserved slug (case-insensitive).
 * Used to reject custom variable creation/renaming when the name matches
 * any of the five persistent slugs.
 */
export function isReservedName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return (RESERVED_NAMES as readonly string[]).includes(lower);
}

// ── StoryVariable schema (v2) ────────────────────────────────────────────────

export const StoryVariableSchema = z.object({
  schemaVersion: z.literal(2),
  /** ULID for custom variables; slug string for builtin/system variables. */
  id: z.string(),
  /** Display name; unique per project (case-insensitive). */
  name: z.string(),
  /** Variable category. */
  kind: z.enum(VARIABLE_KINDS),
  /** Substack-safe HTML content (stored in content.html, NOT in this metadata). */
  scope: z.enum(VARIABLE_SCOPES),
  /** When true, scope cannot be changed by the user. */
  scopeLocked: z.boolean(),
  /** When false, variable cannot be deleted. */
  deletable: z.boolean(),
  /** When false, variable cannot be renamed. */
  renamable: z.boolean(),
  /** Injection + display order within the variable's kind group. */
  position: z.number().int().min(0),
  /** ISO 8601 creation timestamp. */
  createdAt: z.string(),
  /** ISO 8601 last-updated timestamp. */
  updatedAt: z.string(),
});

export type StoryVariable = z.infer<typeof StoryVariableSchema>;

// ── Legacy Variable type alias for backward compat until WP-VARS-2 ───────────
// The renderer imports `Variable` from this module. It is now `StoryVariable`.
export type Variable = StoryVariable;
