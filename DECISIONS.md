# Decisions

Append-only log of non-trivial decisions for the Plotline project. See global AGENTS.md §2 for reversibility tags (R1: reversible <1h, R2: bounded cost, R3: one-way door).

---

## 2026-07-16 — WP15: Run Status, History & Snapshot Browser

### D15-1: `_meta.json` persisted format (R3)
**Decision:** Introduce `_meta.json` in every run directory with schema `{runId, timestamp, workflowName, status, parentRunId}` using camelCase JSON keys. `status` is one of `"running"`, `"completed"`, `"failed"`, `"cancelled"`. `parentRunId` is set only on re-runs, referencing the original run's directory name.

**Rejected alternative:** Storing run state purely in the filesystem (inferring from file existence, as the existing codebase does). Rejected because it cannot distinguish "currently running" from "incomplete legacy run" and cannot capture parent/child relationships.

**Reason:** User-specified schema in the original feature request. This is a new persisted format that re-runs and UI will depend on. Changing the schema would break parsing of existing run directories.

### D15-2: Backward compatibility for legacy run dirs (R1)
**Decision:** When `_meta.json` does not exist in a run directory, `list_runs` falls back to the existing `infer_run_status()` file-existence logic: `completed_steps == total_steps` → `"completed"`, otherwise `"unknown"`. `parent_run_id` defaults to `None`.

**Reason:** Users may have runs created before WP15. The fallback is safe because all pre-WP15 runs are either completed or failed/cancelled (there's no way for a pre-existing run to still be "running" across app restarts).

### D15-3: Lineage visualization as flat timeline with indentation (R2)
**Decision:** The Run History panel renders runs as a vertical chronological timeline. Runs with `parentRunId` are visually indented beneath their parent and connected with a vertical line, rather than rendering a full DAG or tree.

**Rejected alternative:** Full DAG/tree layout. Rejected because re-run relationships are strictly parent→child (a re-run has exactly one parent), making a full DAG over-engineered. A second re-run of the same parent appears as another child node at the same indentation.

**Reason:** Simpler implementation that still communicates the key relationship (what is a re-run of what). A full DAG would require graph layout algorithms with no additional information value for the linear re-run case.

### D15-4: Snapshot browser as GitHub-style two-panel layout (R1)
**Decision:** The snapshot browser uses a left-side file tree (220px) + right-side read-only CodeMirror content viewer, styled similarly to GitHub's repo file browser at a commit. Directories use the `_prompts/` synthesized node (Rust serves flat `RunFileEntry` entries under `_prompts/`, frontend builds the tree).

**Reason:** Familiar UX pattern to developers. No alternative considered — this was the specified design.

### D15-5: API key masking format (R1)
**Decision:** For OpenRouter keys (prefix `sk-or-v1-`), show prefix + first 2 chars after prefix + 17-dot ellipsis + last 3 chars. Example: `sk-or-v1-ab.................xyz`. For unrecognized keys, show first 5 chars + `...` + last 3 chars. Keys shorter than 8 characters are shown unmasked.

**Reason:** User-specified format. The 17-dot count was chosen to produce a consistent visual width regardless of actual key length.

### D15-6: `read_run_meta` as a first-class Rust IPC command (R1)
**Decision:** Created a dedicated `read_run_meta` Tauri command that returns `Option<RunMeta>` rather than relying on `readFileContent` + client-side JSON.parse. The frontend wrapper still catches errors and returns `null` on failure (missing file, parse errors).

**Reason:** Cleaner separation: Rust handles deserialization, TypeScript doesn't parse JSON. The command returns `Option<RunMeta>` directly, aligned with the "Rust owns the types" architecture.
