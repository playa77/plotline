/**
 * ChapterService tests (WP-15).
 *
 * Each test creates a throwaway projects directory, exercises ChapterService
 * methods against a ProjectService-backed Git repo, then cleans up.
 * No Electron dependency.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectService } from '../../main/services/ProjectService';
import { ChapterService } from '../../main/services/ChapterService';
import type { StorageService } from '../../main/storage/StorageService';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Fixture helpers ─────────────────────────────────────────────────────────

const OUTLINE_WITH_CHAPTER = {
  schemaVersion: 1,
  frontMatter: [],
  parts: [
    {
      id: 'part_001',
      title: 'Part One',
      chapters: [
        {
          chapterId: 'ch_existing',
          title: 'The Beginning',
          wordTarget: null,
          sections: [
            {
              id: 'sec_001',
              number: '1.1',
              title: 'First Steps',
              wordTarget: null,
              beats: ['Hero wakes up', 'Hero meets mentor'],
            },
            {
              id: 'sec_002',
              number: '1.2',
              title: 'The Call',
              wordTarget: null,
              beats: ['Mentor gives quest', 'Hero refuses at first'],
            },
          ],
        },
        {
          chapterId: 'ch_empty_sections',
          title: 'Empty Chapter',
          wordTarget: null,
          sections: [],
        },
      ],
    },
  ],
  backMatter: [],
};

/** Commit the outline fixture to the test repo. */
async function seedOutline(service: StorageService): Promise<void> {
  await service.commit(
    'refs/heads/main',
    { 'outline/outline.json': Buffer.from(JSON.stringify(OUTLINE_WITH_CHAPTER, null, 2), 'utf-8') },
    { label: 'Seed outline', kind: 'manual' },
  );
}

// ── Suite ───────────────────────────────────────────────────────────────────

describe('ChapterService', () => {
  let tmpDir: string;
  let projectService: ProjectService;
  let chapterService: ChapterService;
  let projectId: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-test-chapters-'));
    projectService = new ProjectService(tmpDir);
    chapterService = new ChapterService(projectService);

    const project = await projectService.create('Test Book');
    projectId = project.projectId;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── getArtifact (outline stage) ─────────────────────────────────────────

  describe('getArtifact (outline)', () => {
    it('returns HTML with section data for an existing chapterId', async () => {
      const svc = projectService.getOpenProject(projectId)!;
      await seedOutline(svc);

      const result = await chapterService.getArtifact(
        projectId,
        'ch_existing',
        undefined,
        'outline',
      );

      expect(result.html).toContain('Section 1.1');
      expect(result.html).toContain('First Steps');
      expect(result.html).toContain('Hero wakes up');
      expect(result.html).toContain('Hero meets mentor');
      expect(result.html).toContain('Section 1.2');
      expect(result.html).toContain('The Call');
      expect(result.html).toContain('Hero refuses at first');
      expect(result.meta).toBeNull();
      expect(result.stale).toBe(false);
    });

    it('returns empty HTML for a nonexistent chapterId', async () => {
      const svc = projectService.getOpenProject(projectId)!;
      await seedOutline(svc);

      const result = await chapterService.getArtifact(
        projectId,
        'ch_nonexistent',
        undefined,
        'outline',
      );

      expect(result.html).toBe('');
      expect(result.meta).toBeNull();
      expect(result.stale).toBe(false);
    });

    it('returns empty HTML when no outline has been committed', async () => {
      const result = await chapterService.getArtifact(
        projectId,
        'ch_existing',
        undefined,
        'outline',
      );

      expect(result.html).toBe('');
      expect(result.meta).toBeNull();
      expect(result.stale).toBe(false);
    });

    it('returns empty HTML for a chapter with no sections', async () => {
      const svc = projectService.getOpenProject(projectId)!;
      await seedOutline(svc);

      const result = await chapterService.getArtifact(
        projectId,
        'ch_empty_sections',
        undefined,
        'outline',
      );

      // No sections means no <h3> or <ul> elements
      expect(result.html).toBe('');
      expect(result.meta).toBeNull();
    });
  });

  // ── getArtifact (expanded stage) ────────────────────────────────────────

  describe('getArtifact (expanded)', () => {
    it('returns empty HTML when no ref exists', async () => {
      const result = await chapterService.getArtifact(
        projectId,
        'ch_001',
        undefined,
        'expanded',
      );

      expect(result.html).toBe('');
      expect(result.meta).toBeNull();
      expect(result.stale).toBe(false);
    });

    it('returns the HTML content when artifact exists', async () => {
      const svc = projectService.getOpenProject(projectId)!;
      await svc.commit(
        'refs/plotline/chapters/ch_001/main',
        {
          'expanded-outline.html': Buffer.from('<p>Expanded prose</p>', 'utf-8'),
          'meta.json': Buffer.from(
            JSON.stringify({
              generatedAt: '2026-01-01T00:00:00.000Z',
              model: { provider: 'test', model: 'test-model' },
              templateId: 'default',
              templateVersion: '1.0.0',
              kind: 'expand',
              instruction: null,
              fingerprints: {
                outlineSlice: 'abc',
                variables: [],
                upstream: null,
                continuity: null,
              },
            }),
            'utf-8',
          ),
        },
        { label: 'Seed expanded', kind: 'manual' },
      );

      const result = await chapterService.getArtifact(
        projectId,
        'ch_001',
        undefined,
        'expanded',
      );

      expect(result.html).toBe('<p>Expanded prose</p>');
      expect(result.meta).not.toBeNull();
      expect(result.meta!.kind).toBe('expand');
      expect(result.meta!.model.provider).toBe('test');
      expect(result.stale).toBe(false);
    });

    it('returns HTML but null meta when meta.json is missing', async () => {
      const svc = projectService.getOpenProject(projectId)!;
      await svc.commit(
        'refs/plotline/chapters/ch_no_meta/main',
        { 'expanded-outline.html': Buffer.from('<p>No meta</p>', 'utf-8') },
        { label: 'Seed without meta', kind: 'manual' },
      );

      const result = await chapterService.getArtifact(
        projectId,
        'ch_no_meta',
        undefined,
        'expanded',
      );

      expect(result.html).toBe('<p>No meta</p>');
      expect(result.meta).toBeNull();
    });

    it('uses versionSlug when provided', async () => {
      const svc = projectService.getOpenProject(projectId)!;
      await svc.commit(
        'refs/plotline/chapters/ch_v2/v2',
        {
          'expanded-outline.html': Buffer.from('<p>Version 2</p>', 'utf-8'),
        },
        { label: 'Seed v2', kind: 'manual' },
      );

      const result = await chapterService.getArtifact(
        projectId,
        'ch_v2',
        'v2',
        'expanded',
      );

      expect(result.html).toBe('<p>Version 2</p>');
    });
  });

  // ── getArtifact (chapter stage) ─────────────────────────────────────────

  describe('getArtifact (chapter)', () => {
    it('returns empty HTML when no ref exists', async () => {
      const result = await chapterService.getArtifact(
        projectId,
        'ch_002',
        undefined,
        'chapter',
      );

      expect(result.html).toBe('');
      expect(result.meta).toBeNull();
    });

    it('returns the HTML content when artifact exists', async () => {
      const svc = projectService.getOpenProject(projectId)!;
      await svc.commit(
        'refs/plotline/chapters/ch_002/main',
        { 'chapter.html': Buffer.from('<p>Chapter prose</p>', 'utf-8') },
        { label: 'Seed chapter', kind: 'manual' },
      );

      const result = await chapterService.getArtifact(
        projectId,
        'ch_002',
        undefined,
        'chapter',
      );

      expect(result.html).toBe('<p>Chapter prose</p>');
      expect(result.meta).toBeNull();
    });
  });

  // ── saveArtifact ────────────────────────────────────────────────────────

  describe('saveArtifact', () => {
    it('creates ref if it does not exist and returns sha for expanded', async () => {
      const result = await chapterService.saveArtifact(
        projectId,
        'ch_save_01',
        'expanded',
        '<p>New expanded content</p>',
      );

      expect(result.sha).toBeTruthy();
      expect(typeof result.sha).toBe('string');

      // Verify by reading it back
      const readResult = await chapterService.getArtifact(
        projectId,
        'ch_save_01',
        undefined,
        'expanded',
      );
      expect(readResult.html).toBe('<p>New expanded content</p>');
    });

    it('creates ref if it does not exist and returns sha for chapter', async () => {
      const result = await chapterService.saveArtifact(
        projectId,
        'ch_save_02',
        'chapter',
        '<p>New chapter content</p>',
      );

      expect(result.sha).toBeTruthy();

      // Verify by reading it back
      const readResult = await chapterService.getArtifact(
        projectId,
        'ch_save_02',
        undefined,
        'chapter',
      );
      expect(readResult.html).toBe('<p>New chapter content</p>');
    });

    it('overwrites existing artifact and returns new sha', async () => {
      const svc = projectService.getOpenProject(projectId)!;
      // Seed initial content
      await svc.commit(
        'refs/plotline/chapters/ch_overwrite/main',
        { 'expanded-outline.html': Buffer.from('<p>Original</p>', 'utf-8') },
        { label: 'Seed original', kind: 'manual' },
      );

      // Save over it
      const result = await chapterService.saveArtifact(
        projectId,
        'ch_overwrite',
        'expanded',
        '<p>Overwritten</p>',
      );

      expect(result.sha).toBeTruthy();

      // Verify overwritten
      const readResult = await chapterService.getArtifact(
        projectId,
        'ch_overwrite',
        undefined,
        'expanded',
      );
      expect(readResult.html).toBe('<p>Overwritten</p>');
    });

    it('uses versionSlug when provided', async () => {
      await chapterService.saveArtifact(
        projectId,
        'ch_slug_save',
        'expanded',
        '<p>Slugged content</p>',
        'draft',
      );

      const result = await chapterService.getArtifact(
        projectId,
        'ch_slug_save',
        'draft',
        'expanded',
      );
      expect(result.html).toBe('<p>Slugged content</p>');
    });

    it('throws when stage is outline', async () => {
      await expect(
        chapterService.saveArtifact(
          projectId,
          'ch_err',
          'outline',
          '<p>test</p>',
        ),
      ).rejects.toThrow(/outline:mutate/i);
    });
  });

  // ── getStatus ───────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns empty dots when no ref exists', async () => {
      // No outline committed, no chapter refs
      const status = await chapterService.getStatus(projectId, 'ch_status_01');

      expect(status.stageDots.outline).toBe('empty');
      expect(status.stageDots.expanded).toBe('empty');
      expect(status.stageDots.chapter).toBe('empty');
    });

    it('returns outline=filled when chapter exists in outline', async () => {
      const svc = projectService.getOpenProject(projectId)!;
      await seedOutline(svc);

      const status = await chapterService.getStatus(projectId, 'ch_existing');

      expect(status.stageDots.outline).toBe('filled');
      expect(status.stageDots.expanded).toBe('empty');
      expect(status.stageDots.chapter).toBe('empty');
    });

    it('returns expanded=filled when expanded-outline.html exists', async () => {
      const svc = projectService.getOpenProject(projectId)!;
      await seedOutline(svc);
      await svc.commit(
        'refs/plotline/chapters/ch_status_exp/main',
        { 'expanded-outline.html': Buffer.from('<p>Expanded</p>', 'utf-8') },
        { label: 'Seed expanded', kind: 'manual' },
      );

      const status = await chapterService.getStatus(projectId, 'ch_status_exp');

      expect(status.stageDots.outline).toBe('empty'); // not in outline
      expect(status.stageDots.expanded).toBe('filled');
      expect(status.stageDots.chapter).toBe('empty');
    });

    it('returns chapter=filled when chapter.html exists', async () => {
      const svc = projectService.getOpenProject(projectId)!;
      await seedOutline(svc);
      await svc.commit(
        'refs/plotline/chapters/ch_status_ch/main',
        { 'chapter.html': Buffer.from('<p>Chapter</p>', 'utf-8') },
        { label: 'Seed chapter', kind: 'manual' },
      );

      const status = await chapterService.getStatus(projectId, 'ch_status_ch');

      expect(status.stageDots.outline).toBe('empty');
      expect(status.stageDots.expanded).toBe('empty');
      expect(status.stageDots.chapter).toBe('filled');
    });

    it('returns all dots filled when all artifacts exist and chapter is in outline', async () => {
      const svc = projectService.getOpenProject(projectId)!;
      await seedOutline(svc);
      await svc.commit(
        'refs/plotline/chapters/ch_existing/main',
        {
          'expanded-outline.html': Buffer.from('<p>Expanded</p>', 'utf-8'),
          'chapter.html': Buffer.from('<p>Chapter</p>', 'utf-8'),
        },
        { label: 'Seed both', kind: 'manual' },
      );

      const status = await chapterService.getStatus(projectId, 'ch_existing');

      expect(status.stageDots.outline).toBe('filled');
      expect(status.stageDots.expanded).toBe('filled');
      expect(status.stageDots.chapter).toBe('filled');
    });

    it('returns version info with main as default', async () => {
      const status = await chapterService.getStatus(projectId, 'ch_ver_info');

      expect(status.selectedVersion).toBe('main');
      expect(status.versionNames).toHaveLength(1);
      expect(status.versionNames[0]).toEqual({
        slug: 'main',
        name: 'Main',
        selected: true,
      });
    });
  });

  // ── Error: project not open ─────────────────────────────────────────────

  it('throws when project is not open', async () => {
    await expect(
      chapterService.getArtifact('nonexistent', 'ch_001'),
    ).rejects.toThrow(/Project not open/i);

    await expect(
      chapterService.saveArtifact('nonexistent', 'ch_001', 'expanded', '<p>test</p>'),
    ).rejects.toThrow(/Project not open/i);

    await expect(
      chapterService.getStatus('nonexistent', 'ch_001'),
    ).rejects.toThrow(/Project not open/i);
  });
});
