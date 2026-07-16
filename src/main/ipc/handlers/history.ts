/**
 * History IPC handlers (WP-17).
 *
 * Registers all history:* commands. Each handler delegates to a shared
 * HistoryService instance.
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { registerCommand } from '../registry';
import {
  HistoryListRequestSchema,
  HistoryPreviewRequestSchema,
  HistoryRestoreRequestSchema,
} from '../schemas';
import type { HistoryService } from '../../services/HistoryService';

/**
 * Register all history handlers.
 * Call once during app startup after initIpcRegistry().
 *
 * @param historyService - The shared HistoryService singleton.
 */
export function registerHistoryHandlers(historyService: HistoryService): void {
  registerCommand('history:list', HistoryListRequestSchema, async (p) =>
    historyService.listHistory(p.projectId, p.ref, p.limit, p.before),
  );
  registerCommand('history:preview', HistoryPreviewRequestSchema, async (p) =>
    historyService.preview(p.projectId, p.ref, p.sha),
  );
  registerCommand('history:restore', HistoryRestoreRequestSchema, async (p) =>
    historyService.restore(p.projectId, p.ref, p.sha),
  );
}
