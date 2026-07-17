/**
 * ProjectLauncher — welcome screen shown when no project is active.
 *
 * Provides quick-access buttons (New Project / Open Project), an "Open from
 * folder…" link, and a list of recently-opened projects with metadata.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { type ReactElement } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RecentProject {
  projectId: string;
  title: string;
  lastOpened: string;
  wordCount: number;
}

export interface ProjectLauncherProps {
  recents: RecentProject[];
  loading: boolean;
  onNewProject: () => Promise<void>;
  onOpenProject: (projectId: string) => Promise<void>;
  onPickProject: () => Promise<void>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ProjectLauncher({
  recents,
  loading,
  onNewProject,
  onOpenProject,
  onPickProject,
}: ProjectLauncherProps): ReactElement {
  return (
    <div className="app-shell app-shell--welcome">
      <div className="welcome-screen">
        <h1 className="welcome-screen__title">Plotline</h1>
        <p className="welcome-screen__subtitle">Write your book, chapter by chapter.</p>
        <div className="welcome-screen__actions">
          <button
            type="button"
            className="welcome-screen__btn welcome-screen__btn--primary"
            onClick={onNewProject}
          >
            New Project <span style={shortcutBadgeStyle}>⌘N</span>
          </button>
          <button
            type="button"
            className="welcome-screen__btn"
            onClick={onPickProject}
          >
            Open Project <span style={shortcutBadgeStyle}>⌘O</span>
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={onPickProject}
            style={linkButtonStyle}
          >
            Open from folder…
          </button>
        </div>

        {/* ── Recent projects section ──────────────────────────── */}
        <div style={{ marginTop: 32, textAlign: 'left' }}>
          <h3 style={sectionHeaderStyle}>Recent Projects</h3>

          {loading && (
            <div style={statusStyle}>Loading…</div>
          )}

          {!loading && recents.length === 0 && (
            <div style={statusStyle}>No recent projects</div>
          )}

          {!loading && recents.length > 0 && (
            <ul style={listResetStyle}>
              {recents.map((recent) => (
                <li key={recent.projectId} style={listItemOuterStyle}>
                  <button
                    type="button"
                    style={listItemButtonStyle}
                    onClick={() => onOpenProject(recent.projectId)}
                  >
                    <div style={listItemTitleStyle}>{recent.title}</div>
                    <div style={listItemMetaStyle}>
                      {recent.wordCount.toLocaleString()} words · Opened{' '}
                      {formatRelativeTime(recent.lastOpened)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline styles ──────────────────────────────────────────────────────────────

const shortcutBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: 8,
  padding: '1px 6px',
  borderRadius: 4,
  background: 'rgba(255,255,255,0.2)',
  fontSize: 11,
  fontWeight: 400,
  verticalAlign: 'middle',
};

const linkButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--color-accent)',
  cursor: 'pointer',
  fontFamily: 'var(--font-chrome)',
  fontSize: 'var(--font-size-md)',
  padding: '4px 8px',
  textDecoration: 'underline',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--font-chrome)',
  fontSize: 'var(--font-size-md)',
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  margin: '0 0 8px 0',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const statusStyle: React.CSSProperties = {
  color: 'var(--color-text-muted)',
  fontFamily: 'var(--font-chrome)',
  fontSize: 'var(--font-size-sm)',
  padding: '16px 0',
};

const listResetStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
};

const listItemOuterStyle: React.CSSProperties = {
  marginBottom: 4,
};

const listItemButtonStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '10px 12px',
  border: 'none',
  borderRadius: 6,
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'var(--font-chrome)',
  transition: 'background var(--transition-fast)',
};

const listItemTitleStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-md)',
  fontWeight: 500,
  color: 'var(--color-text-primary)',
  marginBottom: 2,
};

const listItemMetaStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-text-muted)',
};
