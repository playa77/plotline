/**
 * Ping command handler + pong event emitter.
 *
 * Registers the 'ping' command. On receipt:
 *   1. Validates the payload (timestamp) via the zod schema.
 *   2. Emits a 'pong' event back to the requesting window.
 *   3. Returns { pong: true, receivedTimestamp, serverTimestamp }.
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { BrowserWindow } from 'electron';
import { registerCommand } from './registry';
import { emitEvent } from './events';
import { PingRequestSchema } from './schemas';

/**
 * Register the ping handler and wire up the pong event emission.
 * Call during app startup after initIpcRegistry().
 */
export function registerPingHandler(): void {
  registerCommand(
    'ping',
    PingRequestSchema,
    async (payload, window: BrowserWindow) => {
      const serverTimestamp = Date.now();

      // Emit pong event back to the requesting window
      emitEvent(window, 'pong', {
        message: 'pong',
        timestamp: serverTimestamp,
      });

      return {
        pong: true,
        receivedTimestamp: payload.timestamp,
        serverTimestamp,
      };
    },
  );
}
