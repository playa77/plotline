# Plotline — Technical Specification

**Document:** 2 of 4 (Design Doc → **Tech Spec** → Roadmap → README)
**Version:** v0.2.0
**Date:** 2026-07-17
**Status:** Active
**Depends on:** Design Doc v0.3.0 (its section numbers are referenced as DD §n)
**Audience:** Coding agent. This document defines *what* to build and the contracts between parts. Library and syntax choices are the agent's unless explicitly constrained.

**Changelog**
- **v0.2.0 (2026-07-17):** Additive, consuming DD v0.3.0: `settings.typography` in the manifest schema (§3.1); `project:pickAndImportOutline` IPC command for the native-file-picker import path (§7.1). No architectural change.
- **v0.1.0 (2026-07-16):** Initial draft.

## 0. Decision Carry-Forward

Design Doc D1–D6 are confirmed. Open questions from DD §12 are adopted as defaults, all R1/R2 reversible:

| # | Adopted default | Tag |
|---|----------------|-----|
| T1 | **Write** receives the final ~500 words of the preceding written chapter as continuity context, toggleable per project in Settings (default on). | R1 |
| T2 | PDF pipeline bundles **Tectonic** (self-contained LaTeX engine); no system TeX dependency. | R2 |
| T3 | Git access via a **plumbing/object-database approach** (spec §2). The agent may use isomorphic-git, nodegit, or shelling to system git behind the storage interface — the interface in §5.1 is the contract, the library is not. | R2 |

---

## 1. Architecture Overview

```
┌──────────────────────────── Electron ────────────────────────────┐
│                                                                  │
│  Renderer (React/TS)                Main (Node.js)               │
│  ┌───────────────────┐   IPC    ┌──────────────────────────┐     │
│  │ UI + state stores │◀───────▶│ Command handlers          │     │
│  │ (no persistence)  │  events  │  ├ StorageService (Git)  │     │
│  └───────────────────┘          │  ├ OutlineService        │     │
│                                 │  ├ VariableService       │     │
│                                 │  ├ GenerationService ────┼──▶ OpenRouter-
│                                 │  ├ ExportService (Tectonic)│   compatible API
│                                 │  └ SettingsService (keychain)  │
│                                 └──────────────────────────┘     │
│                                        │                         │
│                                   Local Git repo (per project)   │
└──────────────────────────────────────────────────────────────────┘
```

Hard rules: the renderer never touches disk, Git, or network — everything crosses the IPC contract (§7). The main process serializes all Git mutations through a single per-project write queue (§5.4). All durable state lives in the Git object database; there is no side database. Anything not reconstructible from the repo (window layout, panel widths) goes in an ephemeral per-project `ui-state.json` outside the repo and is explicitly allowed to be lost.

---

## 2. Git Model — Git as an Object Database, Not a Working Tree

The central technical decision. The Design Doc requires per-chapter independent versions (DD §2.2): Chapter 3 on version *cold-open* while Chapter 7 is on *Main*. A conventional checkout model cannot express this — a working tree is a single global state. Therefore:

**Plotline never relies on working-tree semantics.** The repo is used as a content-addressed store with refs. Reads resolve `ref → commit → tree → blob`; writes construct blobs/trees/commits and advance refs directly. A working tree may exist on disk as an artifact of `git init` but is never the source of truth and never checked out for version switching.

### 2.1 Ref layout

```
refs/heads/main                                   # global line: manifest, book outline, story variables
refs/plotline/chapters/<chapterId>/<versionSlug>  # one ref per chapter version
refs/plotline/archived/<chapterId>/<versionSlug>  # archived versions (rename, never delete)
```

`chapterId` is a ULID assigned at chapter creation, stable across reorder/rename. `versionSlug` is kebab-case, unique within the chapter, derived from the user's version name (collision → numeric suffix).

### 2.2 Tree shapes

**Commits on `main`** contain the global tree:

```
project.json                    # manifest, schema §3.1
outline/outline.json            # structured book outline, schema §3.2
variables/<variableId>/variable.json
variables/<variableId>/content.html
variables/<variableId>/cards/<cardId>.html   # Character/Voice Sheets only
templates/…                     # project-local prompt template overrides (optional)
latex/…                         # user-dropped LaTeX templates (optional)
```

**Commits on a chapter-version ref** contain *only that chapter's pair* — a deliberately tiny tree:

```
expanded-outline.html
chapter.html                    # may be absent before first Write
meta.json                       # provenance + input fingerprints, schema §3.4
```

This makes DD §2.2 structural rather than conventional: a chapter version *cannot* touch another chapter, because its tree contains nothing else. History within a version is the commit chain on its ref. The "composed manuscript" is a logical join performed at read time: manifest (on `main`) lists chapters and each chapter's `selectedVersion`; content is read from that ref's tip.

### 2.3 Operation → Git mapping

| User-facing operation (DD term) | Git realization |
|---|---|
| Save / autosave / generation completes | New commit on the current ref. Commit message = structured JSON: `{label, kind: manual|expand|write|iterate|restore, instruction?, wordDelta}` — the History panel renders from messages alone, no diffing needed for the list view. |
| History (DD §2.3) | `git log` of the current ref. |
| Restore | New commit whose tree = target commit's tree (never reset/rewrite). |
| New Version (from current or from a History point) | New ref created pointing at the chosen commit. |
| Select version | Update `selectedVersion` for that chapter in `project.json` → commit on `main`. |
| Rename version | Create ref with new slug at same commit, delete old ref, update manifest. |
| Archive version | Rename ref into `refs/plotline/archived/…`, update manifest. |
| Compare versions | Read both refs' tips, diff in memory (§8.3). |
| Autosave coalescing | Consecutive `manual` autosaves within a 60 s window in the same session may amend the ref tip instead of stacking commits. Amending is permitted **only** for the session's own unamended autosave tip; never for generation, iterate, or restore commits. |

### 2.4 Staleness computation

Each generation writes input fingerprints into `meta.json` (§3.4): the blob hash of the chapter's outline slice (canonicalized JSON), the blob hashes of every injected variable's content, the upstream artifact's blob hash (for `chapter.html`), and the continuity-context source hash if T1 was active. Staleness (DD §2.4) = recompute current hashes, compare. Computed lazily on read, cached in main-process memory, invalidated by the write queue on any commit touching inputs. Never persisted — it is always derivable.

---

## 3. Data Models

Schemas are normative in shape; the agent chooses the validation mechanism (zod, JSON Schema, hand-rolled) but every IPC boundary and every file read must validate. All JSON files carry `schemaVersion` (integer) for forward migration.

### 3.1 `project.json` (manifest)

```
{
  schemaVersion: 1,
  projectId: ULID,
  title: string,
  createdAt / updatedAt: ISO-8601,
  settings: {
    continuityContext: { enabled: boolean, words: number },   // T1
    models: { expand: ModelRef, write: ModelRef, iterate: ModelRef },
    typography: { uiScale: number /* 0.9–1.5, default 1.0 */,
                  editorFontSize: number /* 16–24 px, default 19 */ },  // v0.2.0, DD §9
    inference: { baseUrl: string }                             // key NOT here — keychain, §9
  },
  structure: [                       // ordered; renders the manuscript tree
    { kind: "part", id: ULID, title: string, chapters: [ChapterEntry] },
    { kind: "chapter", …ChapterEntry }        // chapters outside parts (epilogue etc.)
  ]
}

ChapterEntry = {
  id: ULID,
  title: string,
  selectedVersion: versionSlug,
  versions: [ { slug, name, createdAt, createdFrom: {ref, commit} | null, archived: boolean } ],
  wordTarget: { min: number, max: number } | null
}
```

The manifest duplicates version metadata that also exists as refs; the refs are authoritative for *content*, the manifest for *selection and display names*. A startup reconciliation pass (§5.5) repairs drift.

### 3.2 `outline/outline.json`

Structured Book Outline — source of truth; HTML views are derived, never stored.

```
{
  schemaVersion: 1,
  frontMatter: RichBlock[],                    // anything before Part I
  parts: [ { id, title, chapters: [OutlineChapter] } ],
  backMatter: RichBlock[]
}

OutlineChapter = {
  chapterId: ULID,                             // joins to manifest ChapterEntry
  title: string,
  wordTarget: {min,max} | null,
  sections: [ { id, number: "1.1", title, wordTarget: number|null, beats: string[] } ]
}
```

`RichBlock` is a minimal block model (paragraph | heading | list | table) sufficient to round-trip the reference outline's epilogue/appendix/word-count-summary content.

### 3.3 `variable.json`

```
{
  schemaVersion: 1,
  id: ULID,
  name: string,
  core: "tone" | "style" | "constraints" | "characters" | null,   // null = custom
  scope: "always" | "expand" | "write" | "manual",                 // DD §6
  active: boolean,
  order: number
}
```

### 3.4 `meta.json` (chapter pair provenance)

```
{
  schemaVersion: 1,
  chapterId: ULID,
  expanded: GenRecord | null,      // provenance of expanded-outline.html
  chapter:  GenRecord | null,      // provenance of chapter.html
}

GenRecord = {
  generatedAt, model: ModelRef,
  templateId: string, templateVersion: semver,
  kind: "expand" | "write" | "iterate",
  instruction: string | null,                       // iterate only
  fingerprints: {
    outlineSlice: sha,
    variables: [ {variableId, contentSha} ],
    upstream: sha | null,                            // expanded-outline hash, for chapter
    continuity: { chapterId, sha } | null            // T1
  }
}
```

### 3.5 Artifact HTML

`expanded-outline.html`, `chapter.html`, and variable `content.html` are **Substack-safe HTML** (D4), UTF-8, no `<html>/<head>/<body>` wrapper — a bare block sequence. The allowlist is a single shared constant used by the sanitizer (§6.3), the editor schema, and the exporter:

Elements: `h2 h3 h4 p strong em s a blockquote ul ol li hr img figure figcaption pre code br`. Attributes: `a[href]` (http/https/mailto only), `img[src|alt]` (project-relative or https), `figure/figcaption` plain. Everything else is stripped, not escaped. This constant is the *only* definition of "Substack-safe" in the codebase.

---

## 4. Prompt Template System

### 4.1 Template files

Built-in templates ship in app resources; a project may override by placing same-ID templates under `templates/` on `main` (project overrides win — resolution order: project → built-in). Each template is a directory:

```
templates/<templateId>/template.json    # { id, version: semver, step: expand|write|iterate, description }
templates/<templateId>/system.txt
templates/<templateId>/user.txt
```

`templateId` and `version` are recorded in every `GenRecord` — regenerating with a changed template is detectable provenance, consistent with the fingerprint discipline.

### 4.2 Placeholders

`system.txt`/`user.txt` use `{{placeholder}}` substitution. The engine supports exactly these; an unknown placeholder is a hard error at assembly time, not silent empty string:

| Placeholder | Available in | Content |
|---|---|---|
| `{{book_outline}}` | expand | Full outline rendered to compact structured text |
| `{{chapter_slice}}` | expand, write, iterate | This chapter's outline entry (title, targets, sections, beats) |
| `{{story_variables}}` | all | Assembled variable block, §4.3 |
| `{{upstream_artifact}}` | write, iterate | Expanded outline (for write); for iterate, the stage above the target |
| `{{current_artifact}}` | iterate | The artifact being revised |
| `{{instruction}}` | iterate | The user's iterate instruction |
| `{{continuity_context}}` | write | T1 excerpt, or empty-with-section-elided |
| `{{word_target}}` | expand, write | Formatted target range |
| `{{output_format_contract}}` | all | Shared boilerplate demanding bare Substack-safe HTML output |

Conditional sections: a minimal `{{#if placeholder}}…{{/if}}` so templates elide empty blocks. No loops, no expressions — templates stay auditable.

### 4.3 Variable assembly & injection hygiene

`VariableService.assemble(step)` selects variables where `active && (scope === "always" || scope === step || manuallyToggledOn)`, minus per-generation exclusions from the context rail (DD §6), ordered core-first then by `order`. Each is emitted as a fenced, labeled data block:

```
=== STORY VARIABLE: Tone (core) ===
<content, converted HTML→plain-structured text>
=== END VARIABLE ===
```

The system template's fixed preamble states that variable blocks and manuscript excerpts are **data, not instructions**, and that instructions arrive only outside fenced blocks. User-authored variable content must never be interpolated into system-role text — variables and artifacts are always user-role payload. This is the project's prompt-injection hygiene baseline; templates that violate it fail review.

### 4.4 Workflow assembly (per step)

- **Expand:** `book_outline` + `chapter_slice` + variables(expand) + word_target → expect an expanded chapter outline honoring section structure and per-section word budgets.
- **Write:** `chapter_slice` + `upstream_artifact` (expanded outline) + variables(write) + `continuity_context` + word_target → expect full chapter prose.
- **Iterate:** `current_artifact` + `upstream_artifact` + variables(step of target artifact) + `instruction` → expect the **complete revised artifact**, not a patch. (Full-document output keeps the diff-review step (DD §5.4) simple and model-agnostic; patch formats are a v2 optimization.)

---

## 5. Main-Process Services

### 5.1 StorageService (the Git contract)

The only module that touches the repo. Interface (shapes indicative):

```
readBlob(ref, path) → Buffer
readTree(ref) → {path → sha}
commit(ref, files: {path → Buffer|null /*null=delete*/}, message: CommitMessage, opts?: {amendOwnAutosave?: boolean}) → sha
log(ref, limit, before?) → CommitInfo[]
createRef(newRef, atCommit) / renameRef / listRefs(prefix)
diffTrees(shaA, shaB) → changed paths
```

Everything higher-level (restore, new-version-from-history) composes these. Implementation library is the agent's choice (T3) but must be exercised through this interface exclusively, and the interface must be unit-tested against a throwaway repo fixture.

### 5.2 GenerationService

Owns LLM jobs. `start(step, chapterId, params) → jobId`; streams via events (§7.3); supports `cancel(jobId)`. Pipeline per job: assemble (§4.4) → call inference API with streaming → forward deltas to renderer → on completion: sanitize output (§6.3) → for expand/write, commit to the chapter's current version ref with proper `GenRecord`; **for iterate, do not commit** — hold the proposal in a job-scoped buffer and return it for diff review; commit only on `iterate:accept*`. Cancel mid-stream discards cleanly (expand/write too — partial output is never committed; the stream shown during generation is preview, the commit is the contract). One concurrent job per chapter; queue or reject others with a clear error.

### 5.3 OutlineService, VariableService, ExportService

**OutlineService:** structured mutations over `outline.json` (add/move/edit chapter/section/beats), chapter-slice extraction (canonical serialization → fingerprint), and the **Markdown importer**: a parser targeting the conventions of the reference outline (`LKY_Book_Outline_v0_2.md` is the golden fixture — Parts via `## PART`, chapters via `### Chapter N:` + `**Target: …**`, sections via `#### N.M … *(n words)*`, beats via bullets; unmatched content lands in front/backMatter as RichBlocks, nothing is dropped). Import returns a parse preview (DD F1) before anything is committed.

**VariableService:** CRUD over variables, card handling for Character/Voice Sheets, `assemble(step)`.

**ExportService:** (a) Substack — serialize artifact, run sanitizer as hygiene pass, place on clipboard as `text/html` + plain-text fallback, or save file; (b) Markdown — deterministic HTML→MD conversion + front-matter block; (c) PDF — compose chapters (selected versions, chapter range) → HTML→LaTeX via template mapping → Tectonic render in a temp dir → stream progress/log lines to renderer; on failure surface the full log (DD §8).

### 5.4 Write queue & 5.5 Reconciliation

All mutating operations across services funnel through one FIFO queue per open project — Git has no useful concurrent-writer story and the app doesn't need one. On project open, a reconciliation pass validates manifest↔refs (every manifest version has a ref, every non-archived ref appears in the manifest, `selectedVersion` exists); repairs are conservative (adopt orphan refs into the manifest, never delete) and logged.

---

## 6. Frontend

### 6.1 State management

Lightweight store library of the agent's choice (Zustand-class; Redux acceptable). Constraints that matter more than the library: the renderer is a **cache, never a source of truth** — every store hydrates via IPC and invalidates on main-process events (§7.3); mutations are optimistic only for editor keystrokes, everything else round-trips. Store partition:

`projectStore` (manifest, tree, staleness map) · `editorStore` (open artifact: content, dirty flag, autosave timer) · `generationStore` (jobs: status, streamed text, per-chapter lock) · `iterateStore` (pending proposal + diff decorations) · `versionsStore` / `historyStore` (rail data for current selection) · `variablesStore` · `settingsStore`.

### 6.2 Editor

A ProseMirror-family rich-text editor (TipTap or equivalent — agent's choice) whose **schema is generated from the Substack allowlist constant** (§3.5): the editor structurally cannot produce a non-exportable document. Toolbar/shortcuts expose exactly the allowlist. Required behaviors: streaming append mode during generation (read-only while streaming), diff-decoration mode for iterate review (block-level change highlighting with inline word-level marks), word count vs. target in the status bar, autosave on 2 s idle (feeding §2.3 coalescing), serif reading font for content with the "draft mono" toggle (DD §9).

### 6.3 Sanitizer

One shared module (usable in main process — it runs on LLM output and export) enforcing the allowlist by parse-and-rebuild, not regex. Golden-tested: hostile inputs (scripts, event handlers, styles, data-URIs, nested junk) → clean subset out.

### 6.4 Diff (iterate review & version compare)

Block-level alignment of the two HTML documents (paragraph/heading granularity) with word-level inline diff inside changed blocks. Library choice open; output contract is a decoration list the editor renders. Version compare (DD §7.1) reuses the same engine across two synchronized panes.

---

## 7. IPC Contract

Namespaced request/response commands plus one-way events. All payloads validated on both sides. Errors return `{code, message, detail?}` — never thrown strings. `chapterRef` below = `{chapterId, versionSlug?}` (omitted slug = selected version).

### 7.1 Commands

| Command | Request → Response (essentials) |
|---|---|
| `project:create` / `project:open` / `project:list` / `project:close` | path/title → manifest |
| `project:importOutline` | markdown text (paste path) → ParsePreview; `project:confirmImport(preview)` → committed |
| `project:pickAndImportOutline` | *(v0.2.0)* opens native file dialog in main, reads the chosen `.md`, → ParsePreview (same confirm flow); cancel → `{code: "user-cancelled"}` |
| `outline:get` | → outline.json |
| `outline:mutate` | structured op (add/move/edit/delete at part/chapter/section/beat level) → new outline + affected staleness |
| `chapter:getArtifact` | chapterRef, stage → {html, meta, stale} |
| `chapter:saveArtifact` | chapterRef, stage, html → commit sha (autosave path) |
| `chapter:getStatus` | chapterId → stage dots, staleness, selected version |
| `generate:expand` / `generate:write` | chapterRef, overrides {excludeVariableIds?, asNewVersion?: name} → jobId |
| `generate:iterate` | chapterRef, stage, instruction, overrides → jobId (proposal flow) |
| `generate:cancel` | jobId → ok |
| `iterate:accept` / `iterate:acceptAsVersion` / `iterate:discard` | jobId (+name) → commit/ref result |
| `versions:list` / `versions:create` / `versions:select` / `versions:rename` / `versions:archive` | per DD §7.1; create accepts `{fromCommit?}` for "New Version from here" |
| `versions:compare` | chapterId, slugA, slugB, stage → both htmls + diff decorations |
| `history:list` | chapterRef|globalArtifact, paging → CommitInfo[] |
| `history:preview` / `history:restore` | commit sha → html / new commit |
| `variables:list/get/save/create/setScope/setActive/archive` | per §3.3; save = content commit |
| `export:substack` | chapterRef, mode: clipboard|file → ok/path |
| `export:markdown` | scope: chapter|book → path |
| `export:pdf` | {templateId, chapterRange, options} → jobId (progress via events) |
| `export:listLatexTemplates` | → built-in + project templates |
| `settings:get/set` | manifest.settings subset |
| `secrets:setApiKey/hasApiKey` | via OS keychain (§9); key never crosses to renderer after set |

### 7.2 Design notes on the surface

`asNewVersion` on the generate commands implements the split-button menus (DD §5.1–5.3) atomically — create ref, then generate onto it — so a crash cannot leave a generation on the wrong version. `outline:mutate` is operation-based rather than "save whole document" so that staleness invalidation and History labels are precise; the source-view bulk edit (DD §4) maps to a single `replaceAll` op.

### 7.3 Events (main → renderer)

`generation:token {jobId, delta}` · `generation:done {jobId, result}` · `generation:error {jobId, error}` · `repo:changed {refs[], reason}` (drives store invalidation) · `staleness:changed {chapterIds[]}` · `export:progress {jobId, line}`.

---

## 8. Cross-Cutting Requirements

**8.1 Performance targets.** Project open ≤ 1.5 s for a 100-chapter repo with 1,000 commits; version switch ≤ 200 ms (it is a manifest write + read, no checkout); History list ≤ 150 ms for 500 entries (messages only, no diffs); keystroke latency unaffected by autosave (commits happen off the input path, in the queue).

**8.2 Robustness.** Any crash mid-operation leaves the repo valid: refs advance only after their commit object is fully written (Git's own guarantee — never bypass it with manual file surgery). The write queue persists nothing; an interrupted queued op is simply lost, which is safe because the editor re-sends dirty state.

**8.3 Word counts.** One shared counting function (strip tags → Unicode-aware word segmentation) used by status bar, History deltas, and tree badges — counts must never disagree across surfaces.

---

## 9. Security & Privacy

API key in the OS keychain via Electron `safeStorage`/keytar-equivalent; never in the repo, never in renderer memory after entry, never logged. Network egress: the configured inference `baseUrl` and nothing else — no telemetry, no update pings in v1 (updates are manual downloads). `contextIsolation: true`, `nodeIntegration: false`, single preload exposing exactly the §7 surface. Sanitizer runs on **all** LLM output before it reaches the editor or the repo. LaTeX rendering runs with shell-escape disabled. Git remotes: never configured automatically; a power-user "Add backup remote" in Settings is the only path (DD §11).

---

## 10. Testing Contract (minimum bar for the Roadmap)

Golden fixtures: the reference outline (import round-trip: parse → outline.json → structure assertions), hostile-HTML corpus for the sanitizer, a scripted repo-fixture suite for StorageService covering every row of the §2.3 table (including amend rules and restore-is-a-new-commit). Integration: the one-click contract (DD §5.5) as an automated end-to-end test — import fixture, expand, write, assert artifact pair + provenance + zero dialogs on the happy path — with the LLM behind a deterministic mock. The staleness matrix (edit outline slice / edit each variable scope / edit upstream) as table-driven tests against fingerprint recomputation.

---

*End of Technical Specification v0.1.0. Awaiting confirmation before Document 3: Granular Roadmap.*
