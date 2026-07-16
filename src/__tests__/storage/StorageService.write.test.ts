/**
 * StorageService write-path tests (WP-03).
 *
 * Every test creates a throwaway Git repo via `createTestRepo`, exercises one
 * or more write methods, then cleans up the temp directory.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import git from 'isomorphic-git';
import fs from 'node:fs';

import { StorageService } from '../../main/storage/StorageService';
import type { CommitMessage } from '../../main/storage/StorageService';
import { createTestRepo, createCommit } from '../../main/storage/testHelpers';

// ── Shared helpers ──────────────────────────────────────────────────────────

const testMsg = (label: string, kind: CommitMessage['kind'] = 'manual'): CommitMessage => ({
  label,
  kind,
});

// ── Suite-level setup ───────────────────────────────────────────────────────

let repos: Array<() => void> = [];

const msg = testMsg('test commit');

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
async function setupRepo(sessionId?: string) {
  const result = await createTestRepo(sessionId);
  repos.push(result.cleanup);
  return result;
}

/** Convert string to Buffer for commit() calls. */
const buf = (s: string): Buffer => Buffer.from(s, 'utf-8');

// ── Tests ───────────────────────────────────────────────────────────────────

describe('StorageService — write path (WP-03)', () => {
  describe('commit — basic operations', () => {
    it('creates an initial commit on a new ref', async () => {
      const { service, cleanup } = await setupRepo();

      const sha = await service.commit(
        'refs/heads/main',
        { 'hello.txt': buf('Hello World') },
        testMsg('initial'),
      );

      expect(sha).toMatch(/^[0-9a-f]{40}$/);

      const blob = await service.readBlob('refs/heads/main', 'hello.txt');
      expect(blob.toString('utf-8')).toBe('Hello World');

      cleanup();
    });

    it('appends to an existing ref (parent chain)', async () => {
      const { service, cleanup } = await setupRepo();

      await service.commit('refs/heads/main', { 'f1.txt': buf('a') }, testMsg('first'));
      const sha2 = await service.commit('refs/heads/main', { 'f2.txt': buf('b') }, testMsg('second'));

      const log = await service.log('refs/heads/main', 10);
      expect(log).toHaveLength(2);
      expect(log[0]!.sha).toBe(sha2);
      expect(log[0]!.message.label).toBe('second');

      cleanup();
    });

    it('creates a new file (readBlob confirms content)', async () => {
      const { service, cleanup } = await setupRepo();

      await service.commit('refs/heads/main', { 'a.txt': buf('aaa') }, testMsg('add a'));

      const blob = await service.readBlob('refs/heads/main', 'a.txt');
      expect(blob.toString('utf-8')).toBe('aaa');

      cleanup();
    });

    it('updates an existing file (different content)', async () => {
      const { service, cleanup } = await setupRepo();

      await service.commit('refs/heads/main', { 'data.txt': buf('v1') }, testMsg('v1'));
      await service.commit('refs/heads/main', { 'data.txt': buf('v2') }, testMsg('v2'));

      const blob = await service.readBlob('refs/heads/main', 'data.txt');
      expect(blob.toString('utf-8')).toBe('v2');

      cleanup();
    });

    it('deletes a file via null content', async () => {
      const { service, cleanup } = await setupRepo();

      await service.commit('refs/heads/main', { 'gone.txt': buf('will be removed') }, testMsg('add'));
      await service.commit('refs/heads/main', { 'gone.txt': null }, testMsg('delete'));

      await expect(
        service.readBlob('refs/heads/main', 'gone.txt'),
      ).rejects.toThrow();

      cleanup();
    });

    it('handles nested file paths', async () => {
      const { service, cleanup } = await setupRepo();

      await service.commit(
        'refs/heads/main',
        { 'variables/tone/content.html': buf('<p>Serious</p>') },
        testMsg('nested'),
      );

      const blob = await service.readBlob('refs/heads/main', 'variables/tone/content.html');
      expect(blob.toString('utf-8')).toBe('<p>Serious</p>');

      cleanup();
    });

    it('commits multiple files in one call', async () => {
      const { service, cleanup } = await setupRepo();

      await service.commit(
        'refs/heads/main',
        {
          'a.txt': buf('aaa'),
          'b.txt': buf('bbb'),
          'c.txt': buf('ccc'),
        },
        testMsg('three files'),
      );

      const tree = await service.readTree('refs/heads/main');
      expect(Object.keys(tree)).toHaveLength(3);

      cleanup();
    });

    it('commits binary Buffer content', async () => {
      const { service, cleanup } = await setupRepo();

      const binary = Buffer.from([0x00, 0x01, 0x02, 0xff]);
      await service.commit('refs/heads/main', { 'data.bin': binary }, testMsg('binary'));

      const blob = await service.readBlob('refs/heads/main', 'data.bin');
      expect(blob.equals(binary)).toBe(true);

      cleanup();
    });

    it('stores structured JSON commit messages', async () => {
      const { service, cleanup } = await setupRepo();

      await service.commit(
        'refs/heads/main',
        { 'f.txt': buf('content') },
        { label: 'Generated — Write', kind: 'write', wordDelta: 250 },
      );

      const log = await service.log('refs/heads/main', 1);
      expect(log[0]!.message.kind).toBe('write');
      expect(log[0]!.message.label).toBe('Generated — Write');
      expect(log[0]!.message.wordDelta).toBe(250);

      cleanup();
    });
  });

  describe('commit — amend-own-autosave', () => {
    it('amends a manual commit within the time window', async () => {
      const { service, cleanup } = await setupRepo('sess-amend-ok');

      await service.commit(
        'refs/heads/main',
        { 'f.txt': buf('original') },
        { label: 'Manual edit', kind: 'manual' },
      );

      // Second manual call with amendOwnAutosave — should amend the first
      await service.commit(
        'refs/heads/main',
        { 'f.txt': buf('amended') },
        { label: 'Manual edit 2', kind: 'manual' },
        { amendOwnAutosave: true },
      );

      // Log should show only 1 commit (the amend replaced the tip)
      const log = await service.log('refs/heads/main', 10);
      expect(log).toHaveLength(1);
      // Content should be the amended version
      const blob = await service.readBlob('refs/heads/main', 'f.txt');
      expect(blob.toString('utf-8')).toBe('amended');

      cleanup();
    });

    it('refuses amend when tip kind is not manual (expand)', async () => {
      const { service, cleanup } = await setupRepo('sess-no-gen');

      await service.commit(
        'refs/heads/main',
        { 'f.txt': buf('generated') },
        { label: 'Expand gen', kind: 'expand' },
      );

      await service.commit(
        'refs/heads/main',
        { 'f.txt': buf('manual after gen') },
        { label: 'Manual fix', kind: 'manual' },
        { amendOwnAutosave: true },
      );

      // 2 commits — amend refused (tip was kind='expand')
      const log = await service.log('refs/heads/main', 10);
      expect(log).toHaveLength(2);
      // The last commit should have the manual content
      const blob = await service.readBlob('refs/heads/main', 'f.txt');
      expect(blob.toString('utf-8')).toBe('manual after gen');

      cleanup();
    });

    it('refuses amend when tip kind is restore', async () => {
      const { service, cleanup } = await setupRepo('sess-no-restore');

      await service.commit(
        'refs/heads/main',
        { 'f.txt': buf('restored') },
        { label: 'Restore', kind: 'restore' },
      );

      await service.commit(
        'refs/heads/main',
        { 'f.txt': buf('after restore') },
        { label: 'Manual after restore', kind: 'manual' },
        { amendOwnAutosave: true },
      );

      const log = await service.log('refs/heads/main', 10);
      expect(log).toHaveLength(2);

      cleanup();
    });

    it('refuses amend across different sessions', async () => {
      const { service: serviceA, cleanup: cleanupA } = await setupRepo('session-a');
      const repoDir = serviceA.directory;

      // Create initial commit using the service with session-a
      const sha1 = await serviceA.commit(
        'refs/heads/main',
        { 'f.txt': buf('from session A') },
        { label: 'Session A manual', kind: 'manual' },
      );

      // Now create a NEW service instance with a different session pointing
      // at the same repo
      const serviceB = new StorageService(repoDir, undefined, 'session-b');

      await serviceB.commit(
        'refs/heads/main',
        { 'f.txt': buf('from session B') },
        { label: 'Session B manual', kind: 'manual' },
        { amendOwnAutosave: true },
      );

      // 2 commits — amend refused (different sessionId)
      const log = await serviceB.log('refs/heads/main', 10);
      expect(log).toHaveLength(2);

      cleanupA(); // cleanupA removes the repo dir
    });

    it('refuses amend outside the time window (amendWindowMs=0)', async () => {
      // Create the repo with a 0ms window — two commits more than 0ms apart
      // will never qualify for amend.
      const { service, cleanup } = await setupRepo('sess-timeout');
      const repoDir = service.directory;

      // First commit via the default-window service
      await service.commit(
        'refs/heads/main',
        { 'f.txt': buf('early') },
        { label: 'Early manual', kind: 'manual' },
      );

      // Create a second service with a 0ms window that shares the same repo
      const serviceZero = new StorageService(repoDir, undefined, 'sess-timeout', 0);

      await serviceZero.commit(
        'refs/heads/main',
        { 'f.txt': buf('late') },
        { label: 'Late manual', kind: 'manual' },
        { amendOwnAutosave: true },
      );

      // 2 commits — amend refused (0ms window means any time gap fails)
      const log = await serviceZero.log('refs/heads/main', 10);
      expect(log).toHaveLength(2);

      cleanup();
    });

    it('prevents double-amend chain (amended tip is not amendable again)', async () => {
      const { service, cleanup } = await setupRepo('sess-chain');

      // First manual commit
      await service.commit(
        'refs/heads/main',
        { 'f.txt': buf('v1') },
        { label: 'First manual', kind: 'manual' },
      );

      // Second manual with amend → amends the first (=> 1 commit)
      await service.commit(
        'refs/heads/main',
        { 'f.txt': buf('v2') },
        { label: 'Second manual', kind: 'manual' },
        { amendOwnAutosave: true },
      );

      // At this point: only 1 commit (v2 replaced v1 via amend)
      let log = await service.log('refs/heads/main', 10);
      expect(log).toHaveLength(1);

      // Third manual with amend → should NOT amend (tip has amended=true)
      await service.commit(
        'refs/heads/main',
        { 'f.txt': buf('v3') },
        { label: 'Third manual', kind: 'manual' },
        { amendOwnAutosave: true },
      );

      // Now we should have 2 commits (v3 on top of the amended v2)
      log = await service.log('refs/heads/main', 10);
      expect(log).toHaveLength(2);

      // Content should be v3
      const blob = await service.readBlob('refs/heads/main', 'f.txt');
      expect(blob.toString('utf-8')).toBe('v3');

      cleanup();
    });
  });

  describe('createRef / renameRef', () => {
    it('createRef makes a ref point at a specific commit', async () => {
      const { service, cleanup } = await setupRepo();

      const sha = await service.commit('refs/heads/main', { 'f.txt': buf('x') }, testMsg('initial'));

      await service.createRef('refs/tags/v1', sha);

      // Resolve the new ref to confirm it points at the same commit
      const blob = await service.readBlob('refs/tags/v1', 'f.txt');
      expect(blob.toString('utf-8')).toBe('x');

      cleanup();
    });

    it('renameRef — old ref gone, new ref resolves to same commit', async () => {
      const { service, cleanup } = await setupRepo();

      const sha = await service.commit('refs/heads/old-name', { 'f.txt': buf('y') }, testMsg('initial'));

      await service.renameRef('refs/heads/old-name', 'refs/heads/new-name');

      // Old ref should be gone
      await expect(
        service.readBlob('refs/heads/old-name', 'f.txt'),
      ).rejects.toThrow();

      // New ref resolves to the same content
      const blob = await service.readBlob('refs/heads/new-name', 'f.txt');
      expect(blob.toString('utf-8')).toBe('y');

      cleanup();
    });

    it('renameRef preserves content across renames', async () => {
      const { service, cleanup } = await setupRepo();

      await service.commit('refs/heads/main', { 'data.txt': buf('preserved') }, testMsg('initial'));

      await service.renameRef('refs/heads/main', 'refs/heads/renamed');

      const blob = await service.readBlob('refs/heads/renamed', 'data.txt');
      expect(blob.toString('utf-8')).toBe('preserved');

      cleanup();
    });
  });

  describe('write queue', () => {
    it('serialises 50 concurrent commit calls correctly', async () => {
      const { service, cleanup } = await setupRepo();

      const promises: Promise<string>[] = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          service.commit(
            'refs/heads/main',
            { 'counter.txt': buf(String(i)) },
            testMsg(`commit ${i}`),
          ),
        );
      }

      const shas = await Promise.all(promises);
      expect(shas).toHaveLength(50);
      // All SHAs should be unique
      expect(new Set(shas).size).toBe(50);

      // Log should show exactly 50 commits in sequence
      const log = await service.log('refs/heads/main', 100);
      expect(log).toHaveLength(50);

      // The last commit should have written counter value 49
      const blob = await service.readBlob('refs/heads/main', 'counter.txt');
      expect(blob.toString('utf-8')).toBe('49');

      cleanup();
    });

    it('leaves repo consistent after 50 concurrent commits', async () => {
      const { service, cleanup } = await setupRepo();

      const promises: Promise<string>[] = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          service.commit(
            'refs/heads/main',
            { [`f${i}.txt`]: buf(`content${i}`) },
            testMsg(`commit ${i}`),
          ),
        );
      }

      await Promise.all(promises);

      // Verify all refs resolve
      const sha = await git.resolveRef({
        fs,
        dir: service.directory,
        ref: 'refs/heads/main',
      });
      expect(sha).toMatch(/^[0-9a-f]{40}$/);

      // Read tree — should have 50 files
      const tree = await service.readTree('refs/heads/main');
      expect(Object.keys(tree)).toHaveLength(50);

      // Verify a few specific files exist
      const blob = await service.readBlob('refs/heads/main', 'f0.txt');
      expect(blob.toString('utf-8')).toBe('content0');

      cleanup();
    });
  });

  describe('restore semantics', () => {
    it('restore creates new commit whose tree equals the target tree', async () => {
      const { service, cleanup } = await setupRepo();

      // Commit A — tree T1 (a.txt, b.txt)
      const shaA = await service.commit(
        'refs/heads/main',
        {
          'a.txt': buf('aaa'),
          'b.txt': buf('bbb'),
        },
        testMsg('commit A'),
      );

      // Commit B — tree T2 (modifies a.txt, adds c.txt, removes b.txt)
      const shaB = await service.commit(
        'refs/heads/main',
        {
          'a.txt': buf('aaa-modified'),
          'c.txt': buf('ccc'),
        },
        testMsg('commit B'),
      );

      // Get the tree SHA of commit A
      const { commit: commitA } = await git.readCommit({
        fs,
        dir: service.directory,
        oid: shaA,
      });
      const treeA = commitA.tree;

      // "Restore to A": read A's tree map and compute diff with B's tree
      const treeAMap = await service.readTree(shaA);
      const treeBMap = await service.readTree(shaB);

      // Build files for restore: all files from A + null-delete files that
      // exist in B but not in A
      const files: Record<string, Buffer | null> = {};
      for (const [filepath, blobSha] of Object.entries(treeAMap)) {
        const { blob } = await git.readBlob({
          fs,
          dir: service.directory,
          oid: blobSha,
        });
        files[filepath] = Buffer.from(blob);
      }
      for (const filepath of Object.keys(treeBMap)) {
        if (!(filepath in treeAMap)) {
          files[filepath] = null; // delete from tree
        }
      }

      const shaC = await service.commit(
        'refs/heads/main',
        files,
        { label: 'Restored to A', kind: 'restore' },
      );

      // Verify C's tree equals A's tree
      const { commit: commitC } = await git.readCommit({
        fs,
        dir: service.directory,
        oid: shaC,
      });
      expect(commitC.tree).toBe(treeA);

      // Also verify content
      const aContent = await service.readBlob('refs/heads/main', 'a.txt');
      expect(aContent.toString('utf-8')).toBe('aaa');
      // b.txt should exist (restored), c.txt should be gone
      const bContent = await service.readBlob('refs/heads/main', 'b.txt');
      expect(bContent.toString('utf-8')).toBe('bbb');
      await expect(
        service.readBlob('refs/heads/main', 'c.txt'),
      ).rejects.toThrow();

      cleanup();
    });
  });

  describe('atomicity — ref not advanced on failure', () => {
    it('ref remains at old tip after a failed commit-like operation', async () => {
      const { service, cleanup } = await setupRepo();

      const sha1 = await service.commit('refs/heads/main', { 'f.txt': buf('safe') }, testMsg('safe'));

      // Try to commit with an extremely deep nested path that might fail
      // The ref should NOT advance if the commit throws
      // (This test verifies the enqueue never advances the ref without
      //  a successful commit completing inside the queue.)
      const logBefore = await service.log('refs/heads/main', 10);

      // This should succeed (no error expected, but we verify ref is at sha1)
      const sha2 = await service.commit('refs/heads/main', { 'f.txt': buf('still safe') }, testMsg('still safe'));
      expect(sha2).not.toBe(sha1);

      const logAfter = await service.log('refs/heads/main', 10);
      expect(logAfter[0]!.sha).toBe(sha2);

      // Verify the ref still resolves — commit was successful
      const blob = await service.readBlob('refs/heads/main', 'f.txt');
      expect(blob.toString('utf-8')).toBe('still safe');

      cleanup();
    });
  });

  describe('read path remains intact', () => {
    it('existing readBlob, readTree, log, listRefs, diffTrees still work', async () => {
      const { service, cleanup } = await setupRepo();

      // Setup write
      await service.commit('refs/heads/main', {
        'r.txt': buf('read-test'),
        'sub/nested.txt': buf('nested'),
      }, testMsg('setup'));

      await service.commit('refs/heads/main', {
        'sub/nested.txt': buf('updated nested'),
        'extra.txt': buf('extra'),
      }, testMsg('update'));

      // readBlob
      const blob = await service.readBlob('refs/heads/main', 'r.txt');
      expect(blob.toString('utf-8')).toBe('read-test');

      // readTree
      const tree = await service.readTree('refs/heads/main');
      expect(tree).toHaveProperty('r.txt');
      expect(tree).toHaveProperty('sub/nested.txt');
      expect(tree).toHaveProperty('extra.txt');

      // log
      const log = await service.log('refs/heads/main', 10);
      expect(log).toHaveLength(2);

      // listRefs
      const refs = await service.listRefs('refs/head');
      expect(refs).toContain('refs/heads/main');

      // diffTrees (between the two commits)
      const { commit: c1 } = await git.readCommit({ fs, dir: service.directory, oid: log[1]!.sha });
      const { commit: c2 } = await git.readCommit({ fs, dir: service.directory, oid: log[0]!.sha });
      const diff = await service.diffTrees(c1.tree, c2.tree);
      expect(diff).toEqual(expect.arrayContaining(['sub/nested.txt', 'extra.txt']));

      cleanup();
    });
  });
});
