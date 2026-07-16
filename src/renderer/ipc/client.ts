/**
 * Typed IPC client — renderer-side convenience wrappers.
 *
 * These functions wrap window.plotline.invoke/on so callers get
 * properly typed results without manually checking IpcResult.
 *
 * Usage:
 *   const resp = await invoke('ping', { timestamp: Date.now() });
 *   const unsub = onEvent('pong', (p) => console.log(p));
 *
 * Version: 0.1.0 | 2026-07-16
 */
import type { IpcCommandMap, IpcEventMap, IpcResult } from '../../shared/ipc';

/**
 * Invoke a command and extract the data payload.
 * Throws an IpcError if the handler returned an error.
 */
export async function invoke<K extends keyof IpcCommandMap>(
  command: K,
  payload: IpcCommandMap[K]['request'],
): Promise<IpcCommandMap[K]['response']> {
  const result: IpcResult<IpcCommandMap[K]['response']> =
    await window.plotline.invoke(command, payload);

  if ('error' in result) {
    throw result.error;
  }

  return result.data;
}

/**
 * Subscribe to a typed IPC event.
 * Returns an unsubscribe function.
 */
export function onEvent<K extends keyof IpcEventMap>(
  event: K,
  callback: (payload: IpcEventMap[K]) => void,
): () => void {
  return window.plotline.on(event, callback);
}
