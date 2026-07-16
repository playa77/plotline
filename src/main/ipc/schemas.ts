/**
 * Zod schemas for IPC command payloads.
 *
 * Schemas are kept separate from handlers so they can be imported
 * and tested independently (Electron-free).
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { z } from 'zod';

/** Validates that timestamp is a finite number. */
export const PingRequestSchema = z.object({
  timestamp: z.number(),
});
