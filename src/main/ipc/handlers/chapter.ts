/**
 * Chapter IPC handlers (WP-15).
 *
 * Registers all chapter:* commands. Each handler delegates to a shared
 * ChapterService instance.
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { registerCommand } from '../registry';
import {
  ChapterGetArtifactRequestSchema,
  ChapterSaveArtifactRequestSchema,
  ChapterGetStatusRequestSchema,
} from '../schemas';
import type { ChapterService } from '../../services/ChapterService';

/**
 * Register all chapter handlers.
 * Call once during app startup after initIpcRegistry().
 *
 * @param chapterService - The shared ChapterService singleton.
 */
export function registerChapterHandlers(chapterService: ChapterService): void {
  registerCommand('chapter:getArtifact', ChapterGetArtifactRequestSchema, async (p) =>
    chapterService.getArtifact(p.projectId, p.chapterId, p.versionSlug, p.stage),
  );
  registerCommand('chapter:saveArtifact', ChapterSaveArtifactRequestSchema, async (p) =>
    chapterService.saveArtifact(p.projectId, p.chapterId, p.stage, p.html, p.versionSlug),
  );
  registerCommand('chapter:getStatus', ChapterGetStatusRequestSchema, async (p) =>
    chapterService.getStatus(p.projectId, p.chapterId),
  );
}
