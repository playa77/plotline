/**
 * ProjectSwitcher — dropdown in the library pane header for switching between
 * recently-opened projects or closing the current project.
 *
 * Shows the current project title as a clickable trigger. On click, a dropdown
 * lists other recent projects (excluding the current one) plus a "Close Project"
 * action at the bottom.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { useState, useRef, useEffect, useCallback, type ReactElement } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RecentProject {
  projectId: string;
  title: string;
  lastOpened: string;
  wordCount: number;
}

export interface ProjectSwitcherProps {
  currentTitle: string;
  recents: RecentProject[];
  currentProjectId: string;
  onSwitchProject: (projectId: string) => Promise<void>;
  onCloseProject: () => Promise<void>;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ProjectSwitcher({
  currentTitle,
  recents,
  currentProjectId,
  onSwitchProject,
  onCloseProject,
}: ProjectSwitcherProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    // Defer adding the listener so we don't immediately close from the same click
    // that opened the dropdown.
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const handleSwitch = useCallback(
    async (projectId: string) => {
      setSwitching(true);
      setOpen(false);
      try {
        await onSwitchProject(projectId);
      } finally {
        setSwitching(false);
      }
    },
    [onSwitchProject],
  );

  const handleClose = useCallback(async () => {
    setSwitching(true);
    setOpen(false);
    try {
      await onCloseProject();
    } finally {
      setSwitching(false);
    }
  }, [onCloseProject]);

  const otherRecents = recents.filter((r) => r.projectId !== currentProjectId);

  return (
    <div ref={containerRef} style={containerStyle}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={triggerStyle}
        disabled={switching}
      >
        <span style={titleStyle}>{currentTitle}</span>
        <span style={chevronStyle}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={dropdownStyle}>
          {switching && <div style={statusItemStyle}>Switching…</div>}

          {!switching && otherRecents.length === 0 && (
            <div style={statusItemStyle}>No other projects</div>
          )}

          {!switching &&
            otherRecents.map((recent) => (
              <button
                key={recent.projectId}
                type="button"
                style={dropdownItemStyle}
                onClick={() => handleSwitch(recent.projectId)}
              >
                <div style={dropdownItemTitleStyle}>{recent.title}</div>
                <div style={dropdownItemMetaStyle}>
                  {recent.wordCount.toLocaleString()} words
                </div>
              </button>
            ))}

          {!switching && otherRecents.length > 0 && <div style={dividerStyle} />}

          {!switching && (
            <button
              type="button"
              style={dropdownItemStyle}
              onClick={handleClose}
            >
              <span style={{ color: 'var(--color-danger)' }}>Close Project</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline styles ──────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  position: 'relative',
};

const triggerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  padding: '8px 12px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'var(--font-chrome)',
  fontSize: 'var(--font-size-md)',
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  textAlign: 'left',
  borderRadius: 4,
  transition: 'background var(--transition-fast)',
};

const titleStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const chevronStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 10,
  color: 'var(--color-text-muted)',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 8,
  right: 8,
  zIndex: 100,
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
  overflow: 'hidden',
};

const dropdownItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 12px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'var(--font-chrome)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-primary)',
  transition: 'background var(--transition-fast)',
};

const dropdownItemTitleStyle: React.CSSProperties = {
  fontWeight: 500,
  marginBottom: 1,
};

const dropdownItemMetaStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-text-muted)',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--color-border)',
  margin: '4px 0',
};

const statusItemStyle: React.CSSProperties = {
  padding: '12px 16px',
  color: 'var(--color-text-muted)',
  fontFamily: 'var(--font-chrome)',
  fontSize: 'var(--font-size-sm)',
};
