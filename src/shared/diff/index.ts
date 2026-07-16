/**
 * Diff engine — barrel export.
 *
 * Pure computation: block-level HTML alignment + word-level inline diffs
 * for rendering in the TipTap/ProseMirror editor.
 *
 * @module
 * @version 1.0.0 | 2026-07-16
 */

export {
  diffHtml,
} from './diffEngine';

export type {
  DiffSegment,
  DiffDecoration,
  DiffResult,
} from './diffEngine';

export {
  parseBlocks,
} from './parseBlocks';
