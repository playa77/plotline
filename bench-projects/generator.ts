#!/usr/bin/env npx tsx
/**
 * WP-29 Synthetic book project generator.
 *
 * Creates a Git-backed book project under `bench-projects/synthetic/` with:
 *   - 100 chapters across 10 parts (10 chapters per part)
 *   - Each chapter has 2-4 sections with beats
 *   - 10 versions per chapter (main + 9 alternates)
 *   - ~1 000 commits total
 *   - A valid `project.json` manifest that ProjectService can read
 *
 * The generated repo uses isomorphic-git object writes directly (matching
 * StorageService patterns) for speed, not the FIFO-queued commit path.
 *
 * Run: npx tsx bench-projects/generator.ts
 *
 * Version: 0.1.0 | 2026-07-17
 */

import fs from 'node:fs';
import path from 'node:path';
import git from 'isomorphic-git';
import type { FsClient } from 'isomorphic-git';

// ── Constants ────────────────────────────────────────────────────────────────

const SYNTHETIC_DIR = path.resolve('bench-projects/synthetic');
const NUM_PARTS = 10;
const CHAPTERS_PER_PART = 10;
const VERSIONS_PER_CHAPTER = 10; // main + 9 alternates
const FIRST_CHAPTER_COMMITS = 500;   // chapter 1 gets extra commits for history bench
const OTHER_MAIN_COMMITS = 5;        // chapters 2-100 get 5 commits on main
const ALT_COMMITS = 1;               // alternate versions: 1 commit each (ch1 only)

const TOTAL_CHAPTERS = NUM_PARTS * CHAPTERS_PER_PART; // 100

// ── ULID generator (inline to avoid import complexity in standalone script) ──

let ulidCounter = 0;
const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Generate a deterministic ULID-like ID (not a real ULID, but fits the pattern). */
function generateId(seed: number): string {
  const ts = Date.now().toString(36).toUpperCase().padStart(10, '0');
  const suffix = seed.toString(36).toUpperCase().padStart(16, '0');
  return (ts + suffix).slice(0, 26);
}

// ── Low-level Git helpers (mirror StorageService internals) ──────────────────

/**
 * Write a flat tree from a `path → blobOid` map and return the tree SHA.
 * Recursively handles nested paths.
 */
async function buildTreeFromFlat(
  entries: Record<string, string>,
): Promise<string> {
  const dirs = new Map<string, Record<string, string>>();
  const directBlobs: Array<{ path: string; oid: string }> = [];

  for (const [filepath, oid] of Object.entries(entries)) {
    const slashIdx = filepath.indexOf('/');
    if (slashIdx === -1) {
      directBlobs.push({ path: filepath, oid });
    } else {
      const dirName = filepath.slice(0, slashIdx);
      const subPath = filepath.slice(slashIdx + 1);
      if (!dirs.has(dirName)) dirs.set(dirName, {});
      dirs.get(dirName)![subPath] = oid;
    }
  }

  const tree: Array<{
    mode: string;
    path: string;
    oid: string;
    type: 'blob' | 'tree';
  }> = [];

  for (const { path: p, oid } of directBlobs) {
    tree.push({ mode: '100644', path: p, oid, type: 'blob' });
  }

  for (const [dirName, subFiles] of dirs) {
    const subTreeOid = await buildTreeFromFlat(subFiles);
    tree.push({
      mode: '040000',
      path: dirName,
      oid: subTreeOid,
      type: 'tree',
    });
  }

  return git.writeTree({ fs, dir: SYNTHETIC_DIR, tree });
}

/**
 * Create a single commit on a ref.
 * Low-level — bypasses StorageService's FIFO queue for batch-generation speed.
 */
async function createCommit(
  ref: string,
  files: Record<string, string>,
  message: { label: string; kind: string },
  parentSha?: string,
): Promise<string> {
  // ── 1. Write blobs ──
  const blobOids: Record<string, string> = {};
  for (const [filepath, content] of Object.entries(files)) {
    const blob = new TextEncoder().encode(content);
    blobOids[filepath] = await git.writeBlob({
      fs,
      dir: SYNTHETIC_DIR,
      blob,
    });
  }

  // ── 2. Resolve parent tree as base ──
  let baseMap: Record<string, string> = {};
  if (parentSha) {
    const { commit: parentCommit } = await git.readCommit({
      fs,
      dir: SYNTHETIC_DIR,
      oid: parentSha,
    });
    baseMap = await readTreeMap(parentCommit.tree);
  }

  // ── 3. Apply file changes ──
  for (const [filepath, oid] of Object.entries(blobOids)) {
    baseMap[filepath] = oid;
  }

  // ── 4. Build new tree ──
  const treeOid = await buildTreeFromFlat(baseMap);

  // ── 5. Write commit ──
  const nowSec = Math.floor(Date.now() / 1000);
  const commitMsg = JSON.stringify({ label: message.label, kind: message.kind });

  const commitOid = await git.writeCommit({
    fs,
    dir: SYNTHETIC_DIR,
    commit: {
      message: commitMsg,
      tree: treeOid,
      parent: parentSha ? [parentSha] : [],
      author: { name: 'Plotline', email: 'auto@plotline.local', timestamp: nowSec, timezoneOffset: 0 },
      committer: { name: 'Plotline', email: 'auto@plotline.local', timestamp: nowSec, timezoneOffset: 0 },
    },
  });

  // ── 6. Advance ref ──
  await git.writeRef({ fs, dir: SYNTHETIC_DIR, ref, value: commitOid, force: true });

  return commitOid;
}

/** Recursively read a tree into a flat `path → oid` map. */
async function readTreeMap(treeSha: string, prefix = ''): Promise<Record<string, string>> {
  const { tree } = await git.readTree({ fs, dir: SYNTHETIC_DIR, oid: treeSha });
  const result: Record<string, string> = {};
  for (const entry of tree) {
    const fullPath = prefix ? `${prefix}/${entry.path}` : entry.path;
    if (entry.type === 'tree') {
      const sub = await readTreeMap(entry.oid, fullPath);
      Object.assign(result, sub);
    } else {
      result[fullPath] = entry.oid;
    }
  }
  return result;
}

// ── Content helpers ──────────────────────────────────────────────────────────

/** Generate a section of HTML prose for a given chapter/version. */
function chapterContent(chapterNum: number, versionSlug: string, commitIdx: number): string {
  const paragraphs = [
    `<p>This is paragraph one of chapter ${chapterNum}, version ${versionSlug}, commit ${commitIdx}. The quick brown fox jumps over the lazy dog, demonstrating the breadth of the prose within this synthetic benchmark project.</p>`,
    `<p>As the story unfolds in chapter ${chapterNum}, we encounter a series of events that build upon the narrative foundation established in earlier sections. The protagonist navigates through challenges with determination and grace.</p>`,
    `<p>The setting sun cast long shadows across the landscape, illuminating the path forward. Each step brought new discoveries and unexpected turns that would shape the remainder of the journey.</p>`,
    `<p><strong>Key moment:</strong> This commit (${commitIdx}) on ${versionSlug} represents a checkpoint in the creative process for chapter ${chapterNum}.</p>`,
  ];
  return paragraphs.join('\n');
}

/** Generate section beats for a chapter section. */
function generateBeats(sectionNum: number): string[] {
  const beatTemplates = [
    'Opening scene establishing the mood and setting',
    'Character introduction with key personality traits',
    'Conflict emergence driving the narrative forward',
    'Resolution of the immediate tension',
    'Transition to the following scene',
  ];
  // Pick 2-4 beats per section
  const count = 2 + (sectionNum % 3);
  return beatTemplates.slice(0, count);
}

// ── Generator ────────────────────────────────────────────────────────────────

async function generate(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Generating synthetic project...`);

  // Clean and init repo
  await fs.promises.rm(SYNTHETIC_DIR, { recursive: true, force: true }).catch(() => {});
  await fs.promises.mkdir(SYNTHETIC_DIR, { recursive: true });
  await git.init({ fs, dir: SYNTHETIC_DIR });

  const projectId = generateId(0);
  const now = new Date().toISOString();

  // ── Build structure ──
  const structure: Array<Record<string, unknown>> = [];
  let globalChapterIndex = 0;

  for (let p = 1; p <= NUM_PARTS; p++) {
    const partId = generateId(p * 1000);
    const chapters: Array<Record<string, unknown>> = [];

    for (let c = 1; c <= CHAPTERS_PER_PART; c++) {
      globalChapterIndex++;
      const chapterId = generateId(globalChapterIndex);
      const versionSlugs = ['main', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9'];

      const versions = versionSlugs.map((slug, vi) => ({
        slug,
        name: slug === 'main' ? 'Main' : `Alternate ${vi}`,
        createdAt: now,
        createdFrom: slug === 'main' ? null : { ref: `refs/plotline/chapters/${chapterId}/main`, commit: '' },
        archived: false,
      }));

      chapters.push({
        id: chapterId,
        title: `Chapter ${globalChapterIndex}`,
        selectedVersion: 'main',
        versions,
        wordTarget: null,
      });
    }

    structure.push({
      kind: 'part',
      id: partId,
      title: `Part ${p}`,
      chapters,
    });
  }

  // ── Create project.json manifest ──
  const project = {
    schemaVersion: 2,
    projectId,
    title: 'Synthetic Benchmark Project',
    createdAt: now,
    updatedAt: now,
    settings: {
      continuityContext: { enabled: true, words: 500 },
      models: {
        expand: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-20250514' },
        write: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-20250514' },
        iterate: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-20250514' },
        parse: { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
      },
      inference: { baseUrl: 'https://openrouter.ai/api/v1' },
      theme: 'dark',
      editor: { fontMode: 'serif' },
      backupRemote: null,
    },
    structure,
  };

  const manifestJson = JSON.stringify(project, null, 2);

  // ── Commit initial project.json ──
  let mainSha = await createCommit('refs/heads/main', {
    'project.json': manifestJson,
    'outline/outline.json': JSON.stringify({
      schemaVersion: 1,
      frontMatter: [],
      parts: (project.structure as Array<Record<string, unknown>>).map((part: Record<string, unknown>) => ({
        id: part.id as string,
        title: part.title as string,
        chapters: (part.chapters as Array<Record<string, unknown>>).map((ch: Record<string, unknown>, ci: number) => ({
          chapterId: ch.id as string,
          title: ch.title as string,
          wordTarget: null,
          sections: Array.from({ length: 2 + (ci % 3) }, (_, si) => ({
            id: generateId(globalChapterIndex * 100 + si),
            number: `${(project.structure as Array<Record<string, unknown>>).indexOf(part) + 1}.${ci + 1}.${si + 1}`,
            title: `Section ${si + 1} of Chapter ${ch.title as string}`,
            wordTarget: 500,
            beats: generateBeats(si),
          })),
        })),
      })),
      backMatter: [],
    }, null, 2),
  }, { label: 'Initial project manifest', kind: 'manual' });

  console.log(`  Initial manifest committed: ${mainSha.slice(0, 12)}`);

  // ── Create chapters with versions and commits ──
  let totalCommits = 1; // manifest commit
  let chapterIdx = 0;

  for (let p = 0; p < NUM_PARTS; p++) {
    const part = project.structure[p]!;
    const partChapters = (part as Record<string, unknown>).chapters as Array<Record<string, unknown>>;

    for (let c = 0; c < partChapters.length; c++) {
      chapterIdx++;
      const chapter = partChapters[c]!;
      const chapterId = chapter.id as string;
      const isFirstChapter = chapterIdx === 1;

      // Number of commits for this chapter's main version
      const mainVersionCommits = isFirstChapter ? FIRST_CHAPTER_COMMITS : OTHER_MAIN_COMMITS;

      // ── Create main version commits ──
      let parentSha: string | undefined;
      for (let ci = 0; ci < mainVersionCommits; ci++) {
        const content = chapterContent(chapterIdx, 'main', ci + 1);
        const sha = await createCommit(
          `refs/plotline/chapters/${chapterId}/main`,
          {
            'chapter.html': content,
            'expanded-outline.html': `<h2>${chapter.title}</h2>\n${content}`,
            'meta.json': JSON.stringify({
              schemaVersion: 1,
              chapterId,
              expanded: null,
              chapter: null,
            }),
          },
          { label: isFirstChapter ? `Autosave #${ci + 1}` : `Write chapter ${chapterIdx}`, kind: ci % 3 === 0 ? 'manual' : 'autosave' },
          parentSha,
        );
        parentSha = sha; // chain: each commit's parent is the previous commit
        totalCommits++;
      }

      // ── Create alternate versions ──
      // For chapter 1: create 9 alternate commits (branch from first main commit)
      // For other chapters: alternates are lightweight refs pointing at first main commit
      const versionSlugs = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9'];
      const firstMainSha = parentSha; // commit sha of first commit on main

      for (const vs of versionSlugs) {
        if (firstMainSha) {
          if (isFirstChapter) {
            // Fork from first commit of main with new content
            const content = chapterContent(chapterIdx, vs, 1);
            const { commit: firstMainCommit } = await git.readCommit({
              fs, dir: SYNTHETIC_DIR, oid: firstMainSha,
            });

            const baseMap = await readTreeMap(firstMainCommit.tree);
            const altHtml = `<h2>${chapter.title} (${vs})</h2>\n${content}`;

            const blobOid = await git.writeBlob({
              fs, dir: SYNTHETIC_DIR,
              blob: new TextEncoder().encode(content),
            });
            baseMap['chapter.html'] = blobOid;

            const expandedBlobOid = await git.writeBlob({
              fs, dir: SYNTHETIC_DIR,
              blob: new TextEncoder().encode(altHtml),
            });
            baseMap['expanded-outline.html'] = expandedBlobOid;

            const treeOid = await buildTreeFromFlat(baseMap);
            const nowSec = Math.floor(Date.now() / 1000);
            const commitMsg = JSON.stringify({ label: `Create version ${vs} for chapter ${chapterIdx}`, kind: 'manual' });
            const commitOid = await git.writeCommit({
              fs, dir: SYNTHETIC_DIR,
              commit: {
                message: commitMsg, tree: treeOid,
                parent: [firstMainSha],
                author: { name: 'Plotline', email: 'auto@plotline.local', timestamp: nowSec, timezoneOffset: 0 },
                committer: { name: 'Plotline', email: 'auto@plotline.local', timestamp: nowSec, timezoneOffset: 0 },
              },
            });

            await git.writeRef({
              fs, dir: SYNTHETIC_DIR,
              ref: `refs/plotline/chapters/${chapterId}/${vs}`,
              value: commitOid, force: true,
            });
            totalCommits++;
          } else {
            // Lightweight ref pointing at the first main commit (no extra history)
            await git.writeRef({
              fs, dir: SYNTHETIC_DIR,
              ref: `refs/plotline/chapters/${chapterId}/${vs}`,
              value: firstMainSha, force: true,
            });
          }
        }
      }

      if (chapterIdx % 10 === 0) {
        console.log(`  Generated ${chapterIdx}/${TOTAL_CHAPTERS} chapters (${totalCommits} commits so far)`);
      }
    }
  }

  // ── Update manifest with version metadata (chapter entries already have version slugs) ──
  // The manifest already includes the structure with version entries, but we need
  // to commit a final update with correct timestamps
  const finalManifest = {
    ...project,
    updatedAt: new Date().toISOString(),
  };
  await createCommit(
    'refs/heads/main',
    { 'project.json': JSON.stringify(finalManifest, null, 2) },
    { label: 'Finalize project manifest', kind: 'manual' },
    mainSha,
  );
  totalCommits++;

  console.log(`\n[${new Date().toISOString()}] Generation complete!`);
  console.log(`  Location: ${SYNTHETIC_DIR}`);
  console.log(`  Chapters: ${TOTAL_CHAPTERS}`);
  console.log(`  Total commits: ~${totalCommits}`);
  console.log(`  Parts: ${NUM_PARTS}`);
  console.log(`  Versions per chapter: ${VERSIONS_PER_CHAPTER}`);

  // Print quick stats
  const refs = await git.listRefs({ fs, dir: SYNTHETIC_DIR, filepath: 'refs' });
  const chapterRefs = refs.filter((r) => r.startsWith('refs/plotline/chapters/'));
  console.log(`  Chapter refs: ${chapterRefs.length}`);
  console.log(`  Project manifest: refs/heads/main`);
}

generate().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
