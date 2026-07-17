/**
 * Module-level ref to the active TipTap editor instance.
 *
 * The Editor component sets this on mount so that the CommandPalette
 * (rendered outside the TipTap EditorProvider) can execute editor actions
 * like Bold, Italic, Heading, etc.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import type { Editor } from '@tiptap/core';

let _activeEditor: Editor | null = null;

/** Set by the Editor component on mount. */
export function setActiveEditor(editor: Editor | null): void {
  _activeEditor = editor;
}

/** Returns the current active TipTap editor, or null. */
export function getActiveEditor(): Editor | null {
  return _activeEditor;
}
