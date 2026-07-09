// Version: 1.0.0 | 2026-07-09
// Hook for managing the current workflow run's state via Tauri events.
// Listens to run_started, step_started, step_completed, run_completed,
// and run_error events, exposing the current state to components.

import { useState, useCallback, useRef } from "react";
import { useTauriEvent } from "./useTauriEvent";
import type { RunEventPayload, RunStepStatus } from "../types";

export interface RunState {
  /** The run directory path. */
  runDir: string | null;
  /** Whether a run is currently in progress. */
  isRunning: boolean;
  /** Whether the run has completed (all steps done). */
  isComplete: boolean;
  /** Whether the run encountered an error. */
  hasError: boolean;
  /** The error message, if any. */
  error: string | null;
  /** The step index where the error occurred, if any. */
  errorStepIndex: number | null;
  /** Per-step status objects, indexed by step index. */
  stepStatuses: Map<number, RunStepStatus>;
  /** Whether this is a re-run (started from a specific step). */
  isRerun: boolean;
  /** The step index from which a re-run was started, if applicable. */
  rerunFromIndex: number | null;
}

const initialRunState: RunState = {
  runDir: null,
  isRunning: false,
  isComplete: false,
  hasError: false,
  error: null,
  errorStepIndex: null,
  stepStatuses: new Map(),
  isRerun: false,
  rerunFromIndex: null,
};

export function useRunState() {
  const [state, setState] = useState<RunState>(initialRunState);
  // Track whether we've seen a run_started event to distinguish re-runs
  const hasStartedRef = useRef(false);

  // Helper to update state immutably
  const updateState = useCallback((updates: Partial<RunState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Helper to update a specific step
  const updateStep = useCallback(
    (stepIndex: number, stepUpdates: Partial<RunStepStatus>) => {
      setState((prev) => {
        const newSteps = new Map(prev.stepStatuses);
        const existing = newSteps.get(stepIndex) ?? {
          index: stepIndex,
          name: "",
          status: "pending" as const,
          output_path: null,
        };
        newSteps.set(stepIndex, { ...existing, ...stepUpdates });
        return { ...prev, stepStatuses: newSteps };
      });
    },
    []
  );

  // run_started: reset state and initialize
  useTauriEvent<RunEventPayload>("run_started", (payload) => {
    hasStartedRef.current = true;

    setState({
      runDir: payload.runDir,
      isRunning: true,
      isComplete: false,
      hasError: false,
      error: null,
      errorStepIndex: null,
      stepStatuses: new Map(),
      isRerun: false, // Will be set to true if we detect a re-run later
      rerunFromIndex: null,
    });
  });

  // step_started: mark step as running
  useTauriEvent<RunEventPayload>("step_started", (payload) => {
    if (payload.stepIndex === undefined || !payload.stepName) return;
    updateStep(payload.stepIndex, {
      name: payload.stepName,
      status: "running",
      output_path: null,
    });
  });

  // step_completed: mark step as completed
  useTauriEvent<RunEventPayload>("step_completed", (payload) => {
    if (payload.stepIndex === undefined) return;
    updateStep(payload.stepIndex, {
      status: "completed",
      output_path: payload.outputPath ?? null,
    });
  });

  // run_completed: mark run as done
  useTauriEvent<RunEventPayload>("run_completed", () => {
    updateState({
      isRunning: false,
      isComplete: true,
    });
  });

  // run_error: mark run as errored, set error on the specific step
  useTauriEvent<RunEventPayload>("run_error", (payload) => {
    const stepIdx = payload.stepIndex ?? 0;
    updateStep(stepIdx, { status: "error" });
    updateState({
      isRunning: false,
      hasError: true,
      error: payload.error ?? "Unknown error",
      errorStepIndex: stepIdx,
    });
  });

  /** Reset to initial state (e.g., when user navigates away). */
  const reset = useCallback(() => {
    hasStartedRef.current = false;
    setState(initialRunState);
  }, []);

  /** Mark this run as a re-run from a specific step index. */
  const markAsRerun = useCallback((fromIndex: number) => {
    updateState({
      isRerun: true,
      rerunFromIndex: fromIndex,
      isRunning: true,
      isComplete: false,
      hasError: false,
      error: null,
      errorStepIndex: null,
    });
  }, [updateState]);

  return {
    ...state,
    reset,
    markAsRerun,
  };
}
