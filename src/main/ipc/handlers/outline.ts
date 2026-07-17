/**
 * Outline import IPC handlers.
 *
 * Registers the project:importOutline and project:confirmImport commands.
 * Each handler delegates to a shared ProjectService instance.
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { dialog } from 'electron';
import fs from 'node:fs';
import { registerCommand } from '../registry';
import {
  ImportOutlineRequestSchema,
  ConfirmImportRequestSchema,
  PickAndImportOutlineRequestSchema,
  OutlineGetRequestSchema,
  OutlineMutateRequestSchema,
} from '../schemas';
import type { ProjectService } from '../../services/ProjectService';
import type { StalenessService } from '../../services/StalenessService';
import { parseOutlineMarkdown } from '../../services/outlineImporter';

/**
 * Register all outline import handlers.
 * Call once during app startup after initIpcRegistry().
 *
 * @param projectService   - The shared ProjectService singleton.
 * @param stalenessService - Optional StalenessService for cache invalidation.
 */
export function registerOutlineHandlers(
  projectService: ProjectService,
  stalenessService?: StalenessService,
): void {
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
      // Outline import changes outline.json → invalidate all staleness
      stalenessService?.invalidateAll();
      return { ok: true };
    },
  );

  // ── project:pickAndImportOutline ───────────────────────────────────
  registerCommand(
    'project:pickAndImportOutline',
    PickAndImportOutlineRequestSchema,
    async (_payload) => {
      const result = await dialog.showOpenDialog({
        title: 'Import Outline',
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      const filePath = result.filePaths[0];
      if (!filePath) return null;
      const markdown = fs.readFileSync(filePath, 'utf-8');
      const preview = parseOutlineMarkdown(markdown);
      return preview;
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
      const result = await projectService.outlineMutate(
        payload.projectId,
        payload.mutations,
      );
      // Outline mutations change chapter slices → invalidate all staleness
      stalenessService?.invalidateAll();
      return result;
    },
  );
}
