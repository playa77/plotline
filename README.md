# Plotline

**A local-first, AI-assisted book writing application.**
From book outline to written chapter in two clicks — with every draft, revision, and alternative version preserved forever.

> Document 4 of 4 · README v0.1.0 · App version `0.1.0`

---

## What is Plotline?

Plotline is a desktop app for writers who work top-down: you bring a book outline, and Plotline carries each chapter through a two-stage AI pipeline — **Expanded Chapter Outline**, then **Written Chapter** — guided by persistent **Story Variables** (Tone, Writing Style, Plot Constraints, Character/Voice Sheets, plus any custom variables you define). Every stage remains fully yours: edit any artifact directly in a rich-text editor, or tell the model exactly how to revise it and review the proposed changes as a diff before accepting.

Everything is local. Your manuscript never leaves your machine except as prompts to the inference endpoint you configure. There is no account, no cloud, no telemetry.

## Core concepts

**The pipeline.** `Book Outline → Expanded Chapter Outline → Written Chapter → Export`. Selecting a chapter and clicking **Expand** produces its expanded outline; **Write** produces the chapter. Plotline assembles all context — outline slice, story variables, upstream artifacts, continuity from the preceding chapter — automatically. No dialogs on the happy path; that's a design guarantee, not an aspiration.

**Versions and History.** Every chapter can hold multiple named **Versions** — parallel alternatives of its expanded-outline-plus-chapter pair. Chapter 3 can sit on *cold-open* while Chapter 7 stays on *Main*. Inside each version, **History** records every save, generation, and accepted revision as a restore point. Nothing is ever destroyed; any past state can be restored or branched into a new version. Under the hood this is a local Git repository used as an object database — but you will never see a branch, commit, or checkout. That's deliberate.

**Story Variables.** A dedicated studio for the documents that steer generation. Each variable has an injection scope (always / expand-only / write-only / manual), and the context rail always shows exactly what the next generation will see. What the model reads is never a mystery.

**Substack-first output.** The canonical manuscript format is Substack-safe HTML, and the editor structurally cannot produce anything outside that subset — so **Copy for Substack** pastes clean, every time. Markdown export and PDF export (via bundled Tectonic, with selectable LaTeX templates) are built in.

## Status

Pre-release, under active development against a versioned document suite:

| Document | File |
|---|---|
| Design Doc v0.1.0 | `docs/plotline-design-doc-v0.1.0.md` |
| Technical Specification v0.1.0 | `docs/plotline-tech-spec-v0.1.0.md` |
| Granular Roadmap v0.1.0 | `docs/plotline-roadmap-v0.1.0.md` |
| Decision ledger | `DECISIONS.md` |
| Changelog | `CHANGELOG.md` |

The Roadmap defines 31 work packages (WP-00–WP-30) across six gated milestones. Current milestone status lives in `CHANGELOG.md`.

## Tech stack

Electron · Node.js (main process services) · React + TypeScript (renderer) · local Git as the persistence and versioning layer · OpenRouter-compatible streaming inference · Tectonic for PDF rendering. The renderer never touches disk, Git, or network — all durable operations cross a typed IPC contract.

## Getting started

**Prerequisites:** Node.js ≥ 20, npm ≥ 10. Git is *not* required on the machine unless the storage layer was built against system git — see `DECISIONS.md` (T3).

```bash
git clone <repo-url> plotline
cd plotline
npm install
npm run dev        # launch in development mode
npm test           # run the test suite
npm run build      # produce a packaged desktop build (see release/)
```

**First run:**

1. Open Plotline → **New Project**, or import an existing outline via **Import outline** (Markdown; parts, chapters with word targets, and numbered sections with beats are detected automatically — a parse preview lets you confirm before anything is written).
2. Open **Settings** and set your inference endpoint and API key. The key is stored in your OS keychain, never on disk and never inside the project repository.
3. Fill in **Tone** and **Writing Style** in the Story Variables studio (two minutes well spent — every generation reads them).
4. Select a chapter → **Expand** → **Write**. That's the whole loop.

## Configuration

Per-project settings (in-app, persisted in the project manifest): model per workflow step (Expand / Write / Iterate), inference base URL, continuity context toggle and word budget, theme, editor font mode. Custom LaTeX templates: drop a template into the project's `latex/` folder and it appears in the PDF export picker.

## Privacy & data ownership

Local-first is a hard commitment: the only network egress is your configured inference endpoint. Your book project is a plain Git repository on your disk — inspectable, backupable, and yours. An optional backup remote can be added manually in Settings; Plotline never configures or pushes to a remote on its own.

## Contributing

Development follows the Roadmap's execution conventions: one commit per work package, acceptance criteria as tests, deviations from the Design Doc or Tech Spec logged in the milestone audit pack with a reversibility tag, and every open library choice recorded in `DECISIONS.md`. Read all three documents in `docs/` before touching code — they are the contract.

## License

TBD before `0.1.0` release.
