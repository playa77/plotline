# Plotline — Design Doc

**Document:** 1 of 4 (Design Doc → Tech Spec → Roadmap → README)
**Version:** v0.4.0
**Date:** 2026-07-17
**Status:** Active
**Audience:** Product owner (review), coding agent (downstream context)

**Changelog**
- **v0.4.0 (2026-07-17):** §3 gains the **Project Library** (launcher, recents, switcher) and a **native application menu** — the multi-book entry surface implied by A3 but never given UI treatment. Defect: backend project lifecycle existed with no renderer path (same failure class as v0.3.0's import gap).
- **v0.3.0 (2026-07-17):** §4 gains explicit **import affordances** and the "no dead instructions" rule (defect: backend importer existed with zero renderer path to it). §9 gains **user typography controls** (UI scale + editor font size) — accessibility gap: minima existed, user adjustment did not. Consumed by TS v0.2.0 and Roadmap v0.3.0.
- **v0.2.0 (2026-07-17):** §9 rewritten. Monospace chrome dropped — Plotline is a long-form reading/writing instrument, and the v0.1.0 mono-everywhere aesthetic (carried over from the owner's developer-tool preferences) is wrong for this domain. Normative typography sizes and WCAG contrast minima added; light theme becomes default. Owner-reported eye strain is the driving defect.
- **v0.1.0 (2026-07-16):** Initial draft.

---

## 0. Decisions & Assumptions

Decisions confirmed by the product owner or proposed here for veto. Reversibility tags: **R1** = trivially reversible, **R2** = reversible with migration effort, **R3** = load-bearing, expensive to reverse.

| # | Decision | Tag | Source |
|---|----------|-----|--------|
| D1 | **Two-level revision model.** *Versions* = named parallel alternatives of one chapter's artifact pair (Expanded Outline + Written Chapter, versioned as a unit). *History* = linear restore-point timeline inside each version. | R3 | Proposed, pending veto |
| D2 | Book Outline and Story Variables have linear History only in v1 — no branching of global context. | R2 | Proposed, pending veto |
| D3 | Story Variables = fixed core set (Tone, Writing Style, Plot Constraints, Character Sheets) + unlimited user-defined custom variables. | R2 | Confirmed by owner |
| D4 | **Canonical artifact format is Substack-safe HTML.** The editor is rich-text over that HTML subset. Markdown is an import and export format only. PDF export via user-selectable LaTeX templates. | R3 | Confirmed by owner |
| D5 | All persistence, history, and versioning via a local Git repository. Git terminology never appears in the UI ("Versions", "History", "Restore" instead). | R3 | Given in brief |
| D6 | Electron desktop app, Node.js backend, React/TypeScript frontend, local-first. | R3 | Given in brief |
| A1 | Inference via OpenRouter-compatible API; model selectable per workflow step (Expand / Write / Iterate). | R1 | Assumption |
| A2 | Nonfiction and fiction both supported; "Character Sheets" renders as "Character / Voice Sheets" so the nonfiction case (recurring figures, narrative voice) is not alienated. | R1 | Assumption |
| A3 | One book per Plotline project (one Git repo). Multi-book library is a project switcher, not a merged workspace. | R2 | Assumption |
| A4 | UI language English in v1; content language-agnostic (the reference outline is English; German manuscripts must work identically). | R1 | Assumption |

---

## 1. The Writer's Mental Model

Plotline is built around a single pipeline the writer already carries in their head:

```
Book Outline ──▶ Expanded Chapter Outline ──▶ Written Chapter ──▶ Published (Substack / PDF)
                        ▲                            ▲
                        └──── Story Variables ───────┘
                              (ambient context)
```

Three principles fall out of this and govern every screen:

**One artifact per stage, one click per transition.** The writer never assembles context manually. Selecting a chapter and clicking **Expand** produces its Expanded Chapter Outline; clicking **Write** produces the Written Chapter. The app assembles the inputs (Book Outline slice + Story Variables for Expand; Expanded Outline + Story Variables + established tone/style for Write) invisibly.

**Every stage is revisable two ways.** Directly — the artifact is an editable document, always. Or conversationally — an **Iterate** instruction box scoped to exactly the artifact on screen ("compress section 1.2 by half, keep the Jamaica comparison"). Both produce restore points in History. Neither requires leaving the screen.

**Alternatives are cheap and named.** Trying a different angle on a chapter is one click ("New Version from here"), gets a human name, and never destroys anything. Git branches under the hood; the words "branch", "commit", "checkout", "merge" never surface.

---

## 2. The Revision Model, Precisely

This section is normative. The Tech Spec maps it to Git; here it is defined purely in user-facing terms.

### 2.1 Artifacts

| Artifact | Scope | Versions? | History? |
|----------|-------|-----------|----------|
| Book Outline | Global, one per project | No (v1) | Yes |
| Story Variables (each variable is its own document) | Global | No (v1) | Yes |
| Expanded Chapter Outline | Per chapter | Yes — as half of the chapter pair | Yes, within each version |
| Written Chapter | Per chapter | Yes — as half of the chapter pair | Yes, within each version |

### 2.2 Chapter Versions

A **Version** belongs to exactly one chapter and contains that chapter's **artifact pair**: Expanded Chapter Outline + Written Chapter. They travel together because the chapter text is derived from its expanded outline; splitting them would break the provenance chain. Every chapter starts with one version, named **Main**. Each chapter independently has a *selected* version — Chapter 3 on *cold-open* while Chapter 7 sits on *Main* is normal and visible at a glance in the manuscript tree.

Creating a version: from any point (current state or a History restore point), **New Version** duplicates the pair under a user-chosen name. Versions can be renamed, compared side-by-side, promoted ("Make this the selected version"), and archived (hidden, never deleted).

### 2.3 History

Every save, every generation, and every Iterate result creates a restore point inside the current version, labeled automatically ("Edited manually", "Generated — Expand", "Iterate: 'compress section 1.2…'") with timestamp. Restoring is non-destructive: it creates a new restore point equal to the old state, so History itself never rewrites.

### 2.4 Staleness

Downstream artifacts carry an **Upstream changed** badge when their inputs moved after generation: the Expanded Outline goes stale when its Book Outline chapter entry or any injected Story Variable changes; the Written Chapter goes stale when its Expanded Outline or variables change. The badge is informational, never blocking, and offers a one-click **Regenerate** (which, like all generation, lands as a restore point — nothing is overwritten irrecoverably).

---

## 3. Information Architecture & App Shell

Three-pane layout, dense and tool-like (see §9 for visual language):

```
┌────────────┬──────────────────────────────────────────┬───────────────┐
│  LIBRARY   │  WORKSPACE                               │  CONTEXT RAIL │
│  (left)    │  (center)                                │  (right)      │
│            │                                          │               │
│ Manuscript │  Stage tabs:                             │  ▸ Iterate    │
│ tree       │  [Outline] [Expanded] [Chapter]          │  ▸ Variables  │
│            │  ┌────────────────────────────────────┐  │    in effect  │
│ ▸ Part I   │  │                                    │  │  ▸ History    │
│   ▸ Ch 1 ●●│  │   Rich-text editor                 │  │  ▸ Versions   │
│   ▸ Ch 2 ●○│  │   (Substack-safe HTML)             │  │               │
│ ▸ Part II  │  │                                    │  │               │
│   ▸ Ch 3 ○○│  │                                    │  │               │
│            │  └────────────────────────────────────┘  │               │
│ ─────────  │  Status bar: words 6,842 / target 7–8k   │               │
│ Variables  │  · version: cold-open · saved 12s ago    │               │
│ Exports    │                                          │               │
│ Settings   │                                          │               │
└────────────┴──────────────────────────────────────────┴───────────────┘
```

**Left — Library pane.** The manuscript tree mirrors the Book Outline structure exactly: Parts as group headers, Chapters as primary nodes, sections (1.1, 1.2 …) as an expandable sub-level. Each chapter node shows two stage dots — Expanded / Written — filled, hollow, or amber (stale), plus the selected version name when it isn't *Main*, and actual-vs-target word count. Below the tree: Variables, Exports, Settings.

**Project Library *(added v0.4.0, normative)*.** Plotline treats multiple books as first-class (A3): each book is its own project, and switching between them must be as unremarkable as switching files in an editor. On cold start with no project open, the app shows a **launcher**: recent projects (title, last-opened, word count) with one-click open, plus **New Project** and **Open…** (folder picker). While a project is open: the title bar shows the book title as a clickable **project switcher** (dropdown: recents + New + Open + Close Project), the same actions live in the command palette, and switching projects requires no save step — autosave means there is never unsaved state to lose. Closing or switching during an active generation prompts once: finish, cancel, or stay.

**Application menu *(added v0.4.0, normative)*.** A native menu bar exists on all platforms: **File** (New Project, Open…, Open Recent ▸, Close Project, Exit), **Edit** (standard clipboard + Find in chapter), **View** (theme, UI scale, editor text size — mirroring the §9 controls), **Help** (docs, version). Menu items invoke the same action objects as their palette/button counterparts. An app whose window chrome offers no menu is not a finished desktop app; this was an omission, not a choice.

**Center — Workspace.** Contextual to the selection. Chapter selected → the chapter workspace with three stage tabs (§5). Book Outline root selected → outline workspace (§4). A variable selected → the Variables studio (§6).

**Right — Context rail.** Collapsible sections: Iterate (the prompt box, §5.4), Variables in effect (what will be injected into the next generation, with per-generation toggles), History, Versions. The rail always describes *the artifact currently in the center pane* — this scoping is what makes "prompt the model how to iterate over this step exactly" unambiguous.

---

## 4. The Book Outline Workspace

The Book Outline is a structured document, not free text. Import (v1 supports Markdown import — the reference outline `LKY_Book_Outline_v0_2.md` is the acceptance case) parses:

- Parts (`## PART I — THE SHOCK`)
- Chapters with word targets (`### Chapter 1: …` + `**Target: 7,000–8,000 words**`)
- Numbered sections with per-section targets (`#### 1.1 … *(1,200 words)*`)
- Section beat lists (the bullet lines under each section)
- Front/back matter blocks (epilogue, appendix, word-count summary) as unstructured chapters

The workspace renders this as an editable structured view: chapters are cards in Part groups; each card shows its sections with drag-to-reorder, inline word-target fields, and beat text editable in place. A **source view** toggle exposes the underlying document for bulk edits. Structural edits (add/move/delete chapter) immediately reflow the manuscript tree; deleting a chapter that has generated artifacts warns and archives rather than destroys.

Every chapter card carries the primary action for its current state: **Expand** if no expanded outline exists, otherwise a quiet **Open** plus stage dots. This is where the one-click journey usually starts.

**Import affordances *(added v0.3.0, normative)*.** Importing a premade outline is the ~95 % entry path into the app and must be impossible to miss. The Import action is reachable from all of: (a) the **New Project** flow, as a step offered immediately after naming ("Start from an outline file / Start blank"); (b) **every empty state that mentions importing**, as a real button on that screen; (c) the **command palette**. The primary mechanism is a native file picker for a Markdown file; a paste-markdown textarea is the fallback within the same dialog. The parse preview (before anything is committed) shows detected Parts, Chapters, and sections with word targets and per-level counts ("4 parts · 11 chapters · 46 sections"), with Confirm / Cancel.

**No dead instructions *(rule, added v0.3.0)*.** Empty-state or helper text may never reference an affordance that does not exist and function on that same screen. Any string of the form "Use X to get started" must be backed by X being clickable adjacent to it. This is checkable and belongs in acceptance criteria wherever empty states are built.

---

## 5. The Chapter Workspace — the Heart of the App

Selecting a chapter opens its workspace with three stage tabs. The tab strip doubles as a pipeline indicator: each tab shows its stage dot (empty / filled / stale).

### 5.1 Stage: Outline

Read-mostly view of this chapter's slice of the Book Outline (its sections, targets, beats). Editable here too — edits write through to the Book Outline and mark downstream stages stale. Primary action button, top right: **Expand ▸** (or **Re-expand ▸** if an expanded outline exists — which always lands as a new restore point, with a one-keystroke "…as new Version instead" alternative in the button's split menu).

### 5.2 Stage: Expanded Outline

The generated Expanded Chapter Outline as an editable rich-text document. Generation streams into the editor token-by-token with a **Stop** control; on completion a restore point is written. The writer can immediately edit inline. Primary action: **Write ▸** (split menu: "Write as new Version…"). If the writer clicks **Write** while the expanded outline has unsaved edits, edits are saved first — the pipeline never runs on a phantom state.

### 5.3 Stage: Chapter

The Written Chapter in the full rich-text editor. This is where the writer lives longest, so it gets the full comfort features: typewriter scrolling option, section-heading minimap, live word count against the chapter's target, find/replace. Primary action here is **Export ▸** (§8) since the pipeline is complete — but **Rewrite ▸** remains available in the split menu.

### 5.4 Iterate — prompt-based revision, exactly scoped

The Iterate panel (context rail, also summonable via `Cmd/Ctrl+I`) is a single instruction box bound to the artifact on screen. Placeholder text makes the scope explicit: *"Tell the model how to revise this Expanded Outline for Chapter 2, version Main."*

Flow: writer types an instruction → **Run Iterate** → the app sends the current artifact, the instruction, the Story Variables in effect, and the upstream artifact for grounding → result streams in as a proposed revision shown as a **review diff** (changed passages highlighted inline, additions/deletions color-coded) → writer clicks **Accept** (restore point, labeled with the instruction), **Accept as new Version…**, or **Discard**. Iterate history is browsable: previous instructions are retrievable from a dropdown for re-running or editing.

The diff-review step exists only for Iterate, not for first generation — first generation has nothing to clobber; Iterate does, and the writer must stay in control of what replaces their text.

### 5.5 One-click contract (acceptance criteria)

From a freshly imported Book Outline: select any chapter → **one click** (Expand) → Expanded Chapter Outline exists → **one more click** (Write) → Written Chapter exists. No dialogs, no context assembly, no configuration prompts on the happy path. Any dialog on this path is a design defect.

---

## 6. Story Variables Studio

Reached from the Library pane. Left column lists variables in two groups — **Core** (Tone, Writing Style, Plot Constraints, Character / Voice Sheets) and **Custom** (user-created, freely named, e.g. "Recurring Statistics", "Terminology Glossary", "Forbidden Clichés"). Selecting one opens it in the center pane as a rich-text document with its own History in the context rail.

Each variable has:

- **Content** — the document itself. Character/Voice Sheets is a list-of-cards variant (one card per character or voice, each card its own small document) because writers think in sheets, not one blob.
- **Injection scope** — *Always* (default), *Expand only*, *Write only*, or *Manual* (only when toggled on in the context rail for a given generation). This keeps e.g. a plot-twist constraint out of stages where it would leak.
- **Status** — active / paused.

The context rail's "Variables in effect" section on any chapter stage lists exactly what the next generation will inject, each with an inline toggle for one-off exclusion. What the model sees is never a mystery.

Editing any active variable marks dependent generated artifacts stale (§2.4).

---

## 7. Versions & History UI

### 7.1 Versions panel (context rail, chapter stages only)

A flat named list for the current chapter: version name, created-from note ("from Main @ Jul 14"), word counts of its pair, last-touched time. The selected version is marked ●. Actions per row: Select, Rename, Compare, Archive. Top of panel: **New Version** (duplicates current state under a new name and selects it).

**Compare** opens a two-column side-by-side of the same stage across two versions, synchronized scrolling, differences highlighted. From compare, either side can be promoted to selected. No merge in v1 — comparing and cherry-picking by copy-paste is the honest v1 answer; automated merge of prose is out of scope (noted in §11).

### 7.2 History panel (context rail, all artifacts)

Reverse-chronological restore points for the artifact on screen, within the current version: label, timestamp, word delta (+312 / −87). Hovering previews the state in a peek overlay; **Restore** applies it as a new restore point; **New Version from here** branches an alternative from any past point — this is the primary escape hatch when a chapter went wrong three edits ago but the current text is also worth keeping.

---

## 8. Export

Export lives per chapter (Chapter stage primary action) and per book (Library pane → Exports).

**Substack (primary target).** Produces clean HTML restricted to Substack's supported subset — headings, paragraphs, bold/italic, links, blockquote, ordered/unordered lists, images with captions, horizontal rules, code blocks. One click: **Copy for Substack** (clipboard as rich HTML, paste-ready into the Substack editor) or save as `.html`. Because the canonical format already *is* this subset (D4), export is essentially identity plus hygiene — the editor toolbar simply never offers a construct Substack can't render, so nothing can silently degrade on paste.

**Markdown (optional).** Per chapter or whole manuscript, faithful conversion, front-matter block with title/part/version metadata.

**PDF via LaTeX (optional).** Whole-book or chapter export through a user-selectable LaTeX template. Ships with 2–3 templates (trade paperback, manuscript submission, A4 article); users can drop custom templates into a project folder and they appear in the picker. The export dialog shows template, page size, font choices exposed by the template, and a chapter-range selector. Rendering happens locally; failures surface the LaTeX log in a collapsible pane rather than a dead generic error.

---

## 9. Visual Design Language *(rewritten in v0.2.0)*

**Governing principle:** Plotline is a long-form reading and writing instrument. Readability over hours dominates every other aesthetic value. The *tool-like* character survives in structure — no decoration, no editorial layouts, ruthless information hierarchy — but is expressed through architecture, not typography. Monospace is banned from chrome and content alike; it appears only where the content is genuinely code-like (LaTeX error logs, debug views).

**Typography (normative).** Chrome — tree, rails, buttons, labels, status bar — uses a high-legibility proportional sans (Inter or the native system UI stack; agent's pick, ledgered), base size ≥ 14 px, tree rows ≥ 13 px, never smaller. Editor content renders in a proportional serif (Charter/Georgia class) at ≥ 18 px, line-height ≈ 1.6, measure constrained to 60–75 ch — the writer must see something like what readers will see. The "draft mono" editor toggle from v0.1.0 is retained as a strictly opt-in preference, off by default, and applies to editor content only, never chrome.

**Color & contrast (normative).** Light theme is the default — a warm paper-like off-white surface, near-black text — because that is the low-strain register for prose work. Dark theme remains available and must be designed as its own token set, not an inversion. Contrast minima, enforced by automated tests against the token set (see Roadmap WP-07 AC): manuscript and all long-form text ≥ 7:1 (WCAG AAA); all chrome text ≥ 4.5:1 (AA); non-text UI elements (dots, borders, icons) ≥ 3:1. A token that fails the assertion fails the build. Color remains semantic and sparse: stage dots, staleness amber, diff green/red, one accent for primary actions.

**Density.** Comfortable, not cramped. Density is achieved by information architecture (what earns a pixel), never by shrinking type below the minima above.

**User typography controls *(added v0.3.0, normative)*.** Settings exposes two live-applying controls, no restart: **UI scale** (90–150 %, default 100 %) scaling all chrome typography and spacing proportionally, and **Editor text size** (16–24 px, default 19 px) for manuscript content. The §9 minima are *floors*: no control position may render any text below them (at 90 % scale, chrome base still ≥ 14 px — the scale range is validated against the token set, not trusted). Both persist per project. Keyboard: `Cmd/Ctrl +` / `−` / `0` adjust and reset editor text size when the editor is focused.

No decoration, no illustrations, no empty-state mascots — empty states are a single line of text plus the one relevant action ("No expanded outline yet. **Expand ▸**").

Keyboard-first: every primary action bound (`Cmd/Ctrl+E` Expand, `Cmd/Ctrl+W`… no — reserved; use `Cmd/Ctrl+Shift+E` / `Cmd/Ctrl+Shift+W` for Expand/Write, `Cmd/Ctrl+I` Iterate, `Cmd/Ctrl+K` command palette covering every action including version switching).

---

## 10. Key User Flows (end-to-end)

**F1 — Import & first chapter.** New Project → name it → "Import outline" accepts a Markdown file → parse preview shows detected Parts/Chapters/sections with word targets, user confirms → manuscript tree populates → user opens Variables studio, fills Tone and Writing Style (2 min) → selects Chapter 1 → **Expand** → streamed expanded outline → **Write** → streamed chapter. Two clicks from outline to prose, as specified.

**F2 — Direct revision.** Writer reads generated Chapter 1, rewrites section 1.3 by hand in the editor. Autosave creates restore points on idle. Nothing else required.

**F3 — Prompted iteration.** On the Expanded Outline stage: `Cmd+I` → "cut section 1.4 to two countries, South Korea and Vietnam only, redistribute the word budget" → Run → diff review → Accept. The Written Chapter's tab dot turns amber (stale) → writer clicks Re-write when ready.

**F4 — Trying an alternative.** Chapter 2 works but the writer suspects a punchier structure exists. Versions panel → **New Version** → "inverted-pyramid" → Iterate on the expanded outline: "restructure to lead with the indictment (2.2), push the biography (2.1) to a closing sketch" → Accept → Write. Compare the two versions side by side; select the winner. The loser stays, archived or not, forever restorable.

**F5 — Upstream change ripple.** Writer sharpens the Tone variable ("less deferential, more prosecutorial"). Every generated artifact's dot goes amber. Writer regenerates chapters selectively, in any order, each landing as a restore point.

**F6 — Publish.** Chapter stage → **Export ▸ Copy for Substack** → paste into Substack → publishes without cleanup. Later: Exports → PDF → template "trade-paperback" → whole book → `plotline-export.pdf`.

---

## 11. Out of Scope for v1 (explicit)

Automated merge between chapter versions; branching of Book Outline or Story Variables (D2); collaboration/multi-user; cloud sync (local-first, Git remote push is a power-user affordance surfaced only in Settings); EPUB export; inline AI autocomplete while typing (Iterate is the only generation surface besides Expand/Write — keeps the writer's prose sovereign); mobile.

---

## 12. Open Questions for the Owner

1. D1/D2 veto or confirm.
2. Should **Write** for a chapter whose neighbors are already written also receive the *previous chapter's final paragraphs* as continuity context? (Recommended: yes, last ~500 words of the preceding written chapter, toggleable in Settings.) Not in the brief; flagging rather than assuming.
3. LaTeX toolchain: bundle Tectonic (self-contained, ~50 MB) vs. require system TeX Live? (Recommended: Tectonic; zero-install matches local-first frictionlessness.) Affects Tech Spec, not this document.

---

*End of Design Doc v0.1.0. Awaiting confirmation before Document 2: Technical Specification.*
