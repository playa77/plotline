/**
 * OutlineWorkspace — structured, editable view of the book outline.
 *
 * Renders parts, chapters, sections, and beats with inline editing,
 * drag-and-drop reordering, and add/delete operations. Dispatches
 * OutlineMutation objects via the onMutate callback.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { useState, useCallback, useRef, type DragEvent as ReactDragEvent } from 'react';
import type { Outline, OutlineMutation, OutlineChapter, RichBlock } from '../../shared/schemas/outline';

// ── Derived types ───────────────────────────────────────────────────────────────

/** A single section as it appears within an OutlineChapter. */
type OutlineSection = OutlineChapter['sections'][number];

// ── Drag-and-drop types ─────────────────────────────────────────────────────────

interface DragPayload {
  kind: 'part' | 'chapter' | 'section';
  id: string;
  /** For chapters: the part they belong to. */
  parentPartId?: string;
  /** For sections: the chapter they belong to. */
  parentChapterId?: string;
}

interface DropIndicator {
  targetId: string;
  position: 'before' | 'after';
  kind: 'part' | 'chapter' | 'section';
  parentPartId?: string;
  parentChapterId?: string;
}

// ── Editing state types ─────────────────────────────────────────────────────────

type EditingState =
  | { kind: 'none' }
  | { kind: 'renamePart'; partId: string }
  | { kind: 'renameChapter'; chapterId: string }
  | { kind: 'renameSection'; sectionId: string }
  | { kind: 'renameBeat'; sectionId: string; beatIndex: number }
  | { kind: 'addPart' }
  | { kind: 'addChapter'; partId: string }
  | { kind: 'addSection'; chapterId: string }
  | { kind: 'addBeat'; sectionId: string }
  | { kind: 'addBeatAtIndex'; sectionId: string; atIndex: number };

type DeleteConfirmState =
  | { kind: 'none' }
  | { kind: 'part'; partId: string }
  | { kind: 'chapter'; chapterId: string }
  | { kind: 'section'; sectionId: string }
  | { kind: 'beat'; sectionId: string; beatIndex: number };

// ── Props ───────────────────────────────────────────────────────────────────────

interface OutlineWorkspaceProps {
  outline: Outline;
  onMutate?: (mutations: OutlineMutation[]) => void;
  readOnly?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

let _idCounter = 0;
function tempId(): string {
  return `tmp_${Date.now()}_${++_idCounter}`;
}

function fmtWordRange(wt: { min: number; max: number } | null): string | null {
  if (!wt) return null;
  const fmt = (n: number): string =>
    n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  return `${fmt(wt.min)}–${fmt(wt.max)}`;
}

function fmtWordNum(n: number | null): string | null {
  if (n == null) return null;
  return n >= 1000
    ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
    : n.toLocaleString();
}

/** Derive a section number from its position in the chapter and the chapter's position in its part. */
function sectionNumber(
  partIndex: number,
  chapterIndex: number,
  sectionIndex: number,
): string {
  return `${partIndex + 1}.${chapterIndex + 1}.${sectionIndex + 1}`;
}

/** Get a short label from a RichBlock for collapsed display. */
function richBlockLabel(block: RichBlock): string {
  switch (block.type) {
    case 'heading':
      return block.text;
    case 'paragraph':
      return block.text.length > 60 ? block.text.substring(0, 57) + '...' : block.text;
    case 'list':
      return block.items[0] ?? '(list)';
    case 'table':
      return block.headers.length > 0 ? `Table: ${block.headers.join(', ')}` : '(table)';
  }
}

// ── Mutation applicator ────────────────────────────────────────────────────────

/**
 * Apply a list of mutations to an Outline, producing a new Outline.
 * Mutations are applied in order. This is a reducer-like pure function
 * that clones only what's needed.
 */
function applyMutations(data: Outline, mutations: OutlineMutation[]): Outline {
  let result: Outline = structuredClone(data);

  for (const mut of mutations) {
    switch (mut.kind) {
      case 'renamePart': {
        const part = result.parts.find((p) => p.id === mut.partId);
        if (part) part.title = mut.title;
        break;
      }
      case 'renameChapter': {
        for (const part of result.parts) {
          const ch = part.chapters.find((c) => c.chapterId === mut.chapterId);
          if (ch) {
            ch.title = mut.title;
            break;
          }
        }
        break;
      }
      case 'renameSection': {
        for (const part of result.parts) {
          for (const ch of part.chapters) {
            const sec = ch.sections.find((s) => s.id === mut.sectionId);
            if (sec) {
              sec.title = mut.title;
              break;
            }
          }
        }
        break;
      }
      case 'reorderPart': {
        const idx = result.parts.findIndex((p) => p.id === mut.partId);
        if (idx === -1) break;
        const moved = result.parts[idx]!;
        result.parts.splice(idx, 1);
        const clamped = Math.max(0, Math.min(mut.newIndex, result.parts.length));
        result.parts.splice(clamped, 0, moved);
        break;
      }
      case 'reorderChapter': {
        const { chapterId, targetPartId, newIndex } = mut;
        // remove from current part
        let moved: OutlineChapter | undefined;
        for (const part of result.parts) {
          const idx = part.chapters.findIndex((c) => c.chapterId === chapterId);
          if (idx !== -1) {
            moved = part.chapters[idx]!;
            part.chapters.splice(idx, 1);
            break;
          }
        }
        if (!moved) break;
        // insert into target part
        const target = targetPartId
          ? result.parts.find((p) => p.id === targetPartId)
          : result.parts[0];
        if (target) {
          const clamped = Math.max(0, Math.min(newIndex, target.chapters.length));
          target.chapters.splice(clamped, 0, moved);
        } else {
          // if no target, put it back
          result.parts[0]?.chapters.push(moved);
        }
        break;
      }
      case 'reorderSection': {
        const { sectionId, chapterId, newIndex } = mut;
        for (const part of result.parts) {
          const ch = part.chapters.find((c) => c.chapterId === chapterId);
          if (!ch) continue;
          const idx = ch.sections.findIndex((s) => s.id === sectionId);
          if (idx === -1) break;
          const moved = ch.sections[idx]!;
          ch.sections.splice(idx, 1);
          const clamped = Math.max(0, Math.min(newIndex, ch.sections.length));
          ch.sections.splice(clamped, 0, moved);
          break;
        }
        break;
      }
      case 'deletePart': {
        result.parts = result.parts.filter((p) => p.id !== mut.partId);
        break;
      }
      case 'deleteChapter': {
        for (const part of result.parts) {
          part.chapters = part.chapters.filter((c) => c.chapterId !== mut.chapterId);
        }
        break;
      }
      case 'deleteSection': {
        for (const part of result.parts) {
          for (const ch of part.chapters) {
            ch.sections = ch.sections.filter((s) => s.id !== mut.sectionId);
          }
        }
        break;
      }
      case 'addPart': {
        result.parts.push({
          id: mut.part.id,
          title: mut.part.title,
          chapters: [] as OutlineChapter[],
        });
        break;
      }
      case 'addChapter': {
        const { chapter, partId } = mut;
        const target = partId
          ? result.parts.find((p) => p.id === partId)
          : result.parts[0];
        if (target) {
          target.chapters.push({
            chapterId: chapter.chapterId,
            title: chapter.title,
            wordTarget: chapter.wordTarget,
            sections: [],
          });
        }
        break;
      }
      case 'addSection': {
        const { section, chapterId } = mut;
        for (const part of result.parts) {
          const ch = part.chapters.find((c) => c.chapterId === chapterId);
          if (ch) {
            ch.sections.push({ ...section });
            break;
          }
        }
        break;
      }
      case 'updateBeat': {
        const { sectionId, beatIndex, newText } = mut;
        for (const part of result.parts) {
          for (const ch of part.chapters) {
            const sec = ch.sections.find((s) => s.id === sectionId);
            if (sec && beatIndex >= 0 && beatIndex < sec.beats.length) {
              sec.beats[beatIndex] = newText;
              break;
            }
          }
        }
        break;
      }
      case 'addBeat': {
        const { sectionId, text, atIndex } = mut;
        for (const part of result.parts) {
          for (const ch of part.chapters) {
            const sec = ch.sections.find((s) => s.id === sectionId);
            if (sec) {
              if (atIndex !== undefined && atIndex >= 0 && atIndex <= sec.beats.length) {
                sec.beats.splice(atIndex, 0, text);
              } else {
                sec.beats.push(text);
              }
              break;
            }
          }
        }
        break;
      }
      case 'removeBeat': {
        const { sectionId, beatIndex } = mut;
        for (const part of result.parts) {
          for (const ch of part.chapters) {
            const sec = ch.sections.find((s) => s.id === sectionId);
            if (sec && beatIndex >= 0 && beatIndex < sec.beats.length) {
              sec.beats.splice(beatIndex, 1);
              break;
            }
          }
        }
        break;
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

// ── InlineInput ────────────────────────────────────────────────────────────────

interface InlineInputProps {
  initialValue: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

function InlineInput({
  initialValue,
  placeholder,
  className = '',
  autoFocus = true,
  onConfirm,
  onCancel,
}: InlineInputProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm(inputRef.current?.value ?? initialValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    // Confirm on blur — treat blur as submit
    onConfirm(inputRef.current?.value ?? initialValue);
  };

  return (
    <input
      ref={inputRef}
      className={`outline-inline-input ${className}`}
      type="text"
      defaultValue={initialValue}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      // Prevent the parent's drag/drop from interfering
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
}

// ── DeleteConfirm ─────────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  itemLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirm({ itemLabel, onConfirm, onCancel }: DeleteConfirmProps): JSX.Element {
  return (
    <div className="outline-delete-confirm">
      <span className="outline-delete-confirm__text">Delete {itemLabel}?</span>
      <button
        type="button"
        className="outline-delete-confirm__btn outline-delete-confirm__btn--confirm"
        onClick={onConfirm}
      >
        Yes
      </button>
      <button
        type="button"
        className="outline-delete-confirm__btn outline-delete-confirm__btn--cancel"
        onClick={onCancel}
      >
        No
      </button>
    </div>
  );
}

// ── StageDots ─────────────────────────────────────────────────────────────────

function StageDots(): JSX.Element {
  return (
    <span className="outline-chapter__stage-dots" aria-label="Stage indicators">
      <span className="outline-stage-dot" title="Expand" />
      <span className="outline-stage-dot" title="Write" />
    </span>
  );
}

// ── WordTarget ────────────────────────────────────────────────────────────────

function WordTarget({
  className,
  label,
}: {
  className: string;
  label: string;
}): JSX.Element {
  return <span className={className}>{label}</span>;
}

// ── RichBlockPreview ──────────────────────────────────────────────────────────

function RichBlockPreview({ block }: { block: RichBlock }): JSX.Element {
  let content: string;
  let extraClass = '';
  switch (block.type) {
    case 'heading':
      content = block.text;
      extraClass = ' outline-rich-block--heading';
      break;
    case 'paragraph':
      content = block.text;
      break;
    case 'list':
      content = block.items.join(' · ');
      break;
    case 'table':
      content = `[Table] ${block.headers.join(', ')}`;
      break;
  }
  return (
    <div className={`outline-rich-block${extraClass}`} title={content}>
      {content}
    </div>
  );
}

// ── BeatItem ──────────────────────────────────────────────────────────────────

interface BeatItemProps {
  text: string;
  sectionId: string;
  beatIndex: number;
  readOnly: boolean;
  isEditing: boolean;
  isDeleting: boolean;
  onEdit: () => void;
  onConfirmEdit: (newText: string) => void;
  onCancelEdit: () => void;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}

function BeatItem({
  text,
  sectionId,
  beatIndex,
  readOnly,
  isEditing,
  isDeleting,
  onEdit,
  onConfirmEdit,
  onCancelEdit,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: BeatItemProps): JSX.Element {
  if (isEditing) {
    return (
      <div className="outline-beat">
        <span className="outline-beat__bullet">•</span>
        <InlineInput
          initialValue={text}
          className="outline-inline-input--serif outline-inline-input--wide"
          onConfirm={onConfirmEdit}
          onCancel={onCancelEdit}
        />
      </div>
    );
  }

  if (isDeleting) {
    return (
      <div className="outline-beat">
        <span className="outline-beat__bullet">•</span>
        <DeleteConfirm
          itemLabel="beat"
          onConfirm={onDeleteConfirm}
          onCancel={onDeleteCancel}
        />
      </div>
    );
  }

  return (
    <div className="outline-beat" onClick={readOnly ? undefined : onEdit}>
      <span className="outline-beat__bullet">•</span>
      <span className="outline-beat__text">{text || <>&nbsp;</>}</span>
      {!readOnly && (
        <button
          type="button"
          className="outline-beat__delete"
          aria-label="Delete beat"
          title="Delete beat"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteRequest();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── SectionRow ────────────────────────────────────────────────────────────────

interface SectionRowProps {
  section: OutlineSection;
  partIndex: number;
  chapterIndex: number;
  sectionIndex: number;
  chapterId: string;
  readOnly: boolean;
  editingState: EditingState;
  deleteConfirm: DeleteConfirmState;
  dragState: DragPayload | null;
  dropIndicator: DropIndicator | null;
  // Handlers
  onToggleEdit: (state: EditingState) => void;
  onConfirmEdit: (value: string) => void;
  onCancelEdit: () => void;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onBeatEdit: (sectionId: string, beatIndex: number) => void;
  onBeatConfirm: (sectionId: string, beatIndex: number, newText: string) => void;
  onBeatCancel: () => void;
  onBeatDeleteRequest: (sectionId: string, beatIndex: number) => void;
  onBeatDeleteConfirm: (sectionId: string, beatIndex: number) => void;
  onBeatDeleteCancel: () => void;
  onDragStart: (payload: DragPayload) => void;
  onDragOver: (e: ReactDragEvent, targetId: string, kind: 'section', parentChapterId: string) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  // Add beat
  onAddBeat: (sectionId: string) => void;
  onConfirmAddBeat: (sectionId: string, value: string, atIndex?: number) => void;
  onCancelAdd: () => void;
}

function SectionRow({
  section,
  partIndex,
  chapterIndex,
  sectionIndex,
  chapterId,
  readOnly,
  editingState,
  deleteConfirm,
  dragState,
  dropIndicator,
  onToggleEdit,
  onConfirmEdit,
  onCancelEdit,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  onBeatEdit,
  onBeatConfirm,
  onBeatCancel,
  onBeatDeleteRequest,
  onBeatDeleteConfirm,
  onBeatDeleteCancel,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onAddBeat,
  onConfirmAddBeat,
  onCancelAdd,
}: SectionRowProps): JSX.Element {
  const isDragging = dragState?.kind === 'section' && dragState.id === section.id;
  const isEditing =
    editingState.kind === 'renameSection' && editingState.sectionId === section.id;
  const isDeleting =
    deleteConfirm.kind === 'section' && deleteConfirm.sectionId === section.id;
  const showDropBefore =
    dropIndicator?.kind === 'section' &&
    dropIndicator.targetId === section.id &&
    dropIndicator.position === 'before';
  const showDropAfter =
    dropIndicator?.kind === 'section' &&
    dropIndicator.targetId === section.id &&
    dropIndicator.position === 'after';

  const wordTarget = fmtWordNum(section.wordTarget);

  return (
    <div className="outline-section">
      {showDropBefore && <div className="outline-drop-indicator" />}
      <div
        className={`outline-section__row${isDragging ? ' outline-section__row--dragging' : ''}`}
        draggable={!readOnly && !isEditing}
        onDragStart={(e) => {
          if (readOnly || isEditing) return;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', section.id);
          onDragStart({ kind: 'section', id: section.id, parentChapterId: chapterId });
        }}
        onDragOver={(e) => {
          if (readOnly) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDragOver(e, section.id, 'section', chapterId);
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          onDrop();
        }}
        onDragEnd={onDragEnd}
      >
        {/* Drag handle */}
        {!readOnly && (
          <span className="outline-section__drag" aria-hidden="true">
            {'\u22EE\u22EE'}
          </span>
        )}

        {/* Section number */}
        <span className="outline-section__number">
          {section.number || sectionNumber(partIndex, chapterIndex, sectionIndex)}
        </span>

        {/* Section title */}
        {isEditing ? (
          <InlineInput
            initialValue={section.title}
            className="outline-inline-input--serif"
            onConfirm={(val) => onConfirmEdit(val)}
            onCancel={onCancelEdit}
          />
        ) : isDeleting ? (
          <DeleteConfirm
            itemLabel={`section "${section.title}"`}
            onConfirm={onDeleteConfirm}
            onCancel={onDeleteCancel}
          />
        ) : (
          <span
            className="outline-section__title"
            onDoubleClick={
              readOnly
                ? undefined
                : () => onToggleEdit({ kind: 'renameSection', sectionId: section.id })
            }
          >
            {section.title}
          </span>
        )}

        {/* Word target */}
        {wordTarget && (
          <WordTarget className="outline-section__word-target" label={wordTarget} />
        )}

        {/* Actions */}
        {!readOnly && !isEditing && !isDeleting && (
          <span className="outline-section__actions">
            <button
              type="button"
              className="outline-add-btn"
              aria-label="Add beat"
              title="Add beat"
              onClick={(e) => {
                e.stopPropagation();
                onAddBeat(section.id);
              }}
            >
              +
            </button>
            <button
              type="button"
              className="outline-delete-btn"
              aria-label="Delete section"
              title="Delete section"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteRequest();
              }}
            >
              ×
            </button>
          </span>
        )}
      </div>

      {/* Add beat inline (at start, if editing) */}
      {editingState.kind === 'addBeat' && editingState.sectionId === section.id && (
        <div className="outline-beats__add-row">
          <span className="outline-beat__bullet">•</span>
          <InlineInput
            initialValue=""
            placeholder="New beat..."
            className="outline-inline-input--serif outline-inline-input--wide"
            onConfirm={(val) => {
              if (val.trim()) onConfirmAddBeat(section.id, val.trim());
              else onCancelAdd();
            }}
            onCancel={onCancelAdd}
          />
        </div>
      )}

      {/* Beats */}
      {section.beats.length > 0 && !isDeleting && (
        <div className="outline-section__beats">
          {section.beats.map((beat, bi) => (
            <BeatItem
              key={`${section.id}-beat-${bi}`}
              text={beat}
              sectionId={section.id}
              beatIndex={bi}
              readOnly={readOnly}
              isEditing={
                editingState.kind === 'renameBeat' &&
                editingState.beatIndex === bi &&
                editingState.sectionId === section.id
              }
              isDeleting={
                deleteConfirm.kind === 'beat' &&
                deleteConfirm.beatIndex === bi &&
                deleteConfirm.sectionId === section.id
              }
              onEdit={() => onBeatEdit(section.id, bi)}
              onConfirmEdit={(newText) =>
                onBeatConfirm(section.id, bi, newText)
              }
              onCancelEdit={onBeatCancel}
              onDeleteRequest={() =>
                onBeatDeleteRequest(section.id, bi)
              }
              onDeleteConfirm={() =>
                onBeatDeleteConfirm(section.id, bi)
              }
              onDeleteCancel={onBeatDeleteCancel}
            />
          ))}
        </div>
      )}

      {/* Add beat inline (at end) */}
      {editingState.kind === 'addBeatAtIndex' &&
        editingState.sectionId === section.id && (
        <div className="outline-beats__add-row">
          <span className="outline-beat__bullet">•</span>
          <InlineInput
            initialValue=""
            placeholder="New beat..."
            className="outline-inline-input--serif outline-inline-input--wide"
            onConfirm={(val) => {
              if (val.trim()) {
                const atIdx =
                  'atIndex' in editingState ? editingState.atIndex : undefined;
                onConfirmAddBeat(section.id, val.trim(), atIdx);
              } else {
                onCancelAdd();
              }
            }}
            onCancel={onCancelAdd}
          />
        </div>
      )}

      {showDropAfter && <div className="outline-drop-indicator" />}
    </div>
  );
}

// ── ChapterRow ────────────────────────────────────────────────────────────────

interface ChapterRowProps {
  chapter: OutlineChapter;
  partId: string;
  partIndex: number;
  chapterIndex: number;
  readOnly: boolean;
  collapsed: boolean;
  editingState: EditingState;
  deleteConfirm: DeleteConfirmState;
  dragState: DragPayload | null;
  dropIndicator: DropIndicator | null;
  // Handlers
  onToggleCollapse: () => void;
  onToggleEdit: (state: EditingState) => void;
  onConfirmEdit: (value: string) => void;
  onCancelEdit: () => void;
  onDeleteRequest: (state: DeleteConfirmState) => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onAddSection: (chapterId: string) => void;
  onConfirmAddSection: (chapterId: string, value: string) => void;
  onCancelAdd: () => void;
  onDragStart: (payload: DragPayload) => void;
  onDragOver: (
    e: ReactDragEvent,
    targetId: string,
    kind: 'chapter' | 'section',
    parentPartId?: string,
    parentChapterId?: string,
  ) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  // Section handlers (passed through)
  onSectionToggleEdit: (state: EditingState) => void;
  onSectionConfirmEdit: (sectionId: string, value: string) => void;
  onSectionDeleteRequest: (sectionId: string) => void;
  onSectionDeleteConfirm: () => void;
  onBeatEdit: (sectionId: string, beatIndex: number) => void;
  onBeatConfirm: (sectionId: string, beatIndex: number, newText: string) => void;
  onBeatCancel: () => void;
  onBeatDeleteRequest: (sectionId: string, beatIndex: number) => void;
  onBeatDeleteConfirm: (sectionId: string, beatIndex: number) => void;
  onBeatDeleteCancel: () => void;
  onAddBeat: (sectionId: string) => void;
  onConfirmAddBeat: (sectionId: string, value: string, atIndex?: number) => void;
}

function ChapterRow({
  chapter,
  partId,
  partIndex,
  chapterIndex,
  readOnly,
  collapsed,
  editingState,
  deleteConfirm,
  dragState,
  dropIndicator,
  onToggleCollapse,
  onToggleEdit,
  onConfirmEdit,
  onCancelEdit,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  onAddSection,
  onConfirmAddSection,
  onCancelAdd,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onSectionToggleEdit,
  onSectionConfirmEdit,
  onSectionDeleteRequest,
  onSectionDeleteConfirm,
  onBeatEdit,
  onBeatConfirm,
  onBeatCancel,
  onBeatDeleteRequest,
  onBeatDeleteConfirm,
  onBeatDeleteCancel,
  onAddBeat,
  onConfirmAddBeat,
}: ChapterRowProps): JSX.Element {
  const isDragging = dragState?.kind === 'chapter' && dragState.id === chapter.chapterId;
  const isEditing =
    editingState.kind === 'renameChapter' &&
    editingState.chapterId === chapter.chapterId;
  const isDeleting =
    deleteConfirm.kind === 'chapter' &&
    deleteConfirm.chapterId === chapter.chapterId;
  const showDropBefore =
    dropIndicator?.kind === 'chapter' &&
    dropIndicator.targetId === chapter.chapterId &&
    dropIndicator.position === 'before';
  const showDropAfter =
    dropIndicator?.kind === 'chapter' &&
    dropIndicator.targetId === chapter.chapterId &&
    dropIndicator.position === 'after';
  const isAddingSection =
    editingState.kind === 'addSection' && editingState.chapterId === chapter.chapterId;

  const wordTarget = fmtWordRange(chapter.wordTarget);

  return (
    <div className="outline-chapter">
      {showDropBefore && <div className="outline-drop-indicator" />}
      <div
        className={`outline-chapter__row${isDragging ? ' outline-chapter__row--dragging' : ''}`}
        draggable={!readOnly && !isEditing}
        onDragStart={(e) => {
          if (readOnly || isEditing) return;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', chapter.chapterId);
          onDragStart({ kind: 'chapter', id: chapter.chapterId, parentPartId: partId });
        }}
        onDragOver={(e) => {
          if (readOnly) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDragOver(e, chapter.chapterId, 'chapter', partId);
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          onDrop();
        }}
        onDragEnd={onDragEnd}
      >
        {/* Drag handle */}
        {!readOnly && (
          <span className="outline-chapter__drag" aria-hidden="true">
            {'\u22EE\u22EE'}
          </span>
        )}

        {/* Expand/collapse toggle */}
        <span
          className={`outline-chapter__toggle${collapsed ? ' outline-chapter__toggle--collapsed' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          role="button"
          tabIndex={-1}
          aria-label={collapsed ? 'Expand sections' : 'Collapse sections'}
        >
          {'\u25BE'}
        </span>

        {/* Title */}
        {isEditing ? (
          <InlineInput
            initialValue={chapter.title}
            onConfirm={(val) => onConfirmEdit(val)}
            onCancel={onCancelEdit}
          />
        ) : isDeleting ? (
          <DeleteConfirm
            itemLabel={`chapter "${chapter.title}"`}
            onConfirm={onDeleteConfirm}
            onCancel={onDeleteCancel}
          />
        ) : (
          <span
            className="outline-chapter__title"
            onDoubleClick={
              readOnly
                ? undefined
                : () =>
                    onToggleEdit({
                      kind: 'renameChapter',
                      chapterId: chapter.chapterId,
                    })
            }
          >
            {chapter.title}
          </span>
        )}

        {/* Stage dots */}
        <StageDots />

        {/* Word target */}
        {wordTarget && (
          <WordTarget
            className="outline-chapter__word-target"
            label={wordTarget}
          />
        )}

        {/* Actions */}
        {!readOnly && !isEditing && !isDeleting && (
          <span className="outline-chapter__actions">
            <button
              type="button"
              className="outline-add-btn"
              aria-label="Add section"
              title="Add section"
              onClick={(e) => {
                e.stopPropagation();
                onAddSection(chapter.chapterId);
              }}
            >
              +
            </button>
            <button
              type="button"
              className="outline-delete-btn"
              aria-label="Delete chapter"
              title="Delete chapter"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteRequest({ kind: 'chapter', chapterId: chapter.chapterId });
              }}
            >
              ×
            </button>
          </span>
        )}
      </div>

      {/* Inline add section input */}
      {isAddingSection && (
        <div className="outline-section__add-row">
          <InlineInput
            initialValue=""
            placeholder="Section title..."
            onConfirm={(val) => {
              if (val.trim()) onConfirmAddSection(chapter.chapterId, val.trim());
              else onCancelAdd();
            }}
            onCancel={onCancelAdd}
          />
        </div>
      )}

      {/* Sections */}
      {!collapsed && !isDeleting && (
        <div className="outline-chapter__sections">
          {chapter.sections.map((section, si) => (
            <SectionRow
              key={section.id}
              section={section}
              partIndex={partIndex}
              chapterIndex={chapterIndex}
              sectionIndex={si}
              chapterId={chapter.chapterId}
              readOnly={readOnly}
              editingState={editingState}
              deleteConfirm={deleteConfirm}
              dragState={dragState}
              dropIndicator={dropIndicator}
              onToggleEdit={onSectionToggleEdit}
              onConfirmEdit={(val) =>
                onSectionConfirmEdit(section.id, val)
              }
              onCancelEdit={onCancelEdit}
              onDeleteRequest={() => onSectionDeleteRequest(section.id)}
              onDeleteConfirm={onSectionDeleteConfirm}
              onDeleteCancel={onDeleteCancel}
              onBeatEdit={onBeatEdit}
              onBeatConfirm={onBeatConfirm}
              onBeatCancel={onBeatCancel}
              onBeatDeleteRequest={onBeatDeleteRequest}
              onBeatDeleteConfirm={onBeatDeleteConfirm}
              onBeatDeleteCancel={onBeatDeleteCancel}
              onDragStart={onDragStart}
              onDragOver={(e, targetId, kind, parentChapterId) =>
                onDragOver(e, targetId, kind, partId, parentChapterId)
              }
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onAddBeat={onAddBeat}
              onConfirmAddBeat={onConfirmAddBeat}
              onCancelAdd={onCancelAdd}
            />
          ))}
        </div>
      )}

      {showDropAfter && <div className="outline-drop-indicator" />}
    </div>
  );
}

// ── PartSection ───────────────────────────────────────────────────────────────

interface PartSectionProps {
  part: Outline['parts'][number];
  partIndex: number;
  readOnly: boolean;
  collapsed: boolean;
  collapsedChapters: Set<string>;
  editingState: EditingState;
  deleteConfirm: DeleteConfirmState;
  dragState: DragPayload | null;
  dropIndicator: DropIndicator | null;
  // Part-level handlers
  onToggleCollapse: () => void;
  onToggleEdit: (state: EditingState) => void;
  onConfirmRename: (value: string) => void;
  onCancelEdit: () => void;
  onDeleteRequest: (state: DeleteConfirmState) => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onAddChapter: (partId: string) => void;
  onConfirmAddChapter: (partId: string, value: string) => void;
  onCancelAdd: () => void;
  onDragStart: (payload: DragPayload) => void;
  onDragOver: (
    e: ReactDragEvent,
    targetId: string,
    kind: 'part' | 'chapter' | 'section',
    parentPartId?: string,
    parentChapterId?: string,
  ) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  // Chapter-level handlers
  onChapterToggleCollapse: (chapterId: string) => void;
  onChapterToggleEdit: (state: EditingState) => void;
  onChapterConfirmEdit: (chapterId: string, value: string) => void;
  onChapterDeleteRequest: (chapterId: string) => void;
  onChapterDeleteConfirm: () => void;
  onAddSection: (chapterId: string) => void;
  onConfirmAddSection: (chapterId: string, value: string) => void;
  // Section-level handlers
  onSectionToggleEdit: (state: EditingState) => void;
  onSectionConfirmEdit: (sectionId: string, value: string) => void;
  onSectionDeleteRequest: (sectionId: string) => void;
  onSectionDeleteConfirm: () => void;
  // Beat-level handlers
  onBeatEdit: (sectionId: string, beatIndex: number) => void;
  onBeatConfirm: (sectionId: string, beatIndex: number, newText: string) => void;
  onBeatCancel: () => void;
  onBeatDeleteRequest: (sectionId: string, beatIndex: number) => void;
  onBeatDeleteConfirm: (sectionId: string, beatIndex: number) => void;
  onBeatDeleteCancel: () => void;
  onAddBeat: (sectionId: string) => void;
  onConfirmAddBeat: (sectionId: string, value: string, atIndex?: number) => void;
}

function PartSection({
  part,
  partIndex,
  readOnly,
  collapsed,
  collapsedChapters,
  editingState,
  deleteConfirm,
  dragState,
  dropIndicator,
  onToggleCollapse,
  onToggleEdit,
  onConfirmRename,
  onCancelEdit,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  onAddChapter,
  onConfirmAddChapter,
  onCancelAdd,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onChapterToggleCollapse,
  onChapterToggleEdit,
  onChapterConfirmEdit,
  onChapterDeleteRequest,
  onChapterDeleteConfirm,
  onAddSection,
  onConfirmAddSection,
  onSectionToggleEdit,
  onSectionConfirmEdit,
  onSectionDeleteRequest,
  onSectionDeleteConfirm,
  onBeatEdit,
  onBeatConfirm,
  onBeatCancel,
  onBeatDeleteRequest,
  onBeatDeleteConfirm,
  onBeatDeleteCancel,
  onAddBeat,
  onConfirmAddBeat,
}: PartSectionProps): JSX.Element {
  const isDragging = dragState?.kind === 'part' && dragState.id === part.id;
  const isEditing =
    editingState.kind === 'renamePart' && editingState.partId === part.id;
  const isDeleting =
    deleteConfirm.kind === 'part' && deleteConfirm.partId === part.id;
  const isAddingChapter =
    editingState.kind === 'addChapter' && editingState.partId === part.id;

  const showDropBefore =
    dropIndicator?.kind === 'part' &&
    dropIndicator.targetId === part.id &&
    dropIndicator.position === 'before';
  const showDropAfter =
    dropIndicator?.kind === 'part' &&
    dropIndicator.targetId === part.id &&
    dropIndicator.position === 'after';

  return (
    <div className="outline-part">
      {showDropBefore && <div className="outline-drop-indicator" />}
      <div
        className={`outline-part__header${isDragging ? ' outline-part__header--dragging' : ''}`}
        draggable={!readOnly && !isEditing}
        onDragStart={(e) => {
          if (readOnly || isEditing) return;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', part.id);
          onDragStart({ kind: 'part', id: part.id });
        }}
        onDragOver={(e) => {
          if (readOnly) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDragOver(e, part.id, 'part');
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          onDrop();
        }}
        onDragEnd={onDragEnd}
      >
        {/* Drag handle */}
        {!readOnly && (
          <span className="outline-part__drag" aria-hidden="true">
            {'\u22EE\u22EE'}
          </span>
        )}

        {/* Expand/collapse toggle */}
        <span
          className={`outline-part__toggle${collapsed ? ' outline-part__toggle--collapsed' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          role="button"
          tabIndex={-1}
          aria-label={collapsed ? 'Expand part' : 'Collapse part'}
        >
          {'\u25BE'}
        </span>

        {/* Title */}
        {isEditing ? (
          <InlineInput
            initialValue={part.title}
            onConfirm={(val) => onConfirmRename(val)}
            onCancel={onCancelEdit}
          />
        ) : isDeleting ? (
          <DeleteConfirm
            itemLabel={`part "${part.title}"`}
            onConfirm={onDeleteConfirm}
            onCancel={onDeleteCancel}
          />
        ) : (
          <span
            className="outline-part__title"
            onDoubleClick={
              readOnly
                ? undefined
                : () => onToggleEdit({ kind: 'renamePart', partId: part.id })
            }
          >
            {part.title}
          </span>
        )}

        {/* Actions */}
        {!readOnly && !isEditing && !isDeleting && (
          <span className="outline-part__actions">
            <button
              type="button"
              className="outline-add-btn"
              aria-label="Add chapter"
              title="Add chapter"
              onClick={(e) => {
                e.stopPropagation();
                onAddChapter(part.id);
              }}
            >
              +
            </button>
            <button
              type="button"
              className="outline-delete-btn"
              aria-label="Delete part"
              title="Delete part"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteRequest({ kind: 'part', partId: part.id });
              }}
            >
              ×
            </button>
          </span>
        )}
      </div>

      {/* Inline add chapter input */}
      {isAddingChapter && (
        <div className="outline-chapter__add-row">
          <InlineInput
            initialValue=""
            placeholder="Chapter title..."
            onConfirm={(val) => {
              if (val.trim()) onConfirmAddChapter(part.id, val.trim());
              else onCancelAdd();
            }}
            onCancel={onCancelAdd}
          />
        </div>
      )}

      {/* Chapters */}
      {!collapsed && !isDeleting && (
        <div className="outline-part__chapters">
          {part.chapters.map((chapter, ci) => (
            <ChapterRow
              key={chapter.chapterId}
              chapter={chapter}
              partId={part.id}
              partIndex={partIndex}
              chapterIndex={ci}
              readOnly={readOnly}
              collapsed={collapsedChapters.has(chapter.chapterId)}
              editingState={editingState}
              deleteConfirm={deleteConfirm}
              dragState={dragState}
              dropIndicator={dropIndicator}
              onToggleCollapse={() => onChapterToggleCollapse(chapter.chapterId)}
              onToggleEdit={onChapterToggleEdit}
              onConfirmEdit={(val) =>
                onChapterConfirmEdit(chapter.chapterId, val)
              }
              onCancelEdit={onCancelEdit}
              onDeleteRequest={(state) =>
                onChapterDeleteRequest(chapter.chapterId)
              }
              onDeleteConfirm={onChapterDeleteConfirm}
              onDeleteCancel={onDeleteCancel}
              onAddSection={onAddSection}
              onConfirmAddSection={onConfirmAddSection}
              onCancelAdd={onCancelAdd}
              onDragStart={onDragStart}
              onDragOver={(e, targetId, kind, parentPartId) =>
                onDragOver(e, targetId, kind, parentPartId)
              }
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onSectionToggleEdit={onSectionToggleEdit}
              onSectionConfirmEdit={onSectionConfirmEdit}
              onSectionDeleteRequest={onSectionDeleteRequest}
              onSectionDeleteConfirm={onSectionDeleteConfirm}
              onBeatEdit={onBeatEdit}
              onBeatConfirm={onBeatConfirm}
              onBeatCancel={onBeatCancel}
              onBeatDeleteRequest={onBeatDeleteRequest}
              onBeatDeleteConfirm={onBeatDeleteConfirm}
              onBeatDeleteCancel={onBeatDeleteCancel}
              onAddBeat={onAddBeat}
              onConfirmAddBeat={onConfirmAddBeat}
            />
          ))}
        </div>
      )}

      {showDropAfter && <div className="outline-drop-indicator" />}
    </div>
  );
}

// ── CollapsibleSection (for front/back matter) ────────────────────────────────

interface CollapsibleSectionProps {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  collapsed,
  onToggle,
  children,
}: CollapsibleSectionProps): JSX.Element {
  return (
    <div className="outline-collapsible">
      <div
        className="outline-collapsible__header"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span
          className={`outline-collapsible__toggle${collapsed ? ' outline-collapsible__toggle--collapsed' : ''}`}
          aria-hidden="true"
        >
          {'\u25BE'}
        </span>
        <span>{title}</span>
      </div>
      {!collapsed && (
        <div className="outline-collapsible__content">{children}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════════

export function OutlineWorkspace({
  outline,
  onMutate,
  readOnly = false,
}: OutlineWorkspaceProps): JSX.Element {
  // ── Local state ────────────────────────────────────────────────────────────

  const [data, setData] = useState<Outline>(structuredClone(outline));

  // Collapse state
  const [collapsedParts, setCollapsedParts] = useState<Set<string>>(new Set());
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(new Set());
  const [frontMatterCollapsed, setFrontMatterCollapsed] = useState(true);
  const [backMatterCollapsed, setBackMatterCollapsed] = useState(true);

  // Editing state
  const [editing, setEditing] = useState<EditingState>({ kind: 'none' });
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({ kind: 'none' });

  // Drag-and-drop state
  const dragPayloadRef = useRef<DragPayload | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);

  // ── Helper: dispatch mutations ──────────────────────────────────────────────

  const dispatch = useCallback(
    (mutations: OutlineMutation[]) => {
      setData((prev) => applyMutations(prev, mutations));
      console.log('[OutlineWorkspace] mutations:', mutations);
      onMutate?.(mutations);
    },
    [onMutate],
  );

  // ── Expand/collapse ────────────────────────────────────────────────────────

  const togglePart = useCallback((partId: string) => {
    setCollapsedParts((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  }, []);

  const toggleChapter = useCallback((chapterId: string) => {
    setCollapsedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }, []);

  // ── Edit handlers ──────────────────────────────────────────────────────────

  const startEditing = useCallback((state: EditingState) => {
    setDeleteConfirm({ kind: 'none' });
    setEditing(state);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditing({ kind: 'none' });
  }, []);

  const confirmRenamePart = useCallback(
    (partId: string, value: string) => {
      if (value.trim()) {
        dispatch([{ kind: 'renamePart', partId, title: value.trim() }]);
      }
      cancelEditing();
    },
    [dispatch, cancelEditing],
  );

  const confirmRenameChapter = useCallback(
    (chapterId: string, value: string) => {
      if (value.trim()) {
        dispatch([{ kind: 'renameChapter', chapterId, title: value.trim() }]);
      }
      cancelEditing();
    },
    [dispatch, cancelEditing],
  );

  const confirmRenameSection = useCallback(
    (sectionId: string, value: string) => {
      if (value.trim()) {
        dispatch([{ kind: 'renameSection', sectionId, title: value.trim() }]);
      }
      cancelEditing();
    },
    [dispatch, cancelEditing],
  );

  const confirmRenameBeat = useCallback(
    (sectionId: string, beatIndex: number, value: string) => {
      if (value.trim()) {
        dispatch([
          { kind: 'updateBeat', sectionId, beatIndex, newText: value.trim() },
        ]);
      }
      cancelEditing();
    },
    [dispatch, cancelEditing],
  );

  // ── Add handlers ───────────────────────────────────────────────────────────

  const handleAddChapter = useCallback(
    (partId: string, value: string) => {
      if (value.trim()) {
        dispatch([
          {
            kind: 'addChapter',
            chapter: {
              chapterId: tempId(),
              title: value.trim(),
              wordTarget: null,
              sections: [],
            },
            partId,
          },
        ]);
      }
      cancelEditing();
    },
    [dispatch, cancelEditing],
  );

  const handleAddSection = useCallback(
    (chapterId: string, value: string) => {
      if (value.trim()) {
        // Find chapter to determine section number
        let partIdx = 0;
        let chIdx = 0;
        let secIdx = 0;
        for (const part of data.parts) {
          chIdx = part.chapters.findIndex((c) => c.chapterId === chapterId);
          if (chIdx !== -1) {
            partIdx = data.parts.indexOf(part);
            const chapter = part.chapters[chIdx];
            if (chapter) secIdx = chapter.sections.length;
            break;
          }
        }
        const number = sectionNumber(partIdx, chIdx, secIdx);
        dispatch([
          {
            kind: 'addSection',
            section: {
              id: tempId(),
              number,
              title: value.trim(),
              wordTarget: null,
              beats: [],
            },
            chapterId,
          },
        ]);
      }
      cancelEditing();
    },
    [dispatch, cancelEditing, data],
  );

  const handleAddPart = useCallback(
    (value: string) => {
      if (value.trim()) {
        const partNum = data.parts.length + 1;
        dispatch([
          {
            kind: 'addPart',
            part: {
              id: tempId(),
              title: `Part ${partNum}: ${value.trim()}`,
              chapters: [],
            },
          },
        ]);
      }
      cancelEditing();
    },
    [dispatch, cancelEditing, data.parts.length],
  );

  const handleAddBeat = useCallback(
    (sectionId: string, value: string, atIndex?: number) => {
      if (value.trim()) {
        dispatch([
          { kind: 'addBeat', sectionId, text: value.trim(), atIndex },
        ]);
      }
      cancelEditing();
    },
    [dispatch, cancelEditing],
  );

  // ── Delete handlers ────────────────────────────────────────────────────────

  const requestDelete = useCallback(
    (state: DeleteConfirmState) => {
      setEditing({ kind: 'none' });
      setDeleteConfirm(state);
    },
    [],
  );

  const cancelDelete = useCallback(() => {
    setDeleteConfirm({ kind: 'none' });
  }, []);

  const confirmDelete = useCallback(() => {
    const active = deleteConfirm;
    setDeleteConfirm({ kind: 'none' });

    switch (active.kind) {
      case 'none':
        return;
      case 'part':
        dispatch([{ kind: 'deletePart', partId: active.partId }]);
        break;
      case 'chapter':
        dispatch([{ kind: 'deleteChapter', chapterId: active.chapterId }]);
        break;
      case 'section':
        dispatch([{ kind: 'deleteSection', sectionId: active.sectionId }]);
        break;
      case 'beat':
        dispatch([
          {
            kind: 'removeBeat',
            sectionId: active.sectionId,
            beatIndex: active.beatIndex,
          },
        ]);
        break;
    }
  }, [deleteConfirm, dispatch]);

  // ── Drag-and-drop handlers ─────────────────────────────────────────────────

  const handleDragStart = useCallback((payload: DragPayload) => {
    dragPayloadRef.current = payload;
    setDropIndicator(null);
  }, []);

  const handleDragOver = useCallback(
    (
      e: ReactDragEvent,
      targetId: string,
      kind: 'part' | 'chapter' | 'section',
      parentPartId?: string,
      parentChapterId?: string,
    ) => {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const position: 'before' | 'after' = e.clientY < midY ? 'before' : 'after';

      // Avoid self-drop indicators
      const payload = dragPayloadRef.current;
      if (payload && payload.kind === kind && payload.id === targetId) {
        setDropIndicator(null);
        return;
      }

      setDropIndicator({ targetId, position, kind, parentPartId, parentChapterId });
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDropIndicator(null);
  }, []);

  const handleDrop = useCallback(() => {
    const payload = dragPayloadRef.current;
    const indicator = dropIndicator;
    dragPayloadRef.current = null;
    setDropIndicator(null);

    if (!payload || !indicator || payload.id === indicator.targetId) return;

    // Compute the new index based on the current data
    switch (indicator.kind) {
      case 'part': {
        const idx = data.parts.findIndex((p) => p.id === indicator.targetId);
        const newIndex = indicator.position === 'before' ? idx : idx + 1;
        if (newIndex >= 0 && newIndex <= data.parts.length) {
          dispatch([{ kind: 'reorderPart', partId: payload.id, newIndex }]);
        }
        break;
      }
      case 'chapter': {
        const partId = indicator.parentPartId ?? data.parts[0]?.id;
        if (!partId) break;
        const part = data.parts.find((p) => p.id === partId);
        if (!part) break;
        const idx = part.chapters.findIndex((c) => c.chapterId === indicator.targetId);
        const newIndex = indicator.position === 'before' ? idx : idx + 1;
        if (newIndex >= 0 && newIndex <= part.chapters.length) {
          dispatch([
            {
              kind: 'reorderChapter',
              chapterId: payload.id,
              targetPartId: partId,
              newIndex,
            },
          ]);
        }
        break;
      }
      case 'section': {
        const chapterId = indicator.parentChapterId;
        if (!chapterId) break;
        for (const part of data.parts) {
          const ch = part.chapters.find((c) => c.chapterId === chapterId);
          if (!ch) continue;
          const idx = ch.sections.findIndex((s) => s.id === indicator.targetId);
          const newIndex = indicator.position === 'before' ? idx : idx + 1;
          if (newIndex >= 0 && newIndex <= ch.sections.length) {
            dispatch([
              {
                kind: 'reorderSection',
                sectionId: payload.id,
                chapterId,
                newIndex,
              },
            ]);
          }
          break;
        }
        break;
      }
    }
  }, [data, dropIndicator, dispatch]);

  const handleDragEnd = useCallback(() => {
    dragPayloadRef.current = null;
    setDropIndicator(null);
  }, []);

  // ── Keyboard shortcut: Escape cancels everything ────────────────────────────
  // Already handled in InlineInput component via onKeyDown.

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (data.parts.length === 0 && data.frontMatter.length === 0 && data.backMatter.length === 0) {
    return (
      <div className="outline-empty">
        <div>
          <div className="outline-empty__heading">No outline</div>
          <div className="outline-empty__text">
            Import a markdown outline or add a part to begin structuring your book.
          </div>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="outline-workspace">
      {/* Front Matter */}
      {data.frontMatter.length > 0 && (
        <>
          <CollapsibleSection
            title="Front Matter"
            collapsed={frontMatterCollapsed}
            onToggle={() => setFrontMatterCollapsed((v) => !v)}
          >
            {data.frontMatter.map((block, i) => (
              <RichBlockPreview key={i} block={block} />
            ))}
          </CollapsibleSection>
          <hr className="outline-separator" />
        </>
      )}

      {/* Parts */}
      {data.parts.map((part, pi) => (
        <PartSection
          key={part.id}
          part={part}
          partIndex={pi}
          readOnly={readOnly}
          collapsed={collapsedParts.has(part.id)}
          collapsedChapters={collapsedChapters}
          editingState={editing}
          deleteConfirm={deleteConfirm}
          dragState={dragPayloadRef.current}
          dropIndicator={dropIndicator}
          onToggleCollapse={() => togglePart(part.id)}
          onToggleEdit={startEditing}
          onConfirmRename={(val) => confirmRenamePart(part.id, val)}
          onCancelEdit={cancelEditing}
          onDeleteRequest={requestDelete}
          onDeleteConfirm={confirmDelete}
          onDeleteCancel={cancelDelete}
          onAddChapter={() => startEditing({ kind: 'addChapter', partId: part.id })}
          onConfirmAddChapter={handleAddChapter}
          onCancelAdd={cancelEditing}
          onDragStart={handleDragStart}
          onDragOver={(e, targetId, kind, parentPartId, parentChapterId) =>
            handleDragOver(e, targetId, kind, parentPartId, parentChapterId)
          }
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          onChapterToggleCollapse={toggleChapter}
          onChapterToggleEdit={startEditing}
          onChapterConfirmEdit={confirmRenameChapter}
          onChapterDeleteRequest={(chapterId) =>
            requestDelete({ kind: 'chapter', chapterId })
          }
          onChapterDeleteConfirm={confirmDelete}
          onAddSection={(chapterId) =>
            startEditing({ kind: 'addSection', chapterId })
          }
          onConfirmAddSection={handleAddSection}
          onSectionToggleEdit={startEditing}
          onSectionConfirmEdit={confirmRenameSection}
          onSectionDeleteRequest={(sectionId) =>
            requestDelete({ kind: 'section', sectionId })
          }
          onSectionDeleteConfirm={confirmDelete}
          onBeatEdit={(sectionId, beatIndex) =>
            startEditing({ kind: 'renameBeat', sectionId, beatIndex })
          }
          onBeatConfirm={confirmRenameBeat}
          onBeatCancel={cancelEditing}
          onBeatDeleteRequest={(sectionId, beatIndex) =>
            requestDelete({ kind: 'beat', sectionId, beatIndex })
          }
          onBeatDeleteConfirm={confirmDelete}
          onBeatDeleteCancel={cancelDelete}
          onAddBeat={(sectionId) =>
            startEditing({ kind: 'addBeat', sectionId })
          }
          onConfirmAddBeat={handleAddBeat}
        />
      ))}

      {/* Add part inline */}
      {editing.kind === 'none' && !readOnly && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 28,
            padding: '0 var(--space-sm)',
            opacity: 0.4,
          }}
          className="outline-chapter__add-row"
        >
          <button
            type="button"
            className="outline-add-btn"
            aria-label="Add part"
            title="Add part"
            onClick={() => startEditing({ kind: 'addPart' })}
            style={{ opacity: 0.6 }}
          >
            +
          </button>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginLeft: 'var(--space-sm)' }}>
            Add Part
          </span>
        </div>
      )}

      {/* Inline add part input */}
      {editing.kind === 'addPart' && (
        <div className="outline-chapter__add-row">
          <InlineInput
            initialValue=""
            placeholder="New part title..."
            onConfirm={(val) => {
              if (val.trim()) handleAddPart(val.trim());
              else cancelEditing();
            }}
            onCancel={cancelEditing}
          />
        </div>
      )}

      {/* Back Matter */}
      {data.backMatter.length > 0 && (
        <>
          <hr className="outline-separator" />
          <CollapsibleSection
            title="Back Matter"
            collapsed={backMatterCollapsed}
            onToggle={() => setBackMatterCollapsed((v) => !v)}
          >
            {data.backMatter.map((block, i) => (
              <RichBlockPreview key={i} block={block} />
            ))}
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
