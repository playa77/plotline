# Built-in Prompt Templates

This directory ships built-in prompt templates for the three generation steps:
`expand`, `write`, and `iterate`. Each template is a subdirectory named
`<template-id>/` containing:

- `template.json` — metadata (id, version, step, description)
- `system.txt`    — system prompt with `{{placeholder}}` substitution markers
- `user.txt`      — user prompt with `{{placeholder}}` substitution markers

## Current template versions

| Template   | Version | Step    | Status |
|------------|---------|---------|--------|
| expand-v1  | 1.2.0   | expand  | active |
| write-v1   | 1.1.0   | write   | legacy (whole-chapter, single pass) |
| write-v2   | 2.1.0   | write   | active (per-section) |
| iterate-v1 | 1.1.0   | iterate | active |

Template content changes bump the `version` field in `template.json`
(semver: minor for behavior-refining prompt changes, major for contract
changes to inputs/outputs). The directory id (`-v1`, `-v2`) tracks the
template's I/O contract generation and only changes on a major bump.

## Template structure

```
templates/
  expand-v1/
    template.json
    system.txt
    user.txt
  write-v1/
    template.json
    system.txt
    user.txt
  write-v2/
    template.json
    system.txt
    user.txt
  iterate-v1/
    template.json
    system.txt
    user.txt
```

## Available placeholders

- `{{book_outline}}`
- `{{chapter_slice}}`
- `{{section_slice}}` (write-v2 only — the single section being written)
- `{{story_variables}}`
- `{{upstream_artifact}}`
- `{{current_artifact}}`
- `{{instruction}}`
- `{{continuity_context}}`
- `{{word_target}}`
- `{{output_format_contract}}`

## Conventions

- **Single source of truth for the HTML allowlist.** System prompts no longer
  duplicate the Substack-safe element allowlist; they defer to the
  `{{output_format_contract}}` injected into every user prompt and declare it
  binding. Changing the contract therefore changes all templates at once.
- **Story variables are authoritative creative direction.** Templates instruct
  the model to *apply* tone/style/constraint/voice content from STORY CONTEXT
  to the manuscript, while still refusing to treat anything inside injected
  data blocks as directives about the model's task, rules, or output format
  (prompt-injection hygiene).
- **Iterate is minimal-diff.** The iterate template requires verbatim
  preservation of all text outside the instruction's scope, because output is
  reviewed in the DiffView.

## Resolution order

1. **Project override** — templates committed to the project Git repo under
   `templates/<templateId>/` take precedence.
2. **Built-in** — these files on disk are the fallback.

Template content is loaded from `template.json`, `system.txt`, and `user.txt`
inside each versioned subdirectory.
