/**
 * IteratePanel — AI iterate workflow inside the ContextRail.
 *
 * Three states:
 *   1. Form:            textarea + stage selector + "Iterate" button
 *   2. Streaming:       pulsing "Iterating…" + live token display + "Stop" button
 *   3. Proposal (done): DiffView side-by-side + Accept/Discard actions
 *   4. Error:           message + "Try Again" button
 *
 * Subscribes to generation:token / generation:done / generation:error IPC
 * events and uses the shared generationStore for job lifecycle tracking.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { useState, useEffect, useCallback, useRef } from 'react';

import { DiffView } from './DiffView';
import { invoke } from '../ipc/client';
import { useIpcEvent } from '../ipc/useEvent';
import { useGenerationStore } from '../stores/generationStore';
import { countWords } from '../../shared/utils/wordCount';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface IteratePanelProps {
  projectId: string;
  chapterId?: string;
}

type IterateStage = 'expanded' | 'chapter';

// ── Component ──────────────────────────────────────────────────────────────────

export function IteratePanel({
  projectId,
  chapterId,
}: IteratePanelProps): JSX.Element {
  // ── Local state ──────────────────────────────────────────────────────────

  const [instruction, setInstruction] = useState<string>('');
  const [stage, setStage] = useState<IterateStage>('expanded');
  const [originalArtifact, setOriginalArtifact] = useState<string>('');
  const [proposedArtifact, setProposedArtifact] = useState<string>('');
  const [localError, setLocalError] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [showVersionInput, setShowVersionInput] = useState<boolean>(false);
  const [versionName, setVersionName] = useState<string>('');
  const [accepting, setAccepting] = useState<boolean>(false);
  const [discarding, setDiscarding] = useState<boolean>(false);

  // Ref so callbacks always read the latest jobId without re-registration races
  const activeJobIdRef = useRef<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Generation store ─────────────────────────────────────────────────────

  const {
    streamingContent,
    status: genStatus,
    error: genError,
    startStream,
    appendToken,
    finishStream,
    setError: setGenError,
    reset: resetGen,
  } = useGenerationStore();

  // ── Derived mode ─────────────────────────────────────────────────────────

  const hasProposal = proposedArtifact.length > 0;
  const isError = genStatus === 'error' || localError !== null;

  // ── IPC event subscriptions ──────────────────────────────────────────────

  const handleToken = useCallback(
    (payload: { jobId: string; delta: string }) => {
      appendToken(payload.jobId, payload.delta);
    },
    [appendToken],
  );
  useIpcEvent('generation:token', handleToken);

  const handleDone = useCallback(
    (payload: {
      jobId: string;
      chapterId: string;
      stage: string;
      html?: string;
      genRecord?: unknown;
    }) => {
      finishStream(payload.jobId);

      // Capture the proposal HTML if this job produced content for our chapter
      if (payload.html) {
        activeJobIdRef.current = payload.jobId;
        setProposedArtifact(payload.html);
      }
    },
    [finishStream],
  );
  useIpcEvent('generation:done', handleDone);

  const handleError = useCallback(
    (payload: { jobId: string; code: string; message: string }) => {
      setGenError(payload.jobId, payload.code, payload.message);
    },
    [setGenError],
  );
  useIpcEvent('generation:error', handleError);

  // Reset form when chapter changes
  useEffect(() => {
    resetForm();
  }, [chapterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcut ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Reset helper ─────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    activeJobIdRef.current = null;
    setProposedArtifact('');
    setOriginalArtifact('');
    setShowVersionInput(false);
    setVersionName('');
    setLocalError(null);
    setAccepting(false);
    setDiscarding(false);
    resetGen();
  }, [resetGen]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleIterate = useCallback(async () => {
    if (!instruction.trim() || !chapterId) return;

    setLocalError(null);
    setProposedArtifact('');
    setOriginalArtifact('');

    try {
      // Fetch current artifact as the "original" for diff comparison
      const artifact = await invoke('chapter:getArtifact', {
        projectId,
        chapterId,
        stage,
      });
      setOriginalArtifact(artifact.html);

      const result = await invoke('generate:iterate', {
        projectId,
        chapterId,
        stage,
        instruction: instruction.trim(),
      });
      startStream(result.jobId, chapterId, 'iterate');
    } catch (err) {
      console.error('[IteratePanel] generate:iterate failed:', err);
      setLocalError({
        code: 'START_FAILED',
        message:
          err instanceof Error ? err.message : 'Failed to start iteration',
      });
    }
  }, [instruction, chapterId, projectId, stage, startStream]);

  const handleStop = useCallback(async () => {
    if (!activeJobIdRef.current) return;
    try {
      await invoke('generate:cancel', { jobId: activeJobIdRef.current });
      resetForm();
    } catch (err) {
      console.warn('[IteratePanel] cancel failed:', err);
    }
  }, [resetForm]);

  const handleAccept = useCallback(async () => {
    const jobId = activeJobIdRef.current;
    if (!jobId) return;

    setAccepting(true);
    try {
      await invoke('iterate:accept', { projectId, jobId });
      resetForm();
    } catch (err) {
      console.error('[IteratePanel] accept failed:', err);
      setLocalError({
        code: 'ACCEPT_FAILED',
        message:
          err instanceof Error ? err.message : 'Failed to accept changes',
      });
      setAccepting(false);
    }
  }, [projectId, resetForm]);

  const handleAcceptAsVersion = useCallback(async () => {
    const jobId = activeJobIdRef.current;
    if (!jobId || !versionName.trim()) return;

    setAccepting(true);
    try {
      await invoke('iterate:acceptAsVersion', {
        projectId,
        jobId,
        versionName: versionName.trim(),
      });
      resetForm();
    } catch (err) {
      console.error('[IteratePanel] acceptAsVersion failed:', err);
      setLocalError({
        code: 'ACCEPT_FAILED',
        message:
          err instanceof Error
            ? err.message
            : 'Failed to accept as new version',
      });
      setAccepting(false);
    }
  }, [projectId, versionName, resetForm]);

  const handleDiscard = useCallback(async () => {
    const jobId = activeJobIdRef.current;
    if (!jobId) {
      resetForm();
      return;
    }

    setDiscarding(true);
    try {
      await invoke('iterate:discard', { jobId });
      resetForm();
    } catch (err) {
      console.warn('[IteratePanel] discard failed:', err);
      // Reset regardless — proposal is stale
      resetForm();
    }
  }, [resetForm]);

  const handleRetry = useCallback(() => {
    setLocalError(null);
    resetGen();
  }, [resetGen]);

  // ── No chapter selected ──────────────────────────────────────────────────

  if (!chapterId) {
    return (
      <div className="rail-iterate__empty">
        Select a chapter to iterate on it.
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────

  if (isError) {
    const err = genError ?? localError;
    return (
      <div className="rail-iterate__error">
        <div className="rail-iterate__error-code">
          {err?.code ?? 'ERROR'}
        </div>
        <div className="rail-iterate__error-message">
          {err?.message ?? 'An unexpected error occurred.'}
        </div>
        <button
          type="button"
          className="rail-iterate__btn rail-iterate__btn--secondary"
          onClick={handleRetry}
        >
          Try Again
        </button>
      </div>
    );
  }

  // ── Streaming state ──────────────────────────────────────────────────────

  if (genStatus === 'streaming') {
    const wc = countWords(streamingContent);

    return (
      <div className="rail-iterate__streaming">
        <div className="rail-iterate__streaming-bar">
          <span className="rail-iterate__streaming-label">
            <span className="rail-iterate__pulse" />
            Iterating…
          </span>
          <button
            type="button"
            className="rail-iterate__stop-btn"
            onClick={handleStop}
          >
            Stop
          </button>
        </div>

        <div className="rail-iterate__streaming-content">
          {streamingContent ? (
            <div
              className="rail-iterate__streaming-html"
              dangerouslySetInnerHTML={{ __html: streamingContent }}
            />
          ) : (
            <div className="rail-iterate__streaming-placeholder">
              Waiting for response…
            </div>
          )}
        </div>

        <div className="rail-iterate__streaming-wc">
          {wc.toLocaleString()} words
        </div>
      </div>
    );
  }

  // ── Proposal (done) state ────────────────────────────────────────────────

  if (hasProposal) {
    return (
      <div className="rail-iterate__review">
        <DiffView
          original={originalArtifact}
          modified={proposedArtifact}
          showStats={true}
          maxHeight={200}
        />

        <div className="rail-iterate__actions">
          <button
            type="button"
            className="rail-iterate__btn rail-iterate__btn--primary"
            onClick={handleAccept}
            disabled={accepting}
          >
            {accepting ? 'Accepting…' : 'Accept'}
          </button>
          <button
            type="button"
            className="rail-iterate__btn rail-iterate__btn--secondary"
            onClick={() => setShowVersionInput((v) => !v)}
          >
            Accept as New Version
          </button>
          <button
            type="button"
            className="rail-iterate__btn rail-iterate__btn--danger"
            onClick={handleDiscard}
            disabled={discarding}
          >
            Discard
          </button>
        </div>

        {showVersionInput && (
          <div className="rail-iterate__version-form">
            <input
              type="text"
              className="rail-iterate__version-input"
              placeholder="Version name…"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAcceptAsVersion();
                if (e.key === 'Escape') {
                  setShowVersionInput(false);
                  setVersionName('');
                }
              }}
              autoFocus
            />
            <button
              type="button"
              className="rail-iterate__btn rail-iterate__btn--primary"
              onClick={handleAcceptAsVersion}
              disabled={!versionName.trim() || accepting}
            >
              {accepting ? 'Creating…' : 'Create'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Form state (default) ─────────────────────────────────────────────────

  return (
    <div className="rail-iterate__form">
      <textarea
        ref={textareaRef}
        className="rail-iterate__textarea"
        placeholder="Describe what to change or improve in this chapter…"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={4}
      />

      <div className="rail-iterate__stage-selector">
        <label
          className={`rail-iterate__stage-label${stage === 'expanded' ? ' rail-iterate__stage-label--selected' : ''}`}
        >
          <input
            type="radio"
            name="iterate-stage"
            value="expanded"
            checked={stage === 'expanded'}
            onChange={() => setStage('expanded')}
          />
          Expanded Outline
        </label>
        <label
          className={`rail-iterate__stage-label${stage === 'chapter' ? ' rail-iterate__stage-label--selected' : ''}`}
        >
          <input
            type="radio"
            name="iterate-stage"
            value="chapter"
            checked={stage === 'chapter'}
            onChange={() => setStage('chapter')}
          />
          Chapter
        </label>
      </div>

      <button
        type="button"
        className="rail-iterate__btn rail-iterate__btn--primary"
        onClick={handleIterate}
        disabled={!instruction.trim()}
      >
        Iterate
      </button>

      <p className="rail-iterate__help">
        AI will propose changes you can review and accept.
      </p>
    </div>
  );
}
