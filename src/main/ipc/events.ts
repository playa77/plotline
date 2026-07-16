/**
 * IPC event emitter — main → renderer.
 *
 * All events are sent on a single channel with a { event, payload } wrapper.
 * The preload's `on()` method filters by the `event` field.
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { BrowserWindow } from 'electron';
import type { IpcEventMap } from '../../shared/ipc';
import { IPC_EVENT_CHANNEL } from '../../shared/ipc';

/**
 * Emit a typed event to a specific window.
 *
 * @param window  The target BrowserWindow.
 * @param event   Event name (keyof IpcEventMap).
 * @param payload Event payload (IpcEventMap[K]).
 */
export function emitEvent<K extends keyof IpcEventMap>(
  window: BrowserWindow,
  event: K,
  payload: IpcEventMap[K],
): void {
  window.webContents.send(IPC_EVENT_CHANNEL, { event, payload });
}
