// Workflow selector component: lists available workflows and past runs.
// Provides "Run" buttons for workflows and displays run history.

import { useState, useEffect, useCallback } from "react";
import * as api from "../api/tauri";
import type { WorkflowSummary, RunSummary } from "../types";

interface WorkflowSelectorProps {
  projectRoot: string;
  onStartRun: (runDir: string) => void;
  onViewRun: (runDir: string) => void;
  isRunning: boolean;
}

export function WorkflowSelector({
  projectRoot,
  onStartRun,
  onViewRun,
  isRunning,
}: WorkflowSelectorProps) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(true);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [errorWorkflows, setErrorWorkflows] = useState<string | null>(null);
  const [errorRuns, setErrorRuns] = useState<string | null>(null);
  const [runningPath, setRunningPath] = useState<string | null>(null);

  const loadWorkflows = useCallback(async () => {
    setIsLoadingWorkflows(true);
    setErrorWorkflows(null);
    try {
      const wfs = await api.listWorkflows(projectRoot);
      setWorkflows(wfs);
    } catch (err) {
      setErrorWorkflows(String(err));
    } finally {
      setIsLoadingWorkflows(false);
    }
  }, [projectRoot]);

  const loadRuns = useCallback(async () => {
    setIsLoadingRuns(true);
    setErrorRuns(null);
    try {
      const r = await api.listRuns(projectRoot);
      setRuns(r);
    } catch (err) {
      setErrorRuns(String(err));
    } finally {
      setIsLoadingRuns(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    loadWorkflows();
    loadRuns();
  }, [loadWorkflows, loadRuns]);

  const handleRun = useCallback(
    async (wf: WorkflowSummary) => {
      setRunningPath(wf.file_path);
      try {
        const runDir = await api.runWorkflow(wf.file_path, projectRoot);
        onStartRun(runDir);
      } catch (err) {
        setErrorWorkflows(String(err));
      } finally {
        setRunningPath(null);
      }
    },
    [projectRoot, onStartRun]
  );

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div style={styles.container}>
      {/* Workflows section */}
      <div style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Workflows</h3>
        <button
          style={styles.refreshButton}
          onClick={() => {
            loadWorkflows();
            loadRuns();
          }}
        >
          ↻
        </button>
      </div>

      {isLoadingWorkflows && (
        <div style={styles.loading}>Loading workflows...</div>
      )}

      {errorWorkflows && (
        <div style={styles.error}>{errorWorkflows}</div>
      )}

      {!isLoadingWorkflows && !errorWorkflows && workflows.length === 0 && (
        <div style={styles.empty}>
          Create a workflow YAML file in your project's workflows/ directory.
        </div>
      )}

      {!isLoadingWorkflows &&
        workflows.map((wf) => (
          <div key={wf.file_path} style={styles.card}>
            <div style={styles.cardContent}>
              <div style={styles.cardName}>{wf.name}</div>
              <div style={styles.cardMeta}>
                {wf.step_count} step{wf.step_count !== 1 ? "s" : ""}
              </div>
            </div>
            <button
              style={{
                ...styles.runButton,
                opacity: isRunning || runningPath === wf.file_path ? 0.5 : 1,
              }}
              onClick={() => handleRun(wf)}
              disabled={isRunning || runningPath === wf.file_path}
            >
              {runningPath === wf.file_path ? "..." : "Run"}
            </button>
          </div>
        ))}

      {/* Runs section */}
      <div style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Runs</h3>
      </div>

      {isLoadingRuns && (
        <div style={styles.loading}>Loading runs...</div>
      )}

      {errorRuns && <div style={styles.error}>{errorRuns}</div>}

      {!isLoadingRuns && !errorRuns && runs.length === 0 && (
        <div style={styles.empty}>No runs yet.</div>
      )}

      {!isLoadingRuns &&
        runs.map((run) => (
          <div
            key={run.run_dir}
            style={styles.runCard}
            onClick={() => onViewRun(run.run_dir)}
          >
            <div style={styles.cardContent}>
              <div style={styles.cardName}>{run.workflow_name}</div>
              <div style={styles.cardMeta}>
                {formatDate(run.started_at)}
              </div>
              <div style={styles.runProgress}>
                {run.completed_steps}/{run.total_steps} steps
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "8px",
    height: "100%",
    overflow: "auto",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 4px 4px",
  },
  sectionTitle: {
    fontSize: "0.8rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "var(--color-text-dim)",
    margin: 0,
  },
  refreshButton: {
    background: "none",
    border: "none",
    color: "var(--color-text-dim)",
    cursor: "pointer",
    fontSize: "1rem",
    padding: "2px",
  },
  loading: {
    padding: "12px 8px",
    color: "var(--color-text-dim)",
    fontSize: "0.8rem",
  },
  error: {
    padding: "8px",
    color: "var(--color-error)",
    fontSize: "0.75rem",
  },
  empty: {
    padding: "12px 8px",
    color: "var(--color-text-dim)",
    fontSize: "0.75rem",
    lineHeight: 1.4,
  },
  card: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 8px",
    margin: "1px 0",
    borderRadius: "4px",
    backgroundColor: "var(--color-panel)",
  },
  cardContent: {
    minWidth: 0,
    flex: 1,
  },
  cardName: {
    fontSize: "0.82rem",
    fontWeight: 500,
    color: "var(--color-text)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardMeta: {
    fontSize: "0.68rem",
    color: "var(--color-text-dim)",
    marginTop: "2px",
  },
  runButton: {
    padding: "4px 12px",
    backgroundColor: "var(--color-primary)",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.75rem",
    marginLeft: "8px",
    flexShrink: 0,
  },
  runCard: {
    padding: "8px 8px",
    margin: "1px 0",
    borderRadius: "4px",
    backgroundColor: "var(--color-panel)",
    cursor: "pointer",
  },
  runProgress: {
    fontSize: "0.68rem",
    color: "var(--color-success)",
    marginTop: "2px",
  },
};
