/**
 * Tectonic LaTeX engine runner.
 *
 * Spawns the Tectonic binary as a child process, captures stderr as
 * progress lines, and returns the generated PDF path. Includes a 120s
 * timeout and informative error messages on failure.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

// ── Error codes ───────────────────────────────────────────────────────────

export interface TectonicError {
  code: 'TECTONIC_ERROR' | 'TECTONIC_NOT_FOUND' | 'TECTONIC_TIMEOUT';
  message: string;
  detail?: string;
}

// ── Runner ────────────────────────────────────────────────────────────────

export class TectonicRunner {
  private tectonicPath: string;
  private readonly defaultTimeoutMs = 120_000; // 120 seconds

  /**
   * @param tectonicPath - Path to the Tectonic binary. If omitted, resolves
   *   from PATH first, then from `vendor/tectonic/tectonic`.
   */
  constructor(tectonicPath?: string) {
    this.tectonicPath = tectonicPath ?? this.resolveDefault();
  }

  /**
   * Resolve the Tectonic binary path.
   * Checks PATH first (default), then the vendor directory.
   */
  private resolveDefault(): string {
    // Don't use which/where — just rely on PATH lookup in spawn.
    // Return 'tectonic' as default and let spawn fail if not found.
    return 'tectonic';
  }

  /**
   * Render a .tex file to PDF.
   *
   * @param texFilePath - Path to the .tex source file.
   * @param outputDir   - Directory where Tectonic writes output.
   * @param onProgress   - Callback for each stderr line (progress updates).
   * @returns The absolute path to the generated PDF.
   * @throws {TectonicError} On failure.
   */
  async render(
    texFilePath: string,
    outputDir: string,
    onProgress: (line: string) => void,
  ): Promise<string> {
    // 1. Check binary exists
    try {
      accessSync(this.tectonicPath, constants.X_OK);
    } catch {
      // Might still work if 'tectonic' is on PATH but not accessible via
      // accessSync (e.g. it's resolved through PATH). In that case the
      // spawn will fail. We only reject when the path is an explicit file
      // that doesn't exist.
      if (this.tectonicPath !== 'tectonic') {
        throw new Error(`Tectonic binary not found at: ${this.tectonicPath}`);
      }
    }

    return new Promise<string>((resolve, reject) => {
      const logLines: string[] = [];

      // 2. Spawn Tectonic
      let child;
      try {
        child = spawn(this.tectonicPath, ['--outdir', outputDir, texFilePath], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err: any) {
        reject({
          code: 'TECTONIC_NOT_FOUND',
          message: `Failed to spawn Tectonic: ${err.message}`,
          detail: `Binary path: ${this.tectonicPath}`,
        } satisfies TectonicError);
        return;
      }

      // 3. Capture stderr for progress
      const rl = readline.createInterface({ input: child.stderr! });

      rl.on('line', (line: string) => {
        logLines.push(line);
        onProgress(line);
      });

      // 4. Capture stdout as well (some versions may output there)
      child.stdout!.on('data', (data: Buffer) => {
        const text = data.toString('utf-8').trim();
        if (text) {
          logLines.push(text);
          onProgress(text);
        }
      });

      // 5. Timeout
      const timeoutHandle = setTimeout(() => {
        child.kill();
        reject({
          code: 'TECTONIC_TIMEOUT',
          message: `Tectonic timed out after ${this.defaultTimeoutMs / 1000}s`,
          detail: logLines.join('\n'),
        } satisfies TectonicError);
      }, this.defaultTimeoutMs);

      // 6. Handle exit
      child.on('close', (exitCode: number | null) => {
        clearTimeout(timeoutHandle);

        if (exitCode === 0) {
          const pdfFileName = path.basename(texFilePath).replace(/\.tex$/, '.pdf');
          const pdfPath = path.join(outputDir, pdfFileName);
          resolve(pdfPath);
        } else {
          const fullLog = logLines.join('\n');
          reject({
            code: 'TECTONIC_ERROR',
            message: `LaTeX compilation failed with exit code ${exitCode}`,
            detail: fullLog,
          } satisfies TectonicError);
        }
      });

      // 7. Handle spawn error (e.g., binary not on PATH)
      child.on('error', (err: Error) => {
        clearTimeout(timeoutHandle);
        reject({
          code: 'TECTONIC_NOT_FOUND',
          message: `Tectonic execution failed: ${err.message}`,
          detail: `Binary path: ${this.tectonicPath}`,
        } satisfies TectonicError);
      });
    });
  }
}
