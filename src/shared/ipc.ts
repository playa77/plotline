/**
 * Shared IPC type definitions and constants.
 *
 * This file is the single source of truth for the IPC contract between
 * main process and renderer. It is imported by both sides and must never
 * import Electron-specific or renderer-specific modules.
 *
 * Version: 0.5.0 | 2026-07-16
 */

// ── Error envelope ────────────────────────────────────────────────
// Never throw across IPC — always return structured errors via IpcResult.

import type { Project, ProjectSummary } from './schemas/project';
import type { ModelRef } from './schemas/project';
import type { ParsePreview, Outline, OutlineMutation } from './schemas/outline';
import type { Variable, VariableScope, CoreVariableType } from './schemas/variable';
import type { GenRecord } from './schemas/meta';

export interface IpcError {
  code: string; // e.g. 'INVALID_PAYLOAD', 'UNKNOWN_COMMAND', 'HANDLER_ERROR'
  message: string;
  detail?: string;
}

// ── Tagged result ─────────────────────────────────────────────────
// Handlers return { data: T } on success or { error: IpcError } on failure.

export type IpcResult<T> = { data: T } | { error: IpcError };

// ── Command registry ──────────────────────────────────────────────
// Every command name maps to a request and response type.
// Add new commands here as the app grows.

export interface IpcCommandMap {
  ping: {
    request: { timestamp: number };
    response: { pong: boolean; receivedTimestamp: number; serverTimestamp: number };
  };
  'project:create': {
    request: { title: string };
    response: Project;
  };
  'project:open': {
    request: { projectId: string };
    response: Project;
  };
  'project:list': {
    request: {};
    response: ProjectSummary[];
  };
  'project:close': {
    request: { projectId?: string };
    response: { ok: true };
  };
  'project:updateSettings': {
    request: {
      projectId: string;
      settings: {
        continuityContext?: { enabled?: boolean; words?: number };
        models?: { expand?: ModelRef; write?: ModelRef; iterate?: ModelRef };
        inference?: { baseUrl?: string };
        theme?: 'dark' | 'light';
        editor?: { fontMode?: 'serif' | 'mono' };
        backupRemote?: string | null;
      };
    };
    response: Project;
  };
  'project:importOutline': {
    request: { projectId: string; markdown: string };
    response: ParsePreview;
  };
  'project:confirmImport': {
    request: { projectId: string; preview: ParsePreview };
    response: { ok: true };
  };
  'outline:get': {
    request: { projectId: string };
    response: Outline;
  };
  'outline:mutate': {
    request: { projectId: string; mutations: OutlineMutation[] };
    response: Outline;
  };
  // ── Variables (§7.1) ──────────────────────────────────────────
  'variables:list': {
    request: { projectId: string };
    response: Variable[];
  };
  'variables:get': {
    request: { projectId: string; variableId: string };
    response: { variable: Variable; content: string };
  };
  'variables:save': {
    request: { projectId: string; variableId: string; content: string };
    response: { sha: string };
  };
  'variables:create': {
    request: { projectId: string; name: string; core?: CoreVariableType | null; scope?: VariableScope };
    response: Variable;
  };
  'variables:setScope': {
    request: { projectId: string; variableId: string; scope: VariableScope };
    response: Variable;
  };
  'variables:setActive': {
    request: { projectId: string; variableId: string; active: boolean };
    response: Variable;
  };
  'variables:archive': {
    request: { projectId: string; variableId: string };
    response: Variable;
  };
  // ── Variable cards (Character / Voice Sheets) ─────────────────
  'variables:listCards': {
    request: { projectId: string; variableId: string };
    response: Array<{ cardId: string; title: string }>;
  };
  'variables:addCard': {
    request: { projectId: string; variableId: string; title: string };
    response: { cardId: string };
  };
  'variables:saveCard': {
    request: { projectId: string; variableId: string; cardId: string; content: string };
    response: { sha: string };
  };
  'variables:removeCard': {
    request: { projectId: string; variableId: string; cardId: string };
    response: { ok: true };
  };
  // ── Secrets (§7.6) ──────────────────────────────────
  'secrets:setApiKey': {
    request: { key: string };
    response: { ok: true };
  };
  'secrets:hasApiKey': {
    request: {};
    response: { hasKey: boolean };
  };
  'secrets:deleteApiKey': {
    request: {};
    response: { ok: boolean };
  };
  // ── Generation (§7.6) ─────────────────────────────────
  'generate:expand': {
    request: { projectId: string; chapterId: string; versionSlug?: string; excludeVariableIds?: string[]; asNewVersion?: string };
    response: { jobId: string };
  };
  'generate:write': {
    request: { projectId: string; chapterId: string; versionSlug?: string; excludeVariableIds?: string[]; asNewVersion?: string };
    response: { jobId: string };
  };
  'generate:iterate': {
    request: { projectId: string; chapterId: string; stage: 'expanded' | 'chapter'; versionSlug?: string; instruction: string; excludeVariableIds?: string[] };
    response: { jobId: string };
  };
  'generate:cancel': {
    request: { jobId: string };
    response: { ok: true };
  };
  // ── Iterate acceptance (§WP-19) ──────────────────────────────
  'iterate:accept': {
    request: { projectId: string; jobId: string };
    response: { sha: string };
  };
  'iterate:discard': {
    request: { jobId: string };
    response: { ok: true };
  };
  'iterate:acceptAsVersion': {
    request: { projectId: string; jobId: string; versionName: string };
    response: { sha: string; versionSlug: string };
  };
  // ── Chapter (§7.1) ──────────────────────────────────────────
  'chapter:getArtifact': {
    request: { projectId: string; chapterId: string; versionSlug?: string; stage: 'outline' | 'expanded' | 'chapter' };
    response: { html: string; meta?: GenRecord | null; stale: boolean };
  };
  'chapter:saveArtifact': {
    request: { projectId: string; chapterId: string; versionSlug?: string; stage: 'expanded' | 'chapter'; html: string };
    response: { sha: string };
  };
  'chapter:getStatus': {
    request: { projectId: string; chapterId: string };
    response: {
      stageDots: { outline: 'empty' | 'filled' | 'stale'; expanded: 'empty' | 'filled' | 'stale'; chapter: 'empty' | 'filled' | 'stale' };
      selectedVersion: string;
      versionNames: Array<{ slug: string; name: string; selected: boolean }>;
    };
  };
  // ── History (§7.1) ──────────────────────────────────────────
  'history:list': {
    request: { projectId: string; ref: string; limit?: number; before?: string };
    response: { commits: Array<{ sha: string; label: string; kind: string; timestamp: string; wordDelta?: number | null }> };
  };
  'history:preview': {
    request: { projectId: string; ref: string; sha: string };
    response: { html: string; label: string; timestamp: string };
  };
  'history:restore': {
    request: { projectId: string; ref: string; sha: string };
    response: { sha: string };
  };
  // ── Versions (WP-21) ──────────────────────────────────────────────
  'versions:list': {
    request: { projectId: string; chapterId: string };
    response: {
      versions: Array<{
        slug: string;
        name: string;
        selected: boolean;
        createdAt: string;
        commitCount: number;
        hasExpanded: boolean;
        hasChapter: boolean;
      }>;
    };
  };
  'versions:create': {
    request: { projectId: string; chapterId: string; name: string; fromVersion?: string };
    response: { slug: string; name: string };
  };
  'versions:select': {
    request: { projectId: string; chapterId: string; slug: string };
    response: { ok: true };
  };
  'versions:rename': {
    request: { projectId: string; chapterId: string; slug: string; newName: string };
    response: { slug: string; name: string };
  };
  'versions:archive': {
    request: { projectId: string; chapterId: string; slug: string };
    response: { ok: true };
  };
  // ── Export (WP-23) ────────────────────────────────────────────
  'export:substack': {
    request: { projectId: string; chapterId: string; versionSlug?: string; mode: 'clipboard' | 'file'; filePath?: string };
    response: { ok: boolean };
  };
  'export:markdown': {
    request: { projectId: string; scope: 'chapter' | 'book'; chapterId?: string; versionSlug?: string; filePath: string };
    response: { path: string; wordCount: number };
  };
  // ── PDF export (WP-25) ──────────────────────────────────────────────
  'export:listLatexTemplates': {
    request: { projectId?: string };
    response: { templates: Array<{ id: string; name: string; description: string; defaultOptions: Record<string, string> }> };
  };
  'export:pdf': {
    request: { projectId: string; templateId: string; chapterIds: string[] | 'all'; options: Record<string, string>; outputPath: string };
    response: { jobId: string };
  };
}

// ── Event registry ────────────────────────────────────────────────
// Every event name maps to its payload type.
// Add new events here as the app grows.

export interface IpcEventMap {
  pong: { message: string; timestamp: number };
  'project:changed': { projectId: string; action: 'opened' | 'closed' };
  // ── Generation events (§7.6) ──────────────────────────
  'generation:token': { jobId: string; delta: string };
  'generation:done': { jobId: string; chapterId: string; stage: string; html?: string; genRecord?: GenRecord };
  'generation:error': { jobId: string; code: string; message: string };
  // ── Staleness events (§7.6) ──────────────────────────
  'staleness:changed': { chapterIds: string[] };
  // ── PDF export events (WP-25) ───────────────────────────────
  'export:progress': { jobId: string; line: string; done: boolean; pdfPath?: string; error?: { code: string; message: string; detail?: string } };
}

// ── IPC channels ──────────────────────────────────────────────────
// All commands flow through a single channel; the command name is the
// second argument to ipcMain.handle / ipcRenderer.invoke.
// Events flow through a single channel with a { event, payload } wrapper.

export const IPC_COMMAND_CHANNEL = 'plotline:command';
export const IPC_EVENT_CHANNEL = 'plotline:event';
