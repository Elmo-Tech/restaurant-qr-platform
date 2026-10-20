'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../lib/i18n/messages';
import {
  getMySubscription,
  sendSubscriptionRequest,
  type MySubscription,
  type OpenRequest,
  type PlanFeatureKey,
  type PlanSubscription,
  type UpgradeOption,
} from '../../../../../lib/subscription/api';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { Dialog } from '../../../../../components/ui/Dialog';
import { FormField } from '../../../../../components/ui/FormField';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../components/ui/PageHeader';
import { Textarea } from '../../../../../components/ui/Textarea';
import { WaytaMark } from '../../../../../components/brand/Wayta';
import { cn } from '../../../../../lib/utils';

/** Brand colours of the hero (the Wayta identity: graphite, saffron, cream). */
const GRAPHITE = '#12100E';
const SAFFRON = '#F5A524';
const CREAM = '#FBF6EE';
const ALERT_RED = '#F87171';
const OK_GREEN = '#4ADE80';

const DAY_MS = 86_400_000;
const asDate = (value: string) => new Date(`${value}T12:00:00Z`);

const ICON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

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

  const open = data.openRequest;
  const sub = data.subscription;
  const canRenew = canRequest && !open && sub !== null && sub.phase !== 'CANCELLED';

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
        <PlanHero
          data={data}
          day={day}
          money={money}
          numberFmt={numberFmt}
          renew={canRenew ? () => openDialog({ kind: 'RENEWAL', option: null }) : null}
        />

        <ComparePlans
          data={data}
          numberFmt={numberFmt}
          money={money}
          day={day}
          onRequest={canRequest && !open ? (option) => openDialog({ kind: 'UPGRADE', option }) : null}
        />
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

/* ----------------------------------------------------------------------------------------- hero */

/**
 * The plan on a graphite "plate": the name and dates on one side and, on the other, a ring that empties
 * as the days go (the plate of the Wayta cloche). The money sits in one quiet strip underneath.
 */
function PlanHero({
  data,
  day,
  money,
  numberFmt,
  renew,
}: {
  data: MySubscription;
  day: (value: string) => string;
  money: (value: string, currency: string) => string;
  numberFmt: Intl.NumberFormat;
  renew: (() => void) | null;
}) {
  const { t } = useStaffI18n();
  const sub = data.subscription;
  const showRing = sub !== null && (sub.phase === 'ACTIVE' || sub.phase === 'GRACE');
  const urgent = sub !== null && (sub.phase === 'GRACE' || (sub.phase === 'ACTIVE' && sub.daysLeft <= 7));

  return (
    <section
      aria-label={t('subscription.plan')}
      className="relative isolate overflow-hidden rounded-3xl p-6 shadow-lg sm:p-8"
      style={{ backgroundColor: GRAPHITE, color: CREAM }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -end-24 -top-24 -z-10 h-80 w-80 rounded-full opacity-30 blur-3xl"
        style={{ backgroundColor: SAFFRON }}
      />
      <WaytaMark
        tone="dark"
        size={190}
        className="pointer-events-none absolute -bottom-10 -start-8 -z-10 opacity-[0.05] rtl:scale-x-[-1]"
      />

      <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: SAFFRON }}>
            {t('subscription.plan')}
          </p>
          <h2 className="mt-2 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            {sub?.packageName ?? data.package?.name ? (
              <bdi>{sub?.packageName ?? data.package?.name}</bdi>
            ) : (
              t('subscription.noPlanTitle')
            )}
          </h2>

          {sub ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <HeroChip dotColor={phaseDot(sub.phase)}>{t(`subscription.phase.${sub.phase}` as MessageKey)}</HeroChip>
                <HeroChip>{t(`subscription.period.${sub.period}` as MessageKey)}</HeroChip>
              </div>
              <p className="mt-4 text-sm opacity-80">
                {day(sub.startsAt)}
                <span aria-hidden="true" className="mx-2 inline-block rtl:rotate-180">
                  →
                </span>
                {day(sub.endsAt)}
              </p>
              {renew ? (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button
                    className="border-0 font-semibold hover:opacity-90"
                    style={{ backgroundColor: urgent ? SAFFRON : CREAM, color: GRAPHITE }}
                    onClick={renew}
                  >
                    {t('subscription.renew')}
                  </Button>
                  <span className="text-xs opacity-60">{t('subscription.renew.hint')}</span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-4 max-w-md">
              {data.package ? <p className="text-base font-medium">{t('subscription.noSubscription')}</p> : null}
              <p className="mt-1 text-sm opacity-70">{t('subscription.noSubscriptionHint')}</p>
            </div>
          )}
        </div>

        {sub && showRing ? <DaysRing sub={sub} graceDays={data.graceDays} numberFmt={numberFmt} urgent={urgent} /> : null}
      </div>

      {sub ? (
        <dl className="mt-8 grid grid-cols-3 gap-4 border-t pt-5" style={{ borderColor: 'rgba(251,246,238,0.14)' }}>
          <HeroFigure label={t('subscription.price')}>{money(sub.finalPrice, sub.currencyCode)}</HeroFigure>
          <HeroFigure label={t('subscription.paid')}>{money(sub.paid, sub.currencyCode)}</HeroFigure>
          <HeroFigure
            label={Number(sub.balance) > 0 ? t('subscription.balance') : t('subscription.payStatus.PAID')}
            tone={Number(sub.balance) > 0 ? 'warn' : 'ok'}
          >
            {Number(sub.balance) > 0 ? (
              money(sub.balance, sub.currencyCode)
            ) : (
              <svg {...ICON} className="h-6 w-6">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            )}
          </HeroFigure>
        </dl>
      ) : null}
    </section>
  );
}

function phaseDot(phase: PlanSubscription['phase']): string {
  if (phase === 'ACTIVE') return OK_GREEN;
  if (phase === 'GRACE' || phase === 'UPCOMING') return SAFFRON;
  return ALERT_RED;
}

function HeroChip({ children, dotColor }: { children: ReactNode; dotColor?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
      style={{ backgroundColor: 'rgba(251,246,238,0.1)' }}
    >
      {dotColor ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} /> : null}
      {children}
    </span>
  );
}

function HeroFigure({
  label,
  children,
  tone = 'plain',
}: {
  label: string;
  children: ReactNode;
  tone?: 'plain' | 'warn' | 'ok';
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] opacity-60">{label}</dt>
      <dd
        className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl"
        style={tone === 'warn' ? { color: SAFFRON } : tone === 'ok' ? { color: OK_GREEN } : undefined}
      >
        <bdi dir="ltr">{children}</bdi>
      </dd>
    </div>
  );
}

/** The ring: full when the period starts, empty when it ends. In the grace period it counts down the days to the pause. */
function DaysRing({
  sub,
  graceDays,
  numberFmt,
  urgent,
}: {
  sub: PlanSubscription;
  graceDays: number;
  numberFmt: Intl.NumberFormat;
  urgent: boolean;
}) {
  const { t } = useStaffI18n();
  const grace = sub.phase === 'GRACE';
  const total = grace
    ? Math.max(1, graceDays)
    : Math.max(1, Math.round((asDate(sub.endsAt).getTime() - asDate(sub.startsAt).getTime()) / DAY_MS));
  const value = grace ? sub.graceDaysLeft : sub.daysLeft;
  const fraction = Math.min(1, Math.max(0, value / total));
  const RADIUS = 54;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  // the ring draws itself in once (instant under reduced motion)
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      role="img"
      aria-label={`${numberFmt.format(value)} ${t(grace ? 'subscription.graceLeft' : 'subscription.daysLeft')}`}
      className="relative mx-auto h-44 w-44 shrink-0 sm:h-48 sm:w-48"
    >
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90 rtl:scale-x-[-1]" aria-hidden="true">
        <circle cx="66" cy="66" r={RADIUS} fill="none" stroke="rgba(251,246,238,0.1)" strokeWidth="9" />
        <circle
          cx="66"
          cy="66"
          r={RADIUS}
          fill="none"
          stroke={urgent ? ALERT_RED : SAFFRON}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={drawn ? CIRCUMFERENCE * (1 - fraction) : CIRCUMFERENCE}
          className="transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-5xl font-bold leading-none tabular-nums sm:text-6xl">{numberFmt.format(value)}</span>
        <span className="mt-2 max-w-[8rem] text-[11px] font-medium uppercase leading-tight tracking-[0.08em] opacity-60">
          {t(grace ? 'subscription.graceLeft' : 'subscription.daysLeft')}
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------------- comparison */

const Tick = ({ strong }: { strong: boolean }) => (
  <span
    className={cn(
      'inline-flex h-6 w-6 items-center justify-center rounded-full',
      strong ? 'bg-success text-white' : 'bg-success-soft text-success',
    )}
  >
    <svg {...ICON} className="h-3.5 w-3.5">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  </span>
);

/**
 * Your plan and the plans that would add something, side by side. A feature that is new for the restaurant
 * is highlighted in the column that would give it, so the page answers "what would I get?" at a glance.
 */
function ComparePlans({
  data,
  numberFmt,
  money,
  day,
  onRequest,
}: {
  data: MySubscription;
  numberFmt: Intl.NumberFormat;
  money: (value: string, currency: string) => string;
  day: (value: string) => string;
  onRequest: ((option: UpgradeOption) => void) | null;
}) {
  const { t } = useStaffI18n();
  const has = (key: PlanFeatureKey) => data.features.find((f) => f.key === key)?.included ?? false;
  const options = data.upgrades;
  const currentName = data.subscription?.packageName ?? data.package?.name ?? t('subscription.compare.yourPlan');

  if (options.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <Tick strong />
          <div>
            <h3 className="text-base font-semibold text-foreground">{t('subscription.upgrade.none')}</h3>
            <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {data.features
                .filter((f) => f.included)
                .map((f) => (
                  <li key={f.key} className="text-sm text-muted-foreground">
                    {t(`subscription.feature.${f.key}` as MessageKey)}
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={t('subscription.compare.title')} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm [contain:paint]">
      <div className="border-b border-border px-6 py-5">
        <h3 className="text-base font-semibold text-foreground">{t('subscription.compare.title')}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('subscription.compare.hint')}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky start-0 z-10 min-w-[150px] bg-card px-4 pb-4 sm:min-w-[230px] sm:px-6 pt-5 text-start align-bottom text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {t('subscription.compare.feature')}
              </th>
              <th scope="col" className="min-w-[130px] border-t-2 border-primary bg-primary/5 px-4 pb-4 pt-5 text-start align-top">
                <span className="inline-block whitespace-nowrap rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                  {t('subscription.compare.yourPlan')}
                </span>
                <p className="mt-2 text-lg font-bold text-foreground">
                  <bdi>{currentName}</bdi>
                </p>
              </th>
              {options.map((option, index) => (
                <th key={option.id} scope="col" className="min-w-[170px] border-t-2 border-transparent px-4 pb-4 pt-5 text-start align-top">
                  {index === 0 ? (
                    <span className="inline-block whitespace-nowrap rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {t('subscription.compare.nextStep')}
                    </span>
                  ) : (
                    <span className="inline-block h-[18px]" />
                  )}
                  <p className="mt-2 text-lg font-bold text-foreground">
                    <bdi>{option.name}</bdi>
                  </p>
                  <PlanPrice option={option} currency={data.billingCurrency} money={money} numberFmt={numberFmt} day={day} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.features.map((feature) => (
              <tr key={feature.key}>
                <th scope="row" className="sticky start-0 z-10 border-t border-border bg-card px-4 py-3.5 text-start font-normal sm:px-6">
                  <p className="font-medium text-foreground">{t(`subscription.feature.${feature.key}` as MessageKey)}</p>
                  <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
                    {t(`subscription.feature.${feature.key}.hint` as MessageKey)}
                  </p>
                </th>
                <td className="border-t border-border bg-primary/5 px-4 py-3.5 text-center">
                  <Cell
                    on={has(feature.key)}
                    isNew={false}
                    note={
                      feature.key === 'MENU_TEMPLATES' && has(feature.key)
                        ? t('subscription.compare.designTiers', { standard: data.templates.currentStandard, premium: data.templates.currentPremium })
                        : undefined
                    }
                  />
                </td>
                {options.map((option) => {
                  const on = option.features.includes(feature.key);
                  const designs = feature.key === 'MENU_TEMPLATES';
                  const isNew = on && (!has(feature.key) || (designs && (option.templateCount > data.templates.current || option.templatePremium > data.templates.currentPremium)));
                  return (
                    <td key={option.id} className={cn('border-t border-border px-4 py-3.5 text-center', isNew && 'bg-warning-soft/70')}>
                      <Cell
                        on={on}
                        isNew={isNew}
                        note={
                          designs && on
                            ? t('subscription.compare.designTiers', { standard: option.templateStandard, premium: option.templatePremium })
                            : undefined
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {onRequest ? (
            <tfoot>
              <tr>
                <td className="sticky start-0 z-10 border-t border-border bg-card" />
                <td className="border-t border-border bg-primary/5" />
                {options.map((option, index) => (
                  <td key={option.id} className="border-t border-border px-4 py-4">
                    <Button variant={index === 0 ? 'primary' : 'secondary'} className="w-full" onClick={() => onRequest(option)}>
                      {t('subscription.upgrade.request')}
                    </Button>
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}

function Cell({ on, isNew, note }: { on: boolean; isNew: boolean; note?: string }) {
  const { t } = useStaffI18n();
  return on ? (
    <>
      <Tick strong={isNew} />
      <span className="sr-only">{t('subscription.compare.included')}</span>
      {note ? <span className="mt-1 block text-[11px] font-medium text-muted-foreground">{note}</span> : null}
    </>
  ) : (
    <>
      <span aria-hidden="true" className="text-lg leading-none text-muted-foreground/40">
        —
      </span>
      <span className="sr-only">{t('subscription.compare.notIncluded')}</span>
    </>
  );
}

function PlanPrice({
  option,
  currency,
  money,
  numberFmt,
  day,
}: {
  option: UpgradeOption;
  currency: string;
  money: (value: string, currency: string) => string;
  numberFmt: Intl.NumberFormat;
  day: (value: string) => string;
}) {
  const { t } = useStaffI18n();
  if (option.priceMonthly === null && option.priceYearly === null) {
    return <p className="mt-1 text-xs font-normal text-muted-foreground">{t('subscription.upgrade.noPrice')}</p>;
  }
  return (
    <div className="mt-1 font-normal">
      {option.priceMonthly !== null ? (
        <p className="text-foreground">
          <bdi dir="ltr" className="text-base font-semibold tabular-nums">{money(option.priceMonthly, currency)}</bdi>
          <span className="ms-1 text-xs text-muted-foreground">{t('subscription.compare.perMonth')}</span>
        </p>
      ) : null}
      {option.priceYearly !== null ? (
        <p className="text-xs text-muted-foreground">
          <bdi dir="ltr" className="tabular-nums">{money(option.priceYearly, currency)}</bdi> {t('subscription.compare.perYear')}
        </p>
      ) : null}
      {option.offer ? (
        <p className="mt-1.5 inline-block rounded-md bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
          {t('subscription.upgrade.offer', { percent: numberFmt.format(Number(option.offer.percent)) })}
          {option.offer.endsAt ? ` · ${t('subscription.upgrade.offerUntil', { date: day(option.offer.endsAt) })}` : ''}
        </p>
      ) : null}
    </div>
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
