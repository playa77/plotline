/**
 * Variable IPC handlers (WP-VARS-1).
 *
 * Registers all variables:* commands. Each handler delegates to a shared
 * VariableService instance.
 *
 * Version: 2.0.0 | 2026-07-17
 */
import { registerCommand } from '../registry';
import {
  VariablesListRequestSchema,
  VariablesGetRequestSchema,
  VariablesCreateRequestSchema,
  VariablesRenameRequestSchema,
  VariablesSetScopeRequestSchema,
  VariablesSetContentRequestSchema,
  VariablesReorderRequestSchema,
  VariablesDeleteRequestSchema,
  VariablesListCardsRequestSchema,
  VariablesAddCardRequestSchema,
  VariablesSaveCardRequestSchema,
  VariablesRemoveCardRequestSchema,
} from '../schemas';
import type { VariableService, VariableError } from '../../services/VariableService';
import type { StalenessService } from '../../services/StalenessService';
import type { IpcResult } from '../../../shared/ipc';

/**
 * Register all variable handlers.
 * Call once during app startup after initIpcRegistry().
 *
 * @param variableService  - The shared VariableService singleton.
 * @param stalenessService - Optional StalenessService for cache invalidation.
 */
export function registerVariableHandlers(
  variableService: VariableService,
  stalenessService?: StalenessService,
): void {
  // Read-only handlers — no invalidation needed
  registerCommand('variables:list', VariablesListRequestSchema, async (p) =>
    variableService.list(p.projectId),
  );
  registerCommand('variables:get', VariablesGetRequestSchema, async (p) =>
    variableService.get(p.projectId, p.variableId),
  );
  registerCommand('variables:listCards', VariablesListCardsRequestSchema, async (p) =>
    variableService.listCards(p.projectId, p.variableId),
  );

  // Write handlers — invalidate staleness after mutation
  registerCommand('variables:create', VariablesCreateRequestSchema, async (p) => {
    const result = await variableService.create(p.projectId, p.name, p.scope);
    stalenessService?.invalidateAll();
    return result;
  });
  registerCommand('variables:rename', VariablesRenameRequestSchema, async (p) => {
    const result = await variableService.rename(p.projectId, p.variableId, p.name);
    stalenessService?.invalidateAll();
    return result;
  });
  registerCommand('variables:setScope', VariablesSetScopeRequestSchema, async (p) => {
    const result = await variableService.setScope(p.projectId, p.variableId, p.scope);
    stalenessService?.invalidateAll();
    return result;
  });
  registerCommand('variables:setContent', VariablesSetContentRequestSchema, async (p) => {
    const result = await variableService.setContent(p.projectId, p.variableId, p.content);
    stalenessService?.invalidateAll();
    return result;
  });
  registerCommand('variables:reorder', VariablesReorderRequestSchema, async (p) => {
    const result = await variableService.reorder(p.projectId, p.variableId, p.newPosition);
    stalenessService?.invalidateAll();
    return result;
  });
  registerCommand('variables:delete', VariablesDeleteRequestSchema, async (p) => {
    const result = await variableService.delete(p.projectId, p.variableId);
    stalenessService?.invalidateAll();
    return result;
  });
  registerCommand('variables:addCard', VariablesAddCardRequestSchema, async (p) => {
    const result = await variableService.addCard(p.projectId, p.variableId, p.title);
    stalenessService?.invalidateAll();
    return result;
  });
  registerCommand('variables:saveCard', VariablesSaveCardRequestSchema, async (p) => {
    const result = await variableService.saveCard(p.projectId, p.variableId, p.cardId, p.content);
    stalenessService?.invalidateAll();
    return result;
  });
  registerCommand('variables:removeCard', VariablesRemoveCardRequestSchema, async (p) => {
    const result = await variableService.removeCard(p.projectId, p.variableId, p.cardId);
    stalenessService?.invalidateAll();
    return result;
  });
}
