// Step card component showing a single step's execution status.
// Visual states: pending (gray), running (pulsing blue), completed (green), error (red).

import type { RunStepStatus } from "../types";

interface StepCardProps {
  stepIndex: number;
  stepName: string;
  status: RunStepStatus["status"];
  error?: string;
  outputPath: string | null;
  onViewOutput?: (index: number) => void;
  onRerunFrom?: (index: number) => void;
}

export function StepCard({
  stepIndex,
  stepName,
  status,
  error,
  outputPath,
  onViewOutput,
  onRerunFrom,
}: StepCardProps) {
  const statusConfig = STATUS_CONFIG[status];

  return (
    <div style={styles.card}>
      <div style={styles.main}>
        <span style={{ ...styles.indicator, color: statusConfig.color }}>
          {statusConfig.icon}
        </span>
        <div style={styles.info}>
          <div style={styles.stepName}>
            Step {stepIndex + 1}: {stepName}
          </div>
          <div style={{ ...styles.statusText, color: statusConfig.color }}>
            {statusConfig.label}
            {status === "running" && (
              <span style={styles.pulse}> </span>
            )}
          </div>
        </div>
        <div style={styles.actions}>
          {status === "completed" && onViewOutput && outputPath && (
            <button
              style={styles.viewButton}
              onClick={() => onViewOutput(stepIndex)}
            >
              View Output
            </button>
          )}
          {(status === "completed" || status === "error") && onRerunFrom && (
            <button
              style={styles.rerunButton}
              onClick={() => onRerunFrom(stepIndex)}
              title="Uses the original workflow snapshot."
            >
              Re-run from here
            </button>
          )}
        </div>
      </div>
      {status === "error" && error && (
        <div style={styles.errorBox}>{error}</div>
      )}
    </div>
  );
}

const STATUS_CONFIG = {
  pending: { icon: "○", color: "var(--color-text-dim)", label: "Pending" },
  running: {
    icon: "▶",
    color: "#64b5f6",
    label: "Running",
  },
  completed: { icon: "✓", color: "var(--color-success)", label: "Completed" },
  error: { icon: "✗", color: "var(--color-error)", label: "Error" },
} as const;

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: "var(--color-panel)",
    borderRadius: "6px",
    padding: "12px 16px",
    marginBottom: "2px",
  },
  main: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  indicator: {
    fontSize: "1.2rem",
    flexShrink: 0,
    width: "20px",
    textAlign: "center",
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  stepName: {
    fontSize: "0.9rem",
    fontWeight: 500,
    color: "var(--color-text)",
  },
  statusText: {
    fontSize: "0.75rem",
    marginTop: "2px",
  },
  pulse: {
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#64b5f6",
    marginLeft: "4px",
  },
  actions: {
    display: "flex",
    gap: "6px",
    flexShrink: 0,
  },
  viewButton: {
    padding: "4px 10px",
    backgroundColor: "var(--color-accent)",
    color: "var(--color-text)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
  rerunButton: {
    padding: "4px 10px",
    backgroundColor: "transparent",
    color: "var(--color-text-dim)",
    border: "1px solid var(--color-accent)",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
  errorBox: {
    marginTop: "10px",
    padding: "8px 12px",
    backgroundColor: "rgba(244, 67, 54, 0.1)",
    borderLeft: "3px solid var(--color-error)",
    borderRadius: "4px",
    color: "var(--color-error)",
    fontSize: "0.8rem",
    lineHeight: 1.4,
  },
};
