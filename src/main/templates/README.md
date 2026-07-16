# Built-in Prompt Templates

This directory ships built-in prompt templates for the three generation steps:
`expand`, `write`, and `iterate`. Each template is a subdirectory named
`<template-id>/` containing:

- `template.json` — metadata (id, version, step, description)
- `system.txt`    — system prompt with `{{placeholder}}` substitution markers
- `user.txt`      — user prompt with `{{placeholder}}` substitution markers

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
  iterate-v1/
    template.json
    system.txt
    user.txt
```

## Available placeholders

- `{{book_outline}}`
- `{{chapter_slice}}`
- `{{story_variables}}`
- `{{upstream_artifact}}`
- `{{current_artifact}}`
- `{{instruction}}`
- `{{continuity_context}}`
- `{{word_target}}`
- `{{output_format_contract}}`

## Resolution order

1. **Project override** — templates committed to the project Git repo under
   `templates/<templateId>/` take precedence.
2. **Built-in** — these files on disk are the fallback.

Template content is loaded from `template.json`, `system.txt`, and `user.txt`
inside each versioned subdirectory. See the individual template files for the
specific prompt templates used in the expand, write, and iterate steps.
