// Run monitor component: displays real-time execution progress.
// Subscribes to Tauri events and renders StepCard components.

import { useState, useEffect, useCallback } from "react";
import { useRunState } from "../hooks/useRunState";
import { StepCard } from "./StepCard";
import * as api from "../api/tauri";
import type { RunStepStatus } from "../types";

interface RunMonitorProps {
  runDir: string;
  onViewOutput: (
    stepIndex: number,
    stepName: string,
    outputPath: string
  ) => void;
  onRerunFrom: (stepIndex: number) => void;
  onClose: () => void;
}

export function RunMonitor({
  runDir,
  onViewOutput,
  onRerunFrom,
  onClose,
}: RunMonitorProps) {
  const {
    isRunning,
    isComplete,
    hasError,
    error,
    stepStatuses,
    isRerun,
    rerunFromIndex,
  } = useRunState();

  const [workflowName, setWorkflowName] = useState<string>("");
  const [initialSteps, setInitialSteps] = useState<RunStepStatus[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial state from filesystem
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const info = await api.getRunStatus(runDir);
        if (!cancelled) {
          setWorkflowName(info.workflow_name);
          setInitialSteps(info.steps);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setWorkflowName(runDir.split("/").pop() ?? "Unknown");
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [runDir]);

  // Elapsed time timer (only while running)
  useEffect(() => {
    if (!isRunning) return;

    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  const formatElapsed = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, []);

  // Merge stepStatuses (from events) with initialSteps (from filesystem)
  const mergedSteps = useCallback(() => {
    const stepList: {
      index: number;
      name: string;
      status: RunStepStatus["status"];
      outputPath: string | null;
    }[] = [];

    for (const initial of initialSteps) {
      const live = stepStatuses.get(initial.index);
      stepList.push({
        index: initial.index,
        name: live?.name ?? initial.name,
        status: live?.status ?? initial.status,
        outputPath: live?.output_path ?? initial.output_path,
      });
    }

    return stepList;
  }, [initialSteps, stepStatuses]);

  const handleViewOutput = useCallback(
    (stepIndex: number) => {
      const step = mergedSteps().find((s) => s.index === stepIndex);
      if (step?.outputPath) {
        onViewOutput(stepIndex, step.name, step.outputPath);
      }
    },
    [mergedSteps, onViewOutput]
  );

  const completedCount = mergedSteps().filter(
    (s) => s.status === "completed"
  ).length;
  const totalCount = mergedSteps().length;

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading run status...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Run header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h2 style={styles.workflowName}>{workflowName}</h2>
          <div style={styles.runDir} title={runDir}>
            {runDir}
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.progress}>
            {completedCount}/{totalCount} steps completed
          </div>
          {isRunning && (
            <div style={styles.elapsed}>
              {formatElapsed(elapsed)}
            </div>
          )}
          {isComplete && (
            <span style={styles.badgeComplete}>Completed</span>
          )}
          {hasError && (
            <span style={styles.badgeError}>Failed</span>
          )}
          {isRerun && rerunFromIndex !== null && (
            <span style={styles.badgeRerun}>
              Re-running from Step {rerunFromIndex + 1}
            </span>
          )}
          <button style={styles.closeButton} onClick={onClose}>
            Back
          </button>
        </div>
      </div>

      {/* Error summary */}
      {hasError && error && (
        <div style={styles.errorSummary}>{error}</div>
      )}

      {/* Step list */}
      <div style={styles.stepList}>
        {mergedSteps().map((step) => (
          <StepCard
            key={step.index}
            stepIndex={step.index}
            stepName={step.name}
            status={step.status}
            outputPath={step.outputPath}
            onViewOutput={step.status === "completed" ? handleViewOutput : undefined}
            onRerunFrom={
              step.status === "completed" || step.status === "error"
                ? onRerunFrom
                : undefined
            }
          />
        ))}
        {mergedSteps().length === 0 && (
          <div style={styles.empty}>No steps found for this run.</div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: "var(--color-bg)",
  },
  loading: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    color: "var(--color-text-dim)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "14px 16px",
    borderBottom: "1px solid var(--color-accent)",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexShrink: 0,
  },
  workflowName: {
    fontSize: "1.1rem",
    fontWeight: 600,
    margin: 0,
    color: "var(--color-text)",
  },
  runDir: {
    fontSize: "0.7rem",
    fontFamily: "var(--font-mono)",
    color: "var(--color-text-dim)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "300px",
  },
  progress: {
    fontSize: "0.85rem",
    color: "var(--color-text)",
  },
  elapsed: {
    fontSize: "0.85rem",
    fontFamily: "var(--font-mono)",
    color: "var(--color-text-dim)",
  },
  badgeComplete: {
    padding: "2px 8px",
    backgroundColor: "rgba(76, 175, 80, 0.15)",
    color: "var(--color-success)",
    borderRadius: "4px",
    fontSize: "0.75rem",
    fontWeight: 500,
  },
  badgeError: {
    padding: "2px 8px",
    backgroundColor: "rgba(244, 67, 54, 0.15)",
    color: "var(--color-error)",
    borderRadius: "4px",
    fontSize: "0.75rem",
    fontWeight: 500,
  },
  badgeRerun: {
    padding: "2px 8px",
    backgroundColor: "rgba(255, 152, 0, 0.15)",
    color: "var(--color-warning)",
    borderRadius: "4px",
    fontSize: "0.75rem",
    fontWeight: 500,
  },
  closeButton: {
    padding: "4px 12px",
    backgroundColor: "var(--color-primary)",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  errorSummary: {
    padding: "10px 16px",
    backgroundColor: "rgba(244, 67, 54, 0.1)",
    color: "var(--color-error)",
    fontSize: "0.85rem",
    flexShrink: 0,
  },
  stepList: {
    flex: 1,
    overflow: "auto",
    padding: "8px",
  },
  empty: {
    textAlign: "center",
    color: "var(--color-text-dim)",
    padding: "32px",
  },
};
