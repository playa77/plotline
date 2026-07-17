/**
 * Export IPC handlers (WP-23, WP-25).
 *
 * Registers export:* commands. Each handler delegates to a shared
 * ExportService instance. The PDF export handlers use the BrowserWindow
 * from the registry for streaming progress events.
 *
 * Version: 0.2.0 | 2026-07-17
 */
import { BrowserWindow } from 'electron';
import { registerCommand } from '../registry';
import {
  ExportSubstackRequestSchema,
  ExportMarkdownRequestSchema,
  ExportListLatexTemplatesRequestSchema,
  ExportPdfRequestSchema,
} from '../schemas';
import type { ExportService } from '../../services/ExportService';

/**
 * Register all export handlers.
 * Call once during app startup after initIpcRegistry().
 *
 * @param exportService - The shared ExportService singleton.
 */
export function registerExportHandlers(exportService: ExportService): void {
  registerCommand('export:substack', ExportSubstackRequestSchema, async (payload) => {
    const { projectId, chapterId, versionSlug, mode, filePath } = payload;
    return exportService.exportSubstack(projectId, chapterId, versionSlug, mode, filePath);
  });

  registerCommand('export:markdown', ExportMarkdownRequestSchema, async (payload) => {
    const { projectId, scope, chapterId, versionSlug, filePath } = payload;
    return exportService.exportMarkdown(projectId, scope, filePath, chapterId, versionSlug);
  });

  registerCommand('export:listLatexTemplates', ExportListLatexTemplatesRequestSchema, async (payload) => {
    const templates = await exportService.listLatexTemplates(payload.projectId);
    return { templates };
  });

  registerCommand('export:pdf', ExportPdfRequestSchema, async (payload, window: BrowserWindow) => {
    // Generate a simple jobId
    const jobId = `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Start PDF export in background, emit progress events
    exportService.exportPdf(
      payload.projectId,
      payload.templateId,
      payload.chapterIds,
      payload.options,
      payload.outputPath,
      (line: string) => {
        window.webContents.send('plotline:event', {
          event: 'export:progress',
          payload: { jobId, line, done: false },
        });
      },
    ).then((result) => {
      window.webContents.send('plotline:event', {
        event: 'export:progress',
        payload: { jobId, line: '', done: true, pdfPath: result.pdfPath },
      });
    }).catch((err: any) => {
      window.webContents.send('plotline:event', {
        event: 'export:progress',
        payload: {
          jobId,
          line: '',
          done: true,
          error: { code: err.code ?? 'EXPORT_ERROR', message: err.message ?? 'Export failed', detail: err.detail },
        },
      });
    });

    return { jobId };
  });
}
