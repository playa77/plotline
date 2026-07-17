/**
 * WP-28 fault injection tests.
 *
 * Verifies that the system produces designed, structured error states
 * under fault conditions — never blank panes or console-only errors.
 *
 * Test groups:
 *   1. Kill mock server mid-stream (GenerationService)
 *   2. Revoke API key (GenerationService)
 *   3. Corrupt variable file (VariableService)
 *   4. IPC error envelope (IpcResult / toastStore)
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import { IPC_COMMAND_CHANNEL } from '../../shared/ipc';
import type { IpcResult } from '../../shared/ipc';

// ── Electron mock (shared across all groups) ─────────────────────────────

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

// ── GenerationService mock state (fault-injection variant) ───────────────

const genMockState = vi.hoisted(() => ({
  chunks: ['Hello', ' ', 'World', '!'],
  /** After yielding this many chunks, the stream throws. Infinity = no failure. */
  failAfterChunks: Infinity,
  /** Error message for the injected fault. */
  failErrorMessage: 'Connection dropped: stream interrupted',
  lastMessages: null as Array<{ role: string; content: string }> | null,
}));

vi.mock('../../main/services/InferenceClient', () => {
  class FaultInjectionClient {
    constructor() {}

    async *stream(
      messages: Array<{ role: string; content: string }>,
      signal?: AbortSignal,
    ): AsyncGenerator<string, void, undefined> {
      genMockState.lastMessages = messages;

      for (let i = 0; i < genMockState.chunks.length; i++) {
        if (signal?.aborted) return;
        if (i >= genMockState.failAfterChunks) {
          throw new Error(genMockState.failErrorMessage);
        }
        yield genMockState.chunks[i]!;
      }
    }

    cancel(): void {}
  }

  return { InferenceClient: FaultInjectionClient };
});

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { BrowserWindow } from 'electron';
import { ProjectService } from '../../main/services/ProjectService';
import { VariableService } from '../../main/services/VariableService';
import { TemplateEngine } from '../../main/services/TemplateEngine';
import { SecretsService } from '../../main/services/SecretsService';
import { GenerationService } from '../../main/services/GenerationService';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a test project with a single chapter outline.
 */
async function createTestProject(
  projectService: ProjectService,
  variableService: VariableService,
): Promise<{ projectId: string; chapterId: string }> {
  const project = await projectService.create('Fault Test Book');
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
 * Create a mock BrowserWindow with a send spy.
 */
function createMockWindow(): BrowserWindow {
  return {
    webContents: { send: vi.fn() },
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

// ── Setup templates helper ────────────────────────────────────────────────

function setupTemplates(tmpDir: string): string {
  const templatesDir = path.join(tmpDir, 'templates');
  fs.mkdirSync(templatesDir, { recursive: true });

  // Expand template
  const expandDir = path.join(templatesDir, 'expand-v1');
  fs.mkdirSync(expandDir, { recursive: true });
  fs.writeFileSync(
    path.join(expandDir, 'template.json'),
    JSON.stringify({ id: 'expand-v1', version: '1.0.0', step: 'expand', description: 'Expand' }),
  );
  fs.writeFileSync(path.join(expandDir, 'system.txt'), 'You are a writer. Expand the outline.');
  fs.writeFileSync(
    path.join(expandDir, 'user.txt'),
    'Outline: {{book_outline}}\nChapter: {{chapter_slice}}\nVariables:\n{{story_variables}}',
  );

  // Write template
  const writeDir = path.join(templatesDir, 'write-v1');
  fs.mkdirSync(writeDir, { recursive: true });
  fs.writeFileSync(
    path.join(writeDir, 'template.json'),
    JSON.stringify({ id: 'write-v1', version: '1.0.0', step: 'write', description: 'Write' }),
  );
  fs.writeFileSync(path.join(writeDir, 'system.txt'), 'You are a writer. Write the chapter.');
  fs.writeFileSync(
    path.join(writeDir, 'user.txt'),
    [
      'CHAPTER OUTLINE:\n{{chapter_slice}}',
      'EXPANDED OUTLINE:\n{{upstream_artifact}}',
      '{{#if story_variables}}STORY CONTEXT:\n{{story_variables}}{{/if}}',
      'CHAPTER TARGET:\n{{word_target}}',
      'Write the full chapter now:',
    ].join('\n\n'),
  );

  // Iterate template
  const iterateDir = path.join(templatesDir, 'iterate-v1');
  fs.mkdirSync(iterateDir, { recursive: true });
  fs.writeFileSync(
    path.join(iterateDir, 'template.json'),
    JSON.stringify({ id: 'iterate-v1', version: '1.0.0', step: 'iterate', description: 'Iterate' }),
  );
  fs.writeFileSync(path.join(iterateDir, 'system.txt'), 'You are an editor.');
  fs.writeFileSync(
    path.join(iterateDir, 'user.txt'),
    'Current: {{current_artifact}}\nInstruction: {{instruction}}\nVariables:\n{{story_variables}}',
  );

  return templatesDir;
}

// ══════════════════════════════════════════════════════════════════════════
//  1. Kill mock server mid-stream
// ══════════════════════════════════════════════════════════════════════════

describe('Fault Injection — GenerationService (mid-stream kill)', () => {
  let tmpDir: string;
  let projectService: ProjectService;
  let variableService: VariableService;
  let templateEngine: TemplateEngine;
  let secretsService: SecretsService;
  let generationService: GenerationService;
  let window: BrowserWindow;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-fi-midstream-'));
    const templatesDir = setupTemplates(tmpDir);

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

    // Default mock state: no fault
    genMockState.chunks = ['Hello', ' ', 'World', '!'];
    genMockState.failAfterChunks = Infinity;
    genMockState.failErrorMessage = 'Connection dropped: stream interrupted';
    genMockState.lastMessages = null;

    await secretsService.setApiKey('sk-test-key-fault-inject');
    window = createMockWindow();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── 1.1 Mid-stream connection drop → structured error event ───────────

  it('1.1: mid-stream connection drop emits generation:error with structured {code, message}', async () => {
    genMockState.failAfterChunks = 1; // yield one chunk, then throw
    genMockState.failErrorMessage = 'Connection dropped: stream interrupted';

    const { projectId, chapterId } = await createTestProject(projectService, variableService);
    await generationService.startExpand(projectId, chapterId, {}, window);

    // Wait for the error event
    await vi.waitFor(
      () => {
        const errorCalls = getEventCalls(window, 'generation:error');
        if (errorCalls.length === 0) throw new Error('No error event yet');

        const payload = errorCalls[0]!.payload;
        expect(payload).toHaveProperty('code');
        expect(payload).toHaveProperty('message');

        // Verify it is NOT a raw stack trace or console-only string
        expect(payload.code).toBe('GENERATION_ERROR');
        expect(payload.message).toBe('Connection dropped: stream interrupted');
        // The message should be descriptive, not a stack trace
        expect(payload.message).not.toContain('Error:');
        expect(payload.message).not.toContain('at ');
      },
      { timeout: 5000 },
    );
  });

  // ── 1.2 Mid-stream failure → generation status 'error' ────────────────

  it('1.2: mid-stream connection drop transitions job status to error in event payload', async () => {
    genMockState.failAfterChunks = 1;
    genMockState.failErrorMessage = 'Connection dropped: stream interrupted';

    const { projectId, chapterId } = await createTestProject(projectService, variableService);
    await generationService.startExpand(projectId, chapterId, {}, window);

    // Wait for the error event and verify the payload is well-structured
    await vi.waitFor(
      () => {
        const errorCalls = getEventCalls(window, 'generation:error');
        if (errorCalls.length === 0) throw new Error('No error event yet');

        expect(errorCalls[0]!.payload).toMatchObject({
          code: 'GENERATION_ERROR',
          message: 'Connection dropped: stream interrupted',
        });
      },
      { timeout: 5000 },
    );

    // The event payload follows the IpcEventMap contract: { jobId, code, message }
    const errorCalls = getEventCalls(window, 'generation:error');
    expect(errorCalls[0]!.payload).toHaveProperty('jobId');
    expect(errorCalls[0]!.payload.jobId).toBeTruthy();
    expect(typeof errorCalls[0]!.payload.jobId).toBe('string');
  });

  // ── 1.3 Mid-stream failure → no partial content committed ─────────────

  it('1.3: mid-stream connection drop does NOT commit partial content to chapter ref', async () => {
    genMockState.failAfterChunks = 1;
    genMockState.failErrorMessage = 'Connection dropped: stream interrupted';

    const { projectId, chapterId } = await createTestProject(projectService, variableService);
    await generationService.startExpand(projectId, chapterId, {}, window);

    // Wait for the error event
    await vi.waitFor(
      () => {
        const errorCalls = getEventCalls(window, 'generation:error');
        if (errorCalls.length === 0) throw new Error('No error event yet');
      },
      { timeout: 5000 },
    );

    // Verify the chapter ref does NOT contain any generated content
    const service = projectService.getOpenProject(projectId)!;
    const refs = await service.listRefs(`refs/plotline/chapters/${chapterId}`);
    if (refs.length > 0) {
      // If a ref exists (e.g., from project structure setup), it should NOT
      // have expanded-outline.html or chapter.html (those come from generation)
      const tree = await service.readTree(refs[0]!);
      expect(tree['expanded-outline.html']).toBeFalsy();
      expect(tree['chapter.html']).toBeFalsy();
    }
    // If no ref exists at all, that also means nothing was committed — pass
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  2. Revoke API key
// ══════════════════════════════════════════════════════════════════════════

describe('Fault Injection — GenerationService (API key)', () => {
  let tmpDir: string;
  let projectService: ProjectService;
  let variableService: VariableService;
  let templateEngine: TemplateEngine;
  let secretsService: SecretsService;
  let generationService: GenerationService;
  let window: BrowserWindow;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-fi-key-'));
    const templatesDir = setupTemplates(tmpDir);

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

    genMockState.chunks = ['Hello', ' ', 'World', '!'];
    genMockState.failAfterChunks = Infinity;
    genMockState.failErrorMessage = 'API request failed (401): Invalid API key';
    genMockState.lastMessages = null;

    window = createMockWindow();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── 2.1 Key revoke mid-stream (simulated auth failure during stream) ──

  it('2.1: API key rejection mid-stream emits structured error event (not raw HTTP error)', async () => {
    await secretsService.setApiKey('sk-test-key-fault-inject');

    // Simulate: key becomes invalid mid-stream (API returns 401)
    genMockState.failAfterChunks = 1;
    genMockState.failErrorMessage = 'API request failed (401): Invalid API key';

    const { projectId, chapterId } = await createTestProject(projectService, variableService);
    await generationService.startExpand(projectId, chapterId, {}, window);

    await vi.waitFor(
      () => {
        const errorCalls = getEventCalls(window, 'generation:error');
        if (errorCalls.length === 0) throw new Error('No error event yet');

        const payload = errorCalls[0]!.payload;
        // Verify structured error envelope
        expect(payload).toHaveProperty('code');
        expect(payload).toHaveProperty('message');

        // The message should clearly indicate an auth/api problem,
        // not be a raw stack trace or console.error string
        expect(payload.message).toContain('401');
        expect(payload.message).toContain('Invalid API key');
        expect(payload.message).not.toContain('Error:');
        expect(payload.message).not.toContain('at ');
      },
      { timeout: 5000 },
    );
  });

  // ── 2.2 No API key configured (already exists in GenerationService.test.ts) ──

  it('2.2: [SKIPPED] No API key configured — already tested in GenerationService.test.ts (line 1032)', async () => {
    // The existing test "throws descriptive error when no API key is configured"
    // at src/__tests__/services/GenerationService.test.ts:1032 covers this case.
    // It verifies GenerationService throws Error('No API key configured...')
    // which is a descriptive, structured error — not a blank pane or console dump.
    expect(true).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  3. Corrupt variable file
// ══════════════════════════════════════════════════════════════════════════

describe('Fault Injection — VariableService (corrupt content)', () => {
  let tmpDir: string;
  let projectService: ProjectService;
  let variableService: VariableService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-fi-var-'));
    projectService = new ProjectService(tmpDir);
    variableService = new VariableService(projectService);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── 3.1 assemble with corrupt content.html → safe fallback ────────────

  it('3.1: assemble with corrupted variable content.html produces safe fallback (no crash)', async () => {
    const project = await projectService.create('Corrupt Var Test');
    const pid = project.projectId;

    // Seed builtins then create a custom variable
    await variableService.seedBuiltins(pid);
    const variable = await variableService.create(pid, 'Custom Tone', 'always');

    // Directly corrupt the content.html in the repo with binary garbage
    const service = projectService.getOpenProject(pid)!;
    await service.commit(
      'refs/heads/main',
      {
        [`variables/${variable.id}/content.html`]: Buffer.from(
          '\x00\x01\x02\x03\xFF\xFE\xFD\xFC' +
          '\x00\x00\x00\x00ÿþýü' +
          'Some readable text mixed in' +
          '\x00\x00\x00\x00',
          'latin1',
        ),
      },
      { label: 'Corrupt content for test', kind: 'manual' },
    );

    // assemble should not crash
    let result: string;
    try {
      result = await variableService.assemble('expand', pid);
    } catch (err) {
      // If it does throw, it should be a structured error, not a crash
      expect(err).toBeInstanceOf(Error);
      const error = err as Error;
      expect(error.message).not.toContain('undefined');
      expect(error.message).not.toContain('null');
      // Re-throw to fail the test — we expect graceful handling
      throw err;
    }

    // The result should be a string (safe fallback)
    expect(typeof result).toBe('string');

    // Some readable text may have survived stripping; the key is it
    // contains the readable portion, not binary noise
    expect(result).toContain('Some readable text mixed in');
  });

  // ── 3.2 save with malformed content → reject gracefully ───────────────

  it('3.2: save with content containing null bytes does not crash the service', async () => {
    const project = await projectService.create('Malformed Save Test');
    const pid = project.projectId;

    const variable = await variableService.create(pid, 'Test Var');

    // Save with content that has embedded null bytes (unusual but should
    // not crash the service or produce an uncaught error)
    const malformedContent = 'Normal text\x00with\x00null bytes\x00and more text';

    let result: { sha: string };
    try {
      result = await variableService.setContent(pid, variable.id, malformedContent);
    } catch (err) {
      // If rejected, the error should be structured
      expect(err).toBeInstanceOf(Error);
      const error = err as Error;
      expect(error.message).toBeTruthy();
      expect(typeof error.message).toBe('string');
      // Test passes if we get here — structured rejection is acceptable
      return;
    }

    // If accepted, it should return a valid sha
    expect(result.sha).toBeTruthy();
    expect(typeof result.sha).toBe('string');

    // Verify the content was stored (null bytes may be stripped or kept)
    const gotten = await variableService.get(pid, variable.id);
    expect(gotten.content).toBe(malformedContent);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  4. IPC error envelope
// ══════════════════════════════════════════════════════════════════════════

describe('Fault Injection — IPC Error Envelope', () => {
  // ── 4.1 Handler throws → IpcResult error envelope ──────────────────────

  it('4.1: IPC handler throwing an unexpected error returns {error: {code, message}}, not raw string', async () => {
    // Import after mocks are established
    const { registerCommand, initIpcRegistry } = await import('../../main/ipc/registry');
    const { ipcMain, BrowserWindow } = await import('electron');

    // Register a handler that throws unexpectedly
    registerCommand(
      'test:faultHandlerThrow' as any,
      z.object({}),
      async () => {
        throw new Error('Unexpected internal error in handler');
      },
    );

    // Install the single ipcMain.handle listener
    initIpcRegistry();

    // Capture the handler that was registered with ipcMain.handle
    const handleFn = vi.mocked(ipcMain.handle);
    expect(handleFn.mock.calls.length).toBeGreaterThanOrEqual(1);
    const handler = handleFn.mock.calls[0]![1] as (
      event: any,
      command: string,
      payload: unknown,
    ) => Promise<IpcResult<unknown>>;

    // Mock BrowserWindow.fromWebContents to return a window
    const mockWindow = { webContents: { send: vi.fn() } };
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(mockWindow as any);

    // Call the handler — simulates renderer invoking the command
    const result: any = await handler({ sender: {} }, 'test:faultHandlerThrow', {});

    // Verify the result follows the IpcError envelope
    expect(result).not.toHaveProperty('data');
    expect(result).toHaveProperty('error');
    expect(result.error).toMatchObject({
      code: 'HANDLER_ERROR',
      message: 'Unexpected internal error in handler',
    });
    // Verify it is NOT a raw string or stack trace
    expect(typeof result).toBe('object');
    expect(typeof result.error.code).toBe('string');
    expect(typeof result.error.message).toBe('string');
    expect(result.error.code).toBe('HANDLER_ERROR');
    expect(result.error.message).not.toContain('at ');
  });

  // ── 4.2 ToastStore formats IpcError payloads correctly ─────────────────

  it('4.2: toastStore.error formats IpcError {code, message, detail} into a toast with type error', async () => {
    // The toastStore is a Zustand store — importable in Node
    const useToastStore = (await import('../../renderer/stores/toastStore')).useToastStore;

    // Reset store state
    useToastStore.setState({ toasts: [] });

    // Simulate formatting an IpcError payload through the store
    useToastStore.getState().error(
      'NO_API_KEY',
      'API key not configured',
      'Please set your API key in Settings to use AI generation features.',
    );

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);

    const toast = toasts[0]!;
    expect(toast.code).toBe('NO_API_KEY');
    expect(toast.message).toBe('API key not configured');
    expect(toast.detail).toBe(
      'Please set your API key in Settings to use AI generation features.',
    );
    expect(toast.type).toBe('error');
    expect(toast.id).toBeTruthy();
    expect(toast.id).toMatch(/^toast-\d+$/);
  });
});
