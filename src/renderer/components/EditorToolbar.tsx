/**
 * Editor toolbar — buttons for allowlisted formatting.
 *
 * Uses TipTap's `useCurrentEditor()` hook to check active states.
 * Every button maps to an allowlisted tag only.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { useCurrentEditor } from '@tiptap/react';

export function EditorToolbar(): JSX.Element {
  const { editor } = useCurrentEditor();

  if (!editor) {
    return (
      <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
        <span className="editor-toolbar-btn" style={{ opacity: 0.35 }}>
          Loading…
        </span>
      </div>
    );
  }

  const addLink = () => {
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL:', previousUrl ?? 'https://');
    if (url === null) return; // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const addImage = () => {
    const url = window.prompt('Image URL:');
    if (!url) return;
    const alt = window.prompt('Alt text (optional):') ?? '';
    editor.chain().focus().setImage({ src: url, alt }).run();
  };

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      {/* Inline formatting */}
      <div className="editor-toolbar-group">
        <button
          type="button"
          className={`editor-toolbar-btn${editor.isActive('bold') ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (Cmd+B)"
          aria-label="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className={`editor-toolbar-btn${editor.isActive('italic') ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (Cmd+I)"
          aria-label="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className={`editor-toolbar-btn${editor.isActive('strike') ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
          aria-label="Strikethrough"
        >
          <s>S</s>
        </button>
      </div>

      {/* Headings */}
      <div className="editor-toolbar-group">
        {([2, 3, 4] as const).map((level) => (
          <button
            key={level}
            type="button"
            className={`editor-toolbar-btn editor-toolbar-btn--label${
              editor.isActive('heading', { level }) ? ' is-active' : ''
            }`}
            onClick={() =>
              editor
                .chain()
                .focus()
                .toggleHeading({ level })
                .run()
            }
            title={`Heading ${level} (H${level})`}
            aria-label={`Heading ${level}`}
          >
            H{level}
          </button>
        ))}
      </div>

      {/* Block elements */}
      <div className="editor-toolbar-group">
        <button
          type="button"
          className={`editor-toolbar-btn${editor.isActive('blockquote') ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Blockquote"
          aria-label="Blockquote"
        >
          "
        </button>
        <button
          type="button"
          className={`editor-toolbar-btn${editor.isActive('bulletList') ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
          aria-label="Bullet list"
        >
          •
        </button>
        <button
          type="button"
          className={`editor-toolbar-btn${editor.isActive('orderedList') ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Ordered list"
          aria-label="Ordered list"
        >
          1.
        </button>
      </div>

      {/* Insertions */}
      <div className="editor-toolbar-group">
        <button
          type="button"
          className={`editor-toolbar-btn${editor.isActive('link') ? ' is-active' : ''}`}
          onClick={addLink}
          title="Insert link"
          aria-label="Insert link"
        >
          Link
        </button>
        <button
          type="button"
          className="editor-toolbar-btn"
          onClick={addImage}
          disabled
          title="Insert image (coming soon)"
          aria-label="Insert image"
        >
          Img
        </button>
        <button
          type="button"
          className="editor-toolbar-btn"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
          aria-label="Horizontal rule"
        >
          —
        </button>
      </div>
    </div>
  );
}
