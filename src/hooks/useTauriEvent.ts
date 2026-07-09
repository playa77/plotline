// Version: 1.0.0 | 2026-07-09
// Generic hook for subscribing to Tauri events with proper cleanup.
// Uses a ref to avoid stale closures in the callback.

import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Subscribes to a Tauri event by name.
 *
 * @param eventName - The Tauri event name (e.g. "run_started", "step_completed").
 * @param handler - Callback invoked with the event payload.
 *
 * The handler reference is stored in a ref so that the listener always
 * calls the latest version of the callback without re-subscribing on every
 * render. The listener is unregistered on unmount.
 */
export function useTauriEvent<T>(
  eventName: string,
  handler: (payload: T) => void
): void {
  const handlerRef = useRef(handler);

  // Keep the ref up-to-date without re-subscribing
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setup = async () => {
      unlisten = await listen<T>(eventName, (event) => {
        handlerRef.current(event.payload);
      });
    };

    setup();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [eventName]);
}
