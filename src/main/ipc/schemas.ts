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
