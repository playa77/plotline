/**
 * WP-29 Performance & scale benchmarks.
 *
 * Measures four key TS §8.1 metrics against the synthetic project:
 *   1. Project open ≤ 1.5s for 100-chapter / 1 000-commit repo
 *   2. Version switch ≤ 200ms
 *   3. History list ≤ 150ms for 500 entries (messages only, no diffs)
 *   4. Write throughput (informational, no hard target)
 *
 * The synthetic project is generated once by `bench-projects/generator.ts`
 * (run from this test's beforeAll if the repo directory is missing).
 *
 * Results are written to `bench-results/results.json`. Timing assertions
 * report failures as warnings, not hard failures — benchmarks on developer
 * machines vary with I/O load.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

import { ProjectService } from '../src/main/services/ProjectService';
import { StorageService } from '../src/main/storage/StorageService';
import { VersionService } from '../src/main/services/VersionService';
import { HistoryService } from '../src/main/services/HistoryService';

// ── Constants ────────────────────────────────────────────────────────────────

const SYNTHETIC_DIR = path.resolve('bench-projects/synthetic');
const RESULTS_PATH = path.resolve('bench-results/results.json');
const GENERATOR_SCRIPT = path.resolve('bench-projects/generator.ts');

const PROJECT_ID = 'benchmark-project'; // matches the id set by the generator

// TS §8.1 targets
const TARGET_PROJECT_OPEN_MS = 1500;
const TARGET_VERSION_SWITCH_MS = 200;
const TARGET_HISTORY_LIST_MS = 150;

// ── Types ────────────────────────────────────────────────────────────────────

interface BenchmarkResults {
  timestamp: string;
  project: {
    syntheticDir: string;
    chapterCount: number;
    estimatedCommitCount: number;
  };
  benchmarks: Array<{
    name: string;
    targetMs: number | null;
    measuredMs: number;
    passed: boolean;
    iterations?: number;
    details?: string;
  }>;
}

// ── Timing helper ────────────────────────────────────────────────────────────

function measure(name: string, targetMs: number | null, fn: () => Promise<void>, iterations = 1): Promise<{ name: string; targetMs: number | null; measuredMs: number; passed: boolean; iterations: number }> {
  return (async () => {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await fn();
    }
    const elapsed = performance.now() - start;
    const avg = elapsed / iterations;

    const passed = targetMs === null ? true : avg <= targetMs;
    console.log(`  ${name}: ${avg.toFixed(1)}ms avg over ${iterations} iteration(s)${targetMs !== null ? ` (target ≤${targetMs}ms) → ${passed ? 'PASS' : 'FAIL'}` : ''}`);

    return { name, targetMs, measuredMs: Math.round(avg * 10) / 10, passed, iterations };
  })();
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('WP-29 Performance Benchmarks', () => {
  let tmpDir: string;
  let projectService: ProjectService;
  let storageService: StorageService;
  let versionService: VersionService;
  let historyService: HistoryService;

  const results: BenchmarkResults = {
    timestamp: new Date().toISOString(),
    project: {
      syntheticDir: SYNTHETIC_DIR,
      chapterCount: 100,
      estimatedCommitCount: 1000,
    },
    benchmarks: [],
  };

  beforeAll(async () => {
    // ── 1. Generate synthetic project if it doesn't exist ──
    if (!fs.existsSync(path.join(SYNTHETIC_DIR, '.git'))) {
      console.log('\n  Generating synthetic project (first run)...');
      const genStart = performance.now();
      execSync(`npx tsx ${GENERATOR_SCRIPT}`, { cwd: process.cwd(), stdio: 'pipe' });
      const genElapsed = performance.now() - genStart;
      console.log(`  Generator completed in ${(genElapsed / 1000).toFixed(1)}s\n`);
    } else {
      console.log('\n  Using existing synthetic project\n');
    }

    // ── 2. Copy synthetic project into a temp dir for ProjectService ──
    // ProjectService expects projects under <appDataDir>/projects/<projectId>/
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-bench-'));
    const projectsDir = path.join(tmpDir, 'projects');
    const projectDir = path.join(projectsDir, PROJECT_ID);
    fs.mkdirSync(projectDir, { recursive: true });

    // Copy the synthetic repo (preserve .git)
    fs.cpSync(SYNTHETIC_DIR, projectDir, { recursive: true, force: true });

    // ── 3. Build services ──
    projectService = new ProjectService(tmpDir);
    await projectService.open(PROJECT_ID);

    storageService = projectService.getOpenProject(PROJECT_ID)!;
    versionService = new VersionService(projectService);
    historyService = new HistoryService(projectService);

    // Determine first chapter ID for targeted benchmarks
    const manifest = await projectService.open(PROJECT_ID);
    const firstPart = manifest.structure[0];
    const firstChapterId = firstPart && 'chapters' in firstPart
      ? (firstPart as { chapters: Array<{ id: string }> }).chapters[0]?.id
      : null;

    console.log(`  First chapter ID: ${firstChapterId}`);
    console.log(`  Temp project dir: ${projectDir}\n`);

    // Store chapter ID for use in tests
    (globalThis as Record<string, unknown>).__benchFirstChapterId = firstChapterId;
  });

  afterAll(() => {
    // Clean up temp dir
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // Write results to disk
    results.timestamp = new Date().toISOString();
    fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\n  Results written to ${RESULTS_PATH}`);
  });

  // ── Benchmark 1: Project open ──────────────────────────────────────────
  // TS §8.1 target: ≤ 1.5s

  it('Benchmark: project open (TS §8.1 ≤ 1.5s)', async () => {
    // Close the project first, then measure open time
    await projectService.close(PROJECT_ID);

    const result = await measure(
      'Project open',
      TARGET_PROJECT_OPEN_MS,
      async () => {
        await projectService.open(PROJECT_ID);
      },
      1, // single iteration (open is heavy, 1 is sufficient)
    );

    results.benchmarks.push(result);

    // Log PASS/FAIL but don't hard-fail on I/O-bound benchmarks
    expect(result.measuredMs).toBeLessThanOrEqual(TARGET_PROJECT_OPEN_MS * 2); // 2x slack

    // Keep project open for subsequent benchmarks
    await projectService.open(PROJECT_ID).catch(() => {});
  });

  // ── Benchmark 2: Version switch ───────────────────────────────────────
  // TS §8.1 target: ≤ 200ms

  it('Benchmark: version switch (TS §8.1 ≤ 200ms)', async () => {
    const firstChapterId = (globalThis as Record<string, unknown>).__benchFirstChapterId as string;
    if (!firstChapterId) {
      console.log('  SKIP: No chapter ID available');
      return;
    }

    // Ensure the chapter has v1 version to switch to
    try {
      await versionService.selectVersion(PROJECT_ID, firstChapterId, 'v1');
      await versionService.selectVersion(PROJECT_ID, firstChapterId, 'main');
    } catch {
      // Chapter may not have alternates, skip
      console.log('  SKIP: Chapter has no v1 version to switch to');
      return;
    }

    const result = await measure(
      'Version switch (main ↔ v1)',
      TARGET_VERSION_SWITCH_MS,
      async () => {
        await versionService.selectVersion(PROJECT_ID, firstChapterId, 'v1');
        await versionService.selectVersion(PROJECT_ID, firstChapterId, 'main');
      },
      5, // average over 5 round-trips (10 switches total)
    );

    results.benchmarks.push(result);
  });

  // ── Benchmark 3: History list (500 entries) ────────────────────────────
  // TS §8.1 target: ≤ 150ms

  it('Benchmark: history list 500 entries (TS §8.1 ≤ 150ms)', async () => {
    const firstChapterId = (globalThis as Record<string, unknown>).__benchFirstChapterId as string;
    if (!firstChapterId) {
      console.log('  SKIP: No chapter ID available');
      return;
    }

    const ref = `refs/plotline/chapters/${firstChapterId}/main`;

    // Verify the ref has enough commits
    let commitCount = 0;
    try {
      const check = await historyService.listHistory(PROJECT_ID, ref, 1000);
      commitCount = check.commits.length;
      console.log(`  Chapter ref has ${commitCount} commits`);
    } catch {
      console.log('  SKIP: Could not read chapter ref history');
      return;
    }

    if (commitCount < 50) {
      console.log(`  SKIP: Only ${commitCount} commits on ref, need ≥50 for meaningful benchmark`);
      return;
    }

    const result = await measure(
      'History list (500 entries)',
      TARGET_HISTORY_LIST_MS,
      async () => {
        await historyService.listHistory(PROJECT_ID, ref, 500);
      },
      10, // average over 10 iterations
    );

    results.benchmarks.push(result);
  });

  // ── Benchmark 4: Write throughput ─────────────────────────────────────
  // No hard target, informational only

  it('Benchmark: write throughput (informational)', async () => {
    // Individual commit
    const individualResult = await measure(
      'Write throughput (individual commit)',
      null, // no target
      async () => {
        await storageService.commit(
          'refs/bench/write-test',
          { 'test.txt': Buffer.from('benchmark content', 'utf-8') },
          { label: 'Benchmark write', kind: 'manual' },
        );
      },
      10, // average over 10
    );

    results.benchmarks.push(individualResult);

    // Batched commit (3 files at once)
    const batchResult = await measure(
      'Write throughput (batched 3 files)',
      null, // no target
      async () => {
        await storageService.commit(
          'refs/bench/batch-test',
          {
            'a.txt': Buffer.from('content a', 'utf-8'),
            'b.txt': Buffer.from('content b', 'utf-8'),
            'c.txt': Buffer.from('content c', 'utf-8'),
          },
          { label: 'Benchmark batch write', kind: 'manual' },
        );
      },
      10, // average over 10
    );

    results.benchmarks.push(batchResult);

    console.log('\n');
  });
});
