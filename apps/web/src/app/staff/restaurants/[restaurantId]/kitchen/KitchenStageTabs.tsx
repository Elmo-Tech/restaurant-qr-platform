'use client';

import { useRef, type KeyboardEvent } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { KitchenStatus } from '../../../../../lib/kitchen/types';

export interface KitchenStageTab {
  stage: KitchenStatus;
  label: string;
  count: number;
}

const ACCENT: Record<KitchenStatus, string> = {
  ACCEPTED: 'bg-info',
  PREPARING: 'bg-warning',
  READY: 'bg-success',
};

export function kitchenTabId(stage: KitchenStatus): string {
  return `kitchen-tab-${stage}`;
}
export const KITCHEN_TABPANEL_ID = 'kitchen-tabpanel';

/**
 * Kitchen K3: the three stages as real tabs on a phone (New / Preparing /
 * Ready), each with its live ticket count, at the full width of the screen
 * and 64px tall. A tab is a `role="tab"`; the arrow keys move between tabs in
 * the direction the page reads (mirrored in Arabic), Home / End jump to the
 * ends, and only the selected tab is in the Tab order. The count comes from
 * the loaded board -- never a new request.
 */
export function KitchenStageTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  countLabel,
}: {
  tabs: readonly KitchenStageTab[];
  value: KitchenStatus;
  onChange: (stage: KitchenStatus) => void;
  ariaLabel: string;
  /** The accessible name of one tab, e.g. "New: 4". */
  countLabel: (tab: KitchenStageTab) => string;
}) {
  const { isRtl } = useStaffI18n();
  const refs = useRef<Partial<Record<KitchenStatus, HTMLButtonElement | null>>>({});

  function move(to: number) {
    const target = tabs[(to + tabs.length) % tabs.length];
    onChange(target.stage);
    refs.current[target.stage]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    // Arrow keys follow the reading direction: in Arabic the "next" tab is on the left.
    const next = isRtl ? 'ArrowLeft' : 'ArrowRight';
    const previous = isRtl ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === next) move(index + 1);
    else if (event.key === previous) move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(tabs.length - 1);
    else return;
    event.preventDefault();
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className="grid grid-cols-3 gap-1.5 rounded-2xl bg-muted p-1.5">
      {tabs.map((tab, index) => {
        const selected = tab.stage === value;
        return (
          <button
            key={tab.stage}
            ref={(element) => {
              refs.current[tab.stage] = element;
            }}
            id={kitchenTabId(tab.stage)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={KITCHEN_TABPANEL_ID}
            aria-label={countLabel(tab)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.stage)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
              selected
                ? 'bg-card text-foreground shadow-sm ring-2 ring-foreground'
                : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
            }`}
          >
            <span aria-hidden="true" className={`absolute inset-x-3 top-0 h-1 rounded-b-full ${ACCENT[tab.stage]}`} />
            <span aria-hidden="true" className="text-2xl font-extrabold leading-none tabular-nums">
              {tab.count}
            </span>
            <span aria-hidden="true" className="max-w-full break-words text-xs font-bold leading-tight">
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
