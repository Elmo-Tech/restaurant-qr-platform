'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** `danger` for a destructive entry (e.g. closing a session). */
  tone?: 'default' | 'danger';
}

const ITEM_HEIGHT = 40;

/**
 * Design-system-v2: a small "more actions" menu button -- a real `<button>`
 * with `aria-haspopup="menu"` that opens a `role="menu"` list of real buttons.
 * Keyboard: Enter/Space/ArrowDown open it and focus the first item; Arrow Up
 * and Down, Home and End move; Escape closes and returns focus to the trigger;
 * Tab closes it. Pointer: a press outside closes it. Choosing an item hands
 * focus back to the trigger BEFORE running the action, so a dialog the action
 * opens restores focus to a control that still exists. Opens upward when there
 * is not enough room below. Only logical properties, so it mirrors in RTL.
 */
export function ActionMenu({
  label,
  items,
  className,
}: {
  /** Accessible name of the trigger, e.g. "More actions for Table 12". */
  label: string;
  items: readonly ActionMenuItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'down' | 'up'>('down');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const needed = items.length * ITEM_HEIGHT + 16;
    const below = window.innerHeight - rect.bottom;
    setPlacement(below < needed && rect.top > below ? 'up' : 'down');
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (items.length === 0) return null;

  function focusItem(index: number) {
    const count = items.length;
    itemRefs.current[(index + count) % count]?.focus();
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const current = itemRefs.current.findIndex((node) => node === document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem(current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem(current - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(items.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground shadow-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="19" cy="12" r="1.75" />
        </svg>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn(
            'absolute end-0 z-30 min-w-[220px] max-w-[min(300px,calc(100vw-2rem))] rounded-lg border border-border bg-card p-1 text-card-foreground shadow-lg',
            placement === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                triggerRef.current?.focus();
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-start text-sm font-medium outline-none transition-colors focus-visible:bg-muted',
                item.tone === 'danger'
                  ? 'text-destructive hover:bg-destructive-soft focus-visible:bg-destructive-soft'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              {item.icon ? (
                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
