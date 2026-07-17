/**
 * StalenessService tests (WP-20).
 *
 * Each test creates a throwaway projects directory, exercises StalenessService
 * methods against a Git-backed project with outline, variables, and chapter
 * artifacts. No Electron dependency beyond the test mock.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectService } from '../../main/services/ProjectService';
import { VariableService } from '../../main/services/VariableService';
import { StalenessService, computeCanonicalJsonSha, computeBlobSha } from '../../main/services/StalenessService';
import type { StorageService } from '../../main/storage/StorageService';
import type { GenRecord } from '../../shared/schemas/meta';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Fixture data ───────────────────────────────────────────────────────────

const OUTLINE_FIXTURE = {
  schemaVersion: 1,
  frontMatter: [],
  parts: [
    {
      id: 'part_001',
      title: 'Part One',
      chapters: [
        {
          chapterId: 'ch_001',
          title: 'Chapter One',
          wordTarget: null,
          sections: [
            { id: 'sec_001', number: '1.1', title: 'First Steps', wordTarget: null, beats: ['Hero wakes up', 'Hero meets mentor'] },
            { id: 'sec_002', number: '1.2', title: 'The Call', wordTarget: null, beats: ['Mentor gives quest'] },
          ],
        },
        {
          chapterId: 'ch_002',
          title: 'Chapter Two',
          wordTarget: null,
          sections: [
            { id: 'sec_003', number: '2.1', title: 'Departure', wordTarget: null, beats: ['Hero leaves home'] },
          ],
        },
        {
          chapterId: 'ch_003',
          title: 'Chapter Three',
          wordTarget: null,
          sections: [
            { id: 'sec_004', number: '3.1', title: 'Arrival', wordTarget: null, beats: ['Hero arrives'] },
          ],
        },
      ],
    },
  ],
  backMatter: [],
};

const SECTION_SLICE_CH1 = [
  { id: 'sec_001', number: '1.1', title: 'First Steps', wordTarget: null, beats: ['Hero wakes up', 'Hero meets mentor'] },
  { id: 'sec_002', number: '1.2', title: 'The Call', wordTarget: null, beats: ['Mentor gives quest'] },
];

const SECTION_SLICE_CH2 = [
  { id: 'sec_003', number: '2.1', title: 'Departure', wordTarget: null, beats: ['Hero leaves home'] },
];

const SECTION_SLICE_CH3 = [
  { id: 'sec_004', number: '3.1', title: 'Arrival', wordTarget: null, beats: ['Hero arrives'] },
];

/** Compute the expected outlineSlice fingerprint for a set of sections. */
function outlineSha(sections: typeof SECTION_SLICE_CH1): string {
  return computeCanonicalJsonSha(sections);
}

// ── Helper: seed test data ─────────────────────────────────────────────────

async function seedOutline(service: StorageService): Promise<void> {
  await service.commit(
    'refs/heads/main',
    { 'outline/outline.json': Buffer.from(JSON.stringify(OUTLINE_FIXTURE, null, 2), 'utf-8') },
    { label: 'Seed outline', kind: 'manual' },
  );
}

async function seedVariable(
  service: StorageService,
  variableId: string,
  name: string,
  scope: 'always' | 'expand' | 'write' | 'manual',
  content: string,
): Promise<void> {
  const variable = {
    schemaVersion: 2,
    id: variableId,
    name,
    kind: 'custom' as const,
    scope,
    scopeLocked: false,
    deletable: true,
    renamable: true,
    position: 0,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
  };
  await service.commit(
    'refs/heads/main',
    {
      [`variables/${variableId}/variable.json`]: Buffer.from(JSON.stringify(variable, null, 2), 'utf-8'),
      [`variables/${variableId}/content.html`]: Buffer.from(content, 'utf-8'),
    },
    { label: `Seed variable: ${name}`, kind: 'manual' },
  );
}

interface SeedMeta {
  expanded: boolean;
  chapter: boolean;
  expandedFingerprints?: GenRecord['fingerprints'];
  chapterFingerprints?: GenRecord['fingerprints'];
  expandedContent?: string;
  chapterContent?: string;
}

async function seedChapter(
  service: StorageService,
  chapterId: string,
  metaConfig: SeedMeta,
): Promise<void> {
  const expandedContent = metaConfig.expandedContent ?? '<p>Expanded content</p>';
  const chapterContent = metaConfig.chapterContent ?? '<p>Chapter content</p>';
  const files: Record<string, Buffer> = {};

  if (metaConfig.expanded) {
    files['expanded-outline.html'] = Buffer.from(expandedContent, 'utf-8');
  }
  if (metaConfig.chapter) {
    files['chapter.html'] = Buffer.from(chapterContent, 'utf-8');
  }

  const meta = {
    schemaVersion: 1,
    chapterId,
    expanded: metaConfig.expanded
      ? {
          generatedAt: '2026-01-01T00:00:00.000Z',
          model: { provider: 'test', model: 'test-model' },
          templateId: 'default',
          templateVersion: '1.0.0',
          kind: 'expand',
          instruction: null,
          fingerprints: metaConfig.expandedFingerprints ?? metaConfig.chapterFingerprints ?? {
            outlineSlice: '',
            variables: [],
            upstream: null,
            continuity: null,
          },
        }
      : null,
    chapter: metaConfig.chapter
      ? {
          generatedAt: '2026-01-01T00:00:00.000Z',
          model: { provider: 'test', model: 'test-model' },
          templateId: 'default',
          templateVersion: '1.0.0',
          kind: 'write',
          instruction: null,
          fingerprints: metaConfig.chapterFingerprints ?? metaConfig.expandedFingerprints ?? {
            outlineSlice: '',
            variables: [],
            upstream: null,
            continuity: null,
          },
        }
      : null,
  };

  files['meta.json'] = Buffer.from(JSON.stringify(meta, null, 2), 'utf-8');
  await service.commit(
    `refs/plotline/chapters/${chapterId}/main`,
    files,
    { label: 'Seed chapter', kind: 'manual' },
  );
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe('StalenessService', () => {
  let tmpDir: string;
  let projectService: ProjectService;
  let variableService: VariableService;
  let stalenessService: StalenessService;
  let projectId: string;
  let service: StorageService;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-test-stale-'));
    projectService = new ProjectService(tmpDir);
    variableService = new VariableService(projectService);
    stalenessService = new StalenessService(projectService, variableService);

    const project = await projectService.create('Test Book');
    projectId = project.projectId;
    service = projectService.getOpenProject(projectId)!;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Fresh chapter ──────────────────────────────────────────────────────

  describe('fresh chapter', () => {
    it('returns fresh/fresh when no meta.json exists (no generation)', async () => {
      const result = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result).toEqual({ expanded: 'fresh', chapter: 'fresh' });
    });

    it('returns fresh/fresh when generated inputs have not changed', async () => {
      await seedOutline(service);
      await seedVariable(service, 'v_always', 'Tone', 'always', 'Keep it light');
      await seedVariable(service, 'v_expand', 'Setting', 'expand', 'Fantasy world');
      await seedVariable(service, 'v_write', 'Style', 'write', 'Formal tone');
      await seedVariable(service, 'v_manual', 'Notes', 'manual', 'Some notes');

      const expandedContent = '<p>Expanded content</p>';

      // Expand fingerprints: outline slice + always/expand variables, no upstream
      const expandFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [
          { variableId: 'v_always', contentSha: computeBlobSha('Keep it light') },
          { variableId: 'v_expand', contentSha: computeBlobSha('Fantasy world') },
        ],
        upstream: null,
        continuity: null,
      };

      // Chapter fingerprints: outline slice + always/write variables + upstream
      const chapterFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [
          { variableId: 'v_always', contentSha: computeBlobSha('Keep it light') },
          { variableId: 'v_write', contentSha: computeBlobSha('Formal tone') },
        ],
        upstream: computeBlobSha(expandedContent),
        continuity: null,
      };

      await seedChapter(service, 'ch_001', {
        expanded: true,
        chapter: true,
        expandedContent,
        expandedFingerprints: expandFps,
        chapterFingerprints: chapterFps,
      });

      const result = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result).toEqual({ expanded: 'fresh', chapter: 'fresh' });
    });
  });

  // ── Outline slice changes ──────────────────────────────────────────────

  describe('outline slice changes', () => {
    it('marks both expanded and chapter as stale when outline slice changes', async () => {
      await seedOutline(service);
      const expandedContent = '<p>Expanded content</p>';
      const expandFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: null,
        continuity: null,
      };
      const chapterFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: computeBlobSha(expandedContent),
        continuity: null,
      };
      await seedChapter(service, 'ch_001', {
        expanded: true, chapter: true, expandedContent,
        expandedFingerprints: expandFps, chapterFingerprints: chapterFps,
      });

      // Modify the outline slice for ch_001 (add a beat)
      const modifiedOutline = JSON.parse(JSON.stringify(OUTLINE_FIXTURE));
      modifiedOutline.parts[0].chapters[0].sections[0].beats.push('A new beat');
      await service.commit(
        'refs/heads/main',
        { 'outline/outline.json': Buffer.from(JSON.stringify(modifiedOutline, null, 2), 'utf-8') },
        { label: 'Modify outline', kind: 'manual' },
      );

      const result = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result.expanded).toBe('stale');
      expect(result.chapter).toBe('stale');
    });

    it('does not mark stale when a different chapter changes', async () => {
      await seedOutline(service);
      const expandedContent = '<p>Expanded content</p>';
      const expandFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: null,
        continuity: null,
      };
      const chapterFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: computeBlobSha(expandedContent),
        continuity: null,
      };
      await seedChapter(service, 'ch_001', {
        expanded: true, chapter: true, expandedContent,
        expandedFingerprints: expandFps, chapterFingerprints: chapterFps,
      });

      // Modify a different chapter's outline
      const modifiedOutline = JSON.parse(JSON.stringify(OUTLINE_FIXTURE));
      modifiedOutline.parts[0].chapters[1].sections[0].title = 'Changed Title';
      await service.commit(
        'refs/heads/main',
        { 'outline/outline.json': Buffer.from(JSON.stringify(modifiedOutline, null, 2), 'utf-8') },
        { label: 'Modify other chapter', kind: 'manual' },
      );

      const result = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result.expanded).toBe('fresh');
      expect(result.chapter).toBe('fresh');
    });
  });

  // ── Variable changes ───────────────────────────────────────────────────

  describe('variable changes', () => {
    it('marks expanded stale when expand-scoped variable changes', async () => {
      await seedOutline(service);
      await seedVariable(service, 'v_setting', 'Setting', 'expand', 'Fantasy');
      const expandFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [
          { variableId: 'v_setting', contentSha: computeBlobSha('Fantasy') },
        ],
        upstream: null,
        continuity: null,
      };
      await seedChapter(service, 'ch_001', { expanded: true, chapter: false, expandedFingerprints: expandFps });

      // Change the variable content
      await seedVariable(service, 'v_setting', 'Setting', 'expand', 'Sci-Fi');

      const result = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result.expanded).toBe('stale');
      expect(result.chapter).toBe('fresh');
    });

    it('marks chapter stale when write-scoped variable changes', async () => {
      await seedOutline(service);
      await seedVariable(service, 'v_style', 'Style', 'write', 'Formal');
      const chapterFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [
          { variableId: 'v_style', contentSha: computeBlobSha('Formal') },
        ],
        upstream: null,
        continuity: null,
      };
      await seedChapter(service, 'ch_001', { expanded: false, chapter: true, chapterFingerprints: chapterFps });

      await seedVariable(service, 'v_style', 'Style', 'write', 'Informal');

      const result = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result.expanded).toBe('fresh');
      expect(result.chapter).toBe('stale');
    });

    it('marks both stale when always-scoped variable changes', async () => {
      await seedOutline(service);
      await seedVariable(service, 'v_tone', 'Tone', 'always', 'Light');
      const expandFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [
          { variableId: 'v_tone', contentSha: computeBlobSha('Light') },
        ],
        upstream: null,
        continuity: null,
      };
      const chapterFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [
          { variableId: 'v_tone', contentSha: computeBlobSha('Light') },
        ],
        upstream: null,
        continuity: null,
      };
      await seedChapter(service, 'ch_001', {
        expanded: true, chapter: true,
        expandedFingerprints: expandFps, chapterFingerprints: chapterFps,
      });

      await seedVariable(service, 'v_tone', 'Tone', 'always', 'Dark');

      const result = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result.expanded).toBe('stale');
      expect(result.chapter).toBe('stale');
    });

    it('leaves both fresh when manual-scoped variable changes', async () => {
      await seedOutline(service);
      await seedVariable(service, 'v_notes', 'Notes', 'manual', 'Old notes');
      const expandedContent = '<p>Expanded content</p>';
      const expandFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: null,
        continuity: null,
      };
      const chapterFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: computeBlobSha(expandedContent),
        continuity: null,
      };
      await seedChapter(service, 'ch_001', {
        expanded: true, chapter: true, expandedContent,
        expandedFingerprints: expandFps, chapterFingerprints: chapterFps,
      });

      // Manual variable content was not in fingerprints, change shouldn't affect staleness
      await seedVariable(service, 'v_notes', 'Notes', 'manual', 'New notes');

      const result = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result.expanded).toBe('fresh');
      expect(result.chapter).toBe('fresh');
    });

    it('correctly tracks variables when content changes', async () => {
      await seedOutline(service);
      await seedVariable(service, 'v_tone', 'Tone', 'always', 'Light');
      const expandFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [
          { variableId: 'v_tone', contentSha: computeBlobSha('Light') },
        ],
        upstream: null,
        continuity: null,
      };
      await seedChapter(service, 'ch_001', { expanded: true, chapter: false, expandedFingerprints: expandFps });

      // Change the variable content — should mark stale
      await seedVariable(service, 'v_tone', 'Tone', 'always', 'Dark');

      const result = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result.expanded).toBe('stale');
      expect(result.chapter).toBe('fresh');
    });
  });

  // ── Upstream changes ───────────────────────────────────────────────────

  describe('upstream changes', () => {
    it('marks chapter stale when upstream (expanded-outline.html) changes', async () => {
      await seedOutline(service);

      const upstreamContent = '<p>Original expanded</p>';
      const upstreamSha = computeBlobSha(upstreamContent);

      // Write expanded artifact first
      await service.commit(
        'refs/plotline/chapters/ch_001/main',
        { 'expanded-outline.html': Buffer.from(upstreamContent, 'utf-8') },
        { label: 'Seed expanded', kind: 'manual' },
      );

      const chapterFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: upstreamSha,
        continuity: null,
      };
      await seedChapter(service, 'ch_001', { expanded: false, chapter: true, chapterFingerprints: chapterFps });

      // Change expanded-outline.html
      await service.commit(
        'refs/plotline/chapters/ch_001/main',
        { 'expanded-outline.html': Buffer.from('<p>Modified expanded</p>', 'utf-8') },
        { label: 'Modify expanded', kind: 'manual' },
      );

      const result = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result.expanded).toBe('fresh');
      expect(result.chapter).toBe('stale');
    });
  });

  // ── Caching and invalidation ───────────────────────────────────────────

  describe('caching and invalidation', () => {
    it('returns cached result on second call without recomputation', async () => {
      await seedOutline(service);
      const expandedContent = '<p>Expanded content</p>';
      const expandFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: null,
        continuity: null,
      };
      const chapterFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: computeBlobSha(expandedContent),
        continuity: null,
      };
      await seedChapter(service, 'ch_001', {
        expanded: true, chapter: true, expandedContent,
        expandedFingerprints: expandFps, chapterFingerprints: chapterFps,
      });

      // First call — populates cache
      const result1 = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result1).toEqual({ expanded: 'fresh', chapter: 'fresh' });

      // Modify the outline (inputs have changed)
      const modifiedOutline = JSON.parse(JSON.stringify(OUTLINE_FIXTURE));
      modifiedOutline.parts[0].chapters[0].title = 'Renamed Chapter';
      await service.commit(
        'refs/heads/main',
        { 'outline/outline.json': Buffer.from(JSON.stringify(modifiedOutline, null, 2), 'utf-8') },
        { label: 'Rename chapter', kind: 'manual' },
      );

      // Second call — still returns cached value (outline change not seen)
      const result2 = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result2).toEqual({ expanded: 'fresh', chapter: 'fresh' });
    });

    it('recomputes after invalidateAll', async () => {
      await seedOutline(service);
      const expandedContent = '<p>Expanded content</p>';
      const expandFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: null,
        continuity: null,
      };
      const chapterFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: computeBlobSha(expandedContent),
        continuity: null,
      };
      await seedChapter(service, 'ch_001', {
        expanded: true, chapter: true, expandedContent,
        expandedFingerprints: expandFps, chapterFingerprints: chapterFps,
      });

      // Populate cache
      await stalenessService.computeStaleness(projectId, 'ch_001');

      // Modify outline
      const modifiedOutline = JSON.parse(JSON.stringify(OUTLINE_FIXTURE));
      modifiedOutline.parts[0].chapters[0].sections[0].beats.push('New beat');
      await service.commit(
        'refs/heads/main',
        { 'outline/outline.json': Buffer.from(JSON.stringify(modifiedOutline, null, 2), 'utf-8') },
        { label: 'Modify outline', kind: 'manual' },
      );

      // Invalidate and recompute
      stalenessService.invalidateAll();
      const result = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result.expanded).toBe('stale');
      expect(result.chapter).toBe('stale');
    });

    it('supports targeted invalidation for specific chapters', async () => {
      await seedOutline(service);
      const expandedContent = '<p>Expanded content</p>';
      const expandFps1: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: null,
        continuity: null,
      };
      const chapterFps1: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: computeBlobSha(expandedContent),
        continuity: null,
      };
      const expandFps2: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH2),
        variables: [],
        upstream: null,
        continuity: null,
      };
      const chapterFps2: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH2),
        variables: [],
        upstream: computeBlobSha(expandedContent),
        continuity: null,
      };
      await seedChapter(service, 'ch_001', {
        expanded: true, chapter: true, expandedContent,
        expandedFingerprints: expandFps1, chapterFingerprints: chapterFps1,
      });
      await seedChapter(service, 'ch_002', {
        expanded: true, chapter: true, expandedContent,
        expandedFingerprints: expandFps2, chapterFingerprints: chapterFps2,
      });

      await stalenessService.computeStaleness(projectId, 'ch_001');
      await stalenessService.computeStaleness(projectId, 'ch_002');

      // Invalidate only ch_001
      stalenessService.invalidate(projectId, ['ch_001']);

      // Modify ch_001's outline
      const modifiedOutline = JSON.parse(JSON.stringify(OUTLINE_FIXTURE));
      modifiedOutline.parts[0].chapters[0].sections[0].beats.push('New beat');
      await service.commit(
        'refs/heads/main',
        { 'outline/outline.json': Buffer.from(JSON.stringify(modifiedOutline, null, 2), 'utf-8') },
        { label: 'Modify ch1', kind: 'manual' },
      );

      const r1 = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(r1.expanded).toBe('stale');

      // ch_002 should still be fresh (cache hit)
      const r2 = await stalenessService.computeStaleness(projectId, 'ch_002');
      expect(r2.expanded).toBe('fresh');
    });
  });

  // ── Continuity ─────────────────────────────────────────────────────────

  describe('continuity staleness', () => {
    it('marks chapter stale when preceding chapter changes (continuity enabled)', async () => {
      await seedOutline(service);

      // Enable continuity in project settings
      const projectBuf = await service.readBlob('refs/heads/main', 'project.json');
      const manifest = JSON.parse(projectBuf.toString('utf-8'));
      manifest.settings.continuityContext.enabled = true;
      await service.commit(
        'refs/heads/main',
        { 'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') },
        { label: 'Enable continuity', kind: 'manual' },
      );

      // Seed preceding chapter (ch_001) with chapter.html
      await service.commit(
        'refs/plotline/chapters/ch_001/main',
        { 'chapter.html': Buffer.from('<p>Ch1 Chapter</p>', 'utf-8') },
        { label: 'Seed ch1 chapter', kind: 'manual' },
      );

      const precedingSha = computeBlobSha('<p>Ch1 Chapter</p>');

      const chapterFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH2),
        variables: [],
        upstream: null,
        continuity: { chapterId: 'ch_001', sha: precedingSha },
      };
      await seedChapter(service, 'ch_002', { expanded: false, chapter: true, chapterFingerprints: chapterFps });

      // Change preceding chapter's content
      await service.commit(
        'refs/plotline/chapters/ch_001/main',
        { 'chapter.html': Buffer.from('<p>Modified Ch1 Chapter</p>', 'utf-8') },
        { label: 'Modify ch1 chapter', kind: 'manual' },
      );

      const result = await stalenessService.computeStaleness(projectId, 'ch_002');
      expect(result.chapter).toBe('stale');
      expect(result.expanded).toBe('fresh');
    });

    it('does not compute continuity when continuity is disabled', async () => {
      await seedOutline(service);

      // Ensure continuity is disabled
      const projectBuf = await service.readBlob('refs/heads/main', 'project.json');
      const manifest = JSON.parse(projectBuf.toString('utf-8'));
      manifest.settings.continuityContext.enabled = false;
      await service.commit(
        'refs/heads/main',
        { 'project.json': Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') },
        { label: 'Disable continuity', kind: 'manual' },
      );

      // Seed preceding chapter
      await service.commit(
        'refs/plotline/chapters/ch_001/main',
        { 'chapter.html': Buffer.from('<p>Ch1 Chapter</p>', 'utf-8') },
        { label: 'Seed ch1 chapter', kind: 'manual' },
      );

      const chapterFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH2),
        variables: [],
        upstream: null,
        continuity: null, // Was generated with null continuity
      };
      await seedChapter(service, 'ch_002', { expanded: false, chapter: true, chapterFingerprints: chapterFps });

      // Change preceding chapter — shouldn't matter since continuity is disabled
      await service.commit(
        'refs/plotline/chapters/ch_001/main',
        { 'chapter.html': Buffer.from('<p>Modified</p>', 'utf-8') },
        { label: 'Modify ch1', kind: 'manual' },
      );

      const result = await stalenessService.computeStaleness(projectId, 'ch_002');
      expect(result.chapter).toBe('fresh');
    });
  });

  // ── Partial generation ─────────────────────────────────────────────────

  describe('partial generation', () => {
    it('handles expanded-only generation (no chapter.html yet)', async () => {
      await seedOutline(service);
      const expandFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: null,
        continuity: null,
      };
      await seedChapter(service, 'ch_001', { expanded: true, chapter: false, expandedFingerprints: expandFps });

      // Expand is fresh, chapter is fresh (no chapter GenRecord → no staleness check)
      const result = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result.expanded).toBe('fresh');
      expect(result.chapter).toBe('fresh');
    });

    it('handles chapter-only generation (no expanded GenRecord)', async () => {
      await seedOutline(service);

      // Seed the upstream artifact (needed for chapter generation)
      await service.commit(
        'refs/plotline/chapters/ch_001/main',
        { 'expanded-outline.html': Buffer.from('<p>Expanded</p>', 'utf-8') },
        { label: 'Seed expanded', kind: 'manual' },
      );

      const chapterFps: GenRecord['fingerprints'] = {
        outlineSlice: outlineSha(SECTION_SLICE_CH1),
        variables: [],
        upstream: computeBlobSha('<p>Expanded</p>'),
        continuity: null,
      };
      await seedChapter(service, 'ch_001', { expanded: false, chapter: true, chapterFingerprints: chapterFps });

      const result = await stalenessService.computeStaleness(projectId, 'ch_001');
      expect(result.expanded).toBe('fresh'); // No expanded GenRecord → no staleness check
      expect(result.chapter).toBe('fresh');
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws when project is not open', async () => {
      await expect(
        stalenessService.computeStaleness('nonexistent', 'ch_001'),
      ).rejects.toThrow(/Project not open/i);
    });
  });
});

// ── SHA helper unit tests ──────────────────────────────────────────────────

describe('SHA helpers', () => {
  describe('computeCanonicalJsonSha', () => {
    it('produces deterministic output for identical inputs', () => {
      const a = computeCanonicalJsonSha({ b: 2, a: 1 });
      const b = computeCanonicalJsonSha({ a: 1, b: 2 });
      expect(a).toBe(b);
    });

    it('produces different output for different inputs', () => {
      const a = computeCanonicalJsonSha({ a: 1 });
      const b = computeCanonicalJsonSha({ a: 2 });
      expect(a).not.toBe(b);
    });

    it('handles empty arrays', () => {
      const sha = computeCanonicalJsonSha([]);
      expect(sha).toBeTruthy();
      expect(typeof sha).toBe('string');
    });

    it('handles nested objects', () => {
      const input = { outer: { inner: 'value' } };
      const sha = computeCanonicalJsonSha(input);
      expect(sha).toBeTruthy();
    });
  });

  describe('computeBlobSha', () => {
    it('produces deterministic output for identical content', () => {
      const a = computeBlobSha('hello world');
      const b = computeBlobSha('hello world');
      expect(a).toBe(b);
    });

    it('produces different output for different content', () => {
      const a = computeBlobSha('hello');
      const b = computeBlobSha('world');
      expect(a).not.toBe(b);
    });

    it('handles empty string', () => {
      const sha = computeBlobSha('');
      expect(sha).toBeTruthy();
      expect(typeof sha).toBe('string');
    });
  });
});
