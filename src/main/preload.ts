/**
 * Preload script — exposes a typed IPC API to the renderer via contextBridge.
 *
 * The renderer accesses this through `window.plotline.invoke()` for
 * request/response commands and `window.plotline.on()` for subscriptions
 * to main→renderer events.
 *
 * All commands flow through a single ipcRenderer.invoke channel; all events
 * arrive on a single channel with a { event, payload } wrapper that the
 * `on()` method filters by event name.
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcCommandMap, IpcEventMap, IpcResult } from '../shared/ipc';
import { IPC_COMMAND_CHANNEL, IPC_EVENT_CHANNEL } from '../shared/ipc';

/** Map of event name → set of raw ipcRenderer listener references for cleanup. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eventListeners = new Map<string, Set<(...args: any[]) => void>>();

const api = {
  /**
   * Send a command to the main process and receive a typed response.
   * Returns an IpcResult — callers should unwrap with the renderer client.
   */
  invoke: <K extends keyof IpcCommandMap>(
    command: K,
    payload: IpcCommandMap[K]['request'],
  ): Promise<IpcResult<IpcCommandMap[K]['response']>> => {
    return ipcRenderer.invoke(IPC_COMMAND_CHANNEL, command, payload);
  },

  /**
   * Subscribe to a main→renderer event.
   * Returns an unsubscribe function.
   */
  on: <K extends keyof IpcEventMap>(
    event: K,
    callback: (payload: IpcEventMap[K]) => void,
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      wrapped: { event: string; payload: unknown },
    ): void => {
      if (wrapped.event === event) {
        callback(wrapped.payload as IpcEventMap[K]);
      }
    };

    // Track for cleanup
    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set());
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    eventListeners.get(event)!.add(handler);

    ipcRenderer.on(IPC_EVENT_CHANNEL, handler);

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNEL, handler);
      eventListeners.get(event)?.delete(handler);
    };
  },

  /**
   * Remove all listeners for a given event.
   */
  off: <K extends keyof IpcEventMap>(event: K): void => {
    const handlers = eventListeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        ipcRenderer.removeListener(IPC_EVENT_CHANNEL, handler);
      }
      eventListeners.delete(event);
    }
  },
};

contextBridge.exposeInMainWorld('plotline', api);
