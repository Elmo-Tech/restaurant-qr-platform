'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useStaffI18n } from '../../lib/i18n/client';
import {
  completeSetup, enrollSetup, getSetupStatus,
  reviewSetupStep, setSetupVisibility,
  type LiveSetupStatus, type SetupReviewAction,
} from '../../lib/staff/restaurant-setup-api';
import { summarizeSetupSteps, type SetupStepKey } from '../../lib/staff/restaurant-setup';
import { describeError, isUnauthenticatedError, redirectToLogin } from '../../lib/menu/error-message';
import { Alert } from '../ui/Alert';
import { RestaurantSetupChecklistCard } from './RestaurantSetupChecklistCard';

type Mode = 'dashboard' | 'page' | 'settings';
const GUIDE_ROLES = new Set(['OWNER', 'MANAGER']);

export function RestaurantSetupPanel({
  restaurantId, mode, memberRole, fullRestaurantScope, onDashboardVisibilityChange,
}: {
  restaurantId: string;
  mode: Mode;
  memberRole: string;
  fullRestaurantScope: boolean;
  onDashboardVisibilityChange?: (visible: boolean) => void;
}) {
  const { t } = useStaffI18n();
  const [status, setStatus] = useState<LiveSetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const allowed = GUIDE_ROLES.has(memberRole) && fullRestaurantScope;
  const href = '/staff/restaurants/' + encodeURIComponent(restaurantId) + '/setup';
  const dashboardHref = '/staff/restaurants/' + encodeURIComponent(restaurantId);

  const reload = useCallback(async () => {
    if (!allowed) return;
    try {
      const current = await getSetupStatus(restaurantId);
      setStatus(current);
      setProblem(null);
    } catch (e) {
      if (isUnauthenticatedError(e)) { redirectToLogin(); return; }
      setProblem(describeError(e));
    } finally {
      setLoading(false);
    }
  }, [allowed, restaurantId]);

  useEffect(() => {
    void reload();
    const onFocus = () => { void reload(); };
    // Returning from another Setup step refreshes canonical Backend truth.
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  useEffect(() => {
    if (mode !== 'dashboard') return;
    onDashboardVisibilityChange?.(Boolean(status?.enrolled && !status.hidden && !status.completed));
  }, [mode, onDashboardVisibilityChange, status]);

  const perform = useCallback(async (action: () => Promise<LiveSetupStatus>) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      setStatus(await action());
      setConfirming(false);
    } catch (e) {
      if (isUnauthenticatedError(e)) { redirectToLogin(); return; }
      setProblem(describeError(e));
    } finally {
      setBusy(false);
    }
  }, [busy]);

  if (!allowed) return mode === 'page' ? <Alert variant="error">{t('setup.live.noPermission')}</Alert> : null;
  if (loading && !status) return mode === 'dashboard' || mode === 'settings'
    ? null : <p role="status" className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">{t('setup.live.loading')}</p>;
  if (!status) return mode === 'dashboard' || mode === 'settings' ? null : (
    <Alert variant="error">{t('setup.live.error')}{' '}
      <button type="button" className="font-semibold underline" onClick={() => void reload()}>{t('setup.live.retry')}</button>
    </Alert>
  );

  // The dashboard is operational first: no unsolicited checklist on legacy,
  // completed or personally hidden restaurants.
  if (mode === 'dashboard') {
    if (!status.enrolled || status.completed || status.hidden) return null;
    const summary = summarizeSetupSteps(status.steps);
    const next = summary.nextAction;
    return (
      <section aria-label={t('setup.title')}
        className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#fff0df] text-[#ac5807]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-6"
              strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="4" /><path d="m8 12 2.5 2.5L16 9" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-foreground">{t('setup.title')}</h2>
              <span className="text-xs font-semibold text-muted-foreground" dir="auto">
                {summary.percentage === null ? t('setup.progress.unknown')
                  : t('setup.progress.count', { done: summary.done, total: summary.total })}
              </span>
            </div>
            {summary.percentage !== null ? (
              <div role="progressbar" aria-label={t('setup.progress.label')} aria-valuemin={0}
                aria-valuemax={100} aria-valuenow={summary.percentage}
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-[#c86b13] transition-[width] motion-reduce:transition-none"
                  style={{ width: summary.percentage + '%' }} />
              </div>
            ) : null}
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {next ? t('setup.live.dashboardLabel') + ': ' + t(
                ('setup.step.' + next.key.toLowerCase() + '.title') as Parameters<typeof t>[0],
              ) : t('setup.live.dashboardDetail')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href={href}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            {t('setup.live.dashboardCta')}
          </Link>
          <button type="button" disabled={busy} onClick={() => void perform(() => setSetupVisibility(restaurantId, true))}
            aria-label={t('setup.action.hide')} title={t('setup.action.hide')}
            className="inline-flex size-11 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" stroke="currentColor" fill="none"
              strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </section>
    );
  }

  if (mode === 'settings') {
    return (
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-foreground">{t('setup.title')}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {status.completed ? t('setup.live.completed')
              : !status.enrolled ? t('setup.live.notEnrolled')
                : status.hidden ? t('setup.live.hidden') : t('setup.live.dashboardDetail')}
          </p>
        </div>
        <Link href={href}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-primary">
          {t(status.enrolled ? 'setup.live.open' : 'setup.live.start')}
        </Link>
      </section>
    );
  }

  if (!status.enrolled) return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-bold text-foreground">{t('setup.title')}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('setup.live.notEnrolled')}</p>
      {status.owner ? (
        <button type="button" disabled={busy}
          onClick={() => void perform(() => enrollSetup(restaurantId))}
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60">
          {t(busy ? 'setup.live.saving' : 'setup.live.start')}
        </button>
      ) : <p className="mt-3 text-sm text-muted-foreground">{t('setup.live.ownerOnly')}</p>}
      {problem ? <Alert variant="error">{problem}</Alert> : null}
    </div>
  );

  if (status.hidden) return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{t('setup.live.hidden')}</p>
      <button type="button" disabled={busy}
        onClick={() => void perform(() => setSetupVisibility(restaurantId, false))}
        className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60">
        {t('setup.live.reopen')}
      </button>
      {problem ? <Alert variant="error">{problem}</Alert> : null}
    </div>
  );

  if (status.completed) return (
    <div className="rounded-2xl border border-success/30 bg-card p-5 shadow-sm">
      <p role="status" className="text-base font-semibold text-success">{t('setup.live.completed')}</p>
      <Link href={dashboardHref} className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-primary underline underline-offset-4">
        {t('setup.live.back')}
      </Link>
    </div>
  );

  const summary = summarizeSetupSteps(status.steps);
  const review = (step: SetupStepKey) => {
    if (!status.canReview) return;
    if (step !== 'LANGUAGES' && step !== 'ORDERING' && step !== 'OPERATIONS' && step !== 'PREVIEW') return;
    void perform(() => reviewSetupStep(restaurantId, step as SetupReviewAction));
  };

  return (
    <div className="flex flex-col gap-4">
      {problem ? <Alert variant="error">{problem}</Alert> : null}
      <div className="flex justify-end">
        <button type="button" disabled={busy} onClick={() => void reload()}
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60">
          {t('setup.live.refresh')}
        </button>
      </div>
      <RestaurantSetupChecklistCard
        steps={status.steps}
        busy={busy}
        onHide={() => void perform(() => setSetupVisibility(restaurantId, true))}
        onReview={status.canReview ? review : undefined}
        onSkipBranding={status.owner ? () => void perform(() => reviewSetupStep(restaurantId, 'BRANDING_SKIP')) : undefined}
      />
      {summary.readyForOwnerReview && status.owner ? (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h3 className="text-base font-bold text-foreground">{t('setup.live.confirmOwner')}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('setup.live.afterReview')}</p>
          {confirming ? (
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-sm text-foreground">{t('setup.live.confirmQuestion')}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy}
                  onClick={() => void perform(() => completeSetup(restaurantId))}
                  className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60">
                  {t(busy ? 'setup.live.saving' : 'setup.live.save')}
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirming(false)}
                  className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-medium text-foreground">
                  {t('setup.live.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)}
              className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-primary">
              {t('setup.live.confirmOwner')}
            </button>
          )}
        </div>
      ) : summary.readyForOwnerReview ? (
        <p className="text-sm text-muted-foreground">{t('setup.live.ownerOnly')}</p>
      ) : null}
    </div>
  );
}
