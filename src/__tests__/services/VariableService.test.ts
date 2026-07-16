/**
 * VariableService tests (WP-11).
 *
 * Each test creates a throwaway projects directory, exercises VariableService
 * methods against a ProjectService-backed Git repo, then cleans up.
 * No Electron dependency.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectService } from '../../main/services/ProjectService';
import { VariableService } from '../../main/services/VariableService';
import type { Variable } from '../../shared/schemas/variable';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('VariableService', () => {
  let tmpDir: string;
  let projectService: ProjectService;
  let variableService: VariableService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-test-variables-'));
    projectService = new ProjectService(tmpDir);
    variableService = new VariableService(projectService);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── create / list ──────────────────────────────────────────────────────

  it('create returns a valid variable and list includes it', async () => {
    const project = await projectService.create('Test');
    const variable = await variableService.create(
      project.projectId,
      'My Tone',
      'tone',
    );

    expect(variable.id).toMatch(
      /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/,
    );
    expect(variable.name).toBe('My Tone');
    expect(variable.core).toBe('tone');
    expect(variable.scope).toBe('always');
    expect(variable.active).toBe(true);
    expect(variable.order).toBe(0);
    expect(variable.schemaVersion).toBe(1);

    const list = await variableService.list(project.projectId);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(variable.id);
  });

  it('create for core type that already exists throws', async () => {
    const project = await projectService.create('Dup Test');
    await variableService.create(project.projectId, 'First Tone', 'tone');

    await expect(
      variableService.create(project.projectId, 'Second Tone', 'tone'),
    ).rejects.toThrow(/Core variable "tone" already exists/i);
  });

  it('create with no core creates a custom variable with manual scope', async () => {
    const project = await projectService.create('Custom Test');
    const variable = await variableService.create(
      project.projectId,
      'Custom Var',
    );

    expect(variable.core).toBeNull();
    expect(variable.scope).toBe('manual');
  });

  it('create with explicit scope persists it', async () => {
    const project = await projectService.create('Scope Test');
    const variable = await variableService.create(
      project.projectId,
      'Write Var',
      'style',
      'write',
    );

    expect(variable.core).toBe('style');
    expect(variable.scope).toBe('write');
  });

  // ── Order auto-increment ─────────────────────────────────────────────

  it('order auto-increments on create', async () => {
    const project = await projectService.create('Order Test');
    const v1 = await variableService.create(project.projectId, 'Var 1');
    const v2 = await variableService.create(project.projectId, 'Var 2');
    const v3 = await variableService.create(project.projectId, 'Var 3');

    expect(v1.order).toBe(0);
    expect(v2.order).toBe(1);
    expect(v3.order).toBe(2);

    // Verify list order matches creation order
    const list = await variableService.list(project.projectId);
    expect(list).toHaveLength(3);
    expect(list[0]!.order).toBe(0);
    expect(list[1]!.order).toBe(1);
    expect(list[2]!.order).toBe(2);
  });

  // ── List sorting: core first ─────────────────────────────────────────

  it('list sorts core variables first in canonical order', async () => {
    const project = await projectService.create('Sort Test');
    const pid = project.projectId;

    // Create them out of canonical order
    const style = await variableService.create(pid, 'Style', 'style');
    const characters = await variableService.create(pid, 'Characters', 'characters');
    const constraints = await variableService.create(pid, 'Constraints', 'constraints');
    const tone = await variableService.create(pid, 'Tone', 'tone');

    const list = await variableService.list(pid);

    // Core variables come first in canonical order: tone, style, constraints, characters
    expect(list[0]!.core).toBe('tone');
    expect(list[1]!.core).toBe('style');
    expect(list[2]!.core).toBe('constraints');
    expect(list[3]!.core).toBe('characters');
  });

  it('list puts custom variables after core variables', async () => {
    const project = await projectService.create('Mixed Sort');
    const pid = project.projectId;

    const custom1 = await variableService.create(pid, 'Custom A');
    const tone = await variableService.create(pid, 'Tone', 'tone');
    const custom2 = await variableService.create(pid, 'Custom B');

    const list = await variableService.list(pid);
    expect(list).toHaveLength(3);

    // Core first (tone), then custom sorted by order
    expect(list[0]!.core).toBe('tone');
    expect(list[1]!.core).toBeNull();
    expect(list[2]!.core).toBeNull();
  });

  // ── get ───────────────────────────────────────────────────────────────

  it('get returns variable.json + content.html', async () => {
    const project = await projectService.create('Get Test');
    const pid = project.projectId;

    const variable = await variableService.create(pid, 'Tone Variable', 'tone');
    await variableService.save(pid, variable.id, '<p>Tone content</p>');

    const result = await variableService.get(pid, variable.id);
    expect(result.variable.id).toBe(variable.id);
    expect(result.variable.name).toBe('Tone Variable');
    expect(result.variable.core).toBe('tone');
    expect(result.content).toBe('<p>Tone content</p>');
  });

  it('get on nonexistent variable throws', async () => {
    const project = await projectService.create('Get Error');
    await expect(
      variableService.get(project.projectId, '01ARZ3NDEKTSV4RRFFQ69G5FAV'),
    ).rejects.toThrow(/Variable not found/i);
  });

  // ── save ──────────────────────────────────────────────────────────────

  it('save updates content.html and returns sha', async () => {
    const project = await projectService.create('Save Test');
    const pid = project.projectId;

    const variable = await variableService.create(pid, 'Save Var');
    const result = await variableService.save(
      pid,
      variable.id,
      'Updated content',
    );

    expect(result.sha).toBeTruthy();
    expect(typeof result.sha).toBe('string');

    // Verify via get
    const gotten = await variableService.get(pid, variable.id);
    expect(gotten.content).toBe('Updated content');
  });

  it('save on nonexistent variable throws', async () => {
    const project = await projectService.create('Save Error');
    await expect(
      variableService.save(
        project.projectId,
        '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        'content',
      ),
    ).rejects.toThrow(/Variable not found/i);
  });

  // ── setScope / setActive ─────────────────────────────────────────────

  it('setScope updates and returns variable', async () => {
    const project = await projectService.create('Scope Change');
    const pid = project.projectId;

    const variable = await variableService.create(pid, 'Scope Var', 'style');
    expect(variable.scope).toBe('always');

    const updated = await variableService.setScope(pid, variable.id, 'write');
    expect(updated.scope).toBe('write');
    expect(updated.core).toBe('style');

    // Verify persistence
    const gotten = await variableService.get(pid, variable.id);
    expect(gotten.variable.scope).toBe('write');
  });

  it('setActive updates and returns variable', async () => {
    const project = await projectService.create('Active Change');
    const pid = project.projectId;

    const variable = await variableService.create(pid, 'Active Var');
    expect(variable.active).toBe(true);

    const deactivated = await variableService.setActive(pid, variable.id, false);
    expect(deactivated.active).toBe(false);

    const reactivated = await variableService.setActive(pid, variable.id, true);
    expect(reactivated.active).toBe(true);

    // Verify persistence
    const gotten = await variableService.get(pid, variable.id);
    expect(gotten.variable.active).toBe(true);
  });

  // ── archive ───────────────────────────────────────────────────────────

  it('archive moves to archived path and sets active=false', async () => {
    const project = await projectService.create('Archive Test');
    const pid = project.projectId;

    const variable = await variableService.create(pid, 'Archive Me');
    const archived = await variableService.archive(pid, variable.id);

    expect(archived.active).toBe(false);

    // Not in list
    const list = await variableService.list(pid);
    expect(list.find((v) => v.id === variable.id)).toBeUndefined();

    // Archived file exists with active=false
    const service = projectService.getOpenProject(pid)!;
    const tree = await service.readTree('refs/heads/main');
    const archivedKey = `variables/archived/${variable.id}/variable.json`;
    expect(tree[archivedKey]).toBeDefined();
    expect(tree[`variables/${variable.id}/variable.json`]).toBeUndefined();

    const buf = await service.readBlob('refs/heads/main', archivedKey);
    const archivedVar = JSON.parse(buf.toString('utf-8'));
    expect(archivedVar.active).toBe(false);
    expect(archivedVar.name).toBe('Archive Me');
  });

  it('archive on already-archived variable throws', async () => {
    const project = await projectService.create('Double Archive');
    const pid = project.projectId;

    const variable = await variableService.create(pid, 'To Archive');
    await variableService.archive(pid, variable.id);

    await expect(
      variableService.archive(pid, variable.id),
    ).rejects.toThrow(/Variable already archived/i);
  });

  it('archive on nonexistent variable throws', async () => {
    const project = await projectService.create('Archive Error');
    await expect(
      variableService.archive(
        project.projectId,
        '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      ),
    ).rejects.toThrow(/Variable not found/i);
  });

  // ── Card CRUD ────────────────────────────────────────────────────────

  it('addCard creates a card for characters variable', async () => {
    const project = await projectService.create('Card Add');
    const pid = project.projectId;

    const variable = await variableService.create(
      pid,
      'Characters',
      'characters',
    );
    const result = await variableService.addCard(
      pid,
      variable.id,
      'Alice',
    );

    expect(result.cardId).toBeTruthy();

    const cards = await variableService.listCards(pid, variable.id);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.cardId).toBe(result.cardId);
    expect(cards[0]!.title).toBe('Alice');
  });

  it('addCard on non-characters variable throws', async () => {
    const project = await projectService.create('Card Error');
    const pid = project.projectId;

    const variable = await variableService.create(pid, 'Tone', 'tone');
    await expect(
      variableService.addCard(pid, variable.id, 'Should Fail'),
    ).rejects.toThrow(
      /Cards are only available for Character\/Voice Sheet variables/i,
    );
  });

  it('saveCard updates card content', async () => {
    const project = await projectService.create('Card Save');
    const pid = project.projectId;

    const variable = await variableService.create(
      pid,
      'Characters',
      'characters',
    );
    const { cardId } = await variableService.addCard(pid, variable.id, 'Bob');

    await variableService.saveCard(
      pid,
      variable.id,
      cardId,
      '<h3>Bob Updated</h3>\n<p>New bio</p>',
    );

    const cards = await variableService.listCards(pid, variable.id);
    const card = cards.find((c) => c.cardId === cardId);
    expect(card).toBeDefined();
    expect(card!.title).toBe('Bob Updated');
  });

  it('removeCard deletes the card', async () => {
    const project = await projectService.create('Card Remove');
    const pid = project.projectId;

    const variable = await variableService.create(
      pid,
      'Characters',
      'characters',
    );
    const { cardId } = await variableService.addCard(pid, variable.id, 'Charlie');

    // Verify it exists
    let cards = await variableService.listCards(pid, variable.id);
    expect(cards).toHaveLength(1);

    // Remove it
    const result = await variableService.removeCard(pid, variable.id, cardId);
    expect(result).toEqual({ ok: true });

    // Verify it's gone
    cards = await variableService.listCards(pid, variable.id);
    expect(cards).toHaveLength(0);
  });

  it('removeCard on nonexistent card throws', async () => {
    const project = await projectService.create('Card Remove Error');
    const pid = project.projectId;

    const variable = await variableService.create(
      pid,
      'Characters',
      'characters',
    );
    await expect(
      variableService.removeCard(
        pid,
        variable.id,
        '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      ),
    ).rejects.toThrow(/Card not found/i);
  });

  it('listCards returns empty array when no cards exist', async () => {
    const project = await projectService.create('Empty Cards');
    const pid = project.projectId;

    const variable = await variableService.create(
      pid,
      'Characters',
      'characters',
    );
    const cards = await variableService.listCards(pid, variable.id);
    expect(cards).toEqual([]);
  });

  // ── Multiple variables with different scopes ─────────────────────────

  it('variables with different scopes persist correctly', async () => {
    const project = await projectService.create('Multi Scope');
    const pid = project.projectId;

    await variableService.create(pid, 'Always Var', 'tone', 'always');
    await variableService.create(pid, 'Expand Var', 'style', 'expand');
    await variableService.create(pid, 'Write Var', 'constraints', 'write');
    await variableService.create(pid, 'Manual Var', 'characters', 'manual');

    const list = await variableService.list(pid);
    expect(list).toHaveLength(4);

    const scopes = list.map((v) => v.scope);
    expect(scopes).toContain('always');
    expect(scopes).toContain('expand');
    expect(scopes).toContain('write');
    expect(scopes).toContain('manual');

    // Verify via get
    for (const v of list) {
      const result = await variableService.get(pid, v.id);
      expect(result.variable.scope).toBe(v.scope);
    }
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

  // ── assemble(step) (WP-12) ───────────────────────────────────────────

  describe('assemble', () => {
    it('selects always-scope variables for all steps', async () => {
      const project = await projectService.create('Assemble Always');
      const pid = project.projectId;

      const v = await variableService.create(pid, 'Tone', 'tone', 'always');
      await variableService.save(pid, v.id, '<p>Formal tone</p>');

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

      const v = await variableService.create(pid, 'Tone', 'tone', 'expand');
      await variableService.save(pid, v.id, '<p>Expand only</p>');

      const expandResult = await variableService.assemble('expand', pid);
      const writeResult = await variableService.assemble('write', pid);
      const iterateResult = await variableService.assemble('iterate', pid);

      expect(expandResult).toContain('Expand only');
      expect(writeResult).toBe('');
      expect(iterateResult).toBe('');
    });

    it('selects write-scope variables only for write step', async () => {
      const project = await projectService.create('Assemble Write');
      const pid = project.projectId;

      const v = await variableService.create(pid, 'Style', 'style', 'write');
      await variableService.save(pid, v.id, '<p>Write scope</p>');

      const expandResult = await variableService.assemble('expand', pid);
      const writeResult = await variableService.assemble('write', pid);
      const iterateResult = await variableService.assemble('iterate', pid);

      expect(expandResult).toBe('');
      expect(writeResult).toContain('Write scope');
      expect(iterateResult).toBe('');
    });

    it('iterate step only selects always-scope variables', async () => {
      const project = await projectService.create('Assemble Iterate');
      const pid = project.projectId;

      // No variable has scope 'iterate' — the iterate step should only match always-scope vars
      const always = await variableService.create(pid, 'Always', 'tone', 'always');
      await variableService.save(pid, always.id, '<p>Always content</p>');
      const expand = await variableService.create(pid, 'Expand', 'style', 'expand');
      await variableService.save(pid, expand.id, '<p>Expand content</p>');

      const iterateResult = await variableService.assemble('iterate', pid);

      // Only the always-scoped variable appears in iterate step
      expect(iterateResult).toContain('Always content');
      expect(iterateResult).not.toContain('Expand content');
    });

    it('manual-scope variables never appear in any step', async () => {
      const project = await projectService.create('Assemble Manual');
      const pid = project.projectId;

      const v = await variableService.create(pid, 'Custom', null, 'manual');
      await variableService.save(pid, v.id, '<p>Manual only</p>');

      const expandResult = await variableService.assemble('expand', pid);
      const writeResult = await variableService.assemble('write', pid);
      const iterateResult = await variableService.assemble('iterate', pid);

      expect(expandResult).toBe('');
      expect(writeResult).toBe('');
      expect(iterateResult).toBe('');
    });

    it('excludes inactive variables', async () => {
      const project = await projectService.create('Assemble Inactive');
      const pid = project.projectId;

      const v = await variableService.create(pid, 'Tone', 'tone', 'always');
      await variableService.save(pid, v.id, '<p>Active content</p>');
      await variableService.setActive(pid, v.id, false);

      const result = await variableService.assemble('expand', pid);
      expect(result).toBe('');
    });

    it('respects excludeVariableIds', async () => {
      const project = await projectService.create('Assemble Exclude');
      const pid = project.projectId;

      const v1 = await variableService.create(pid, 'Tone', 'tone', 'always');
      const v2 = await variableService.create(pid, 'Style', 'style', 'always');
      await variableService.save(pid, v1.id, '<p>Tone content</p>');
      await variableService.save(pid, v2.id, '<p>Style content</p>');

      const full = await variableService.assemble('expand', pid);
      expect(full).toContain('Tone content');
      expect(full).toContain('Style content');

      const filtered = await variableService.assemble('expand', pid, [v1.id]);
      expect(filtered).not.toContain('Tone content');
      expect(filtered).toContain('Style content');
    });

    it('returns empty string when no variables match', async () => {
      const project = await projectService.create('Assemble Empty');
      const result = await variableService.assemble('expand', project.projectId);
      expect(result).toBe('');
    });

    it('emits fenced blocks with core/custom labels', async () => {
      const project = await projectService.create('Assemble Blocks');
      const pid = project.projectId;

      const core = await variableService.create(pid, 'Tone', 'tone', 'always');
      await variableService.save(pid, core.id, '<p>Core content</p>');

      const custom = await variableService.create(pid, 'CustomVar', null, 'always');
      await variableService.save(pid, custom.id, '<p>Custom content</p>');

      const result = await variableService.assemble('expand', pid);

      // Both variables appear
      expect(result).toContain('Core content');
      expect(result).toContain('Custom content');

      // Core labeled (core), custom labeled (custom)
      expect(result).toContain('=== STORY VARIABLE: Tone (core) ===');
      expect(result).toContain('=== STORY VARIABLE: CustomVar (custom) ===');

      // Fenced with END VARIABLE
      const blocks = result.split('=== END VARIABLE ===');
      expect(blocks.length - 1).toBe(2);
    });

    it('strips HTML from content', async () => {
      const project = await projectService.create('Assemble Strip');
      const pid = project.projectId;

      const v = await variableService.create(pid, 'Tone', 'tone', 'always');
      await variableService.save(
        pid,
        v.id,
        '<p><strong>Bold</strong> and <em>italic</em></p><br><p>Line two</p>',
      );

      const result = await variableService.assemble('expand', pid);
      expect(result).toContain('Bold and italic');
      expect(result).toContain('Line two');
      expect(result).not.toContain('<strong>');
      expect(result).not.toContain('<p>');
    });

    it('sorts core variables first, then custom by order', async () => {
      const project = await projectService.create('Assemble Sort');
      const pid = project.projectId;

      // Create in reverse order
      const customB = await variableService.create(pid, 'ZCustom', null, 'always');
      await variableService.save(pid, customB.id, '<p>ZCustom</p>');
      const characters = await variableService.create(pid, 'Characters', 'characters', 'always');
      await variableService.save(pid, characters.id, '<p>Characters</p>');
      const tone = await variableService.create(pid, 'Tone', 'tone', 'always');
      await variableService.save(pid, tone.id, '<p>Tone</p>');
      const customA = await variableService.create(pid, 'ACustom', null, 'always');
      await variableService.save(pid, customA.id, '<p>ACustom</p>');

      const result = await variableService.assemble('expand', pid);

      // Core variables (tone, characters) should appear before custom
      const toneIdx = result.indexOf('Tone');
      const charsIdx = result.indexOf('Characters');
      const customAIdx = result.indexOf('ACustom');
      const customBIdx = result.indexOf('ZCustom');

      // Core comes first
      expect(toneIdx).toBeLessThan(customAIdx);
      expect(toneIdx).toBeLessThan(customBIdx);
      expect(charsIdx).toBeLessThan(customAIdx);
      expect(charsIdx).toBeLessThan(customBIdx);

      // Characters after tone in canonical order
      expect(toneIdx).toBeLessThan(charsIdx);
    });
  });
});
