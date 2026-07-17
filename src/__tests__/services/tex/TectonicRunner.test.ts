/**
 * TectonicRunner tests (WP-25).
 *
 * Tests use mocked child_process.spawn to avoid requiring the Tectonic
 * binary. Covers correct command construction, progress line emission,
 * success path, failure path, and binary-not-found errors.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ── Mocks (use vi.hoisted for factories that hoist above imports) ────────

const { mockSpawn, mockAccessSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockAccessSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

vi.mock('node:fs', () => ({
  accessSync: mockAccessSync,
  constants: { X_OK: 1 },
}));

// ── Imports (after mocks) ────────────────────────────────────────────────

import { TectonicRunner } from '../../../main/services/tex/TectonicRunner';

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Create a mock child process that simulates Tectonic's behavior.
 */
function createMockChildProcess(options?: {
  exitCode?: number;
  stderrLines?: string[];
  stdoutLines?: string[];
  spawnError?: Error;
}) {
  // Must have resume() and emit 'data' events for readline.createInterface
  const createMockStream = (lines?: string[]) => {
    const stream = new EventEmitter() as any;
    stream.resume = vi.fn();
    // Schedule data emission on next tick (lines joined with newline)
    if (lines && lines.length > 0) {
      process.nextTick(() => {
        stream.emit('data', Buffer.from(lines.join('\n') + '\n'));
      });
    }
    return stream;
  };

  const stderr = createMockStream(options?.stderrLines);
  const stdout = createMockStream(options?.stdoutLines);
  const child = new EventEmitter() as any;

  child.stderr = stderr;
  child.stdout = stdout;
  child.kill = vi.fn();

  // Simulate stderr output
  const stderrLines = options?.stderrLines ?? ['note: processing file.tex', 'note: running pdflatex'];
  const exitCode = options?.exitCode ?? 0;

  // Schedule stderr emission on next tick
  process.nextTick(() => {
    if (options?.spawnError) {
      child.emit('error', options.spawnError);
      return;
    }
    for (const line of stderrLines) {
      stderr.emit('line', line);
    }
    stdout.emit('data', Buffer.from(''));
    process.nextTick(() => {
      child.emit('close', exitCode);
    });
  });

  return child;
}

// ── Suite ────────────────────────────────────────────────────────────────

describe('TectonicRunner', () => {
  let runner: TectonicRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    // Make accessSync succeed by default
    mockAccessSync.mockImplementation(() => undefined);
    runner = new TectonicRunner('/usr/local/bin/tectonic');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Spawn command ───────────────────────────────────────────────────

  it('spawns Tectonic with correct arguments', async () => {
    const mockChild = createMockChildProcess({ exitCode: 0 });
    mockSpawn.mockReturnValue(mockChild);

    const onProgress = vi.fn();
    const result = await runner.render('/tmp/test.tex', '/tmp/output', onProgress);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSpawn).toHaveBeenCalledWith(
      '/usr/local/bin/tectonic',
      ['--outdir', '/tmp/output', '/tmp/test.tex'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(result).toBe('/tmp/output/test.pdf');
  });

  // ── Progress emission ───────────────────────────────────────────────

  it('emits progress lines from stderr', async () => {
    const stderrLines = ['note: processing file.tex', 'note: running pdflatex', 'note: done'];
    const mockChild = createMockChildProcess({ exitCode: 0, stderrLines });
    mockSpawn.mockReturnValue(mockChild);

    const onProgress = vi.fn();
    await runner.render('/tmp/test.tex', '/tmp/output', onProgress);

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 'note: processing file.tex');
    expect(onProgress).toHaveBeenNthCalledWith(2, 'note: running pdflatex');
    expect(onProgress).toHaveBeenNthCalledWith(3, 'note: done');
  });

  // ── Success path ─────────────────────────────────────────────────────

  it('resolves with PDF path on success (exit code 0)', async () => {
    const mockChild = createMockChildProcess({ exitCode: 0 });
    mockSpawn.mockReturnValue(mockChild);

    const onProgress = vi.fn();
    const pdfPath = await runner.render('/tmp/export.tex', '/tmp/output', onProgress);

    expect(pdfPath).toBe('/tmp/output/export.pdf');
  });

  // ── Failure path ─────────────────────────────────────────────────────

  it('rejects with TECTONIC_ERROR on non-zero exit with full log', async () => {
    const stderrLines = ['Error: undefined control sequence', '! Emergency stop'];
    const mockChild = createMockChildProcess({ exitCode: 1, stderrLines });
    mockSpawn.mockReturnValue(mockChild);

    const onProgress = vi.fn();

    await expect(
      runner.render('/tmp/test.tex', '/tmp/output', onProgress),
    ).rejects.toMatchObject({
      code: 'TECTONIC_ERROR',
      message: 'LaTeX compilation failed with exit code 1',
      detail: expect.stringContaining('Emergency stop'),
    });
  });

  // ── Binary not found ────────────────────────────────────────────────

  it('rejects with TECTONIC_NOT_FOUND if binary does not exist', async () => {
    const mockChild = createMockChildProcess({ spawnError: new Error('ENOENT') });
    mockSpawn.mockReturnValue(mockChild);

    const onProgress = vi.fn();

    await expect(
      runner.render('/tmp/test.tex', '/tmp/output', onProgress),
    ).rejects.toMatchObject({
      code: 'TECTONIC_NOT_FOUND',
    });
  });

  // ── Timeout ──────────────────────────────────────────────────────────

  it('rejects with TECTONIC_TIMEOUT after timeout elapses', async () => {
    vi.useFakeTimers();

    const createMockStream = () => {
      const stream = new EventEmitter() as any;
      stream.resume = vi.fn();
      return stream;
    };

    const stderr = createMockStream();
    const stdout = createMockStream();
    const child = new EventEmitter() as any;
    child.stderr = stderr;
    child.stdout = stdout;
    child.kill = vi.fn();

    // Never emit close — simulate hang
    mockSpawn.mockReturnValue(child);

    const onProgress = vi.fn();

    // This promise will resolve when timeout fires
    const renderPromise = runner.render('/tmp/test.tex', '/tmp/output', onProgress).catch((e) => {
      // Expected to reject - return error so we can assert on it
      return e;
    });

    // Advance time past the 120s timeout
    await vi.advanceTimersByTimeAsync(121_000);

    const error = await renderPromise;
    expect(error).toMatchObject({
      code: 'TECTONIC_TIMEOUT',
      message: expect.stringContaining('timed out'),
    });

    expect(child.kill).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
