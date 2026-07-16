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
