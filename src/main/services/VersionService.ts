/**
 * VersionService — chapter version CRUD lifecycle.
 *
 * Manages chapter versions as Git refs under
 *   refs/plotline/chapters/<chapterId>/<versionSlug>   (active versions)
 *   refs/plotline/archived/<chapterId>/<versionSlug>    (archived versions)
 *
 * Every durable operation flows through StorageService — there is no
 * direct filesystem access or working tree manipulation.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { StorageService } from '../storage/StorageService';
import type { ProjectService } from './ProjectService';
import { ProjectSchema } from '../../shared/schemas/project';
import type { Project, ChapterEntry } from '../../shared/schemas/project';
import { versionSlug } from '../../shared/utils/slug';

// ── Response types ───────────────────────────────────────────────────────────

export interface VersionInfo {
  slug: string;
  name: string;
  selected: boolean;
  createdAt: string;
  commitCount: number;
  hasExpanded: boolean;
  hasChapter: boolean;
}

// ── VersionService ───────────────────────────────────────────────────────────

export class VersionService {
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

  /**
   * Read and parse the project manifest from `refs/heads/main`.
   */
  private async readManifest(service: StorageService): Promise<Project> {
    const raw = await service.readBlob('refs/heads/main', 'project.json');
    return ProjectSchema.parse(JSON.parse(raw.toString('utf-8')));
  }

  /**
   * Commit an updated project manifest to `refs/heads/main`.
   */
  private async commitManifest(
    service: StorageService,
    manifest: Project,
    label?: string,
  ): Promise<void> {
    manifest.updatedAt = new Date().toISOString();
    const json = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
    await service.commit(
      'refs/heads/main',
      { 'project.json': json },
      { label: label ?? 'Update version metadata', kind: 'manual' },
    );
  }

  // ── listVersions ─────────────────────────────────────────────────────────

  /**
   * List all active versions for a chapter.
   *
   * Discovers versions by enumerating refs under the chapter's namespace,
   * then enriches each entry with metadata from the project manifest and
   * file-presence flags from the version's Git tree.
   *
   * @param projectId - Open project ID.
   * @param chapterId - Chapter ID whose versions to list.
   */
  async listVersions(projectId: string, chapterId: string): Promise<{ versions: VersionInfo[] }> {
    const service = this.getService(projectId);

    // 1. Find all version refs for this chapter
    const refs = await service.listRefs(`refs/plotline/chapters/${chapterId}/`);

    if (refs.length === 0) {
      return { versions: [] };
    }

    // 2. Read manifest for metadata (names, selectedVersion)
    let manifest: Project | null = null;
    let chapterEntry: ChapterEntry | undefined = undefined;
    try {
      manifest = await this.readManifest(service);
      chapterEntry = findChapterInManifest(manifest, chapterId);
    } catch {
      // If manifest can't be read, we still return version info but without names
    }

    const selectedVersion = chapterEntry?.selectedVersion ?? 'main';

    // 3. Build version info for each ref
    const versions: VersionInfo[] = [];

    for (const ref of refs) {
      const parts = ref.split('/');
      const slug = parts[parts.length - 1]!;

      // Look up manifest metadata
      const versionMeta = chapterEntry?.versions?.find((v) => v.slug === slug);

      // Get commit info — oldest commit's timestamp = createdAt, length = commitCount
      let commitCount = 0;
      let createdAt = '';
      try {
        const commits = await service.log(ref, 1000);
        commitCount = commits.length;
        if (commitCount > 0) {
          // log returns newest-first; the last entry is the oldest
          createdAt = commits[commits.length - 1]!.timestamp;
        }
      } catch {
        // Ref has no reachable commits (shouldn't happen for a valid ref)
      }

      // Check tree for artifact files
      let hasExpanded = false;
      let hasChapter = false;
      try {
        const tree = await service.readTree(ref);
        hasExpanded = 'expanded-outline.html' in tree;
        hasChapter = 'chapter.html' in tree;
      } catch {
        // Tree can't be read (ref exists but is empty? edge case)
      }

      versions.push({
        slug,
        name: versionMeta?.name ?? slug,
        selected: slug === selectedVersion,
        createdAt: versionMeta?.createdAt ?? createdAt,
        commitCount,
        hasExpanded,
        hasChapter,
      });
    }

    return { versions };
  }

  // ── createVersion ─────────────────────────────────────────────────────────

  /**
   * Create a new version for a chapter.
   *
   * The new version is created as a Git ref pointing at the same commit as
   * the source version (so they share history). If no source version is
   * specified or the source ref does not exist, an initial empty commit
   * is created.
   *
   * The manifest is also updated with the new version entry.
   *
   * @throws If the project is not open.
   */
  async createVersion(
    projectId: string,
    chapterId: string,
    name: string,
    fromVersion?: string,
  ): Promise<{ slug: string; name: string }> {
    const service = this.getService(projectId);

    // Collect existing slugs to ensure uniqueness
    const existingRefs = await service.listRefs(`refs/plotline/chapters/${chapterId}/`);
    const existingSlugs = existingRefs.map((r) => r.split('/').pop()!);
    const slug = versionSlug(name, existingSlugs);

    const newRef = `refs/plotline/chapters/${chapterId}/${slug}`;
    const sourceRef = `refs/plotline/chapters/${chapterId}/${fromVersion ?? 'main'}`;

    // Verify the source ref exists and get its commit SHA
    let sourceSha: string | undefined;
    try {
      const commits = await service.log(sourceRef, 1);
      sourceSha = commits[0]?.sha;
    } catch {
      // Source ref doesn't exist — will create as initial empty commit
      sourceSha = undefined;
    }

    if (sourceSha) {
      // Branch from the source version
      await service.createRef(newRef, sourceSha);
    } else {
      // Create an initial empty commit on the new ref
      await service.commit(
        newRef,
        {},
        { label: `Created version: ${name}`, kind: 'manual' },
      );
    }

    // Update manifest
    try {
      const manifest = await this.readManifest(service);
      const chapterEntry = findChapterInManifest(manifest, chapterId);
      if (chapterEntry) {
        chapterEntry.versions.push({
          slug,
          name,
          createdAt: new Date().toISOString(),
          createdFrom: sourceSha ? { ref: sourceRef, commit: sourceSha } : null,
          archived: false,
        });
        await this.commitManifest(service, manifest, `Create version: ${name}`);
      }
    } catch {
      // Manifest update is best-effort — the ref has been created regardless
    }

    return { slug, name };
  }

  // ── selectVersion ─────────────────────────────────────────────────────────

  /**
   * Select a version as the active one for a chapter.
   *
   * Updates the chapter's `selectedVersion` field in the project manifest.
   * Verifies the version ref exists before updating.
   *
   * @throws If the project is not open, chapter not found, or version ref missing.
   */
  async selectVersion(
    projectId: string,
    chapterId: string,
    slug: string,
  ): Promise<{ ok: true }> {
    const service = this.getService(projectId);

    // Verify the version ref exists
    const ref = `refs/plotline/chapters/${chapterId}/${slug}`;
    try {
      await service.readTree(ref);
    } catch {
      throw new Error(`Version ref not found: ${ref}`);
    }

    // Read manifest
    const manifest = await this.readManifest(service);
    const chapterEntry = findChapterInManifest(manifest, chapterId);
    if (!chapterEntry) {
      throw new Error(`Chapter not found in manifest: ${chapterId}`);
    }

    // Verify the version exists in the manifest's version list
    const versionExists = chapterEntry.versions.some((v) => v.slug === slug);
    if (!versionExists) {
      // Add it if missing (adopt orphan)
      chapterEntry.versions.push({
        slug,
        name: slug,
        createdAt: new Date().toISOString(),
        createdFrom: null,
        archived: false,
      });
    }

    chapterEntry.selectedVersion = slug;
    await this.commitManifest(service, manifest, `Select version: ${slug}`);

    return { ok: true };
  }

  // ── renameVersion ─────────────────────────────────────────────────────────

  /**
   * Rename a version (both the ref and the manifest entry).
   *
   * The ref is renamed in Git via `renameRef`. If the renamed version was
   * the selected version, the manifest's `selectedVersion` is updated too.
   *
   * @throws If the new name's slug collides with an existing version.
   */
  async renameVersion(
    projectId: string,
    chapterId: string,
    slug: string,
    newName: string,
  ): Promise<{ slug: string; name: string }> {
    const service = this.getService(projectId);

    // Gather existing slugs (excluding the current one) for collision check
    const existingRefs = await service.listRefs(`refs/plotline/chapters/${chapterId}/`);
    const existingSlugs = existingRefs
      .map((r) => r.split('/').pop()!)
      .filter((s) => s !== slug);

    // Generate the new slug, handling collisions by appending a suffix
    const newSlug = versionSlug(newName, existingSlugs);

    // Check that the new slug doesn't collide with existing refs
    if (existingSlugs.includes(newSlug)) {
      throw new Error(`A version named "${newName}" already exists`);
    }

    const oldRef = `refs/plotline/chapters/${chapterId}/${slug}`;
    const newRef = `refs/plotline/chapters/${chapterId}/${newSlug}`;

    // Rename the Git ref
    try {
      await service.renameRef(oldRef, newRef);
    } catch {
      throw new Error(`Version ref not found: ${oldRef}`);
    }

    // Update manifest
    try {
      const manifest = await this.readManifest(service);
      const chapterEntry = findChapterInManifest(manifest, chapterId);
      if (chapterEntry) {
        const versionEntry = chapterEntry.versions.find((v) => v.slug === slug);
        if (versionEntry) {
          versionEntry.slug = newSlug;
          versionEntry.name = newName;
        }

        // If this was the selected version, update the selection
        if (chapterEntry.selectedVersion === slug) {
          chapterEntry.selectedVersion = newSlug;
        }

        await this.commitManifest(service, manifest, `Rename version: ${slug} → ${newSlug}`);
      }
    } catch {
      // Manifest update is best-effort — the ref has been renamed regardless
    }

    return { slug: newSlug, name: newName };
  }

  // ── archiveVersion ─────────────────────────────────────────────────────────

  /**
   * Archive a version by moving its ref from the active to the archived
   * namespace and marking it in the manifest.
   *
   * Constraints:
   *   - The 'main' version cannot be archived.
   *   - The selected version cannot be archived.
   *   - At least one active version must remain after archiving.
   *
   * @throws If any constraint is violated or the ref does not exist.
   */
  async archiveVersion(
    projectId: string,
    chapterId: string,
    slug: string,
  ): Promise<{ ok: true }> {
    const service = this.getService(projectId);

    // Read manifest for validation
    const manifest = await this.readManifest(service);
    const chapterEntry = findChapterInManifest(manifest, chapterId);
    if (!chapterEntry) {
      throw new Error(`Chapter not found in manifest: ${chapterId}`);
    }

    // Cannot archive 'main'
    if (slug === 'main') {
      throw new Error('Cannot archive the main version');
    }

    // Cannot archive the selected version
    if (slug === chapterEntry.selectedVersion) {
      throw new Error('Cannot archive the currently selected version');
    }

    // Must have at least one active version remaining
    const activeVersionCount = chapterEntry.versions.filter(
      (v) => !v.archived && v.slug !== slug,
    ).length;
    if (activeVersionCount < 1) {
      throw new Error('Cannot archive the last remaining version');
    }

    // Move ref from active to archived namespace
    const activeRef = `refs/plotline/chapters/${chapterId}/${slug}`;
    const archivedRef = `refs/plotline/archived/${chapterId}/${slug}`;

    try {
      await service.renameRef(activeRef, archivedRef);
    } catch {
      throw new Error(`Version ref not found: ${activeRef}`);
    }

    // Update manifest
    const versionEntry = chapterEntry.versions.find((v) => v.slug === slug);
    if (versionEntry) {
      versionEntry.archived = true;
    }
    await this.commitManifest(service, manifest, `Archive version: ${slug}`);

    return { ok: true };
  }
}

// ── Module-level helper ──────────────────────────────────────────────────────

/**
 * Find a chapter entry within the project manifest structure by its ID.
 *
 * Searches both top-level chapter items and chapters nested inside parts.
 *
 * @returns The matching chapter entry, or `undefined` if not found.
 */
function findChapterInManifest(
  manifest: Project,
  chapterId: string,
): ChapterEntry | undefined {
  for (const item of manifest.structure) {
    if (item.kind === 'chapter' && item.id === chapterId) {
      return item as ChapterEntry;
    }
    if (item.kind === 'part') {
      const found = item.chapters.find((c) => c.id === chapterId);
      if (found) return found;
    }
  }
  return undefined;
}
