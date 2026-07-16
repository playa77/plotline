/**
 * Version IPC handlers (WP-21).
 *
 * Registers all versions:* commands. Each handler delegates to a shared
 * VersionService instance.
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { registerCommand } from '../registry';
import {
  VersionsListRequestSchema,
  VersionsCreateRequestSchema,
  VersionsSelectRequestSchema,
  VersionsRenameRequestSchema,
  VersionsArchiveRequestSchema,
} from '../schemas';
import type { VersionService } from '../../services/VersionService';

/**
 * Register all version handlers.
 * Call once during app startup after initIpcRegistry().
 *
 * @param versionService - The shared VersionService singleton.
 */
export function registerVersionHandlers(versionService: VersionService): void {
  registerCommand('versions:list', VersionsListRequestSchema, async (p) =>
    versionService.listVersions(p.projectId, p.chapterId),
  );
  registerCommand('versions:create', VersionsCreateRequestSchema, async (p) =>
    versionService.createVersion(p.projectId, p.chapterId, p.name, p.fromVersion),
  );
  registerCommand('versions:select', VersionsSelectRequestSchema, async (p) =>
    versionService.selectVersion(p.projectId, p.chapterId, p.slug),
  );
  registerCommand('versions:rename', VersionsRenameRequestSchema, async (p) =>
    versionService.renameVersion(p.projectId, p.chapterId, p.slug, p.newName),
  );
  registerCommand('versions:archive', VersionsArchiveRequestSchema, async (p) =>
    versionService.archiveVersion(p.projectId, p.chapterId, p.slug),
  );
}
