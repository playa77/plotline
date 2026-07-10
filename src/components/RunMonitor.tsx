// Run monitor component: displays real-time execution progress.
// Subscribes to Tauri events and renders StepCard components.

import { useState, useEffect, useCallback } from "react";
import { useRunState } from "../hooks/useRunState";
import { StepCard } from "./StepCard";
import * as api from "../api/tauri";
import { extractStepsFromYaml } from "../utils/variables";
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
  const [stepModels, setStepModels] = useState<Map<number, string>>(new Map());
  const [elapsed, setElapsed] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [rerunConfirmIndex, setRerunConfirmIndex] = useState<number | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Load initial state from filesystem
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [info, workflowYaml] = await Promise.all([
          api.getRunStatus(runDir),
          api.readFileContent(`${runDir}/_workflow.yaml`).catch(() => ""),
        ]);
        if (!cancelled) {
          setWorkflowName(info.workflow_name);
          setInitialSteps(info.steps);

          // Parse models from workflow YAML snapshot
          const models = new Map<number, string>();
          if (workflowYaml) {
            const steps = extractStepsFromYaml(workflowYaml);
            for (let i = 0; i < steps.length; i++) {
              if (steps[i].model) {
                models.set(i, steps[i].model);
              }
            }
          }
          setStepModels(models);

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

  const handleRerunClick = useCallback(
    (stepIndex: number) => {
      setRerunConfirmIndex(stepIndex);
    },
    []
  );

  const handleRerunConfirm = useCallback(() => {
    if (rerunConfirmIndex !== null) {
      onRerunFrom(rerunConfirmIndex);
      setRerunConfirmIndex(null);
    }
  }, [rerunConfirmIndex, onRerunFrom]);

  const handleRerunCancel = useCallback(() => {
    setRerunConfirmIndex(null);
  }, []);

  const handleCancel = useCallback(async () => {
    setIsCancelling(true);
    try {
      await api.cancelWorkflow();
    } catch (err) {
      // The run_error event will handle the UI — just catch errors
    }
    // Don't reset isCancelling — the run_error event will set isRunning=false
    // which hides the button
  }, []);

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
          {isRunning && (
            <button
              style={styles.stopButton}
              onClick={handleCancel}
              disabled={isCancelling}
            >
              {isCancelling ? "Stopping…" : "Stop"}
            </button>
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
        {mergedSteps().map((step, index) => (
          <StepCard
            key={step.index}
            stepIndex={step.index}
            stepName={step.name}
            status={step.status}
            outputPath={step.outputPath}
            onViewOutput={step.status === "completed" ? handleViewOutput : undefined}
            onRerunFrom={
              step.status === "completed" || step.status === "error"
                ? handleRerunClick
                : undefined
            }
            model={stepModels.get(step.index)}
            showConnector={index < mergedSteps().length - 1}
          />
        ))}
        {mergedSteps().length === 0 && (
          <div style={styles.empty}>No steps found for this run.</div>
        )}
      </div>

      {/* Re-run confirmation overlay */}
      {rerunConfirmIndex !== null && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <p style={styles.dialogText}>
              This will overwrite step outputs from Step{" "}
              {(rerunConfirmIndex as number) + 1} onward. Previous step outputs
              will be preserved. Continue?
            </p>
            <div style={styles.dialogButtons}>
              <button
                style={styles.cancelButton}
                onClick={handleRerunCancel}
              >
                Cancel
              </button>
              <button
                style={styles.rerunButton}
                onClick={handleRerunConfirm}
              >
                Re-run from Step {(rerunConfirmIndex as number) + 1}
              </button>
            </div>
          </div>
        </div>
      )}
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
  stopButton: {
    padding: "4px 12px",
    backgroundColor: "var(--color-error)",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 500,
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
  // Confirmation overlay styles
  overlay: {
    position: "fixed" as const,
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: "var(--color-panel)",
    padding: "24px",
    borderRadius: "8px",
    maxWidth: "400px",
    width: "90%",
  },
  dialogText: {
    margin: "0 0 16px 0",
    color: "var(--color-text)",
    fontSize: "0.95rem",
    lineHeight: 1.5,
  },
  dialogButtons: {
    display: "flex",
    gap: "8px",
    justifyContent: "flex-end",
  },
  cancelButton: {
    padding: "6px 14px",
    backgroundColor: "transparent",
    color: "var(--color-text-dim)",
    border: "1px solid var(--color-accent)",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  rerunButton: {
    padding: "6px 14px",
    backgroundColor: "var(--color-error)",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 500,
  },
};
