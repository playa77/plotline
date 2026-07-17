/**
 * ChapterWorkspace — full chapter workspace with stage tabs and expand flow.
 *
 * Replaces the simple ChapterEditor (from WP-09) with a tabbed interface
 * for the three generation stages: Outline (read-only), Expanded (editable
 * with AI expand), and Written (write with AI).
 *
 * The renderer is sandboxed — all durable operations cross the typed IPC
 * contract via the renderer IPC client.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { useState, useEffect, useCallback } from 'react';

import { Editor } from './Editor';
import { invoke } from '../ipc/client';
import { useIpcEvent } from '../ipc/useEvent';
import { useGenerationStore } from '../stores/generationStore';
import { useToastStore } from '../stores/toastStore';
import { countWords } from '../../shared/utils/wordCount';

import '../styles/chapter-workspace.css';

// ── Types ──────────────────────────────────────────────────────────────────────

type Stage = 'outline' | 'expanded' | 'written';

interface StageDotStatus {
  outline: 'empty' | 'filled' | 'stale';
  expanded: 'empty' | 'filled' | 'stale';
  chapter: 'empty' | 'filled' | 'stale';
}

export interface ChapterWorkspaceProps {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  wordTarget?: { min: number; max: number } | null;
  onImportOutline?: () => void;
}

// ── Dot class map ──────────────────────────────────────────────────────────────

const DOT_CLASS: Record<string, string> = {
  empty: 'chapter-workspace__dot--empty',
  filled: 'chapter-workspace__dot--filled',
  stale: 'chapter-workspace__dot--stale',
};

const STAGE_LABELS: Record<Stage, string> = {
  outline: 'Outline',
  expanded: 'Expanded',
  written: 'Written',
};

// ── Component ──────────────────────────────────────────────────────────────────

export function ChapterWorkspace({
  projectId,
  chapterId,
  chapterTitle,
  wordTarget = null,
  onImportOutline,
}: ChapterWorkspaceProps): JSX.Element {
  // ── Local state ──────────────────────────────────────────────────────────

  const [activeStage, setActiveStage] = useState<Stage>('outline');
  const [dots, setDots] = useState<StageDotStatus>({
    outline: 'empty',
    expanded: 'empty',
    chapter: 'empty',
  });
  const [artifactHtml, setArtifactHtml] = useState<string>('');
  const [artifactLoading, setArtifactLoading] = useState<boolean>(true);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

  // ── Generation store ─────────────────────────────────────────────────────

  const {
    activeJob,
    streamingContent,
    status: genStatus,
    error: genError,
    startStream,
    appendToken,
    finishStream,
    setError: setGenError,
    reset: resetGen,
  } = useGenerationStore();

  // ═══════════════════════════════════════════════════════════════════════════
  // Effects
  // ═══════════════════════════════════════════════════════════════════════════

  // Fetch chapter status (dots) and current stage artifact
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setArtifactLoading(true);

      try {
        // Fetch status for dots
        const status = await invoke('chapter:getStatus', { projectId, chapterId });
        if (!cancelled) {
          setDots(status.stageDots);
        }
      } catch (err) {
        // IPC may not be wired yet — dots will remain as defaults
        console.warn('[ChapterWorkspace] chapter:getStatus failed:', err);
      }

      try {
        const stageParam =
          activeStage === 'written' ? 'chapter' : activeStage;
        const artifact = await invoke('chapter:getArtifact', {
          projectId,
          chapterId,
          stage: stageParam as 'outline' | 'expanded' | 'chapter',
        });
        if (!cancelled) {
          setArtifactHtml(artifact.html);
          setArtifactLoading(false);
        }
      } catch (err) {
        // IPC may not be wired yet — show empty state gracefully
        console.warn('[ChapterWorkspace] chapter:getArtifact failed:', err);
        if (!cancelled) {
          // Clear artifact on error so we show the appropriate empty state
          setArtifactHtml('');
          setArtifactLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [projectId, chapterId, activeStage]);

  // ── IPC event subscriptions ───────────────────────────────────────────

  // generation:token
  const handleToken = useCallback(
    (payload: { jobId: string; delta: string }) => {
      appendToken(payload.jobId, payload.delta);
    },
    [appendToken],
  );

  useIpcEvent('generation:token', handleToken);

  // generation:done
  const handleDone = useCallback(
    (payload: { jobId: string; chapterId: string; stage: string; html?: string; genRecord?: unknown }) => {
      finishStream(payload.jobId);

      // If the completed job was for this chapter, switch to the relevant tab and refresh
      if (payload.chapterId === chapterId) {
        // Determine which stage tab to switch to
        const stage = payload.stage as string;
        if (stage === 'expanded' || stage === 'expand') {
          setActiveStage('expanded');
        } else if (stage === 'write' || stage === 'chapter') {
          setActiveStage('written');
        }

        // Refresh the artifact for the appropriate stage
        const stageToFetch = stage === 'expand' ? 'expanded' :
          (stage === 'write' || stage === 'chapter') ? 'chapter' : stage;

        invoke('chapter:getArtifact', {
          projectId,
          chapterId,
          stage: stageToFetch as 'outline' | 'expanded' | 'chapter',
        }).then((artifact) => {
          setArtifactHtml(artifact.html);
          // Refresh dots too
          return invoke('chapter:getStatus', { projectId, chapterId });
        }).then((status) => {
          setDots(status.stageDots);
        }).catch((err) => {
          console.warn('[ChapterWorkspace] Refresh after generation:done failed:', err);
        });
      }
    },
    [finishStream, projectId, chapterId],
  );

  useIpcEvent('generation:done', handleDone);

  // generation:error
  const handleError = useCallback(
    (payload: { jobId: string; code: string; message: string }) => {
      setGenError(payload.jobId, payload.code, payload.message);
    },
    [setGenError],
  );

  useIpcEvent('generation:error', handleError);

  // staleness:changed — refresh dots when upstream changes (outline mutations, variable edits)
  const handleStalenessChanged = useCallback(
    (payload: { chapterIds: string[] }) => {
      if (payload.chapterIds.includes(chapterId)) {
        invoke('chapter:getStatus', { projectId, chapterId })
          .then((status) => {
            setDots(status.stageDots);
          })
          .catch((err) => {
            console.warn('[ChapterWorkspace] staleness refresh failed:', err);
          });
      }
    },
    [projectId, chapterId],
  );

  useIpcEvent('staleness:changed', handleStalenessChanged);

  // ═══════════════════════════════════════════════════════════════════════════
  // Tab handlers
  // ═══════════════════════════════════════════════════════════════════════════

  const handleTabClick = useCallback(
    (stage: Stage) => {
      // Don't switch tabs during active generation
      if (genStatus === 'streaming') return;
      setActiveStage(stage);
    },
    [genStatus],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Expand flow
  // ═══════════════════════════════════════════════════════════════════════════

  const handleExpand = useCallback(
    async (asNewVersion?: string) => {
      try {
        const { jobId } = await invoke('generate:expand', {
          projectId,
          chapterId,
          asNewVersion,
        });
        startStream(jobId, chapterId, 'expand');
      } catch (err) {
        console.error('[ChapterWorkspace] generate:expand failed:', err);
        const message = err instanceof Error ? err.message
          : (err as { message?: string })?.message ?? 'Failed to start expansion';
        setGenError(chapterId, 'EXPAND_FAILED', message);
      }
    },
    [projectId, chapterId, startStream, setGenError],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Write flow
  // ═══════════════════════════════════════════════════════════════════════════

  const handleWrite = useCallback(
    async () => {
      try {
        const { jobId } = await invoke('generate:write', {
          projectId,
          chapterId,
        });
        startStream(jobId, chapterId, 'write');
      } catch (err) {
        console.error('[ChapterWorkspace] generate:write failed:', err);
        const message = err instanceof Error ? err.message
          : (err as { message?: string })?.message ?? 'Failed to start writing';
        setGenError(chapterId, 'WRITE_FAILED', message);
      }
    },
    [projectId, chapterId, startStream, setGenError],
  );

  const handleStop = useCallback(async () => {
    if (!activeJob) return;
    try {
      await invoke('generate:cancel', { jobId: activeJob.jobId });
      resetGen();
    } catch (err) {
      const e = err as { code?: string; message?: string; detail?: string };
      useToastStore.getState().error(e.code ?? 'GEN_ERROR', e.message ?? 'Failed to stop generation', e.detail);
      console.warn('[ChapterWorkspace] generate:cancel failed:', err);
    }
  }, [activeJob, resetGen]);

  const handleRetry = useCallback(() => {
    const step = activeJob?.step;
    resetGen();
    if (step === 'write') {
      handleWrite();
    } else {
      handleExpand();
    }
  }, [resetGen, handleExpand, handleWrite, activeJob]);

  const handleDropdownToggle = useCallback(() => {
    setDropdownOpen((prev) => !prev);
  }, []);

  // ── Export handlers (WP-23) ──────────────────────────────────────────────

  const [exportDropdownOpen, setExportDropdownOpen] = useState<boolean>(false);

  const handleExportSubstack = useCallback(async () => {
    try {
      await invoke('export:substack', { projectId, chapterId, mode: 'clipboard' });
      // Could show a toast/success indicator — skip for now
    } catch (err) {
      const e = err as { code?: string; message?: string; detail?: string };
      useToastStore.getState().error(e.code ?? 'EXPORT_ERROR', e.message ?? 'Export failed', e.detail);
      console.error('[ChapterWorkspace] export:substack failed:', err);
    }
  }, [projectId, chapterId]);

  const handleExportFile = useCallback(async () => {
    // For WP-23, file export is basic: just export with a fixed name for now
    // Full save dialog will come in a later pass
    try {
      await invoke('export:substack', { projectId, chapterId, mode: 'file', filePath: '' });
    } catch (err) {
      const e = err as { code?: string; message?: string; detail?: string };
      useToastStore.getState().error(e.code ?? 'EXPORT_ERROR', e.message ?? 'Export failed', e.detail);
      console.error('[ChapterWorkspace] export file failed:', err);
    }
  }, [projectId, chapterId]);

  const handleExportDropdownToggle = useCallback(() => {
    setExportDropdownOpen((prev) => !prev);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;

    const handleClick = (e: MouseEvent) => {
      // Only close if clicking outside the dropdown and the chevron buttons
      const target = e.target as HTMLElement;
      if (!target.closest('.chapter-workspace__dropdown') &&
          !target.closest('.chapter-workspace__expand-chevron') &&
          !target.closest('.chapter-workspace__write-chevron')) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [dropdownOpen]);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportDropdownOpen) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.chapter-workspace__dropdown') &&
          !target.closest('.chapter-workspace__export-chevron')) {
        setExportDropdownOpen(false);
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [exportDropdownOpen]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Render helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /** Render the tab bar with dot indicators. */
  function renderTabs(): JSX.Element {
    const stages: Stage[] = ['outline', 'expanded', 'written'];

    return (
      <div className="chapter-workspace__tabs" role="tablist">
        {stages.map((stage) => {
          const isActive = stage === activeStage;
          const dotKey = stage === 'written' ? 'chapter' : stage;
          const dotStatus = dots[dotKey as keyof StageDotStatus] ?? 'empty';

          return (
            <button
              key={stage}
              role="tab"
              aria-selected={isActive}
              className={[
                'chapter-workspace__tab',
                isActive ? 'chapter-workspace__tab--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleTabClick(stage)}
            >
              <span
                className={`chapter-workspace__dot ${DOT_CLASS[dotStatus] ?? ''}`}
              />
              {STAGE_LABELS[stage]}
            </button>
          );
        })}
      </div>
    );
  }

  /** Render the outline stage — read-only display of chapter outline. */
  function renderOutlineStage(): JSX.Element {
    if (artifactLoading) {
      return (
        <div className="chapter-workspace__loading">Loading outline…</div>
      );
    }

    if (!artifactHtml || artifactHtml.trim() === '') {
      return (
        <div className="chapter-workspace__empty">
          <div className="chapter-workspace__empty-heading">
            Chapter Outline
          </div>
          <div className="chapter-workspace__empty-text">
            Select a chapter from the manuscript tree to view its outline,
            or import an outline to get started.
          </div>
          <button
            type="button"
            className="chapter-workspace__empty-import-btn"
            onClick={onImportOutline}
          >
            Import Outline
          </button>
        </div>
      );
    }

    return (
      <div className="chapter-workspace__stage">
        <Editor
          content={artifactHtml}
          readOnly={true}
          wordTarget={wordTarget}
        />
      </div>
    );
  }

  /** Render the expanded stage — editor or expand CTA. */
  function renderExpandedStage(): JSX.Element {
    if (artifactLoading) {
      return (
        <div className="chapter-workspace__loading">Loading expanded outline…</div>
      );
    }

    if (artifactHtml && artifactHtml.trim() !== '') {
      return (
        <div className="chapter-workspace__stage">
          {dots.expanded === 'stale' && (
            <div className="chapter-workspace__upstream-badge">
              <span className="chapter-workspace__upstream-badge-label">
                {'\u26A0'} Upstream changed
              </span>
              <button
                type="button"
                className="chapter-workspace__upstream-badge-btn"
                onClick={() => handleExpand()}
                disabled={genStatus === 'streaming'}
              >
                Regenerate
              </button>
            </div>
          )}
          <Editor
            content={artifactHtml}
            readOnly={true}
            wordTarget={wordTarget}
          />
        </div>
      );
    }

    // No expanded artifact — show expand CTA
    return (
      <div className="chapter-workspace__empty">
        <div className="chapter-workspace__empty-heading">
          Expand Your Outline
        </div>
        <div className="chapter-workspace__empty-text">
          AI will expand this chapter&rsquo;s outline into a detailed
          scene-by-scene breakdown, preserving character voices and
          narrative context from your notes.
        </div>

        <div className="chapter-workspace__expand-group">
          <button
            type="button"
            className="chapter-workspace__expand-btn"
            onClick={() => handleExpand()}
            disabled={genStatus === 'streaming'}
          >
            Expand
          </button>
          <button
            type="button"
            className="chapter-workspace__expand-chevron"
            onClick={handleDropdownToggle}
            disabled={genStatus === 'streaming'}
            aria-label="More expand options"
          >
            <span
              className={`chapter-workspace__expand-chevron-arrow${dropdownOpen ? ' chapter-workspace__expand-chevron-arrow--open' : ''}`}
            />
          </button>

          {dropdownOpen && (
            <div className="chapter-workspace__dropdown" role="menu">
              <span className="chapter-workspace__dropdown-label">
                Options
              </span>
              <button
                role="menuitem"
                className="chapter-workspace__dropdown-item"
                onClick={() => {
                  setDropdownOpen(false);
                  handleExpand();
                }}
              >
                Expand
              </button>
              <button
                role="menuitem"
                className="chapter-workspace__dropdown-item"
                onClick={() => {
                  setDropdownOpen(false);
                  handleExpand();
                }}
              >
                Re-expand
              </button>
              <div className="chapter-workspace__dropdown-divider" />
              <button
                role="menuitem"
                className="chapter-workspace__dropdown-item"
                disabled
                title="Coming in WP-21"
              >
                &hellip;as new Version
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /** Render the written stage — Write CTA, artifact, or "needs expand" notice. */
  function renderWrittenStage(): JSX.Element {
    if (artifactLoading) {
      return (
        <div className="chapter-workspace__loading">Loading chapter…</div>
      );
    }

    // State B: chapter.html exists — show the artifact
    if (artifactHtml && artifactHtml.trim() !== '') {
      const wc = countWords(artifactHtml);
      const targetRange = wordTarget
        ? `${wordTarget.min.toLocaleString()}–${wordTarget.max.toLocaleString()} words`
        : null;

      return (
        <div className="chapter-workspace__stage">
          {dots.chapter === 'stale' && (
            <div className="chapter-workspace__upstream-badge">
              <span className="chapter-workspace__upstream-badge-label">
                {'\u26A0'} Upstream changed
              </span>
              <button
                type="button"
                className="chapter-workspace__upstream-badge-btn"
                onClick={() => handleWrite()}
                disabled={genStatus === 'streaming'}
              >
                Regenerate
              </button>
            </div>
          )}
          <Editor
            content={artifactHtml}
            readOnly={true}
            wordTarget={wordTarget}
          />
          <div className="chapter-workspace__wc-bar">
            <span>{wc.toLocaleString()} words</span>
            {targetRange && (
              <span className="chapter-workspace__wc-target">Target: {targetRange}</span>
            )}
          </div>
          {/* Export action bar — primary action for written chapters per DD §5.3 */}
          <div className="chapter-workspace__export-bar">
            <button
              type="button"
              className="chapter-workspace__export-btn"
              onClick={handleExportSubstack}
            >
              Copy for Substack
            </button>
            <button
              type="button"
              className="chapter-workspace__export-chevron"
              onClick={handleExportDropdownToggle}
              aria-label="More export options"
            >
              <span className={`chapter-workspace__export-chevron-arrow${exportDropdownOpen ? ' chapter-workspace__export-chevron-arrow--open' : ''}`} />
            </button>
            {exportDropdownOpen && (
              <div className="chapter-workspace__dropdown" role="menu">
                <span className="chapter-workspace__dropdown-label">Export options</span>
                <button
                  role="menuitem"
                  className="chapter-workspace__dropdown-item"
                  onClick={() => { setExportDropdownOpen(false); handleExportSubstack(); }}
                >
                  Copy for Substack
                </button>
                <button
                  role="menuitem"
                  className="chapter-workspace__dropdown-item"
                  onClick={handleExportFile}
                >
                  Save as HTML…
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    // State A: no chapter.html — check whether expanded outline exists
    const hasExpanded = dots.expanded === 'filled';

    if (!hasExpanded) {
      return (
        <div className="chapter-workspace__empty">
          <div className="chapter-workspace__empty-heading">
            Write Your Chapter
          </div>
          <div className="chapter-workspace__notice">
            <span className="chapter-workspace__notice-text">
              Expanded outline required before writing. Expand your chapter first.
            </span>
            <button
              type="button"
              className="chapter-workspace__notice-link"
              onClick={() => setActiveStage('expanded')}
            >
              Go to Expand
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="chapter-workspace__empty">
        <div className="chapter-workspace__empty-heading">
          Write Your Chapter
        </div>
        <div className="chapter-workspace__empty-text">
          AI will write the full chapter prose from your expanded outline.
        </div>

        <div className="chapter-workspace__write-group">
          <button
            type="button"
            className="chapter-workspace__write-btn"
            onClick={() => handleWrite()}
            disabled={genStatus === 'streaming'}
          >
            Write
          </button>
          <button
            type="button"
            className="chapter-workspace__write-chevron"
            onClick={handleDropdownToggle}
            disabled={genStatus === 'streaming'}
            aria-label="More write options"
          >
            <span
              className={`chapter-workspace__write-chevron-arrow${dropdownOpen ? ' chapter-workspace__write-chevron-arrow--open' : ''}`}
            />
          </button>

          {dropdownOpen && (
            <div className="chapter-workspace__dropdown" role="menu">
              <span className="chapter-workspace__dropdown-label">
                Options
              </span>
              <button
                role="menuitem"
                className="chapter-workspace__dropdown-item"
                onClick={() => {
                  setDropdownOpen(false);
                  handleWrite();
                }}
              >
                Write
              </button>
              <button
                role="menuitem"
                className="chapter-workspace__dropdown-item"
                onClick={() => {
                  setDropdownOpen(false);
                  handleWrite();
                }}
              >
                Re-write
              </button>
              <div className="chapter-workspace__dropdown-divider" />
              <button
                role="menuitem"
                className="chapter-workspace__dropdown-item"
                disabled
                title="Coming in WP-21"
              >
                &hellip;as new Version
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /** Render streaming generation content. */
  function renderStreaming(): JSX.Element {
    const wc = countWords(streamingContent);

    return (
      <div className="chapter-workspace__streaming">
        <div className="chapter-workspace__streaming-bar">
          <span className="chapter-workspace__streaming-label">
            <span className="chapter-workspace__pulse" />
            {activeJob?.step === 'write'
              ? 'Writing…'
              : activeJob?.step === 'expand'
                ? 'Expanding…'
                : 'Generating…'}
          </span>
          <button
            type="button"
            className="chapter-workspace__stop-btn"
            onClick={handleStop}
          >
            Stop
          </button>
        </div>

        <div className="chapter-workspace__stage">
          <Editor
            content={streamingContent}
            readOnly={true}
            wordTarget={wordTarget}
          />
        </div>

        <div className="chapter-workspace__streaming-wc">
          {wc.toLocaleString()} words
        </div>
      </div>
    );
  }

  /** Render error state. */
  function renderError(): JSX.Element {
    return (
      <div className="chapter-workspace__error">
        <div className="chapter-workspace__error-code">
          {genError?.code ?? 'ERROR'}
        </div>
        <div className="chapter-workspace__error-message">
          {genError?.message ?? 'An unexpected error occurred during generation.'}
        </div>
        <button
          type="button"
          className="chapter-workspace__retry-btn"
          onClick={handleRetry}
        >
          Retry
        </button>
      </div>
    );
  }

  /** Render stage content based on active stage and generation state. */
  function renderStageContent(): JSX.Element {
    // Priority: error > streaming > loading > stage content
    if (genStatus === 'error' && genError) {
      return renderError();
    }

    if (genStatus === 'streaming') {
      return renderStreaming();
    }

    // If generation just completed but we're not streaming, show the
    // refreshed artifact (already switched tab in handleDone)
    switch (activeStage) {
      case 'outline':
        return renderOutlineStage();
      case 'expanded':
        return renderExpandedStage();
      case 'written':
        return renderWrittenStage();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Main render
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="chapter-workspace">
      <div className="chapter-workspace__header">
        <h2 className="chapter-workspace__title">{chapterTitle}</h2>
      </div>
      {renderTabs()}
      {renderStageContent()}
    </div>
  );
}
