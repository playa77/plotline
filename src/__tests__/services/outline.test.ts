/**
 * ProjectService outline read/mutate tests (WP-08a).
 *
 * Each test creates a throwaway projects directory, uses confirmImportOutline
 * to seed an outline, then exercises outlineGet / outlineMutate.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectService } from '../../main/services/ProjectService';
import { StorageService } from '../../main/storage/StorageService';
import type { Outline, OutlineMutation } from '../../shared/schemas/outline';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Commit message helper for test commits. */
const msg = (label: string) => ({ label, kind: 'manual' as const });

/**
 * Build a minimal valid Outline for testing.
 */
function makeOutline(overrides?: Partial<Outline>): Outline {
  return {
    schemaVersion: 1,
    frontMatter: [{ type: 'paragraph', text: 'Front matter' }],
    parts: [
      {
        id: 'part_001',
        title: 'Part One',
        chapters: [
          {
            chapterId: 'ch_001',
            title: 'Chapter 1',
            wordTarget: { min: 1000, max: 3000 },
            sections: [
              { id: 'sec_001', number: '1.1', title: 'Section 1.1', wordTarget: 500, beats: ['Beat A', 'Beat B'] },
              { id: 'sec_002', number: '1.2', title: 'Section 1.2', wordTarget: null, beats: [] },
            ],
          },
          {
            chapterId: 'ch_002',
            title: 'Chapter 2',
            wordTarget: null,
            sections: [
              { id: 'sec_003', number: '2.1', title: 'Section 2.1', wordTarget: 300, beats: ['Beat C'] },
            ],
          },
        ],
      },
      {
        id: 'part_002',
        title: 'Part Two',
        chapters: [
          {
            chapterId: 'ch_003',
            title: 'Chapter 3',
            wordTarget: null,
            sections: [],
          },
        ],
      },
    ],
    backMatter: [{ type: 'paragraph', text: 'Back matter' }],
    ...overrides,
  };
}

/**
 * Helper: create a project, confirm-import the test outline, then close it.
 * Returns the project ID for subsequent open/get calls.
 */
async function createSeededProject(service: ProjectService): Promise<string> {
  const project = await service.create('Outline Test');
  const outline = makeOutline();

  await service.confirmImportOutline(project.projectId, {
    projectTitle: 'Outline Test',
    frontMatter: outline.frontMatter,
    parts: outline.parts.map(p => ({
      id: p.id,
      title: p.title,
      chapters: p.chapters.map(ch => ({
        chapterId: ch.chapterId,
        title: ch.title,
        wordTarget: ch.wordTarget,
        sections: ch.sections.map(s => ({
          id: s.id,
          number: s.number,
          title: s.title,
          wordTarget: s.wordTarget,
          beats: [...s.beats],
        })),
      })),
    })),
    backMatter: outline.backMatter,
    outline,
    structure: outline.parts.map(p => ({
      kind: 'part' as const,
      id: p.id,
      title: p.title,
      chapters: p.chapters.map(ch => ({
        id: ch.chapterId,
        title: ch.title,
        selectedVersion: 'main',
        versions: [],
        wordTarget: ch.wordTarget,
      })),
    })),
  });

  return project.projectId;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('OutlineService (outlineGet / outlineMutate)', () => {
  let tmpDir: string;
  let service: ProjectService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-test-outline-'));
    service = new ProjectService(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── outlineGet ────────────────────────────────────────────────────────

  it('outlineGet returns outline from committed repo', async () => {
    const projectId = await createSeededProject(service);
    const outline = await service.outlineGet(projectId);

    expect(outline.schemaVersion).toBe(1);
    expect(outline.parts).toHaveLength(2);
    expect(outline.parts[0]!.title).toBe('Part One');
    expect(outline.parts[0]!.chapters).toHaveLength(2);
    expect(outline.frontMatter).toHaveLength(1);
    expect(outline.backMatter).toHaveLength(1);
  });

  it('outlineGet throws if project not open', async () => {
    await expect(
      service.outlineGet('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
    ).rejects.toThrow(/Project not open/i);
  });

  it('outlineGet throws if no outline.json committed', async () => {
    const project = await service.create('No Outline');
    const projectId = project.projectId;

    await expect(service.outlineGet(projectId)).rejects.toThrow();
  });

  // ── outlineMutate: rename mutations ───────────────────────────────────

  it('outlineMutate with renamePart — title changes, committed', async () => {
    const projectId = await createSeededProject(service);
    const updated = await service.outlineMutate(projectId, [
      { kind: 'renamePart', partId: 'part_001', title: 'Part One Revised' },
    ]);

    expect(updated.parts[0]!.title).toBe('Part One Revised');
    expect(updated.parts[1]!.title).toBe('Part Two');

    // Verify persistence: get again
    const fetched = await service.outlineGet(projectId);
    expect(fetched.parts[0]!.title).toBe('Part One Revised');
  });

  it('outlineMutate with renameChapter — title changes', async () => {
    const projectId = await createSeededProject(service);
    const updated = await service.outlineMutate(projectId, [
      { kind: 'renameChapter', chapterId: 'ch_001', title: 'Chapter 1 Revised' },
    ]);

    const ch1 = updated.parts[0]!.chapters.find(ch => ch.chapterId === 'ch_001');
    expect(ch1?.title).toBe('Chapter 1 Revised');
    const ch2 = updated.parts[0]!.chapters.find(ch => ch.chapterId === 'ch_002');
    expect(ch2?.title).toBe('Chapter 2');
  });

  it('outlineMutate with renameSection — title changes', async () => {
    const projectId = await createSeededProject(service);
    const updated = await service.outlineMutate(projectId, [
      { kind: 'renameSection', sectionId: 'sec_001', title: 'Section 1.1 Revised' },
    ]);

    const sec = updated.parts[0]!.chapters[0]!.sections.find(s => s.id === 'sec_001');
    expect(sec?.title).toBe('Section 1.1 Revised');
  });

  // ── outlineMutate: reorder mutations ──────────────────────────────────

  it('outlineMutate with reorderPart — order changes', async () => {
    const projectId = await createSeededProject(service);

    // Move part_002 (index 1) to index 0
    const updated = await service.outlineMutate(projectId, [
      { kind: 'reorderPart', partId: 'part_002', newIndex: 0 },
    ]);

    expect(updated.parts[0]!.id).toBe('part_002');
    expect(updated.parts[1]!.id).toBe('part_001');
  });

  it('outlineMutate with reorderChapter — chapter moves to another part', async () => {
    const projectId = await createSeededProject(service);

    // Move ch_003 from Part Two (index 1) to Part One (index 0) at position 0
    const updated = await service.outlineMutate(projectId, [
      { kind: 'reorderChapter', chapterId: 'ch_003', targetPartId: 'part_001', newIndex: 0 },
    ]);

    // Part One should now have 3 chapters, with ch_003 first
    const partOne = updated.parts.find(p => p.id === 'part_001')!;
    expect(partOne.chapters).toHaveLength(3);
    expect(partOne.chapters[0]!.chapterId).toBe('ch_003');

    // Part Two should have 0 chapters
    const partTwo = updated.parts.find(p => p.id === 'part_002')!;
    expect(partTwo.chapters).toHaveLength(0);
  });

  it('outlineMutate with reorderSection — section moves to new index', async () => {
    const projectId = await createSeededProject(service);

    // Move sec_002 (index 1) to index 0 in chapter ch_001
    const updated = await service.outlineMutate(projectId, [
      { kind: 'reorderSection', sectionId: 'sec_002', chapterId: 'ch_001', newIndex: 0 },
    ]);

    const ch1 = updated.parts[0]!.chapters.find(ch => ch.chapterId === 'ch_001')!;
    expect(ch1.sections[0]!.id).toBe('sec_002');
    expect(ch1.sections[1]!.id).toBe('sec_001');
  });

  // ── outlineMutate: delete mutations ───────────────────────────────────

  it('outlineMutate with deletePart — part removed', async () => {
    const projectId = await createSeededProject(service);
    const updated = await service.outlineMutate(projectId, [
      { kind: 'deletePart', partId: 'part_002' },
    ]);

    expect(updated.parts).toHaveLength(1);
    expect(updated.parts[0]!.id).toBe('part_001');
  });

  it('outlineMutate with deleteChapter — chapter removed', async () => {
    const projectId = await createSeededProject(service);
    const updated = await service.outlineMutate(projectId, [
      { kind: 'deleteChapter', chapterId: 'ch_002' },
    ]);

    const partOne = updated.parts.find(p => p.id === 'part_001')!;
    expect(partOne.chapters).toHaveLength(1);
    expect(partOne.chapters[0]!.chapterId).toBe('ch_001');
  });

  it('outlineMutate with deleteSection — section removed', async () => {
    const projectId = await createSeededProject(service);
    const updated = await service.outlineMutate(projectId, [
      { kind: 'deleteSection', sectionId: 'sec_001' },
    ]);

    const ch1 = updated.parts[0]!.chapters.find(ch => ch.chapterId === 'ch_001')!;
    expect(ch1.sections).toHaveLength(1);
    expect(ch1.sections[0]!.id).toBe('sec_002');
  });

  // ── outlineMutate: add mutations ──────────────────────────────────────

  it('outlineMutate with addPart — new part appended', async () => {
    const projectId = await createSeededProject(service);
    const updated = await service.outlineMutate(projectId, [
      { kind: 'addPart', part: { id: 'part_003', title: 'Part Three', chapters: [] } },
    ]);

    expect(updated.parts).toHaveLength(3);
    expect(updated.parts[2]!.id).toBe('part_003');
    expect(updated.parts[2]!.title).toBe('Part Three');
  });

  it('outlineMutate with addChapter — new chapter under existing part', async () => {
    const projectId = await createSeededProject(service);
    const updated = await service.outlineMutate(projectId, [
      {
        kind: 'addChapter',
        chapter: {
          chapterId: 'ch_new',
          title: 'New Chapter',
          wordTarget: { min: 1500, max: 4000 },
          sections: [],
        },
        partId: 'part_001',
      },
    ]);

    const partOne = updated.parts.find(p => p.id === 'part_001')!;
    expect(partOne.chapters).toHaveLength(3);
    const newCh = partOne.chapters.find(ch => ch.chapterId === 'ch_new')!;
    expect(newCh.title).toBe('New Chapter');
    expect(newCh.wordTarget).toEqual({ min: 1500, max: 4000 });
    expect(newCh.sections).toEqual([]);
  });

  it('outlineMutate with addSection — new section under existing chapter', async () => {
    const projectId = await createSeededProject(service);
    const updated = await service.outlineMutate(projectId, [
      {
        kind: 'addSection',
        section: {
          id: 'sec_new',
          number: '1.3',
          title: 'Section 1.3',
          wordTarget: 600,
          beats: ['New beat'],
        },
        chapterId: 'ch_001',
      },
    ]);

    const ch1 = updated.parts[0]!.chapters.find(ch => ch.chapterId === 'ch_001')!;
    expect(ch1.sections).toHaveLength(3);
    const newSec = ch1.sections.find(s => s.id === 'sec_new')!;
    expect(newSec.title).toBe('Section 1.3');
    expect(newSec.wordTarget).toBe(600);
    expect(newSec.beats).toEqual(['New beat']);
  });

  // ── outlineMutate: beat mutations ─────────────────────────────────────

  it('outlineMutate with updateBeat — beat text changes', async () => {
    const projectId = await createSeededProject(service);
    const updated = await service.outlineMutate(projectId, [
      { kind: 'updateBeat', sectionId: 'sec_001', beatIndex: 0, newText: 'Updated Beat A' },
    ]);

    const sec001 = updated.parts[0]!.chapters[0]!.sections.find(s => s.id === 'sec_001')!;
    expect(sec001.beats[0]).toBe('Updated Beat A');
    expect(sec001.beats[1]).toBe('Beat B');
  });

  it('outlineMutate with addBeat — beat inserted', async () => {
    const projectId = await createSeededProject(service);

    // Append a beat (no atIndex)
    const updated1 = await service.outlineMutate(projectId, [
      { kind: 'addBeat', sectionId: 'sec_001', text: 'Beat C' },
    ]);
    const sec1 = updated1.parts[0]!.chapters[0]!.sections.find(s => s.id === 'sec_001')!;
    expect(sec1.beats).toHaveLength(3);
    expect(sec1.beats[2]).toBe('Beat C');

    // Insert at index 1
    const updated2 = await service.outlineMutate(projectId, [
      { kind: 'addBeat', sectionId: 'sec_001', text: 'Beat X', atIndex: 1 },
    ]);
    const sec2 = updated2.parts[0]!.chapters[0]!.sections.find(s => s.id === 'sec_001')!;
    expect(sec2.beats).toHaveLength(4);
    expect(sec2.beats[1]).toBe('Beat X');
  });

  it('outlineMutate with removeBeat — beat removed', async () => {
    const projectId = await createSeededProject(service);
    const updated = await service.outlineMutate(projectId, [
      { kind: 'removeBeat', sectionId: 'sec_001', beatIndex: 0 },
    ]);

    const sec001 = updated.parts[0]!.chapters[0]!.sections.find(s => s.id === 'sec_001')!;
    expect(sec001.beats).toHaveLength(1);
    expect(sec001.beats[0]).toBe('Beat B');
  });

  // ── outlineMutate: edge cases ─────────────────────────────────────────

  it('outlineMutate with empty mutations array rejects', async () => {
    const projectId = await createSeededProject(service);
    await expect(
      service.outlineMutate(projectId, []),
    ).rejects.toThrow(/At least one mutation/i);
  });

  it('outlineMutate validates resulting outline (invalid mutations do not corrupt data)', async () => {
    const projectId = await createSeededProject(service);

    // Delete a section that exists — should work
    const updated = await service.outlineMutate(projectId, [
      { kind: 'deleteSection', sectionId: 'nonexistent' },
    ]);

    // No change since section wasn't found, but validation still passes
    expect(updated.parts[0]!.chapters[0]!.sections).toHaveLength(2);
  });

  it('outlineMutate roundtrip: get → mutate → get → verify mutation persisted', async () => {
    const projectId = await createSeededProject(service);

    // 1. Initial get
    const initial = await service.outlineGet(projectId);
    expect(initial.parts).toHaveLength(2);

    // 2. Mutate: rename part, add chapter, rename section
    const mutated = await service.outlineMutate(projectId, [
      { kind: 'renamePart', partId: 'part_001', title: 'Book One' },
      {
        kind: 'addChapter',
        chapter: { chapterId: 'ch_extra', title: 'Extra', wordTarget: null, sections: [] },
        partId: 'part_001',
      },
      { kind: 'renameSection', sectionId: 'sec_001', title: 'Intro' },
    ]);

    expect(mutated.parts[0]!.title).toBe('Book One');
    expect(mutated.parts[0]!.chapters).toHaveLength(3);
    expect(mutated.parts[0]!.chapters[2]!.chapterId).toBe('ch_extra');
    expect(mutated.parts[0]!.chapters[0]!.sections[0]!.title).toBe('Intro');

    // 3. Re-fetch and verify persistence
    const refetched = await service.outlineGet(projectId);
    expect(refetched.parts[0]!.title).toBe('Book One');
    expect(refetched.parts[0]!.chapters).toHaveLength(3);
    expect(refetched.parts[0]!.chapters[0]!.sections[0]!.title).toBe('Intro');
  });
});
