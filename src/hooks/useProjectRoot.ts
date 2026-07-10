// Version: 1.1.0 | 2026-07-10
// Hook for loading and managing the project root directory from persistent
// settings (via tauri-plugin-store).

import { useState, useEffect, useCallback } from "react";
import * as api from "../api/tauri";

export function useProjectRoot() {
  const [projectRoot, setProjectRootState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Re-fetch the project root from persistent store. Call this after external
   * changes (e.g. user saves a new directory in SettingsModal) since the hook
   * only loads once on mount.
   */
  const refresh = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const root = await api.getProjectRoot();
      setProjectRootState(root);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load project root from persistent store on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const root = await api.getProjectRoot();
        if (!cancelled) {
          setProjectRootState(root);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Sets a new project root and persists it to the store.
   * Validates that the path exists and is a directory on the backend side.
   */
  const setProjectRoot = useCallback(async (path: string) => {
    setError(null);
    try {
      await api.setProjectRoot(path);
      setProjectRootState(path);
    } catch (err) {
      setError(String(err));
      throw err;
    }
  }, []);

  return {
    projectRoot,
    setProjectRoot,
    refresh,
    isLoading,
    error,
  };
}
