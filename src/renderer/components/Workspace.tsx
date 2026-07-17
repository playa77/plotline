/**
 * Workspace — center pane content router.
 *
 * Renders content based on selection state:
 *   - 'none'       → empty state prompting chapter selection
 *   - 'outline'    → OutlineWorkspace (WP-08b)
 *   - 'chapter'    → ChapterWorkspace (WP-15)
 *   - 'variables'  → VariableWorkspace (WP-11)
 *
 * Version: 0.4.0 | 2026-07-16
 */

import { ChapterWorkspace } from './ChapterWorkspace';
import { OutlineWorkspace } from './OutlineWorkspace';
import { VariableWorkspace } from './VariableWorkspace';
import { SettingsWorkspace } from './SettingsWorkspace';
import { demoParts } from '../data/demoOutline';
import type { Outline } from '../../shared/schemas/outline';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WorkspaceSelection {
  type: 'none' | 'outline' | 'chapter' | 'variables' | 'settings' | 'exports';
  /** Only set when type === 'chapter'. */
  chapterId?: string;
  /** Only set when type === 'chapter'. */
  chapterTitle?: string;
}

export interface WorkspaceProps {
  selection: WorkspaceSelection;
  projectId: string;
  onImportOutline?: () => void;
  onExportSubstack?: () => void;
  onExportHtml?: () => void;
  onExportMarkdownChapter?: () => void;
  onExportMarkdownBook?: () => void;
  onExportPdf?: () => void;
}

// ── Mock Outline ───────────────────────────────────────────────────────────────

/**
 * Construct a mock Outline from demoParts for rendering while the IPC
 * backend (outline:get) is being built in parallel.
 */
function buildMockOutline(): Outline {
  return {
    schemaVersion: 1,
    frontMatter: [
      { type: 'heading', level: 2, text: 'Notes to Readers' },
      {
        type: 'paragraph',
        text: 'A note from the author about the scope and approach of this biography, including research methodology and sources.',
      },
      { type: 'heading', level: 2, text: 'Synopsis' },
      {
        type: 'paragraph',
        text: 'A comprehensive biography tracing the life and times of a transformative statesman, from formative years through nation-building and the challenges of leadership in a post-colonial world.',
      },
    ],
    parts: demoParts.map((p) => ({
      id: p.id,
      title: p.title,
      chapters: p.chapters.map((ch) => ({
        chapterId: ch.chapterId,
        title: ch.title,
        wordTarget: ch.wordTarget,
        sections: ch.sections.map((sec) => ({
          id: sec.id,
          number: sec.number,
          title: sec.title,
          wordTarget: sec.wordTarget,
          beats: sec.beats,
        })),
      })),
    })),
    backMatter: [
      { type: 'heading', level: 2, text: 'Appendices' },
      {
        type: 'paragraph',
        text: 'Timeline of key events, glossary of terms, and selected bibliography.',
      },
      { type: 'heading', level: 2, text: 'Index' },
      { type: 'paragraph', text: 'Comprehensive index of names, places, and subjects.' },
    ],
  };
}

// Created once — mock data is static
const mockOutline = buildMockOutline();

// ── Component ──────────────────────────────────────────────────────────────────

export function Workspace({
  selection,
  projectId,
  onImportOutline,
  onExportSubstack,
  onExportHtml,
  onExportMarkdownChapter,
  onExportMarkdownBook,
  onExportPdf,
}: WorkspaceProps): JSX.Element {
  switch (selection.type) {
    case 'none':
      return (
        <div className="workspace-empty">
          <div className="workspace-empty__content">
            <div className="workspace-empty__heading">Select a chapter</div>
            <div className="workspace-empty__text">
              Choose a chapter from the manuscript tree on the left to begin
              writing or expanding.
            </div>
            <button
              type="button"
              className="workspace-empty__import-btn"
              onClick={onImportOutline}
            >
              Import Outline
            </button>
          </div>
        </div>
      );
    case 'exports':
      return (
        <div className="workspace-exports">
          <div className="workspace-exports__heading">Export</div>
          <div className="workspace-exports__text">
            Export your manuscript for publishing or sharing.
          </div>
          <div className="workspace-exports__actions">
            <button
              type="button"
              className="workspace-exports__btn"
              onClick={onExportSubstack}
            >
              Copy for Substack
            </button>
            <button
              type="button"
              className="workspace-exports__btn"
              onClick={onExportHtml}
            >
              Save as HTML
            </button>
            <button
              type="button"
              className="workspace-exports__btn"
              onClick={onExportMarkdownChapter}
            >
              Export Markdown (chapter)
            </button>
            <button
              type="button"
              className="workspace-exports__btn"
              onClick={onExportMarkdownBook}
            >
              Export Markdown (whole book)
            </button>
            <button
              type="button"
              className="workspace-exports__btn"
              onClick={onExportPdf}
            >
              Export PDF
            </button>
          </div>
        </div>
      );
    case 'outline':
      return (
        <OutlineWorkspace
          outline={mockOutline}
          onMutate={(mutations) => {
            console.log('[Workspace] Outline mutations:', mutations);
          }}
          onImportOutline={onImportOutline}
        />
      );
    case 'chapter':
      return (
        <ChapterWorkspace
          projectId={projectId}
          chapterId={selection.chapterId!}
          chapterTitle={selection.chapterTitle!}
          wordTarget={{ min: 7000, max: 8000 }}
          onImportOutline={onImportOutline}
        />
      );
    case 'variables':
      return <VariableWorkspace projectId={projectId} />;
    case 'settings':
      return <SettingsWorkspace projectId={projectId} />;
  }
}
