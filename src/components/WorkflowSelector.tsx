// Version: 1.1.0 | 2026-07-10
// Workflow selector component: lists available workflows and past runs.
// Provides "Run" buttons for workflows and displays run history.
//
// When a workflow with {{variables.<name>}} placeholders is run, a
// WorkflowRunDialog appears so the user can provide values before execution.
// Workflows with zero variables run immediately, skipping the dialog.

import { useState, useEffect, useCallback } from "react";
import * as api from "../api/tauri";
import type { WorkflowSummary, RunSummary } from "../types";
import { scanWorkflowVariables, extractStepsFromYaml, type VariableInfo } from "../utils/variables";
import { WorkflowRunDialog } from "./WorkflowRunDialog";

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
  // Set of workflow file paths that have validation issues (e.g. missing prompt files).
  const [workflowIssues, setWorkflowIssues] = useState<Set<string>>(new Set());

  // --- WorkflowRunDialog state ---
  // When non-null, the dialog is open. Holds the workflow being configured
  // and the variables detected in its prompt files.
  const [runDialogWorkflow, setRunDialogWorkflow] = useState<WorkflowSummary | null>(null);
  const [runDialogVariables, setRunDialogVariables] = useState<VariableInfo[]>([]);
  // Step names, models and prompt files extracted from the workflow YAML
  // for the dialog preview and prompt editing.
  const [runDialogSteps, setRunDialogSteps] = useState<
    { name: string; model: string; promptFile: string }[]
  >([]);
  // True while variable files are being written and the run is starting.
  // Disables dialog inputs and shows "Starting…" on the Run button.
  const [isStartingRun, setIsStartingRun] = useState(false);
  // Error message shown in the dialog footer (write/run failure). Null = clean.
  const [runDialogError, setRunDialogError] = useState<string | null>(null);

  const loadWorkflows = useCallback(async () => {
    setIsLoadingWorkflows(true);
    setErrorWorkflows(null);
    try {
      const wfs = await api.listWorkflows(projectRoot);
      setWorkflows(wfs);

      // Validate each workflow — check that referenced prompt files exist.
      const issues = new Set<string>();
      await Promise.allSettled(
        wfs.map(async (wf) => {
          try {
            const yaml = await api.readFileContent(wf.file_path);
            const steps = extractStepsFromYaml(yaml);
            const results = await Promise.allSettled(
              steps.map((step) => api.readFileContent(`${projectRoot}/${step.prompt_file}`))
            );
            const anyMissing = results.some((r) => r.status === "rejected");
            if (anyMissing) {
              issues.add(wf.file_path);
            }
          } catch {
            // Can't even read the YAML — mark as having issues.
            issues.add(wf.file_path);
          }
        })
      );
      setWorkflowIssues(issues);
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

  // handleRun — called when the user clicks "Run" on a workflow card.
  // Scans the workflow's prompt files for {{variables.<name>}} placeholders.
  // If none are found, starts the run immediately (no dialog). If variables
  // are found, opens the WorkflowRunDialog so the user can provide values.
  const handleRun = useCallback(
    async (wf: WorkflowSummary) => {
      setRunningPath(wf.file_path);
      try {
        const variables = await scanWorkflowVariables(wf.file_path, projectRoot);

        // Extract step names, models and prompt_files from the workflow YAML
        // for the dialog preview and prompt editing.
        let steps: { name: string; model: string; promptFile: string }[] = [];
        try {
          const yaml = await api.readFileContent(wf.file_path);
          const parsed = extractStepsFromYaml(yaml);
          steps = parsed.map((s) => ({
            name: s.name,
            model: s.model ?? "",
            promptFile: s.prompt_file,
          }));
        } catch {
          // Non-critical — preview will just be empty.
        }

        if (variables.length === 0) {
          // No variables — skip the dialog and run immediately.
          const runDir = await api.runWorkflow(wf.file_path, projectRoot);
          onStartRun(runDir);
        } else {
          // Variables detected — open the dialog for the user to fill in.
          setRunDialogWorkflow(wf);
          setRunDialogVariables(variables);
          setRunDialogSteps(steps);
          setRunDialogError(null);
        }
      } catch (err) {
        setErrorWorkflows(String(err));
      } finally {
        setRunningPath(null);
      }
    },
    [projectRoot, onStartRun]
  );

  // handleDialogRun — called when the user clicks "Run" in the dialog.
  // Passes the edited variable values as overrides to the backend.
  // The backend uses them in preference to file-based variables, without
  // mutating any project files on disk.
  const handleDialogRun = useCallback(
    async (values: Record<string, string>) => {
      if (!runDialogWorkflow) return;

      setIsStartingRun(true);
      setRunDialogError(null);

      try {
        // Pass variable values as overrides — the backend substitution
        // engine checks overrides first, then falls back to file-based
        // variables. No project files are written.
        const runDir = await api.runWorkflow(
          runDialogWorkflow.file_path,
          projectRoot,
          values
        );

        // Close the dialog and switch to the run monitor.
        setRunDialogWorkflow(null);
        setRunDialogVariables([]);
        setRunDialogSteps([]);
        onStartRun(runDir);
      } catch (err) {
        // Keep the dialog open so the user can see the error and retry.
        setRunDialogError(String(err));
      } finally {
        setIsStartingRun(false);
      }
    },
    [projectRoot, runDialogWorkflow, onStartRun]
  );

  // handleDialogCancel — closes the dialog without running.
  const handleDialogCancel = useCallback(() => {
    if (isStartingRun) return; // Don't allow canceling mid-write.
    setRunDialogWorkflow(null);
    setRunDialogVariables([]);
    setRunDialogSteps([]);
    setRunDialogError(null);
  }, [isStartingRun]);

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
              <div style={styles.cardNameRow}>
                <span style={styles.cardName}>{wf.name}</span>
                {workflowIssues.has(wf.file_path) && (
                  <span
                    style={styles.warningIcon}
                    title="Some prompt files are missing"
                  >
                    ⚠
                  </span>
                )}
              </div>
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

      {/* Pre-flight variable dialog — only rendered when a workflow with
          variables is being run. */}
      <WorkflowRunDialog
        workflowName={runDialogWorkflow?.name ?? ""}
        variables={runDialogVariables}
        steps={runDialogSteps}
        isOpen={runDialogWorkflow !== null}
        projectRoot={projectRoot}
        isStarting={isStartingRun}
        error={runDialogError}
        onRun={handleDialogRun}
        onCancel={handleDialogCancel}
      />
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
  cardNameRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  warningIcon: {
    fontSize: "0.85rem",
    cursor: "help",
    flexShrink: 0,
    lineHeight: 1,
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
