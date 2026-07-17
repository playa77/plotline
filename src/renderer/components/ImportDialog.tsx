/**
 * ImportDialog — modal for importing outlines from Markdown files.
 *
 * Flow:
 *   1. Show "Import Outline" trigger with "Choose Markdown File…" button
 *   2. On click, invoke project:pickAndImportOutline (native file dialog)
 *   3. If picker returns null (user canceled), show paste fallback (textarea)
 *   4. After parsing, show ParsePreview with Confirm/Cancel
 *   5. On confirm, invoke project:confirmImport
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { useState, useCallback } from 'react';

import { invoke } from '../ipc/client';
import type { ParsePreview } from '../../shared/schemas/outline';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ImportDialogProps {
  projectId?: string;
  onClose: () => void;
  onImported: (projectId: string, title: string) => void;
}

type ImportMode = 'trigger' | 'picking' | 'paste' | 'preview';

// ── Component ──────────────────────────────────────────────────────────────────

export function ImportDialog({
  projectId,
  onClose,
  onImported,
}: ImportDialogProps): JSX.Element {
  const [mode, setMode] = useState<ImportMode>('trigger');
  const [preview, setPreview] = useState<ParsePreview | null>(null);
  const [pasteContent, setPasteContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<boolean>(false);

  // ── Pick file ──────────────────────────────────────────────────────────────

  const handlePickFile = useCallback(async () => {
    setMode('picking');
    setError(null);

    try {
      const result = await invoke('project:pickAndImportOutline', { projectId });

      if (result === null) {
        // User canceled the native dialog — show paste fallback
        setMode('paste');
        return;
      }

      setPreview(result);
      setMode('preview');
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      setError(e.message ?? 'Failed to pick or parse file');
      setMode('trigger');
    }
  }, [projectId]);

  // ── Parse pasted Markdown ──────────────────────────────────────────────────

  const handleParsePaste = useCallback(async () => {
    if (!pasteContent.trim()) {
      setError('Please paste some Markdown content first.');
      return;
    }

    setMode('picking');
    setError(null);

    try {
      const result = await invoke('project:importOutline', {
        projectId,
        markdown: pasteContent,
      });
      setPreview(result);
      setMode('preview');
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      setError(e.message ?? 'Failed to parse Markdown');
      // Stay on paste mode so the user can fix their input
      setMode('paste');
    }
  }, [projectId, pasteContent]);

  // ── Confirm import ─────────────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (!preview) return;

    setConfirming(true);
    setError(null);

    try {
      const result = await invoke('project:confirmImport', { projectId, preview });
      onImported(result.projectId, result.title);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      setError(e.message ?? 'Failed to confirm import');
      setConfirming(false);
    }
  }, [projectId, preview, onImported]);

  // ── Cancel / Back ──────────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    setPreview(null);
    setPasteContent('');
    setError(null);
    setMode('trigger');
  }, []);

  // ── Render trigger mode ────────────────────────────────────────────────────

  function renderTrigger(): JSX.Element {
    return (
      <>
        <h2 className="import-dialog__heading">Import Outline</h2>
        <p className="import-dialog__description">
          Import a book outline from a Markdown file or paste Markdown directly.
        </p>

        <button
          type="button"
          className="import-dialog__btn import-dialog__btn--primary"
          onClick={handlePickFile}
          disabled={mode === 'picking'}
        >
          Choose Markdown File…
        </button>

        <button
          type="button"
          className="import-dialog__link-btn"
          onClick={() => {
            setError(null);
            setMode('paste');
          }}
        >
          or paste Markdown manually
        </button>
      </>
    );
  }

  // ── Render paste mode ──────────────────────────────────────────────────────

  function renderPaste(): JSX.Element {
    return (
      <>
        <h2 className="import-dialog__heading">Paste Markdown Outline</h2>
        <p className="import-dialog__description">
          Paste your Markdown-formatted outline below. It will be parsed into
          parts, chapters, sections, and beats.
        </p>

        <textarea
          className="import-dialog__textarea"
          rows={8}
          placeholder={`# Project Title\n\n## Part I\n\n### Chapter 1\n\nSection 1.1: Introduction\n- First beat\n- Second beat`}
          value={pasteContent}
          onChange={(e) => setPasteContent(e.target.value)}
        />

        <div className="import-dialog__actions">
          <button
            type="button"
            className="import-dialog__btn import-dialog__btn--primary"
            onClick={handleParsePaste}
            disabled={mode === 'picking'}
          >
            {mode === 'picking' ? 'Parsing…' : 'Parse'}
          </button>
          <button
            type="button"
            className="import-dialog__btn import-dialog__btn--secondary"
            onClick={handleCancel}
          >
            Back
          </button>
        </div>
      </>
    );
  }

  // ── Render preview mode ────────────────────────────────────────────────────

  function renderPreview(): JSX.Element {
    if (!preview) return <></>;

    const partCount = preview.parts.length;
    const chapterCount = preview.parts.reduce(
      (acc, p) => acc + p.chapters.length,
      0,
    );
    const sectionCount = preview.parts.reduce(
      (acc, p) =>
        acc + p.chapters.reduce((a, ch) => a + ch.sections.length, 0),
      0,
    );
    const beatCount = preview.parts.reduce(
      (acc, p) =>
        acc +
        p.chapters.reduce(
          (a, ch) => a + ch.sections.reduce((b, sec) => b + sec.beats.length, 0),
          0,
        ),
      0,
    );

    return (
      <>
        <h2 className="import-dialog__heading">Preview Import</h2>
        <p className="import-dialog__project-title">{preview.projectTitle}</p>

        <div className="import-dialog__preview-list">
          <div className="import-dialog__preview-item">
            <span className="import-dialog__preview-label">Parts</span>
            <span className="import-dialog__preview-value">{partCount}</span>
          </div>
          <div className="import-dialog__preview-item">
            <span className="import-dialog__preview-label">Chapters</span>
            <span className="import-dialog__preview-value">{chapterCount}</span>
          </div>
          <div className="import-dialog__preview-item">
            <span className="import-dialog__preview-label">Sections</span>
            <span className="import-dialog__preview-value">{sectionCount}</span>
          </div>
          <div className="import-dialog__preview-item">
            <span className="import-dialog__preview-label">Beats</span>
            <span className="import-dialog__preview-value">{beatCount}</span>
          </div>
          <div className="import-dialog__preview-item">
            <span className="import-dialog__preview-label">Front Matter</span>
            <span className="import-dialog__preview-value">
              {preview.frontMatter.length}
            </span>
          </div>
          <div className="import-dialog__preview-item">
            <span className="import-dialog__preview-label">Back Matter</span>
            <span className="import-dialog__preview-value">
              {preview.backMatter.length}
            </span>
          </div>
        </div>

        <div className="import-dialog__actions">
          <button
            type="button"
            className="import-dialog__btn import-dialog__btn--primary"
            onClick={handleConfirm}
            disabled={confirming}
          >
            {confirming ? 'Confirming…' : 'Confirm Import'}
          </button>
          <button
            type="button"
            className="import-dialog__btn import-dialog__btn--secondary"
            onClick={handleCancel}
            disabled={confirming}
          >
            Cancel
          </button>
        </div>
      </>
    );
  }

  // ── Render body by mode ────────────────────────────────────────────────────

  function renderBody(): JSX.Element {
    switch (mode) {
      case 'trigger':
        return renderTrigger();
      case 'picking':
        // "Picking" is a transient state — show a loading indicator
        return (
          <div className="import-dialog__loading-state">
            <p>Opening file picker…</p>
          </div>
        );
      case 'paste':
        return renderPaste();
      case 'preview':
        return renderPreview();
    }
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="import-dialog__overlay" onClick={onClose}>
      <div
        className="import-dialog__box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Import outline"
      >
        {error && (
          <div className="import-dialog__error">
            <span className="import-dialog__error-text">{error}</span>
            <button
              type="button"
              className="import-dialog__error-dismiss"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              &times;
            </button>
          </div>
        )}

        {renderBody()}
      </div>
    </div>
  );
}
