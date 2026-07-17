/**
 * Project lifecycle IPC handlers.
 *
 * Registers the project:create, project:open, project:list, and
 * project:close commands. Each handler delegates to a shared
 * ProjectService instance.
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { BrowserWindow } from 'electron';
import { registerCommand } from '../registry';
import {
  CreateProjectRequestSchema,
  OpenProjectRequestSchema,
  ListProjectsRequestSchema,
  CloseProjectRequestSchema,
  UpdateSettingsRequestSchema,
} from '../schemas';
import type { ProjectService } from '../../services/ProjectService';
import type { Project } from '../../../shared/schemas/project';
import { emitEvent } from '../events';

/**
 * Register all project lifecycle handlers.
 * Call once during app startup after initIpcRegistry().
 *
 * @param projectService - The shared ProjectService singleton.
 */
export function registerProjectHandlers(projectService: ProjectService): void {
  // ── project:create ───────────────────────────────────────────────
  registerCommand(
    'project:create',
    CreateProjectRequestSchema,
    async (payload, window: BrowserWindow) => {
      const project = await projectService.create(payload.title);
      emitEvent(window, 'project:changed', {
        projectId: project.projectId,
        action: 'opened',
      });
      return project;
    },
  );

  // ── project:open ─────────────────────────────────────────────────
  registerCommand(
    'project:open',
    OpenProjectRequestSchema,
    async (payload, window: BrowserWindow) => {
      const project = await projectService.open(payload.projectId);
      emitEvent(window, 'project:changed', {
        projectId: project.projectId,
        action: 'opened',
      });
      return project;
    },
  );

  // ── project:list ─────────────────────────────────────────────────
  registerCommand(
    'project:list',
    ListProjectsRequestSchema,
    async () => {
      return projectService.list();
    },
  );

  // ── project:close ────────────────────────────────────────────────
  registerCommand(
    'project:close',
    CloseProjectRequestSchema,
    async (payload, window: BrowserWindow) => {
      await projectService.close(payload.projectId);
      const closedId = payload.projectId ?? projectService.getCurrentProject()?.id;
      if (closedId) {
        emitEvent(window, 'project:changed', {
          projectId: closedId,
          action: 'closed',
        });
      }
      return { ok: true };
    },
  );

  // ── project:updateSettings ───────────────────────────────────────
  registerCommand(
    'project:updateSettings',
    UpdateSettingsRequestSchema,
    async (payload) => {
      const updated = await projectService.updateSettings(
        payload.projectId,
        payload.settings as Partial<Project['settings']>,
      );
      return updated;
    },
  );
}
