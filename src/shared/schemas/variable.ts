/**
 * Story variable schema (§3.3).
 *
 * A named piece of context injected into generation prompts. Variables can be
 * "core" (one of five fixed slots: tone, style, constraints, characters) or
 * custom (user-defined, identified by null core). Their scope controls when
 * they are injected into the prompt.
 *
 * @module
 * @version 1.0.0 | 2026-07-16
 */

import { z } from 'zod';

export const CORE_VARIABLE_TYPES = ['tone', 'style', 'constraints', 'characters'] as const;
export type CoreVariableType = (typeof CORE_VARIABLE_TYPES)[number];

export const VARIABLE_SCOPES = ['always', 'expand', 'write', 'manual'] as const;
export type VariableScope = (typeof VARIABLE_SCOPES)[number];

export const VariableSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(), // ULID
  name: z.string(),
  core: z.enum(['tone', 'style', 'constraints', 'characters']).nullable(),
  scope: z.enum(['always', 'expand', 'write', 'manual']),
  active: z.boolean().default(true),
  order: z.number().int().min(0),
});

export type Variable = z.infer<typeof VariableSchema>;
