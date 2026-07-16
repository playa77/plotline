/**
 * Secrets IPC handlers (WP-14).
 *
 * Registers secrets:setApiKey and secrets:hasApiKey commands.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { registerCommand } from '../registry';
import {
  SecretsSetApiKeyRequestSchema,
  SecretsHasApiKeyRequestSchema,
} from '../schemas';
import type { SecretsService } from '../../services/SecretsService';

/**
 * Register all secrets handlers.
 * Call once during app startup after initIpcRegistry().
 *
 * @param secretsService - The shared SecretsService singleton.
 */
export function registerSecretsHandlers(secretsService: SecretsService): void {
  registerCommand(
    'secrets:setApiKey',
    SecretsSetApiKeyRequestSchema,
    async (payload) => {
      await secretsService.setApiKey(payload.key);
      return { ok: true };
    },
  );

  registerCommand(
    'secrets:hasApiKey',
    SecretsHasApiKeyRequestSchema,
    async () => {
      const hasKey = await secretsService.hasApiKey();
      return { hasKey };
    },
  );
}
