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
}

// ── IPC channels ──────────────────────────────────────────────────
// All commands flow through a single channel; the command name is the
// second argument to ipcMain.handle / ipcRenderer.invoke.
// Events flow through a single channel with a { event, payload } wrapper.

export const IPC_COMMAND_CHANNEL = 'plotline:command';
export const IPC_EVENT_CHANNEL = 'plotline:event';
