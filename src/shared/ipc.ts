/**
 * Shared IPC type definitions and constants.
 *
 * This file is the single source of truth for the IPC contract between
 * main process and renderer. It is imported by both sides and must never
 * import Electron-specific or renderer-specific modules.
 *
 * Version: 0.1.0 | 2026-07-16
 */

// ── Error envelope ────────────────────────────────────────────────
// Never throw across IPC — always return structured errors via IpcResult.

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
  // future commands added here
}

// ── Event registry ────────────────────────────────────────────────
// Every event name maps to its payload type.
// Add new events here as the app grows.

export interface IpcEventMap {
  pong: { message: string; timestamp: number };
  // future events added here
}

// ── IPC channels ──────────────────────────────────────────────────
// All commands flow through a single channel; the command name is the
// second argument to ipcMain.handle / ipcRenderer.invoke.
// Events flow through a single channel with a { event, payload } wrapper.

export const IPC_COMMAND_CHANNEL = 'plotline:command';
export const IPC_EVENT_CHANNEL = 'plotline:event';
