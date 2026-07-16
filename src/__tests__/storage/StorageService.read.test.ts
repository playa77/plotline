/**
 * StorageService read-path tests (WP-02).
 *
 * Every test creates a throwaway Git repo via `createTestRepo`, exercises one
 * or more read methods, then cleans up the temp directory.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import git from 'isomorphic-git';

import { StorageService } from '../../main/storage/StorageService';
import type { CommitMessage } from '../../main/storage/StorageService';
import { createTestRepo, createCommit } from '../../main/storage/testHelpers';

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Basic structured commit message for test commits. */
const testMsg = (label: string, kind: CommitMessage['kind'] = 'manual'): CommitMessage => ({
  label,
  kind,
});

/** Default author info snapshot for easier commit creation. */
const msg = testMsg('test commit');

// ── Suite-level setup ───────────────────────────────────────────────────────

let repos: Array<() => void> = [];

beforeAll(() => {
  repos = [];
});

afterAll(() => {
  for (const cleanup of repos) {
    cleanup();
  }
  repos = [];
});

/** Wrapper that registers cleanup so it always runs. */
async function setupRepo() {
  const result = await createTestRepo();
  repos.push(result.cleanup);
  return result;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('StorageService — read path (WP-02)', () => {
  describe('readBlob', () => {
    it('reads a single file from a commit', async () => {
      const { service, cleanup } = await setupRepo();

      await createCommit(service, 'refs/heads/main', {
        'hello.txt': 'Hello World',
      }, msg);

      const blob = await service.readBlob('refs/heads/main', 'hello.txt');
      expect(Buffer.isBuffer(blob)).toBe(true);
      expect(blob.toString('utf-8')).toBe('Hello World');

      cleanup();
    });

    it('reads a nested file path', async () => {
      const { service, cleanup } = await setupRepo();

      await createCommit(service, 'refs/heads/main', {
        'variables/tone/content.html': '<p>Serious</p>',
      }, msg);

      const blob = await service.readBlob('refs/heads/main', 'variables/tone/content.html');
      expect(blob.toString('utf-8')).toBe('<p>Serious</p>');

      cleanup();
    });

    it('reads binary content as Buffer', async () => {
      const { service, cleanup } = await setupRepo();

      const binary = Buffer.from([0x00, 0x01, 0x02, 0xff]);
      await createCommit(service, 'refs/heads/main', {
        'data.bin': binary,
      }, msg);

      const blob = await service.readBlob('refs/heads/main', 'data.bin');
      expect(blob.equals(binary)).toBe(true);

      cleanup();
    });

    it('throws descriptive error when file is not found', async () => {
      const { service, cleanup } = await setupRepo();

      await createCommit(service, 'refs/heads/main', {
        'existing.txt': 'content',
      }, msg);

      await expect(
        service.readBlob('refs/heads/main', 'nonexistent.txt'),
      ).rejects.toThrow();

      cleanup();
    });

    it('throws when ref does not exist', async () => {
      const { service, cleanup } = await setupRepo();

      await expect(
        service.readBlob('refs/heads/nonexistent', 'file.txt'),
      ).rejects.toThrow();

      cleanup();
    });
  });

  describe('readTree', () => {
    it('returns all paths from a flat tree', async () => {
      const { service, cleanup } = await setupRepo();

      await createCommit(service, 'refs/heads/main', {
        'a.txt': 'aaa',
        'b.txt': 'bbb',
        'c.txt': 'ccc',
      }, msg);

      const tree = await service.readTree('refs/heads/main');
      expect(Object.keys(tree)).toHaveLength(3);
      expect(tree).toHaveProperty('a.txt');
      expect(tree).toHaveProperty('b.txt');
      expect(tree).toHaveProperty('c.txt');

      cleanup();
    });

    it('returns paths from a tree with nested directories', async () => {
      const { service, cleanup } = await setupRepo();

      await createCommit(service, 'refs/heads/main', {
        'root.txt': 'root',
        'sub/a.txt': 'sub-a',
        'sub/deep/b.txt': 'deep-b',
      }, msg);

      const tree = await service.readTree('refs/heads/main');
      expect(Object.keys(tree)).toHaveLength(3);
      expect(tree).toHaveProperty('root.txt');
      expect(tree).toHaveProperty('sub/a.txt');
      expect(tree).toHaveProperty('sub/deep/b.txt');

      cleanup();
    });

    it('returns only (expanded-outline.html, meta.json) from chapter-version ref', async () => {
      const { service, cleanup } = await setupRepo();

      await createCommit(
        service,
        'refs/heads/main',
        { 'other.txt': 'should not appear' },
        msg,
      );

      // Create a chapter-version ref pointing to a tree with only those 2 files
      await createCommit(
        service,
        'refs/plotline/chapters/ch_001/main',
        {
          'expanded-outline.html': '<h1>Chapter 1</h1>',
          'meta.json': JSON.stringify({ title: 'Chapter 1' }),
        },
        msg,
      );

      const tree = await service.readTree('refs/plotline/chapters/ch_001/main');
      expect(Object.keys(tree)).toHaveLength(2);
      expect(tree).toHaveProperty('expanded-outline.html');
      expect(tree).toHaveProperty('meta.json');

      cleanup();
    });

    it('returns blob SHAs (40-character hex strings)', async () => {
      const { service, cleanup } = await setupRepo();

      await createCommit(service, 'refs/heads/main', {
        'sha.txt': 'check',
      }, msg);

      const tree = await service.readTree('refs/heads/main');
      const sha = tree['sha.txt'];
      expect(sha).toMatch(/^[0-9a-f]{40}$/);

      cleanup();
    });
  });

  describe('log', () => {
    it('returns commits in newest-first order', async () => {
      const { service, cleanup } = await setupRepo();

      let parent: string | undefined;
      for (let i = 1; i <= 5; i++) {
        parent = await createCommit(
          service,
          'refs/heads/main',
          { [`file${i}.txt`]: `content${i}` },
          testMsg(`commit ${i}`),
          parent,
        );
      }

      const commits = await service.log('refs/heads/main', 10);
      expect(commits).toHaveLength(5);
      // Newest first — last label should be "commit 1"
      expect(commits[4]!.message.label).toBe('commit 1');
      expect(commits[0]!.message.label).toBe('commit 5');

      cleanup();
    });

    it('respects the limit parameter', async () => {
      const { service, cleanup } = await setupRepo();

      let parent: string | undefined;
      for (let i = 1; i <= 10; i++) {
        parent = await createCommit(
          service,
          'refs/heads/main',
          { [`f${i}.txt`]: `c${i}` },
          testMsg(`commit ${i}`),
          parent,
        );
      }

      const commits = await service.log('refs/heads/main', 3);
      expect(commits).toHaveLength(3);

      cleanup();
    });

    it('filters with before — returns older commits', async () => {
      const { service, cleanup } = await setupRepo();

      const shas: string[] = [];
      let parent: string | undefined;
      for (let i = 1; i <= 5; i++) {
        parent = await createCommit(
          service,
          'refs/heads/main',
          { [`f${i}.txt`]: `c${i}` },
          testMsg(`commit ${i}`),
          parent,
        );
        shas.push(parent);
      }

      // shas[0] = oldest (commit 1), shas[4] = newest (commit 5)
      // log before the 3rd (middle) commit → returns older commits (1 and 2)
      const beforeSha = shas[2]!; // commit 3
      const commits = await service.log('refs/heads/main', 10, beforeSha);
      expect(commits).toHaveLength(2);
      // Should be commits 2 and 1 (older than commit 3)
      expect(new Set(commits.map((c) => c.message.label))).toEqual(
        new Set(['commit 2', 'commit 1']),
      );

      cleanup();
    });

    it('parses structured JSON commit messages', async () => {
      const { service, cleanup } = await setupRepo();

      await createCommit(
        service,
        'refs/heads/main',
        { 'file.txt': 'content' },
        {
          label: 'Edited manually',
          kind: 'manual',
        },
      );

      await createCommit(
        service,
        'refs/heads/main',
        { 'file.txt': 'expanded' },
        {
          label: 'Generated — Expand',
          kind: 'expand',
          wordDelta: 150,
        },
        undefined, // use the previous commit as parent implicitly via ref advancement
      );

      const commits = await service.log('refs/heads/main', 10);
      // newest first — the expand commit should be first
      expect(commits[0]!.message.kind).toBe('expand');
      expect(commits[0]!.message.label).toBe('Generated — Expand');
      expect(commits[0]!.message.wordDelta).toBe(150);

      cleanup();
    });

    it('includes author name, email, and ISO timestamp', async () => {
      const { service, cleanup } = await setupRepo();

      await createCommit(
        service,
        'refs/heads/main',
        { 'f.txt': 'x' },
        testMsg('test'),
      );

      const commits = await service.log('refs/heads/main', 1);
      const c = commits[0]!;
      expect(c.author).toBeDefined();
      expect(c.author.name).toBe('Plotline Test');
      expect(c.author.email).toBe('test@plotline.local');

      // ISO 8601 timestamp
      expect(() => new Date(c.timestamp)).not.toThrow();
      expect(c.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      cleanup();
    });

    it('performance: 500 commits ≤ 150ms', async () => {
      const { service, cleanup } = await setupRepo();

      // Create 500 sequential commits
      let parent: string | undefined;
      for (let i = 1; i <= 500; i++) {
        parent = await createCommit(
          service,
          'refs/heads/main',
          { [`f${i}.txt`]: `c${i}` },
          testMsg(`commit ${i}`),
          parent,
        );
      }

      const start = performance.now();
      const commits = await service.log('refs/heads/main', 500);
      const elapsed = performance.now() - start;

      expect(commits).toHaveLength(500);
      expect(elapsed).toBeLessThanOrEqual(150);

      cleanup();
    });
  });

  describe('listRefs', () => {
    it('returns refs matching the prefix', async () => {
      const { service, cleanup } = await setupRepo();

      // Create a few refs via commits
      await createCommit(service, 'refs/heads/main', { 'f.txt': 'main' }, msg);
      await createCommit(service, 'refs/plotline/chapters/ch_001/main', { 'outline.html': '' }, msg);
      await createCommit(service, 'refs/plotline/archived/ch_001', { 'archived.md': '' }, msg);
      await createCommit(service, 'refs/tags/v1', { 'v1.txt': '' }, msg);

      const plotlineRefs = await service.listRefs('refs/plotline');
      expect(plotlineRefs).toHaveLength(2);
      expect(plotlineRefs).toEqual(
        expect.arrayContaining([
          'refs/plotline/chapters/ch_001/main',
          'refs/plotline/archived/ch_001',
        ]),
      );

      const headRefs = await service.listRefs('refs/heads');
      expect(headRefs).toContain('refs/heads/main');

      cleanup();
    });

    it('returns empty array for non-matching prefix', async () => {
      const { service, cleanup } = await setupRepo();

      const refs = await service.listRefs('refs/nonexistent');
      expect(refs).toEqual([]);

      cleanup();
    });
  });

  describe('diffTrees', () => {
    it('returns changed paths between two different trees', async () => {
      const { service, cleanup } = await setupRepo();

      // Create two commits and get their tree SHAs
      const sha1 = await createCommit(service, 'refs/heads/main', {
        'common.txt': 'shared',
        'only-a.txt': 'aaa',
      }, testMsg('commit A'));

      const sha2 = await createCommit(service, 'refs/heads/main', {
        'common.txt': 'shared',
        'only-b.txt': 'bbb',
      }, testMsg('commit B'), sha1);

      // Get tree SHAs for both commits
      const commit1 = await git.readCommit({ fs, dir: (service as unknown as { dir: string }).dir, oid: sha1 });
      const commit2 = await git.readCommit({ fs, dir: (service as unknown as { dir: string }).dir, oid: sha2 });

      const treeA = commit1.commit.tree;
      const treeB = commit2.commit.tree;

      const changed = await service.diffTrees(treeA, treeB);
      // common.txt is in both with same content (same SHA) — NOT changed
      expect(changed).not.toContain('common.txt');
      // only-a.txt removed, only-b.txt added
      expect(changed).toEqual(expect.arrayContaining(['only-a.txt', 'only-b.txt']));
      expect(changed).toHaveLength(2);

      cleanup();
    });

    it('returns empty array for identical trees', async () => {
      const { service, cleanup } = await setupRepo();

      const sha = await createCommit(service, 'refs/heads/main', {
        'same.txt': 'content',
      }, msg);

      const commit = await git.readCommit({ fs, dir: (service as unknown as { dir: string }).dir, oid: sha });
      const treeSha = commit.commit.tree;

      const changed = await service.diffTrees(treeSha, treeSha);
      expect(changed).toEqual([]);

      cleanup();
    });

    it('detects modified file (same path, different blob SHA)', async () => {
      const { service, cleanup } = await setupRepo();

      const sha1 = await createCommit(service, 'refs/heads/main', {
        'evolving.txt': 'version 1',
      }, testMsg('v1'));

      const sha2 = await createCommit(service, 'refs/heads/main', {
        'evolving.txt': 'version 2',
      }, testMsg('v2'), sha1);

      const commit1 = await git.readCommit({ fs, dir: (service as unknown as { dir: string }).dir, oid: sha1 });
      const commit2 = await git.readCommit({ fs, dir: (service as unknown as { dir: string }).dir, oid: sha2 });

      const changed = await service.diffTrees(commit1.commit.tree, commit2.commit.tree);
      expect(changed).toEqual(['evolving.txt']);

      cleanup();
    });
  });
});
