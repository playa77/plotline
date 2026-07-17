/**
 * AppStateService tests.
 *
 * Each test creates a throwaway temp directory for app-state.json,
 * exercises AppStateService, then cleans up. No Electron dependency.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AppStateService } from '../../main/services/AppStateService';

describe('AppStateService', () => {
  let tmpDir: string;
  let service: AppStateService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-test-appstate-'));
    service = new AppStateService(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Empty state ─────────────────────────────────────────────────────────

  it('getRecents returns empty array when no file exists', async () => {
    const recents = await service.getRecents();
    expect(recents).toEqual([]);
  });

  // ── Add and sort ────────────────────────────────────────────────────────

  it('addRecent adds entries and sorts by lastOpened descending', async () => {
    await service.addRecent('proj-b', 'Project B');
    // Small delay so timestamps differ
    await new Promise((r) => setTimeout(r, 5));
    await service.addRecent('proj-a', 'Project A');

    const recents = await service.getRecents();
    expect(recents).toHaveLength(2);
    expect(recents[0]!.projectId).toBe('proj-a'); // most recent first
    expect(recents[1]!.projectId).toBe('proj-b');
    expect(recents[0]!.title).toBe('Project A');
    expect(recents[1]!.title).toBe('Project B');
  });

  // ── Upsert same projectId ───────────────────────────────────────────────

  it('addRecent with same projectId updates title and moves to top', async () => {
    await service.addRecent('proj-1', 'Original Title');
    await new Promise((r) => setTimeout(r, 5));
    await service.addRecent('proj-2', 'Project Two');
    await new Promise((r) => setTimeout(r, 5));

    // Re-add proj-1 with a new title
    await service.addRecent('proj-1', 'Updated Title');

    const recents = await service.getRecents();
    expect(recents).toHaveLength(2);
    expect(recents[0]!.projectId).toBe('proj-1');
    expect(recents[0]!.title).toBe('Updated Title');
    expect(recents[1]!.projectId).toBe('proj-2');
  });

  it('addRecent with wordCount stores and updates it', async () => {
    await service.addRecent('proj-wc', 'Word Count Test', 1500);
    const recents = await service.getRecents();
    expect(recents[0]!.wordCount).toBe(1500);

    await service.addRecent('proj-wc', 'Word Count Test', 2500);
    const updated = await service.getRecents();
    expect(updated[0]!.wordCount).toBe(2500);
  });

  // ── Remove ──────────────────────────────────────────────────────────────

  it('removeRecent removes an entry and perserves others', async () => {
    await service.addRecent('proj-a', 'Project A');
    await service.addRecent('proj-b', 'Project B');
    await service.addRecent('proj-c', 'Project C');

    await service.removeRecent('proj-b');

    const recents = await service.getRecents();
    expect(recents).toHaveLength(2);
    expect(recents.find((r) => r.projectId === 'proj-b')).toBeUndefined();
  });

  it('removeRecent is idempotent when projectId is not in recents', async () => {
    await service.addRecent('proj-a', 'Project A');
    await service.removeRecent('nonexistent');
    const recents = await service.getRecents();
    expect(recents).toHaveLength(1);
    expect(recents[0]!.projectId).toBe('proj-a');
  });

  // ── Active project round-trip ───────────────────────────────────────────

  it('setActiveProject/getActiveProject round-trip', async () => {
    const resultBefore = await service.getActiveProject();
    expect(resultBefore).toBeNull();

    await service.setActiveProject('proj-active', 'Active Project');

    const result = await service.getActiveProject();
    expect(result).not.toBeNull();
    expect(result!.projectId).toBe('proj-active');
    expect(result!.title).toBe('Active Project');
  });

  it('setActiveProject also adds to recents', async () => {
    await service.setActiveProject('proj-active', 'Active Title');

    const recents = await service.getRecents();
    expect(recents).toHaveLength(1);
    expect(recents[0]!.projectId).toBe('proj-active');
    expect(recents[0]!.title).toBe('Active Title');
  });

  // ── Max recents cap ─────────────────────────────────────────────────────

  it('caps recents at 10 entries', async () => {
    for (let i = 0; i < 12; i++) {
      await service.addRecent(`proj-${i}`, `Project ${i}`);
    }

    const recents = await service.getRecents();
    expect(recents).toHaveLength(10);
  });
});
