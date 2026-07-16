/**
 * IPC handler registry — typed command dispatch with zod payload validation.
 *
 * Usage:
 *   1. Call `registerCommand()` at startup for each command.
 *   2. Call `initIpcRegistry()` once (after window creation) to install the
 *      ipcMain.handle listener on the command channel.
 *
 * Every invocation flows through:
 *   command lookup → zod validation → handler call → structured result.
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { ipcMain, BrowserWindow } from 'electron';
import { type ZodSchema } from 'zod';
import type { IpcCommandMap, IpcResult } from '../../shared/ipc';
import { IPC_COMMAND_CHANNEL } from '../../shared/ipc';

/** Handler signature: receives a validated payload + the requesting window. */
type Handler<K extends keyof IpcCommandMap> = (
  payload: IpcCommandMap[K]['request'],
  window: BrowserWindow,
) => Promise<IpcCommandMap[K]['response']>;

/** Internal registry entry — schema + handler pair. */
interface RegistryEntry {
  schema: ZodSchema;
  handler: (...args: unknown[]) => Promise<unknown>;
}

const registry = new Map<string, RegistryEntry>();

/**
 * Register a command handler.
 *
 * @param command Command name (keyof IpcCommandMap).
 * @param schema  Zod schema for payload validation.
 * @param handler Async handler returning the response payload.
 */
export function registerCommand<K extends keyof IpcCommandMap>(
  command: K,
  schema: ZodSchema<IpcCommandMap[K]['request']>,
  handler: Handler<K>,
): void {
  registry.set(command, {
    schema,
    handler: handler as (...args: unknown[]) => Promise<unknown>,
  });
}

/**
 * Install the single ipcMain.handle listener.
 * Call once during app startup after creating the BrowserWindow.
 */
export function initIpcRegistry(): void {
  ipcMain.handle(
    IPC_COMMAND_CHANNEL,
    async (
      event,
      command: string,
      payload: unknown,
    ): Promise<IpcResult<unknown>> => {
      // 1. Look up command
      const entry = registry.get(command);
      if (!entry) {
        return {
          error: {
            code: 'UNKNOWN_COMMAND',
            message: `No handler registered for command "${command}"`,
          },
        };
      }

      // 2. Validate payload with zod schema
      const parsed = entry.schema.safeParse(payload);
      if (!parsed.success) {
        return {
          error: {
            code: 'INVALID_PAYLOAD',
            message: `Invalid payload for command "${command}": ${parsed.error.issues[0]?.message ?? 'Validation failed'}`,
            detail: parsed.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; '),
          },
        };
      }

      // 3. Resolve BrowserWindow from the event sender
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) {
        return {
          error: {
            code: 'HANDLER_ERROR',
            message: 'No BrowserWindow found for the requesting web contents',
          },
        };
      }

      // 4. Call handler
      try {
        const result = await entry.handler(parsed.data, win);
        return { data: result };
      } catch (err) {
        return {
          error: {
            code: 'HANDLER_ERROR',
            message: err instanceof Error ? err.message : 'Unknown handler error',
          },
        };
      }
    },
  );
}
