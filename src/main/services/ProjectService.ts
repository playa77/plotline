/**
 * ProjectService — project lifecycle management.
 *
 * Owns project creation, opening, listing, and closing, with Git-backed
 * manifests and ephemeral UI state. Each project is a single Git repo
 * under `projectsDir/<projectId>/` with `project.json` on `refs/heads/main`.
 * Ephemeral UI state lives in `ui-state.json` alongside the repo on disk
 * but is never committed to Git.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import fs from 'node:fs';
import path from 'node:path';
import git from 'isomorphic-git';
import { StorageService } from '../storage/StorageService';
import { ProjectSchema, type Project, type ChapterEntry } from '../../shared/schemas/project';
import type { ParsePreview, Outline, OutlineMutation } from '../../shared/schemas/outline';
import { parseOutlineMarkdown } from './outlineImporter';
import { generateULID } from '../../shared/utils/ulid';
import type { FsClient } from 'isomorphic-git';

// ── Exported types ──────────────────────────────────────────────────────────

/** Summary returned by `list()`, suitable for a project picker UI. */
export interface ProjectSummary {
  projectId: string;
  title: string;
  updatedAt: string;
  chapterCount: number;
}

/**
 * Ephemeral per-project UI state stored on disk outside the Git tree.
 * Explicitly allowed to be lost — never the sole copy of anything important.
 */
export interface UiState {
  leftPanelWidth?: number;
  rightPanelWidth?: number;
  lastOpenArtifact?: { chapterId: string; stage: string };
  collapsedSections?: string[];
}

// ── ProjectService ─────────────────────────────────────────────────────────

export class ProjectService {
  private readonly projectsDir: string;
  private readonly openProjects = new Map<string, StorageService>();
  private currentProject: { id: string; service: StorageService } | null = null;

  /**
   * @param appDataDir - The Electron `app.getPath('userData')` directory.
   *                     Project repos are created under `<appDataDir>/projects/`.
   */
  constructor(appDataDir: string) {
    this.projectsDir = path.join(appDataDir, 'projects');
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Create a new book project.
   *
   * 1. Generate a ULID for the project ID.
   * 2. Create `<projectsDir>/<projectId>/` and `git init`.
   * 3. Write the initial manifest as `project.json` on `refs/heads/main`.
   * 4. Register the project as open.
   *
   * @returns The parsed manifest.
   */
  async create(title: string): Promise<Project> {
    const projectId = generateULID();
    const dir = this.projectDir(projectId);

    await fs.promises.mkdir(dir, { recursive: true });
    await git.init({ fs: fs as unknown as FsClient, dir });

    const service = new StorageService(dir);
    const now = new Date().toISOString();

    const project: Project = {
      schemaVersion: 1,
      projectId,
      title,
      createdAt: now,
      updatedAt: now,
      settings: {
        continuityContext: { enabled: true, words: 500 },
        models: {
          expand: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-20250514' },
          write: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-20250514' },
          iterate: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-20250514' },
        },
        inference: { baseUrl: 'https://openrouter.ai/api/v1' },
      },
      structure: [],
    };

    const manifestJson = Buffer.from(JSON.stringify(project, null, 2), 'utf-8');
    await service.commit('refs/heads/main', {
      'project.json': manifestJson,
    }, {
      label: 'Initial project manifest',
      kind: 'manual',
    });

    this.openProjects.set(projectId, service);
    this.currentProject = { id: projectId, service };

    return project;
  }

  /**
   * Open an existing project by reading and validating its manifest.
   *
   * 1. Verify the project directory exists.
   * 2. Construct a StorageService for the existing repo.
   * 3. Read `project.json` from `refs/heads/main`, parse and validate.
   * 4. Run the reconciliation pass (TS §5.5):
   *    - Validate each chapter's `selectedVersion` exists among its versions.
   *    - Adopt orphan chapter refs (refs exist but no manifest entry).
   * 5. Register the project as open.
   *
   * @returns The (possibly reconciled) manifest.
   * @throws If the project directory doesn't exist or the manifest is corrupted.
   */
  async open(projectId: string): Promise<Project> {
    const dir = this.projectDir(projectId);

    // Verify directory exists and is a git repo
    try {
      await fs.promises.access(path.join(dir, '.git'));
    } catch {
      throw new Error(`Project not found: ${projectId}`);
    }

    const service = new StorageService(dir);

    // Read and validate manifest
    let project: Project;
    try {
      const blob = await service.readBlob('refs/heads/main', 'project.json');
      const raw = blob.toString('utf-8');
      const parsed = ProjectSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        const details = parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        throw new Error(`Corrupted manifest: ${details}`);
      }
      project = parsed.data;
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error('Corrupted manifest: invalid JSON');
      }
      throw err;
    }

    // Run reconciliation pass
    project = await this.reconcileManifest(project, service);

    this.openProjects.set(projectId, service);
    this.currentProject = { id: projectId, service };

    return project;
  }

  /**
   * Close a project.
   *
   * Removes the project from the open-projects map. If `projectId` is
   * omitted, closes the current project.
   *
   * No Git operations are performed — the repo is left untouched.
   * The StorageService instance is discarded (no explicit teardown needed).
   */
  async close(projectId?: string): Promise<void> {
    const id = projectId ?? this.currentProject?.id;
    if (!id) return;

    this.openProjects.delete(id);
    if (this.currentProject?.id === id) {
      this.currentProject = null;
    }
  }

  /**
   * List all projects in the projects directory.
   *
   * Scans subdirectories, checks for a `.git` directory, reads the manifest
   * from each valid repo, and returns basic summaries. Dirs that aren't Git
   * repos or whose manifests can't be read are silently skipped.
   */
  async list(): Promise<ProjectSummary[]> {
    const summaries: ProjectSummary[] = [];

    let entries: string[];
    try {
      const files = await fs.promises.readdir(this.projectsDir, { withFileTypes: true });
      entries = files.filter((f) => f.isDirectory()).map((f) => f.name);
    } catch {
      // Directory doesn't exist yet — no projects
      return [];
    }

    for (const name of entries) {
      const dir = path.join(this.projectsDir, name);

      // Quick check: does .git exist?
      try {
        await fs.promises.access(path.join(dir, '.git'));
      } catch {
        continue; // Not a git repo, skip
      }

      try {
        const svc = new StorageService(dir);
        const blob = await svc.readBlob('refs/heads/main', 'project.json');
        const raw = blob.toString('utf-8');
        const parsed = JSON.parse(raw);

        const structure = parsed.structure ?? [];
        summaries.push({
          projectId: parsed.projectId ?? name,
          title: parsed.title ?? 'Untitled',
          updatedAt: parsed.updatedAt ?? new Date().toISOString(),
          chapterCount: countChapters(structure),
        });
      } catch {
        // Can't read manifest — skip silently
        continue;
      }
    }

    return summaries;
  }

  // ── UI State (ephemeral, never committed to Git) ──────────────────────────

  /**
   * Read the ephemeral UI state for a project.
   * Returns an empty object if no state file exists.
   */
  async readUiState(projectId: string): Promise<UiState> {
    const uiPath = this.uiStatePath(projectId);
    try {
      const raw = await fs.promises.readFile(uiPath, 'utf-8');
      return JSON.parse(raw) as UiState;
    } catch {
      return {};
    }
  }

  /**
   * Write the ephemeral UI state for a project.
   * The file is written directly to disk, never through Git.
   */
  async writeUiState(projectId: string, state: UiState): Promise<void> {
    const uiPath = this.uiStatePath(projectId);
    await fs.promises.writeFile(uiPath, JSON.stringify(state, null, 2), 'utf-8');
  }

  // ── Outline import ───────────────────────────────────────────────────────

  /**
   * Parse a markdown outline and return a preview without writing anything.
   *
   * Verifies the project is open, then delegates to the pure parser function.
   * This is a read-only operation — no Git state is modified.
   *
   * @throws If the project is not open.
   */
  async importOutlinePreview(projectId: string, markdown: string): Promise<ParsePreview> {
    if (!this.openProjects.has(projectId)) {
      throw new Error(`Project not open: ${projectId}`);
    }
    return parseOutlineMarkdown(markdown);
  }

  /**
   * Confirm an outline import: write `outline.json` and update `project.json`
   * structure, then commit both to `refs/heads/main`.
   *
   * @throws If the project is not open.
   */
  async confirmImportOutline(projectId: string, preview: ParsePreview): Promise<void> {
    const service = this.openProjects.get(projectId);
    if (!service) {
      throw new Error(`Project not open: ${projectId}`);
    }

    // 1. Read current manifest
    const raw = await service.readBlob('refs/heads/main', 'project.json');
    const manifest = ProjectSchema.parse(JSON.parse(raw.toString('utf-8')));

    // 2. Update manifest
    manifest.structure = preview.structure;
    manifest.updatedAt = new Date().toISOString();

    // 3. Commit both files
    const outlineJson = Buffer.from(JSON.stringify(preview.outline, null, 2), 'utf-8');
    const manifestJson = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');

    await service.commit('refs/heads/main', {
      'outline/outline.json': outlineJson,
      'project.json': manifestJson,
    }, {
      label: 'Imported book outline',
      kind: 'manual',
    });
  }

  // ── Outline read / mutate ─────────────────────────────────────────────

  /**
   * Read the current outline from `outline/outline.json` on `refs/heads/main`.
   *
   * @throws If the project is not open.
   * @throws If no outline has been committed yet.
   */
  async outlineGet(projectId: string): Promise<Outline> {
    const service = this.openProjects.get(projectId);
    if (!service) {
      throw new Error(`Project not open: ${projectId}`);
    }

    const raw = await service.readBlob('refs/heads/main', 'outline/outline.json');
    const parsed = JSON.parse(raw.toString('utf-8'));

    // Import OutlineSchema lazily to avoid circular dependencies at module level
    const { OutlineSchema } = await import('../../shared/schemas/outline');
    return OutlineSchema.parse(parsed);
  }

  /**
   * Apply one or more mutations to the outline and commit the result.
   *
   * 1. Read the current `outline/outline.json`.
   * 2. Apply each mutation in order (immutable-style).
   * 3. Validate the resulting outline.
   * 4. Commit the updated `outline/outline.json` to `refs/heads/main`.
   * 5. Return the updated Outline.
   *
   * @throws If the project is not open or validation fails.
   */
  async outlineMutate(projectId: string, mutations: OutlineMutation[]): Promise<Outline> {
    if (mutations.length === 0) {
      throw new Error('At least one mutation is required');
    }

    const service = this.openProjects.get(projectId);
    if (!service) {
      throw new Error(`Project not open: ${projectId}`);
    }

    // 1. Read current outline
    const raw = await service.readBlob('refs/heads/main', 'outline/outline.json');
    const current = JSON.parse(raw.toString('utf-8'));

    // 2. Apply mutations in order
    let outline = current as Outline;
    for (const mutation of mutations) {
      outline = applyMutation(outline, mutation);
    }

    // 3. Validate the result
    const { OutlineSchema } = await import('../../shared/schemas/outline');
    const validated = OutlineSchema.parse(outline);

    // 4. Commit
    const outlineJson = Buffer.from(JSON.stringify(validated, null, 2), 'utf-8');
    await service.commit('refs/heads/main', {
      'outline/outline.json': outlineJson,
    }, {
      label: 'Outline mutated',
      kind: 'manual',
    });

    return validated;
  }

  // ── Getters for IPC handlers ──────────────────────────────────────────────

  /** Return the currently-active project, if any. */
  getCurrentProject(): { id: string; service: StorageService } | null {
    return this.currentProject;
  }

  /** Return the StorageService for an open project, or `undefined`. */
  getOpenProject(projectId: string): StorageService | undefined {
    return this.openProjects.get(projectId);
  }

  /** Expose the projects directory path (for debugging / tests). */
  getProjectsDir(): string {
    return this.projectsDir;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private projectDir(projectId: string): string {
    return path.join(this.projectsDir, projectId);
  }

  private uiStatePath(projectId: string): string {
    return path.join(this.projectsDir, projectId, 'ui-state.json');
  }

  /**
   * Startup reconciliation pass (TS §5.5).
   *
   * Validates manifest ↔ refs:
   *   - Every chapter's `selectedVersion` exists among its versions.
   *   - Orphan refs (refs exist but no manifest entry) are adopted as new
   *     chapter entries in the structure.
   *
   * Repairs are conservative: adopt orphan refs, never delete.
   * If no repairs were needed, no commit is made.
   *
   * @returns The (possibly repaired) manifest.
   */
  private async reconcileManifest(
    manifest: Project,
    service: StorageService,
  ): Promise<Project> {
    let changed = false;
    const chapters = listAllChapters(manifest.structure);
    const chapterRefs = await service.listRefs('refs/plotline/chapters');

    // 1. Validate selectedVersion for each manifest chapter
    for (const chapter of chapters) {
      if (chapter.versions.length > 0) {
        const versionExists = chapter.versions.some(
          (v) => v.slug === chapter.selectedVersion,
        );
        if (!versionExists) {
          // Reset to the first version, or 'main' as a fallback
          chapter.selectedVersion = chapter.versions[0]?.slug ?? 'main';
          changed = true;
        }
      }
    }

    // 2. Adopt orphan refs into the manifest
    const manifestChapterIds = new Set(chapters.map((c) => c.id));
    const now = new Date().toISOString();

    for (const ref of chapterRefs) {
      // Format: refs/plotline/chapters/<chapterId>/<versionSlug>
      const parts = ref.split('/');
      if (parts.length < 5) continue;

      const chapterId = parts[3]!;
      const versionSlug = parts[4]!;

      if (!manifestChapterIds.has(chapterId)) {
        // Orphan ref — adopt into structure as a top-level chapter
        manifest.structure.push({
          kind: 'chapter',
          id: chapterId,
          title: `Chapter ${chapters.length + 1}`,
          selectedVersion: versionSlug,
          versions: [
            {
              slug: versionSlug,
              name: versionSlug,
              createdAt: now,
              createdFrom: null,
              archived: false,
            },
          ],
          wordTarget: null,
        });

        // Track it so subsequent refs for the same chapter ID are skipped
        chapters.push({
          id: chapterId,
          title: '',
          selectedVersion: versionSlug,
          versions: [],
          wordTarget: null,
        });
        manifestChapterIds.add(chapterId);
        changed = true;
      }
    }

    // Only commit if reconciliation made changes
    if (changed) {
      manifest.updatedAt = now;
      const updatedJson = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
      await service.commit('refs/heads/main', {
        'project.json': updatedJson,
      }, {
        label: 'Reconcile manifest',
        kind: 'manual',
      });
    }

    return manifest;
  }
}

// ── Module-level helpers ────────────────────────────────────────────────────

/** Collect every chapter entry from the structure (including those nested in parts). */
function listAllChapters(structure: Project['structure']): ChapterEntry[] {
  const chapters: ChapterEntry[] = [];
  for (const item of structure) {
    if (item.kind === 'chapter') {
      chapters.push(item);
    } else if (item.kind === 'part') {
      chapters.push(...item.chapters);
    }
  }
  return chapters;
}

/** Count total chapters in a structure (parts + top-level). */
function countChapters(structure: Project['structure']): number {
  let count = 0;
  for (const item of structure) {
    if (item.kind === 'chapter') {
      count++;
    } else if (item.kind === 'part') {
      count += item.chapters.length;
    }
  }
  return count;
}

// ── Outline mutation applicator ───────────────────────────────────────────────

/**
 * Apply a single OutlineMutation to an Outline, returning a new Outline object.
 *
 * This is a pure function — the original `outline` is never mutated.
 * Shallow copies are made at each level to preserve immutability.
 */
function applyMutation(outline: import('../../shared/schemas/outline').Outline, m: import('../../shared/schemas/outline').OutlineMutation): import('../../shared/schemas/outline').Outline {
  switch (m.kind) {
    // ── Rename ──────────────────────────────────────────────────────────
    case 'renamePart': {
      return {
        ...outline,
        parts: outline.parts.map(p =>
          p.id === m.partId ? { ...p, title: m.title } : p,
        ),
      };
    }

    case 'renameChapter': {
      return {
        ...outline,
        parts: outline.parts.map(part => ({
          ...part,
          chapters: part.chapters.map(ch =>
            ch.chapterId === m.chapterId ? { ...ch, title: m.title } : ch,
          ),
        })),
      };
    }

    case 'renameSection': {
      return {
        ...outline,
        parts: outline.parts.map(part => ({
          ...part,
          chapters: part.chapters.map(ch => ({
            ...ch,
            sections: ch.sections.map(s =>
              s.id === m.sectionId ? { ...s, title: m.title } : s,
            ),
          })),
        })),
      };
    }

    // ── Reorder ─────────────────────────────────────────────────────────
    case 'reorderPart': {
      const parts = [...outline.parts];
      const idx = parts.findIndex(p => p.id === m.partId);
      if (idx === -1) return outline;
      const [part] = parts.splice(idx, 1);
      parts.splice(m.newIndex, 0, part!);
      return { ...outline, parts };
    }

    case 'reorderChapter': {
      // Find the part that currently contains this chapter
      const sourcePartIdx = outline.parts.findIndex(part =>
        part.chapters.some(ch => ch.chapterId === m.chapterId),
      );
      if (sourcePartIdx === -1) return outline;

      const sourcePart = outline.parts[sourcePartIdx]!;
      const chapterIdx = sourcePart.chapters.findIndex(
        ch => ch.chapterId === m.chapterId,
      );
      if (chapterIdx === -1) return outline;

      const chapter = sourcePart.chapters[chapterIdx]!;

      // Determine target part
      let targetPartIdx: number;
      if (m.targetPartId !== null) {
        targetPartIdx = outline.parts.findIndex(p => p.id === m.targetPartId);
        if (targetPartIdx === -1) targetPartIdx = sourcePartIdx;
      } else {
        targetPartIdx = sourcePartIdx;
      }

      // Build new parts array
      const newParts = outline.parts.map(part => ({ ...part, chapters: [...part.chapters] }));

      // Remove from source
      newParts[sourcePartIdx] = {
        ...newParts[sourcePartIdx]!,
        chapters: newParts[sourcePartIdx]!.chapters.filter(
          ch => ch.chapterId !== m.chapterId,
        ),
      };

      // Insert into target
      const targetPart = newParts[targetPartIdx]!;
      const insertAt = Math.min(m.newIndex, targetPart.chapters.length);
      targetPart.chapters.splice(insertAt, 0, chapter);

      return { ...outline, parts: newParts };
    }

    case 'reorderSection': {
      return {
        ...outline,
        parts: outline.parts.map(part => ({
          ...part,
          chapters: part.chapters.map(ch => {
            if (ch.chapterId !== m.chapterId) return ch;
            const sections = [...ch.sections];
            const idx = sections.findIndex(s => s.id === m.sectionId);
            if (idx === -1) return ch;
            const [section] = sections.splice(idx, 1);
            sections.splice(m.newIndex, 0, section!);
            return { ...ch, sections };
          }),
        })),
      };
    }

    // ── Delete ──────────────────────────────────────────────────────────
    case 'deletePart': {
      return {
        ...outline,
        parts: outline.parts.filter(p => p.id !== m.partId),
      };
    }

    case 'deleteChapter': {
      return {
        ...outline,
        parts: outline.parts.map(part => ({
          ...part,
          chapters: part.chapters.filter(ch => ch.chapterId !== m.chapterId),
        })),
      };
    }

    case 'deleteSection': {
      return {
        ...outline,
        parts: outline.parts.map(part => ({
          ...part,
          chapters: part.chapters.map(ch => ({
            ...ch,
            sections: ch.sections.filter(s => s.id !== m.sectionId),
          })),
        })),
      };
    }

    // ── Add ─────────────────────────────────────────────────────────────
    case 'addPart': {
      return {
        ...outline,
        parts: [...outline.parts, { ...m.part, chapters: [] }],
      };
    }

    case 'addChapter': {
      const newChapter = {
        chapterId: m.chapter.chapterId,
        title: m.chapter.title,
        wordTarget: m.chapter.wordTarget,
        sections: [],
      };

      if (m.partId === null) {
        // No target part specified — append to the first part or create one
        if (outline.parts.length === 0) {
          return {
            ...outline,
            parts: [{
              id: 'part_auto',
              title: 'Main Content',
              chapters: [newChapter],
            }],
          };
        }
        return {
          ...outline,
          parts: outline.parts.map((part, idx) =>
            idx === 0
              ? { ...part, chapters: [...part.chapters, newChapter] }
              : part,
          ),
        };
      }

      return {
        ...outline,
        parts: outline.parts.map(part =>
          part.id === m.partId
            ? { ...part, chapters: [...part.chapters, newChapter] }
            : part,
        ),
      };
    }

    case 'addSection': {
      const newSection = {
        id: m.section.id,
        number: m.section.number,
        title: m.section.title,
        wordTarget: m.section.wordTarget,
        beats: m.section.beats,
      };

      return {
        ...outline,
        parts: outline.parts.map(part => ({
          ...part,
          chapters: part.chapters.map(ch =>
            ch.chapterId === m.chapterId
              ? { ...ch, sections: [...ch.sections, newSection] }
              : ch,
          ),
        })),
      };
    }

    // ── Beats ───────────────────────────────────────────────────────────
    case 'updateBeat': {
      return {
        ...outline,
        parts: outline.parts.map(part => ({
          ...part,
          chapters: part.chapters.map(ch => ({
            ...ch,
            sections: ch.sections.map(s => {
              if (s.id !== m.sectionId) return s;
              const beats = [...s.beats];
              if (m.beatIndex >= 0 && m.beatIndex < beats.length) {
                beats[m.beatIndex] = m.newText;
              }
              return { ...s, beats };
            }),
          })),
        })),
      };
    }

    case 'addBeat': {
      return {
        ...outline,
        parts: outline.parts.map(part => ({
          ...part,
          chapters: part.chapters.map(ch => ({
            ...ch,
            sections: ch.sections.map(s => {
              if (s.id !== m.sectionId) return s;
              const beats = [...s.beats];
              if (m.atIndex !== undefined && m.atIndex >= 0 && m.atIndex <= beats.length) {
                beats.splice(m.atIndex, 0, m.text);
              } else {
                beats.push(m.text);
              }
              return { ...s, beats };
            }),
          })),
        })),
      };
    }

    case 'removeBeat': {
      return {
        ...outline,
        parts: outline.parts.map(part => ({
          ...part,
          chapters: part.chapters.map(ch => ({
            ...ch,
            sections: ch.sections.map(s => {
              if (s.id !== m.sectionId) return s;
              return {
                ...s,
                beats: s.beats.filter((_, i) => i !== m.beatIndex),
              };
            }),
          })),
        })),
      };
    }
  }
}
