/**
 * DiffView — side-by-side HTML diff review component.
 *
 * Renders block-level decorations from the shared diff engine as a
 * two-column comparison: original document on the left, proposed on the
 * right. Supports inline word-level diff segments inside changed blocks.
 *
 * Used by WP-19 (Iterate flow) for reviewing LLM-proposed changes before
 * accepting or discarding.
 *
 * The renderer is sandboxed — the diff engine is pure computation imported
 * directly (no IPC required; per-tech-spec §6.4 the engine runs in the
 * renderer for diff decoration rendering).
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { useMemo } from 'react';
import { diffHtml } from '../../shared/diff';
import type { DiffSegment, DiffResult } from '../../shared/diff';
import '../styles/diff-view.css';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DiffViewProps {
  /** The original (current) HTML document. */
  original: string;
  /** The modified (proposed) HTML document. */
  modified: string;
  /** Optional title shown above the side-by-side view. */
  title?: string;
  /** Optional stats summary. Set to false to hide. Default: true. */
  showStats?: boolean;
  /** Height constraint for the diff view in px. Default: 400. */
  maxHeight?: number;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/**
 * Color-coded stats bar showing block change counts.
 *
 * Uses the same semantic colors as the diff rows for consistency:
 * amber for changed, green for inserted, red for deleted, muted for unchanged.
 */
function StatsBar({ stats }: { stats: DiffResult['stats'] }): JSX.Element {
  return (
    <div className="diff-view__stats">
      {stats.blocksChanged > 0 && (
        <span className="diff-view__stat diff-view__stat--changed">
          +{stats.blocksChanged} changed
        </span>
      )}
      {stats.blocksInserted > 0 && (
        <span className="diff-view__stat diff-view__stat--inserted">
          +{stats.blocksInserted} inserted
        </span>
      )}
      {stats.blocksDeleted > 0 && (
        <span className="diff-view__stat diff-view__stat--deleted">
          &minus;{stats.blocksDeleted} deleted
        </span>
      )}
      <span className="diff-view__stat diff-view__stat--unchanged">
        {stats.blocksUnchanged} unchanged
      </span>
    </div>
  );
}

/**
 * Renders word-level inline diff segments for a "changed" block.
 *
 * The `side` parameter controls which segments are visible:
 *  - `left` (original): shows `unchanged` and `deleted` segments.
 *  - `right` (proposed): shows `unchanged` and `inserted` segments.
 *
 * Each segment is rendered as a plain-text `<span>` (no innerHTML) because
 * the segments come from the diff engine's stripped-text comparison and
 * cannot be safely injected into the original HTML markup.
 */
function ChangedSegments({
  segments,
  side,
}: {
  segments: DiffSegment[];
  side: 'left' | 'right';
}): JSX.Element {
  // Filter to the segments visible on this side of the diff
  const visible = segments.filter((s) => {
    if (side === 'left') return s.type === 'unchanged' || s.type === 'deleted';
    return s.type === 'unchanged' || s.type === 'inserted';
  });

  if (visible.length === 0) {
    return (
      <span className="diff-view__empty-marker">&mdash;</span>
    );
  }

  return (
    <>
      {visible.map((seg, i) => (
        <span
          key={i}
          className={`diff-view__segment diff-view__segment--${seg.type}`}
        >
          {seg.text}
        </span>
      ))}
    </>
  );
}

/**
 * Content for a single column cell in the diff grid.
 *
 * Uses `dangerouslySetInnerHTML` for non-changed blocks (the HTML comes from
 * our own sanitizer and is safe). For changed blocks, renders word-level
 * segments as plain-text spans to avoid XSS from mixing segment text into
 * arbitrary HTML.
 */
function DiffCell({
  html,
  status,
  segments,
  side,
}: {
  html: string;
  status: DiffResult['decorations'][number]['status'];
  segments: DiffSegment[] | undefined;
  side: 'left' | 'right';
}): JSX.Element {
  // Empty cell (inserted row left side, deleted row right side)
  if (html.length === 0 && status !== 'changed') {
    return (
      <div className="diff-view__column">
        <span className="diff-view__empty-marker">&mdash;</span>
      </div>
    );
  }

  // Changed block with word-level segments — render plain-text spans
  if (status === 'changed' && segments && segments.length > 0) {
    return (
      <div className="diff-view__column">
        <ChangedSegments segments={segments} side={side} />
      </div>
    );
  }

  // Changed block without segments (edge case) or non-changed block —
  // render the safe HTML directly
  return (
    <div
      className="diff-view__column"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * Side-by-side HTML diff viewer.
 *
 * Calls `diffHtml()` (pure computation, memoized) to produce block-level and
 * word-level diff decorations, then renders them as a two-column comparison
 * with color-coded backgrounds and inline text highlights.
 */
export function DiffView({
  original,
  modified,
  title,
  showStats = true,
  maxHeight = 400,
}: DiffViewProps): JSX.Element {
  const result: DiffResult = useMemo(
    () => diffHtml(original, modified),
    [original, modified],
  );
  const { decorations, stats } = result;

  const hasAnyChanges =
    stats.blocksChanged + stats.blocksInserted + stats.blocksDeleted > 0;

  return (
    <div className="diff-view">
      {/* Header: optional title + stats bar */}
      {(title || showStats) && (
        <div className="diff-view__header">
          {title && <h3 className="diff-view__title">{title}</h3>}
          {showStats && <StatsBar stats={stats} />}
        </div>
      )}

      {/* Grid body: two columns with sticky headers */}
      <div className="diff-view__body" style={{ maxHeight: `${maxHeight}px` }}>
        {/* Column labels */}
        <div className="diff-view__column-headers">
          <div className="diff-view__column-header">Current</div>
          <div className="diff-view__column-header">Proposed</div>
        </div>

        {/* Empty state: both inputs are empty */}
        {decorations.length === 0 && (
          <div className="diff-view__row diff-view__row--empty">
            <div className="diff-view__column">
              <span className="diff-view__empty-marker">&mdash;</span>
            </div>
            <div className="diff-view__column">
              <span className="diff-view__empty-marker">&mdash;</span>
            </div>
          </div>
        )}

        {/* Diff rows */}
        {decorations.map((dec) => (
          <div
            key={dec.blockIndex}
            className={`diff-view__row diff-view__row--${dec.status}`}
          >
            <DiffCell
              html={dec.originalHtml}
              status={dec.status}
              segments={dec.segments}
              side="left"
            />
            <DiffCell
              html={dec.modifiedHtml}
              status={dec.status}
              segments={dec.segments}
              side="right"
            />
          </div>
        ))}
      </div>

      {/* Footer: shown only when everything is identical */}
      {!hasAnyChanges && decorations.length > 0 && (
        <div className="diff-view__footer">No changes detected.</div>
      )}
    </div>
  );
}
