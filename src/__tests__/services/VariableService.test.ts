/**
 * VariableService tests (WP-VARS-1).
 *
 * Each test creates a throwaway projects directory, exercises VariableService
 * methods against a ProjectService-backed Git repo, then cleans up.
 * No Electron dependency.
 *
 * Version: 2.0.0 | 2026-07-17
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectService } from '../../main/services/ProjectService';
import { VariableService, VariableError } from '../../main/services/VariableService';
import type { StoryVariable } from '../../shared/schemas/variable';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('VariableService', () => {
  let tmpDir: string;
  let projectService: ProjectService;
  let variableService: VariableService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-test-vars-'));
    projectService = new ProjectService(tmpDir);
    variableService = new VariableService(projectService);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── seedBuiltins ──────────────────────────────────────────────────────

  describe('seedBuiltins', () => {
    it('creates the 4 builtins + 1 system variable', async () => {
      const project = await projectService.create('Test');
      await variableService.seedBuiltins(project.projectId);
      const list = await variableService.list(project.projectId);
      expect(list).toHaveLength(5);

      // System first: global-constraints
      expect(list[0]!.id).toBe('global-constraints');
      expect(list[0]!.kind).toBe('system');
      expect(list[0]!.scopeLocked).toBe(true);

      // Then builtins in slug order
      expect(list[1]!.id).toBe('tone');
      expect(list[1]!.name).toBe('Tone');
      expect(list[1]!.kind).toBe('builtin');

      expect(list[2]!.id).toBe('style');
      expect(list[2]!.name).toBe('Writing Style');

      expect(list[3]!.id).toBe('constraints');
      expect(list[3]!.name).toBe('Plot Constraints');

      expect(list[4]!.id).toBe('characters');
      expect(list[4]!.name).toBe('Character / Voice Sheets');
    });

    it('is idempotent', async () => {
      const project = await projectService.create('Test');
      await variableService.seedBuiltins(project.projectId);
      await variableService.seedBuiltins(project.projectId);

      const list = await variableService.list(project.projectId);
      expect(list).toHaveLength(5);
    });

    it('creates variables with empty content', async () => {
      const project = await projectService.create('Test');
      await variableService.seedBuiltins(project.projectId);
      const pid = project.projectId;

      for (const v of await variableService.list(pid)) {
        const { content } = await variableService.get(pid, v.id);
        expect(content).toBe('');
      }
    });
  });

  // ── create / list ─────────────────────────────────────────────────────

  describe('create', () => {
    it('create returns a valid custom variable', async () => {
      const project = await projectService.create('Test');
      await variableService.seedBuiltins(project.projectId);
      const variable = await variableService.create(
        project.projectId,
        'My Custom Var',
      );

      expect(variable.id).toMatch(
        /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/,
      );
      expect(variable.name).toBe('My Custom Var');
      expect(variable.kind).toBe('custom');
      expect(variable.scope).toBe('manual');
      expect(variable.deletable).toBe(true);
      expect(variable.renamable).toBe(true);
      expect(variable.scopeLocked).toBe(false);
      expect(variable.schemaVersion).toBe(2);
      expect(variable.position).toBeGreaterThanOrEqual(0);
    });

    it('rejects reserved names', async () => {
      const project = await projectService.create('Test');
      await expect(
        variableService.create(project.projectId, 'tone'),
      ).rejects.toMatchObject({ code: 'NAME_RESERVED' });
      await expect(
        variableService.create(project.projectId, 'TONE'),
      ).rejects.toMatchObject({ code: 'NAME_RESERVED' });
      await expect(
        variableService.create(project.projectId, 'Global-Constraints'),
      ).rejects.toMatchObject({ code: 'NAME_RESERVED' });
    });

    it('rejects duplicate names (case-insensitive)', async () => {
      const project = await projectService.create('Test');
      await variableService.create(project.projectId, 'My Var');
      await expect(
        variableService.create(project.projectId, 'my var'),
      ).rejects.toMatchObject({ code: 'NAME_TAKEN' });
    });

    it('accepts explicit scope', async () => {
      const project = await projectService.create('Test');
      const variable = await variableService.create(
        project.projectId,
        'Write Var',
        'write',
      );
      expect(variable.scope).toBe('write');
    });

    it('list includes created variable', async () => {
      const project = await projectService.create('Test');
      const variable = await variableService.create(
        project.projectId,
        'Test Var',
      );

      const list = await variableService.list(project.projectId);
      expect(list.some((v) => v.id === variable.id)).toBe(true);
    });
  });

  // ── List sorting ─────────────────────────────────────────────────────

  describe('list sorting', () => {
    it('sorts system first, then builtins by slug, then custom by position', async () => {
      const project = await projectService.create('Sort Test');
      const pid = project.projectId;

      // Seed builtins
      await variableService.seedBuiltins(pid);

      // Add custom variables
      const customA = await variableService.create(pid, 'Custom A');
      const customB = await variableService.create(pid, 'Custom B');

      const list = await variableService.list(pid);
      expect(list).toHaveLength(7);

      // System first
      expect(list[0]!.kind).toBe('system');
      // Then builtins
      expect(list[1]!.kind).toBe('builtin');
      expect(list[1]!.id).toBe('tone');
      expect(list[2]!.id).toBe('style');
      expect(list[3]!.id).toBe('constraints');
      expect(list[4]!.id).toBe('characters');
      // Then custom by position
      expect(list[5]!.kind).toBe('custom');
      expect(list[6]!.kind).toBe('custom');
    });
  });

  // ── get ───────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns variable metadata + content', async () => {
      const project = await projectService.create('Test');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const tone = (await variableService.list(pid)).find((v) => v.id === 'tone')!;
      await variableService.setContent(pid, tone.id, '<p>Tone content</p>');

      const result = await variableService.get(pid, tone.id);
      expect(result.variable.id).toBe('tone');
      expect(result.variable.name).toBe('Tone');
      expect(result.content).toBe('<p>Tone content</p>');
    });

    it('throws VariableError for nonexistent variable', async () => {
      const project = await projectService.create('Test');
      await expect(
        variableService.get(project.projectId, 'nonexistent'),
      ).rejects.toThrow(VariableError);
    });
  });

  // ── setContent ──────────────────────────────────────────────────────

  describe('setContent', () => {
    it('saves content and returns sha', async () => {
      const project = await projectService.create('Test');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const tone = (await variableService.list(pid)).find((v) => v.id === 'tone')!;
      const result = await variableService.setContent(pid, tone.id, 'Updated content');

      expect(result.sha).toBeTruthy();
      expect(typeof result.sha).toBe('string');

      // Verify via get
      const gotten = await variableService.get(pid, tone.id);
      expect(gotten.content).toBe('Updated content');
    });
  });

  // ── rename ───────────────────────────────────────────────────────────

  describe('rename', () => {
    it('renames a renamable variable', async () => {
      const project = await projectService.create('Test');
      const pid = project.projectId;
      const variable = await variableService.create(pid, 'Old Name');

      const renamed = await variableService.rename(pid, variable.id, 'New Name');
      expect(renamed.name).toBe('New Name');
      expect(renamed.updatedAt).not.toBe(variable.updatedAt);
    });

    it('rejects rename on non-renamable variable (builtin)', async () => {
      const project = await projectService.create('Test');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const tone = (await variableService.list(pid)).find((v) => v.id === 'tone')!;
      await expect(
        variableService.rename(pid, tone.id, 'New Tone'),
      ).rejects.toThrow(VariableError);
      await expect(
        variableService.rename(pid, tone.id, 'New Tone'),
      ).rejects.toMatchObject({ code: 'NOT_RENAMABLE' });
    });

    it('rejects reserved names', async () => {
      const project = await projectService.create('Test');
      const pid = project.projectId;
      const variable = await variableService.create(pid, 'My Var');

      await expect(
        variableService.rename(pid, variable.id, 'tone'),
      ).rejects.toMatchObject({ code: 'NAME_RESERVED' });
    });

    it('rejects duplicate names', async () => {
      const project = await projectService.create('Test');
      const pid = project.projectId;
      await variableService.create(pid, 'Existing Var');
      const variable = await variableService.create(pid, 'My Var');

      await expect(
        variableService.rename(pid, variable.id, 'Existing Var'),
      ).rejects.toMatchObject({ code: 'NAME_TAKEN' });
    });
  });

  // ── setScope ─────────────────────────────────────────────────────────

  describe('setScope', () => {
    it('updates scope on non-scopeLocked variable', async () => {
      const project = await projectService.create('Test');
      const pid = project.projectId;
      const variable = await variableService.create(pid, 'Scope Var');
      expect(variable.scope).toBe('manual');

      const updated = await variableService.setScope(pid, variable.id, 'write');
      expect(updated.scope).toBe('write');
    });

    it('rejects SCOPE_LOCKED on system variable', async () => {
      const project = await projectService.create('Test');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const gc = (await variableService.list(pid)).find((v) => v.id === 'global-constraints')!;
      await expect(
        variableService.setScope(pid, gc.id, 'write'),
      ).rejects.toMatchObject({ code: 'SCOPE_LOCKED' });
    });
  });

  // ── reorder ──────────────────────────────────────────────────────────

  describe('reorder', () => {
    it('renumbers custom variables to maintain consecutive positions', async () => {
      const project = await projectService.create('Test');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const a = await variableService.create(pid, 'A');
      const b = await variableService.create(pid, 'B');
      const c = await variableService.create(pid, 'C');

      // Move C to position 0
      const result = await variableService.reorder(pid, c.id, 0);
      const customVars = result.filter((v) => v.kind === 'custom');

      expect(customVars[0]!.name).toBe('C');
      expect(customVars[0]!.position).toBe(0);
      expect(customVars[1]!.name).toBe('A');
      expect(customVars[1]!.position).toBe(1);
      expect(customVars[2]!.name).toBe('B');
      expect(customVars[2]!.position).toBe(2);
    });

    it('rejects reorder on non-custom variable', async () => {
      const project = await projectService.create('Test');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const tone = (await variableService.list(pid)).find((v) => v.id === 'tone')!;
      await expect(
        variableService.reorder(pid, tone.id, 0),
      ).rejects.toThrow();
    });
  });

  // ── delete ───────────────────────────────────────────────────────────

  describe('delete', () => {
    it('moves deletable variable to archive', async () => {
      const project = await projectService.create('Test');
      const pid = project.projectId;
      const variable = await variableService.create(pid, 'Delete Me');

      const deleted = await variableService.delete(pid, variable.id);
      expect(deleted.id).toBe(variable.id);

      // Not in list
      const list = await variableService.list(pid);
      expect(list.find((v) => v.id === variable.id)).toBeUndefined();

      // Archived file exists
      const service = projectService.getOpenProject(pid)!;
      const tree = await service.readTree('refs/heads/main');
      const archivedKey = `variables/archived/${variable.id}/variable.json`;
      expect(tree[archivedKey]).toBeDefined();
      expect(tree[`variables/${variable.id}/variable.json`]).toBeUndefined();
    });

    it('rejects delete on non-deletable variable (builtin)', async () => {
      const project = await projectService.create('Test');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const tone = (await variableService.list(pid)).find((v) => v.id === 'tone')!;
      await expect(
        variableService.delete(pid, tone.id),
      ).rejects.toMatchObject({ code: 'NOT_DELETABLE' });
    });
  });

  // ── Card CRUD ────────────────────────────────────────────────────────

  describe('cards', () => {
    it('addCard creates a card for characters variable', async () => {
      const project = await projectService.create('Card Add');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const chars = (await variableService.list(pid)).find((v) => v.id === 'characters')!;
      const result = await variableService.addCard(pid, chars.id, 'Alice');

      expect(result.cardId).toBeTruthy();

      const cards = await variableService.listCards(pid, chars.id);
      expect(cards).toHaveLength(1);
      expect(cards[0]!.title).toBe('Alice');
    });

    it('addCard on non-characters variable throws', async () => {
      const project = await projectService.create('Card Error');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const tone = (await variableService.list(pid)).find((v) => v.id === 'tone')!;
      await expect(
        variableService.addCard(pid, tone.id, 'Should Fail'),
      ).rejects.toThrow(/Cards are only available/);
    });

    it('saveCard updates card content', async () => {
      const project = await projectService.create('Card Save');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const chars = (await variableService.list(pid)).find((v) => v.id === 'characters')!;
      const { cardId } = await variableService.addCard(pid, chars.id, 'Bob');
      await variableService.saveCard(pid, chars.id, cardId, '<h3>Bob Updated</h3>\n<p>New bio</p>');

      const cards = await variableService.listCards(pid, chars.id);
      const card = cards.find((c) => c.cardId === cardId);
      expect(card).toBeDefined();
      expect(card!.title).toBe('Bob Updated');
    });

    it('removeCard deletes the card', async () => {
      const project = await projectService.create('Card Remove');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const chars = (await variableService.list(pid)).find((v) => v.id === 'characters')!;
      const { cardId } = await variableService.addCard(pid, chars.id, 'Charlie');

      let cards = await variableService.listCards(pid, chars.id);
      expect(cards).toHaveLength(1);

      const result = await variableService.removeCard(pid, chars.id, cardId);
      expect(result).toEqual({ ok: true });

      cards = await variableService.listCards(pid, chars.id);
      expect(cards).toHaveLength(0);
    });

    it('listCards returns empty array when no cards exist', async () => {
      const project = await projectService.create('Empty Cards');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const chars = (await variableService.list(pid)).find((v) => v.id === 'characters')!;
      const cards = await variableService.listCards(pid, chars.id);
      expect(cards).toEqual([]);
    });
  });

  // ── assemble ─────────────────────────────────────────────────────────

  describe('assemble', () => {
    it('selects always-scope variables for all steps', async () => {
      const project = await projectService.create('Assemble Always');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const tone = (await variableService.list(pid)).find((v) => v.id === 'tone')!;
      await variableService.setContent(pid, tone.id, '<p>Formal tone</p>');

      const expandResult = await variableService.assemble('expand', pid);
      const writeResult = await variableService.assemble('write', pid);
      const iterateResult = await variableService.assemble('iterate', pid);

      expect(expandResult).toContain('Formal tone');
      expect(writeResult).toContain('Formal tone');
      expect(iterateResult).toContain('Formal tone');
    });

    it('selects expand-scope variables only for expand step', async () => {
      const project = await projectService.create('Assemble Expand');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const tone = (await variableService.list(pid)).find((v) => v.id === 'tone')!;
      await variableService.setScope(pid, tone.id, 'expand');
      await variableService.setContent(pid, tone.id, '<p>Expand only</p>');

      const expandResult = await variableService.assemble('expand', pid);
      const writeResult = await variableService.assemble('write', pid);
      const iterateResult = await variableService.assemble('iterate', pid);

      expect(expandResult).toContain('Expand only');
      expect(writeResult).not.toContain('Expand only');
      expect(iterateResult).not.toContain('Expand only');
    });

    it('selects write-scope variables only for write step', async () => {
      const project = await projectService.create('Assemble Write');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const tone = (await variableService.list(pid)).find((v) => v.id === 'tone')!;
      await variableService.setScope(pid, tone.id, 'write');
      await variableService.setContent(pid, tone.id, '<p>Write scope</p>');

      const expandResult = await variableService.assemble('expand', pid);
      const writeResult = await variableService.assemble('write', pid);
      const iterateResult = await variableService.assemble('iterate', pid);

      expect(expandResult).not.toContain('Write scope');
      expect(writeResult).toContain('Write scope');
      expect(iterateResult).not.toContain('Write scope');
    });

    it('iterate step only selects always-scope variables', async () => {
      const project = await projectService.create('Assemble Iterate');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const tone = (await variableService.list(pid)).find((v) => v.id === 'tone')!;
      await variableService.setContent(pid, tone.id, '<p>Always content</p>');

      const style = (await variableService.list(pid)).find((v) => v.id === 'style')!;
      await variableService.setScope(pid, style.id, 'expand');
      await variableService.setContent(pid, style.id, '<p>Expand content</p>');

      const iterateResult = await variableService.assemble('iterate', pid);
      expect(iterateResult).toContain('Always content');
      expect(iterateResult).not.toContain('Expand content');
    });

    it('manual-scope variables only appear when in manualVariableIds', async () => {
      const project = await projectService.create('Assemble Manual');
      const pid = project.projectId;
      const variable = await variableService.create(pid, 'Manual Var', 'manual');
      await variableService.setContent(pid, variable.id, '<p>Manual content</p>');

      const withoutManual = await variableService.assemble('expand', pid);
      expect(withoutManual).not.toContain('Manual content');

      const withManual = await variableService.assemble('expand', pid, {
        manualVariableIds: [variable.id],
      });
      expect(withManual).toContain('Manual content');
    });

    it('respects excludeVariableIds', async () => {
      const project = await projectService.create('Assemble Exclude');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const tone = (await variableService.list(pid)).find((v) => v.id === 'tone')!;
      const style = (await variableService.list(pid)).find((v) => v.id === 'style')!;
      await variableService.setContent(pid, tone.id, '<p>Tone content</p>');
      await variableService.setContent(pid, style.id, '<p>Style content</p>');

      const full = await variableService.assemble('expand', pid);
      expect(full).toContain('Tone content');
      expect(full).toContain('Style content');

      const filtered = await variableService.assemble('expand', pid, {
        excludeVariableIds: [tone.id],
      });
      expect(filtered).not.toContain('Tone content');
      expect(filtered).toContain('Style content');
    });

    it('returns empty string when no variables match', async () => {
      const project = await projectService.create('Assemble Empty');
      const result = await variableService.assemble('expand', project.projectId);
      expect(result).toBe('');
    });

    it('uses clean Markdown sections (not fenced blocks)', async () => {
      const project = await projectService.create('Assemble Format');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const tone = (await variableService.list(pid)).find((v) => v.id === 'tone')!;
      await variableService.setContent(pid, tone.id, '<p>Tone content</p>');

      const result = await variableService.assemble('expand', pid);
      expect(result).toContain('## Tone');
      expect(result).toContain('Tone content');
      expect(result).not.toMatch(/=== STORY VARIABLE/);
      expect(result).not.toMatch(/=== END VARIABLE/);
    });

    it('uses special heading for Global Constraints', async () => {
      const project = await projectService.create('Assemble GC');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const gc = (await variableService.list(pid)).find((v) => v.id === 'global-constraints')!;
      await variableService.setContent(pid, gc.id, '<p>Book invariants</p>');

      const result = await variableService.assemble('expand', pid);
      expect(result).toContain('## Global Constraints (book-wide invariants — always apply)');
    });

    it('skips variables with empty content', async () => {
      const project = await projectService.create('Assemble Empty Content');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      // Builtins have empty content by default — assemble should return nothing
      const result = await variableService.assemble('expand', pid);
      expect(result).toBe('');
    });

    it('strips HTML from content', async () => {
      const project = await projectService.create('Assemble Strip');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const tone = (await variableService.list(pid)).find((v) => v.id === 'tone')!;
      await variableService.setContent(
        pid,
        tone.id,
        '<p><strong>Bold</strong> and <em>italic</em></p><br><p>Line two</p>',
      );

      const result = await variableService.assemble('expand', pid);
      expect(result).toContain('Bold and italic');
      expect(result).toContain('Line two');
      expect(result).not.toContain('<strong>');
      expect(result).not.toContain('<p>');
    });

    it('outputs system first, then builtins, then custom', async () => {
      const project = await projectService.create('Assemble Order');
      const pid = project.projectId;
      await variableService.seedBuiltins(pid);

      const tone = (await variableService.list(pid)).find((v) => v.id === 'tone')!;
      const gc = (await variableService.list(pid)).find((v) => v.id === 'global-constraints')!;
      await variableService.setContent(pid, gc.id, '<p>GC content</p>');
      await variableService.setContent(pid, tone.id, '<p>Tone content</p>');

      const custom = await variableService.create(pid, 'Custom Var', 'always');
      await variableService.setContent(pid, custom.id, '<p>Custom content</p>');

      const result = await variableService.assemble('expand', pid);

      const gcIdx = result.indexOf('Global Constraints');
      const toneIdx = result.indexOf('Tone');
      const customIdx = result.indexOf('Custom content');

      expect(gcIdx).toBeLessThan(toneIdx);
      expect(toneIdx).toBeLessThan(customIdx);
    });
  });

  // ── Error: project not open ──────────────────────────────────────────

  it('throws when project is not open', async () => {
    await expect(
      variableService.list('nonexistent'),
    ).rejects.toThrow(/Project not open/i);

    await expect(
      variableService.create('nonexistent', 'Test'),
    ).rejects.toThrow(/Project not open/i);
  });
});
