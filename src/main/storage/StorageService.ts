/**
 * StorageService — Plotline's Git-based storage layer.
 *
 * Read path (WP-02) uses isomorphic-git for in-process Git object reads.
 * Write path (WP-03) adds FIFO-queued mutations, amend-own-autosave, and
 * structured commit messages with session tracking.
 *
 * No system `git` binary is required; the storage repo is managed entirely via
 * direct object reads/writes without a working tree or checkout.
 *
 * Version: 0.2.0 | 2026-07-16
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import git from 'isomorphic-git';
import type { FsClient } from 'isomorphic-git';

// ── Exported types ──────────────────────────────────────────────────────────

/** Structured commit message parsed from the JSON message stored in the commit. */
export interface CommitMessage {
  label: string;
  kind: 'manual' | 'expand' | 'write' | 'iterate' | 'restore';
  instruction?: string;
  wordDelta?: number;
  /** Authoring session that created this commit (set by StorageService). */
  sessionId?: string;
  /** True when this commit was an amend (prevents double-amend). */
  amended?: boolean;
}

/** A single commit as returned by the log method. */
export interface CommitInfo {
  sha: string;
  message: CommitMessage;
  author: { name: string; email: string };
  timestamp: string; // ISO 8601
}

/** Read-only StorageService interface. */
export interface StorageServiceRead {
  readBlob(ref: string, filepath: string): Promise<Buffer>;
  readTree(ref: string): Promise<Record<string, string>>; // path → blob sha
  log(ref: string, limit: number, before?: string): Promise<CommitInfo[]>;
  listRefs(prefix: string): Promise<string[]>;
  diffTrees(shaA: string, shaB: string): Promise<string[]>;
}

/** Write operations added in WP-03. */
export interface StorageServiceWrite {
  commit(
    ref: string,
    files: Record<string, Buffer | null>,
    message: CommitMessage,
    opts?: { amendOwnAutosave?: boolean },
  ): Promise<string>;
  createRef(newRef: string, atCommit: string): Promise<void>;
  renameRef(oldRef: string, newRef: string): Promise<void>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Attempt to parse a commit message as JSON-structured CommitMessage.
 * Falls back to treating the raw message as the label with kind 'manual'.
 */
function parseCommitMessage(raw: string): CommitMessage {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.label === 'string') {
      return parsed as CommitMessage;
    }
    return { label: raw, kind: 'manual' };
  } catch {
    return { label: raw, kind: 'manual' };
  }
}

// ── StorageService ──────────────────────────────────────────────────────────

export class StorageService implements StorageServiceRead, StorageServiceWrite {
  /** Unique session identifier, used for amend-own-autosave validation. */
  readonly sessionId: string;

  /**
   * @param dir           - Absolute path to the root of the Git repo.
   * @param _fs           - Optional filesystem backend (defaults to Node `fs`).
   * @param sessionId     - Session identifier (default: `crypto.randomUUID()`).
   * @param amendWindowMs - Time window (ms) within which a manual commit can be
   *                        auto-amended (default: 60 000 = 1 minute). Set to a
   *                        very small value (≤0) to disable amending.
   */
  constructor(
    private readonly dir: string,
    private readonly _fs?: FsClient,
    sessionId?: string,
    private readonly amendWindowMs: number = 60_000,
  ) {
    this.sessionId = sessionId ?? crypto.randomUUID();
  }

  /** Public read-only accessor for the repo root path. */
  get directory(): string {
    return this.dir;
  }

  /** The filesystem backend used for all isomorphic-git calls. */
  private get backend(): FsClient {
    return this._fs ?? (fs as unknown as FsClient);
  }

  // ── Write queue ──────────────────────────────────────────────────────────

  /**
   * FIFO promise chain that serialises all write operations.
   * Each operation waits for the previous one to complete (or fail) before
   * starting, guaranteeing sequential execution even under concurrent calls.
   */
  private writeQueue: Promise<void> = Promise.resolve();

  /**
   * Enqueue an async function to run serially after all previously enqueued
   * operations have settled.
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.writeQueue = this.writeQueue
        .then(
          () => fn().then(resolve, reject),
          () => fn().then(resolve, reject), // also run if previous op rejected
        )
        .then(
          () => {
            /* queue always settles */
          },
          () => {
            /* queue always settles */
          },
        );
    });
  }

  // ── Read: readBlob ────────────────────────────────────────────────────────

  /**
   * Read the content of a single file at the given ref.
   *
   * Uses isomorphic-git's built-in `filepath` resolution which automatically
   * walks the tree for nested paths (e.g. `variables/tone/content.html`).
   *
   * @throws Error if the ref or filepath cannot be resolved.
   */
  async readBlob(ref: string, filepath: string): Promise<Buffer> {
    const commitSha = await git.resolveRef({
      fs: this.backend,
      dir: this.dir,
      ref,
    });

    const { blob } = await git.readBlob({
      fs: this.backend,
      dir: this.dir,
      oid: commitSha,
      filepath,
    });

    // `blob` is a Uint8Array from isomorphic-git; convert to Buffer.
    return Buffer.from(blob);
  }

  // ── Read: readTree ────────────────────────────────────────────────────────

  /**
   * Recursively walk the tree at `ref` and return a flat map of
   * `filepath → blob SHA`.
   *
   * The tree is resolved from the commit at the given ref.
   */
  async readTree(ref: string): Promise<Record<string, string>> {
    const commitSha = await git.resolveRef({
      fs: this.backend,
      dir: this.dir,
      ref,
    });

    const { commit } = await git.readCommit({
      fs: this.backend,
      dir: this.dir,
      oid: commitSha,
    });

    const result: Record<string, string> = {};
    await this.walkTree(commit.tree, '', result);
    return result;
  }

  /**
   * Internal recursive tree walker.
   *
   * @param treeSha  - The SHA of the tree object to read.
   * @param prefix   - Path prefix accumulated from ancestor directories.
   * @param result   - Accumulator mutated in-place.
   */
  private async walkTree(
    treeSha: string,
    prefix: string,
    result: Record<string, string>,
  ): Promise<void> {
    const { tree } = await git.readTree({
      fs: this.backend,
      dir: this.dir,
      oid: treeSha,
    });

    for (const entry of tree) {
      const fullPath = prefix ? `${prefix}/${entry.path}` : entry.path;

      if (entry.type === 'tree') {
        await this.walkTree(entry.oid, fullPath, result);
      } else {
        result[fullPath] = entry.oid;
      }
    }
  }

  // ── Read: log ─────────────────────────────────────────────────────────────

  /**
   * Get commit history for `ref`, newest first.
   *
   * @param ref    - Starting ref (branch, tag, or SHA).
   * @param limit  - Maximum number of commits to return.
   * @param before - Optional commit SHA. When provided, only commits *older*
   *                 (ancestral to) the given commit are returned — the `before`
   *                 commit itself is excluded.
   */
  async log(
    ref: string,
    limit: number,
    before?: string,
  ): Promise<CommitInfo[]> {
    const rawCommits = await git.log({
      fs: this.backend,
      dir: this.dir,
      ref,
      depth: limit,
    });

    const commits: CommitInfo[] = rawCommits.map((c) => ({
      sha: c.oid,
      message: parseCommitMessage(c.commit.message),
      author: {
        name: c.commit.author.name,
        email: c.commit.author.email,
      },
      timestamp: new Date(c.commit.author.timestamp * 1000).toISOString(),
    }));

    // If `before` is specified, exclude the before commit and everything
    // NEWER than it (keeping only the older ancestors).
    if (before) {
      const beforeIdx = commits.findIndex((c) => c.sha === before);
      if (beforeIdx >= 0) {
        return commits.slice(beforeIdx + 1);
      }
    }

    return commits;
  }

  // ── Read: listRefs ────────────────────────────────────────────────────────

  /**
   * List all refs whose full name starts with the given prefix.
   *
   * @example
   *   listRefs('refs/plotline/chapters')
   *   // → ['refs/plotline/chapters/ch_001/main', …]
   */
  async listRefs(prefix: string): Promise<string[]> {
    const relative = await git.listRefs({
      fs: this.backend,
      dir: this.dir,
      filepath: 'refs',
    });

    const full = relative.map((r) => `refs/${r}`);
    return full.filter((r) => r.startsWith(prefix));
  }

  // ── Read: diffTrees ───────────────────────────────────────────────────────

  /**
   * Compare two tree SHAs and return the paths of files that differ.
   *
   * Both arguments are expected to be **tree** SHAs (not commit SHAs).
   */
  async diffTrees(shaA: string, shaB: string): Promise<string[]> {
    const treeA = await this.readTreeByOid(shaA);
    const treeB = await this.readTreeByOid(shaB);

    const allPaths = new Set([...Object.keys(treeA), ...Object.keys(treeB)]);
    const changed: string[] = [];

    for (const p of allPaths) {
      if (treeA[p] !== treeB[p]) {
        changed.push(p);
      }
    }

    return changed;
  }

  /**
   * Read a flat tree map directly from a tree SHA (bypassing the ref →
   * commit → tree indirection used by `readTree`).
   */
  private async readTreeByOid(
    oid: string,
  ): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    await this.walkTree(oid, '', result);
    return result;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  WRITE PATH (WP-03)
  // ═════════════════════════════════════════════════════════════════════════

  // ── commit ────────────────────────────────────────────────────────────────

  /**
   * Create a commit on `ref` with the given file changes.
   *
   * The write is serialised through the FIFO queue so concurrent calls are
   * applied sequentially.
   *
   * @param ref     - The ref to advance (e.g. `refs/heads/main`).
   * @param files   - Map of filepath → content. Use `null` to delete a file.
   * @param message - Structured commit message.
   * @param opts    - Options:
   *   - `amendOwnAutosave`: when true, checks whether the tip can be amended
   *     (same session, kind='manual', not itself an amend, within time window).
   *     If validation passes, the new commit replaces the tip (its parent is
   *     the tip's parent). Otherwise a normal commit is created.
   *
   * @returns The SHA of the newly-created commit.
   */
  async commit(
    ref: string,
    files: Record<string, Buffer | null>,
    message: CommitMessage,
    opts?: { amendOwnAutosave?: boolean },
  ): Promise<string> {
    return this.enqueue(async () => this.commitInner(ref, files, message, opts));
  }

  /** The actual commit logic (runs inside the write queue). */
  private async commitInner(
    ref: string,
    files: Record<string, Buffer | null>,
    message: CommitMessage,
    opts?: { amendOwnAutosave?: boolean },
  ): Promise<string> {
    // ── 1. Resolve parent ──────────────────────────────────────────────────
    let parentSha: string | undefined;
    try {
      parentSha = await git.resolveRef({
        fs: this.backend,
        dir: this.dir,
        ref,
      });
    } catch {
      // Ref doesn't exist yet → initial commit, no parent
      parentSha = undefined;
    }

    // ── 2. Check amend-own-autosave ────────────────────────────────────────
    let amendValidated = false;

    if (opts?.amendOwnAutosave && parentSha) {
      const { commit: tipCommit } = await git.readCommit({
        fs: this.backend,
        dir: this.dir,
        oid: parentSha,
      });
      const tipMsg = parseCommitMessage(tipCommit.message);
      const tipTimestampMs = tipCommit.author.timestamp * 1000;
      const nowMs = Date.now();

      if (
        tipMsg.kind === 'manual' &&
        tipMsg.sessionId === this.sessionId &&
        !tipMsg.amended &&
        nowMs - tipTimestampMs <= this.amendWindowMs
      ) {
        amendValidated = true;
      }
    }

    // ── 3. Determine base tree and parent for the NEW commit ───────────────
    let baseMap: Record<string, string>;
    let newParent: string | undefined;

    if (amendValidated && parentSha) {
      // Amending: use tip's tree as base, parent = tip's parent
      const { commit: tipCommit } = await git.readCommit({
        fs: this.backend,
        dir: this.dir,
        oid: parentSha,
      });
      baseMap = await this.readTreeByOid(tipCommit.tree);
      newParent = tipCommit.parent[0]; // may be undefined for root commits
    } else if (parentSha) {
      // Normal commit on existing ref
      const { commit: parentCommit } = await git.readCommit({
        fs: this.backend,
        dir: this.dir,
        oid: parentSha,
      });
      baseMap = await this.readTreeByOid(parentCommit.tree);
      newParent = parentSha;
    } else {
      // Initial commit (no parent)
      baseMap = {};
      newParent = undefined;
    }

    // ── 4. Apply file changes ──────────────────────────────────────────────
    for (const [filepath, content] of Object.entries(files)) {
      if (content === null) {
        delete baseMap[filepath];
      } else {
        const blobOid = await git.writeBlob({
          fs: this.backend,
          dir: this.dir,
          blob: content,
        });
        baseMap[filepath] = blobOid;
      }
    }

    // ── 5. Build the new tree from the flat map ────────────────────────────
    const treeOid = await this.buildTreeFromFlat(baseMap);

    // ── 6. Write the commit object ─────────────────────────────────────────
    const nowSec = Math.floor(Date.now() / 1000);
    const commitMsg: CommitMessage = {
      ...message,
      sessionId: this.sessionId,
      amended: amendValidated,
    };

    const commitOid = await git.writeCommit({
      fs: this.backend,
      dir: this.dir,
      commit: {
        message: JSON.stringify(commitMsg),
        tree: treeOid,
        parent: newParent ? [newParent] : [],
        author: {
          name: 'Plotline',
          email: 'auto@plotline.local',
          timestamp: nowSec,
          timezoneOffset: 0,
        },
        committer: {
          name: 'Plotline',
          email: 'auto@plotline.local',
          timestamp: nowSec,
          timezoneOffset: 0,
        },
      },
    });

    // ── 7. Advance the ref ────────────────────────────────────────────────
    await git.writeRef({
      fs: this.backend,
      dir: this.dir,
      ref,
      value: commitOid,
      force: true,
    });

    return commitOid;
  }

  // ── createRef / renameRef ─────────────────────────────────────────────────

  /**
   * Create a new ref pointing at the given commit SHA.
   */
  async createRef(newRef: string, atCommit: string): Promise<void> {
    return this.enqueue(async () => {
      await git.writeRef({
        fs: this.backend,
        dir: this.dir,
        ref: newRef,
        value: atCommit,
      });
    });
  }

  /**
   * Rename a ref: resolve the old ref's value, write the new ref, then delete
   * the old ref.
   */
  async renameRef(oldRef: string, newRef: string): Promise<void> {
    return this.enqueue(async () => {
      const value = await git.resolveRef({
        fs: this.backend,
        dir: this.dir,
        ref: oldRef,
      });

      await git.writeRef({
        fs: this.backend,
        dir: this.dir,
        ref: newRef,
        value,
      });

      await git.deleteRef({
        fs: this.backend,
        dir: this.dir,
        ref: oldRef,
      });
    });
  }

  // ── Tree builder (shared between commit and external building) ────────────

  /**
   * Recursively build tree objects from a flat `path → blobOid` map.
   *
   * Each call groups entries by their first path segment; files with no
   * leading directory become direct tree entries, and files with a directory
   * prefix get collected into a subtree which is built recursively.
   */
  private async buildTreeFromFlat(
    entries: Record<string, string>,
  ): Promise<string> {
    const dirs = new Map<string, Record<string, string>>();
    const blobs: Array<{ path: string; oid: string }> = [];

    for (const [filepath, oid] of Object.entries(entries)) {
      const slashIdx = filepath.indexOf('/');
      if (slashIdx === -1) {
        blobs.push({ path: filepath, oid });
      } else {
        const dirName = filepath.slice(0, slashIdx);
        const subPath = filepath.slice(slashIdx + 1);
        if (!dirs.has(dirName)) dirs.set(dirName, {});
        dirs.get(dirName)![subPath] = oid;
      }
    }

    const tree: Array<{
      mode: string;
      path: string;
      oid: string;
      type: 'blob' | 'tree';
    }> = [];

    for (const { path: p, oid } of blobs) {
      tree.push({ mode: '100644', path: p, oid, type: 'blob' });
    }

    for (const [dirName, subFiles] of dirs) {
      const subTreeOid = await this.buildTreeFromFlat(subFiles);
      tree.push({
        mode: '040000',
        path: dirName,
        oid: subTreeOid,
        type: 'tree',
      });
    }

    return git.writeTree({ fs: this.backend, dir: this.dir, tree });
  }
}
