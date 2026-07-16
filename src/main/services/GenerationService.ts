/**
 * GenerationService — manages generation jobs (expand, write, iterate).
 *
 * Orchestrates prompt assembly, streaming inference via InferenceClient,
 * content sanitization, and optional Git commit of results to chapter refs.
 *
 * One concurrent job per chapter — duplicate requests are rejected with
 * a clear error.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { BrowserWindow } from 'electron';
import { generateULID } from '../../shared/utils/ulid';
import { sanitize } from '../../shared/sanitize/sanitizer';
import { emitEvent } from '../ipc/events';
import {
  InferenceClient,
  type ChatMessage,
} from './InferenceClient';
import type { SecretsService } from './SecretsService';
import type { ProjectService } from './ProjectService';
import type { VariableService } from './VariableService';
import type { StalenessService } from './StalenessService';
import type { TemplateEngine, AssembledPrompt } from './TemplateEngine';
import type { StorageService } from '../storage/StorageService';
import type { Project } from '../../shared/schemas/project';
import type { GenRecord } from '../../shared/schemas/meta';
import type { Outline } from '../../shared/schemas/outline';

// ── Exported types ──────────────────────────────────────────────────────────

export interface GenerationJob {
  id: string;                    // ULID
  chapterId: string;
  step: 'expand' | 'write' | 'iterate';
  status: 'running' | 'done' | 'error' | 'cancelled';
  partialOutput: string;
  startedAt: string;
  completedAt?: string;
  error?: { code: string; message: string };
  /** For iterate: proposal held in memory, not committed. */
  proposal?: string;
  /** For iterate: which stage artifact is being revised. */
  targetStage?: 'expanded' | 'chapter';
  /** The version slug for the chapter ref (resolved at job start). */
  versionSlug?: string;
  /** Internal abort controller for mid-stream cancellation. */
  abortController?: AbortController;
  /** Reference to the window that initiated the job, for event emission. */
  windowRef?: BrowserWindow;
}

interface JobOptions {
  versionSlug?: string;
  excludeVariableIds?: string[];
  asNewVersion?: string;
  instruction?: string;
  stage?: 'expanded' | 'chapter';
}

// ── GenerationService ───────────────────────────────────────────────────────

export class GenerationService {
  /**
   * Active generation jobs, keyed by chapterId (one per chapter).
   */
  private readonly jobs = new Map<string, GenerationJob>();

  constructor(
    private readonly projectService: ProjectService,
    private readonly variableService: VariableService,
    private readonly templateEngine: TemplateEngine,
    private readonly secretsService: SecretsService,
    private readonly stalenessService?: StalenessService,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Start an expand generation job.
   *
   * 1. Validates no job is running for this chapter.
   * 2. Reads manifest and outline from the project repo.
   * 3. Assembles variables and prompt.
   * 4. Creates InferenceClient with the stored API key.
   * 5. Starts streaming — emits `generation:token` events.
   * 6. On completion: sanitizes output, commits `expanded-outline.html`
   *    + updated `meta.json` with GenRecord to the chapter ref.
   *
   * @returns The job ID.
   * @throws If the chapter already has a running job or dependencies fail.
   */
  async startExpand(
    projectId: string,
    chapterId: string,
    options: JobOptions = {},
    window: BrowserWindow,
  ): Promise<string> {
    this.assertNoRunningJob(chapterId);

    const project = await this.readProject(projectId);
    const service = this.getService(projectId);
    const { versionSlug, excludeVariableIds, asNewVersion } = options;

    // Resolve target ref
    const versionSlugResolved = versionSlug ?? 'main';
    const refPath = this.chapterRef(chapterId, versionSlugResolved);

    // If asNewVersion, create the ref first
    if (asNewVersion) {
      await this.createVersionRef(service, chapterId, versionSlugResolved, asNewVersion);
    }

    // Resolve outline and chapter slice
    const outline = await this.readOutline(projectId);
    const chapterSlice = this.formatChapterSlice(outline, chapterId);
    const bookOutline = this.formatOutlineText(outline);

    // Assemble variables
    const storyVariables = await this.variableService.assemble(
      'expand',
      projectId,
      excludeVariableIds,
    );

    // Build context and prompt (using snake_case keys matching template placeholders)
    const context: Record<string, string> = {
      book_outline: bookOutline,
      chapter_slice: chapterSlice,
      story_variables: storyVariables,
    };
    const prompt = await this.assemblePrompt('expand', context);

    // Get API key
    const apiKey = await this.secretsService.getApiKey();
    if (!apiKey) throw new Error('No API key configured. Please set your API key in Settings.');

    // Create client
    const client = new InferenceClient({
      baseUrl: project.settings.inference.baseUrl,
      apiKey,
      model: project.settings.models.expand.model,
      temperature: 0.7,
    });

    // Build GenRecord fingerprints
    const fingerprints = await this.buildFingerprints(
      service, projectId, chapterId, null, 'expand',
    );

    // Create job
    const jobId = generateULID();
    const job: GenerationJob = {
      id: jobId,
      chapterId,
      step: 'expand',
      status: 'running',
      partialOutput: '',
      startedAt: new Date().toISOString(),
      abortController: new AbortController(),
    };
    this.jobs.set(chapterId, job);

    // Run generation in background (non-blocking)
    this.runGeneration(
      job,
      project,
      service,
      client,
      prompt,
      refPath,
      fingerprints,
      window,
    ).catch(() => {
      /* errors handled inside runGeneration */
    });

    return jobId;
  }

  /**
   * Start a write generation job.
   *
   * Similar to expand but reads `expanded-outline.html` as the upstream
   * artifact and commits `chapter.html` on completion.
   */
  async startWrite(
    projectId: string,
    chapterId: string,
    options: JobOptions = {},
    window: BrowserWindow,
  ): Promise<string> {
    this.assertNoRunningJob(chapterId);

    const project = await this.readProject(projectId);
    const service = this.getService(projectId);
    const { versionSlug, excludeVariableIds, asNewVersion } = options;

    const versionSlugResolved = versionSlug ?? 'main';
    const refPath = this.chapterRef(chapterId, versionSlugResolved);

    if (asNewVersion) {
      await this.createVersionRef(service, chapterId, versionSlugResolved, asNewVersion);
    }

    // Read upstream artifact (expanded-outline.html)
    let upstreamArtifact = '';
    let upstreamSha: string | null = null;
    try {
      const tree = await service.readTree(refPath);
      const upstreamPath = 'expanded-outline.html';
      if (tree[upstreamPath]) {
        const buf = await service.readBlob(refPath, upstreamPath);
        upstreamArtifact = buf.toString('utf-8');
        const { computeBlobSha } = await import('./StalenessService');
        upstreamSha = computeBlobSha(upstreamArtifact);
      }
    } catch {
      upstreamArtifact = '';
    }

    // Read outline
    const outline = await this.readOutline(projectId);
    const chapterSlice = this.formatChapterSlice(outline, chapterId);
    const bookOutline = this.formatOutlineText(outline);

    // ── Continuity context ────────────────────────────────────────────
    let continuityContext = '';
    if (project.settings.continuityContext.enabled) {
      const allChapters = outline.parts.flatMap((p) => p.chapters);
      const currentIdx = allChapters.findIndex((c) => c.chapterId === chapterId);
      if (currentIdx > 0) {
        const prevChapter = allChapters[currentIdx - 1]!;
        const prevRefPath = this.chapterRef(prevChapter.chapterId, 'main');
        try {
          const buf = await service.readBlob(prevRefPath, 'chapter.html');
          const html = buf.toString('utf-8');
          const text = html.replace(/<[^>]+>/g, '');
          const words = text.split(/\s+/).filter(Boolean);
          const wordCount = project.settings.continuityContext.words;
          continuityContext = words.slice(-wordCount).join(' ');
        } catch {
          // Preceding chapter has no chapter.html — continuity context stays empty
        }
      }
    }

    // Assemble variables
    const storyVariables = await this.variableService.assemble(
      'write',
      projectId,
      excludeVariableIds,
    );

    const context: Record<string, string> = {
      book_outline: bookOutline,
      chapter_slice: chapterSlice,
      story_variables: storyVariables,
      upstream_artifact: upstreamArtifact,
      continuity_context: continuityContext,
    };
    const prompt = await this.assemblePrompt('write', context);

    const apiKey = await this.secretsService.getApiKey();
    if (!apiKey) throw new Error('No API key configured. Please set your API key in Settings.');

    const client = new InferenceClient({
      baseUrl: project.settings.inference.baseUrl,
      apiKey,
      model: project.settings.models.write.model,
      temperature: 0.7,
    });

    const fingerprints = await this.buildFingerprints(
      service, projectId, chapterId, upstreamSha, 'write',
    );

    const jobId = generateULID();
    const job: GenerationJob = {
      id: jobId,
      chapterId,
      step: 'write',
      status: 'running',
      partialOutput: '',
      startedAt: new Date().toISOString(),
      abortController: new AbortController(),
    };
    this.jobs.set(chapterId, job);

    this.runGeneration(
      job,
      project,
      service,
      client,
      prompt,
      refPath,
      fingerprints,
      window,
    ).catch(() => {});

    return jobId;
  }

  /**
   * Start an iterate generation job.
   *
   * Like write but the result is held in the job's `proposal` buffer
   * — NOT committed to the chapter ref. The proposal can be accepted
   * via a future commit method.
   */
  async startIterate(
    projectId: string,
    chapterId: string,
    stage: 'expanded' | 'chapter',
    instruction: string,
    options: { versionSlug?: string; excludeVariableIds?: string[] } = {},
    window: BrowserWindow,
  ): Promise<string> {
    this.assertNoRunningJob(chapterId);

    const project = await this.readProject(projectId);
    const service = this.getService(projectId);
    const { versionSlug, excludeVariableIds } = options;

    const versionSlugResolved = versionSlug ?? 'main';
    const refPath = this.chapterRef(chapterId, versionSlugResolved);

    // Read current artifact
    const currentFileName = stage === 'expanded' ? 'expanded-outline.html' : 'chapter.html';
    let currentArtifact = '';
    try {
      const buf = await service.readBlob(refPath, currentFileName);
      currentArtifact = buf.toString('utf-8');
    } catch {
      currentArtifact = '';
    }

    // Read outline
    const outline = await this.readOutline(projectId);
    const chapterSlice = this.formatChapterSlice(outline, chapterId);
    const bookOutline = this.formatOutlineText(outline);

    // Assemble variables (iterate step only matches always-scope)
    const storyVariables = await this.variableService.assemble(
      'iterate',
      projectId,
      excludeVariableIds,
    );

    const context: Record<string, string> = {
      book_outline: bookOutline,
      chapter_slice: chapterSlice,
      story_variables: storyVariables,
      current_artifact: currentArtifact,
      instruction,
    };
    const prompt = await this.assemblePrompt('iterate', context);

    const apiKey = await this.secretsService.getApiKey();
    if (!apiKey) throw new Error('No API key configured. Please set your API key in Settings.');

    const client = new InferenceClient({
      baseUrl: project.settings.inference.baseUrl,
      apiKey,
      model: project.settings.models.iterate.model,
      temperature: 0.7,
    });

    const jobId = generateULID();
    const job: GenerationJob = {
      id: jobId,
      chapterId,
      step: 'iterate',
      status: 'running',
      partialOutput: '',
      startedAt: new Date().toISOString(),
      abortController: new AbortController(),
      targetStage: stage,
      versionSlug: versionSlugResolved,
      windowRef: window,
    };
    this.jobs.set(chapterId, job);

    // Run iterate (background, no commit)
    this.runIteration(
      job,
      client,
      prompt,
      window,
    ).catch(() => {});

    return jobId;
  }

  /**
   * Cancel a running generation job.
   *
   * Aborts the HTTP stream, discards partial output, and emits
   * a `generation:error` event with code 'CANCELLED'.
   *
   * @throws If no job with the given ID is found.
   */
  async cancel(jobId: string): Promise<void> {
    for (const [chapterId, job] of this.jobs) {
      if (job.id === jobId) {
        job.status = 'cancelled';
        job.abortController?.abort();
        this.jobs.delete(chapterId);
        return;
      }
    }
    throw new Error(`No job found with ID: ${jobId}`);
  }

  // ── Iterate acceptance ───────────────────────────────────────────────────

  /**
   * Accept an iterate proposal and commit it to the current version ref.
   *
   * 1. Validates the job is done, step is 'iterate', and a proposal exists.
   * 2. Commits the proposal as a replacement for the current artifact file
   *    on the chapter's version ref (`refs/plotline/chapters/<chapterId>/<versionSlug>`).
   * 3. Invalidates staleness cache and emits `generation:done` event.
   * 4. Removes the job from the active map.
   *
   * @returns The commit SHA.
   * @throws If the job is missing, not done, not an iterate job, or has no proposal.
   */
  async accept(projectId: string, jobId: string): Promise<string> {
    const job = this.findJobById(jobId);
    if (!job) throw new Error(`No job found with ID: ${jobId}`);
    if (job.step !== 'iterate') throw new Error(`Job ${jobId} is not an iterate job (step: ${job.step})`);
    if (job.status !== 'done') throw new Error(`Job ${jobId} is not done yet (status: ${job.status})`);
    if (!job.proposal) throw new Error(`Job ${jobId} has no proposal to accept`);

    const service = this.getService(projectId);
    const refPath = this.chapterRef(job.chapterId, job.versionSlug ?? 'main');
    const fileName = job.targetStage === 'expanded' ? 'expanded-outline.html' : 'chapter.html';

    const sha = await service.commit(refPath, {
      [fileName]: Buffer.from(job.proposal, 'utf-8'),
    }, {
      label: 'Iterate revision',
      kind: 'manual',
    });

    this.stalenessService?.invalidateAll();
    this.jobs.delete(job.chapterId);

    // Emit completion with the proposal content so the renderer can refresh
    if (job.windowRef) {
      emitEvent(job.windowRef, 'generation:done', {
        jobId: job.id,
        chapterId: job.chapterId,
        stage: job.targetStage ?? 'iterate',
        html: job.proposal,
      });
    }

    return sha;
  }

  /**
   * Discard an iterate proposal without committing it.
   *
   * Removes the job from the active map. If the job doesn't exist,
   * a warning is logged and `{ ok: true }` is returned (lenient).
   *
   * @throws If the job exists but its step is not 'iterate'.
   */
  async discard(jobId: string): Promise<{ ok: true }> {
    const job = this.findJobById(jobId);
    if (!job) {
      console.warn(`[GenerationService] discard: no job found with ID ${jobId}, skipping`);
      return { ok: true };
    }
    if (job.step !== 'iterate') {
      throw new Error(`Job ${jobId} is not an iterate job (step: ${job.step})`);
    }

    this.jobs.delete(job.chapterId);
    return { ok: true };
  }

  /**
   * Accept an iterate proposal as a new named version.
   *
   * 1. Validates the job (same as `accept`).
   * 2. Creates a new version ref pointing at the current ref's parent commit.
   * 3. Commits the proposal on the new ref.
   * 4. Removes the job from the active map.
   *
   * @returns The commit SHA and the version slug used.
   * @throws If the job is missing, not done, not an iterate job, or has no proposal.
   */
  async acceptAsVersion(projectId: string, jobId: string, versionName: string): Promise<{ sha: string; versionSlug: string }> {
    const job = this.findJobById(jobId);
    if (!job) throw new Error(`No job found with ID: ${jobId}`);
    if (job.step !== 'iterate') throw new Error(`Job ${jobId} is not an iterate job (step: ${job.step})`);
    if (job.status !== 'done') throw new Error(`Job ${jobId} is not done yet (status: ${job.status})`);
    if (!job.proposal) throw new Error(`Job ${jobId} has no proposal to accept`);

    const service = this.getService(projectId);
    const currentRef = this.chapterRef(job.chapterId, job.versionSlug ?? 'main');
    const newRef = this.chapterRef(job.chapterId, versionName);
    const fileName = job.targetStage === 'expanded' ? 'expanded-outline.html' : 'chapter.html';

    // Resolve the current ref's commit and point the new ref at its parent (or itself if root)
    const fs_ = await import('node:fs');
    const git = await import('isomorphic-git');
    const currentSha = await git.resolveRef({
      fs: fs_.default as any,
      dir: service.directory,
      ref: currentRef,
    });
    const { commit: currentCommit } = await git.readCommit({
      fs: fs_.default as any,
      dir: service.directory,
      oid: currentSha,
    });
    const parentSha = currentCommit.parent[0] ?? currentSha;
    await service.createRef(newRef, parentSha);

    // Commit the proposal on the new ref
    const sha = await service.commit(newRef, {
      [fileName]: Buffer.from(job.proposal, 'utf-8'),
    }, {
      label: 'Iterate revision',
      kind: 'manual',
    });

    this.stalenessService?.invalidateAll();
    this.jobs.delete(job.chapterId);

    // Emit completion with the proposal content
    if (job.windowRef) {
      emitEvent(job.windowRef, 'generation:done', {
        jobId: job.id,
        chapterId: job.chapterId,
        stage: job.targetStage ?? 'iterate',
        html: job.proposal,
      });
    }

    return { sha, versionSlug: versionName };
  }

  // ── Private: Run generation (expand / write) ───────────────────────────

  /**
   * Run the generation stream, commit results, and emit events.
   */
  private async runGeneration(
    job: GenerationJob,
    project: Project,
    service: StorageService,
    client: InferenceClient,
    prompt: AssembledPrompt,
    refPath: string,
    fingerprints: GenRecord['fingerprints'],
    window: BrowserWindow,
  ): Promise<void> {
    try {
      await this.streamToJob(job, client, prompt, window);

      if (job.status === 'cancelled') {
        emitEvent(window, 'generation:error', {
          jobId: job.id,
          code: 'CANCELLED',
          message: 'Generation cancelled by user',
        });
        return;
      }

      // Sanitize the output
      const sanitized = sanitize(job.partialOutput);

      // Build GenRecord
      const genRecord: GenRecord = {
        generatedAt: new Date().toISOString(),
        model: job.step === 'write' ? project.settings.models.write : project.settings.models.expand,
        templateId: prompt.templateId,
        templateVersion: prompt.templateVersion,
        kind: job.step,
        instruction: null,
        fingerprints,
      };

      // Determine files to commit
      const commitFiles: Record<string, Buffer> = {};
      const fileName = job.step === 'expand' ? 'expanded-outline.html' : 'chapter.html';
      commitFiles[fileName] = Buffer.from(sanitized, 'utf-8');

      // Read current meta.json or create fresh
      let meta: Record<string, unknown> = {
        schemaVersion: 1,
        chapterId: job.chapterId,
        expanded: null,
        chapter: null,
      };
      try {
        const metaBuf = await service.readBlob(refPath, 'meta.json');
        const parsed = JSON.parse(metaBuf.toString('utf-8'));
        meta = { ...meta, ...parsed, schemaVersion: 1, chapterId: job.chapterId };
      } catch {
        // No existing meta — use default
      }

      // Set the appropriate GenRecord field
      const metaKey = job.step === 'expand' ? 'expanded' : 'chapter';
      meta[metaKey] = genRecord;
      commitFiles['meta.json'] = Buffer.from(JSON.stringify(meta, null, 2), 'utf-8');

      // Commit
      await service.commit(refPath, commitFiles, {
        label: `Generated — ${job.step === 'expand' ? 'Expand' : 'Write'}`,
        kind: job.step,
      });

      // Invalidate staleness cache for this chapter
      this.stalenessService?.invalidateAll();

      job.status = 'done';
      job.completedAt = new Date().toISOString();

      // Emit completion event
      emitEvent(window, 'generation:done', {
        jobId: job.id,
        chapterId: job.chapterId,
        stage: job.step === 'expand' ? 'expanded' : 'chapter',
        html: sanitized,
        genRecord,
      });
    } catch (err: unknown) {
      if (job.status === 'cancelled') {
        emitEvent(window, 'generation:error', {
          jobId: job.id,
          code: 'CANCELLED',
          message: 'Generation cancelled',
        });
      } else {
        const message = err instanceof Error ? err.message : 'Unknown generation error';
        job.status = 'error';
        job.error = { code: 'GENERATION_ERROR', message };
        job.completedAt = new Date().toISOString();
        emitEvent(window, 'generation:error', {
          jobId: job.id,
          code: 'GENERATION_ERROR',
          message,
        });
      }
    } finally {
      this.jobs.delete(job.chapterId);
    }
  }

  /**
   * Run an iteration stream (no commit — holds proposal in memory).
   */
  private async runIteration(
    job: GenerationJob,
    client: InferenceClient,
    prompt: AssembledPrompt,
    window: BrowserWindow,
  ): Promise<void> {
    try {
      await this.streamToJob(job, client, prompt, window);

      if (job.status === 'cancelled') {
        emitEvent(window, 'generation:error', {
          jobId: job.id,
          code: 'CANCELLED',
          message: 'Generation cancelled by user',
        });
        this.jobs.delete(job.chapterId);
        return;
      }

      const sanitized = sanitize(job.partialOutput);

      // Hold proposal in memory — no commit.
      // Job stays in the map for later accept / discard.
      job.proposal = sanitized;
      job.status = 'done';
      job.completedAt = new Date().toISOString();

      // Emit done without committing
      emitEvent(window, 'generation:done', {
        jobId: job.id,
        chapterId: job.chapterId,
        stage: 'iterate',
      });
    } catch (err: unknown) {
      if (job.status === 'cancelled') {
        emitEvent(window, 'generation:error', {
          jobId: job.id,
          code: 'CANCELLED',
          message: 'Generation cancelled',
        });
      } else {
        const message = err instanceof Error ? err.message : 'Unknown iteration error';
        job.status = 'error';
        job.error = { code: 'ITERATION_ERROR', message };
        job.completedAt = new Date().toISOString();
        emitEvent(window, 'generation:error', {
          jobId: job.id,
          code: 'ITERATION_ERROR',
          message,
        });
      }
      // Clean up errored / cancelled jobs
      this.jobs.delete(job.chapterId);
    }
  }

  /**
   * Stream tokens from the inference client into the job's partialOutput
   * and emit `generation:token` events.
   */
  private async streamToJob(
    job: GenerationJob,
    client: InferenceClient,
    prompt: AssembledPrompt,
    window: BrowserWindow,
  ): Promise<void> {
    const messages: ChatMessage[] = prompt.messages;

    for await (const delta of client.stream(messages, job.abortController?.signal)) {
      if (job.status === 'cancelled') break;
      job.partialOutput += delta;

      emitEvent(window, 'generation:token', {
        jobId: job.id,
        delta,
      });
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Find a job by its ID across all chapter entries.
   */
  private findJobById(jobId: string): GenerationJob | undefined {
    for (const job of this.jobs.values()) {
      if (job.id === jobId) return job;
    }
    return undefined;
  }

  /**
   * Assert that no generation job is currently running for the given chapter.
   * @throws If a job is already running.
   */
  private assertNoRunningJob(chapterId: string): void {
    if (this.jobs.has(chapterId)) {
      throw new Error(
        `A generation job is already running for chapter ${chapterId}. ` +
        'Cancel it before starting a new one.',
      );
    }
  }

  /**
   * Read the project manifest from its repo.
   */
  private async readProject(projectId: string): Promise<Project> {
    const service = this.getService(projectId);
    const buf = await service.readBlob('refs/heads/main', 'project.json');
    const { ProjectSchema } = await import('../../shared/schemas/project');
    return ProjectSchema.parse(JSON.parse(buf.toString('utf-8')));
  }

  /**
   * Get StorageService for an open project.
   * @throws If project is not open.
   */
  private getService(projectId: string): StorageService {
    const service = this.projectService.getOpenProject(projectId);
    if (!service) throw new Error(`Project not open: ${projectId}`);
    return service;
  }

  /**
   * Build the chapter ref path: `refs/plotline/chapters/<chapterId>/<versionSlug>`.
   */
  private chapterRef(chapterId: string, versionSlug: string): string {
    return `refs/plotline/chapters/${chapterId}/${versionSlug}`;
  }

  /**
   * Create a version ref from the current base ref state.
   * Used for `asNewVersion` option.
   */
  private async createVersionRef(
    service: StorageService,
    chapterId: string,
    versionSlug: string,
    _asNewVersion: string,
  ): Promise<void> {
    const baseRef = this.chapterRef(chapterId, 'main');
    const newRef = this.chapterRef(chapterId, versionSlug);

    try {
      const fs_ = await import('node:fs');
      const git = await import('isomorphic-git');
      const baseSha = await git.resolveRef({
        fs: fs_.default as any,
        dir: service.directory,
        ref: baseRef,
      });

      const { commit: baseCommit } = await git.readCommit({
        fs: fs_.default as any,
        dir: service.directory,
        oid: baseSha,
      });

      const newSha = await git.writeCommit({
        fs: fs_.default as any,
        dir: service.directory,
        commit: {
          message: JSON.stringify({
            label: `Forked version: ${versionSlug}`,
            kind: 'manual',
          }),
          tree: baseCommit.tree,
          parent: [baseSha],
          author: {
            name: 'Plotline',
            email: 'auto@plotline.local',
            timestamp: Math.floor(Date.now() / 1000),
            timezoneOffset: 0,
          },
          committer: {
            name: 'Plotline',
            email: 'auto@plotline.local',
            timestamp: Math.floor(Date.now() / 1000),
            timezoneOffset: 0,
          },
        },
      });

      await git.writeRef({
        fs: fs_.default as any,
        dir: service.directory,
        ref: newRef,
        value: newSha,
        force: true,
      });
    } catch {
      // If base ref doesn't exist, that's ok — first generation
    }
  }

  /**
   * Assemble a full prompt for the given generation step.
   */
  private async assemblePrompt(
    step: 'expand' | 'write' | 'iterate',
    context: Record<string, string>,
  ): Promise<AssembledPrompt> {
    const template = await this.templateEngine.loadTemplate(step);
    return this.templateEngine.assemble(template, context);
  }

  /**
   * Read the outline JSON from the project repo and parse it.
   */
  private async readOutline(projectId: string): Promise<Outline> {
    const service = this.getService(projectId);
    const buf = await service.readBlob('refs/heads/main', 'outline/outline.json');
    const { OutlineSchema } = await import('../../shared/schemas/outline');
    return OutlineSchema.parse(JSON.parse(buf.toString('utf-8')));
  }

  /**
   * Format the full outline as a readable text block.
   */
  private formatOutlineText(outline: Outline): string {
    const lines: string[] = [];

    for (const part of outline.parts) {
      lines.push(`## Part: ${part.title}`);
      for (const chapter of part.chapters) {
        lines.push(`  - ${chapter.title}`);
        if (chapter.sections.length > 0) {
          for (const section of chapter.sections) {
            const wordTarget = section.wordTarget ?? '';
            lines.push(`    * ${section.number}. ${section.title}${wordTarget ? ` (${wordTarget} words)` : ''}`);
            if (section.beats.length > 0) {
              for (let i = 0; i < section.beats.length; i++) {
                lines.push(`      Beat ${i + 1}: ${section.beats[i]!}`);
              }
            }
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Format a single chapter's sections/beats as a readable text block.
   */
  private formatChapterSlice(outline: Outline, chapterId: string): string {
    for (const part of outline.parts) {
      for (const chapter of part.chapters) {
        if (chapter.chapterId === chapterId) {
          const lines: string[] = [];
          lines.push(`## ${chapter.title}`);
          if (chapter.wordTarget) {
            lines.push(`Word target: ${chapter.wordTarget.min}-${chapter.wordTarget.max}`);
          }

          for (const section of chapter.sections) {
            const wordTarget = section.wordTarget;
            lines.push(`\n### ${section.number}. ${section.title}`);
            if (wordTarget) {
              lines.push(`Target: ${wordTarget} words`);
            }
            if (section.beats.length > 0) {
              lines.push('Beats:');
              for (let i = 0; i < section.beats.length; i++) {
                lines.push(`  ${i + 1}. ${section.beats[i]!}`);
              }
            }
          }

          return lines.join('\n');
        }
      }
    }

    return `Chapter ${chapterId}`;
  }

  /**
   * Build GenRecord fingerprints from the current state of the repo.
   *
   * Uses per-chapter section canonicalised JSON for outlineSlice (matching
   * StalenessService.fingerprintsMatch comparison), plain content SHA for
   * variable content and upstream artifacts, and null continuity (T1 — not
   * yet captured at generation time for the write step).
   */
  private async buildFingerprints(
    service: StorageService,
    projectId: string,
    chapterId: string,
    upstreamSha: string | null,
    _kind: 'expand' | 'write',
  ): Promise<GenRecord['fingerprints']> {
    // Import helpers from StalenessService
    const { computeCanonicalJsonSha, computeBlobSha } = await import('./StalenessService');

    // Outline slice fingerprint (per-chapter sections)
    let outlineSlice = '';
    try {
      const outlineBuf = await service.readBlob('refs/heads/main', 'outline/outline.json');
      const { OutlineSchema } = await import('../../shared/schemas/outline');
      const outline = OutlineSchema.parse(JSON.parse(outlineBuf.toString('utf-8')));
      const chapter = findChapterInOutline(outline, chapterId);
      if (chapter) {
        const sections = chapter.sections.map((s) => ({
          id: s.id,
          number: s.number,
          title: s.title,
          wordTarget: s.wordTarget,
          beats: s.beats,
        }));
        outlineSlice = computeCanonicalJsonSha(sections);
      }
    } catch {
      // No outline yet
    }

    // Variable fingerprints
    const variables: Array<{ variableId: string; contentSha: string }> = [];
    try {
      const tree = await service.readTree('refs/heads/main');
      for (const [filepath] of Object.entries(tree)) {
        const match = filepath.match(/^variables\/([^/]+)\/content\.html$/);
        if (match) {
          const varId = match[1]!;
          // Check the variable is active and matches the generation scope
          try {
            const varBuf = await service.readBlob(
              'refs/heads/main',
              `variables/${varId}/variable.json`,
            );
            const variable = JSON.parse(varBuf.toString('utf-8'));
            const scope = variable.scope;
            const active = variable.active !== false;
            if (active && (scope === 'always' || scope === _kind)) {
              const contentBuf = await service.readBlob(
                'refs/heads/main',
                `variables/${varId}/content.html`,
              );
              variables.push({
                variableId: varId,
                contentSha: computeBlobSha(contentBuf.toString('utf-8')),
              });
            }
          } catch {
            // Skip unreadable variable
          }
        }
      }
    } catch {
      // No tree yet
    }

    // Sort for deterministic comparison
    variables.sort((a, b) => a.variableId.localeCompare(b.variableId));

    return {
      outlineSlice,
      variables,
      upstream: upstreamSha,
      continuity: null,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Find a chapter in the outline by its chapterId.
 */
function findChapterInOutline(
  outline: import('../../shared/schemas/outline').Outline,
  chapterId: string,
): import('../../shared/schemas/outline').OutlineChapter | null {
  for (const part of outline.parts) {
    for (const chapter of part.chapters) {
      if (chapter.chapterId === chapterId) {
        return chapter;
      }
    }
  }
  return null;
}
