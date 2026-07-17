# G-M6 Audit Pack — The Eyesight Gate

**Gate:** G-M6 (M6 → release 0.2.0)
**Date:** 2026-07-17
**Scope:** WP-31, WP-32, WP-33, WP-34, WP-35
**Test result:** 699 passed, 0 failed, 1 skipped (700 total)
**Version:** app `0.2.0`

---

## What Was Built

### WP-31 — Token Set & Contrast CI
- **`tokens.css`** rewritten with WCAG-verified light/dark color pairs (all pairs ≥4.5:1 for text contrast). Light theme is default on `:root`; dark theme under `[data-theme="dark"]`.
- Chrome font stack: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', ...` (D018). Monospace restricted to code/pre contexts only.
- Font-size scale: `--font-size-xs` (12px) through `--font-size-xl` (16px), meeting DD §9 minima.
- **`contrast.test.ts`**: 20 automated assertions across 9 semantic color pairs in both themes. All passing.
- **`fontMinima.test.ts`**: 3 assertions verifying no font-size token or hardcoded style falls below 12px floor.
- Theme default changed from dark to light in both `ProjectSettingsSchema` (schema default) and `ProjectService.defaultSettings`.

### WP-32 — Visual Remediation Audit
- Manual scan confirmed no hardcoded-chrome violations in CSS or TSX — all components consume design tokens.
- Monospace verified in code/pre contexts only (Editor.css, LaTeX log pane).
- Diff colors (`--diff-added-bg`, `--diff-removed-bg`) verified legible in both themes.
- D019 (light theme default) schema fix applied.

### WP-34 — Import UI
- **IPC**: `project:pickAndImportOutline` command added — opens native Electron `dialog.showOpenDialog`, reads markdown, parses via `parseOutlineMarkdown()`, returns `ParsePreview` or `null`.
- **`ImportDialog.tsx`** (323 lines): 3-mode modal — trigger, paste textarea, preview display with Confirm/Cancel. Preview shows project title, part/chapter/section/beat counts.
- **Affordances** at all 3 DD §4 entry points:
  - Command palette: "Import Outline" action (navigation category, `Cmd+I`)
  - Workspace empty state: "Import Outline" button
  - ChapterWorkspace empty state: "Import Outline" button
- **ManuscriptTree** and **OutlineWorkspace** empty states: "Import Outline" buttons.
- **`deadInstruction.test.ts`**: Scans all empty states for "import" mentions without adjacent functional controls. Excludes ImportDialog.tsx itself, BEM class names, and IPC call sites. Includes positive assertions for buttons in ManuscriptTree and OutlineWorkspace.

### WP-35 — Typography & Accessibility Settings
- **Schema**: `typography: { uiScale: 90-150% (default 100), editorFontSize: 16-24px (default 18) }` added to `ProjectSettingsSchema` and IPC command map.
- **SettingsWorkspace**: Typography collapsible section with range sliders (10% increments for scale, 1px increments for font size).
- **Live application**: `uiScale` → CSS `zoom` on `<html>`; `editorFontSize` → `--editor-font-size` custom property consumed by `Editor.css` (`.ProseMirror`).
- Slider min/max enforce DD §9 floor/ceiling.

### WP-33 — Regression Sweep & Release Prep
- Full test suite: 699 passed, 0 failed, 1 skipped (700 total).
- Version bump: `0.1.0` → `0.2.0` in `package.json`.
- CHANGELOG updated with all M6 entries.
- DECISIONS updated with D020–D023.
- SettingsWorkspace section count test updated (7 → 8 for Typography).
- deadInstruction test rewritten with exclusion rules and positive assertions.

---

## Deviations from Spec

| ID | WP | Deviation | Tag | Resolution |
|----|-----|-----------|-----|------------|
| D-M6-01 | WP-35 | DD §9 specifies `editorFontSize` default of 19px; implemented as 18px to match existing Editor.css value and avoid widening measure on upgrade | R1 | Trivial to change if owner prefers 19px |
| D-M6-02 | WP-35 | DD §9 specifies `Cmd/Ctrl +/−/0` keybindings for editor text size; not yet implemented — keybinding map (WP-26) not loaded in this codebase | R2 | Deferred to post-gate; no conflict risk since WP-26 bindings don't exist yet |
| D-M6-03 | WP-34 | DD §4 specifies "New Project flow" as one of three import affordances; renderer uses hardcoded 'demo' projectId — real project CRUD (WP-05) not wired to UI | R2 | Workaround: import button works against 'demo' project; real project management is a separate WP beyond M6 scope |
| D-M6-04 | WP-34 | `project:pickAndImportOutline` returns `ParsePreview | null` rather than throwing on file dialog cancel; IPC handler returns structured null result | R1 | Consistent with existing error-envelope pattern; caller checks for null |
| D-M6-05 | WP-34 | "Project not open: demo" — `openProjects` map empty at startup because no startup code opens/creates the demo project. Fixed by: `createWindow()` now calls `projectService.open('demo')` (or `create('Demo Project')` if missing), `importOutlinePreview` guard removed (pure function), `confirmImportOutline` auto-creates/opens if needed | R1 | Startup fix ensures all IPC commands (outline, chapter, variables, etc.) can reach 'demo' |
| D-M6-06 | WP-34 | Removed all auto-project-creation at app startup per owner directive. App now opens to an empty welcome screen with "New Project" and "Open Project" buttons. `project:create` and `project:open` auto-persist as active. `project:getActive` returns null when no project exists. Hardcoded `'demo'` projectId fully eliminated from renderer. | R2 | Reversible <2h. Welcome screen is a single component; adding onboarding or a project picker later replaces it. |

---

## Open Risks

1. **Paste-fallback not e2e-tested.** The ImportDialog paste mode creates `ParsePreview` correctly, but e2e runs only the file-picker path. Paste path is exercised by `outlineImporter.test.ts` (18 parser tests) but not through the UI dialog flow.
2. **No Cmd+/−/0 keybindings** (D-M6-02). Editor font size changes require opening Settings. Low urgency for 0.2.0.
3. **'demo' projectId** limits real-world import testing. Import works against the auto-created 'demo' project (now created/opened at app startup), but real project lifecycle (create/rename/delete) is not wired to UI. WP-05 (project CRUD UI wiring) would unlock full New Project → Import → Write flow.

---

## Runnable Demo Path

Owner acceptance (G-M6 §283):
1. Launch `npm run dev` (or packaged AppImage)
2. **Import:** Cmd+K → "Import Outline" → Choose File → select `src/__tests__/fixtures/LKY_Book_Outline_v0_2.md` → preview shows "2 parts · 6 chapters" → Confirm
3. **Two-click pipeline:** Select a chapter → click Expand → click Write
4. **Reading comfort:** Read a generated chapter for 15 minutes with editor at 18px serif
5. **Typography controls:** Settings → Typography → adjust UI Scale (90-150%) and Editor Font Size (16-24px) → confirm live changes

---

## PENDING-OWNER (per Roadmap §0 Rule 5)

| Check | Status |
|-------|--------|
| F1: One-click pipeline (now via WP-34 UI path) | `PENDING-OWNER` |
| Env requirement: `PLOTLINE_TEST_API_KEY` for live inference gate | `PENDING-OWNER` |
| F2: Staleness matrix (typography changes must be behaviorally inert) | `PENDING-OWNER` |
| F3: Empty/error-state visual sweep both themes | `PENDING-OWNER` |
| F4: Perf spot-check (TS §8.1 targets) | `PENDING-OWNER` |
| F5: 15-minute reading comfort test | `PENDING-OWNER` |
| F6: Typography controls behave correctly at range extremes | `PENDING-OWNER` |

**Gate release blocked until all PENDING-OWNER items are owner-checked.**
