# Plotline — Granular Roadmap

**Document:** 3 of 4 (Design Doc → Tech Spec → **Roadmap** → README)
**Version:** v0.3.0
**Date:** 2026-07-17
**Status:** Active
**Depends on:** Design Doc **v0.3.0** (DD), Technical Specification **v0.2.0** (TS)

**Changelog**
- **v0.3.0 (2026-07-17):** **WP-34 (Import UI)** and **WP-35 (Typography & accessibility settings)** added to M6; WP-33 re-scoped to depend on them; G-M6 unchanged in spirit but now covers the full set. Root-cause note: WP-06's AC were backend-only and no WP owned the import *UI* — the sole safety net was WP-30's manual F1 check, which was executed unattended. New process rule in §0: **manual acceptance criteria may only be checked off by the owner, never by the agent.**
- **v0.2.0 (2026-07-17):** Milestone **M6 — Visual Remediation** added (WP-31–WP-33, gate G-M6) with a contrast-verified reference token set. Context: WP-00–WP-30 are fully implemented; the DD v0.2.0 §9 rewrite therefore executes against a shipped codebase and targets app release **0.2.0**. Gates are owner-present by definition.
- **v0.1.1 (2026-07-17):** WP-07 and WP-09 amended to consume DD v0.2.0 §9.
- **v0.1.0 (2026-07-16):** Initial plan.
**Audience:** Coding agent, executing sequentially from a blank repository.

---

## 0. Execution Conventions

**Sequence.** Work packages (WP) execute in numeric order unless a `Depends` line permits parallelism. Do not start a WP whose dependencies are not accepted.

**Definition of Done, every WP.** (1) All acceptance criteria (AC) pass as automated tests where the AC is testable, or as a demonstrated manual check where it is UI-visual. (2) Type-checks and lints clean. (3) No TODOs referencing the WP's own scope. (4) One commit or PR per WP, message `WP-NN: <title>`, body listing AC status. (5) *(v0.3.0)* **Manual ACs are owner-only:** the agent marks them `PENDING-OWNER`, never `PASS`. A WP with pending manual ACs may be built upon but is not Done, and no release WP may complete while any `PENDING-OWNER` item exists.

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
Three-pane layout (DD §3): Library pane with manuscript tree from manifest+outline (Parts, chapters, expandable sections, stage dots — all hollow for now, word targets), center workspace router, collapsible context rail skeleton. Visual language baseline per DD v0.2.0 §9: proportional sans chrome (≥ 14 px base, ≥ 13 px tree rows), light theme default with dark as an independent token set, monospace nowhere in chrome, semantic-color tokens defined once.
**AC:** tree renders the imported reference outline correctly; selection routes the center pane; panel widths persist via `ui-state.json`; zero decorative assets; **automated contrast assertions over the full token set — long-form text ≥ 7:1, chrome text ≥ 4.5:1, non-text UI ≥ 3:1 — wired into the test suite so a failing token fails CI**; no font-size token below the DD §9 minima (asserted).
**Depends:** WP-05, WP-06 (fixture data).

### WP-08 — Book Outline workspace
Structured view (chapter cards in part groups, inline word-target fields, beat editing, drag-to-reorder) + source-view toggle; `outline:get` / `outline:mutate` with operation-based mutations; delete-with-artifacts warns and archives (DD §4).
**AC:** every `outline:mutate` op type has a test; reorder reflows the tree immediately; each mutation is one commit on `main` with a precise History label; source-view bulk edit maps to `replaceAll`.
**Depends:** WP-07.

### WP-09 — Rich-text editor component
Editor with schema generated from the allowlist constant (TS §6.2): toolbar/shortcuts for exactly the subset, serif content per DD v0.2.0 §9 (≥ 18 px, line-height ≈ 1.6, 60–75 ch measure) with the opt-in draft-mono toggle off by default and scoped to content only, word count vs. target in status bar, autosave (2 s idle) wired to `chapter:saveArtifact`-shaped plumbing (target artifact configurable), paste runs through the sanitizer.
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

## Milestone M6 — Visual Remediation *(added in v0.2.0; executes against the shipped 0.1.0 codebase)*

*Outcome: the app conforms to DD v0.2.0 §9. Target release: app `0.2.0`. Rationale: WP-07/WP-09 were built to the retired v0.1.0 visual language; the defect is eye strain during long-form work (mono chrome, small sizes, ~3:1 dark palette).*

### WP-31 — Token set & contrast CI
Replace `tokens.css` with two independent, DD-conformant theme sets. The reference values below are **verified** (WCAG ratios computed, all ≥ minima); the agent may adjust hues for taste but no substitution may fall below its row's requirement — enforced by the new CI suite. Swap the chrome font stack to Inter or the native system UI stack (ledger the pick); remove every monospace `font-family` outside code-context selectors (LaTeX log pane, debug views). Light theme becomes default; theme choice persists per project in `ui-state.json`. Add the contrast assertion suite and font-size minima assertions to CI (amended WP-07 AC).

**Reference tokens (verified):**

| Token | Light | Dark | Ratio req. | Verified L / D |
|---|---|---|---|---|
| surface | `#FBF9F6` | `#151619` | — | — |
| surface-raised | `#F2EFE9` | `#1D1F23` | — | — |
| text-primary (on surface) | `#1C1B19` | `#ECEAE5` | ≥ 7:1 | 16.4 / 15.1 |
| text-primary (on raised) | `#1C1B19` | `#ECEAE5` | ≥ 7:1 | 15.0 / 13.7 |
| text-secondary | `#504E49` | `#ADAAA2` | ≥ 4.5:1 | 7.9 / 7.8 |
| accent (as text on surface) | `#155DA4` | `#7FB4E8` | ≥ 4.5:1 | 6.4 / 8.3 |
| text on accent (buttons) | `#FFFFFF` on accent | — | ≥ 4.5:1 | 6.7 / — |
| staleness amber (text/icon) | `#7A4E00` | `#E3AC52` | ≥ 4.5:1 | 6.9 / 8.9 |
| diff-added-bg (under text-primary) | `#DFF0E0` | `#22392A` | ≥ 7:1 | 14.5 / 10.4 |
| diff-removed-bg (under text-primary) | `#F9E2E0` | `#42272A` | ≥ 7:1 | 13.9 / 11.2 |
| border / non-text UI | `#8F8B82` | `#6A6C72` | ≥ 3:1 | 3.2 / 3.5 |

**AC:** contrast suite green over the *actual shipped* token set (not just the reference); repo-wide grep proves no mono chrome; light default verified on a fresh project; both themes screenshot-swept into the audit pack; no `font-size` token below DD §9 minima (asserted).
**Depends:** DD v0.2.0.

### WP-32 — Content typography & semantic-color rewire
Editor content per amended WP-09 AC: ≥ 18 px serif, line-height ≈ 1.6, 60–75 ch measure (responsive clamp), draft-mono toggle off-by-default and scoped to editor content only. Re-derive every semantic-color consumer against the new tokens in **both** themes: stage dots, staleness badges, diff decorations (the dark-era green/red will not survive a light surface — use the verified diff-bg tokens), focus rings, selection color, streaming-cursor.
**AC:** amended WP-09 AC pass; WP-18 diff golden fixtures re-rendered and legible in both themes; measure holds from 900 px to full-screen; tree rows ≥ 13 px verified.
**Depends:** WP-31.

### WP-34 — Import UI *(added v0.3.0 — closes the dead-instruction defect)*
Build the renderer side of the import pipeline per DD v0.3.0 §4: implement `project:pickAndImportOutline` (TS v0.2.0 §7.1, native file dialog in main); import dialog with file-picker primary + paste-markdown fallback; **ParsePreview rendering** (parts/chapters/sections with word targets and per-level counts, Confirm/Cancel); wire it into all three affordance points — New Project flow step, every empty state currently naming import (as real buttons), and a command palette action; on Confirm call `project:confirmImport` and route to the populated tree.
**AC:** e2e *through the actual UI*: launch → New Project → Import → pick the LKY fixture file → preview asserts "4 parts · 11 chapters" and correct targets → Confirm → manuscript tree populates (this replaces the IPC-driven import step in the F1/one-click e2e — the e2e now exercises the UI path); paste-fallback e2e with the same fixture as a string; cancel at both dialog stages commits nothing (repo ref-set unchanged); **dead-instruction audit**: a test walks every empty state and asserts any "import" mention has an adjacent functional control; palette entry invokes the same action object as the buttons (no parallel code path).
**Depends:** none within M6 (may run parallel to WP-31/32). Blocks G-M6.

### WP-35 — Typography & accessibility settings *(added v0.3.0)*
Implement DD v0.3.0 §9 user typography controls: `settings.typography` schema (TS v0.2.0 §3.1) with migration defaulting existing projects to `{uiScale: 1.0, editorFontSize: 19}`; Settings UI with the two controls; live application without restart (chrome scale via root token multiplication, editor size via editor tokens); floor validation — no control position may render below DD minima, asserted against the token set at the range extremes; `Cmd/Ctrl +/−/0` bindings for editor text size when editor is focused.
**AC:** settings round-trip and migrate; floor assertions in CI at `uiScale: 0.9` and `editorFontSize: 16`; live-change test (no reload event fired); keybindings don't collide with the WP-26 map (conflict test extended).
**Depends:** WP-31 (tokens). Blocks G-M6.

### WP-33 — Regression sweep & release 0.2.0 *(re-scoped v0.3.0)*
Full e2e re-run (one-click contract now via the WP-34 UI path, staleness matrix — typography changes must be behaviorally inert), empty/error-state visual sweep in both themes per WP-28 checklist **plus the dead-instruction audit repo-wide**, perf spot-check (TS §8.1 targets unaffected), `CHANGELOG.md` entry, version bump to `0.2.0`, tag.
**AC:** F1–F6 marked `PENDING-OWNER` (manual, per §0 rule 5); CI fully green including contrast suite and dead-instruction audit; app reports `0.2.0` everywhere; release blocked until all `PENDING-OWNER` items are owner-checked.
**Depends:** WP-32, WP-34, WP-35.

### 🔒 Gate G-M6 — the eyesight gate *(scope extended v0.3.0)*
Owner-present, non-delegable. The owner: (1) imports a real outline through the UI from a cold start, (2) runs the two-click pipeline on one chapter, (3) reads a full generated chapter in the app for 15 uninterrupted minutes, (4) adjusts UI scale and editor text size and confirms they behave. Sign-off clears all `PENDING-OWNER` items and releases 0.2.0.

---

## Dependency Snapshot

```
M0: 00 → 01, 02 → 03, 04
M1: 05 → 06 → 07 → 08 ; 09,10 (parallel after 04)
M2: 11 → 12 → 13 → 14 → 15 → 16
M3: 17 → 19,21 ; 18 (after 09) → 19,22 ; 20 (after 16) ; 21 → 22
M4: 23 → 24 → 25
M5: 26,27 → 28 → 29 → 30
M6: 31 → 32 → 33 ; 34 (parallel) → 33 ; 35 (after 31) → 33   (remediation; runs against the completed codebase)
```

Critical path: 00-03 → 05-06 → 09 → 11-16 → 17 → 21 → 28-30.

---

*End of Granular Roadmap v0.1.0. Awaiting confirmation before Document 4: README.md.*
