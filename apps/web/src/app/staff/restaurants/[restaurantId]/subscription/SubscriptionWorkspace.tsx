'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../lib/i18n/messages';
import {
  getMySubscription,
  sendSubscriptionRequest,
  type MySubscription,
  type OpenRequest,
  type PlanFeatureKey,
  type UpgradeOption,
} from '../../../../../lib/subscription/api';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Badge } from '../../../../../components/ui/Badge';
import { Button } from '../../../../../components/ui/Button';
import { Dialog } from '../../../../../components/ui/Dialog';
import { FormField } from '../../../../../components/ui/FormField';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../components/ui/PageHeader';
import { SectionCard } from '../../../../../components/ui/SectionCard';
import { Textarea } from '../../../../../components/ui/Textarea';
import { cn } from '../../../../../lib/utils';

const PHASE_VARIANT = {
  ACTIVE: 'success',
  UPCOMING: 'info',
  GRACE: 'warning',
  EXPIRED: 'destructive',
  CANCELLED: 'neutral',
} as const;

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const asDate = (value: string) => new Date(`${value}T12:00:00Z`);

/** What a Restaurant asks for: a plan (upgrade) or to continue (renewal). */
interface RequestTarget {
  kind: 'UPGRADE' | 'RENEWAL';
  option: UpgradeOption | null;
}

export function SubscriptionWorkspace({
  restaurantId,
  canRequest,
}: {
  restaurantId: string;
  /** A request needs Restaurant-wide Branch scope; without it the buttons are not offered. */
  canRequest: boolean;
}) {
  const { t, locale } = useStaffI18n();
  const [data, setData] = useState<MySubscription | null>(null);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState<RequestTarget | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const tag = locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';
  const dateFmt = new Intl.DateTimeFormat(tag, { dateStyle: 'long', timeZone: 'UTC' });
  const moneyFmt = new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numberFmt = new Intl.NumberFormat(tag);
  const day = (value: string) => dateFmt.format(asDate(value));
  const money = (value: string, currency: string) => `${moneyFmt.format(Number(value))} ${currency}`;

  const load = useCallback(async () => {
    try {
      setData(await getMySubscription(restaurantId));
      setFailed(false);
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setFailed(true);
    }
  }, [restaurantId]);

  useEffect(() => {
    let cancelled = false;
    getMySubscription(restaurantId)
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isUnauthenticatedError(error)) redirectToLogin();
        else setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || submitting) return;
    setSubmitting(true);
    setProblem(null);
    try {
      await sendSubscriptionRequest(restaurantId, {
        kind: target.kind,
        ...(target.option ? { packageId: target.option.id } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      setTarget(null);
      setMessage('');
      setSent(true);
      await load();
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setProblem(describeError(error));
    } finally {
      setSubmitting(false);
    }
  }

  const openDialog = (next: RequestTarget) => {
    setProblem(null);
    setSent(false);
    setMessage('');
    setTarget(next);
  };

  if (failed) {
    return (
      <>
        <PageHeader title={t('subscription.title')} />
        <Alert variant="error">{t('subscription.loadFailed')}</Alert>
      </>
    );
  }
  if (!data) return <LoadingState label={t('subscription.loading')} />;

  const sub = data.subscription;
  const open = data.openRequest;
  const lowDays = sub && sub.phase === 'ACTIVE' && sub.daysLeft <= 7;
  // How much of the period has passed, from the Backend's days left (no clock read while rendering).
  const periodDays = sub ? Math.max(1, Math.round((asDate(sub.endsAt).getTime() - asDate(sub.startsAt).getTime()) / 86_400_000)) : 1;
  const elapsed = sub ? Math.min(100, Math.max(0, ((periodDays - sub.daysLeft) / periodDays) * 100)) : 0;
  const showRenew = canRequest && !open && sub !== null && sub.phase !== 'CANCELLED';

  return (
    <>
      <PageHeader title={t('subscription.title')} description={t('subscription.description')} />

      {sent ? (
        <Alert variant="success" className="mb-4">
          {t('subscription.request.sent')}
        </Alert>
      ) : null}
      {open ? <OpenRequestNotice request={open} dateText={dateFmt.format(new Date(open.createdAt))} /> : null}

      <div className="space-y-6">
        <SectionCard title={t('subscription.plan')}>
          {sub ? (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-2xl font-bold tracking-tight text-foreground">
                    <bdi>{sub.packageName}</bdi>
                  </h3>
                  <Badge variant={PHASE_VARIANT[sub.phase]} dot>
                    {t(`subscription.phase.${sub.phase}` as MessageKey)}
                  </Badge>
                  <Badge>{t(`subscription.period.${sub.period}` as MessageKey)}</Badge>
                </div>

                <div className="mt-5 flex items-end gap-6">
                  {sub.phase === 'ACTIVE' || sub.phase === 'GRACE' ? (
                    <div>
                      <p
                        className={cn(
                          'text-5xl font-bold leading-none tracking-tight tabular-nums',
                          sub.phase === 'GRACE' ? 'text-warning' : lowDays ? 'text-warning' : 'text-foreground',
                        )}
                      >
                        {numberFmt.format(sub.phase === 'GRACE' ? sub.graceDaysLeft : sub.daysLeft)}
                      </p>
                      <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                        {t(sub.phase === 'GRACE' ? 'subscription.graceLeft' : 'subscription.daysLeft')}
                      </p>
                    </div>
                  ) : null}
                </div>

                {sub.phase === 'ACTIVE' ? (
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(elapsed)}
                    aria-label={t('subscription.daysLeft')}
                    className="mt-5 h-2 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={cn('h-full rounded-full', lowDays ? 'bg-warning' : 'bg-primary')}
                      style={{ width: `${elapsed}%` }}
                    />
                  </div>
                ) : null}

                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('subscription.starts')}</dt>
                    <dd className="mt-0.5 font-medium text-foreground">{day(sub.startsAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('subscription.ends')}</dt>
                    <dd className="mt-0.5 font-medium text-foreground">{day(sub.endsAt)}</dd>
                  </div>
                </dl>

                {showRenew ? (
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <Button
                      variant={lowDays || sub.phase !== 'ACTIVE' ? 'primary' : 'secondary'}
                      onClick={() => openDialog({ kind: 'RENEWAL', option: null })}
                    >
                      {t('subscription.renew')}
                    </Button>
                    <span className="text-xs text-muted-foreground">{t('subscription.renew.hint')}</span>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-5">
                <dl className="space-y-3 text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">{t('subscription.price')}</dt>
                    <dd className="text-lg font-semibold text-foreground">
                      <bdi dir="ltr" className="tabular-nums">{money(sub.finalPrice, sub.currencyCode)}</bdi>
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">{t('subscription.paid')}</dt>
                    <dd className="font-medium text-foreground">
                      <bdi dir="ltr" className="tabular-nums">{money(sub.paid, sub.currencyCode)}</bdi>
                    </dd>
                  </div>
                  {Number(sub.balance) > 0 ? (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">{t('subscription.balance')}</dt>
                      <dd className="font-medium text-warning">
                        <bdi dir="ltr" className="tabular-nums">{money(sub.balance, sub.currencyCode)}</bdi>
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className="mt-4">
                  <Badge variant={sub.paymentStatus === 'UNPAID' ? 'warning' : sub.paymentStatus === 'PARTIAL' ? 'warning' : 'success'}>
                    {t(`subscription.payStatus.${sub.paymentStatus}` as MessageKey)}
                  </Badge>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {data.package ? (
                <p className="text-2xl font-bold tracking-tight text-foreground">
                  <bdi>{data.package.name}</bdi>
                </p>
              ) : null}
              <p className="mt-2 text-sm font-medium text-foreground">{t('subscription.noSubscription')}</p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t('subscription.noSubscriptionHint')}</p>
            </div>
          )}
        </SectionCard>

        <SectionCard title={t('subscription.includes')}>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.features.map((feature) => (
              <li
                key={feature.key}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-4',
                  feature.included ? 'border-border bg-card' : 'border-dashed border-border bg-muted/30',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    feature.included ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {feature.included ? (
                    <svg {...ICON_PROPS} className="h-3.5 w-3.5">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  ) : (
                    <svg {...ICON_PROPS} className="h-3.5 w-3.5">
                      <rect x="5" y="11" width="14" height="9" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                  )}
                </span>
                <div className="min-w-0">
                  <p className={cn('text-sm font-medium', feature.included ? 'text-foreground' : 'text-muted-foreground')}>
                    {t(`subscription.feature.${feature.key}` as MessageKey)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {feature.included
                      ? t(`subscription.feature.${feature.key}.hint` as MessageKey)
                      : t('subscription.notIncluded')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title={t('subscription.upgrade.title')} description={t('subscription.upgrade.hint')}>
          {data.upgrades.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('subscription.upgrade.none')}</p>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {data.upgrades.map((option) => (
                <li key={option.id} className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-bold text-foreground">
                      <bdi>{option.name}</bdi>
                    </h3>
                    {option.offer ? (
                      <Badge variant="warning">
                        {t('subscription.upgrade.offer', { percent: numberFmt.format(Number(option.offer.percent)) })}
                      </Badge>
                    ) : null}
                  </div>
                  {option.offer?.label || option.offer?.endsAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {option.offer.label ? <bdi>{option.offer.label}</bdi> : null}
                      {option.offer.label && option.offer.endsAt ? ' · ' : null}
                      {option.offer.endsAt
                        ? t('subscription.upgrade.offerUntil', { date: day(option.offer.endsAt) })
                        : null}
                    </p>
                  ) : null}
                  {option.description ? (
                    <p className="mt-2 text-sm text-muted-foreground">{option.description}</p>
                  ) : null}

                  <div className="mt-4 space-y-0.5 text-sm text-foreground">
                    {option.priceMonthly === null && option.priceYearly === null ? (
                      <p className="text-muted-foreground">{t('subscription.upgrade.noPrice')}</p>
                    ) : (
                      <>
                        {option.priceMonthly !== null ? (
                          <p>
                            {t('subscription.upgrade.perMonth', {
                              price: money(option.priceMonthly, data.billingCurrency),
                            })}
                          </p>
                        ) : null}
                        {option.priceYearly !== null ? (
                          <p>
                            {t('subscription.upgrade.perYear', {
                              price: money(option.priceYearly, data.billingCurrency),
                            })}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>

                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('subscription.upgrade.adds')}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {option.adds.map((key: PlanFeatureKey) => (
                      <li key={key} className="flex items-start gap-2 text-sm text-foreground">
                        <svg {...ICON_PROPS} className="mt-0.5 h-4 w-4 shrink-0 text-success">
                          <path d="m5 12.5 4.5 4.5L19 7.5" />
                        </svg>
                        {t(`subscription.feature.${key}` as MessageKey)}
                      </li>
                    ))}
                  </ul>

                  {canRequest ? (
                    <Button
                      className="mt-5 w-full"
                      disabled={open !== null}
                      onClick={() => openDialog({ kind: 'UPGRADE', option })}
                    >
                      {t('subscription.upgrade.request')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <Dialog
        open={target !== null}
        title={
          target?.kind === 'RENEWAL'
            ? t('subscription.request.titleRenewal')
            : t('subscription.request.titleUpgrade', { package: target?.option?.name ?? '' })
        }
        isSubmitting={submitting}
        submitLabel={t('subscription.request.send')}
        onSubmit={(event) => void submit(event)}
        onClose={() => setTarget(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('subscription.request.intro')}</p>
          <FormField label={t('subscription.request.message')} htmlFor="subscription-request-message">
            <Textarea
              id="subscription-request-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={500}
              placeholder={t('subscription.request.messagePlaceholder')}
            />
          </FormField>
          {problem ? <Alert variant="error">{problem}</Alert> : null}
        </div>
      </Dialog>
    </>
  );
}

/** The request the team has not finished yet: said once, clearly, above the plan. */
function OpenRequestNotice({ request, dateText }: { request: OpenRequest; dateText: string }) {
  const { t } = useStaffI18n();
  const kind = t(`subscription.request.kind.${request.kind}` as MessageKey);
  return (
    <Alert variant="info" className="mb-4">
      <p className="font-medium">
        {t('subscription.request.open')} · {t(`subscription.request.status.${request.status}` as MessageKey)}
      </p>
      <p className="mt-0.5">
        {request.packageName
          ? t('subscription.request.openDetailPackage', { kind, package: request.packageName, date: dateText })
          : t('subscription.request.openDetail', { kind, date: dateText })}
      </p>
    </Alert>
  );
}
