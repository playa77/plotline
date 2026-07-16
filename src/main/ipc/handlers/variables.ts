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

/**
 * Register all variable handlers.
 * Call once during app startup after initIpcRegistry().
 *
 * @param variableService - The shared VariableService singleton.
 */
export function registerVariableHandlers(variableService: VariableService): void {
  registerCommand('variables:list', VariablesListRequestSchema, async (p) => variableService.list(p.projectId));
  registerCommand('variables:get', VariablesGetRequestSchema, async (p) => variableService.get(p.projectId, p.variableId));
  registerCommand('variables:save', VariablesSaveRequestSchema, async (p) => variableService.save(p.projectId, p.variableId, p.content));
  registerCommand('variables:create', VariablesCreateRequestSchema, async (p) => variableService.create(p.projectId, p.name, p.core, p.scope));
  registerCommand('variables:setScope', VariablesSetScopeRequestSchema, async (p) => variableService.setScope(p.projectId, p.variableId, p.scope));
  registerCommand('variables:setActive', VariablesSetActiveRequestSchema, async (p) => variableService.setActive(p.projectId, p.variableId, p.active));
  registerCommand('variables:archive', VariablesArchiveRequestSchema, async (p) => variableService.archive(p.projectId, p.variableId));
  registerCommand('variables:listCards', VariablesListCardsRequestSchema, async (p) => variableService.listCards(p.projectId, p.variableId));
  registerCommand('variables:addCard', VariablesAddCardRequestSchema, async (p) => variableService.addCard(p.projectId, p.variableId, p.title));
  registerCommand('variables:saveCard', VariablesSaveCardRequestSchema, async (p) => variableService.saveCard(p.projectId, p.variableId, p.cardId, p.content));
  registerCommand('variables:removeCard', VariablesRemoveCardRequestSchema, async (p) => variableService.removeCard(p.projectId, p.variableId, p.cardId));
}
