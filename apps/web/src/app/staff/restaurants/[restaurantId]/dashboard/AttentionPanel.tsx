'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { IconCheckCircle } from './icons';

export type AttentionTone = 'danger' | 'warning' | 'info';

export interface AttentionItem {
  key: string;
  tone: AttentionTone;
  icon: ReactNode;
  /** The headline number (omitted for setup items). */
  count?: number;
  title: string;
  hint?: string;
  href: string;
  cta: string;
}

const TONE: Record<AttentionTone, { row: string; icon: string; number: string; cta: string }> = {
  danger: {
    row: 'border-destructive/50 bg-destructive-soft/60 hover:border-destructive',
    icon: 'bg-destructive text-destructive-foreground',
    number: 'text-destructive',
    cta: 'bg-destructive text-destructive-foreground',
  },
  warning: {
    row: 'border-warning/50 bg-warning-soft/70 hover:border-warning',
    icon: 'bg-warning text-white',
    number: 'text-warning',
    cta: 'bg-warning text-white',
  },
  info: {
    row: 'border-info/40 bg-info-soft/60 hover:border-info',
    icon: 'bg-info text-white',
    number: 'text-info',
    cta: 'bg-info text-white',
  },
};

/**
 * "Needs your attention": the handful of things that cannot wait, each one a
 * full-width row (icon, the number, what it is, and one button) that lands
 * exactly where it can be dealt with. This is the focal point of the page, so
 * it is the loudest thing on it; when there is nothing it says so calmly.
 */
export function AttentionPanel({ items, loading }: { items: AttentionItem[]; loading: boolean }) {
  const { t } = useStaffI18n();

  return (
    <section aria-labelledby="ops-attention-title" className="flex flex-col gap-3">
      <h2 id="ops-attention-title" className="text-base font-semibold text-foreground">
        {t('ops.attention.title')}
      </h2>

      {loading ? (
        <div className="h-[84px] animate-pulse rounded-xl border border-border bg-muted/50" aria-hidden="true" />
      ) : items.length === 0 ? (
        <div className="flex items-center gap-4 rounded-xl border border-success/30 bg-success-soft/50 px-5 py-4">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
            <IconCheckCircle className="h-6 w-6" />
          </span>
          <div>
            <p className="text-base font-semibold text-foreground">{t('ops.attention.clear.title')}</p>
            <p className="text-sm text-muted-foreground">{t('ops.attention.clear.hint')}</p>
          </div>
        </div>
      ) : (
        <ul className={`grid grid-cols-1 gap-3 ${items.length > 1 ? 'lg:grid-cols-2' : ''}`}>
          {items.map((item) => {
            const tone = TONE[item.tone];
            return (
              <li key={item.key} className="flex">
                <Link
                  href={item.href}
                  className={`flex w-full flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border p-4 shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${tone.row}`}
                >
                  <span
                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg [&>svg]:h-6 [&>svg]:w-6 ${tone.icon}`}
                  >
                    {item.icon}
                  </span>
                  {item.count !== undefined ? (
                    <span className={`min-w-[2ch] text-center text-4xl font-bold leading-none ${tone.number}`}>
                      {item.count}
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="text-base font-semibold text-foreground">{item.title}</p>
                    {item.hint ? <p className="mt-0.5 text-sm text-muted-foreground">{item.hint}</p> : null}
                  </div>
                  <span
                    className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold ${tone.cta}`}
                  >
                    {item.cta}
                    <span aria-hidden="true" className="inline-block rtl:rotate-180">
                      →
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
