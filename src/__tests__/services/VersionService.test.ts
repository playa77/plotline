/**
 * VersionService tests (WP-21).
 *
 * Each test creates a throwaway Git repo via `createTestRepo`, exercises
 * VersionService methods against a mock ProjectService that returns the
 * test StorageService, then cleans up the temp directory.
 * No Electron dependency.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestRepo, createCommit } from '../../main/storage/testHelpers';
import { VersionService } from '../../main/services/VersionService';
import type { StorageService, CommitMessage } from '../../main/storage/StorageService';

// ── Shared helpers ──────────────────────────────────────────────────────────

const testMsg = (label: string, kind: CommitMessage['kind'] = 'manual'): CommitMessage => ({
  label,
  kind,
});

/** Build a minimal ProjectService mock that returns the given StorageService. */
function mockProjectService(service: StorageService, projectId = 'test-project') {
  return {
    getOpenProject: (id: string) => (id === projectId ? service : undefined),
  };
}

/** Default chapter ID used across tests. */
const CHAPTER_ID = 'ch_001';

/**
 * Seed a minimal project manifest on `refs/heads/main` with a single chapter
 * and a version entry for the given slug (default 'main').
 */
async function seedManifest(
  service: StorageService,
  chapterId = CHAPTER_ID,
  versionSlug = 'main',
  versionName = 'Main',
): Promise<void> {
  const manifest = {
    schemaVersion: 2,
    projectId: 'test-project',
    title: 'Test Book',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    settings: {
      continuityContext: { enabled: true, words: 500 },
      models: {
        expand: { provider: 'openrouter', model: 'test-model' },
        write: { provider: 'openrouter', model: 'test-model' },
        iterate: { provider: 'openrouter', model: 'test-model' },
        parse: { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
      },
      inference: { baseUrl: 'https://openrouter.ai/api/v1' },
    },
    structure: [
      {
        kind: 'chapter',
        id: chapterId,
        title: 'Test Chapter',
        selectedVersion: versionSlug,
        versions: [
          {
            slug: versionSlug,
            name: versionName,
            createdAt: '2026-01-01T00:00:00.000Z',
            createdFrom: null,
            archived: false,
          },
        ],
        wordTarget: null,
      } as const,
    ],
  };

  await service.commit(
    'refs/heads/main',
    { 'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') },
    testMsg('Seed manifest'),
  );
}

/**
 * Create the chapter version ref with some artifacts.
 */
async function seedChapterRef(
  service: StorageService,
  chapterId = CHAPTER_ID,
  versionSlug = 'main',
  artifacts?: { expanded?: string; chapter?: string },
): Promise<void> {
  const ref = `refs/plotline/chapters/${chapterId}/${versionSlug}`;
  const files: Record<string, Buffer> = {};

  if (artifacts?.expanded) {
    files['expanded-outline.html'] = Buffer.from(artifacts.expanded, 'utf-8');
  }
  if (artifacts?.chapter) {
    files['chapter.html'] = Buffer.from(artifacts.chapter, 'utf-8');
  }

  // Must have at least one file or an empty commit
  if (Object.keys(files).length === 0) {
    files['placeholder.txt'] = Buffer.from('initial', 'utf-8');
  }

  await service.commit(ref, files, testMsg(`Seed ${versionSlug} ref`));
}

// ── Suite-level setup ───────────────────────────────────────────────────────

let cleanups: Array<() => void> = [];

beforeAll(() => {
  cleanups = [];
});

afterAll(() => {
  for (const c of cleanups) c();
  cleanups = [];
});

async function setupRepo(sessionId?: string) {
  const result = await createTestRepo(sessionId);
  cleanups.push(result.cleanup);
  return result;
}

// ── Suite ───────────────────────────────────────────────────────────────────

describe('VersionService', () => {
  // ── listVersions ─────────────────────────────────────────────────────────

  describe('listVersions', () => {
    it('returns the main version by default with correct flags', async () => {
      const { service } = await setupRepo();
      await seedManifest(service);
      await seedChapterRef(service, CHAPTER_ID, 'main', {
        expanded: '<p>Expanded content</p>',
        chapter: '<p>Chapter content</p>',
      });

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      const result = await versionService.listVersions('test-project', CHAPTER_ID);

      expect(result.versions).toHaveLength(1);
      expect(result.versions[0]!.slug).toBe('main');
      expect(result.versions[0]!.name).toBe('Main');
      expect(result.versions[0]!.selected).toBe(true);
      expect(result.versions[0]!.hasExpanded).toBe(true);
      expect(result.versions[0]!.hasChapter).toBe(true);
      expect(result.versions[0]!.commitCount).toBe(1);
      expect(result.versions[0]!.createdAt).toBeTruthy();
    });

    it('marks hasExpanded/hasChapter correctly based on tree content', async () => {
      const { service } = await setupRepo();
      await seedManifest(service);
      await seedChapterRef(service, CHAPTER_ID, 'main', {
        expanded: '<p>Only expanded</p>',
      });

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      const result = await versionService.listVersions('test-project', CHAPTER_ID);

      expect(result.versions).toHaveLength(1);
      expect(result.versions[0]!.hasExpanded).toBe(true);
      expect(result.versions[0]!.hasChapter).toBe(false);
    });

    it('returns multiple versions with correct selected flag', async () => {
      const { service } = await setupRepo();
      await seedManifest(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'draft');

      // Add 'draft' to the manifest by creating another version entry manually
      // (we use the service for this, but since we're testing listVersions, set up the manifest)
      const manifestRaw = await service.readBlob('refs/heads/main', 'project.json');
      const manifest = JSON.parse(manifestRaw.toString('utf-8'));
      manifest.structure[0].versions.push({
        slug: 'draft',
        name: 'Draft',
        createdAt: '2026-02-01T00:00:00.000Z',
        createdFrom: { ref: `refs/plotline/chapters/${CHAPTER_ID}/main`, commit: '0000000000000000000000000000000000000000' },
        archived: false,
      });
      await service.commit(
        'refs/heads/main',
        { 'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') },
        testMsg('Add draft to manifest'),
      );

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      const result = await versionService.listVersions('test-project', CHAPTER_ID);

      expect(result.versions).toHaveLength(2);

      const main = result.versions.find((v) => v.slug === 'main')!;
      const draft = result.versions.find((v) => v.slug === 'draft')!;

      expect(main).toBeDefined();
      expect(draft).toBeDefined();
      expect(main.selected).toBe(true); // still the selected version
      expect(draft.selected).toBe(false);

      // Draft name should come from manifest
      expect(draft.name).toBe('Draft');
      expect(draft.createdAt).toBe('2026-02-01T00:00:00.000Z');
    });

    it('returns empty array when no refs exist', async () => {
      const { service } = await setupRepo();
      await seedManifest(service);

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      const result = await versionService.listVersions('test-project', CHAPTER_ID);

      expect(result.versions).toEqual([]);
    });

    it('uses slug as fallback name when manifest entry is missing', async () => {
      const { service } = await setupRepo();
      await seedManifest(service);
      // Create the 'main' ref (matches manifest) and an orphan ref (no manifest entry)
      await seedChapterRef(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'orphan-version');

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      const result = await versionService.listVersions('test-project', CHAPTER_ID);

      // Both 'main' (from manifest) and 'orphan-version' (from ref) should appear
      expect(result.versions).toHaveLength(2);
      const orphan = result.versions.find((v) => v.slug === 'orphan-version')!;
      expect(orphan).toBeDefined();
      expect(orphan.name).toBe('orphan-version'); // fallback to slug
    });
  });

  // ── createVersion ─────────────────────────────────────────────────────────

  describe('createVersion', () => {
    it('creates from main and returns slug + name', async () => {
      const { service } = await setupRepo();
      await seedManifest(service);
      await seedChapterRef(service, CHAPTER_ID, 'main', {
        chapter: '<p>Original</p>',
      });

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      const result = await versionService.createVersion(
        'test-project',
        CHAPTER_ID,
        'My Draft',
        'main',
      );

      expect(result.slug).toBe('my-draft');
      expect(result.name).toBe('My Draft');

      // Verify the ref was created
      const ref = `refs/plotline/chapters/${CHAPTER_ID}/my-draft`;
      const tree = await service.readTree(ref);
      expect(tree['chapter.html']).toBeTruthy();
      const content = await service.readBlob(ref, 'chapter.html');
      expect(content.toString('utf-8')).toBe('<p>Original</p>');

      // Verify the manifest was updated
      const manifestRaw = await service.readBlob('refs/heads/main', 'project.json');
      const manifest = JSON.parse(manifestRaw.toString('utf-8'));
      const chapterVersions = manifest.structure[0].versions;
      expect(chapterVersions).toHaveLength(2);
      expect(chapterVersions[1].slug).toBe('my-draft');
      expect(chapterVersions[1].name).toBe('My Draft');
    });

    it('auto-resolves slug collision by appending suffix', async () => {
      const { service } = await setupRepo();
      await seedManifest(service);
      await seedChapterRef(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'draft');

      // Add 'draft' to manifest
      const manifestRaw = await service.readBlob('refs/heads/main', 'project.json');
      const manifest = JSON.parse(manifestRaw.toString('utf-8'));
      manifest.structure[0].versions.push({
        slug: 'draft',
        name: 'Draft',
        createdAt: '2026-02-01T00:00:00.000Z',
        createdFrom: null,
        archived: false,
      });
      await service.commit(
        'refs/heads/main',
        { 'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') },
        testMsg('Add draft to manifest'),
      );

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      const result = await versionService.createVersion(
        'test-project',
        CHAPTER_ID,
        'Draft',
        'main',
      );

      // Slug should have been uniquified
      expect(result.slug).toBe('draft-1');
      expect(result.name).toBe('Draft');

      // Verify the ref was created with the uniquified slug
      const ref = `refs/plotline/chapters/${CHAPTER_ID}/draft-1`;
      await expect(service.readTree(ref)).resolves.toBeDefined();
    });

    it('creates version without source when fromVersion ref does not exist', async () => {
      const { service } = await setupRepo();
      await seedManifest(service);
      // Only seed manifest, no chapter refs at all

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      const result = await versionService.createVersion(
        'test-project',
        CHAPTER_ID,
        'First',
      );

      expect(result.slug).toBe('first');
      expect(result.name).toBe('First');

      // Ref should exist as a new empty ref
      const ref = `refs/plotline/chapters/${CHAPTER_ID}/first`;
      const tree = await service.readTree(ref);
      expect(tree).toEqual({});
    });
  });

  // ── selectVersion ─────────────────────────────────────────────────────────

  describe('selectVersion', () => {
    it('updates selectedVersion in manifest', async () => {
      const { service } = await setupRepo();
      await seedManifest(service);
      await seedChapterRef(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'v2');

      // Add v2 to manifest
      const manifestRaw = await service.readBlob('refs/heads/main', 'project.json');
      const manifest = JSON.parse(manifestRaw.toString('utf-8'));
      manifest.structure[0].versions.push({
        slug: 'v2',
        name: 'Version 2',
        createdAt: '2026-02-01T00:00:00.000Z',
        createdFrom: null,
        archived: false,
      });
      await service.commit(
        'refs/heads/main',
        { 'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') },
        testMsg('Add v2 to manifest'),
      );

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      await versionService.selectVersion('test-project', CHAPTER_ID, 'v2');

      // Verify manifest
      const updatedRaw = await service.readBlob('refs/heads/main', 'project.json');
      const updated = JSON.parse(updatedRaw.toString('utf-8'));
      expect(updated.structure[0].selectedVersion).toBe('v2');

      // Verify via listVersions
      const list = await versionService.listVersions('test-project', CHAPTER_ID);
      const mainEntry = list.versions.find((v) => v.slug === 'main')!;
      const v2Entry = list.versions.find((v) => v.slug === 'v2')!;
      expect(mainEntry.selected).toBe(false);
      expect(v2Entry.selected).toBe(true);
    });

    it('throws when version ref does not exist', async () => {
      const { service } = await setupRepo();
      await seedManifest(service);

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      await expect(
        versionService.selectVersion('test-project', CHAPTER_ID, 'nonexistent'),
      ).rejects.toThrow(/Version ref not found/i);
    });

    it('throws when project is not open', async () => {
      const versionService = new VersionService({
        getOpenProject: () => undefined,
      } as never);

      await expect(
        versionService.selectVersion('nonexistent', CHAPTER_ID, 'main'),
      ).rejects.toThrow(/Project not open/i);
    });
  });

  // ── renameVersion ─────────────────────────────────────────────────────────

  describe('renameVersion', () => {
    it('renames the ref and updates manifest', async () => {
      const { service } = await setupRepo();
      await seedManifest(service);
      await seedChapterRef(service, CHAPTER_ID, 'main');

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      const result = await versionService.renameVersion(
        'test-project',
        CHAPTER_ID,
        'main',
        'First Version',
      );

      expect(result.slug).toBe('first-version');
      expect(result.name).toBe('First Version');

      // Old ref should be gone
      const oldRef = `refs/plotline/chapters/${CHAPTER_ID}/main`;
      await expect(service.readTree(oldRef)).rejects.toThrow();

      // New ref should exist
      const newRef = `refs/plotline/chapters/${CHAPTER_ID}/first-version`;
      await expect(service.readTree(newRef)).resolves.toBeDefined();

      // Manifest should be updated
      const manifestRaw = await service.readBlob('refs/heads/main', 'project.json');
      const manifest = JSON.parse(manifestRaw.toString('utf-8'));
      const chapterVersions = manifest.structure[0].versions;
      expect(chapterVersions[0].slug).toBe('first-version');
      expect(chapterVersions[0].name).toBe('First Version');
    });

    it('updates selectedVersion tracking when renaming selected version', async () => {
      const { service } = await setupRepo();
      await seedManifest(service);
      await seedChapterRef(service, CHAPTER_ID, 'main');

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      await versionService.renameVersion(
        'test-project',
        CHAPTER_ID,
        'main', // this IS the selected version
        'Renamed',
      );

      const manifestRaw = await service.readBlob('refs/heads/main', 'project.json');
      const manifest = JSON.parse(manifestRaw.toString('utf-8'));
      expect(manifest.structure[0].selectedVersion).toBe('renamed');
    });

    it('does not rename to a colliding slug', async () => {
      const { service } = await setupRepo();
      await seedManifest(service);
      await seedChapterRef(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'draft');

      const manifestRaw = await service.readBlob('refs/heads/main', 'project.json');
      const manifest = JSON.parse(manifestRaw.toString('utf-8'));
      manifest.structure[0].versions.push({
        slug: 'draft',
        name: 'Draft',
        createdAt: '2026-02-01T00:00:00.000Z',
        createdFrom: null,
        archived: false,
      });
      await service.commit(
        'refs/heads/main',
        { 'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') },
        testMsg('Add draft to manifest'),
      );

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      // Rename main to "Draft" — the slug 'draft' already exists, so it should
      // become 'draft-1' via versionSlug collision handling. The final slug
      // should not be 'draft'.
      const result = await versionService.renameVersion(
        'test-project',
        CHAPTER_ID,
        'main',
        'Draft',
      );

      expect(result.slug).toBe('draft-1');
    });

    it('throws when the old ref does not exist', async () => {
      const { service } = await setupRepo();
      await seedManifest(service);

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      await expect(
        versionService.renameVersion('test-project', CHAPTER_ID, 'nonexistent', 'New Name'),
      ).rejects.toThrow(/Version ref not found/i);
    });
  });

  // ── archiveVersion ─────────────────────────────────────────────────────────

  describe('archiveVersion', () => {
    it('moves ref to archived namespace and updates manifest', async () => {
      const { service } = await setupRepo();
      await seedManifest(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'draft');

      // Add draft to manifest
      const manifestRaw = await service.readBlob('refs/heads/main', 'project.json');
      const manifest = JSON.parse(manifestRaw.toString('utf-8'));
      manifest.structure[0].versions.push({
        slug: 'draft',
        name: 'Draft',
        createdAt: '2026-02-01T00:00:00.000Z',
        createdFrom: null,
        archived: false,
      });
      await service.commit(
        'refs/heads/main',
        { 'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') },
        testMsg('Add draft to manifest'),
      );

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      const result = await versionService.archiveVersion(
        'test-project',
        CHAPTER_ID,
        'draft',
      );

      expect(result.ok).toBe(true);

      // Active ref should be gone
      const activeRef = `refs/plotline/chapters/${CHAPTER_ID}/draft`;
      await expect(service.readTree(activeRef)).rejects.toThrow();

      // Archived ref should exist
      const archivedRef = `refs/plotline/archived/${CHAPTER_ID}/draft`;
      await expect(service.readTree(archivedRef)).resolves.toBeDefined();

      // Manifest should mark it archived
      const updatedRaw = await service.readBlob('refs/heads/main', 'project.json');
      const updated = JSON.parse(updatedRaw.toString('utf-8'));
      const draftEntry = updated.structure[0].versions.find(
        (v: { slug: string }) => v.slug === 'draft',
      );
      expect(draftEntry.archived).toBe(true);

      // listVersions should not include archived versions
      const list = await versionService.listVersions('test-project', CHAPTER_ID);
      expect(list.versions.find((v) => v.slug === 'draft')).toBeUndefined();
    });

    it('cannot archive the selected version', async () => {
      const { service } = await setupRepo();
      await seedManifest(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'draft');

      const manifestRaw = await service.readBlob('refs/heads/main', 'project.json');
      const manifest = JSON.parse(manifestRaw.toString('utf-8'));
      // Make 'draft' the selected version
      manifest.structure[0].selectedVersion = 'draft';
      manifest.structure[0].versions.push({
        slug: 'draft',
        name: 'Draft',
        createdAt: '2026-02-01T00:00:00.000Z',
        createdFrom: null,
        archived: false,
      });
      await service.commit(
        'refs/heads/main',
        { 'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') },
        testMsg('Add draft to manifest and select it'),
      );

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      // Try to archive 'draft' which is now the selected version
      await expect(
        versionService.archiveVersion('test-project', CHAPTER_ID, 'draft'),
      ).rejects.toThrow(/Cannot archive the currently selected version/i);
    });

    it('cannot archive the main version', async () => {
      const { service } = await setupRepo();
      await seedManifest(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'v2');

      const manifestRaw = await service.readBlob('refs/heads/main', 'project.json');
      const manifest = JSON.parse(manifestRaw.toString('utf-8'));
      // Select v2 so main is not the selected version
      manifest.structure[0].selectedVersion = 'v2';
      manifest.structure[0].versions.push({
        slug: 'v2',
        name: 'Version 2',
        createdAt: '2026-02-01T00:00:00.000Z',
        createdFrom: null,
        archived: false,
      });
      await service.commit(
        'refs/heads/main',
        { 'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') },
        testMsg('Add v2 to manifest'),
      );

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      await expect(
        versionService.archiveVersion('test-project', CHAPTER_ID, 'main'),
      ).rejects.toThrow(/Cannot archive the main version/i);
    });

    it('cannot archive the last remaining version', async () => {
      const { service } = await setupRepo();
      await seedManifest(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'v2');

      const manifestRaw = await service.readBlob('refs/heads/main', 'project.json');
      const manifest = JSON.parse(manifestRaw.toString('utf-8'));
      // Archive main, make v2 the only active but not selected version
      manifest.structure[0].versions[0].archived = true;
      manifest.structure[0].versions.push({
        slug: 'v2',
        name: 'Version 2',
        createdAt: '2026-02-01T00:00:00.000Z',
        createdFrom: null,
        archived: false,
      });
      // selectedVersion still points to 'main' (archived — inconsistent but
      // schema allows it, and we need v2 to NOT be selected for this test)
      await service.commit(
        'refs/heads/main',
        { 'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') },
        testMsg('Setup manifest with main archived'),
      );

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      // v2 is not 'main', not selected, and the only active version
      await expect(
        versionService.archiveVersion('test-project', CHAPTER_ID, 'v2'),
      ).rejects.toThrow(/Cannot archive the last remaining version/i);
    });
  });

  // ── Integration: full lifecycle ────────────────────────────────────────────

  describe('integration', () => {
    it('create → select → archive old → verify state', async () => {
      const { service } = await setupRepo();
      await seedManifest(service, CHAPTER_ID, 'main');
      await seedChapterRef(service, CHAPTER_ID, 'main', {
        chapter: '<p>Original prose</p>',
      });

      const versionService = new VersionService(
        mockProjectService(service) as never,
      );

      // 1. Create two new versions
      const rewrite = await versionService.createVersion(
        'test-project',
        CHAPTER_ID,
        'Rewrite',
        'main',
      );
      expect(rewrite.slug).toBe('rewrite');
      expect(rewrite.name).toBe('Rewrite');

      const draft = await versionService.createVersion(
        'test-project',
        CHAPTER_ID,
        'Draft',
        'main',
      );
      expect(draft.slug).toBe('draft');
      expect(draft.name).toBe('Draft');

      // 2. Select the rewrite version
      await versionService.selectVersion('test-project', CHAPTER_ID, 'rewrite');

      // 3. Archive the draft version (not main — main cannot be archived)
      const archiveResult = await versionService.archiveVersion(
        'test-project',
        CHAPTER_ID,
        'draft',
      );
      expect(archiveResult.ok).toBe(true);

      // 4. Verify state via listVersions — only main and rewrite should show
      const list = await versionService.listVersions('test-project', CHAPTER_ID);
      const slugs = list.versions.map((v) => v.slug);
      expect(slugs).toContain('main');
      expect(slugs).toContain('rewrite');
      expect(slugs).not.toContain('draft');

      // rewrite should be selected
      const rewriteEntry = list.versions.find((v) => v.slug === 'rewrite')!;
      expect(rewriteEntry.selected).toBe(true);

      // 5. Verify the archived ref exists
      const archivedRef = `refs/plotline/archived/${CHAPTER_ID}/draft`;
      await expect(service.readTree(archivedRef)).resolves.toBeDefined();

      // 6. Verify manifest
      const manifestRaw = await service.readBlob('refs/heads/main', 'project.json');
      const manifest = JSON.parse(manifestRaw.toString('utf-8'));
      const chapter = manifest.structure[0];
      expect(chapter.selectedVersion).toBe('rewrite');
      const draftEntry = chapter.versions.find(
        (v: { slug: string }) => v.slug === 'draft',
      );
      expect(draftEntry.archived).toBe(true);
      const mainEntry = chapter.versions.find(
        (v: { slug: string }) => v.slug === 'main',
      );
      expect(mainEntry.archived).toBe(false);
    });
  });

  // ── Error: project not open ───────────────────────────────────────────────

  it('throws when project is not open', async () => {
    const versionService = new VersionService({
      getOpenProject: () => undefined,
    } as never);

    await expect(
      versionService.listVersions('nonexistent', CHAPTER_ID),
    ).rejects.toThrow(/Project not open/i);

    await expect(
      versionService.createVersion('nonexistent', CHAPTER_ID, 'test'),
    ).rejects.toThrow(/Project not open/i);

    await expect(
      versionService.selectVersion('nonexistent', CHAPTER_ID, 'main'),
    ).rejects.toThrow(/Project not open/i);

    await expect(
      versionService.renameVersion('nonexistent', CHAPTER_ID, 'main', 'new'),
    ).rejects.toThrow(/Project not open/i);

    await expect(
      versionService.archiveVersion('nonexistent', CHAPTER_ID, 'main'),
    ).rejects.toThrow(/Project not open/i);
  });
});
