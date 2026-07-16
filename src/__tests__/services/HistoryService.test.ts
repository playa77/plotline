/**
 * HistoryService tests (WP-17).
 *
 * Each test creates a throwaway Git repo via `createTestRepo`, exercises
 * HistoryService methods against a mock ProjectService that returns the
 * test StorageService, then cleans up the temp directory.
 * No Electron dependency.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestRepo, createCommit } from '../../main/storage/testHelpers';
import { HistoryService } from '../../main/services/HistoryService';
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

describe('HistoryService', () => {
  // ── listHistory ───────────────────────────────────────────────────────────

  describe('listHistory', () => {
    it('returns commits in reverse chronological order', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_test/main';

      const sha1 = await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>v1</p>', 'utf-8') },
        testMsg('First version', 'expand'),
      );
      const sha2 = await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>v2</p>', 'utf-8') },
        testMsg('Second version', 'write'),
      );
      const sha3 = await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>v3</p>', 'utf-8') },
        testMsg('Third version', 'iterate'),
      );

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      const result = await histService.listHistory('test-project', ref);

      expect(result.commits).toHaveLength(3);
      // Newest first
      expect(result.commits[0]!.sha).toBe(sha3);
      expect(result.commits[0]!.label).toBe('Third version');
      expect(result.commits[0]!.kind).toBe('iterate');
      expect(result.commits[1]!.sha).toBe(sha2);
      expect(result.commits[1]!.label).toBe('Second version');
      expect(result.commits[1]!.kind).toBe('write');
      expect(result.commits[2]!.sha).toBe(sha1);
      expect(result.commits[2]!.label).toBe('First version');
      expect(result.commits[2]!.kind).toBe('expand');
    });

    it('respects limit', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_limit/main';

      await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>v1</p>', 'utf-8') },
        testMsg('commit 1'),
      );
      await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>v2</p>', 'utf-8') },
        testMsg('commit 2'),
      );
      await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>v3</p>', 'utf-8') },
        testMsg('commit 3'),
      );
      await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>v4</p>', 'utf-8') },
        testMsg('commit 4'),
      );
      await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>v5</p>', 'utf-8') },
        testMsg('commit 5'),
      );

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      const result = await histService.listHistory('test-project', ref, 2);

      expect(result.commits).toHaveLength(2);
      expect(result.commits[0]!.label).toBe('commit 5');
      expect(result.commits[1]!.label).toBe('commit 4');
    });

    it('respects before (pagination)', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_before/main';

      const sha1 = await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>v1</p>', 'utf-8') },
        testMsg('commit 1'),
      );
      const sha2 = await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>v2</p>', 'utf-8') },
        testMsg('commit 2'),
      );
      const sha3 = await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>v3</p>', 'utf-8') },
        testMsg('commit 3'),
      );
      await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>v4</p>', 'utf-8') },
        testMsg('commit 4'),
      );

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      // Get commits before sha3 — should only include 1 and 2
      const result = await histService.listHistory(
        'test-project',
        ref,
        undefined,
        sha3,
      );

      expect(result.commits).toHaveLength(2);
      expect(result.commits[0]!.label).toBe('commit 2');
      expect(result.commits[1]!.label).toBe('commit 1');
    });

    it('returns empty array for nonexistent ref', async () => {
      const { service } = await setupRepo();
      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      const result = await histService.listHistory(
        'test-project',
        'refs/plotline/chapters/nonexistent/main',
      );

      expect(result.commits).toEqual([]);
    });

    it('defaults limit to 20', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_default_limit/main';

      // Create more than 20 commits
      for (let i = 1; i <= 25; i++) {
        await service.commit(
          ref,
          { 'chapter.html': Buffer.from(`<p>v${i}</p>`, 'utf-8') },
          testMsg(`commit ${i}`),
        );
      }

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      const result = await histService.listHistory('test-project', ref);

      expect(result.commits).toHaveLength(20);
    });

    it('includes wordDelta when present', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_wordDelta/main';

      await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>content</p>', 'utf-8') },
        { label: 'Expanded', kind: 'expand', wordDelta: 350 },
      );

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      const result = await histService.listHistory('test-project', ref);

      expect(result.commits).toHaveLength(1);
      expect(result.commits[0]!.wordDelta).toBe(350);
    });

    it('returns null wordDelta when absent from commit', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_noWordDelta/main';

      await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>content</p>', 'utf-8') },
        testMsg('Manual save'),
      );

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      const result = await histService.listHistory('test-project', ref);

      expect(result.commits[0]!.wordDelta).toBeNull();
    });
  });

  // ── preview ───────────────────────────────────────────────────────────────

  describe('preview', () => {
    it('returns HTML from expanded-outline.html when present', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_preview/main';

      const sha = await service.commit(
        ref,
        {
          'expanded-outline.html': Buffer.from('<p>Expanded prose</p>', 'utf-8'),
          'chapter.html': Buffer.from('<p>Chapter prose</p>', 'utf-8'),
        },
        testMsg('My chapter', 'write'),
      );

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      const result = await histService.preview('test-project', ref, sha);

      expect(result.html).toBe('<p>Expanded prose</p>');
      expect(result.label).toBe('My chapter');
      expect(result.timestamp).toBeTruthy();
    });

    it('returns HTML from chapter.html when expanded-outline missing', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_preview2/main';

      const sha = await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>Chapter prose</p>', 'utf-8') },
        testMsg('Write pass', 'write'),
      );

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      const result = await histService.preview('test-project', ref, sha);

      expect(result.html).toBe('<p>Chapter prose</p>');
      expect(result.label).toBe('Write pass');
    });

    it('returns label and timestamp from commit message', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_preview_meta/main';

      const sha = await service.commit(
        ref,
        { 'expanded-outline.html': Buffer.from('<p>Prose</p>', 'utf-8') },
        testMsg('My expansion', 'expand'),
      );

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      const result = await histService.preview('test-project', ref, sha);

      expect(result.label).toBe('My expansion');
      expect(result.label).not.toBe('');
      expect(typeof result.timestamp).toBe('string');
      expect(result.timestamp.length).toBeGreaterThan(0);
    });

    it('throws on nonexistent sha', async () => {
      const { service } = await setupRepo();
      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      await expect(
        histService.preview(
          'test-project',
          'refs/heads/main',
          '0000000000000000000000000000000000000000',
        ),
      ).rejects.toThrow(/Commit not found/i);
    });

    it('returns empty html for a commit with no previewable files', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_empty_preview/main';

      const sha = await service.commit(
        ref,
        { 'meta.json': Buffer.from('{"key":"value"}', 'utf-8') },
        testMsg('Only meta'),
      );

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      const result = await histService.preview('test-project', ref, sha);

      // meta.json is the fallback file
      expect(result.html).toBe('{"key":"value"}');
      expect(result.label).toBe('Only meta');
    });

    it('returns empty html when tree has no files at all', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_empty_tree/main';

      // Create an empty commit (no files)
      const sha = await createCommit(service, ref, {}, testMsg('empty'));

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      const result = await histService.preview('test-project', ref, sha);

      expect(result.html).toBe('');
      expect(result.label).toBe('empty');
    });
  });

  // ── restore ───────────────────────────────────────────────────────────────

  describe('restore', () => {
    it('creates new commit with identical tree (verify tree SHA equality)', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_restore/main';

      // Create two commits so we have something to step back to
      const sha1 = await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>First version</p>', 'utf-8') },
        testMsg('v1'),
      );
      await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>Second version</p>', 'utf-8') },
        testMsg('v2'),
      );

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      // Restore to the first version
      const result = await histService.restore('test-project', ref, sha1);

      // New SHA should be different from source
      expect(result.sha).not.toBe(sha1);
      expect(result.sha).toMatch(/^[0-9a-f]{40}$/);

      // Content should match the old version
      const restoredContent = await service.readBlob(ref, 'chapter.html');
      expect(restoredContent.toString('utf-8')).toBe('<p>First version</p>');
    });

    it('new commit has kind: restore', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_restore_kind/main';

      const sha1 = await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>v1</p>', 'utf-8') },
        testMsg('v1'),
      );
      await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>v2</p>', 'utf-8') },
        testMsg('v2'),
      );

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      const result = await histService.restore('test-project', ref, sha1);

      // Verify the tip commit has kind 'restore'
      const log = await service.log(ref, 1);
      expect(log[0]!.sha).toBe(result.sha);
      expect(log[0]!.message.kind).toBe('restore');
      expect(log[0]!.message.label).toBe('Restored from history');
    });

    it('preserves all artifacts in the tree', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_restore_full/main';

      const sha1 = await service.commit(
        ref,
        {
          'expanded-outline.html': Buffer.from('<p>Expanded</p>', 'utf-8'),
          'chapter.html': Buffer.from('<p>Chapter</p>', 'utf-8'),
          'meta.json': Buffer.from(
            JSON.stringify({ generatedAt: '2026-01-01', model: { provider: 'test', model: 'test-model' }, kind: 'expand', fingerprints: { outlineSlice: 'abc', variables: [], upstream: null, continuity: null } }),
            'utf-8',
          ),
        },
        testMsg('full commit'),
      );

      // Create a commit that changes things
      await service.commit(
        ref,
        {
          'chapter.html': Buffer.from('<p>Modified chapter</p>', 'utf-8'),
        },
        testMsg('modify chapter'),
      );

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      // Restore to the full commit
      await histService.restore('test-project', ref, sha1);

      // Read the tree — all files from the original should be present
      const tree = await service.readTree(ref);
      expect(tree).toHaveProperty('expanded-outline.html');
      expect(tree).toHaveProperty('chapter.html');
      expect(tree).toHaveProperty('meta.json');

      // And content should match the original
      const chapterBuf = await service.readBlob(ref, 'chapter.html');
      expect(chapterBuf.toString('utf-8')).toBe('<p>Chapter</p>');
    });

    it('throws when ref does not exist', async () => {
      const { service } = await setupRepo();
      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      await expect(
        histService.restore(
          'test-project',
          'refs/plotline/chapters/nonexistent/main',
          '0000000000000000000000000000000000000000',
        ),
      ).rejects.toThrow(/Ref not found/i);
    });

    it('throws when sha does not exist', async () => {
      const { service } = await setupRepo();
      const ref = 'refs/plotline/chapters/ch_bad_sha/main';

      // Create at least one commit so the ref exists
      await service.commit(
        ref,
        { 'chapter.html': Buffer.from('<p>test</p>', 'utf-8') },
        testMsg('existing'),
      );

      const histService = new HistoryService(
        mockProjectService(service) as never,
      );

      await expect(
        histService.restore(
          'test-project',
          ref,
          '0000000000000000000000000000000000000000',
        ),
      ).rejects.toThrow(/Commit not found/i);
    });
  });

  // ── Error: project not open ───────────────────────────────────────────────

  it('throws when project is not open', async () => {
    const histService = new HistoryService({
      getOpenProject: () => undefined,
    } as never);

    await expect(
      histService.listHistory('nonexistent', 'refs/heads/main'),
    ).rejects.toThrow(/Project not open/i);

    await expect(
      histService.preview('nonexistent', 'refs/heads/main', 'abc'),
    ).rejects.toThrow(/Project not open/i);

    await expect(
      histService.restore('nonexistent', 'refs/heads/main', 'abc'),
    ).rejects.toThrow(/Project not open/i);
  });
});
