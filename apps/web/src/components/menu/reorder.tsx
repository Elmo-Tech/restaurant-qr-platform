'use client';

import { useState, type DragEvent, type HTMLAttributes } from 'react';
import { useStaffI18n } from '../../lib/i18n/client';

/** Moves `id` to `toIndex` (0-based, in the list as it is now). Returns a new array; an impossible move returns a copy. */
export function moveId(ids: readonly string[], id: string, toIndex: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1 || toIndex < 0 || toIndex >= ids.length || from === toIndex) {
    return [...ids];
  }
  const next = [...ids];
  next.splice(from, 1);
  next.splice(toIndex, 0, id);
  return next;
}

/**
 * Drag-and-drop ordering with the platform's native drag events (no library):
 * the grip starts the drag, a row accepts the drop. The arrows
 * (`moveBy`) are the keyboard / touch path to the same result, so ordering
 * never depends on a pointer. The caller owns persistence (`onReorder` gets the
 * full new order) and decides when ordering is allowed (`enabled`).
 */
export function useDragReorder({
  ids,
  enabled,
  onReorder,
}: {
  ids: readonly string[];
  enabled: boolean;
  onReorder: (nextIds: string[]) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function handleProps(id: string): HTMLAttributes<HTMLElement> & { draggable?: boolean } {
    if (!enabled) return {};
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        setDraggingId(id);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
        const row = event.currentTarget.closest('[data-reorder-row]');
        if (row instanceof HTMLElement) event.dataTransfer.setDragImage(row, 16, 16);
      },
      onDragEnd: () => {
        setDraggingId(null);
        setOverId(null);
      },
    };
  }

  function rowProps(id: string): HTMLAttributes<HTMLElement> {
    return {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!enabled || draggingId === null || draggingId === id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (overId !== id) setOverId(id);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!enabled || draggingId === null) return;
        event.preventDefault();
        if (draggingId !== id) {
          onReorder(moveId(ids, draggingId, ids.indexOf(id)));
        }
        setDraggingId(null);
        setOverId(null);
      },
    };
  }

  function moveBy(id: string, delta: -1 | 1) {
    if (!enabled) return;
    const to = ids.indexOf(id) + delta;
    if (to < 0 || to >= ids.length) return;
    onReorder(moveId(ids, id, to));
  }

  return { draggingId, overId, handleProps, rowProps, moveBy };
}

function IconGrip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

function IconChevron({ className, up }: { className?: string; up: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}

/** The drag grip: starts a drag, and says so to assistive tech; never a click target. */
export function DragGrip({
  name,
  handleProps,
  className = '',
}: {
  name: string;
  handleProps: HTMLAttributes<HTMLElement> & { draggable?: boolean };
  className?: string;
}) {
  const { t } = useStaffI18n();
  return (
    <span
      {...handleProps}
      title={t('menu.reorder.dragAria', { name })}
      aria-label={t('menu.reorder.dragAria', { name })}
      className={`inline-flex h-8 w-6 flex-shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing ${className}`}
    >
      <IconGrip className="h-4 w-4" />
    </span>
  );
}

/** Move up / move down: the keyboard and touch way to reorder. */
export function MoveArrows({
  name,
  index,
  count,
  onMove,
  className = '',
}: {
  name: string;
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  className?: string;
}) {
  const { t } = useStaffI18n();
  const buttonClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        aria-label={t('menu.reorder.up', { name })}
        className={buttonClass}
      >
        <IconChevron up className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === count - 1}
        aria-label={t('menu.reorder.down', { name })}
        className={buttonClass}
      >
        <IconChevron up={false} className="h-4 w-4" />
      </button>
    </span>
  );
}
