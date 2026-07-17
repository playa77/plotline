# Plotline — Decision Ledger

**Convention:** Append-only. Every non-trivial decision gets an entry with a
reversibility tag (see §2 of global AGENTS.md). R1 decisions are logged silently;
R2 decisions include the rejected alternative; R3 decisions block until the user
chooses from presented branches.

---

## WP-00: Repository Scaffold

### D001 — Electron Forge with Vite plugin (R2)

**Context:** Need a bundler that handles Electron main/preload/renderer
separation with fast dev iteration.

**Chosen:** `@electron-forge/plugin-vite` — native Vite integration, fast HMR,
TypeScript support out of the box, single `electron-forge start` command.

**Rejected:** electron-vite (less mature ecosystem, smaller community);
electron-builder with webpack (slower, more config noise); manual Vite +
electron-builder (more maintenance burden).

---

### D002 — React 18 + TypeScript 5 (R3 — given by design doc)

**Context:** Product design spec (v0.1.0) mandates React/TS for the renderer.

**Chosen:** React 18 with TypeScript 5, `strict: true` in tsconfig.

---

### D003 — Vitest test runner (R1)

**Context:** Need a test runner compatible with Vite/TypeScript.

**Chosen:** Vitest — native Vite integration, TypeScript-first, fast, growing
ecosystem. Matches the Vite-based build toolchain.

---

### D004 — Plain CSS (R2)

**Context:** Styling approach for a dense, tool-like writing app.

**Chosen:** Plain CSS. No framework (Tailwind, CSS Modules, styled-components).
The app is content-display-heavy with custom UI; CSS framework overhead isn't
justified at this stage. Re-evaluate in WP-09 when the editor UI lands.

**Rejected:** Tailwind (utility classes add noise for custom dense UI), CSS
Modules (good but premature before component architecture is settled),
styled-components (runtime overhead for a desktop app).

---

### D005 — ESLint flat config + Prettier (R1)

**Context:** Linting and formatting.

**Chosen:** ESLint 9 flat config with `typescript-eslint` for TS-aware linting.
Prettier for formatting (no style rules in ESLint, single-responsibility).

---

### D006 — Zod validation library (R1)

**Context:** Need runtime schema validation for IPC boundary (main ↔ renderer).

**Chosen:** Zod — TypeScript-first, lightweight, excellent inference. Full IPC
validation comes in WP-01.

---

### D007 — Zustand state management (R1)

**Context:** Lightweight state management for the React renderer.

**Chosen:** Zustand — minimal boilerplate, TypeScript-native, no provider
wrapping, works well with Electron's sandboxed renderer (no context bridging
needed). Not wired in WP-00; imported in WP-01+.

---

### D008 — Git library (T3) — chosen WP-02 (R2)

**Context:** The storage layer (StorageService) needs a Git implementation for
revision management.

**Chosen:** isomorphic-git (pure JS, no system dependencies). Rationale: (1)
AGENTS.md invariant says "No system git assumed" — isomorphic-git eliminates the
system-dependency footgun entirely. (2) Manuscript-scale repos are small — pure-JS
performance is adequate for the 500-commit log target (≤150ms). (3) Cross-platform
consistency (no git version skew). (4) In-process commits are simpler to atomize
for the write-queue kill-test (TS §8.2) than shelling out.

**Rejected:** System git via execa (platform-dependent, git version sensitivity,
shell-out error handling complexity, violates "no system git assumed" invariant).

---

### D009 — Editor library — deferred to WP-09 (R2)

**Context:** The main editing surface needs a rich text editor.

**Decision:** Deferred. Likely TipTap (ProseMirror-based), but no binding
decision until WP-09 when the editor requirements are concretely scoped.

---

## 🔒 Gate G-M0 — Milestone 0 Complete (2026-07-16)

### Audit Pack

**Built:**
| WP | Component | Lines | Tests |
|----|-----------|-------|-------|
| 00 | Repository scaffold (Electron Forge + Vite, React 18, TypeScript strict, Vitest, ESLint) | — | 1 |
| 01 | IPC framework (typed commands/events, zod validation, ping/pong) | ~250 | 10 |
| 02 | StorageService read path (isomorphic-git: readBlob, readTree, log, listRefs, diffTrees) | 271 | 20 |
| 03 | StorageService write path (commit, amend-own-autosave, createRef, renameRef, FIFO queue, atomicity) | +195 | 23 |
| 04 | Schemas & validation (project.json, outline.json, variable.json, meta.json, ULID, slugs, word count, allowlist) | ~400 | 80 |

**Totals:** 33 TypeScript source files, 134 tests passing, `tsc --noEmit` clean.

**Deviations from DD/TS:**
- None substantive. All TS §5.1 operations and TS §2.3 mappings implemented per spec.
- `amendWindowMs` made configurable in constructor (default 60_000) — enables time-window testing without real clock waits. R1.
- Test helpers' `createCommit` bypasses the write queue — by design as a low-level fixture builder. Production commit path is queue-gated.

**Open risks:**
1. isomorphic-git performance at scale: 500-commit log passes, but 10,000+ commit histories untested. Acceptable for manuscript-scale repos.
2. Electron window never exercised end-to-end — `npm run dev` not verified (WP-00 AC requires it opens an empty window).
3. CI script untested (`scripts/ci.sh` exists but `npm install` not run).

**Demo path:**
```bash
npm test                                    # 134 tests green
npx vitest run src/__tests__/debug/m0-gate-demo.test.ts  # 11-step interactive demo
```

**Decision flags carried forward:**
- T3 (isomorphic-git) resolved — D008.
- Editor library deferred to WP-09 — D009.
- All other library decisions (bundler, test runner, validation, state management) recorded in D001–D007. All R1.

---

## WP-05: Project Lifecycle Service

### D010 — `ui-state.json` location — inside project directory but never tracked (R1)

**Context:** The tech spec (§5.2) requires an "ephemeral per-project ui-state.json
outside the repo". The options were: (a) inside the project dir (`<projectId>/ui-state.json`),
(b) alongside the project dir (`<projectId>.ui.json`), or (c) in a sibling `state/`
directory.

**Chosen:** `<projectsDir>/<projectId>/ui-state.json` — inside the project directory
on disk but never committed to Git. Rationale: (1) simplest mental model — one
project = one directory = everything for that project. (2) Since isomorphic-git
stores objects in `.git/objects/` and never uses a working tree, a file on disk in
the repo directory has no interaction with the Git object database. (3) The
`commit()` method only writes what we pass it — `ui-state.json` is never passed.
(4) No additional directory hierarchy to manage.

**Rejected:** `<projectsDir>/<projectId>.ui.json` (noisy sibling files at the
collection level); dedicated `<projectsDir>/state/` dir (adds indirection without
benefit).

---

## WP-12: Prompt Template Engine

### D012 — `templatesDir` constructor parameter on TemplateEngine (R1)

**Context:** The `TemplateEngine` loads built-in templates from disk at
`path.join(__dirname, '..', 'templates')`. This path is correct for production
(compiled JS in `dist/main/`) and for vitest (`__dirname` points to
`src/main/services/`). However, tests that create throwaway templates need no
collision with the source tree.

**Chosen:** The `TemplateEngine` constructor accepts an optional `templatesDir`
parameter that defaults to the built-in path. Tests pass a temp directory
created per `describe` block. This is purely a testability improvement — the
production code path is unchanged.

---

### D013 — `iterate` is not a variable scope (R1)

**Context:** The test spec in WP-12 includes a test:
"iterate variables only appear in iterate step". However, `VARIABLE_SCOPES` in
the schema only has `always`, `expand`, `write`, `manual`. The `iterate` step
is a workflow step, not a variable scope.

**Chosen:** The `assemble(step)` method correctly filters by `scope === 'always'`
or `scope === step`. Since `'iterate'` is not in `VariableScope`, calling
`assemble('iterate', ...)` will only match `always`-scoped variables. The test
was replaced to verify that the iterate step correctly captures
`always`-scoped variables and excludes `expand`-scoped ones.

---

### D011 — `reconcileManifest` commits only when changes are made (R1)

**Context:** The startup reconciliation pass (TS §5.5) validates manifest ↔ refs
and may repair drift. If no repair is needed, an unnecessary commit on `main`
would bump `updatedAt` and create noise in history.

**Chosen:** Reconciliation only calls `service.commit()` when at least one repair
was made (invalid `selectedVersion` reset, orphan ref adoption). Otherwise the
manifest is returned as-is. The `updatedAt` timestamp is only updated on actual
changes.

---

## WP-24: Markdown Export

### D014 — turndown for HTML→MD conversion (R1)

**Context:** Need a deterministic HTML→Markdown converter for the Substack-safe
HTML subset. Options: hand-rolled converter, turndown, remark/rehype toolchain.

**Chosen:** turndown (with @types/turndown). Battle-tested HTML→MD converter with
custom rules API for non-standard elements (figure/figcaption, `<s>` strikethrough).
DOM-based parsing matches linkedom we already use for the sanitizer. Deterministic
output with configurable heading style, list markers, code-fence style.

**Rejected:** Hand-rolled (wasted effort for well-solved problem); remark/rehype
(adds AST complexity without benefit for output-only pipeline).

## WP-25: PDF via Tectonic

### D015 — Tectonic binary via download script, not npm package (R2)

**Context:** Tectonic (T2) is the chosen LaTeX engine. Distribution: download
script at build time vs npm package wrapping binary vs system package manager.

**Chosen:** Download script at build time placing binary in `vendor/tectonic/`
(gitignored). Platform-aware script handles Linux/macOS. TectonicRunner falls
back to PATH if vendored binary is absent. Matches TS §9 "fetched at build time,
never committed."

**Rejected:** npm binary package (version coupling to system binary, cross-platform
uncertainty); system package manager (defeats zero-install goal).

### D016 — HTML→LaTeX via recursive DOM walk (R1)

**Context:** Convert Substack-safe HTML to LaTeX. Options: recursive DOM walk,
XSLT-like template engine, regex-based replacement.

**Chosen:** Recursive DOM walk using linkedom (already installed). `nodeToLatex()`
dispatches on tagName, recursively processes child nodes, text nodes escape 10
LaTeX special characters. Well-formed LaTeX for the strictly-constrained 20-element
subset.

**Rejected:** Regex-based (fragile for nesting, can't handle mixed formatting).

### D017 — Template placeholder syntax: %%PLACEHOLDER%% (R1)

**Context:** LaTeX template variable substitution syntax.

**Chosen:** `%%PLACEHOLDER%%` syntax. Visually distinct from prompt template
system's `{{placeholder}}` (avoids confusion between two template systems).
Doesn't conflict with LaTeX syntax. Simple `replace` without a template library.

---

## 🔒 Gate G-M4 — Milestone 4 Complete (2026-07-17)

### Audit Pack

**Built:**

| WP | Component | Lines | Tests |
|----|-----------|-------|-------|
| 23 | Substack export (`ExportService.exportSubstack`, clipboard + file modes, IPC handler) | 160 | 10 |
| 24 | Markdown export (`ExportService.exportMarkdown`, turndown with YAML frontmatter, per-chapter + whole-book) | 220 | 12 |
| 25 | PDF via Tectonic (`ExportService.exportPdf`, `htmlToLatex` DOM walk, `TectonicRunner`, 3 LaTeX templates) | 600 | 33 |

**Totals:** 4 source files (`ExportService.ts`, `htmlToLatex.ts`, `TectonicRunner.ts`, `handlers/export.ts`), 1,134 lines implementation, 1,629 lines tests. 55 new M4 tests (10 + 12 + 33). Full suite: 30 test files, 576 tests passing.

**Deviations from DD/TS:**

- **TectonicRunner `--no-sandbox` not needed.** TS §9 flagged the Electron AppImage sandbox issue but Tectonic is a standalone CLI, not an Electron renderer — it runs fine without sandbox flags. R1.
- **Export dialog (DD §8) deferred.** The export dialog UI (template selection, exposed options, chapter range) is a renderer component not built in M4. Backend supports the full interface; the current IPC `export:pdf` accepts `templateId` and `chapterIds`, and `export:listLatexTemplates` is wired. R2 — requires renderer work in M5.
- **Project `latex/` template discovery deferred.** Template discovery currently only serves built-in templates from `src/main/services/tex/templates/`. User-defined templates in the project directory are recognized by the manifest format but no project-level scan is implemented. R2 — user-facing missing feature.
- **PDF progress streaming to renderer not end-to-end verified.** `TectonicRunner` emits events internally and `ExportService.exportPdf` returns a `jobId`, but the IPC bridge (`export:event`) and renderer consumption are untested because the export dialog UI hasn't been built. Backend emits are tested via unit-level event listeners. R2.
- **No egress assertion for Tectonic.** AC for WP-25 requires "no network access during render (assert egress)" — this is not implemented. Tectonic is an offline engine by design (local `texlive` bundle), but no network guard is present. R2 — should be a test/sandbox concern for M5 hardening.
- **Markdown re-import is lossy-by-design.** WP-24 AC says "lossy-fields documented" — beats and section structure from `expanded-outline.html` are not represented in the `.md` output format. This is inherent to the output format, not a defect. R1 (documented design choice).
- **Chapter-range export always uses selected version.** `exportPdf` with `chapterIds` respects `selectedVersion` from `project.json`. AC verified. R1.

**Open risks:**

1. Tectonic binary absent on dev machine. `scripts/download-tectonic.sh` exists but TectonicRunner tests mock `child_process.spawn` — the real binary path hasn't been exercised. TectonicRunner returns `TECTONIC_NOT_FOUND` error code when binary is missing.
2. LaTeX template correctness unverified against real Tectonic engine. `htmlToLatex` unit tests cover all 20 HTML elements but actual LaTeX compilation quality (hyphenation, page breaks, font resolution) is unknown. First real build may surface template issues.
3. Clipboard API tested via mock — actual platform clipboard behavior (Linux X11/Wayland vs Windows vs macOS) may differ in edge cases (large documents, Unicode, binary data).
4. turndown's `@types/turndown` is the only M4-specific npm dependency. No known issues, but the package is not actively maintained (last release 2022).
5. No integration test crossing all three export formats on the same fixture chapter. Each format has its own test suite; no single "export the fixture and verify all three outputs" test exists.

**Decision flags carried forward:**

- D014: turndown for HTML→MD (R1)
- D015: Tectonic binary via download script, not npm (R2)
- D016: HTML→LaTeX via recursive DOM walk using linkedom (R1)
- D017: `%%PLACEHOLDER%%` template syntax (R1)
- T3 (isomorphic-git vs system git): still open, now carrying into M5.

**Demo path:**

```bash
npm test                                    # 576 tests green
npx vitest run src/__tests__/services/ExportService.test.ts  # 27 tests: Substack + MD + PDF
npx vitest run src/__tests__/services/tex/htmlToLatex.test.ts  # 17 tests: all 20 HTML elements
npx vitest run src/__tests__/services/tex/TectonicRunner.test.ts  # 6 tests: spawn, progress, error, timeout
./scripts/download-tectonic.sh              # fetch Tectonic binary (vendor/tectonic/, gitignored)
```

**G-M4 gate criteria (from roadmap):**

- ❓ Owner pastes an exported chapter into Substack — **pending owner verification.** Clipboard mode produces `text/html` + `text/plain` payloads verified in unit tests; actual Substack paste test requires owner.
- ❓ PDF of the full reference book reviewed — **pending owner verification.** PDF pipeline is backend-complete but real output requires Tectonic binary + a fixture book project. Unit tests prove HTML→LaTeX mapping and runner behavior, but compiled PDF visual quality is unverified.

**⚠ Gate not formally closed.** The previous session proceeded to M5 (WP-26, WP-27) without halting for owner approval. That work has been shelved on `m5/wip` (commit `c8973c8`). This audit pack corrects the process gap. Do not resume M5 until owner approves this gate.

**✅ Gate closed 2026-07-17.** Owner approved. M5 work resuming.

---

## 🔒 Gate G-M5 — Milestone 5 Complete (Release Gate)

### Audit Pack

**Built:**

| WP | Component | Tests | Status |
|----|-----------|-------|--------|
| 26 | Command palette & keyboard map (45+ actions, Cmd+K integration) | 62 | ✅ |
| 27 | Settings surface (7 sections, IPC round-trip, deep-merge) | 40 | ✅ |
| 28 | Error & empty states pass (toast system, error sweep, fault injection) | 9 | ✅ |
| 29 | Performance & scale pass (benchmark suite, TS §8.1 targets) | 4 | ✅ |
| 30 | Packaging & release (forge makers, icon, sandbox, version bump) | — | ✅ |

**Totals:** 35 test files, 671 tests passing, 1 skipped (pre-existing). `tsc --noEmit` clean.

**Deviations from DD/TS:**

- **Backup remote push/pull not implemented.** WP-27 adds `backupRemote` field to settings but no actual push/pull/backup feature exists. This is a future WP. R2.
- **Export dialog UI deferred.** DD §8 export dialog (template picker, chapter range) is backend-complete but renderer component was not built in M5. R2 — carried from G-M4.
- **Tectonic binary not downloaded.** `scripts/download-tectonic.sh` exists but the binary was never fetched. TectonicRunner tests mock spawn — real PDF compilation untested. R2 — carried from G-M4.
- **No egress assertion for Tectonic** (WP-25 AC). R2 — carried from G-M4.
- **Shortcut conflict test not automated.** WP-26 AC requires "shortcut conflict test against Electron/OS defaults" — shortcuts are defined but no automated conflict detection exists. R2.

**Performance targets (TS §8.1):**

| Target | Measured | Status |
|--------|----------|--------|
| Project open ≤ 1.5s (100 chapters, 1,000 commits) | 22.1ms | ✅ |
| Version switch ≤ 200ms | 29.2ms avg | ✅ |
| History list ≤ 150ms (500 entries) | 72.8ms avg | ✅ |
| Keystroke latency unaffected by autosave | commit off input path | ✅ by design |

**Open risks:**

1. AppImage not built/tested on actual Linux machine. forge.config.js has makers but `npm run make` hasn't been run.
2. App icon is a placeholder (generated "P" via ImageMagick) — not a real designed icon.
3. No CI/CD pipeline. All testing is manual `npm test`.
4. No end-to-end Electron test exists. All tests are unit/integration with mocked Electron APIs.
5. Electron process has never been launched (`npm run dev` untested end-to-end).
6. Windows build untested (no Windows machine available for the agent).

**Demo path:**

```bash
npm test                                    # 671 tests green, 35 files
npm run typecheck                           # tsc --noEmit clean
npx vitest run bench-results/benchmark.test.ts  # TS §8.1 targets verified
npx vitest run src/__tests__/resilience/fault-injection.test.ts  # 9 fault-injection tests
npm run build 2>&1 | tail -20               # verify forge packaging succeeds
```

**Decision flags carried forward:**
- T3 (isomorphic-git vs system git): still open.
- Export dialog (DD §8): deferred.
- Backup remote feature: unimplemented.
- Tectonic binary: not yet downloaded.

**Release readiness:** Code complete, tests green, targets met. Packaging configured but untested on real hardware. Manual acceptance flow F1–F6 (DD §10) requires Electron window launch.

**✅ Gate closed 2026-07-17.** Owner approved. v0.1.0 tagged.

---

## WP-31: Visual Remediation

### D018 — Chrome font stack: Inter + system UI (R1)

**Context:** DD v0.2.0 §9 requires swapping the chrome font from IBM Plex Mono to
a more readable sans-serif stack for long-form writing work. The DD states
"...swap the chrome font to Inter or the native system UI stack."

**Chosen:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
Oxygen, Ubuntu, Cantarell, sans-serif` as the `--font-chrome` value. Inter is a
well-regarded screen-reading face with strong hinting at small sizes; the system
UI fallbacks cover all platforms without additional font downloads. IBM Plex
Mono is retained only for code contexts (`pre`, `code` selectors).

**R1:** Reversible <1h — changing the CSS variable value is a one-line edit, and
no build or installation step depends on the font stack.

### D019 — Light theme as default (R2)

**Context:** The original app defaulted to a dark theme (`:root` + dark colors,
`[data-theme="light"]` override). DD v0.2.0 §9 requires light as default for
accessibility during long-form writing work.

**Chosen:** Light theme values on `:root`; dark theme values on
`[data-theme="dark"]`. The `SettingsWorkspace` theme toggle was reversed
accordingly — selecting "dark" now sets `data-theme="dark"`, selecting "light"
removes the attribute (falls through to `:root`).

**Rejected alternative:** Keep dark as default with a one-time onboarding
prompt. Rejected because WP-00 AC guarantees onboarding-free "pick up and write"
— a new user should be on light by default.

**R2:** Bounded cost — reversing this decision requires updating tokens.css
block positions, the SettingsWorkspace toggle logic, and re-verifying all
backward-compat aliases still resolve correctly in both themes.

---

## WP-32: Visual Remediation Audit

### D020 — Verify WP-31 deliverables with automated guards (R1)

**Context:** WP-31 rewrote design tokens and added contrast CI. WP-32 requires
an audit to confirm no regressions slipped through.

**Chosen:** Automated verification via existing test suite. Contrast CI test
(20 cases, both themes) + font minima test (3 assertions) + manual scan for
hardcoded-chrome violations. All passing. Mono-chrome scan confirmed only
code/pre contexts use monospace. This is sufficient for gate.

**R1:** Reversible <1h — adding additional audit checks is a test-file edit.

---

## WP-33: Regression & Release Prep

### D021 — deadInstruction test rewrite strategy (R1)

**Context:** The initial dead-instruction audit test over-matched on BEM class
names (`import-dialog_*`) and ImportDialog.tsx itself (which IS the control,
not a dead instruction). 30 false positives.

**Chosen:** Three exclusion rules: (1) skip ImportDialog.tsx entirely, (2)
skip lines where "import" only appears in `className="import-dialog_*"` or
`invoke(...import...)` IPC calls, (3) verify the 3-line window around each
match contains a real UI control (`<button`, `onClick`, `importOutline`,
`ImportDialog`, or `setImport`). Added positive assertions for ManuscriptTree
and OutlineWorkspace import buttons to prove the test would catch regressions.

**R1:** Reversible <1h — exclusion list is a small array edit.

---

## WP-34: Import UI

### D022 — Import dialog uses native file picker with paste fallback (R2)

**Context:** DD v0.3.0 §4 specifies three import affordances (New Project
flow, empty states, command palette) with native file picker via
`project:pickAndImportOutline` and paste fallback in the dialog.

**Chosen:** Mixed approach: command palette and empty-state buttons open the
ImportDialog. The dialog offers two tabs/modes: "Choose File" (calls
`project:pickAndImportOutline` → opens native Electron `dialog.showOpenDialog`)
and "Paste Markdown" (textarea → calls `project:importOutline`). After parse,
a preview step shows counts (parts, chapters, sections, beats) with
Confirm/Cancel. On confirm, calls `project:confirmImport`.

**Rejected alternative:** Separate screens for file picker and paste. Rejected
because DD §4 explicitly calls for both in one dialog with "choose file" and
"paste text" as two entry paths.

**R2:** Bounded cost — the ImportDialog component is self-contained; swapping
its internal mode switching would be local to one file.

---

## WP-35: Typography & Accessibility Settings

### D023 — Typography as project-level settings applied via CSS custom properties (R2)

**Context:** DD v0.3.0 §9 requires user-configurable UI scale (90-150%) and
editor font size (16-24px) with live application and floor assertions.

**Chosen:** Store `typography: { uiScale, editorFontSize }` in the project
manifest under `settings.typography`. Apply `uiScale` via `zoom` on `<html>`
(Chromium supports fractional zoom well, and it scales the entire UI including
panel layouts). Apply `editorFontSize` via `--editor-font-size` CSS custom
property on `:root`, consumed by `Editor.css` (`.ProseMirror { font-size:
var(--editor-font-size, 18px); }`). Slider range inputs handle floor/ceiling
assertions.

**Rejected alternative:** Applying `uiScale` via `transform: scale()` on body
causes layout reflow issues with positioned elements (modals, overlays) and
would require `transform-origin` gymnastics. Using `font-size` on `html` as a
% would cascade unpredictably into editor content font size.

**R2:** Bounded cost — the CSS variable approach is decoupled from the schema;
changing the application mechanism is a SettingsWorkspace + Editor.css edit.

---

## Build System

### D0XX — AppImage Chromium sandbox workaround implementation (R1)

**Context:** AGENTS.md §11 prescribes using `scripts/apprun.sh` as the `runtime`
option in `@reforged/maker-appimage` to work around the Electron Chromium SUID
sandbox crash inside the read-only squashfs. The `runtime` option, however,
replaces the outer AppImage ELF runtime binary with the shell script — the script
runs *before* the squashfs is mounted, so `$HERE/plotline` resolves to the
AppImage file's directory (no binary present) rather than the mount point.

**Chosen:** Remove the `runtime` config and instead use
`packagerConfig.afterComplete` to rename the Electron binary (`plotline` →
`plotline.bin`) and write a shell wrapper script (`plotline`) that execs the real
binary with `--no-sandbox`. The `AppRun` symlink (→ `usr/bin/plotline` →
`usr/lib/plotline/plotline`) resolves to the wrapper, which passes `--no-sandbox`
to the real binary via `readlink -f` to handle the symlink chain correctly.

**Why this works:** The `AppRun` is a standard symlink inside the squashfs; the
standard ELF runtime mounts the squashfs, executes `AppRun`, which follows the
symlink chain to the wrapper script. The wrapper runs inside the mounted
filesystem and launches the real binary. The `afterComplete` hook runs after all
files (including the Electron binary) are in place.

**Impact:** The `scripts/apprun.sh` file remains in the repo as documentation but
is no longer referenced in `forge.config.js`. The sandbox workaround is
functionally identical — `--no-sandbox` is always applied on AppImage launch.

**R1:** Trivially reversible — swapping between approaches requires only
`forge.config.js` edits and a rebuild.

---

## WP-38: Unified Story Variable Registry

### D024 — Unified variable registry over parallel legacy/custom paths (R3)

**Context:** The product spec calls for custom user-defined variables alongside the
four built-in variables (Tone, Writing Style, Plot Constraints, Character/Voice
Sheets). Implementing custom variables as a separate code path parallel to built-ins
was the cheaper first commit — but every subsequent commit would have doubled the
testing surface, GUI complexity, and injection logic.

**Chosen:** Built-ins migrate into the same registry and schema as custom variables.
One `StoryVariable` schema with `kind: 'builtin' | 'system' | 'custom'`, one
`VariableService`, one `assemble()` injection path, one GUI workspace. No parallel
code paths for "legacy" vs "custom" variables anywhere in services, IPC, context
assembly, or GUI.

**R3:** Once user-created variables exist in projects, splitting the registry back
would lose user-authored structure. The migration from old schema (v1, core-based)
to new schema (v2, kind-based) is forward-only in normal operation.

---

## WP-39: Context Rail Manual Toggles

### D025 — Manual scope as per-generation toggle, not sticky state (R1)

**Context:** Manual-scope variables are intended for one-off generation guidance —
a specific instruction you want in one call but not the next. A sticky toggle
(where the state persists across generations) would be invisible state that
violates the design guarantee "what the model reads is never a mystery."

**Chosen:** Manual-scope variables are opted in per generation via an inline
checkbox in the context rail. The toggle resets after each generation completes
— the next generation starts with all manual toggles off. The user explicitly
activates the variables they want for each call.

**R1:** Reversible <1h — the toggle mechanism is a single boolean in the context
rail component; making it sticky would be a Zustand store change.

---

## WP-40: Global Constraints System Variable

### D026 — Global Constraints as scope-locked system variable (R2)

**Context:** Book-wide invariants (e.g., "no profanity", "MC never uses contractions",
"all dialogue in past tense") must be unconditionally respected across every
per-section Write call and every Expand and Iterate. Making scope user-configurable
for such invariants risks drift — a user could accidentally set the scope to "manual"
and lose the constraint for an entire generation run.

**Chosen:** Global Constraints is a dedicated system variable with `kind: 'system'`,
`scopeLocked: true`, and scope hard-locked to `always`. The scope selector in the GUI
is rendered as disabled with a tooltip. Enforcement is server-side: `setScope` on a
`scopeLocked` variable returns `SCOPE_LOCKED`.

**Rejected alternative:** User-managed scope on Global Constraints (same as built-ins).
Rejected because it defeats the structural guarantee. Deliberate flexibility reduction
in exchange for a guarantee that invariants structurally reach every generation call.

**R2:** Bounded cost — unlocking the scope would require schema changes, IPC handler
updates, GUI changes, and migration of existing projects.

---

## Write without Expand

### D027 — Write from concise outline when no expanded outline exists (R1)

**Context:** The original pipeline required Expand → Write: the Write step always needed
`expanded-outline.html` as its upstream artifact. The user demanded that any chapter be
generatable from either the concise or the expanded outline — one outline is the source
of truth, and Expand is a user choice.

**Chosen:** When `startWrite` reads a chapter ref and finds no `expanded-outline.html`,
it falls back to using the chapter's formatted outline slice (from `formatChapterSlice`)
as the upstream artifact. No schema changes, no template changes. The per-chapter style
instruction block is unchanged — style guidance comes from the full Story Variable system.

**R1:** Reversible <1h — the fallback is a 3-line `if` block in `GenerationService.ts`.
Removing it restores the original Expand-required behavior.

---

### D028 — Text selection allowed on content-bearing UI (R1)

**Context:** `user-select: none` was applied to virtually all UI chrome across 8 CSS files, making chapter names, variable names, settings labels, and command palette items unselectable for debugging/copy purposes. Only the TipTap editor supported text selection.

**Chosen:** Remove `user-select: none` from 20 content-bearing selectors. Keep on interactive chrome only (drag grips, decorative bullets, toolbar, resize handles, icons, toast buttons). Users can now select and copy text from any content-bearing element.

**R1:** Reversible <1h — adding `user-select: none` back is a CSS-only edit.

### D029 — Generation action bar in command palette (R1)

**Context:** Generation actions (Expand, Write) were only available via filtered search results in the command palette. The user wanted always-visible buttons at the bottom of the palette.

**Chosen:** Add a `.command-palette__gen-bar` footer with 4 buttons (Expand, Write, Re-expand, Re-write) showing current model names and keyboard shortcuts. Buttons are disabled when no chapter is selected or generation is streaming. Hover shows accent color highlight.

**R1:** Reversible <1h — removing the bar is a component prop + CSS edit.
