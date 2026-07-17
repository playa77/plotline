/**
 * HistoryService — revision history browsing, preview, and restore.
 *
 * Provides the backend for the history panel: listing commits on a ref,
 * previewing artifact HTML from any point in the log, and restoring a
 * previous tree as a new 'restore' commit on the same ref.
 *
 * Variable mutations (create, rename, reorder, delete, content change)
 * are recorded as Git commits via StorageService.commit() with descriptive
 * labels — no separate event recording method is needed. The commit
 * messages serve as the history log.
 *
 * Version: 0.2.0 | 2026-07-17
 */

import { StorageService } from '../storage/StorageService';
import type { ProjectService } from './ProjectService';

// ── History event types ──────────────────────────────────────────────────────

/** All history event kinds used in commit labels across the app. */
export type HistoryEventType =
  | 'manual'
  | 'restore'
  | 'expand'
  | 'write'
  | 'variable:created'
  | 'variable:renamed'
  | 'variable:reordered'
  | 'variable:deleted'
  | 'variable:content-changed';

// ── HistoryService ──────────────────────────────────────────────────────────

export class HistoryService {
  constructor(private projectService: ProjectService) {}

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Resolve the StorageService for an open project.
   * @throws If the project is not open.
   */
  private getService(projectId: string): StorageService {
    const service = this.projectService.getOpenProject(projectId);
    if (!service) throw new Error(`Project not open: ${projectId}`);
    return service;
  }

  // ── listHistory ───────────────────────────────────────────────────────────

  /**
   * List commits on a ref, newest first.
   *
   * Returns the commit SHA, label, kind, timestamp, and optional wordDelta
   * for each commit. When the ref does not exist, returns an empty array
   * (no error).
   *
   * @param projectId - Open project ID.
   * @param ref       - Git ref to show history for (e.g. `refs/plotline/chapters/ch_001/main`).
   * @param limit     - Maximum commits to return (default 20).
   * @param before    - Optional commit SHA for cursor-based pagination.
   *                    When provided, only commits *older* than the given
   *                    commit are returned.
   */
  async listHistory(
    projectId: string,
    ref: string,
    limit?: number,
    before?: string,
  ): Promise<{
    commits: Array<{
      sha: string;
      label: string;
      kind: string;
      timestamp: string;
      wordDelta?: number | null;
    }>;
  }> {
    const service = this.getService(projectId);

    try {
      const commits = await service.log(ref, limit ?? 20, before);
      return {
        commits: commits.map((c) => ({
          sha: c.sha,
          label: c.message.label,
          kind: c.message.kind,
          timestamp: c.timestamp,
          wordDelta: c.message.wordDelta ?? null,
        })),
      };
    } catch {
      // Ref doesn't exist (or other transient error) — return empty
      return { commits: [] };
    }
  }

  // ── preview ───────────────────────────────────────────────────────────────

  /**
   * Preview the artifacts at a specific commit.
   *
   * 1. Reads the commit message for `label` and `timestamp`.
   * 2. Reads the tree at the commit SHA.
   * 3. Finds the first HTML artifact (priority order):
   *    `expanded-outline.html` → `chapter.html` → any `.html` file → any `.json` file
   * 4. Returns the blob content as `html` along with metadata.
   *
   * @throws If the commit SHA cannot be resolved.
   */
  async preview(
    projectId: string,
    _ref: string,
    sha: string,
  ): Promise<{ html: string; label: string; timestamp: string }> {
    const service = this.getService(projectId);

    // 1. Get commit info (label + timestamp) using the SHA as ref
    let commitInfos: import('../storage/StorageService').CommitInfo[];
    try {
      commitInfos = await service.log(sha, 1);
    } catch {
      throw new Error(`Commit not found: ${sha}`);
    }

    if (commitInfos.length === 0) {
      throw new Error(`Commit not found: ${sha}`);
    }

    const info = commitInfos[0]!;
    const label = info.message.label;
    const timestamp = info.timestamp;

    // 2. Read the tree at this commit
    let tree: Record<string, string>;
    try {
      tree = await service.readTree(sha);
    } catch {
      throw new Error(`Cannot read tree for commit: ${sha}`);
    }

    // 3. Find the best preview file
    const previewFile = this.findPreviewFile(tree);

    if (!previewFile) {
      // No artifact to show — return empty html
      return { html: '', label, timestamp };
    }

    // 4. Read the blob content
    const buf = await service.readBlob(sha, previewFile);

    return {
      html: buf.toString('utf-8'),
      label,
      timestamp,
    };
  }

  /**
   * Find the best preview file from a flat tree map.
   *
   * Priority: expanded-outline.html > chapter.html > any .html > any .json
   */
  private findPreviewFile(tree: Record<string, string>): string | null {
    if ('expanded-outline.html' in tree) return 'expanded-outline.html';
    if ('chapter.html' in tree) return 'chapter.html';

    const htmlFile = Object.keys(tree).find((k) => k.endsWith('.html'));
    if (htmlFile) return htmlFile;

    const jsonFile = Object.keys(tree).find((k) => k.endsWith('.json'));
    if (jsonFile) return jsonFile;

    return null;
  }

  // ── restore ───────────────────────────────────────────────────────────────

  /**
   * Restore a previous commit's tree as a new commit on the same ref.
   *
   * 1. Reads the full tree at the source commit `sha`.
   * 2. Reads every blob from that tree.
   * 3. Creates a new commit on `ref` with the identical tree, labelled
   *    as kind 'restore'.
   *
   * The result is a new commit SHA — the original tree is preserved
   * under a new parent, proving TS §2.3 "restore from history" semantics.
   *
   * @throws If `ref` does not exist (nothing to restore onto).
   * @throws If `sha` cannot be resolved.
   */
  async restore(
    projectId: string,
    ref: string,
    sha: string,
  ): Promise<{ sha: string }> {
    const service = this.getService(projectId);

    // 1. Verify the target ref exists
    try {
      await service.readTree(ref);
    } catch {
      throw new Error(`Ref not found: ${ref}`);
    }

    // 2. Read the tree at the old commit
    let oldTree: Record<string, string>;
    try {
      oldTree = await service.readTree(sha);
    } catch {
      throw new Error(`Commit not found: ${sha}`);
    }

    // 3. Read every blob from the old commit
    const files: Record<string, Buffer> = {};
    for (const filepath of Object.keys(oldTree)) {
      const buf = await service.readBlob(sha, filepath);
      files[filepath] = buf;
    }

    // 4. Create a new commit with the same tree
    const newSha = await service.commit(
      ref,
      files,
      {
        label: 'Restored from history',
        kind: 'restore',
      },
    );

    return { sha: newSha };
  }
}
