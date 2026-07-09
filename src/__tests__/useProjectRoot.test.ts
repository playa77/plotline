// Version: 1.0.0 | 2026-07-09
// Tests for useProjectRoot hook.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const mockGetProjectRoot = vi.fn();
const mockSetProjectRoot = vi.fn();

vi.mock("../api/tauri", () => ({
  getProjectRoot: () => mockGetProjectRoot(),
  setProjectRoot: (path: string) => mockSetProjectRoot(path),
  // Stub other exports needed by the module
  runWorkflow: vi.fn(),
  rerunFromStep: vi.fn(),
  saveOutput: vi.fn(),
  getRunStatus: vi.fn(),
  listWorkflows: vi.fn(),
  listRuns: vi.fn(),
  readFileContent: vi.fn(),
  setApiKey: vi.fn(),
  getApiKey: vi.fn(),
  hasApiKey: vi.fn(),
}));

import { useProjectRoot } from "../hooks/useProjectRoot";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useProjectRoot", () => {
  it("loads project root on mount", async () => {
    mockGetProjectRoot.mockResolvedValue("/test/project");

    const { result } = renderHook(() => useProjectRoot());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.projectRoot).toBe("/test/project");
    expect(result.current.error).toBeNull();
  });

  it("handles null project root", async () => {
    mockGetProjectRoot.mockResolvedValue(null);

    const { result } = renderHook(() => useProjectRoot());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.projectRoot).toBeNull();
  });

  it("handles errors during load", async () => {
    mockGetProjectRoot.mockRejectedValue("Store not found");

    const { result } = renderHook(() => useProjectRoot());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Store not found");
    expect(result.current.projectRoot).toBeNull();
  });

  it("setProjectRoot updates state", async () => {
    mockGetProjectRoot.mockResolvedValue(null);
    mockSetProjectRoot.mockResolvedValue(undefined);

    const { result } = renderHook(() => useProjectRoot());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.setProjectRoot("/new/project");
    });

    expect(mockSetProjectRoot).toHaveBeenCalledWith("/new/project");
    expect(result.current.projectRoot).toBe("/new/project");
  });

  it("setProjectRoot handles errors gracefully", async () => {
    mockGetProjectRoot.mockResolvedValue(null);
    mockSetProjectRoot.mockRejectedValue("Invalid path");

    const { result } = renderHook(() => useProjectRoot());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      try {
        await result.current.setProjectRoot("/bad");
      } catch {
        // Expected
      }
    });

    expect(result.current.error).toBe("Invalid path");
  });
});
