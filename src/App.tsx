// Version: 1.1.0 | 2026-07-10
// Root application component — orchestrates views and manages app-level state.
// Three-panel layout: sidebar (workflows + runs), main content, footer status bar.

import { useState, useCallback } from "react";
import { useProjectRoot } from "./hooks/useProjectRoot";
import { useRunState } from "./hooks/useRunState";
import { WorkflowSelector } from "./components/WorkflowSelector";
import { RunMonitor } from "./components/RunMonitor";
import { OutputEditor } from "./components/OutputEditor";
import { SettingsModal } from "./components/SettingsModal";
import { ToastContainer, useToast } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";

type AppView =
  | { type: "selector" }
  | { type: "monitor"; runDir: string }
  | { type: "output"; runDir: string; stepIndex: number; stepName: string; outputPath: string };

function App() {
  const { projectRoot, refresh: refreshProjectRoot, isLoading: isProjectLoading } =
    useProjectRoot();
  const {
    isRunning,
    isComplete,
    hasError,
    runDir: activeRunDir,
    reset: resetRunState,
    markAsRerun,
  } = useRunState();
  const { showToast } = useToast();

  const [view, setView] = useState<AppView>({ type: "selector" });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showSettingsPrompt, setShowSettingsPrompt] = useState(false);

  // Refresh flag to trigger re-fetches
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Handler: Start a workflow run
  const handleStartRun = useCallback(
    (runDir: string) => {
      setView({ type: "monitor", runDir });
    },
    []
  );

  // Handler: View output of a completed step
  const handleViewOutput = useCallback(
    (stepIndex: number, stepName: string, outputPath: string) => {
      setView({
        type: "output",
        runDir: activeRunDir ?? "",
        stepIndex,
        stepName,
        outputPath,
      });
    },
    [activeRunDir]
  );

  // Handler: Re-run from a specific step
  const handleRerunFrom = useCallback(
    async (stepIndex: number) => {
      if (!activeRunDir) return;

      markAsRerun(stepIndex);

      // The backend will emit events; useRunState handles them.
      // We import dynamically to avoid circular deps
      const { rerunFromStep } = await import("./api/tauri");
      try {
        await rerunFromStep(activeRunDir, stepIndex);
      } catch (err) {
        showToast(String(err), "error");
      }
    },
    [activeRunDir, markAsRerun, showToast]
  );

  // Handler: Navigate to a past run
  const handleViewRun = useCallback((runDir: string) => {
    setView({ type: "monitor", runDir });
  }, []);

  // Handler: Navigate back to selector
  const handleBackToSelector = useCallback(() => {
    resetRunState();
    setView({ type: "selector" });
    triggerRefresh();
  }, [resetRunState, triggerRefresh]);

  // Handler: Close output editor
  const handleCloseOutput = useCallback(() => {
    if (activeRunDir) {
      setView({ type: "monitor", runDir: activeRunDir });
    } else {
      setView({ type: "selector" });
    }
  }, [activeRunDir]);

  // Handler: Settings button
  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false);
    setShowSettingsPrompt(false);
    // Re-read project root from store — the user may have changed it in settings,
    // and useProjectRoot only loads once on mount.
    refreshProjectRoot();
    triggerRefresh();
  }, [triggerRefresh, refreshProjectRoot]);

  // Handle missing project root
  if (isProjectLoading) {
    return (
      <div style={styles.loadingScreen}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary onReset={() => setView({ type: "selector" })}>
      <div style={styles.app}>
        {/* Header */}
        <header style={styles.header}>
          <h1 style={styles.logo} onClick={handleBackToSelector}>
            Plotline
          </h1>
          <div style={styles.headerRight}>
            {/* Show setting prompt if project root isn't set */}
            {!projectRoot && (
              <button
                style={styles.settingsPromptButton}
                onClick={handleOpenSettings}
              >
                Set Project Root
              </button>
            )}
            <button style={styles.settingsButton} onClick={handleOpenSettings}>
              &#9881; Settings
            </button>
          </div>
        </header>

        {/* Main content area */}
        <div style={styles.main}>
          {/* Sidebar */}
          <aside style={styles.sidebar}>
            {projectRoot ? (
              <>
                <WorkflowSelector
                  key={refreshKey}
                  projectRoot={projectRoot}
                  onStartRun={handleStartRun}
                  onViewRun={handleViewRun}
                  isRunning={isRunning}
                />
              </>
            ) : (
              <div style={styles.emptySidebar}>
                <p style={styles.emptySidebarText}>
                  Set a project root in Settings to get started.
                </p>
                <button
                  style={styles.sidebarSettingsButton}
                  onClick={handleOpenSettings}
                >
                  Open Settings
                </button>
              </div>
            )}
          </aside>

          {/* Main content panel */}
          <main style={styles.content}>
            {view.type === "selector" && (
              <div style={styles.placeholder}>
                <h2>Welcome to Plotline</h2>
                <p>
                  Select a project directory and workflow from the sidebar to
                  get started.
                </p>
              </div>
            )}

            {view.type === "monitor" && (
              <RunMonitor
                runDir={view.runDir}
                onViewOutput={handleViewOutput}
                onRerunFrom={handleRerunFrom}
                onClose={handleBackToSelector}
              />
            )}

            {view.type === "output" && (
              <OutputEditor
                runDir={view.runDir}
                stepIndex={view.stepIndex}
                stepName={view.stepName}
                outputPath={view.outputPath}
                onClose={handleCloseOutput}
                onSaved={() => showToast("Output saved successfully.", "success")}
              />
            )}
          </main>
        </div>

        {/* Footer status bar */}
        <footer style={styles.footer}>
          <div style={styles.footerLeft}>
            {projectRoot ? (
              <span style={styles.footerProjectRoot}>
                Project: {projectRoot}
              </span>
            ) : (
              <span style={styles.footerNoProject}>
                No project root set
              </span>
            )}
          </div>
          <div style={styles.footerRight}>
            {isRunning && (
              <span style={styles.runningIndicator}>Running...</span>
            )}
            {isComplete && (
              <span style={styles.completedIndicator}>Completed</span>
            )}
            {hasError && (
              <span style={styles.errorIndicator}>Failed</span>
            )}
          </div>
        </footer>

        {/* Settings modal */}
        <SettingsModal
          isOpen={isSettingsOpen || showSettingsPrompt}
          onClose={handleCloseSettings}
        />

        {/* Toast notifications */}
        <ToastContainer />
      </div>
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: "var(--color-bg)",
    color: "var(--color-text)",
    fontFamily: "var(--font-ui)",
  },
  loadingScreen: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    backgroundColor: "var(--color-bg)",
    color: "var(--color-text-dim)",
    fontSize: "1rem",
  },
  // ---------- Header ----------
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 16px",
    backgroundColor: "var(--color-panel)",
    borderBottom: "1px solid var(--color-accent)",
    flexShrink: 0,
  },
  logo: {
    fontSize: "1.2rem",
    fontWeight: 700,
    margin: 0,
    cursor: "pointer",
    color: "var(--color-primary)",
    userSelect: "none",
  },
  headerRight: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  settingsPromptButton: {
    padding: "6px 12px",
    backgroundColor: "var(--color-primary)",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  settingsButton: {
    padding: "6px 12px",
    backgroundColor: "var(--color-accent)",
    color: "var(--color-text)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  // ---------- Main layout ----------
  main: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
    minHeight: 0,
  },
  sidebar: {
    width: "260px",
    minWidth: "200px",
    backgroundColor: "var(--color-panel)",
    borderRight: "1px solid var(--color-accent)",
    overflow: "auto",
    flexShrink: 0,
  },
  content: {
    flex: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  placeholder: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    color: "var(--color-text-dim)",
    textAlign: "center",
    gap: "8px",
  },
  // ---------- Empty sidebar ----------
  emptySidebar: {
    padding: "24px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    alignItems: "center",
    textAlign: "center",
  },
  emptySidebarText: {
    color: "var(--color-text-dim)",
    fontSize: "0.85rem",
    margin: 0,
  },
  sidebarSettingsButton: {
    padding: "6px 14px",
    backgroundColor: "var(--color-primary)",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  // ---------- Footer ----------
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "4px 16px",
    backgroundColor: "var(--color-panel)",
    borderTop: "1px solid var(--color-accent)",
    fontSize: "0.72rem",
    color: "var(--color-text-dim)",
    flexShrink: 0,
  },
  footerLeft: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "60%",
  },
  footerProjectRoot: {
    color: "var(--color-text-dim)",
  },
  footerNoProject: {
    color: "var(--color-warning)",
  },
  footerRight: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
  },
  runningIndicator: {
    color: "var(--color-primary)",
    fontWeight: 500,
  },
  completedIndicator: {
    color: "var(--color-success)",
    fontWeight: 500,
  },
  errorIndicator: {
    color: "var(--color-error)",
    fontWeight: 500,
  },
};

export default App;
