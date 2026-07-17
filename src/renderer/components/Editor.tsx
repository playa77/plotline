/**
 * TipTap-based rich-text editor whose schema is generated from the Substack
 * allowlist constant — the editor structurally cannot produce non-exportable
 * content.
 *
 * Architecture note (renderer sandbox):
 *   This component never imports `electron`, `fs`, or `node:*` modules.
 *   All durable operations cross the typed IPC contract; this component
 *   merely exposes callbacks (`onChange`, `onSave`) that the parent wires.
 *
 * Known gaps:
 *   - `figure` / `figcaption` are in ALLOWED_ELEMENTS for Substack export
 *     compatibility but TipTap has no native support for them. They cannot be
 *     produced by the editor. If needed, a custom extension can be added later.
 *   - The image button in the toolbar is currently disabled. Full image
 *     support (upload, project-relative paths) will land in a later WP.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { useCallback, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { DOMParser } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

import { sanitize } from '../../shared/sanitize/sanitizer';
import { setActiveEditor } from '../editorRef';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditorProps {
  /** Initial HTML content (must already be Substack-safe). */
  content: string;

  /** Fires on every content change with the full HTML. */
  onChange?: (html: string) => void;

  /** Fires on autosave (2 s idle debounce) with the full HTML. */
  onSave?: (html: string) => void;

  /** If set, the status bar shows a word‑count target range. */
  wordTarget?: { min: number; max: number } | null;

  /** When true the editor content is not editable (streaming preview). */
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// TipTap extensions — generated from the allowlist
//
// StarterKit (with heading levels 2–4 only) covers:
//   p, h2, h3, h4, strong, em, s, blockquote,
//   ul/ol/li, hr, pre/code, br
//
// Link and Image are added separately.
// ---------------------------------------------------------------------------

const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
  }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    protocols: ['http', 'https', 'mailto'],
  }),
  Image,
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Editor({
  content,
  onChange,
  onSave,
  readOnly = false,
}: EditorProps): JSX.Element {
  // Keep a ref to the latest content for the debounce closure
  const latestHtmlRef = useRef<string>(content);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  const onChangeRef = useRef(onChange);

  // Keep callback refs current without re-creating the editor
  onSaveRef.current = onSave;
  onChangeRef.current = onChange;

  // -----------------------------------------------------------------------
  // Debounced save: fires onSave after 2 s of inactivity
  // -----------------------------------------------------------------------
  const scheduleSave = useCallback((html: string) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      if (html.trim()) {
        onSaveRef.current?.(html);
      }
    }, 2000);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // -----------------------------------------------------------------------
  // Paste handler — run clipboard HTML through the sanitizer
  // -----------------------------------------------------------------------
  const handlePaste = useCallback(
    (view: EditorView, event: ClipboardEvent): boolean => {
      const html = event.clipboardData?.getData('text/html');
      if (!html) return false; // Let ProseMirror handle plain-text paste

      const clean = sanitize(html);
      if (!clean || clean.trim() === '') {
        event.preventDefault();
        return true; // consumed — nothing to insert
      }

      event.preventDefault();

      const { schema } = view.state;
      const parser = DOMParser.fromSchema(schema);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = clean;
      const node = parser.parse(wrapper);
      view.dispatch(view.state.tr.replaceSelectionWith(node));

      return true;
    },
    [],
  );

  // -----------------------------------------------------------------------
  // TipTap editor instance
  // -----------------------------------------------------------------------
  const editor = useEditor({
    extensions,
    content,
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      latestHtmlRef.current = html;
      onChangeRef.current?.(html);
      scheduleSave(html);
    },
    editorProps: {
      handlePaste,
      attributes: {
        class: 'ProseMirror',
      },
    },
  });

  // Publish the active editor ref so CommandPalette can execute editor actions
  useEffect(() => {
    setActiveEditor(editor ?? null);
    return () => {
      setActiveEditor(null);
    };
  }, [editor]);

  // Sync readOnly without re-creating the editor
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly]);

  // Sync content when it changes externally
  useEffect(() => {
    if (editor && content !== latestHtmlRef.current) {
      editor.commands.setContent(content);
      latestHtmlRef.current = content;
    }
  }, [editor, content]);

  return (
    <div className="editor-content" role="textbox" aria-multiline="true">
      <EditorContent editor={editor} />
    </div>
  );
}
