# Plotline — Granular Roadmap

**Document:** 3 of 4 (Design Doc → Tech Spec → **Roadmap** → README)
**Version:** v0.1.0
**Date:** 2026-07-16
**Status:** Draft for review
**Depends on:** Design Doc v0.1.0 (DD), Technical Specification v0.1.0 (TS)
**Audience:** Coding agent, executing sequentially from a blank repository.

---

## 0. Execution Conventions

**Sequence.** Work packages (WP) execute in numeric order unless a `Depends` line permits parallelism. Do not start a WP whose dependencies are not accepted.

**Definition of Done, every WP.** (1) All acceptance criteria (AC) pass as automated tests where the AC is testable, or as a demonstrated manual check where it is UI-visual. (2) Type-checks and lints clean. (3) No TODOs referencing the WP's own scope. (4) One commit or PR per WP, message `WP-NN: <title>`, body listing AC status.

**Milestone gates.** Each milestone ends in a review gate (G-Mn) — a stop point producing a short audit pack: what was built, deviations from spec (each tagged R1/R2/R3), open risks, and a runnable demo path. The agent halts at gates for owner approval. Deviating from DD/TS mid-WP without logging it in the audit pack is a process violation.

**Decision ledger.** Maintain `DECISIONS.md` at repo root from WP-00 onward. Every library selection left open by TS (T3 storage lib, store lib, editor lib, diff lib) is recorded there with a one-line rationale and reversibility tag when the choice is made.

**Spec authority.** TS section numbers are the contract. Where this roadmap and TS conflict, TS wins; log the conflict.

---

## Milestone M0 — Skeleton & Storage Bedrock

*Outcome: an Electron app that opens, plus a fully tested Git object-database layer. No UI beyond a shell.*

### WP-00 — Repository scaffold
Initialize the repo: Electron + React + TypeScript toolchain (agent's choice of bundler), strict TS config, lint/format, test runner, `DECISIONS.md`, `CHANGELOG.md` (keep-a-changelog format, app starts at `0.1.0-dev`), CI script running typecheck + tests locally.
**AC:** `npm run dev` opens an empty window titled Plotline; `npm test` runs a placeholder test; `contextIsolation: true`, `nodeIntegration: false` verified in the window (TS §9).

### WP-01 — IPC framework
Preload bridge exposing a typed request/response + event-subscription surface (TS §7 shape, no real commands yet). Payload validation scaffolding on both sides; the `{code, message, detail?}` error envelope; one `ping` command and one `pong` event as the reference implementation.
**AC:** renderer round-trips `ping`; malformed payload is rejected with a structured error, not a throw; event subscription delivers `pong`.
**Depends:** WP-00.

### WP-02 — StorageService: read path
Choose the Git library (record in `DECISIONS.md`, T3). Implement `readBlob`, `readTree`, `log`, `listRefs`, `diffTrees` against TS §5.1, plus repo-fixture test harness (programmatically built throwaway repos).
**AC:** all read methods pass fixture tests including: ref with 500 commits logs ≤ 150 ms (TS §8.1); reading from a chapter-version ref whose tree contains only the pair (TS §2.2).
**Depends:** WP-00.

### WP-03 — StorageService: write path
`commit` (blob/tree/commit construction, ref advance), `createRef`, `renameRef`, deletion-via-null-path, structured JSON commit messages, amend-own-autosave rule (TS §2.3), per-project FIFO write queue (TS §5.4).
**AC:** table-driven tests cover every row of TS §2.3 including: restore creates a new commit with identical tree; amend refuses on non-autosave tips and cross-session tips; 50 concurrent mutation requests serialize without corruption (repo `fsck`-clean); ref advance is atomic (kill-test: interrupting mid-commit never leaves a ref pointing at a missing object).
**Depends:** WP-02.

### WP-04 — Schemas & validation layer
All TS §3 schemas (`project.json`, `outline.json`, `variable.json`, `meta.json`) with `schemaVersion`, validation at every boundary, ULID + versionSlug utilities (slugify, collision suffixing), the shared word-count function (TS §8.3), and the Substack allowlist constant (TS §3.5) as a single exported module.
**AC:** round-trip tests for each schema; slug collision test; word counts identical across three call sites in a shared test; allowlist constant is imported (not duplicated) by a placeholder sanitizer stub.
**Depends:** WP-00.

### 🔒 Gate G-M0
Audit pack + demo: create repo, commit via queue, log, restore, amend behavior — all via a temporary debug command.

---

## Milestone M1 — Project, Outline, Shell

*Outcome: create/open a project, import the reference outline, see and edit it in the three-pane shell.*

### WP-05 — Project lifecycle
`project:create/open/list/close`; manifest creation on `main`; startup reconciliation pass (TS §5.5); ephemeral `ui-state.json` outside the repo.
**AC:** create→close→open round-trip preserves manifest; reconciliation adopts a manually created orphan ref into the manifest and logs it; corrupted manifest fails open with a structured error, not a crash.
**Depends:** WP-03, WP-04.

### WP-06 — Markdown outline importer
Parser per TS §5.3 conventions; `project:importOutline` returning ParsePreview; `project:confirmImport` committing `outline.json` + manifest structure with ULIDs and version scaffolding (each chapter gets version *Main*, empty ref created lazily on first generation — record this lazy-vs-eager choice in `DECISIONS.md`).
**AC (golden):** importing `LKY_Book_Outline_v0_2.md` yields 4 parts, 11 chapters + epilogue, correct word targets (`7,000–8,000` → `{min:7000,max:8000}`), section `1.1` with 4 beats and 1,200-word target; appendix and word-count table land in `backMatter` with zero dropped lines (assert by content-hash coverage).
**Depends:** WP-05.

### WP-07 — App shell & manuscript tree
Three-pane layout (DD §3): Library pane with manuscript tree from manifest+outline (Parts, chapters, expandable sections, stage dots — all hollow for now, word targets), center workspace router, collapsible context rail skeleton. Visual language baseline: IBM Plex Mono chrome, dark theme, semantic-color tokens defined once (DD §9).
**AC:** tree renders the imported reference outline correctly; selection routes the center pane; panel widths persist via `ui-state.json`; zero decorative assets.
**Depends:** WP-05, WP-06 (fixture data).

### WP-08 — Book Outline workspace
Structured view (chapter cards in part groups, inline word-target fields, beat editing, drag-to-reorder) + source-view toggle; `outline:get` / `outline:mutate` with operation-based mutations; delete-with-artifacts warns and archives (DD §4).
**AC:** every `outline:mutate` op type has a test; reorder reflows the tree immediately; each mutation is one commit on `main` with a precise History label; source-view bulk edit maps to `replaceAll`.
**Depends:** WP-07.

### WP-09 — Rich-text editor component
Editor with schema generated from the allowlist constant (TS §6.2): toolbar/shortcuts for exactly the subset, serif content font + draft-mono toggle, word count vs. target in status bar, autosave (2 s idle) wired to `chapter:saveArtifact`-shaped plumbing (target artifact configurable), paste runs through the sanitizer.
**AC:** structurally impossible to produce a non-allowlisted element (paste a hostile HTML corpus → clean subset); autosave commits appear with coalescing per TS §2.3; typing latency unaffected during a commit (measure: input-to-paint under load).
**Depends:** WP-04, WP-10 can proceed in parallel.

### WP-10 — Sanitizer
Parse-and-rebuild sanitizer per TS §6.3, shared main/renderer, driven by the allowlist constant.
**AC:** hostile-corpus golden tests (scripts, handlers, styles, data-URIs, SVG, nested junk, malformed nesting) all pass; property test: sanitize is idempotent.
**Depends:** WP-04.

### 🔒 Gate G-M1
Demo: import the reference outline, browse the tree, edit a beat and a word target, bulk-edit in source view, watch History labels accumulate (via debug log view).

---

## Milestone M2 — Variables & the One-Click Pipeline

*Outcome: the DD §5.5 contract holds — import → Expand → Write, two clicks, no dialogs.*

### WP-11 — Story Variables studio
Variables list (core four seeded on project creation + custom CRUD), variable editor reusing WP-09, card model for Character/Voice Sheets, scope + active controls, per-variable History; `variables:*` commands (TS §7.1).
**AC:** core set present in a new project; custom variable create/rename/archive; scope persists; card add/remove commits correctly.
**Depends:** WP-09.

### WP-12 — Prompt template engine
Template loading with project-over-built-in resolution, `{{placeholder}}` substitution with unknown-placeholder hard error, `{{#if}}` conditionals, `assemble(step)` in VariableService with fencing + user-role discipline (TS §4.3), the `{{output_format_contract}}` boilerplate.
**AC:** unknown placeholder fails assembly with a structured error; scope matrix test (always/expand/write/manual × step) selects exactly per spec; fenced blocks appear only in user-role payload (assert on assembled message array); project template override shadows built-in.
**Depends:** WP-11.

### WP-13 — Built-in templates v1
Author `expand`, `write`, `iterate` templates (TS §4.4): system preambles with the data-not-instructions injunction, user payloads with correct placeholders, word-budget and section-structure demands for expand, continuity handling for write (T1), full-document-output demand for iterate.
**AC:** assembled prompts for each step against the reference-outline fixture snapshot-tested; templates carry `id` + semver; a template-lint test asserts no placeholder outside each step's allowed set (TS §4.2 table).
**Depends:** WP-12.

### WP-14 — Inference client & GenerationService core
Streaming client for the OpenRouter-compatible API (settings-driven baseUrl, model per step), keychain-backed key storage (`secrets:*`, TS §9), GenerationService job lifecycle: start/stream/cancel, one job per chapter, sanitize-on-completion, commit with full `GenRecord` fingerprints (TS §3.4), partial output never committed.
**AC:** against a deterministic mock server — token events stream in order; cancel mid-stream leaves no commit; completion commit contains correct fingerprints (verified by recomputation); key never appears in logs or renderer (grep-test the IPC traffic in the mock run).
**Depends:** WP-12, WP-03.

### WP-15 — Chapter workspace: stages Outline & Expanded, one-click Expand
Chapter workspace with stage tabs and dots; Outline stage (write-through slice editing, DD §5.1); **Expand** primary action with split menu ("Re-expand", "…as new Version" stub disabled until WP-21); streaming into the editor read-only, restore point on completion; `generate:expand` including lazy first-ref creation and `asNewVersion` atomicity (TS §7.2).
**AC:** from fixture project: select chapter → one click → expanded outline exists on `refs/plotline/chapters/<id>/main` with provenance; stage dot fills; stream renders progressively; Stop works.
**Depends:** WP-14, WP-09.

### WP-16 — Stage Chapter & one-click Write
Chapter stage (full editor comforts: minimap, typewriter scroll option, find/replace), **Write** action with dirty-upstream-saves-first rule (DD §5.2), continuity-context assembly (T1: last ~500 words of preceding written chapter, project toggle), `generate:write`.
**AC — the one-click contract (DD §5.5), automated e2e with mocked LLM:** import fixture → Expand → Write; assert artifact pair + both `GenRecord`s + zero dialogs opened on the path; continuity fingerprint present when a preceding chapter has text and toggle is on, absent otherwise.
**Depends:** WP-15.

### 🔒 Gate G-M2 — the contract gate
Demo against a live model (owner's key): the two-click journey on the reference outline, Chapter 1. This gate fails if any dialog, configuration prompt, or manual context step appears on the happy path.

---

## Milestone M3 — Revision: History, Iterate, Versions

*Outcome: DD §2 fully realized — both revision modes, parallel versions, restore from any point.*

### WP-17 — History panel
`history:list/preview/restore` wired to the context rail for every artifact type (chapter stages, outline, variables); labels rendered from structured commit messages, word deltas, hover peek overlay; restore-as-new-commit.
**AC:** list of 500 entries renders ≤ 150 ms from cached messages; restore produces the TS §2.3 semantics (verified tree equality); peek does not mutate anything.
**Depends:** WP-16.

### WP-18 — Diff engine
Block-level HTML alignment + word-level inline diff → decoration list (TS §6.4); editor diff-decoration mode.
**AC:** golden diff fixtures (moved paragraph, edited sentence, deleted section, heading change) produce stable expected decorations; 8,000-word chapter diffs ≤ 300 ms.
**Depends:** WP-09.

### WP-19 — Iterate flow
Iterate panel in the context rail (`Cmd/Ctrl+I`), scope-explicit placeholder text, `generate:iterate` proposal flow (no auto-commit, TS §5.2), diff review with Accept / Accept-as-new-Version (stub until WP-21 → then enabled) / Discard, instruction history dropdown, upstream grounding per TS §4.4.
**AC:** e2e with mock: instruction → proposal streams → diff decorations render → Accept commits with `kind: iterate` + instruction in `GenRecord`; Discard leaves ref untouched; re-run from instruction history reproduces the request payload.
**Depends:** WP-17, WP-18, WP-13.

### WP-20 — Staleness engine
Fingerprint recomputation, lazy cached staleness (TS §2.4), amber dots in tree + stage tabs, **Upstream changed** badge with one-click Regenerate, `staleness:changed` events on outline/variable/upstream commits.
**AC:** the full staleness matrix (TS §10) as table-driven tests: outline-slice edit stales Expanded+Chapter; variable edit stales per its scope; expanded-outline edit stales Chapter only; regenerate clears exactly the regenerated artifact.
**Depends:** WP-16, WP-11.

### WP-21 — Versions
Versions panel: list with created-from notes, New Version (from current and from any History point), Select (manifest commit, ≤ 200 ms switch), Rename, Archive (ref rename into archived namespace); enable the deferred "as new Version" split-menu items in WP-15/16/19; per-chapter selected-version indicator in tree.
**AC:** every row of the versions portion of TS §2.3 tested; two chapters on different selected versions simultaneously (the D1 core case) verified in e2e; archived version invisible in panel, restorable via an "show archived" toggle; version switch never touches other chapters' refs (assert ref set unchanged).
**Depends:** WP-17.

### WP-22 — Version compare
Side-by-side synchronized compare per stage, diff via WP-18, promote-to-selected from either pane (DD §7.1).
**AC:** compare two versions of the fixture chapter; promote updates manifest only; scroll sync holds across unequal-length documents.
**Depends:** WP-21, WP-18.

### 🔒 Gate G-M3
Demo: flow F4 (DD §10) end-to-end — new version, iterate restructure, write, compare, select winner. Plus F5 staleness ripple.

---

## Milestone M4 — Export

### WP-23 — Substack export
`export:substack`: serialize → sanitizer hygiene pass → clipboard as `text/html` + plaintext fallback, or `.html` file; **Copy for Substack** as Chapter-stage primary action (DD §5.3, §8).
**AC:** golden output for the fixture chapter contains only allowlisted constructs; clipboard carries both flavors; manual gate check: paste into Substack renders without cleanup (owner-verified at G-M4).
**Depends:** WP-16.

### WP-24 — Markdown export
Deterministic HTML→MD per chapter and whole book, front-matter block (title/part/version metadata).
**AC:** export→reimport of a generated chapter through the WP-06 parser preserves structure (lossy-fields documented); whole-book export orders by manifest structure and selected versions.
**Depends:** WP-23.

### WP-25 — PDF via Tectonic
Bundle Tectonic (T2); HTML→LaTeX mapping for the allowlist; 3 built-in templates (trade paperback, manuscript submission, A4 article); project `latex/` template discovery; export dialog (template, exposed options, chapter range); render job with progress + full-log-on-failure (DD §8); shell-escape disabled (TS §9).
**AC:** whole fixture book renders to PDF with all three templates; a deliberately broken user template surfaces the LaTeX log in the collapsible pane; chapter-range export respects selected versions; no network access during render (assert egress).
**Depends:** WP-24.

### 🔒 Gate G-M4
Owner pastes an exported chapter into Substack; PDF of the full reference book reviewed.

---

## Milestone M5 — Hardening & Ship

### WP-26 — Command palette & keyboard map
`Cmd/Ctrl+K` palette covering every action including version switching; the full DD §9 shortcut map; palette actions reuse the exact IPC calls of their UI counterparts (no parallel code paths).
**AC:** every DD-named action reachable via palette; shortcut conflict test against Electron/OS defaults.
**Depends:** M3 complete.

### WP-27 — Settings surface
Models per step, inference baseUrl, continuity toggle + word budget, theme, draft-mono default, "Add backup remote" (power-user, plain remote add + manual push button — nothing automatic, TS §9).
**AC:** settings round-trip through manifest; model change reflected in next `GenRecord`; remote misconfiguration errors surface structured, not raw git stderr.
**Depends:** WP-14.

### WP-28 — Error & empty states pass
Sweep every screen for DD §9 empty-state style (one line + one action); every IPC error rendered through one toast/inline component with the `{code,message}` envelope; generation errors leave the editor in the pre-job state.
**AC:** fault-injection checklist (kill mock server mid-stream, revoke key, corrupt a variable file) — each produces a designed state, never a blank pane or console-only error.
**Depends:** all features present.

### WP-29 — Performance & scale pass
Synthetic 100-chapter / 1,000-commit project generator; measure and meet every TS §8.1 target; fix regressions.
**AC:** targets met in CI-recorded benchmark run on reference hardware; results logged in the audit pack.
**Depends:** WP-28.

### WP-30 — Packaging & release 0.1.0
Builds for the owner's platforms (Linux + Windows at minimum; agent confirms targets at G-M4), app icon, `CHANGELOG.md` finalized, `0.1.0` tag, README (Document 4) included at repo root.
**AC:** clean-machine install → F1 through F6 (DD §10) pass manually; version string `0.1.0` everywhere (app, manifest schemaVersion notes, changelog).
**Depends:** WP-29.

### 🔒 Gate G-M5 — release gate
Full audit pack across all milestones; owner sign-off; tag pushed.

---

## Dependency Snapshot

```
M0: 00 → 01, 02 → 03, 04
M1: 05 → 06 → 07 → 08 ; 09,10 (parallel after 04)
M2: 11 → 12 → 13 → 14 → 15 → 16
M3: 17 → 19,21 ; 18 (after 09) → 19,22 ; 20 (after 16) ; 21 → 22
M4: 23 → 24 → 25
M5: 26,27 → 28 → 29 → 30
```

Critical path: 00-03 → 05-06 → 09 → 11-16 → 17 → 21 → 28-30.

---

*End of Granular Roadmap v0.1.0. Awaiting confirmation before Document 4: README.md.*
