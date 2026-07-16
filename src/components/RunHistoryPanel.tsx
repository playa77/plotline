// Version: 1.0.0 | 2026-07-16
// Run history timeline: visualizes run lineage as a vertically-connected list
// of cards. Each card shows status, workflow name, timestamp, and step progress.
// Child runs (re-runs) are indented beneath their parent with a connector line.

import { useMemo, useCallback } from "react";
import type { RunSummary } from "../types";
import styles from "./RunHistoryPanel.module.css";

interface RunHistoryPanelProps {
  runs: RunSummary[];
  onSelectRun: (runDir: string) => void;
}

/** Status-to-color mapping for the dot and left border accent. */
const STATUS_COLOR: Record<string, string> = {
  running: "var(--color-warning)",
  completed: "var(--color-success)",
  failed: "var(--color-error)",
  cancelled: "#888",
  unknown: "var(--color-text-dim)",
};

/** Status-to-label mapping for the parent indicator. */
const STATUS_LABEL: Record<string, string> = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  unknown: "Unknown",
};

/** Truncate a full run directory path to just the directory name. */
function runDirName(runDir: string): string {
  return runDir.split("/").pop() ?? runDir;
}

/** Format an ISO 8601 timestamp to a localized, human-readable string. */
function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Compute lineage depth for each run.
 * Runs without parent_run_id are roots (depth 0).
 * Runs with a parent inherit depth = parent.depth + 1.
 */
function computeDepths(runs: RunSummary[]): Map<string, number> {
  const byId = new Map<string, RunSummary>();
  // Build lookup by run_id (the directory name itself serves as the ID)
  for (const r of runs) {
    byId.set(runDirName(r.run_dir), r);
  }

  const depths = new Map<string, number>();
  const visited = new Set<string>();

  function resolveDepth(runId: string): number {
    if (depths.has(runId)) return depths.get(runId)!;
    // Guard against cycles (shouldn't happen, but be safe)
    if (visited.has(runId)) {
      depths.set(runId, 0);
      return 0;
    }
    visited.add(runId);

    const run = byId.get(runId);
    if (!run || !run.parent_run_id) {
      depths.set(runId, 0);
      return 0;
    }

    // resolveDepth takes a run_dir name, parent_run_id is a run_id string
    const parentDepth = resolveDepth(run.parent_run_id);
    const d = parentDepth + 1;
    depths.set(runId, d);
    return d;
  }

  for (const r of runs) {
    resolveDepth(runDirName(r.run_dir));
  }

  return depths;
}

export function RunHistoryPanel({ runs, onSelectRun }: RunHistoryPanelProps) {
  // Sort runs by started_at ascending (oldest first) so the timeline is
  // chronological top-to-bottom. Then compute depths.
  const lineageData = useMemo(() => {
    const sorted = [...runs].sort((a, b) => {
      // Handle missing timestamps
      if (!a.started_at && !b.started_at) return 0;
      if (!a.started_at) return 1;
      if (!b.started_at) return -1;
      return a.started_at.localeCompare(b.started_at);
    });
    const depths = computeDepths(sorted);
    return sorted.map((run) => ({
      ...run,
      depth: depths.get(runDirName(run.run_dir)) ?? 0,
    }));
  }, [runs]);

  const handleClick = useCallback(
    (runDir: string) => {
      onSelectRun(runDir);
    },
    [onSelectRun]
  );

  if (runs.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No runs yet.</p>
        <p className={styles.emptySub}>
          Run a workflow to see it appear here in the timeline.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Run History</h2>

      <div className={styles.timeline}>
        {lineageData.map((run, idx) => {
          const status = run.status ?? "unknown";
          const color = STATUS_COLOR[status] ?? STATUS_COLOR.unknown;
          const isLast = idx === lineageData.length - 1;

          return (
            <div
              key={run.run_dir}
              className={styles.timelineRow}
            >
              {/* Connector line from the previous node */}
              {idx > 0 && (
                <div
                  className={styles.connector}
                  style={{
                    borderColor: color,
                    marginLeft: `${(lineageData[idx - 1].depth ?? 0) * 16 + 8}px`,
                  }}
                />
              )}

              {/* Card wrapper with depth-based indentation */}
              <div
                className={styles.cardWrapper}
                style={{ marginLeft: `${run.depth * 16}px` }}
              >
                {/* Status dot on the left of the connector track */}
                <div className={styles.dotTrack}>
                  <span
                    className={styles.statusDot}
                    style={{ backgroundColor: color }}
                    title={STATUS_LABEL[status]}
                  />
                  {!isLast && (
                    <span
                      className={styles.dotTrackLine}
                      style={{ backgroundColor: color }}
                    />
                  )}
                </div>

                {/* Clickable card */}
                <button
                  className={styles.card}
                  onClick={() => handleClick(run.run_dir)}
                  style={{ "--card-accent": color } as React.CSSProperties}
                >
                  <div className={styles.cardBody}>
                    <div className={styles.cardHeader}>
                      <span className={styles.workflowName}>
                        {run.workflow_name}
                      </span>
                      <span
                        className={styles.statusBadge}
                        style={{
                          color,
                          backgroundColor: `${color}1a`,
                        }}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    </div>

                    <span className={styles.timestamp}>
                      {formatTimestamp(run.started_at)}
                    </span>

                    <div className={styles.cardMeta}>
                      <span className={styles.stepProgress}>
                        {run.completed_steps}/{run.total_steps} steps
                      </span>
                    </div>

                    {run.parent_run_id && (
                      <span className={styles.parentIndicator}>
                        Re-run of{" "}
                        {run.parent_run_id.split("-").slice(0, 3).join("-")}
                      </span>
                    )}
                  </div>

                  <span className={styles.chevron}>&#8250;</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
