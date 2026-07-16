/**
 * Zod schemas for IPC command payloads.
 *
 * Schemas are kept separate from handlers so they can be imported
 * and tested independently (Electron-free).
 *
 * Version: 0.2.0 | 2026-07-16
 */
import { z } from 'zod';
import type { ParsePreview, OutlineMutation } from '../../shared/schemas/outline';
import type { IpcCommandMap } from '../../shared/ipc';

/** Validates that timestamp is a finite number. */
export const PingRequestSchema = z.object({
  timestamp: z.number(),
});

/** Validates project:create request. */
export const CreateProjectRequestSchema = z.object({
  title: z.string().min(1, 'Title is required'),
});

/** Validates project:open request. */
export const OpenProjectRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
});

/** Validates project:list request. */
export const ListProjectsRequestSchema = z.object({});

/** Validates project:close request. */
export const CloseProjectRequestSchema = z.object({
  projectId: z.string().optional(),
});

/** Validates project:importOutline request. */
export const ImportOutlineRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  markdown: z.string().min(1, 'Markdown content is required'),
});

/** Validates project:confirmImport request. */
export const ConfirmImportRequestSchema: z.ZodType<IpcCommandMap['project:confirmImport']['request']> = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  preview: z.custom<ParsePreview>((v) => v != null, { message: 'preview is required' }),
});

/** Validates outline:get request. */
export const OutlineGetRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
});

/** Validates outline:mutate request. */
export const OutlineMutateRequestSchema: z.ZodType<{ projectId: string; mutations: OutlineMutation[] }> = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  mutations: z.array(
    z.custom<OutlineMutation>((v) => v != null, { message: 'Each mutation must be a valid OutlineMutation' }),
  ).min(1, 'At least one mutation is required'),
});

// ── Variable schemas (WP-11) ─────────────────────────────────────────────

/** Validates variables:list request. */
export const VariablesListRequestSchema = z.object({
  projectId: z.string().min(1),
});

/** Validates variables:get request. */
export const VariablesGetRequestSchema = z.object({
  projectId: z.string().min(1),
  variableId: z.string().min(1),
});

/** Validates variables:save request. */
export const VariablesSaveRequestSchema = z.object({
  projectId: z.string().min(1),
  variableId: z.string().min(1),
  content: z.string(),
});

/** Validates variables:create request. */
export const VariablesCreateRequestSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  core: z.enum(['tone', 'style', 'constraints', 'characters']).nullable().optional(),
  scope: z.enum(['always', 'expand', 'write', 'manual']).optional(),
});

/** Validates variables:setScope request. */
export const VariablesSetScopeRequestSchema = z.object({
  projectId: z.string().min(1),
  variableId: z.string().min(1),
  scope: z.enum(['always', 'expand', 'write', 'manual']),
});

/** Validates variables:setActive request. */
export const VariablesSetActiveRequestSchema = z.object({
  projectId: z.string().min(1),
  variableId: z.string().min(1),
  active: z.boolean(),
});

/** Validates variables:archive request. */
export const VariablesArchiveRequestSchema = z.object({
  projectId: z.string().min(1),
  variableId: z.string().min(1),
});

/** Validates variables:listCards request. */
export const VariablesListCardsRequestSchema = z.object({
  projectId: z.string().min(1),
  variableId: z.string().min(1),
});

/** Validates variables:addCard request. */
export const VariablesAddCardRequestSchema = z.object({
  projectId: z.string().min(1),
  variableId: z.string().min(1),
  title: z.string().min(1),
});

/** Validates variables:saveCard request. */
export const VariablesSaveCardRequestSchema = z.object({
  projectId: z.string().min(1),
  variableId: z.string().min(1),
  cardId: z.string().min(1),
  content: z.string(),
});

/** Validates variables:removeCard request. */
export const VariablesRemoveCardRequestSchema = z.object({
  projectId: z.string().min(1),
  variableId: z.string().min(1),
  cardId: z.string().min(1),
});

// ── Secrets schemas ───────────────────────────────────────────────────────────

export const SecretsSetApiKeyRequestSchema = z.object({
  key: z.string().min(1, 'API key is required'),
});

export const SecretsHasApiKeyRequestSchema = z.object({});

// ── Generation schemas ─────────────────────────────────────────────────────────

const GenerateOptionsSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  chapterId: z.string().min(1, 'Chapter ID is required'),
  versionSlug: z.string().optional(),
  excludeVariableIds: z.array(z.string()).optional(),
  asNewVersion: z.string().optional(),
});

export const GenerateExpandRequestSchema = GenerateOptionsSchema;

export const GenerateWriteRequestSchema = GenerateOptionsSchema;

export const GenerateIterateRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  chapterId: z.string().min(1, 'Chapter ID is required'),
  stage: z.enum(['expanded', 'chapter']),
  versionSlug: z.string().optional(),
  instruction: z.string().min(1, 'Instruction is required'),
  excludeVariableIds: z.array(z.string()).optional(),
});

export const GenerateCancelRequestSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
});

// ── Chapter schemas (WP-15) ────────────────────────────────────────────────────

export const ChapterGetArtifactRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  chapterId: z.string().min(1, 'Chapter ID is required'),
  versionSlug: z.string().optional(),
  stage: z.enum(['outline', 'expanded', 'chapter']),
});

export const ChapterSaveArtifactRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  chapterId: z.string().min(1, 'Chapter ID is required'),
  versionSlug: z.string().optional(),
  stage: z.enum(['expanded', 'chapter']),
  html: z.string(),
});

export const ChapterGetStatusRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  chapterId: z.string().min(1, 'Chapter ID is required'),
});
