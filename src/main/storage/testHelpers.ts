/**
 * Test fixture helpers for StorageService tests.
 *
 * Creates throwaway Git repos using direct object writes (no working tree).
 * Repos are created under `tmp/` (already gitignored in this repo).
 *
 * Version: 0.2.0 | 2026-07-16
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import git from 'isomorphic-git';

import type { StorageService, CommitMessage } from './StorageService';

// Lazy-import to avoid circular dependency at module level — the helper module
// is a test utility, not a production dependency of StorageService.
let StorageServiceImpl: typeof StorageService | null = null;

async function getService(): Promise<typeof StorageService> {
  if (!StorageServiceImpl) {
    StorageServiceImpl = (await import('./StorageService')).StorageService;
  }
  return StorageServiceImpl;
}

/**
 * Create a fresh throwaway repo in a temp directory.
 *
 * @param sessionId  - Optional session identifier passed to the StorageService
 *                     constructor. Useful for cross-session amend tests.
 * @returns A `service` (fully initialised StorageService), `dir` (the repo
 *          root path), and a `cleanup` function that removes the repo from
 *          disk.
 */
export async function createTestRepo(
  sessionId?: string,
): Promise<{
  service: StorageService;
  dir: string;
  cleanup: () => void;
}> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-test-'));
  // Also create under tmp/ for visibility during development
  const projectTmp = path.resolve('tmp');
  if (!fs.existsSync(projectTmp)) {
    fs.mkdirSync(projectTmp, { recursive: true });
  }

  await git.init({ fs, dir });

  const Service = await getService();
  const service = new Service(dir, undefined, sessionId);

  return {
    service,
    dir,
    cleanup: () => {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Create a single commit on a ref using direct object writes.
 *
 * This is a low-level fixture builder — it does NOT go through the
 * StorageService.write queue or amend logic.
 *
 * @param service           - A StorageService instance.
 * @param ref               - The ref to write to (e.g. `refs/heads/main`).
 * @param files             - Map of file paths to their content.
 * @param message           - The structured commit message.
 * @param parentSha         - Optional parent commit SHA.
 * @param extraMessageFields - Optional extra fields merged into the JSON
 *                             commit message (e.g. `{ sessionId: 'other' }`).
 * @returns The SHA of the newly-created commit.
 */
export async function createCommit(
  service: StorageService,
  ref: string,
  files: Record<string, string | Buffer>,
  message: CommitMessage,
  parentSha?: string,
  extraMessageFields?: Record<string, unknown>,
): Promise<string> {
  const repoDir = service.directory;

  // ── Phase 1: Write blobs ──────────────────────────────────────────────

  /** filepath → blob oid */
  const blobOids: Record<string, string> = {};

  for (const [filepath, content] of Object.entries(files)) {
    const data: Uint8Array =
      typeof content === 'string'
        ? new TextEncoder().encode(content)
        : new Uint8Array(
            content.buffer,
            content.byteOffset,
            content.byteLength,
          );

    blobOids[filepath] = await git.writeBlob({
      fs,
      dir: repoDir,
      blob: data,
    });
  }

  // ── Phase 2: Build tree(s), handling nested paths ─────────────────────

  /**
   * Recursively build tree objects from a flat `path → blobOid` map.
   */
  const buildTreeFromFlat = async (
    entries: Record<string, string>,
  ): Promise<string> => {
    const dirs = new Map<string, Record<string, string>>();
    const directBlobs: Array<{ path: string; oid: string }> = [];

    for (const [filepath, oid] of Object.entries(entries)) {
      const slashIdx = filepath.indexOf('/');
      if (slashIdx === -1) {
        directBlobs.push({ path: filepath, oid });
      } else {
        const dirName = filepath.slice(0, slashIdx);
        const subPath = filepath.slice(slashIdx + 1);
        if (!dirs.has(dirName)) dirs.set(dirName, {});
        dirs.get(dirName)![subPath] = oid;
      }
    }

    const treeEntries: Array<{
      mode: string;
      path: string;
      oid: string;
      type: 'blob' | 'tree';
    }> = [];

    for (const { path: p, oid } of directBlobs) {
      treeEntries.push({ mode: '100644', path: p, oid, type: 'blob' });
    }

    for (const [dirName, subFiles] of dirs) {
      const subTreeOid = await buildTreeFromFlat(subFiles);
      treeEntries.push({
        mode: '040000',
        path: dirName,
        oid: subTreeOid,
        type: 'tree',
      });
    }

    return git.writeTree({ fs, dir: repoDir, tree: treeEntries });
  };

  const treeOid = await buildTreeFromFlat(blobOids);

  // ── Phase 3: Write commit ──────────────────────────────────────────────

  const now = Math.floor(Date.now() / 1000);

  const commitObj = {
    message: JSON.stringify(
      extraMessageFields ? { ...message, ...extraMessageFields } : message,
    ),
    tree: treeOid,
    parent: parentSha ? [parentSha] : [],
    author: {
      name: 'Plotline Test',
      email: 'test@plotline.local',
      timestamp: now,
      timezoneOffset: 0,
    },
    committer: {
      name: 'Plotline Test',
      email: 'test@plotline.local',
      timestamp: now,
      timezoneOffset: 0,
    },
  } as const;

  const commitOid = await git.writeCommit({
    fs,
    dir: repoDir,
    commit: commitObj,
  });

  // ── Phase 4: Advance the ref ───────────────────────────────────────────

  await git.writeRef({
    fs,
    dir: repoDir,
    ref,
    value: commitOid,
    force: true,
  });

  return commitOid;
}
