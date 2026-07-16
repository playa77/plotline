/**
 * Full chapter editor — toolbar, rich-text surface, status bar, and autosave.
 *
 * Usage:
 *   <ChapterEditor
 *     initialContent="<p>Start writing…</p>"
 *     wordTarget={{ min: 7000, max: 8000 }}
 *     onSave={(html) => console.log('Save:', html)}
 *   />
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { useState, useCallback } from 'react';

import { Editor } from './Editor';
import type { EditorProps } from './Editor';
import { EditorToolbar } from './EditorToolbar';

import { countWords } from '../../shared/utils/wordCount';

import './Editor.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChapterEditorProps {
  /** Initial HTML content for the chapter. */
  initialContent: string;

  /** Optional word-count target range shown in the status bar. */
  wordTarget?: { min: number; max: number } | null;

  /** Called when content is saved (2 s idle debounce). */
  onSave?: (html: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChapterEditor({
  initialContent,
  wordTarget = null,
  onSave,
}: ChapterEditorProps): JSX.Element {
  const [wordCount, setWordCount] = useState<number>(() =>
    countWords(initialContent),
  );

  const handleChange: EditorProps['onChange'] = useCallback((html: string) => {
    setWordCount(countWords(html));
  }, []);

  // -----------------------------------------------------------------------
  // Status bar text
  // -----------------------------------------------------------------------
  const statusText = (() => {
    const current = wordCount.toLocaleString();
    if (!wordTarget) {
      return `${current} words`;
    }
    return `${current} / ${wordTarget.min.toLocaleString()}–${wordTarget.max.toLocaleString()}`;
  })();

  const wordCountClass = (() => {
    if (!wordTarget) return '';
    if (wordCount < wordTarget.min) return 'word-count--under';
    if (wordCount > wordTarget.max) return 'word-count--over';
    return 'word-count--on-target';
  })();

  return (
    <div className="chapter-editor">
      <EditorToolbar />
      <Editor
        content={initialContent}
        onChange={handleChange}
        onSave={onSave}
        wordTarget={wordTarget}
      />
      <div className="editor-status-bar">
        <span className={`word-count ${wordCountClass}`}>{statusText}</span>
      </div>
    </div>
  );
}
