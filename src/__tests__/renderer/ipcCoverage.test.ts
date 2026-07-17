/**
 * IPC command coverage audit — WP-37 AC.
 *
 * Reads every command in IpcCommandMap from src/shared/ipc.ts and asserts
 * that each is reachable from at least one renderer invoke() call site in
 * src/renderer/.  Known exclusions are documented below and serve as the
 * living coverage table — see the `COVERAGE_EXCLUSIONS` set.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── Constants ──────────────────────────────────────────────────────────────

const IPC_FILE = path.resolve(__dirname, '../../shared/ipc.ts');
const RENDERER_DIR = path.resolve(__dirname, '../../renderer');

/**
 * Commands excluded from the reachability requirement.
 *
 * Each entry includes a reason and reversibility tag per DECISIONS.md.
 * Artificially reachable commands (one unused call site created solely
 * to pass CI) are NOT acceptable — add them here with a justification.
 */
const COVERAGE_EXCLUSIONS = new Map<string, string>([

  // Deferred features — outline mutations are local-only for now
  ['outline:mutate', 'Outline mutations are local-only for now. (R2 — restore when outline persistence lands in WP-08b)'],

  // Deferred features — chapter save not wired
  ['chapter:saveArtifact', 'Chapter save deferred to later pass (editor is display-only). (R2 — restore when editable editor lands)'],

  // PDF export — no dialog yet; export:pdf hardcodes templateId
  ['export:listLatexTemplates', 'PDF export dialog not yet built. Template list is unused until dialog exists. (R2 — restore with WP-25 dialog)'],

  // Project library — project:list not yet wired
  ['project:list', 'WP-36 — Project library list view not yet built. (R2 — restore when WP-36 list view lands)'],
]);

// Commands that should appear in the exclusion table but are ALSO reachable
// from the renderer (e.g., the handler exists on main side but the renderer
// calls it too).  These should NOT appear in COVERAGE_EXCLUSIONS — if they
// do, that's a bug.
//
// Currently none.

// ── Helpers ────────────────────────────────────────────────────────────────

/** Extract command names from IpcCommandMap keys in ipc.ts. */
function extractIpcCommands(): string[] {
  const content = fs.readFileSync(IPC_FILE, 'utf-8');

  // Match quoted command names in the interface body:  'command:name': {
  const pattern = /^\s*'([^']+)':\s*\{$/gm;
  const commands: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    commands.push(match[1]!);
  }
  return commands;
}

/** Walk all .ts and .tsx files under a directory recursively. */
function readSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip __tests__, node_modules, etc.
      if (entry.name.startsWith('__')) continue;
      if (entry.name === 'node_modules') continue;
      files.push(...readSourceFiles(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

/** Find all IPC command names called via invoke() in renderer source. */
function findReachableCommands(): Set<string> {
  const commands = new Set<string>();
  const files = readSourceFiles(RENDERER_DIR);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    // Match: invoke('command:name', ...)  or  invoke("command:name", ...)
    const pattern = /\binvoke\s*\(\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      commands.add(match[1]!);
    }
  }

  return commands;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('IPC command coverage audit (WP-37)', () => {
  const allCommands = extractIpcCommands();
  const reachable = findReachableCommands();

  it('every IpcCommandMap entry has a documented status', () => {
    // Every command must either be reachable or have a documented exclusion.
    // Unknown statuses are failures.
    const undocumented: string[] = [];

    for (const cmd of allCommands) {
      // Omit self-test commands from the strict check
      if (cmd === 'ping') continue;
      if (!reachable.has(cmd) && !COVERAGE_EXCLUSIONS.has(cmd)) {
        undocumented.push(cmd);
      }
    }

    if (undocumented.length > 0) {
      expect.fail(
        `IPC commands without known status (${undocumented.length}):\n\n` +
          undocumented.map((c) => `  ${c} — not in renderer, not in COVERAGE_EXCLUSIONS`).join('\n') +
          '\n\n' +
          'Every command must have an invoke() call somewhere in src/renderer/ or be listed in COVERAGE_EXCLUSIONS with a reason.',
      );
    }

    // If we get here, every command is accounted for
    expect(undocumented.length).toBe(0);
  });

  it('COVERAGE_EXCLUSIONS contains only truly unreachable commands', () => {
    // None of the excluded commands should actually be in the renderer.
    // If they are, the exclusion is stale and should be removed.
    const staleExclusions: string[] = [];

    for (const cmd of COVERAGE_EXCLUSIONS.keys()) {
      if (reachable.has(cmd)) {
        staleExclusions.push(cmd);
      }
    }

    if (staleExclusions.length > 0) {
      expect.fail(
        `Stale exclusions (${staleExclusions.length}) — these commands ARE reachable:\n\n` +
          staleExclusions.map((c) => `  ${c} — has invoke() call in renderer, remove from COVERAGE_EXCLUSIONS`).join('\n'),
      );
    }

    expect(staleExclusions.length).toBe(0);
  });

  it('coverage summary table is complete', () => {
    // This test produces the human-readable coverage table on failure.
    // It always "passes" unless there are undocumented commands (caught above).
    // For CI, this prints coverage stats to stdout.

    const total = allCommands.length;
    const reachableCount = allCommands.filter((c) => reachable.has(c)).length;
    const excludedCount = allCommands.filter((c) => !reachable.has(c) && COVERAGE_EXCLUSIONS.has(c)).length;
    const uncoveredCount = allCommands.filter((c) => !reachable.has(c) && !COVERAGE_EXCLUSIONS.has(c)).length;

    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║  WP-37 IPC Coverage Summary                 ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  Total commands:         ${String(total).padEnd(19)}║`);
    console.log(`║  UI-reachable:           ${String(reachableCount).padEnd(19)}║`);
    console.log(`║  Documented exclusions:  ${String(excludedCount).padEnd(19)}║`);
    console.log(`║  Unknown / uncovered:    ${String(uncoveredCount).padEnd(19)}║`);
    console.log('╚══════════════════════════════════════════════╝\n');

    if (excludedCount > 0) {
      console.log('Documented exclusions:');
      for (const [cmd, reason] of COVERAGE_EXCLUSIONS) {
        console.log(`  • ${cmd} — ${reason}`);
      }
      console.log();
    }

    // Pass as long as no uncovered (the first test catches those)
    expect(uncoveredCount).toBe(0);
  });
});

// ── Export for potential reuse ─────────────────────────────────────────────

export { extractIpcCommands, findReachableCommands, COVERAGE_EXCLUSIONS };
