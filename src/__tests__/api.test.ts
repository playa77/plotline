// Version: 1.0.0 | 2026-07-09
// Tests for API layer: verifies all invoke() wrappers are correctly typed
// and propagate errors.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the @tauri-apps/api/core module
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import * as api from "../api/tauri";

const mockedInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("api/tauri", () => {
  describe("runWorkflow", () => {
    it("calls invoke with correct args", async () => {
      mockedInvoke.mockResolvedValue("/tmp/run-dir");
      const result = await api.runWorkflow("/path/to/wf.yaml", "/project");
      expect(mockedInvoke).toHaveBeenCalledWith("run_workflow", {
        workflowPath: "/path/to/wf.yaml",
        projectRoot: "/project",
        variableOverrides: {},
      });
      expect(result).toBe("/tmp/run-dir");
    });
  });

  describe("rerunFromStep", () => {
    it("calls invoke with correct args", async () => {
      mockedInvoke.mockResolvedValue(undefined);
      await api.rerunFromStep("/tmp/run-dir", 2);
      expect(mockedInvoke).toHaveBeenCalledWith("rerun_from_step", {
        runDir: "/tmp/run-dir",
        stepIndex: 2,
      });
    });
  });

  describe("saveOutput", () => {
    it("calls invoke with correct args", async () => {
      mockedInvoke.mockResolvedValue(undefined);
      await api.saveOutput("/tmp/run", 0, "step1", "content");
      expect(mockedInvoke).toHaveBeenCalledWith("save_output", {
        runDir: "/tmp/run",
        stepIndex: 0,
        stepName: "step1",
        content: "content",
      });
    });
  });

  describe("getRunStatus", () => {
    it("calls invoke and returns RunInfo", async () => {
      const runInfo = {
        run_dir: "/tmp/run",
        workflow_name: "Test",
        started_at: "2026-07-09T12:00:00",
        steps: [],
      };
      mockedInvoke.mockResolvedValue(runInfo);
      const result = await api.getRunStatus("/tmp/run");
      expect(result).toEqual(runInfo);
    });
  });

  describe("listWorkflows", () => {
    it("returns empty array when no workflows", async () => {
      mockedInvoke.mockResolvedValue([]);
      const result = await api.listWorkflows("/project");
      expect(result).toEqual([]);
    });

    it("returns workflow summaries", async () => {
      const workflows = [
        { name: "Test", file_path: "/wf.yaml", step_count: 2 },
      ];
      mockedInvoke.mockResolvedValue(workflows);
      const result = await api.listWorkflows("/project");
      expect(result).toEqual(workflows);
    });
  });

  describe("listRuns", () => {
    it("returns run summaries", async () => {
      const runs = [
        {
          run_dir: "/runs/2026-07-09-test",
          workflow_name: "Test",
          started_at: "2026-07-09T12:00:00",
          completed_steps: 2,
          total_steps: 3,
        },
      ];
      mockedInvoke.mockResolvedValue(runs);
      const result = await api.listRuns("/project");
      expect(result).toEqual(runs);
    });
  });

  describe("readFileContent", () => {
    it("reads file content", async () => {
      mockedInvoke.mockResolvedValue("file contents");
      const result = await api.readFileContent("/path/to/file.md");
      expect(result).toBe("file contents");
    });
  });

  describe("setApiKey", () => {
    it("calls invoke with key", async () => {
      mockedInvoke.mockResolvedValue(undefined);
      await api.setApiKey("sk-test");
      expect(mockedInvoke).toHaveBeenCalledWith("set_api_key", {
        key: "sk-test",
      });
    });
  });

  describe("getApiKey", () => {
    it("returns key", async () => {
      mockedInvoke.mockResolvedValue("sk-test");
      const result = await api.getApiKey();
      expect(result).toBe("sk-test");
    });
  });

  describe("hasApiKey", () => {
    it("returns true when key exists", async () => {
      mockedInvoke.mockResolvedValue(true);
      const result = await api.hasApiKey();
      expect(result).toBe(true);
    });

    it("returns false when key does not exist", async () => {
      mockedInvoke.mockResolvedValue(false);
      const result = await api.hasApiKey();
      expect(result).toBe(false);
    });
  });

  describe("setProjectRoot", () => {
    it("calls invoke with path", async () => {
      mockedInvoke.mockResolvedValue(undefined);
      await api.setProjectRoot("/project");
      expect(mockedInvoke).toHaveBeenCalledWith("set_project_root", {
        path: "/project",
      });
    });
  });

  describe("getProjectRoot", () => {
    it("returns path when set", async () => {
      mockedInvoke.mockResolvedValue("/project");
      const result = await api.getProjectRoot();
      expect(result).toBe("/project");
    });

    it("returns null when not set", async () => {
      mockedInvoke.mockResolvedValue(null);
      const result = await api.getProjectRoot();
      expect(result).toBeNull();
    });
  });

  describe("error propagation", () => {
    it("throws error when invoke fails", async () => {
      mockedInvoke.mockRejectedValue("Backend error: something broke");
      await expect(api.hasApiKey()).rejects.toBe("Backend error: something broke");
    });
  });
});
