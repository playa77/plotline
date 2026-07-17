/**
 * AppStateService — cross-project app state manager.
 *
 * Manages app-state.json in the platform config directory, storing the
 * recents list and the last-opened project. Used for "Open Recent" and
 * "Reopen Last Project" features.
 *
 * Reads/writes JSON directly via fs/promises. Handles missing file
 * gracefully (returns defaults). No Git dependency.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import fs from 'node:fs/promises';
import path from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RecentEntry {
  projectId: string;
  title: string;
  lastOpened: string; // ISO 8601
  wordCount: number;
}

interface AppStateFile {
  schemaVersion: number;
  activeProjectId: string | null;
  activeProjectTitle: string | null;
  recents: RecentEntry[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const SCHEMA_VERSION = 1;
const MAX_RECENTS = 10;

// ── Default state ──────────────────────────────────────────────────────────

function defaultState(): AppStateFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    activeProjectId: null,
    activeProjectTitle: null,
    recents: [],
  };
}

// ── Service ────────────────────────────────────────────────────────────────

export class AppStateService {
  private readonly filePath: string;

  /**
   * @param appDataDir - Electron `app.getPath('userData')` directory.
   *                     `app-state.json` is stored directly inside it.
   */
  constructor(appDataDir: string) {
    this.filePath = path.join(appDataDir, 'app-state.json');
  }

  /** Read the file, returning defaults if missing or corrupt. */
  private async read(): Promise<AppStateFile> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as AppStateFile;
      // Sanity check — ensure it looks like our schema
      if (typeof parsed.schemaVersion !== 'number') return defaultState();
      return parsed;
    } catch {
      return defaultState();
    }
  }

  /** Atomically write the full state. Directory must exist (appDataDir always does). */
  private async write(state: AppStateFile): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Return recents sorted by lastOpened descending, max 10.
   */
  async getRecents(): Promise<RecentEntry[]> {
    const state = await this.read();
    return state.recents
      .sort((a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime())
      .slice(0, MAX_RECENTS);
  }

  /**
   * Upsert a recent entry: update title/wordCount/lastOpened if projectId
   * already exists, otherwise append. Trims to max 10 and persists.
   */
  async addRecent(projectId: string, title: string, wordCount?: number): Promise<void> {
    const state = await this.read();
    const now = new Date().toISOString();
    const existing = state.recents.find((r) => r.projectId === projectId);

    if (existing) {
      existing.title = title;
      existing.lastOpened = now;
      if (wordCount !== undefined) existing.wordCount = wordCount;
    } else {
      state.recents.push({
        projectId,
        title,
        lastOpened: now,
        wordCount: wordCount ?? 0,
      });
    }

    state.recents.sort(
      (a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime(),
    );
    state.recents = state.recents.slice(0, MAX_RECENTS);

    await this.write(state);
  }

  /**
   * Remove a project from the recents list.
   */
  async removeRecent(projectId: string): Promise<void> {
    const state = await this.read();
    state.recents = state.recents.filter((r) => r.projectId !== projectId);
    await this.write(state);
  }

  /**
   * Return the active project (last-opened) if one has been set.
   */
  async getActiveProject(): Promise<{ projectId: string; title: string } | null> {
    const state = await this.read();
    if (state.activeProjectId && state.activeProjectTitle) {
      return { projectId: state.activeProjectId, title: state.activeProjectTitle };
    }
    return null;
  }

  /**
   * Set the active project (persisted for reopen-last-project).
   * Also updates the recents list.
   */
  async setActiveProject(projectId: string, title: string): Promise<void> {
    const state = await this.read();
    const now = new Date().toISOString();

    // Update active fields
    state.activeProjectId = projectId;
    state.activeProjectTitle = title;

    // Upsert into recents
    const existing = state.recents.find((r) => r.projectId === projectId);
    if (existing) {
      existing.title = title;
      existing.lastOpened = now;
    } else {
      state.recents.push({
        projectId,
        title,
        lastOpened: now,
        wordCount: 0,
      });
    }

    state.recents.sort(
      (a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime(),
    );
    state.recents = state.recents.slice(0, MAX_RECENTS);

    await this.write(state);
  }

  /**
   * Clear the active project without removing it from recents.
   * Used when closing a project or when the active project is no longer valid
   * (e.g., project directory deleted).
   */
  async clearActiveProject(): Promise<void> {
    const state = await this.read();
    state.activeProjectId = null;
    state.activeProjectTitle = null;
    await this.write(state);
  }
}
