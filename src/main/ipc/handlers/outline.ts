/**
 * Outline import IPC handlers.
 *
 * Registers the project:importOutline and project:confirmImport commands.
 * Each handler delegates to a shared ProjectService instance.
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { registerCommand } from '../registry';
import {
  ImportOutlineRequestSchema,
  ConfirmImportRequestSchema,
  OutlineGetRequestSchema,
  OutlineMutateRequestSchema,
} from '../schemas';
import type { ProjectService } from '../../services/ProjectService';

/**
 * Register all outline import handlers.
 * Call once during app startup after initIpcRegistry().
 *
 * @param projectService - The shared ProjectService singleton.
 */
export function registerOutlineHandlers(projectService: ProjectService): void {
  // ── project:importOutline ──────────────────────────────────────────
  registerCommand(
    'project:importOutline',
    ImportOutlineRequestSchema,
    async (payload) => {
      const preview = await projectService.importOutlinePreview(
        payload.projectId,
        payload.markdown,
      );
      return preview;
    },
  );

  // ── project:confirmImport ──────────────────────────────────────────
  registerCommand(
    'project:confirmImport',
    ConfirmImportRequestSchema,
    async (payload) => {
      await projectService.confirmImportOutline(
        payload.projectId,
        payload.preview,
      );
      return { ok: true };
    },
  );

  // ── outline:get ────────────────────────────────────────────────────
  registerCommand(
    'outline:get',
    OutlineGetRequestSchema,
    async (payload) => {
      return await projectService.outlineGet(payload.projectId);
    },
  );

  // ── outline:mutate ─────────────────────────────────────────────────
  registerCommand(
    'outline:mutate',
    OutlineMutateRequestSchema,
    async (payload) => {
      return await projectService.outlineMutate(
        payload.projectId,
        payload.mutations,
      );
    },
  );
}
