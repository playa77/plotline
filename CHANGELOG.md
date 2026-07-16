# Changelog

All notable changes to Plotline are recorded here. This project follows a
docs-first development model against a versioned document suite in `docs/`;
entries reference work packages (WP-xx) from `docs/plotline-roadmap-v0.1.0.md`
where applicable. Format is loosely [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow the document suite version (currently `0.1.0-dev`).

## [0.1.0-dev] — unreleased

### Added
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
  new tests (backend). Total: 271 tests, 18 test files.

### Changed
- **2026-07-16** — Replaced project `AGENTS.md` (previously a verbatim
  duplicate of the global `~/.config/opencode/AGENTS.md`) with
  project-specific guidance only: docs-first read protocol, architecture
  invariants (sandboxed renderer, Git-as-object-DB, two-repo split,
  keychain API keys, Substack-safe HTML, one-click pipeline contract),
  work-package workflow, and build/runtime gotchas (Tectonic, AppImage).
  Global rules are no longer duplicated. (commit `0879167`)
