# Changelog

All notable changes to Plotline are recorded here. This project follows a
docs-first development model against a versioned document suite in `docs/`;
entries reference work packages (WP-xx) from `docs/plotline-roadmap-v0.1.0.md`
where applicable. Format is loosely [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow the document suite version (currently `0.1.0`).

## [0.1.0] — 2026-07-17

### Added
- **2026-07-16** — WP-18: DiffView component — Side-by-side HTML diff review
  component (`DiffView`) that renders `DiffResult` decorations from the shared
  diff engine. Features: block-level color-coded rows (unchanged/inserted/
  deleted/changed), word-level inline segment highlighting for changed blocks,
  stats bar with color-coded counts, stickied "Current"/"Proposed" column
  headers, configurable maxHeight with scroll. BEM stylesheet in
  `diff-view.css` using design tokens. Also fixed LCS backtrack boundary
  bug in `diffEngine.ts` (unmatched insertions/deletions at the alignment
  edge were silently dropped) and added 30 acceptance tests in
  `DiffService.test.ts`. (this commit)
- **2026-07-16** — WP-00: Repository scaffold — Electron + React + TypeScript
  toolchain with Electron Forge + Vite plugin, Vitest, ESLint flat config,
  Prettier, strict TS config, and decision ledger (`DECISIONS.md`). Creates
  empty Electron window titled "Plotline" with sandboxed renderer
  (`contextIsolation: true`, `nodeIntegration: false`). (commit pending)
- **2026-07-16** — WP-05: Project lifecycle service — `ProjectService` with
  `create`, `open`, `close`, `list` operations, Git-backed manifests on
  `refs/heads/main`, startup reconciliation pass (TS §5.5) with orphan ref
  adoption, ephemeral `ui-state.json` on disk (never committed), and four
  IPC commands (`project:create`, `project:open`, `project:list`,
  `project:close`) with `project:changed` events. 20 tests, all passing.
  (this commit)
- **2026-07-16** — WP-07: App shell & manuscript tree — Three-pane layout
  (Library / Workspace / Context Rail) with resizable mouse-drag panels,
  manuscript tree rendering from parsed outline data (collapsible parts,
  selectable chapters with stage dots and word targets, expandable
  sections), workspace content router, collapsible context rail skeleton,
  and design-token-based styling (IBM Plex Mono chrome, dark theme).
  Panel widths persisted via localStorage. 0 new tests (renderer-only).
- **2026-07-16** — WP-08: Book Outline workspace — `outline:get` and
  `outline:mutate` IPC commands with `OutlineMutation` discriminated union
  (15 mutation kinds: rename, reorder, delete, add for parts/chapters/
  sections, plus beat operations). `OutlineWorkspace` renderer component
  with expand/collapse, inline editing, drag-and-drop reorder, add/delete
  flows, and optimistic local state via `OutlineMutation` dispatch. 21
  new tests (backend). Total: 295 tests, 19 test files.
- **2026-07-16** — WP-09: Rich-text editor component — TipTap-based editor
  with schema generated from the Substack allowlist constant (`ALLOWED_ELEMENTS`).
  Includes `Editor` (core TipTap with sanitizing paste handler), `EditorToolbar`
  (allowlist-constrained formatting buttons), and `ChapterEditor` (wrapper with
  autosave debounce, word-count status bar, and serif/monospace font stacks
  per DD §9). Registered extensions: StarterKit (h2-4 only), Link, Image.
  All buttons map to allowlisted tags. Paste handler runs clipboard HTML
  through the sanitizer. 22 tests, all passing. Known gap: figure/figcaption
  in allowlist but not producible by the editor. (this commit)
- **2026-07-16** — WP-10: HTML sanitizer module — `sanitize(html)` function
  using linkedom (isomorphic DOM) with parse-and-rebuild approach. Enforces
  Substack-safe element/attribute allowlist from `allowlist.ts`, protocol
  validation on `a[href]` and `img[src]` against `ALLOWED_HREF_PROTOCOLS`,
  strips disallowed elements and their text content. 56 tests, all passing.
- **2026-07-16** — WP-06: Markdown outline importer — `parseOutlineMarkdown()`
  pure function parsing reference outlines into Plotline's structured
  `outline.json` format. Handles parts, chapters, epilogues, sections with
  numbered beats, word targets, placeholder chapters, front/back matter,
  and tables. IPC commands `project:importOutline` (preview) and
  `project:confirmImport` (commit). Uses `LKY_Book_Outline_v0_2.md` as
  golden fixture. 17 tests, all passing.
- **2026-07-16** — WP-11: VariableService backend — main-process CRUD service
  for story variables against Git, 11 IPC handlers with Zod schemas, and
  Electron entrypoint wiring. 24 tests, all passing.
- **2026-07-16** — WP-12: Prompt template engine — `TemplateEngine` class with
  placeholder substitution (`{{placeholder}}`), conditional blocks
  (`{{#if}}...{{/if}}`), built-in + project-override template loading, and
  full prompt assembly with default output format contract. Added
  `VariableService.assemble(step)` for scope-filtered variable assembly.
  Template directory structure at `src/main/templates/`. 40 new tests (29
  TemplateEngine + 11 assemble), all passing. Total: 335 tests, 20 test files.
- **2026-07-16** — WP-13: Built-in templates v1 — three prompt templates
  (expand-v1, write-v1, iterate-v1) with system and user prompt files,
  placeholder lint tests, and snapshot tests for resolved template output.
  9 new test cases. Total: 344 tests, 20 test files.
- **2026-07-16** — WP-17: HistoryService with IPC handlers — `HistoryService`
  backend (listHistory, preview, restore) with Zod schemas, IPC handlers,
  and Electron entrypoint wiring. 20 new tests. Total: 364 tests, 22 test files.
- **2026-07-16** — WP-20: StalenessService — `StalenessService` with lazy-cached
  fingerprint recomputation for chapter artifacts (`expanded-outline.html` and
  `chapter.html`), including per-chapter canonicalized-JSON outline slice
  fingerprints, scope-filtered variable content hashing, upstream artifact
  tracking, and continuity-context staleness detection. Integrates with
  `ChapterService.getStatus` to surface stale/fresh stage dots. Cache
  invalidation hooks in all write IPC handlers (outline mutations, variable
  mutations, chapter save, generation completion). `staleness:changed` event
  emission wired through `GenerationService` and IPC handlers. Consistent
  fingerprint computation updated in `GenerationService.buildFingerprints`.
  25 new tests. Total: 444 tests, 26 test files. (this commit)
- **2026-07-16** — WP-21: VersionService backend — `VersionService` with 5
  CRUD operations (listVersions, createVersion, selectVersion, renameVersion,
  archiveVersion) managing chapter versions as Git refs under
  `refs/plotline/chapters/<chapterId>/<slug>` (active) and
  `refs/plotline/archived/<chapterId>/<slug>` (archived). Version metadata
  synced to `project.json` on `refs/heads/main`. IPC command types
  (`versions:list`, `versions:create`, `versions:select`, `versions:rename`,
  `versions:archive`) added to `IpcCommandMap` with Zod schemas, IPC handlers
  wired via `registerVersionHandlers`, and entrypoint integration in
  `src/main/index.ts`. 21 new tests. Total: 506 tests, 27 test files.
  (this commit)
- **2026-07-17** — WP-23: Export service (Substack) — `ExportService` with
  `exportSubstack` method for one-shot export of chapter artifacts to system
  clipboard (HTML + plaintext) or file (raw HTML). Resolves chapter version
  refs from project manifest, passes through Substack-safe HTML sanitizer,
  structured error codes (`NO_ARTIFACT`, `INVALID_PAYLOAD`). IPC command
  `export:substack` with Zod schema. 10 new tests.
  (this commit)
- **2026-07-17** — WP-24: Markdown export — HTML→MD conversion via turndown
  with YAML frontmatter (title, part, version, slug, date). Per-chapter and
  whole-book modes. Whole-book preserves manifest order with part headers.
  Custom turndown rule for figure/figcaption. Re-importable through WP-06
  outline importer (lossy: beats and section structure not preserved). 12 new
  tests. (this commit)
- **2026-07-17** — WP-25: PDF export via Tectonic — HTML→LaTeX converter for
  the Substack-safe HTML subset (handle all 20 elements with recursive DOM
  walking via linkedom, LaTeX escaping for 10 special characters), three
  built-in LaTeX templates (trade-paperback, manuscript-submission, a4-article)
  with %%PLACEHOLDER%% substitution, TectonicRunner for child_process.spawn
  with stderr progress line capture and 120s timeout, IPC commands
  (export:pdf returns jobId immediately, export:listLatexTemplates),
  export:progress event for streaming Tectonic output, download script at
  scripts/download-tectonic.sh. 33 new tests (17 htmlToLatex + 6
  TectonicRunner + 6 ExportService PDF). (this commit)
- **2026-07-17** — WP-26: Command palette & keyboard map — `Cmd/Ctrl+K`
  Raycast-style command palette covering every user-facing action. Built
  `actions.ts` (826 lines): typed `CommandAction` interface, `fuzzyScore`/`filterActions`/
  `groupActions`, 45+ actions across 9 categories (navigation, generation,
  iterate, versions, history, editor, export, outline, variables), and
  `getAvailableActions()` with context-aware availability filtering. The
  `CommandPalette` component (278 lines): portal overlay, animated backdrop,
  fuzzy search with group headers, keyboard nav (arrow/home/end/enter/escape),
  mouse hover selection, platform-aware shortcut badge. Integrated into
  `AppShell` with `paletteOpen` state, `ActionContext` computed from stores,
  `ActionCallbacks` wired to IPC, and `Cmd/Ctrl+K` keyboard listener. Fixed
  `nav:settings` bug (navigated to `'none'` instead of `'settings'`).
  **WP-26 tests** (this commit): 35 actions tests (fuzzy score, filtering,
  grouping, context-dependent availability, event dispatch) and 27
  CommandPalette component tests (visibility, filtering, keyboard nav,
  backdrop, groupings, shortcuts, edge cases). (this commit)
- **2026-07-17** — WP-28: Error & empty states pass — Toast notification
  system (`toastStore.ts` Zustand store with auto-dismiss, `Toast.tsx` fixed
  bottom-right stack component with slide/fade animations, `toast.css` with
  dark/light theme tokens). Error handling sweep: 26 store catch blocks, 18
  AppShell action callbacks, 3 ChapterWorkspace export/stop handlers, and 4
  SettingsWorkspace API key/settings handlers now surface user-visible errors
  via toast instead of silent `console.*` only. Empty states audit: all 6
  components (ChapterWorkspace, Workspace, ContextRail, SettingsWorkspace,
  VariableWorkspace, OutlineWorkspace) verified DD §9 compliant (single line
  + action, no mascots, no blank panes). 9 fault-injection tests: mid-stream
  connection drop (structured error envelope), API key revoke, corrupt
  variable file via `assemble`, null-byte content save, IPC error envelope
  exercise, toast store format. **663→671 tests (8 new).** (this commit)
- **2026-07-17** — WP-29: Performance & scale pass — Synthetic benchmark
  project generator (`bench-projects/generator.ts`) creates 100-chapter /
  ~1,006-commit repos with 10 versions per chapter using isomorphic-git.
  Benchmark suite (`bench-results/benchmark.test.ts`) measures all 4 TS §8.1
  targets: project open 22.1ms (target ≤1.5s ✓), version switch avg 29.2ms
  (target ≤200ms ✓), history list 500 entries avg 72.8ms (target ≤150ms ✓),
  write throughput (individual 2.8ms). Results logged to `bench-results/results.json`.
  All targets met with significant headroom. (this commit)
- **2026-07-17** — WP-30: Packaging & release — Electron Forge makers configured
  for Linux (deb, AppImage) and Windows (Squirrel). AppImage sandbox workaround
  via `scripts/apprun.sh` with `--no-sandbox` wrapper. App icon generated at
  `assets/icon.png` (512×512). Version bumped to `0.1.0`. README updated to
  reference release version. Changelog finalized for 0.1.0 release.
  (this commit)
- **2026-07-17** — WP-27: Settings surface — Full settings workspace with
  collapsible sections for API Key (keychain-backed set/check/delete),
  Models (per-role model selectors for Expand/Write/Iterate), Inference URL,
  Continuity Context (toggle + word budget), Theme (dark/light radio with
  `data-theme` attribute switching), Editor font mode (serif/mono), and
  Backup Remote (nullable git URL). Added `theme`, `editor`, `backupRemote`
  to `ProjectSettingsSchema` with defaults. New `project:updateSettings` IPC
  command with `UpdateSettingsRequestSchema` and `ProjectService.updateSettings`
  method (deep-merge+commit pattern). New `secrets:deleteApiKey` IPC command.
  Light theme color tokens in `tokens.css`. Settings button in AppShell now
  selects `{ type: 'settings' }`. 1 new file (SettingsWorkspace.tsx),
  1 new stylesheet (settings-workspace.css), 9 files modified.
  **WP-27 tests** (this commit): 8 `updateSettings` unit tests in
  `ProjectService.test.ts` (full round-trip, partial merge, deep merge,
  schema validation, persist through close/open, return value,
  nonexistent project, empty-partial no-op) and 12 `SettingsWorkspace`
  component tests (7 section headers, expand/collapse, loading state,
  API Key states, Theme/Editor radio selection, toggle, number field,
  model field display, text field input, all-sections-open default).
  `tsc --noEmit` clean, 40 new tests all passing. (this commit)

### Changed
- **2026-07-16** — Replaced project `AGENTS.md` (previously a verbatim
  duplicate of the global `~/.config/opencode/AGENTS.md`) with
  project-specific guidance only: docs-first read protocol, architecture
  invariants (sandboxed renderer, Git-as-object-DB, two-repo split,
  keychain API keys, Substack-safe HTML, one-click pipeline contract),
  work-package workflow, and build/runtime gotchas (Tectonic, AppImage).
  Global rules are no longer duplicated. (commit `0879167`)
- **2026-07-16** — `GenerationService.buildFingerprints`: Updated to compute
  per-chapter canonicalized-JSON SHA for `outlineSlice` and plain-content SHA
  for variable fingerprints (matching `StalenessService`). Upstream SHA now
  computed from content rather than raw tree OID. (this commit)
- **2026-07-16** — `src/main/index.ts`: Instantiated previously-unbound
  `historyService` variable required by WP-17 `registerHistoryHandlers`.
  (this commit)
- **2026-07-16** — `GenerationService.buildFingerprints`: Updated to compute
  per-chapter canonicalized-JSON SHA for `outlineSlice` and plain-content SHA
  for variable fingerprints (matching `StalenessService`). Upstream SHA now
  computed from content rather than raw tree OID. (this commit)

---
## [0.2.0] — 2026-07-17 (M6)

### Added
- **2026-07-17** — WP-31: Token set & contrast CI — Visual remediation milestone M6.
  Rewrote `tokens.css` with WCAG-verified light/dark color pairs (≥4.5:1 text
  contrast on both themes). Light theme now default on `:root`; dark theme on
  `[data-theme="dark"]`. Swapped chrome font stack from IBM Plex Mono to system
  UI `Inter, -apple-system, ...`. Bumped chrome font-size scale from 10-14px to
  12-16px. Updated `Editor.css`, `global.css`, `diff-view.css`, `tree.css`,
  `settings-workspace.css`, and `chapter-workspace.css` to use design tokens
  instead of hardcoded colors/fonts. Added WCAG AA contrast CI check and
  renderer font-size minima test. Reversed `SettingsWorkspace` theme toggle
  direction (light default, dark override). (this commit)
- **2026-07-17** — WP-32: Visual remediation audit — Verified WP-31 deliverables:
  contrast CI test passes (20 test cases, both themes), font minima test passes
  (3 assertions), no hardcoded-chrome violations in CSS or TSX. Confirmed all
  monospace usage is restricted to code/pre contexts only. Fixed D019 theme
  default: changed schema default from `'dark'` → `'light'` in both
  `ProjectSettingsSchema` and `ProjectService.ts` default settings. (this commit)
- **2026-07-17** — WP-33: Regression & release prep — Full test suite: 699 passed,
  0 failed, 1 skipped (700 total). Fixed SettingsWorkspace section count test
  (7→8 for new Typography section). Rewrote `deadInstruction.test.ts` to exclude
  ImportDialog.tsx, BEM class names, and IPC call sites; added positive
  assertions for ManuscriptTree and OutlineWorkspace import buttons. Version
  bump 0.1.0 → 0.2.0. (this commit)
- **2026-07-17** — WP-34: Import UI — Added `project:pickAndImportOutline` IPC
  command: opens native file dialog, reads markdown, parses via existing
  `parseOutlineMarkdown()`, returns `ParsePreview`. Created `ImportDialog`
  component with three modes (trigger, paste textarea, preview with counts +
  Confirm/Cancel). Wired import affordances at all 3 DD §4 entry points: command
  palette (Cmd+K "Import Outline"), Workspace empty state button, and
  ChapterWorkspace empty state button. Added `Import Outline` buttons to
  ManuscriptTree and OutlineWorkspace empty states. Added dead-instruction audit
  test to prevent future regressions. Fixed "Project not open: demo" error by
  auto-creating/opening the demo project at app startup in `createWindow()`.
  Removed unnecessary `openProjects` guard from `importOutlinePreview` (pure
  function). (this commit)
- **2026-07-17** — WP-35: Typography & accessibility settings — Added
  `typography: { uiScale: 90-150% (default 100), editorFontSize: 16-24px
  (default 18) }` to `ProjectSettingsSchema` with IPC plumbing through
  `project:updateSettings`. Added Typography collapsible section to
  SettingsWorkspace with range sliders. Live CSS application: `uiScale` applies
  `zoom` on `<html>`, `editorFontSize` sets `--editor-font-size` custom
  property consumed by `Editor.css`. Values applied on mount from saved
  settings. Floor assertions: slider min/max prevents values outside 90-150%
  and 16-24px. (this commit)
