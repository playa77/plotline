/**
 * GenerationService tests (WP-14).
 *
 * Tests generation job lifecycle: expand, write, iterate, cancel.
 * InferenceClient is mocked at the module boundary so tests run
 * without a real API connection. Project repos are real Git repos
 * created via ProjectService.
 *
 * Version: 0.2.0 | 2026-07-16
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BrowserWindow } from 'electron';
import { ProjectService } from '../../main/services/ProjectService';
import { VariableService } from '../../main/services/VariableService';
import { TemplateEngine } from '../../main/services/TemplateEngine';
import { GenerationService } from '../../main/services/GenerationService';

// ── Shared mock state ──────────────────────────────────────────────────────
// Tests can set `mockState.chunks` or `mockState.throwOnStream` before
// starting generation to control what the mock InferenceClient streams.

const mockState = vi.hoisted(() => ({
  chunks: ['Hello', ' ', 'World', '!'],
  throwOnStream: null as Error | null,
  stallOnStream: false,
  lastMessages: null as Array<{ role: string; content: string }> | null,
}));

// Mock Electron's safeStorage (needed by SecretsService)
vi.mock('electron', () => {
  const encryptString = (text: string): Buffer => Buffer.from(text, 'utf-8');
  const decryptString = (buf: Buffer): string => buf.toString('utf-8');
  return {
    BrowserWindow: {
      fromWebContents: vi.fn(),
    },
    safeStorage: {
      isEncryptionAvailable: vi.fn().mockReturnValue(true),
      encryptString: vi.fn().mockImplementation(encryptString),
      decryptString: vi.fn().mockImplementation(decryptString),
    },
    ipcMain: { handle: vi.fn() },
  };
});

// Mock InferenceClient using the shared state
vi.mock('../../main/services/InferenceClient', () => {
  class MockInferenceClient {
    constructor() {}

    async *stream(
      messages: Array<{ role: string; content: string }>,
      signal?: AbortSignal,
    ): AsyncGenerator<string, void, undefined> {
      mockState.lastMessages = messages;
      if (mockState.throwOnStream) {
        throw mockState.throwOnStream;
      }

      if (mockState.stallOnStream) {
        yield 'First chunk';
        // Wait indefinitely until aborted
        await new Promise<void>((resolve) => {
          const onAbort = () => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
          };
          if (signal?.aborted) {
            resolve();
          } else {
            signal?.addEventListener('abort', onAbort, { once: true });
          }
        });
        return;
      }

      for (const chunk of mockState.chunks) {
        if (signal?.aborted) return;
        yield chunk;
      }
    }

    cancel(): void {}
  }

  return { InferenceClient: MockInferenceClient };
});

// Import after mocks are set up
import { SecretsService } from '../../main/services/SecretsService';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a test project with an outline and a chapter, ready for generation.
 */
async function createTestProject(
  projectService: ProjectService,
  variableService: VariableService,
): Promise<{ projectId: string; chapterId: string }> {
  const project = await projectService.create('Test Book');
  const projectId = project.projectId;

  // Create a basic outline with one chapter
  const service = projectService.getOpenProject(projectId)!;

  const outline = {
    schemaVersion: 1,
    frontMatter: [],
    parts: [
      {
        id: 'part_01',
        title: 'Main',
        chapters: [
          {
            chapterId: 'ch_01',
            title: 'Chapter One',
            wordTarget: { min: 500, max: 1000 },
            sections: [
              {
                id: 'sec_01',
                number: '1.1',
                title: 'The Beginning',
                wordTarget: 500,
                beats: ['Introduce protagonist', 'Set the scene'],
              },
            ],
          },
        ],
      },
    ],
    backMatter: [],
  };

  await service.commit(
    'refs/heads/main',
    {
      'outline/outline.json': Buffer.from(JSON.stringify(outline, null, 2), 'utf-8'),
    },
    { label: 'Initial outline', kind: 'manual' },
  );

  // Update project manifest structure
  const manifestBuf = await service.readBlob('refs/heads/main', 'project.json');
  const manifest = JSON.parse(manifestBuf.toString('utf-8'));
  manifest.structure = [
    {
      kind: 'part',
      id: 'part_01',
      title: 'Main',
      chapters: [
        {
          id: 'ch_01',
          title: 'Chapter One',
          selectedVersion: 'main',
          versions: [],
          wordTarget: { min: 500, max: 1000 },
        },
      ],
    },
  ];
  manifest.updatedAt = new Date().toISOString();

  await service.commit(
    'refs/heads/main',
    {
      'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'),
    },
    { label: 'Update structure', kind: 'manual' },
  );

  return { projectId, chapterId: 'ch_01' };
}

/**
 * Create an expand output on the chapter ref (for write tests).
 */
async function seedExpandedOutput(
  projectService: ProjectService,
  projectId: string,
  chapterId: string,
): Promise<void> {
  const service = projectService.getOpenProject(projectId)!;
  await service.commit(
    `refs/plotline/chapters/${chapterId}/main`,
    {
      'expanded-outline.html': Buffer.from('<p>Expanded outline content</p>', 'utf-8'),
      'meta.json': Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          chapterId,
          expanded: null,
          chapter: null,
        }),
        'utf-8',
      ),
    },
    { label: 'Pre-seeded expand', kind: 'expand' },
  );
}

/**
 * Create a seed chapter.html output for a chapter.
 */
async function seedChapterOutput(
  projectService: ProjectService,
  projectId: string,
  chapterId: string,
  content: string,
): Promise<void> {
  const service = projectService.getOpenProject(projectId)!;
  await service.commit(
    `refs/plotline/chapters/${chapterId}/main`,
    {
      'chapter.html': Buffer.from(content, 'utf-8'),
      'meta.json': Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          chapterId,
          expanded: null,
          chapter: null,
        }),
        'utf-8',
      ),
    },
    { label: 'Pre-seeded chapter', kind: 'write' },
  );
}

/**
 * Create a test project with two chapters, ready for write continuity tests.
 */
async function createTwoChapterProject(
  projectService: ProjectService,
  variableService: VariableService,
): Promise<{ projectId: string; chapterId: string; prevChapterId: string }> {
  const project = await projectService.create('Test Book');
  const projectId = project.projectId;
  const service = projectService.getOpenProject(projectId)!;

  const outline = {
    schemaVersion: 1,
    frontMatter: [],
    parts: [
      {
        id: 'part_01',
        title: 'Main',
        chapters: [
          {
            chapterId: 'ch_01',
            title: 'Chapter One',
            wordTarget: { min: 500, max: 1000 },
            sections: [
              {
                id: 'sec_01',
                number: '1.1',
                title: 'The Beginning',
                wordTarget: 500,
                beats: ['Introduce protagonist', 'Set the scene'],
              },
            ],
          },
          {
            chapterId: 'ch_02',
            title: 'Chapter Two',
            wordTarget: { min: 500, max: 1000 },
            sections: [
              {
                id: 'sec_02',
                number: '2.1',
                title: 'The Middle',
                wordTarget: 500,
                beats: ['Rising action'],
              },
            ],
          },
        ],
      },
    ],
    backMatter: [],
  };

  await service.commit(
    'refs/heads/main',
    {
      'outline/outline.json': Buffer.from(JSON.stringify(outline, null, 2), 'utf-8'),
    },
    { label: 'Initial outline', kind: 'manual' },
  );

  // Update project manifest structure
  const manifestBuf = await service.readBlob('refs/heads/main', 'project.json');
  const manifest = JSON.parse(manifestBuf.toString('utf-8'));
  manifest.structure = [
    {
      kind: 'part',
      id: 'part_01',
      title: 'Main',
      chapters: [
        {
          id: 'ch_01',
          title: 'Chapter One',
          selectedVersion: 'main',
          versions: [],
          wordTarget: { min: 500, max: 1000 },
        },
        {
          id: 'ch_02',
          title: 'Chapter Two',
          selectedVersion: 'main',
          versions: [],
          wordTarget: { min: 500, max: 1000 },
        },
      ],
    },
  ];
  manifest.updatedAt = new Date().toISOString();

  await service.commit(
    'refs/heads/main',
    {
      'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'),
    },
    { label: 'Update structure', kind: 'manual' },
  );

  return { projectId, chapterId: 'ch_02', prevChapterId: 'ch_01' };
}

/**
 * Create a mock BrowserWindow (we only need webContents.send).
 */
function createMockWindow(): BrowserWindow {
  return {
    webContents: {
      send: vi.fn(),
    },
  } as unknown as BrowserWindow;
}

/**
 * Extract event payloads from webContents.send mock calls.
 * webContents.send(channel, { event, payload })
 */
function getEventCalls(
  window: BrowserWindow,
  eventName: string,
): Array<{ event: string; payload: any }> {
  const send = vi.mocked(window.webContents.send);
  return send.mock.calls
    .filter((call) => {
      const arg = call[1] as { event?: string } | undefined;
      return arg?.event === eventName;
    })
    .map((call) => call[1] as { event: string; payload: any });
}

/**
 * Wait for a generation:done event to fire (or timeout).
 */
async function waitForDone(window: BrowserWindow, timeoutMs = 5000): Promise<void> {
  await vi.waitFor(
    () => {
      const doneCalls = getEventCalls(window, 'generation:done');
      if (doneCalls.length === 0) {
        throw new Error('No generation:done event yet');
      }
    },
    { timeout: timeoutMs },
  );
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe('GenerationService', () => {
  let tmpDir: string;
  let projectService: ProjectService;
  let variableService: VariableService;
  let templateEngine: TemplateEngine;
  let secretsService: SecretsService;
  let generationService: GenerationService;
  let window: BrowserWindow;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-test-gen-'));

    // Create built-in templates
    const templatesDir = path.join(tmpDir, 'templates');
    fs.mkdirSync(templatesDir, { recursive: true });

    // Expand template
    const expandDir = path.join(templatesDir, 'expand-v1');
    fs.mkdirSync(expandDir, { recursive: true });
    fs.writeFileSync(
      path.join(expandDir, 'template.json'),
      JSON.stringify({ id: 'expand-v1', version: '1.0.0', step: 'expand', description: 'Expand' }),
    );
    fs.writeFileSync(
      path.join(expandDir, 'system.txt'),
      'You are a writer. Expand the chapter outline into prose.',
    );
    fs.writeFileSync(
      path.join(expandDir, 'user.txt'),
      'Outline: {{book_outline}}\n\nChapter: {{chapter_slice}}\n\nVariables:\n{{story_variables}}',
    );

    // Write template
    const writeDir = path.join(templatesDir, 'write-v1');
    fs.mkdirSync(writeDir, { recursive: true });
    fs.writeFileSync(
      path.join(writeDir, 'template.json'),
      JSON.stringify({ id: 'write-v1', version: '1.0.0', step: 'write', description: 'Write' }),
    );
    fs.writeFileSync(
      path.join(writeDir, 'system.txt'),
      'You are a writer. Write a full chapter based on the expanded outline.',
    );
    fs.writeFileSync(
      path.join(writeDir, 'user.txt'),
      [
        'CHAPTER OUTLINE:',
        '{{chapter_slice}}',
        '',
        'EXPANDED OUTLINE:',
        '{{upstream_artifact}}',
        '',
        '{{#if story_variables}}',
        'STORY CONTEXT:',
        '{{story_variables}}',
        '{{/if}}',
        '',
        '{{#if continuity_context}}',
        'CONTINUITY (final paragraphs of preceding chapter):',
        '{{continuity_context}}',
        '{{/if}}',
        '',
        'CHAPTER TARGET: {{word_target}}',
        '',
        '{{output_format_contract}}',
        '',
        'Write the full chapter now:',
      ].join('\n'),
    );

    // Iterate template
    const iterateDir = path.join(templatesDir, 'iterate-v1');
    fs.mkdirSync(iterateDir, { recursive: true });
    fs.writeFileSync(
      path.join(iterateDir, 'template.json'),
      JSON.stringify({ id: 'iterate-v1', version: '1.0.0', step: 'iterate', description: 'Iterate' }),
    );
    fs.writeFileSync(
      path.join(iterateDir, 'system.txt'),
      'You are an editor. Revise the content based on the instruction.',
    );
    fs.writeFileSync(
      path.join(iterateDir, 'user.txt'),
      'Current: {{current_artifact}}\n\nInstruction: {{instruction}}\n\nVariables:\n{{story_variables}}',
    );

    projectService = new ProjectService(tmpDir);
    variableService = new VariableService(projectService);
    templateEngine = new TemplateEngine(templatesDir);
    secretsService = new SecretsService(tmpDir);

    generationService = new GenerationService(
      projectService,
      variableService,
      templateEngine,
      secretsService,
    );

    // Reset mock state
    mockState.chunks = ['Hello', ' ', 'World', '!'];
    mockState.throwOnStream = null;
    mockState.stallOnStream = false;
    mockState.lastMessages = null;

    // Store a test API key
    await secretsService.setApiKey('sk-test-key-00000');

    window = createMockWindow();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Expand: basic flow ─────────────────────────────────────────────────

  it('expand: starts generation, streams tokens, and commits on completion', async () => {
    const { projectId, chapterId } = await createTestProject(projectService, variableService);

    const jobId = await generationService.startExpand(projectId, chapterId, {}, window);

    expect(jobId).toBeTruthy();
    expect(typeof jobId).toBe('string');

    // Wait for generation to complete (background job)
    await waitForDone(window);

    // Verify token events were emitted
    const tokenCalls = getEventCalls(window, 'generation:token');
    expect(tokenCalls.length).toBeGreaterThan(0);

    // Verify commit on chapter ref
    const service = projectService.getOpenProject(projectId)!;
    const tree = await service.readTree(`refs/plotline/chapters/${chapterId}/main`);

    expect(tree['expanded-outline.html']).toBeTruthy();
    expect(tree['meta.json']).toBeTruthy();

    // Verify meta.json has GenRecord
    const metaBuf = await service.readBlob(
      `refs/plotline/chapters/${chapterId}/main`,
      'meta.json',
    );
    const meta = JSON.parse(metaBuf.toString('utf-8'));
    expect(meta.expanded).toBeTruthy();
    expect(meta.expanded.kind).toBe('expand');
    expect(meta.expanded.model).toBeTruthy();
    expect(meta.expanded.templateId).toBe('expand-v1');
    expect(meta.expanded.fingerprints.outlineSlice).toBeTruthy();

    // Verify content
    const contentBuf = await service.readBlob(
      `refs/plotline/chapters/${chapterId}/main`,
      'expanded-outline.html',
    );
    const content = contentBuf.toString('utf-8');
    expect(content).toContain('Hello World!');
  });

  it('expand: cancelling mid-stream emits error and does not commit', async () => {
    mockState.stallOnStream = true;
    mockState.chunks = [];

    const { projectId, chapterId } = await createTestProject(projectService, variableService);

    const jobId = await generationService.startExpand(projectId, chapterId, {}, window);

    // Cancel immediately
    await generationService.cancel(jobId);

    // Wait a tick for the background job to process cancellation
    await new Promise((r) => setTimeout(r, 100));

    const service = projectService.getOpenProject(projectId)!;

    // Verify no chapter ref was created
    const refs = await service.listRefs(`refs/plotline/chapters/${chapterId}`);
    if (refs.length > 0) {
      const tree = await service.readTree(refs[0]!);
      expect(tree['expanded-outline.html']).toBeFalsy();
    }

    // Verify error event was emitted
    const errorCalls = getEventCalls(window, 'generation:error');
    // At least one error call should exist (CANCELLED error)
    expect(errorCalls.length).toBeGreaterThan(0);
  });

  it('expand: rejects a second job for the same chapter', async () => {
    const { projectId, chapterId } = await createTestProject(projectService, variableService);

    await generationService.startExpand(projectId, chapterId, {}, window);

    await expect(
      generationService.startExpand(projectId, chapterId, {}, window),
    ).rejects.toThrow(/already running for chapter/);
  });

  it('expand: asNewVersion creates a separate version ref before generating', async () => {
    const { projectId, chapterId } = await createTestProject(projectService, variableService);

    await generationService.startExpand(
      projectId,
      chapterId,
      { asNewVersion: 'v2', versionSlug: 'v2' },
      window,
    );

    // Wait for generation to complete
    await waitForDone(window);

    const service = projectService.getOpenProject(projectId)!;
    const refs = await service.listRefs(`refs/plotline/chapters/${chapterId}`);
    expect(refs).toContain(`refs/plotline/chapters/${chapterId}/v2`);
  });

  // ── Write: basic flow ──────────────────────────────────────────────────

  it('write: reads expanded-outline and commits chapter.html with GenRecord upstream', async () => {
    const { projectId, chapterId } = await createTestProject(projectService, variableService);

    // Seed expanded output
    await seedExpandedOutput(projectService, projectId, chapterId);

    // Get the expanded commit sha for verification
    const service = projectService.getOpenProject(projectId)!;
    const tree = await service.readTree(`refs/plotline/chapters/${chapterId}/main`);
    const upstreamSha = tree['expanded-outline.html'];

    await generationService.startWrite(projectId, chapterId, {}, window);

    await waitForDone(window);

    // Verify chapter.html was committed
    const treeAfter = await service.readTree(`refs/plotline/chapters/${chapterId}/main`);
    expect(treeAfter['chapter.html']).toBeTruthy();

    // Verify meta.json has chapter GenRecord with upstream fingerprint
    const metaBuf = await service.readBlob(
      `refs/plotline/chapters/${chapterId}/main`,
      'meta.json',
    );
    const meta = JSON.parse(metaBuf.toString('utf-8'));
    expect(meta.chapter).toBeTruthy();
    expect(meta.chapter.kind).toBe('write');
    expect(meta.chapter.fingerprints.upstream).toBe(upstreamSha);
  });

  // ── Write: continuity context ──────────────────────────────────────────

  it('write: includes continuity_context when enabled and preceding chapter exists', async () => {
    const { projectId, chapterId, prevChapterId } =
      await createTwoChapterProject(projectService, variableService);

    // Seed expanded output for current chapter
    await seedExpandedOutput(projectService, projectId, chapterId);

    // Seed preceding chapter with chapter.html content
    const prevContent = '<p>This is the end of the preceding chapter with important context.</p>';
    await seedChapterOutput(projectService, projectId, prevChapterId, prevContent);

    await generationService.startWrite(projectId, chapterId, {}, window);
    await waitForDone(window);

    // Verify continuity context was captured and passed to the prompt
    expect(mockState.lastMessages).not.toBeNull();
    const userMsg = mockState.lastMessages!.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).toContain('CONTINUITY (final paragraphs of preceding chapter):');
    expect(userMsg!.content).toContain('end of the preceding chapter');
  });

  it('write: continuity_context is empty when disabled in project settings', async () => {
    const { projectId, chapterId, prevChapterId } =
      await createTwoChapterProject(projectService, variableService);

    // Disable continuity context
    const service = projectService.getOpenProject(projectId)!;
    const manifestBuf = await service.readBlob('refs/heads/main', 'project.json');
    const manifest = JSON.parse(manifestBuf.toString('utf-8'));
    manifest.settings.continuityContext.enabled = false;
    manifest.updatedAt = new Date().toISOString();
    await service.commit(
      'refs/heads/main',
      { 'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') },
      { label: 'Disable continuity', kind: 'manual' },
    );

    await seedExpandedOutput(projectService, projectId, chapterId);
    await seedChapterOutput(projectService, projectId, prevChapterId, '<p>Some previous content</p>');

    await generationService.startWrite(projectId, chapterId, {}, window);
    await waitForDone(window);

    expect(mockState.lastMessages).not.toBeNull();
    const userMsg = mockState.lastMessages!.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).not.toContain('CONTINUITY (final paragraphs');
  });

  it('write: continuity_context is empty when current chapter is first (no preceding)', async () => {
    const { projectId, chapterId } = await createTestProject(projectService, variableService);

    await seedExpandedOutput(projectService, projectId, chapterId);

    await generationService.startWrite(projectId, chapterId, {}, window);
    await waitForDone(window);

    expect(mockState.lastMessages).not.toBeNull();
    const userMsg = mockState.lastMessages!.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).not.toContain('CONTINUITY (final paragraphs');
  });

  it('write: continuity_context is empty when preceding chapter has no chapter.html', async () => {
    const { projectId, chapterId } =
      await createTwoChapterProject(projectService, variableService);

    // Seed expanded output for current chapter but do NOT seed chapter.html for preceding chapter
    await seedExpandedOutput(projectService, projectId, chapterId);

    await generationService.startWrite(projectId, chapterId, {}, window);
    await waitForDone(window);

    expect(mockState.lastMessages).not.toBeNull();
    const userMsg = mockState.lastMessages!.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).not.toContain('CONTINUITY (final paragraphs');
  });

  it('write: continuity_context contains exactly N words from the end of the preceding chapter', async () => {
    const { projectId, chapterId, prevChapterId } =
      await createTwoChapterProject(projectService, variableService);

    // Seed preceding chapter with 200 known words
    const wordCount = 200;
    const words = Array.from({ length: wordCount }, (_, i) => `word${i + 1}`);
    const html = `<p>${words.join(' ')}</p>`;
    await seedChapterOutput(projectService, projectId, prevChapterId, html);

    // Update project settings to use continuityContext.words = 50
    const service = projectService.getOpenProject(projectId)!;
    const manifestBuf = await service.readBlob('refs/heads/main', 'project.json');
    const manifest = JSON.parse(manifestBuf.toString('utf-8'));
    manifest.settings.continuityContext.words = 50;
    manifest.updatedAt = new Date().toISOString();
    await service.commit(
      'refs/heads/main',
      { 'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') },
      { label: 'Update continuity words', kind: 'manual' },
    );

    await seedExpandedOutput(projectService, projectId, chapterId);

    await generationService.startWrite(projectId, chapterId, {}, window);
    await waitForDone(window);

    expect(mockState.lastMessages).not.toBeNull();
    const userMsg = mockState.lastMessages!.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();

    // Extract the continuity context text from the user message
    const continuityMatch = userMsg!.content.match(
      /CONTINUITY \(final paragraphs of preceding chapter\):\n([\s\S]*?)(?=\n\nCHAPTER TARGET:)/,
    );
    expect(continuityMatch).toBeTruthy();
    const continuityText = continuityMatch![1]!.trim();
    const continuityWords = continuityText.split(/\s+/);
    expect(continuityWords).toHaveLength(50);
    expect(continuityText).toBe(words.slice(-50).join(' '));
  });

  // ── Iterate: basic flow ────────────────────────────────────────────────

  it('iterate: streams tokens and holds proposal in memory (no commit)', async () => {
    const { projectId, chapterId } = await createTestProject(projectService, variableService);

    // Seed expand output
    await seedExpandedOutput(projectService, projectId, chapterId);

    await generationService.startIterate(
      projectId,
      chapterId,
      'expanded',
      'Make it more engaging',
      {},
      window,
    );

    await waitForDone(window);

    // Verify token events were emitted
    const tokenCalls = getEventCalls(window, 'generation:token');
    expect(tokenCalls.length).toBeGreaterThan(0);

    // Verify no commit was made
    const service = projectService.getOpenProject(projectId)!;
    const chapterRef = `refs/plotline/chapters/${chapterId}/main`;
    const tree = await service.readTree(chapterRef);
    // Should still only have expanded-outline.html and meta.json from seed
    expect(tree['expanded-outline.html']).toBeTruthy();
    expect(tree['chapter.html']).toBeUndefined();

    // Verify the meta.json hasn't been modified (no chapter GenRecord added)
    const metaBuf = await service.readBlob(chapterRef, 'meta.json');
    const meta = JSON.parse(metaBuf.toString('utf-8'));
    expect(meta.chapter).toBeNull();
  });

  // ── Cancel: job not found ──────────────────────────────────────────────

  it('cancel on nonexistent job throws', async () => {
    await expect(
      generationService.cancel('nonexistent-job-id'),
    ).rejects.toThrow(/No job found/);
  });

  // ── No API key ─────────────────────────────────────────────────────────

  it('throws descriptive error when no API key is configured', async () => {
    // Create a new SecretsService without a key stored
    const noKeySecrets = new SecretsService(tmpDir + '-nokey');
    const noKeyService = new GenerationService(
      projectService,
      variableService,
      templateEngine,
      noKeySecrets,
    );

    const { projectId, chapterId } = await createTestProject(projectService, variableService);

    await expect(
      noKeyService.startExpand(projectId, chapterId, {}, window),
    ).rejects.toThrow(/No API key configured/);
  });

  // ── Project not open ───────────────────────────────────────────────────

  it('throws when project is not open', async () => {
    await expect(
      generationService.startExpand('nonexistent-project', 'ch_01', {}, window),
    ).rejects.toThrow(/Project not open/);
  });

  // ── Sanitize is called on completion ───────────────────────────────────

  it('sanitized output is committed (HTML safety)', async () => {
    // Configure mock to return raw HTML with script tags
    mockState.chunks = ['<script>alert("xss")</script><p>Safe content</p>'];

    const { projectId, chapterId } = await createTestProject(projectService, variableService);

    await generationService.startExpand(projectId, chapterId, {}, window);

    await waitForDone(window);

    // Verify script tag was stripped
    const service = projectService.getOpenProject(projectId)!;
    const contentBuf = await service.readBlob(
      `refs/plotline/chapters/${chapterId}/main`,
      'expanded-outline.html',
    );
    const content = contentBuf.toString('utf-8');
    expect(content).toContain('<p>Safe content</p>');
    expect(content).not.toContain('<script>');
  });

  // ── Error from API surfaces as error event ─────────────────────────────

  it('API error surfaces as generation:error event with code', async () => {
    mockState.throwOnStream = new Error('API rate limit exceeded');

    const { projectId, chapterId } = await createTestProject(projectService, variableService);

    await generationService.startExpand(projectId, chapterId, {}, window);

    // Wait for error event
    await vi.waitFor(
      () => {
        const errorCalls = getEventCalls(window, 'generation:error');
        if (errorCalls.length === 0) {
          throw new Error('No error event yet');
        }
        expect(errorCalls[0]!.payload?.code).toBe('GENERATION_ERROR');
      },
      { timeout: 5000 },
    );
  });

  // ── Write with upstream sha ────────────────────────────────────────────

  it('write GenRecord includes upstream fingerprint for expanded-outline', async () => {
    const { projectId, chapterId } = await createTestProject(projectService, variableService);

    // Seed expanded output
    await seedExpandedOutput(projectService, projectId, chapterId);

    const service = projectService.getOpenProject(projectId)!;
    const refPath = `refs/plotline/chapters/${chapterId}/main`;
    const treeBefore = await service.readTree(refPath);
    const expandedSha = treeBefore['expanded-outline.html'];

    await generationService.startWrite(projectId, chapterId, {}, window);

    await waitForDone(window);

    // Check the genRecord has upstream sha from the done event
    const doneCalls = getEventCalls(window, 'generation:done');
    expect(doneCalls.length).toBe(1);
    expect(doneCalls[0]!.payload?.genRecord?.fingerprints?.upstream).toBe(expandedSha);
  });

  // ── Key never appears in logs ──────────────────────────────────────────

  it('secret key never appears in event payloads', async () => {
    const { projectId, chapterId } = await createTestProject(projectService, variableService);

    await generationService.startExpand(projectId, chapterId, {}, window);

    await waitForDone(window);

    // Check that no event payloads contain the API key
    const send = vi.mocked(window.webContents.send);
    const allPayloads = send.mock.calls.map((call) => JSON.stringify(call[1]));
    for (const payloadStr of allPayloads) {
      expect(payloadStr).not.toContain('sk-test-key-00000');
    }
  });
});
