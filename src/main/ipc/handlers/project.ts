/**
 * Project lifecycle IPC handlers.
 *
 * Registers the project:create, project:open, project:list, project:close,
 * project:getRecents, and project:pickAndOpen commands. Each handler
 * delegates to a shared ProjectService instance and uses AppStateService
 * for recents / active-project tracking.
 *
 * Version: 0.2.0 | 2026-07-17
 */
import { BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { registerCommand } from '../registry';
import {
  CreateProjectRequestSchema,
  OpenProjectRequestSchema,
  ListProjectsRequestSchema,
  CloseProjectRequestSchema,
  UpdateSettingsRequestSchema,
  GetActiveProjectRequestSchema,
  GetRecentsRequestSchema,
  PickAndOpenRequestSchema,
} from '../schemas';
import type { ProjectService } from '../../services/ProjectService';
import type { AppStateService } from '../../services/AppStateService';
import type { Project } from '../../../shared/schemas/project';
import { emitEvent } from '../events';

/**
 * Register all project lifecycle handlers.
 * Call once during app startup after initIpcRegistry().
 *
 * @param projectService  - The shared ProjectService singleton.
 * @param appStateService - The shared AppStateService singleton (for recents / active-project).
 */
export function registerProjectHandlers(
  projectService: ProjectService,
  appStateService: AppStateService,
): void {
  // ── project:create ───────────────────────────────────────────────
  registerCommand(
    'project:create',
    CreateProjectRequestSchema,
    async (payload, window: BrowserWindow) => {
      const project = await projectService.create(payload.title);
      // Persist as the active project so it re-opens on next launch
      await projectService.setActiveProject(project.projectId, project.title);
      await appStateService.setActiveProject(project.projectId, project.title);
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
      // Persist as the active project
      await projectService.setActiveProject(project.projectId, project.title);
      await appStateService.setActiveProject(project.projectId, project.title);
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
        await appStateService.clearActiveProject();
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

  // ── project:getActive ────────────────────────────────────────────
  registerCommand(
    'project:getActive',
    GetActiveProjectRequestSchema,
    async () => {
      return appStateService.getActiveProject();
    },
  );

  // ── project:getRecents ───────────────────────────────────────────
  registerCommand(
    'project:getRecents',
    GetRecentsRequestSchema,
    async () => {
      return appStateService.getRecents();
    },
  );

  // ── project:pickAndOpen ──────────────────────────────────────────
  registerCommand(
    'project:pickAndOpen',
    PickAndOpenRequestSchema,
    async (_payload, window: BrowserWindow) => {
      const result = await dialog.showOpenDialog(window, {
        title: 'Open Plotline Project',
        properties: ['openDirectory'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const dirPath = result.filePaths[0]!;
      const projectId = path.basename(dirPath);

      const project = await projectService.open(projectId);
      await appStateService.setActiveProject(project.projectId, project.title);

      emitEvent(window, 'project:changed', {
        projectId: project.projectId,
        action: 'opened',
      });

      return { projectId: project.projectId, title: project.title };
    },
  );
}
