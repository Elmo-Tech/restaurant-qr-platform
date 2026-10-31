'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStaffI18n } from '../../lib/i18n/client';
import type { MessageKey } from '../../lib/i18n/messages';
import {
  summarizeSetupSteps,
  type SetupStepGroup,
  type SetupStepKey,
  type SetupStepStatus,
  type SetupStepView,
} from '../../lib/staff/restaurant-setup';

const STEP_TEXT: Record<SetupStepKey, { title: MessageKey; detail: MessageKey }> = {
  BRANDING: { title: 'setup.step.branding.title', detail: 'setup.step.branding.description' },
  CONTACT: { title: 'setup.step.contact.title', detail: 'setup.step.contact.description' },
  LANGUAGES: { title: 'setup.step.languages.title', detail: 'setup.step.languages.description' },
  MENU: { title: 'setup.step.menu.title', detail: 'setup.step.menu.description' },
  PRODUCTS: { title: 'setup.step.products.title', detail: 'setup.step.products.description' },
  ORDERING: { title: 'setup.step.ordering.title', detail: 'setup.step.ordering.description' },
  OPERATIONS: { title: 'setup.step.operations.title', detail: 'setup.step.operations.description' },
  PREVIEW: { title: 'setup.step.preview.title', detail: 'setup.step.preview.description' },
};

const GROUPS: readonly { key: SetupStepGroup; title: MessageKey }[] = [
  { key: 'identity', title: 'setup.group.identity' },
  { key: 'menu', title: 'setup.group.menu' },
  { key: 'orders', title: 'setup.group.orders' },
];

const STATUS_TEXT: Record<SetupStepStatus, MessageKey> = {
  DONE: 'setup.step.done',
  NEEDS_ACTION: 'setup.step.needsAction',
  NEEDS_REVIEW: 'setup.step.needsReview',
  NOT_APPLICABLE: 'setup.step.notApplicable',
  INTENTIONALLY_SKIPPED: 'setup.step.skipped',
  UNAVAILABLE: 'setup.step.unavailable',
  UNKNOWN: 'setup.step.unknown',
};

function RowIcon({ status }: { status: SetupStepStatus }) {
  return (
    <span aria-hidden="true" className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${status === 'DONE'
      ? 'bg-success-soft text-success'
      : status === 'NEEDS_ACTION'
        ? 'bg-[#fff2e3] text-[#bb5907]'
        : status === 'NEEDS_REVIEW'
          ? 'bg-warning-soft text-warning'
          : 'bg-muted text-muted-foreground'}`}>
      {status === 'DONE' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
          strokeLinecap="round" strokeLinejoin="round" className="size-5">
          <circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" />
        </svg>
      ) : status === 'NEEDS_ACTION' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" className="size-5">
          <circle cx="12" cy="12" r="9" /><path d="M12 8v8m-4-4h8" />
        </svg>
      ) : status === 'NEEDS_REVIEW' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" className="size-5">
          <circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" className="size-5">
          <circle cx="12" cy="12" r="9" /><path d="M8 12h8" />
        </svg>
      )}
    </span>
  );
}

function SetupStepRow({ step, expanded }: { step: SetupStepView; expanded: boolean }) {
  const { t } = useStaffI18n();
  const copy = STEP_TEXT[step.key];
  const actionable = step.status === 'NEEDS_ACTION' || step.status === 'NEEDS_REVIEW';
  const href = actionable ? step.href : null;

  return (
    <li className="flex min-w-0 items-start gap-3 rounded-xl border border-border/75 bg-card px-3 py-3 sm:px-4">
      <RowIcon status={step.status} />
      <div className="min-w-0 flex-1 self-center">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold leading-6 text-foreground">{t(copy.title)}</p>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${step.status === 'DONE'
            ? 'bg-success-soft text-success'
            : step.status === 'NEEDS_REVIEW'
              ? 'bg-warning-soft text-warning'
              : step.status === 'NEEDS_ACTION'
                ? 'bg-[#fff0df] text-[#a75508]'
                : 'bg-muted text-muted-foreground'}`}>
            {t(STATUS_TEXT[step.status])}
          </span>
        </div>
        {expanded ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground sm:text-sm">{t(copy.detail)}</p> : null}
        {step.status === 'UNAVAILABLE' && expanded ? (
          <p className="mt-1 text-xs text-muted-foreground">{t('setup.action.whyLocked')}</p>
        ) : null}
      </div>
      {href ? (
        <Link href={href}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-xs font-bold text-primary transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-3 sm:text-sm">
          {t(step.status === 'NEEDS_REVIEW' ? 'setup.action.review' : 'setup.action.start')}
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 rtl:rotate-180">
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </Link>
      ) : null}
    </li>
  );
}

/**
 * A pure display component for VERIFIED future setup step data. For this PR it
 * appears ONLY in an explicitly marked design-preview route with sample data.
 * It must not be inserted into production Dashboard before a guarded Backend
 * readiness endpoint and persisted user visibility/owner review exist.
 */
export function RestaurantSetupChecklistCard({
  steps,
  onHide,
  preview = false,
}: {
  steps: readonly SetupStepView[];
  onHide?: () => void;
  preview?: boolean;
}) {
  const { t } = useStaffI18n();
  const [expanded, setExpanded] = useState(false);
  const summary = summarizeSetupSteps(steps);
  const available = steps.filter(step => step.status !== 'NOT_APPLICABLE');
  const finishedExample = available.find(step => step.status === 'DONE');
  const pendingExamples = available.filter(step =>
    step.status === 'NEEDS_ACTION' || step.status === 'NEEDS_REVIEW' || step.status === 'UNAVAILABLE');
  const compactRows = [...(finishedExample ? [finishedExample] : []), ...pendingExamples.slice(0, finishedExample ? 2 : 3)];
  const smallRows = compactRows.length > 0 ? compactRows : available.slice(0, 3);
  const nextHref = summary.nextAction?.href;
  const totalLabel = summary.percentage === null
    ? t('setup.progress.unknown')
    : t('setup.progress.count', { done: summary.done, total: summary.total });

  return (
    <section aria-labelledby="restaurant-setup-title" className="min-w-0 overflow-hidden rounded-[22px] border border-border bg-card shadow-sm">
      <div className="relative isolate overflow-hidden bg-[linear-gradient(112deg,#1d2630_0%,#29303b_55%,#483124_100%)] px-4 py-5 text-white sm:px-6 sm:py-6">
        <div aria-hidden="true" className="pointer-events-none absolute -end-16 -top-20 size-52 rounded-full bg-[#da8028]/20 blur-3xl" />
        <div className="relative flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[#c86b13] shadow-lg">
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
                strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-6">
                <path d="M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5A1.5 1.5 0 0 0 4 21V5.5ZM20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5A1.5 1.5 0 0 1 20 21V5.5Z" />
                <path d="m7 11 1.5 1.5L11 10" />
              </svg>
            </span>
            <div className="min-w-0">
              {preview ? <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#ffd099]">{t('setup.preview.badge')}</p> : null}
              <h2 id="restaurant-setup-title" className="text-lg font-extrabold leading-7 text-white sm:text-xl">{t('setup.title')}</h2>
              <p className="mt-1 max-w-xl text-xs leading-5 text-[#e1e4eb] sm:text-sm">{t('setup.subtitle')}</p>
            </div>
          </div>
          <div className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white" dir="auto">
            {totalLabel}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6">
        {summary.percentage !== null ? (
          <div>
            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{t('setup.progress.label')}</span>
              <span className="font-semibold tabular-nums text-foreground" dir="ltr">{summary.percentage}%</span>
            </div>
            <div
              role="progressbar"
              aria-label={t('setup.progress.label')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={summary.percentage}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-[#c86b13] transition-[width] motion-reduce:transition-none"
                style={{ width: `${summary.percentage}%` }} />
            </div>
          </div>
        ) : (
          <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{t('setup.progress.unknown')}</p>
        )}

        {summary.readyForOwnerReview ? (
          <div role="status" className="rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm font-medium text-success">
            {preview ? t('setup.preview.readyNote') : t('setup.progress.done')}
          </div>
        ) : summary.nextAction && !expanded ? (
          <p className="text-xs font-semibold text-muted-foreground">{t('setup.progress.next')}</p>
        ) : null}

        {expanded ? (
          <div className="space-y-4">
            {GROUPS.map(group => {
              const items = available.filter(step => step.group === group.key);
              return items.length ? (
                <div key={group.key} className="space-y-2">
                  <h3 className="text-sm font-bold text-foreground">{t(group.title)}</h3>
                  <ul className="space-y-2">{items.map(step => <SetupStepRow key={step.key} step={step} expanded />)}</ul>
                </div>
              ) : null;
            })}
          </div>
        ) : (
          <ul className="space-y-2">
            {smallRows.map(step => <SetupStepRow key={step.key} step={step} expanded={false} />)}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/80 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {nextHref && !expanded ? (
              <Link href={nextHref}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                {t('setup.action.continue')}
              </Link>
            ) : null}
            <button type="button" aria-expanded={expanded}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              onClick={() => setExpanded(current => !current)}>
              {t(expanded ? 'setup.action.showLess' : 'setup.action.showAll')}
            </button>
          </div>
          {onHide ? (
            <button type="button" onClick={onHide}
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              {t('setup.action.hide')}
            </button>
          ) : null}
        </div>
        {preview ? <p className="text-xs text-muted-foreground">{t('setup.preview.notPersisted')}</p> : null}
      </div>
    </section>
  );
}
