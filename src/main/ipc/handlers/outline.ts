/**
 * Outline import IPC handlers.
 *
 * Registers the project:importOutline and project:confirmImport commands.
 * Each handler delegates to a shared ProjectService instance.
 *
 * Version: 0.2.0 | 2026-07-17
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
import type { AppStateService } from '../../services/AppStateService';
import type { SecretsService } from '../../services/SecretsService';
import { parseOutlineMarkdown } from '../../services/outlineImporter';
import { generateULID } from '../../../shared/utils/ulid';

/**
 * Resolve the parse (outline import) model from project settings.
 * Returns undefined if the project doesn't exist or can't be read —
 * the parser falls back to its hardcoded default.
 */
async function resolveParseModel(
  projectService: ProjectService,
  projectId?: string,
): Promise<string | undefined> {
  if (!projectId) return undefined;
  try {
    const svc = projectService.getOpenProject(projectId);
    if (!svc) return undefined;
    const raw = await svc.readBlob('refs/heads/main', 'project.json');
    const manifest = JSON.parse(raw.toString('utf-8'));
    return manifest?.settings?.models?.parse?.model as string | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Register all outline import handlers.
 * Call once during app startup after initIpcRegistry().
 *
 * @param projectService   - The shared ProjectService singleton.
 * @param stalenessService - Optional StalenessService for cache invalidation.
 * @param appStateService  - Optional AppStateService for active-project tracking.
 * @param secretsService   - Optional SecretsService for retrieving API key.
 */
export function registerOutlineHandlers(
  projectService: ProjectService,
  stalenessService?: StalenessService,
  appStateService?: AppStateService,
  secretsService?: SecretsService,
): void {
  // ── project:importOutline ──────────────────────────────────────────
  registerCommand(
    'project:importOutline',
    ImportOutlineRequestSchema,
    async (payload) => {
      const apiKey = secretsService ? await secretsService.getApiKey() : null;
      if (!apiKey) throw new Error('API key required. Set your OpenRouter API key in Settings.');
      const model = await resolveParseModel(projectService, payload.projectId);
      const preview = await parseOutlineMarkdown(payload.markdown, apiKey, undefined, model);
      return preview;
    },
  );

  // ── project:confirmImport ──────────────────────────────────────────
  registerCommand(
    'project:confirmImport',
    ConfirmImportRequestSchema,
    async (payload) => {
      // Auto-generate a project ID if none was provided (cold-start import)
      const projectId = payload.projectId || generateULID();
      const preview = payload.preview;
      await projectService.confirmImportOutline(projectId, preview);

      // Track as active so it reopens on next launch
      if (appStateService) {
        const title = preview.projectTitle || 'Imported Project';
        await appStateService.setActiveProject(projectId, title);
      }

      // Outline import changes outline.json → invalidate all staleness
      stalenessService?.invalidateAll();

      const title = preview.projectTitle || 'Imported Project';
      return {
        ok: true as const,
        projectId,
        title,
      };
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
      const apiKey = secretsService ? await secretsService.getApiKey() : null;
      if (!apiKey) throw new Error('API key required. Set your OpenRouter API key in Settings.');
      const model = await resolveParseModel(projectService, _payload.projectId);
      const preview = await parseOutlineMarkdown(markdown, apiKey, undefined, model);
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
