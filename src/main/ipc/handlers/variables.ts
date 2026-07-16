/**
 * Variable IPC handlers (WP-11).
 *
 * Registers all variables:* commands. Each handler delegates to a shared
 * VariableService instance.
 *
 * Version: 0.1.0 | 2026-07-16
 */
import { registerCommand } from '../registry';
import {
  VariablesListRequestSchema,
  VariablesGetRequestSchema,
  VariablesSaveRequestSchema,
  VariablesCreateRequestSchema,
  VariablesSetScopeRequestSchema,
  VariablesSetActiveRequestSchema,
  VariablesArchiveRequestSchema,
  VariablesListCardsRequestSchema,
  VariablesAddCardRequestSchema,
  VariablesSaveCardRequestSchema,
  VariablesRemoveCardRequestSchema,
} from '../schemas';
import type { VariableService } from '../../services/VariableService';
import type { StalenessService } from '../../services/StalenessService';

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
  registerCommand('variables:list', VariablesListRequestSchema, async (p) => variableService.list(p.projectId));
  registerCommand('variables:get', VariablesGetRequestSchema, async (p) => variableService.get(p.projectId, p.variableId));
  registerCommand('variables:listCards', VariablesListCardsRequestSchema, async (p) => variableService.listCards(p.projectId, p.variableId));

  // Write handlers — invalidate staleness after mutation
  registerCommand('variables:save', VariablesSaveRequestSchema, async (p) => {
    const result = await variableService.save(p.projectId, p.variableId, p.content);
    stalenessService?.invalidateAll();
    return result;
  });
  registerCommand('variables:create', VariablesCreateRequestSchema, async (p) => {
    const result = await variableService.create(p.projectId, p.name, p.core, p.scope);
    stalenessService?.invalidateAll();
    return result;
  });
  registerCommand('variables:setScope', VariablesSetScopeRequestSchema, async (p) => {
    const result = await variableService.setScope(p.projectId, p.variableId, p.scope);
    stalenessService?.invalidateAll();
    return result;
  });
  registerCommand('variables:setActive', VariablesSetActiveRequestSchema, async (p) => {
    const result = await variableService.setActive(p.projectId, p.variableId, p.active);
    stalenessService?.invalidateAll();
    return result;
  });
  registerCommand('variables:archive', VariablesArchiveRequestSchema, async (p) => {
    const result = await variableService.archive(p.projectId, p.variableId);
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
