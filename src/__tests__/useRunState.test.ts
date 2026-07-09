// Version: 1.0.0 | 2026-07-09
// Tests for useRunState hook.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { mockUnlisten, mockListen } = vi.hoisted(() => ({
  mockUnlisten: vi.fn(),
  mockListen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
}));

import { useRunState } from "../hooks/useRunState";

// Store event callbacks so tests can fire events
const eventCallbacks = new Map<string, (event: { payload: unknown }) => void>();

beforeEach(() => {
  vi.clearAllMocks();
  eventCallbacks.clear();

  mockListen.mockImplementation(
    (eventName: string, cb: (event: unknown) => void) => {
      eventCallbacks.set(eventName, cb);
      return Promise.resolve(mockUnlisten);
    }
  );
});

/**
 * Helper to fire a Tauri event by name.
 */
function fireEvent(eventName: string, payload: unknown) {
  const cb = eventCallbacks.get(eventName);
  if (cb) {
    act(() => {
      cb({ payload });
    });
  }
}

describe("useRunState", () => {
  it("starts with default state", () => {
    const { result } = renderHook(() => useRunState());

    expect(result.current.runDir).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.stepStatuses.size).toBe(0);
  });

  it("handles run_started event", () => {
    const { result } = renderHook(() => useRunState());

    fireEvent("run_started", { runDir: "/tmp/test-run" });

    expect(result.current.runDir).toBe("/tmp/test-run");
    expect(result.current.isRunning).toBe(true);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.hasError).toBe(false);
  });

  it("handles step_started event", () => {
    const { result } = renderHook(() => useRunState());

    fireEvent("run_started", { runDir: "/tmp/test" });
    fireEvent("step_started", { stepIndex: 0, stepName: "outline" });

    const stepStatus = result.current.stepStatuses.get(0);
    expect(stepStatus).toBeDefined();
    expect(stepStatus?.name).toBe("outline");
    expect(stepStatus?.status).toBe("running");
  });

  it("handles step_completed event", () => {
    const { result } = renderHook(() => useRunState());

    fireEvent("run_started", { runDir: "/tmp/test" });
    fireEvent("step_completed", {
      stepIndex: 1,
      outputPath: "/tmp/step_02_draft.md",
    });

    const stepStatus = result.current.stepStatuses.get(1);
    expect(stepStatus?.status).toBe("completed");
    expect(stepStatus?.output_path).toBe("/tmp/step_02_draft.md");
  });

  it("handles run_completed event", () => {
    const { result } = renderHook(() => useRunState());

    fireEvent("run_started", { runDir: "/tmp/test" });
    fireEvent("run_completed", { runDir: "/tmp/test" });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.isComplete).toBe(true);
    expect(result.current.hasError).toBe(false);
  });

  it("handles run_error event", () => {
    const { result } = renderHook(() => useRunState());

    fireEvent("run_started", { runDir: "/tmp/test" });
    fireEvent("run_error", {
      stepIndex: 2,
      error: "OpenRouter rate limit exceeded.",
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.hasError).toBe(true);
    expect(result.current.error).toContain("rate limit");
    expect(result.current.errorStepIndex).toBe(2);

    const stepStatus = result.current.stepStatuses.get(2);
    expect(stepStatus?.status).toBe("error");
  });

  it("resets state on reset()", () => {
    const { result } = renderHook(() => useRunState());

    fireEvent("run_started", { runDir: "/tmp/test" });
    expect(result.current.isRunning).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.runDir).toBeNull();
    expect(result.current.stepStatuses.size).toBe(0);
  });

  it("markAsRerun updates state", () => {
    const { result } = renderHook(() => useRunState());

    act(() => {
      result.current.markAsRerun(2);
    });

    expect(result.current.isRerun).toBe(true);
    expect(result.current.rerunFromIndex).toBe(2);
    expect(result.current.isRunning).toBe(true);
  });

  it("resets step statuses on new run_started", () => {
    const { result } = renderHook(() => useRunState());

    // First run
    fireEvent("run_started", { runDir: "/tmp/run1" });
    fireEvent("step_started", { stepIndex: 0, stepName: "step1" });
    fireEvent("step_completed", {
      stepIndex: 0,
      outputPath: "/tmp/output1",
    });

    expect(result.current.stepStatuses.size).toBe(1);

    // Second run should reset state
    fireEvent("run_started", { runDir: "/tmp/run2" });

    expect(result.current.runDir).toBe("/tmp/run2");
    expect(result.current.stepStatuses.size).toBe(0);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.hasError).toBe(false);
  });
});
