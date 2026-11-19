/**
 * Phase 1 PR 2: whether the Orders workspace has room for the desktop split
 * (Priority Queue beside a non-modal Order detail pane).
 *
 * Decided from the workspace's OWN measured width -- the space left after the
 * Staff sidebar and page gutters -- never from a viewport breakpoint: a 1024px
 * window with the 256px sidebar leaves ~690px, which cannot hold both panels,
 * while the same width without a sidebar could. Below the threshold the
 * existing focused detail dialog is used instead.
 */
export const SPLIT_QUEUE_MIN_WIDTH = 340;
export const SPLIT_DETAIL_MIN_WIDTH = 480;
/** Matches the `gap-6` between the two columns. */
export const SPLIT_GUTTER_WIDTH = 24;
export const SPLIT_MIN_WIDTH = SPLIT_QUEUE_MIN_WIDTH + SPLIT_GUTTER_WIDTH + SPLIT_DETAIL_MIN_WIDTH;

export function canShowSplit(workspaceWidth: number): boolean {
  return Number.isFinite(workspaceWidth) && workspaceWidth >= SPLIT_MIN_WIDTH;
}
