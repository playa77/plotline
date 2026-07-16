/**
 * Global type augmentations.
 *
 * Declares the `window.plotline` API exposed by the preload script
 * via contextBridge. All IPC types are imported from ./ipc which is
 * the single source of truth.
 *
 * Version: 0.1.0 | 2026-07-16
 */
import type { IpcCommandMap, IpcEventMap, IpcResult } from './ipc';

declare global {
  interface Window {
    plotline: {
      invoke<K extends keyof IpcCommandMap>(
        command: K,
        payload: IpcCommandMap[K]['request'],
      ): Promise<IpcResult<IpcCommandMap[K]['response']>>;

      on<K extends keyof IpcEventMap>(
        event: K,
        callback: (payload: IpcEventMap[K]) => void,
      ): () => void;

      off<K extends keyof IpcEventMap>(event: K): void;
    };
  }
}
