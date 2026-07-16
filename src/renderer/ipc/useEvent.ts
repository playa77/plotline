/**
 * React hook for subscribing to IPC events with automatic cleanup.
 *
 * Usage:
 *   useIpcEvent('pong', (payload) => {
 *     console.log('Pong received:', payload);
 *   });
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { useEffect } from 'react';
import type { IpcEventMap } from '../../shared/ipc';
import { onEvent } from './client';

/**
 * Subscribe to an IPC event. The subscription is cleaned up when
 * the component unmounts or when event/callback changes.
 */
export function useIpcEvent<K extends keyof IpcEventMap>(
  event: K,
  callback: (payload: IpcEventMap[K]) => void,
): void {
  useEffect(() => {
    return onEvent(event, callback);
  }, [event, callback]);
}
