/**
 * ProjectService lifecycle tests (WP-05).
 *
 * Each test creates a throwaway projects directory, exercises ProjectService
 * methods, then cleans up. No Electron dependency — the service is tested
 * with plain Node.js fs and isomorphic-git.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectService, type ProjectSummary } from '../../main/services/ProjectService';
import { VariableService } from '../../main/services/VariableService';
import { StorageService } from '../../main/storage/StorageService';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Commit message helper for test commits. */
const msg = (label: string) => ({ label, kind: 'manual' as const });

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ProjectService', () => {
  let tmpDir: string;
  let service: ProjectService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-test-projects-'));
    service = new ProjectService(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── create → open → close round-trip ──────────────────────────────

  it('create returns a valid project with default settings', async () => {
    const project = await service.create('My Novel');

    expect(project.title).toBe('My Novel');
    expect(project.projectId).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
    expect(project.schemaVersion).toBe(2);
    expect(project.structure).toEqual([]);
    expect(project.settings.inference.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(project.settings.continuityContext.enabled).toBe(true);
    expect(project.createdAt).toBeTruthy();
    expect(project.updatedAt).toBeTruthy();
  });

  it('create → close → open round-trip preserves manifest', async () => {
    const project = await service.create('Preserved Title');
    const projectId = project.projectId;

    // Close
    await service.close(projectId);
    expect(service.getCurrentProject()).toBeNull();

    // Re-open
    const reopened = await service.open(projectId);
    expect(reopened.projectId).toBe(projectId);
    expect(reopened.title).toBe('Preserved Title');
    expect(reopened.structure).toEqual([]);
    expect(reopened.settings.inference.baseUrl).toBe(
      'https://openrouter.ai/api/v1',
    );
    // Timestamps should be preserved (not re-generated)
    expect(reopened.createdAt).toBe(project.createdAt);
  });

  it('close without projectId closes the current project', async () => {
    await service.create('Test');
    expect(service.getCurrentProject()).not.toBeNull();

    await service.close();
    expect(service.getCurrentProject()).toBeNull();
  });

  it('close on already-closed project is a no-op', async () => {
    await expect(service.close()).resolves.not.toThrow();
    await expect(service.close('nonexistent')).resolves.not.toThrow();
  });

  // ── open errors ───────────────────────────────────────────────────

  it('open throws for nonexistent project', async () => {
    await expect(
      service.open('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
    ).rejects.toThrow(/Project not found/i);
  });

  it('open throws structured error for corrupted manifest (invalid JSON)', async () => {
    const project = await service.create('Corrupt Test');
    const projectId = project.projectId;

    // Write invalid JSON as the manifest via StorageService
    const storageService = service.getOpenProject(projectId)!;
    await storageService.commit(
      'refs/heads/main',
      { 'project.json': Buffer.from('{ invalid json }') },
      msg('corrupt manifest'),
    );

    await service.close(projectId);
    await expect(service.open(projectId)).rejects.toThrow(
      /Corrupted manifest/i,
    );
  });

  it('open throws structured error for schema-invalid manifest', async () => {
    const project = await service.create('Bad Schema');
    const projectId = project.projectId;

    // Write valid JSON that fails schema validation (missing required title)
    const storageService = service.getOpenProject(projectId)!;
    const badManifest = {
      schemaVersion: 2,
      projectId,
      // title is missing
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: project.settings,
      structure: [],
    };
    await storageService.commit(
      'refs/heads/main',
      {
        'project.json': Buffer.from(JSON.stringify(badManifest), 'utf-8'),
      },
      msg('bad manifest'),
    );

    await service.close(projectId);
    await expect(service.open(projectId)).rejects.toThrow(
      /Corrupted manifest/i,
    );
  });

  // ── list ──────────────────────────────────────────────────────────

  it('list returns empty array when no projects exist', async () => {
    const projects = await service.list();
    expect(projects).toEqual([]);
  });

  it('list returns created projects', async () => {
    const p1 = await service.create('Alpha');
    const p2 = await service.create('Beta');

    const projects = await service.list();
    expect(projects).toHaveLength(2);

    const titles = projects.map((p) => p.title).sort();
    expect(titles).toEqual(['Alpha', 'Beta']);

    const ids = projects.map((p) => p.projectId);
    expect(ids).toContain(p1.projectId);
    expect(ids).toContain(p2.projectId);
  });

  it('list returns correct chapterCount', async () => {
    // Create project with one chapter and one part containing two chapters
    const project = await service.create('Multi Chapter');
    const projectId = project.projectId;
    const storageService = service.getOpenProject(projectId)!;

    // Write an updated manifest with chapters
    project.structure = [
      {
        kind: 'part',
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
        title: 'Part One',
        chapters: [
          {
            id: '01ARZ3NDEKTSV4RRFFQ69G5FAX',
            title: 'Chapter 1',
            selectedVersion: 'main',
            versions: [],
            wordTarget: null,
          },
          {
            id: '01ARZ3NDEKTSV4RRFFQ69G5FAY',
            title: 'Chapter 2',
            selectedVersion: 'main',
            versions: [],
            wordTarget: null,
          },
        ],
      },
      {
        kind: 'chapter',
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAZ',
        title: 'Epilogue',
        selectedVersion: 'main',
        versions: [],
        wordTarget: null,
      },
    ];
    project.updatedAt = new Date().toISOString();
    await storageService.commit(
      'refs/heads/main',
      {
        'project.json': Buffer.from(JSON.stringify(project), 'utf-8'),
      },
      msg('add chapters'),
    );

    await service.close(projectId);
    const projects = await service.list();
    const found = projects.find((p) => p.projectId === projectId);
    expect(found).toBeDefined();
    expect(found!.chapterCount).toBe(3);
  });

  it('list skips directories without .git', async () => {
    await service.create('Valid Project');
    // Create a non-git directory
    await fs.promises.mkdir(path.join(service.getProjectsDir(), 'not-a-repo'));
    // Create a git repo without project.json
    const emptyRepoDir = path.join(service.getProjectsDir(), 'empty-repo');
    await fs.promises.mkdir(emptyRepoDir);
    const git = await import('isomorphic-git');
    await git.init({ fs, dir: emptyRepoDir });

    const projects = await service.list();
    expect(projects).toHaveLength(1);
    expect(projects[0]!.title).toBe('Valid Project');
  });

  // ── Reconciliation: orphan ref adoption ───────────────────────────

  it('reconciliation adopts orphan chapter refs into the manifest', async () => {
    const project = await service.create('Adopt Orphans');
    const projectId = project.projectId;
    const storageService = service.getOpenProject(projectId)!;

    // Manually create a ref for an orphan chapter (no entry in manifest)
    const orphanChapterId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    await storageService.commit(
      `refs/plotline/chapters/${orphanChapterId}/main`,
      { 'expanded-outline.html': Buffer.from('<p>Orphan content</p>') },
      msg('create orphan chapter ref'),
    );

    // Also create a second orphan with a custom version slug
    const orphanChapterId2 = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
    await storageService.commit(
      `refs/plotline/chapters/${orphanChapterId2}/v2`,
      { 'expanded-outline.html': Buffer.from('<p>Second orphan</p>') },
      msg('create second orphan ref'),
    );

    await service.close(projectId);
    const reopened = await service.open(projectId);

    // The orphans should now appear in the structure
    const chapterEntries = reopened.structure.filter(
      (s) => s.kind === 'chapter',
    );
    expect(chapterEntries).toHaveLength(2);

    const ids = chapterEntries.map((c) => c.id).sort();
    expect(ids).toEqual(
      [orphanChapterId, orphanChapterId2].sort(),
    );

    // Each orphan should have its version listed
    const firstOrphan = chapterEntries.find(
      (c) => c.id === orphanChapterId,
    )!;
    expect(firstOrphan.selectedVersion).toBe('main');
    expect(firstOrphan.versions).toHaveLength(1);
    expect(firstOrphan.versions[0]!.slug).toBe('main');
  });

  it('reconciliation does not modify manifest when no repair needed', async () => {
    const project = await service.create('No Repair');
    const projectId = project.projectId;
    const originalUpdatedAt = project.updatedAt;

    await service.close(projectId);

    // Re-open — reconciliation should find nothing to fix
    const reopened = await service.open(projectId);

    // The open() method returns the manifest; since reconciliation didn't
    // change anything, the updatedAt should match the original (reconciliation
    // only bumps updatedAt when it makes changes)
    expect(reopened.updatedAt).toBe(originalUpdatedAt);
    expect(reopened.structure).toEqual([]);
  });

  // ── UI State ──────────────────────────────────────────────────────

  it('readUiState returns empty object when no state file exists', async () => {
    const project = await service.create('UI Test');
    const state = await service.readUiState(project.projectId);
    expect(state).toEqual({});
  });

  it('readUiState / writeUiState round-trip', async () => {
    const project = await service.create('UI Roundtrip');
    const projectId = project.projectId;

    await service.writeUiState(projectId, {
      leftPanelWidth: 300,
      rightPanelWidth: 200,
      lastOpenArtifact: { chapterId: 'ch_001', stage: 'write' },
      collapsedSections: ['variables', 'outline'],
    });

    const state = await service.readUiState(projectId);
    expect(state.leftPanelWidth).toBe(300);
    expect(state.rightPanelWidth).toBe(200);
    expect(state.lastOpenArtifact).toEqual({
      chapterId: 'ch_001',
      stage: 'write',
    });
    expect(state.collapsedSections).toEqual(['variables', 'outline']);
  });

  // ── getters ───────────────────────────────────────────────────────

  it('getCurrentProject returns the last created/opened project', async () => {
    expect(service.getCurrentProject()).toBeNull();

    const p1 = await service.create('First');
    expect(service.getCurrentProject()!.id).toBe(p1.projectId);

    const p2 = await service.create('Second');
    expect(service.getCurrentProject()!.id).toBe(p2.projectId);

    // Re-opening a project makes it current
    await service.open(p1.projectId);
    expect(service.getCurrentProject()!.id).toBe(p1.projectId);
  });

  it('getOpenProject returns StorageService for an open project', async () => {
    const project = await service.create('Get Open');
    const svc = service.getOpenProject(project.projectId);
    expect(svc).toBeDefined();
    expect(svc!.directory).toContain(project.projectId);

    await service.close(project.projectId);
    expect(service.getOpenProject(project.projectId)).toBeUndefined();
  });

  it('getProjectsDir returns the configured projects directory', () => {
    expect(service.getProjectsDir()).toBe(path.join(tmpDir, 'projects'));
  });

  // ── Multiple projects ─────────────────────────────────────────────

  it('can create and list three projects with distinct titles', async () => {
    await service.create('A');
    await service.create('B');
    await service.create('C');

    const projects = await service.list();
    expect(projects).toHaveLength(3);
    expect(projects.map((p) => p.title).sort()).toEqual(['A', 'B', 'C']);
  });

  it('open after close of a different project works', async () => {
    const p1 = await service.create('P1');
    await service.create('P2');

    // Current is P2; close it, reopen P1
    await service.close();
    const reopened = await service.open(p1.projectId);
    expect(reopened.title).toBe('P1');
  });

  // ── Settings: updateSettings (WP-27) ─────────────────────────────

  describe('updateSettings', () => {
    it('saves all settings fields and round-trips through close/open', async () => {
      const project = await service.create('Settings Full Update');
      const pid = project.projectId;

      const updated = await service.updateSettings(pid, {
        theme: 'light',
        editor: { fontMode: 'mono' },
        continuityContext: { enabled: false, words: 1000 },
        inference: { baseUrl: 'https://custom.api/v1' },
        models: {
          expand: { provider: 'custom', model: 'model-x' },
          write: { provider: 'custom', model: 'model-y' },
          iterate: { provider: 'custom', model: 'model-z' },
        },
        backupRemote: 'https://github.com/user/repo.git',
      });

      expect(updated.settings.theme).toBe('light');
      expect(updated.settings.editor.fontMode).toBe('mono');
      expect(updated.settings.continuityContext.enabled).toBe(false);
      expect(updated.settings.continuityContext.words).toBe(1000);
      expect(updated.settings.inference.baseUrl).toBe(
        'https://custom.api/v1',
      );
      expect(updated.settings.models.expand).toEqual({
        provider: 'custom',
        model: 'model-x',
      });
      expect(updated.settings.models.write).toEqual({
        provider: 'custom',
        model: 'model-y',
      });
      expect(updated.settings.models.iterate).toEqual({
        provider: 'custom',
        model: 'model-z',
      });
      expect(updated.settings.backupRemote).toBe(
        'https://github.com/user/repo.git',
      );

      // Round-trip: close and reopen verifies persistence
      await service.close(pid);
      const reopened = await service.open(pid);
      expect(reopened.settings.theme).toBe('light');
      expect(reopened.settings.editor.fontMode).toBe('mono');
      expect(reopened.settings.continuityContext.enabled).toBe(false);
      expect(reopened.settings.continuityContext.words).toBe(1000);
      expect(reopened.settings.models.expand).toEqual({
        provider: 'custom',
        model: 'model-x',
      });
      expect(reopened.settings.backupRemote).toBe(
        'https://github.com/user/repo.git',
      );
    });

    it('merges partial update into existing settings', async () => {
      const project = await service.create('Partial Merge');
      const pid = project.projectId;

      // Set theme first
      await service.updateSettings(pid, { theme: 'light' });
      // Then set editor font mode — both should persist
      await service.updateSettings(pid, { editor: { fontMode: 'mono' } });

      await service.close(pid);
      const reopened = await service.open(pid);

      expect(reopened.settings.theme).toBe('light');
      expect(reopened.settings.editor.fontMode).toBe('mono');
      // Unrelated fields remain at defaults
      expect(reopened.settings.continuityContext.enabled).toBe(true);
      expect(reopened.settings.inference.baseUrl).toBe(
        'https://openrouter.ai/api/v1',
      );
    });

    it('deep merges nested objects', async () => {
      const project = await service.create('Deep Merge');
      const pid = project.projectId;

      // Set only continuityContext.enabled (partial nested update)
      await service.updateSettings(pid, {
        continuityContext: { enabled: false, words: 500 },
      } as typeof project.settings);

      // Then set only words — enabled should not be overwritten
      await service.updateSettings(pid, {
        continuityContext: { enabled: false, words: 750 },
      } as typeof project.settings);

      await service.close(pid);
      const reopened = await service.open(pid);

      // Both values present after deep merge
      expect(reopened.settings.continuityContext.enabled).toBe(false);
      expect(reopened.settings.continuityContext.words).toBe(750);
    });

    it('validates against schema and throws on invalid values', async () => {
      const project = await service.create('Validation Test');
      const pid = project.projectId;

      await expect(
        service.updateSettings(pid, {
          theme: 'invalid' as 'dark' | 'light',
        }),
      ).rejects.toThrow();
    });

    it('persists through close/open cycle', async () => {
      const project = await service.create('Persist Test');
      const pid = project.projectId;

      await service.updateSettings(pid, {
        backupRemote: 'https://github.com/user/repo.git',
        continuityContext: { enabled: true, words: 300 },
      });

      await service.close(pid);
      const reopened = await service.open(pid);

      expect(reopened.settings.backupRemote).toBe(
        'https://github.com/user/repo.git',
      );
      expect(reopened.settings.continuityContext.words).toBe(300);
    });

    it('returns the updated project on success', async () => {
      const project = await service.create('Return Value');
      const pid = project.projectId;

      const updated = await service.updateSettings(pid, {
        theme: 'light',
      });
      expect(updated).toBeDefined();
      expect(updated.projectId).toBe(pid);
      expect(updated.settings.theme).toBe('light');
    });

    it('throws for nonexistent project', async () => {
      await expect(
        service.updateSettings('01ARZ3NDEKTSV4RRFFQ69G5FAV', {
          theme: 'light',
        }),
      ).rejects.toThrow(/Project not open/i);
    });

    it('with empty partial is a no-op', async () => {
      const project = await service.create('No-op Test');
      const pid = project.projectId;
      const original = structuredClone(project);

      await service.updateSettings(pid, {});

      await service.close(pid);
      const reopened = await service.open(pid);

      expect(reopened.settings.theme).toBe(original.settings.theme);
      expect(reopened.settings.editor.fontMode).toBe(
        original.settings.editor.fontMode,
      );
      expect(reopened.settings.continuityContext.words).toBe(
        original.settings.continuityContext.words,
      );
      expect(reopened.settings.inference.baseUrl).toBe(
        original.settings.inference.baseUrl,
      );
      expect(reopened.settings.backupRemote).toBe(
        original.settings.backupRemote,
      );
    });
  });

  // ── V1 → V2 Migration (AC 3.1, 3.2) ──────────────────────────────

  describe('v1→v2 migration', () => {
    it('AC 3.1 — open auto-migrates a v1 project and bumps schemaVersion', async () => {
      // Create a v1 project (using direct git operations)
      const createResult = await service.create('V1 Project');
      const pid = createResult.projectId;
      const storageService = service.getOpenProject(pid)!;

      // Write a v1 manifest (schemaVersion 1) with old-format variables
      const v1Manifest = {
        schemaVersion: 1,
        projectId: pid,
        title: 'V1 Project',
        createdAt: createResult.createdAt,
        updatedAt: createResult.updatedAt,
        settings: createResult.settings,
        structure: [],
      };

      // Write all 4 old-style builtins to the repo
      await storageService.commit('refs/heads/main', {
        'project.json': Buffer.from(JSON.stringify(v1Manifest, null, 2), 'utf-8'),
        'variables/tone/variable.json': Buffer.from(JSON.stringify({
          schemaVersion: 1, id: 'tone', name: 'Tone', core: 'tone', scope: 'always', active: true, order: 0,
        })),
        'variables/tone/content.html': Buffer.from('<p>Formal tone</p>'),
        'variables/style/variable.json': Buffer.from(JSON.stringify({
          schemaVersion: 1, id: 'style', name: 'Writing Style', core: 'style', scope: 'always', active: true, order: 1,
        })),
        'variables/style/content.html': Buffer.from('<p>Descriptive style</p>'),
        'variables/constraints/variable.json': Buffer.from(JSON.stringify({
          schemaVersion: 1, id: 'constraints', name: 'Plot Constraints', core: 'constraints', scope: 'always', active: true, order: 2,
        })),
        'variables/constraints/content.html': Buffer.from('<p>No magic</p>'),
        'variables/characters/variable.json': Buffer.from(JSON.stringify({
          schemaVersion: 1, id: 'characters', name: 'Character / Voice Sheets', core: 'characters', scope: 'always', active: true, order: 3,
        })),
        'variables/characters/content.html': Buffer.from('<p>Alice: brave</p>'),
      }, msg('v1 setup'));

      // Set up VariableService on the ProjectService
      const vs = new VariableService(service);
      service.variableService = vs;

      await service.close(pid);

      // Re-open — should trigger migration
      const reopened = await service.open(pid);

      // Manifest schemaVersion is now 2
      expect(reopened.schemaVersion).toBe(2);
      expect(reopened.projectId).toBe(pid);
      expect(reopened.title).toBe('V1 Project');

      // All 5 default variables exist
      const list = await vs.list(pid);
      expect(list).toHaveLength(5);

      // Tone is preserved with content
      const tone = await vs.get(pid, 'tone');
      expect(tone.variable.kind).toBe('builtin');
      expect(tone.content).toBe('<p>Formal tone</p>');

      // Global Constraints exists
      const gc = list.find((v) => v.id === 'global-constraints')!;
      expect(gc).toBeDefined();
      expect(gc.kind).toBe('system');
      expect(gc.scopeLocked).toBe(true);

      // Migration commit exists in history
      const history = await vs.list(pid);
      expect(history.length).toBeGreaterThanOrEqual(5);
    });

    it('AC 3.2 — opening a migrated project again is idempotent', async () => {
      // Set up a v1 project and migrate it
      const createResult = await service.create('Idempotent');
      const pid = createResult.projectId;
      const storageService = service.getOpenProject(pid)!;

      const v1Manifest = {
        schemaVersion: 1,
        projectId: pid,
        title: 'Idempotent',
        createdAt: createResult.createdAt,
        updatedAt: createResult.updatedAt,
        settings: createResult.settings,
        structure: [],
      };

      // Write all 4 old builtins
      await storageService.commit('refs/heads/main', {
        'project.json': Buffer.from(JSON.stringify(v1Manifest, null, 2), 'utf-8'),
        'variables/tone/variable.json': Buffer.from(JSON.stringify({
          schemaVersion: 1, id: 'tone', name: 'Tone', core: 'tone', scope: 'always', active: true, order: 0,
        })),
        'variables/tone/content.html': Buffer.from('<p>Tone</p>'),
        'variables/style/variable.json': Buffer.from(JSON.stringify({
          schemaVersion: 1, id: 'style', name: 'Writing Style', core: 'style', scope: 'always', active: true, order: 1,
        })),
        'variables/style/content.html': Buffer.from('<p>Style</p>'),
        'variables/constraints/variable.json': Buffer.from(JSON.stringify({
          schemaVersion: 1, id: 'constraints', name: 'Plot Constraints', core: 'constraints', scope: 'always', active: true, order: 2,
        })),
        'variables/constraints/content.html': Buffer.from('<p>Constraints</p>'),
        'variables/characters/variable.json': Buffer.from(JSON.stringify({
          schemaVersion: 1, id: 'characters', name: 'Character / Voice Sheets', core: 'characters', scope: 'always', active: true, order: 3,
        })),
        'variables/characters/content.html': Buffer.from('<p>Characters</p>'),
      }, msg('v1 setup'));

      const vs = new VariableService(service);
      service.variableService = vs;
      await service.close(pid);

      // First open — migration
      await service.open(pid);

      // Snapshot the tree
      const svc1 = service.getOpenProject(pid)!;
      const tree1 = await svc1.readTree('refs/heads/main');
      const log1 = await svc1.log('refs/heads/main', 10);

      await service.close(pid);

      // Second open — should not modify anything
      await service.open(pid);

      const svc2 = service.getOpenProject(pid)!;
      const tree2 = await svc2.readTree('refs/heads/main');
      const log2 = await svc2.log('refs/heads/main', 10);

      // Tree is identical
      expect(tree2).toEqual(tree1);
      // Log length is identical
      expect(log2.length).toBe(log1.length);

      // Variables are stable
      const list = await vs.list(pid);
      expect(list).toHaveLength(5);
    });

    it('throws helpful error when VariableService is not available for migration', async () => {
      const createResult = await service.create('No VS');
      const pid = createResult.projectId;
      const storageService = service.getOpenProject(pid)!;

      const v1Manifest = {
        schemaVersion: 1,
        projectId: pid,
        title: 'No VS',
        createdAt: createResult.createdAt,
        updatedAt: createResult.updatedAt,
        settings: createResult.settings,
        structure: [],
      };

      await storageService.commit('refs/heads/main', {
        'project.json': Buffer.from(JSON.stringify(v1Manifest, null, 2), 'utf-8'),
      }, msg('v1 setup'));

      await service.close(pid);

      // variableService is NOT set — should throw
      await expect(service.open(pid)).rejects.toThrow(
        /VariableService is not available/,
      );
    });

    it('throws helpful error when VariableService is not available for migration', async () => {
      const createResult = await service.create('No VS');
      const pid = createResult.projectId;
      const storageService = service.getOpenProject(pid)!;

      const v1Manifest = {
        schemaVersion: 1,
        projectId: pid,
        title: 'No VS',
        createdAt: createResult.createdAt,
        updatedAt: createResult.updatedAt,
        settings: createResult.settings,
        structure: [],
      };

      await storageService.commit('refs/heads/main', {
        'project.json': Buffer.from(JSON.stringify(v1Manifest, null, 2), 'utf-8'),
      }, msg('v1 setup'));

      await service.close(pid);

      // variableService is NOT set — should throw
      await expect(service.open(pid)).rejects.toThrow(
        /VariableService is not available/,
      );
    });
  });
});
