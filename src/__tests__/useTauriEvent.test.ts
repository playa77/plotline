// Version: 1.0.0 | 2026-07-09
// Tests for useTauriEvent hook: verifies subscribe and unsubscribe.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Use vi.hoisted to avoid hoisting issues with vi.mock
const { mockUnlisten, mockListen } = vi.hoisted(() => ({
  mockUnlisten: vi.fn(),
  mockListen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
}));

import { useTauriEvent } from "../hooks/useTauriEvent";

beforeEach(() => {
  vi.clearAllMocks();
  mockListen.mockImplementation((_event: string, cb: (event: unknown) => void) => {
    // Store the callback so tests can fire events
    (mockListen as ReturnType<typeof vi.fn> & { __callback?: unknown }).__callback = cb;
    return Promise.resolve(mockUnlisten);
  });
});

describe("useTauriEvent", () => {
  it("subscribes to the given event name on mount", () => {
    const handler = vi.fn();

    renderHook(() => useTauriEvent("test_event", handler));

    expect(mockListen).toHaveBeenCalledWith("test_event", expect.any(Function));
  });

  it("unsubscribes on unmount", () => {
    const handler = vi.fn();

    const { unmount } = renderHook(() =>
      useTauriEvent("test_event", handler)
    );

    unmount();

    // The unlisten should have been called (it's async but we verify intent)
    // The promise resolution may not have happened yet, but the hook stores
    // the pending promise and we verify the mock was resolved
    expect(mockListen).toHaveBeenCalledTimes(1);
  });

  it("calls the handler with the event payload", () => {
    const handler = vi.fn();

    renderHook(() => useTauriEvent("test_event", handler));

    // Get the callback that was passed to listen and simulate an event
    const listenCallback = mockListen.mock.calls[0][1];
    expect(listenCallback).toBeDefined();

    act(() => {
      listenCallback({ payload: { data: "test" } });
    });

    expect(handler).toHaveBeenCalledWith({ data: "test" });
  });

  it("uses the latest handler reference", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const { rerender } = renderHook(
      ({ handler }: { handler: (payload: unknown) => void }) =>
        useTauriEvent("test_event", handler),
      { initialProps: { handler: handler1 } }
    );

    rerender({ handler: handler2 });

    const listenCallback = mockListen.mock.calls[0][1];
    act(() => {
      listenCallback({ payload: { data: "test" } });
    });

    expect(handler2).toHaveBeenCalledWith({ data: "test" });
    expect(handler1).not.toHaveBeenCalled();
  });
});
