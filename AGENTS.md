# Plotline — AGENTS.md

Project-specific guidance for OpenCode sessions. The global `~/.config/opencode/AGENTS.md` (working guidelines, decision ledger, self-grading ban, approval discipline, invariant guards, worktrees, filesystem deny list, Electron/AppImage pitfall) applies in full and is **not duplicated here** — this file adds only what is specific to Plotline.

**Version: 0.3.0 | 2026-07-17**

## Read the docs first — every run

Before any code or planning work, read the two documents in `docs/`. They are the contract, not background reference:

- `docs/plotline-design-doc-v0.4.0.md` — product behavior, revision model, UI flows, open questions
- `docs/plotline-tech-spec-v0.3.0.md` — architecture, Git model, data schemas, main-process services, IPC contract, testing contract

If a decision isn't in these docs, it's undecided — don't infer it from filenames or generic framework conventions. When the docs conflict with the README, trust the docs (they are versioned; the README is a summary).

## Canonical working material

The novel used for development and testing is **"Tether"**, a generation-ship story. The full extended outline lives at:

- `src/__tests__/fixtures/Full_extended_outline.md`

When the user refers to "the outline" or "the book outline" without qualification, they mean this file. It contains 17 chapters across 4 parts with per-chapter style/tone instructions, word targets, and beats. Use it for import testing, generation testing, and any manual workflow verification.

## Current state

- **v0.2.0 app** with full toolchain: `npm run dev` (Electron + Vite HMR), `npm test` (729 tests, 21 pre-existing failures), `npm run build` (deb + AppImage).
- Story variable system (v2.0.0 schema): unified registry with four built-ins, Global Constraints system variable, user-defined custom variables with per-variable scopes, context-rail manual toggles.
- Prerequisites: Node.js ≥ 20, npm ≥ 10.

## Architecture invariants (do not violate)

- **Renderer is sandboxed.** The React/TS renderer never touches disk, Git, or network. Every durable operation crosses the typed IPC contract (tech spec §7). A new capability gets a new IPC command — never a renderer-side `fs`/`fetch` call.
- **Git is an object database, not a working tree** (tech spec §2). StorageService reads/writes refs and trees directly; there is no `checkout`, no working directory, and no branches/commits exposed to the user. Do not reach for `git checkout` / `git commit` workflows inside StorageService.
- **Two distinct Git repos.** This repo (the Plotline app source) is separate from the per-book-project Git repos that StorageService creates for users. Book-project repos live *outside* this repo and are managed entirely by StorageService. This repo's `.gitignore` covers only app build artifacts — it does not govern user book projects.
- **API keys live in the OS keychain**, never on disk, never in the project repo, never in logs or prompts (tech spec §9; also enforced by global §8).
- **Canonical output format is Substack-safe HTML.** The editor structurally cannot produce anything outside that subset, and the sanitizer (tech spec §6.3) is load-bearing for export correctness. Don't bypass the sanitizer or widen the editor's tag set without an R3 decision.
- **One-click pipeline is a design guarantee, not an aspiration** (design doc §5.5). Expand → Write on the happy path has no dialogs. Do not add confirmation prompts to the happy path.

## Work-package workflow

From roadmap §0 (Execution Conventions):

- **One commit per work package.** Identify which WP you're in before starting (current milestone lives in `CHANGELOG.md`; if it's missing, ask).
- **Acceptance criteria are tests.** A WP is not done until its acceptance tests are green; tech spec §10 defines the minimum testing bar.
- **Gated milestones.** Each milestone ends in a 🔒 gate (G-M0…G-M5). Don't start work in a new milestone before the prior gate passes.
- **Deviations** from the Design Doc or Tech Spec are logged in the milestone audit pack with a reversibility tag (R1/R2/R3 — global §2). Open library choices go in `DECISIONS.md`.
- Test fixtures: StorageService tests (WP-02/03) create throwaway Git repos under `tmp/` and `test-repos/` (gitignored). Benchmarks (WP-29) use `bench-projects/` and `bench-results/`.

## Build & runtime gotchas

- **Tectonic** (PDF export, WP-25) is fetched at build time into `vendor/tectonic/` and is never committed. Don't expect it in a fresh checkout, and don't commit a local copy.
- **AppImage packaging** will hit the Chromium SUID sandbox crash — apply the global §9 fix (`scripts/apprun.sh` wrapper + forge maker `runtime` entrypoint) at packaging time, never as a post-build patch.

## Conventions that differ from defaults

- **No system git assumed.** Whether the storage layer uses system git or isomorphic-git is open decision **T3** (tech spec §0; to be recorded in `DECISIONS.md`). Don't assume `git` is on PATH until that's decided.
- **Per-project settings live in the project manifest** (`project.json`, tech spec §3.1), not in app-level config. Model selection, inference base URL, continuity budget, theme, and editor font mode are all per-project.
