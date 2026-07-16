/**
 * Generation IPC handlers (WP-14).
 *
 * Registers generate:expand, generate:write, generate:iterate,
 * and generate:cancel commands.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { BrowserWindow } from 'electron';
import { registerCommand } from '../registry';
import {
  GenerateExpandRequestSchema,
  GenerateWriteRequestSchema,
  GenerateIterateRequestSchema,
  GenerateCancelRequestSchema,
  IterateAcceptRequestSchema,
  IterateDiscardRequestSchema,
  IterateAcceptAsVersionRequestSchema,
} from '../schemas';
import type { GenerationService } from '../../services/GenerationService';

/**
 * Register all generation handlers.
 * Call once during app startup after initIpcRegistry().
 *
 * @param generationService - The shared GenerationService singleton.
 */
export function registerGenerationHandlers(
  generationService: GenerationService,
): void {
  registerCommand(
    'generate:expand',
    GenerateExpandRequestSchema,
    async (payload, window: BrowserWindow) => {
      const jobId = await generationService.startExpand(
        payload.projectId,
        payload.chapterId,
        {
          versionSlug: payload.versionSlug,
          excludeVariableIds: payload.excludeVariableIds,
          asNewVersion: payload.asNewVersion,
        },
        window,
      );
      return { jobId };
    },
  );

  registerCommand(
    'generate:write',
    GenerateWriteRequestSchema,
    async (payload, window: BrowserWindow) => {
      const jobId = await generationService.startWrite(
        payload.projectId,
        payload.chapterId,
        {
          versionSlug: payload.versionSlug,
          excludeVariableIds: payload.excludeVariableIds,
          asNewVersion: payload.asNewVersion,
        },
        window,
      );
      return { jobId };
    },
  );

  registerCommand(
    'generate:iterate',
    GenerateIterateRequestSchema,
    async (payload, window: BrowserWindow) => {
      const jobId = await generationService.startIterate(
        payload.projectId,
        payload.chapterId,
        payload.stage,
        payload.instruction,
        {
          versionSlug: payload.versionSlug,
          excludeVariableIds: payload.excludeVariableIds,
        },
        window,
      );
      return { jobId };
    },
  );

  registerCommand(
    'generate:cancel',
    GenerateCancelRequestSchema,
    async (payload) => {
      await generationService.cancel(payload.jobId);
      return { ok: true };
    },
  );

  // ── Iterate acceptance handlers (WP-19) ─────────────────────────

  registerCommand(
    'iterate:accept',
    IterateAcceptRequestSchema,
    async (payload) => {
      const sha = await generationService.accept(payload.projectId, payload.jobId);
      return { sha };
    },
  );

  registerCommand(
    'iterate:discard',
    IterateDiscardRequestSchema,
    async (payload) => {
      return generationService.discard(payload.jobId);
    },
  );

  registerCommand(
    'iterate:acceptAsVersion',
    IterateAcceptAsVersionRequestSchema,
    async (payload) => {
      return generationService.acceptAsVersion(payload.projectId, payload.jobId, payload.versionName);
    },
  );
}
