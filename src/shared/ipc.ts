/**
 * Shared IPC type definitions and constants.
 *
 * This file is the single source of truth for the IPC contract between
 * main process and renderer. It is imported by both sides and must never
 * import Electron-specific or renderer-specific modules.
 *
 * Version: 0.2.0 | 2026-07-16
 */

// ── Error envelope ────────────────────────────────────────────────
// Never throw across IPC — always return structured errors via IpcResult.

import type { Project, ProjectSummary } from './schemas/project';
import type { ParsePreview, Outline, OutlineMutation } from './schemas/outline';

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
}

// ── Event registry ────────────────────────────────────────────────
// Every event name maps to its payload type.
// Add new events here as the app grows.

export interface IpcEventMap {
  pong: { message: string; timestamp: number };
  'project:changed': { projectId: string; action: 'opened' | 'closed' };
  // future events added here
}

// ── IPC channels ──────────────────────────────────────────────────
// All commands flow through a single channel; the command name is the
// second argument to ipcMain.handle / ipcRenderer.invoke.
// Events flow through a single channel with a { event, payload } wrapper.

export const IPC_COMMAND_CHANNEL = 'plotline:command';
export const IPC_EVENT_CHANNEL = 'plotline:event';
