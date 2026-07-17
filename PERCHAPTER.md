# Per-Chapter Tone and Style in Plotline

**Version: 1.0.0 | 2026-07-17**

This document explains what does and does not exist for setting per-chapter tone
and style instructions in the current Plotline application (v0.2.0). It is based
on reading the source code, not the design docs.

---

## 1. The short answer

**Per-chapter style instructions do not work in the GUI today.**

There is code in the generation engine that looks for a per-chapter style file
(`style-instruction.txt`) and would inject it into the Write prompt. But there
is no way to create or edit that file through the user interface. The feature
is half-built: the consumption side works, but the production side (any UI or
importer that writes the file) does not exist.

---

## 2. What the code says (the half-built feature)

### 2.1 The setting exists

Every project has a `styleGuidance` setting in its manifest (`project.json`).
It accepts two values:

| Value | Meaning |
|---|---|
| `'per-chapter'` | **(default)** Inject a chapter-specific style instruction if one exists |
| `'per-project'` | Use only per-project Story Variables; ignore any per-chapter file |

The default on project creation is `'per-chapter'`.

### 2.2 The code reads `style-instruction.txt`

When a Write job runs, `GenerationService.startWrite()` (line 270–283)
checks `project.settings.styleGuidance`. If it is `'per-chapter'` (the default),
it tries to read a file called `style-instruction.txt` from the chapter's Git
ref. If the file exists, its contents are wrapped in a block and appended to
the `story_variables` string:

```
=== STORY VARIABLE: Per-Chapter Style Guidance ===
<contents of style-instruction.txt>
=== END VARIABLE ===
```

This block is then passed into the Write prompt template as part of
`{{story_variables}}`. The write-v2 system prompt (rule 5) makes STORY CONTEXT
authoritative for voice and style, so the block would influence generation —
if it existed.

### 2.3 The file is never created

Searching the entire codebase, `style-instruction.txt` is referenced **only**
at the read site in `GenerationService.ts`. No code anywhere writes this file:

- No outline importer extracts per-chapter style.
- No chapter editor lets you type per-chapter instructions.
- No Settings Workspace toggle exposes `styleGuidance` in the UI.
- No IPC handler commits `style-instruction.txt` to a chapter ref.

The feature is wired for consumption but has no production pipeline.

---

## 3. What actually works for controlling style

Since per-chapter instructions are not usable through the GUI, here is what
you can do instead.

### 3.1 Story Variables (per-project, fully functional)

The **Variable Studio** (accessible from the sidebar) gives you four built-in
variables that apply project-wide:

| Variable | Slug | Default Scope | What it is for |
|---|---|---|---|
| Tone | `tone` | `always` | Overall narrative tone (e.g., "lyrical and introspective") |
| Writing Style | `style` | `always` | Prose style guidance (e.g., "short sentences, minimalist") |
| Plot Constraints | `constraints` | `always` | Plot rules that must never be violated |
| Character / Voice Sheets | `characters` | `always` | Per-character voice and personality profiles |

Each variable can be scoped to fire only on certain generation steps:

- **Always** — injected into every generation call (Expand, Write, Iterate).
- **On Expand** — only during the Expand phase.
- **On Write** — only during the Write phase.
- **Manual** — never auto-injected; toggled manually per-chapter via the
  Context Rail before generation.

You can also create **custom variables** with any name and content, scoped
the same way.

### 3.2 Global Constraints (system variable, always injected)

The "Global Constraints" system variable is automatically created when you
open or create a project. You can change its scope via the Variable Studio
dropdown (it is no longer locked to `Always`). Use this for hard rules that
must apply to every chapter (e.g., "No anachronisms", "Maintain first-person POV").

### 3.3 Manual toggles per chapter (via Context Rail)

In the **Context Rail** (right sidebar when editing a chapter), you can
manually toggle which `manual`-scoped Story Variables are active for the
current generation. This is the only per-chapter variable control that
exists in the GUI today.

### 3.4 Iteration (post-generation revisions)

The **Iterate** workflow (write a chapter, then revise) lets you issue a
free-text instruction to the model. You can use this to say "Rewrite this
chapter in a more ominous tone" or "Make the dialogue snappier." The result
is held as a proposal that you can accept or discard.

This is the most flexible per-chapter style control available today, but it
operates after generation, not during it.

---

## 4. Workarounds for per-chapter style differences

### Best available approach

1. In the **Variable Studio**, create custom variables named for each chapter
   (e.g., "Chapter 3 Tone", "Chapter 7 Style"). Set their scope to `manual`.
2. Before generating a chapter, open the **Context Rail** and toggle on only
   the variables that apply to that chapter.
3. Generate. The active manual variables will be injected into the prompt.

This is clunky — you have N variables per N chapters — but it works.

### If you absolutely need per-chapter instructions in the prompt

The `style-instruction.txt` file **does work** if you can get it onto the
chapter's Git ref. The path is:

```
<book-project-repo>/refs/plotline/chapters/<chapterId>/main/style-instruction.txt
```

You can manually place this file there by interacting with the book-project
repo directly (e.g., with `isomorphic-git` or by finding the bare repo on
disk). The location of book-project repos depends on the app's data directory:

- Linux: `~/.local/share/plotline/projects/<projectId>/`
- macOS: `~/Library/Application Support/plotline/projects/<projectId>/`
- Windows: `%APPDATA%/plotline/projects/<projectId>/`

**This is unsupported and may break with future updates.** There is no
guarantee the file format or location will remain stable.

---

## 5. What the templates say about style

The write-v2 system prompt (`src/main/templates/write-v2/system.txt`) includes
this rule (item 2 of its 9 rules):

> 2. Voice and style: STORY CONTEXT (if present) is authoritative creative
> direction — follow its tone, writing style, plot constraints, and character/voice
> sheets. Where it is silent, default to an engaging, assured narrative voice
> appropriate to the material and consistent with the preceding text.

So any content injected into `{{story_variables}}` — whether from per-project
variables or a hypothetical per-chapter file — is treated as binding direction
by the model.

---

## 6. Summary

| Feature | Status | How to use |
|---|---|---|
| Per-chapter `style-instruction.txt` | Half-built (reads but never written) | No GUI available |
| `styleGuidance` setting toggle | Schema exists, no UI control | Use IPC directly or manual repo edit |
| Per-project Story Variables (Tone, Style, etc.) | Fully functional | Variable Studio |
| Global Constraints | Fully functional | Auto-created on project open or create; scope dropdown active |
| Manual-scoped variables per chapter | Fully functional | Variable Studio + Context Rail |
| Iterate (post-gen revision) | Fully functional | Chapter toolbar > Iterate |
| Per-chapter style in outline import | Does not exist | N/A |
| Per-chapter style in ChapterWorkspace | Does not exist | N/A |
