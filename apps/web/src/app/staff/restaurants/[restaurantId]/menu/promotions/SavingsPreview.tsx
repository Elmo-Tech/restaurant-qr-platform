'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge } from '../../../../../../components/ui/Badge';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { localizedName, type LocalizedNameSource } from '../../../../../../lib/i18n/localized-name';
import type { StaffLocale } from '../../../../../../lib/i18n/locale';
import type { MessageKey } from '../../../../../../lib/i18n/messages';
import { previewPromotion, type ApplicableProduct, type PreviewExample, type Promotion, type PromotionDraft, type PromotionTargets, type ReadyPreview, type ContextualPreview } from '../../../../../../lib/promotions/api';
import type { DraftFields } from '../../../../../../lib/promotions/draft';
import { isolateLtr } from '../../../../../../lib/promotions/describe';
import { promotionError } from '../../../../../../lib/promotions/errors';
import { planPreview, type PlannedRequest } from '../../../../../../lib/promotions/preview-plan';
import { isOutdated, schedulePreview, StalePreviewError } from '../../../../../../lib/promotions/preview-session';
import { competitionKey, diagnosticKey, excludedKey, illustrativeReasonKey, incompleteKey, isApplied, omittedKey, pairExamples, problemKey, showsPotential } from '../../../../../../lib/promotions/preview-view';

type Settled =
  | { key: string; planned: PlannedRequest; answer: ContextualPreview }
  | { key: string; error: MessageKey };

const stateTone = { REAL: 'success', ILLUSTRATIVE: 'warning', INCOMPLETE: 'neutral' } as const;
const box = 'rounded-xl bg-muted/40 p-4';

/**
 * Read-only "what customers save" panel for the Promotion editor (DEC-077 B4).
 *
 * It asks the Backend preview endpoint with the opt-in `CONTEXTUAL_V1` contract and only DISPLAYS the answer: every
 * amount, example, product, winner and reason code is the Backend's. The browser performs no money arithmetic.
 *
 * Freshness rules (PROMOTIONS_SPEC D3.7):
 *  - an answer is bound to the draft (and the stored promotion version) it answers;
 *  - while a newer answer loads, the previous one is dimmed and labelled as the previous edit's result;
 *  - after a failed request, or when the draft becomes incomplete, no earlier figure is shown;
 *  - an INCOMPLETE answer shows the missing items only, never a price.
 */
export function SavingsPreview({ restaurantId, original, fields, targets, currencyCode, disabled }: {
  restaurantId: string;
  original: Promotion | null;
  fields: DraftFields;
  targets: PromotionTargets;
  currencyCode: string;
  /** Pauses new requests (e.g. while saving); the editor passes the saved promotion afterwards, which asks again. */
  disabled: boolean;
}) {
  const { t, formatTime } = useStaffI18n();
  const plan = useMemo(() => planPreview(fields, targets, original), [fields, targets, original]);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const planKey = plan.kind === 'request' ? plan.key : null;
  const [lastPlanKey, setLastPlanKey] = useState(planKey);
  const [generation, setGeneration] = useState(0);
  const [wasDisabled, setWasDisabled] = useState(disabled);
  // A → B → A is still a new request: never revive the earlier A answer as current.
  if (planKey !== lastPlanKey) {
    setLastPlanKey(planKey);
    setGeneration((value) => value + 1);
    if (planKey === null) setSettled(null);
  }
  const requestKey = planKey === null ? null : JSON.stringify([planKey, generation, attempt]);
  if (disabled !== wasDisabled) {
    setWasDisabled(disabled);
    if (disabled) setSettled(null);
  }

  useEffect(() => {
    if (plan.kind !== 'request' || disabled || requestKey === null) return;
    const key = requestKey;
    const planned = plan.request;
    // The cleanup cancels the timer and aborts the request, so an older answer can never replace a newer one.
    return schedulePreview(planned, {
      fetcher: (request, signal) => previewPromotion(restaurantId, request, signal),
      onPending: () => setPendingKey(key),
      onResult: (_id, answer) => { setSettled({ key, planned, answer }); setPendingKey(null); },
      onError: (_id, caught) => {
        setSettled({ key, error: caught instanceof StalePreviewError ? 'promotions.preview.failed' : promotionError(caught) });
        setPendingKey(null);
      },
    });
    // `plan` is fully described by `requestKey`; `attempt` re-asks after a failure or a manual refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, disabled, restaurantId, attempt]);

  const money = (value: string) => <bdi dir="ltr" className="tabular-nums">{value} {currencyCode}</bdi>;
  const isolated = (value: string) => isolateLtr(`${value} ${currencyCode}`);

  const answered = settled && 'answer' in settled ? settled : null;
  const failed = settled && 'error' in settled && settled.key === requestKey ? settled.error : null;
  const outdated = answered !== null && isOutdated(answered.key, requestKey);
  const updating = plan.kind === 'request' && failed === null && (pendingKey === requestKey || settled?.key !== requestKey);
  const shown = plan.kind === 'request' && failed === null ? answered : null;
  const state = plan.kind === 'incomplete' ? 'INCOMPLETE' : failed ? null : shown?.answer.state ?? null;

  let body: ReactNode;
  if (plan.kind === 'incomplete') {
    body = <p className={`${box} text-sm text-muted-foreground`}>{t(incompleteKey(plan.reason))}</p>;
  } else if (failed) {
    body = (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/25 bg-destructive-soft px-4 py-3 text-sm text-destructive">
        <span>{t(failed === 'error.network' || failed === 'promotions.requestError' ? 'promotions.preview.failed' : failed)}</span>
        <RetryButton onClick={() => setAttempt((value) => value + 1)} label={t('promotions.preview.retry')} />
      </div>
    );
  } else if (!shown) {
    body = <div className="h-40 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" aria-hidden="true" />;
  } else {
    body = (
      <div className="space-y-3">
        {outdated ? <p className="text-xs font-medium text-muted-foreground" data-testid="savings-preview-stale">{t('promotions.preview.staleNote')}</p> : null}
        {/* A previous answer is dimmed and inert until the answer to the current draft arrives. */}
        <div inert={outdated || undefined} data-testid="savings-preview-result" data-fresh={!outdated}
          className={`space-y-3 transition-opacity motion-reduce:transition-none ${outdated ? 'opacity-50' : ''}`}>
          {shown.answer.state === 'INCOMPLETE'
            ? <IncompleteBody problems={shown.answer.problems} />
            : <ReadyBody answer={shown.answer} draft={shown.planned.draft} targets={targets} money={money} isolated={isolated} />}
        </div>
      </div>
    );
  }

  const evaluatedAt = shown && !outdated ? shown.answer.evaluatedAt : null;
  return (
    <section aria-labelledby="savings-preview-title" aria-busy={updating} data-testid="savings-preview" data-state={state ?? 'UNAVAILABLE'}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="savings-preview-title" className="text-sm font-semibold text-foreground">{t('promotions.preview')}</h2>
        {state ? <span data-testid="savings-preview-state"><Badge variant={stateTone[state]}>{t(`promotions.preview.state.${state}`)}</Badge></span> : null}
      </div>
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p role="status" aria-live="polite" data-testid="savings-preview-status">
          {updating ? t('promotions.preview.updating') : evaluatedAt ? t('promotions.preview.calculatedAt', { time: formatTime(evaluatedAt) }) : t('promotions.preview.hint')}
        </p>
        {plan.kind === 'request' && !updating && !failed ? <RetryButton onClick={() => setAttempt((value) => value + 1)} label={t('promotions.preview.refresh')} /> : null}
      </div>
      {state && state !== 'ILLUSTRATIVE' ? <p className="text-xs text-muted-foreground">{t(`promotions.preview.stateHelp.${state}`)}</p> : null}
      {body}
    </section>
  );
}

function RetryButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
      {label}
    </button>
  );
}

function IncompleteBody({ problems }: { problems: { code: string; field: string }[] }) {
  const { t } = useStaffI18n();
  return (
    <ul className={`${box} list-disc space-y-1 ps-8 text-sm text-foreground`} data-testid="savings-preview-problems">
      {problems.map((problem, index) => <li key={`${problem.code}-${problem.field}-${index}`}>{t(problemKey(problem.code))}</li>)}
    </ul>
  );
}

type Money = (value: string) => ReactNode;
type Isolated = (value: string) => string;

function ReadyBody({ answer, draft, targets, money, isolated }: { answer: ReadyPreview; draft: PromotionDraft; targets: PromotionTargets; money: Money; isolated: Isolated }) {
  const { t, locale } = useStaffI18n();
  const { assumptions } = answer;
  const illustrative = answer.state === 'ILLUSTRATIVE';
  const branch = targets.branches.find((item) => item.id === assumptions.branchId);
  const zone = assumptions.deliveryZoneId ? targets.deliveryZones.find((item) => item.id === assumptions.deliveryZoneId) : undefined;
  const branchName = branch ? localizedName(branch, locale) : '';
  const context = assumptions.orderType === 'DELIVERY'
    ? zone ? t('promotions.preview.contextDelivery', { zone: localizedName(zone, locale), branch: branchName }) : t('promotions.preview.contextDeliverySample', { branch: branchName })
    : t('promotions.preview.contextPickup', { branch: branchName });
  const { below, qualifying, single } = pairExamples(answer);
  const ordered = [below, qualifying, single].filter((example): example is PreviewExample => example !== null);
  return (
    <>
      {illustrative ? (
        <div className="space-y-1 rounded-lg border border-dashed border-warning/50 bg-warning-soft px-3 py-2 text-sm text-warning" data-testid="savings-preview-illustrative">
          <p className="font-semibold">{t('promotions.preview.stateHelp.ILLUSTRATIVE')}</p>
          {assumptions.illustrativeReasons.map((reason) => <p key={reason}>{t(illustrativeReasonKey(reason))}</p>)}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground"><bdi>{context}</bdi></p>
      {assumptions.schedule !== 'CURRENT' ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning" data-testid="savings-preview-schedule">{t(`promotions.preview.schedule.${assumptions.schedule}`)}</p> : null}
      <AppliesTo draft={draft} targets={targets} answer={answer} money={money} isolated={isolated} />
      {ordered.map((example) => (
        <ExampleCard key={example.kind} example={example} draft={draft} answer={answer} targets={targets} money={money} isolated={isolated} />
      ))}
      {answer.omittedExamples.map((omitted) => <p key={omitted.kind} className="text-xs text-muted-foreground" data-testid={`savings-preview-omitted-${omitted.kind}`}>{t(omittedKey(omitted.reason))}</p>)}
      <p className="text-xs text-muted-foreground">
        {t('promotions.preview.assumptions', { date: isolateLtr(answer.branchLocalDate), branch: branchName })}
      </p>
    </>
  );
}

function names(ids: string[], options: (LocalizedNameSource & { id: string })[], locale: StaffLocale, missing: string): string[] {
  return ids.map((id) => {
    const option = options.find((item) => item.id === id);
    return option ? localizedName(option, locale) : missing;
  });
}

/** The actual selected targets and the products the promotion applies to, as the Backend reports them. */
function AppliesTo({ draft, targets, answer, money, isolated }: { draft: PromotionDraft; targets: PromotionTargets; answer: ReadyPreview; money: Money; isolated: Isolated }) {
  const { t, locale } = useStaffI18n();
  const missing = t('promotions.unavailableSelection');
  const rows: { label: string; value: ReactNode }[] = [];
  const list = (ids: string[], options: (LocalizedNameSource & { id: string })[]) => <bdi>{names(ids, options, locale, missing).join(' · ')}</bdi>;
  if (draft.scope === 'CATEGORY') rows.push({ label: t('promotions.categoryTargets'), value: list(draft.categoryIds, targets.categories) });
  if (draft.scope === 'MENU') rows.push({ label: t('promotions.menuTargets'), value: list(draft.menuIds, targets.menus) });
  if (draft.scope === 'CART' || draft.scope === 'QUANTITY') {
    if (draft.categoryIds.length || draft.productIds.length) {
      if (draft.categoryIds.length) rows.push({ label: t('promotions.categoryTargets'), value: list(draft.categoryIds, targets.categories) });
      if (draft.productIds.length) rows.push({ label: t('promotions.productTargets'), value: list(draft.productIds, targets.products) });
    } else rows.push({ label: t('promotions.preview.appliesTo'), value: t('promotions.preview.appliesAll') });
  }
  if (draft.scope === 'DELIVERY') {
    rows.push({ label: t('promotions.preview.appliesTo'), value: t('promotions.preview.appliesFee') });
    rows.push({ label: t('promotions.zoneTargets'), value: draft.deliveryZoneIds.length ? list(draft.deliveryZoneIds, targets.deliveryZones) : t('promotions.allZones') });
  }
  rows.push({ label: t('promotions.branchTargets'), value: draft.branchIds.length ? list(draft.branchIds, targets.branches) : t('promotions.preview.branchesAll') });

  const { applicableProducts: products } = answer;
  const itemScope = draft.scope === 'CATEGORY' || draft.scope === 'MENU';
  const showProducts = answer.state === 'REAL' && draft.scope !== 'DELIVERY';
  return (
    <div className="space-y-2 text-sm" data-testid="savings-preview-applies-to">
      <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[max-content_1fr]">
        {rows.map((row) => <div key={row.label} className="contents"><dt className="text-muted-foreground">{row.label}</dt><dd className="min-w-0 break-words font-medium">{row.value}</dd></div>)}
      </dl>
      {showProducts ? (
        <div className="space-y-1" data-testid="savings-preview-products">
          <p className="font-medium">
            {products.total === 0 ? t('promotions.preview.productsNone')
              : t(products.truncated ? 'promotions.preview.productsAtLeast' : 'promotions.preview.productsTotal', { count: products.total })}
          </p>
          {products.items.length ? (
            <ul className="space-y-1">
              {products.items.map((item) => <ProductRow key={item.productId} item={item} targets={targets} itemScope={itemScope} money={money} isolated={isolated} />)}
            </ul>
          ) : null}
        </div>
      ) : null}
      {products.excluded.map((entry) => <p key={entry.code} className="text-xs text-muted-foreground" data-testid="savings-preview-excluded">{t(excludedKey(entry.code), { count: entry.count })}</p>)}
    </div>
  );
}

function ProductRow({ item, targets, itemScope, money, isolated }: { item: ApplicableProduct; targets: PromotionTargets; itemScope: boolean; money: Money; isolated: Isolated }) {
  const { t, locale } = useStaffI18n();
  const product = targets.products.find((candidate) => candidate.id === item.productId);
  const after = itemScope ? item.unitPriceAfter : undefined;
  return (
    <li className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-sm">
      <bdi dir="auto" className="min-w-0 break-words font-semibold text-foreground">{product ? localizedName(product, locale) : item.name}</bdi>
      <span className="text-muted-foreground">
        {after && item.unitSaving !== undefined ? t('promotions.preview.productPotential', { after: isolated(after), before: isolated(item.unitPrice), saving: isolated(item.unitSaving) }) : money(item.unitPrice)}
      </span>
    </li>
  );
}

function ExampleCard({ example, draft, answer, targets, money, isolated }: { example: PreviewExample; draft: PromotionDraft; answer: ReadyPreview; targets: PromotionTargets; money: Money; isolated: Isolated }) {
  const { t, locale } = useStaffI18n();
  const { diagnostic } = example;
  const delivery = answer.assumptions.orderType === 'DELIVERY';
  const applied = isApplied(example);
  const feeChanged = example.deliveryFeeOriginal !== example.deliveryFeePayable;
  const merchandiseChanged = example.merchandiseOriginal !== example.merchandisePayable;
  const payable = delivery && draft.scope === 'DELIVERY' ? example.deliveryFeePayable : example.merchandisePayable;
  const original = delivery && draft.scope === 'DELIVERY' ? example.deliveryFeeOriginal : example.merchandiseOriginal;
  const changed = delivery && draft.scope === 'DELIVERY' ? feeChanged : merchandiseChanged;
  const explanation = t(diagnosticKey(diagnostic.status), {
    amount: diagnostic.remainingAmount !== null ? isolated(diagnostic.remainingAmount) : '',
    quantity: diagnostic.remainingQuantity ?? 0,
  });
  const alternative = example.uncertainty?.alternative;
  const winner = example.competingWinner;
  const checkoutKnown = delivery && answer.state === 'REAL' && answer.assumptions.deliveryZoneId !== null;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4" data-testid={`savings-preview-example-${example.kind}`}>
      <h3 className="text-sm font-semibold text-foreground">{t(`promotions.preview.example.${example.kind}`)}</h3>
      <ul className="space-y-1">
        {example.lines.map((line, index) => {
          const product = line.productId ? targets.products.find((candidate) => candidate.id === line.productId) : undefined;
          return (
            <li key={`${line.productId ?? 'sample'}-${index}`} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="min-w-0 break-words">
                <bdi dir="auto" className="font-semibold text-foreground">{line.productId === null ? t('promotions.preview.sampleItem', { n: index + 1 }) : product ? localizedName(product, locale) : line.label}</bdi>
                {line.quantity > 1 ? <span className="text-muted-foreground"> · {t('promotions.preview.quantity', { count: isolateLtr(String(line.quantity)) })}</span> : null}
              </span>
              <span className="text-muted-foreground">{t('promotions.preview.each', { price: isolated(line.unitPrice) })}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t(delivery && draft.scope === 'DELIVERY' ? 'promotions.preview.deliveryFeeAfter' : 'promotions.preview.payable')}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="savings-preview-payable">{money(payable)}</p>
        </div>
        {changed ? (
          <div className="text-end">
            <p className="text-xs text-muted-foreground">{t('promotions.preview.original')}</p>
            <p className="text-sm text-muted-foreground line-through" data-testid="savings-preview-original">{money(original)}</p>
          </div>
        ) : null}
      </div>
      {delivery ? <p className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-muted-foreground">{t('promotions.preview.orderTotal')}</span><span data-testid="savings-preview-total">{money(example.grandTotal)}</span></p> : null}
      {applied ? (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm font-semibold text-success" data-testid="savings-preview-saving">
          <span>{t('promotions.preview.applied')}</span>{money(example.appliedSaving)}
        </p>
      ) : null}
      <p className={`text-sm font-medium ${applied ? 'text-success' : 'text-foreground'}`} data-testid="savings-preview-diagnostic" data-status={diagnostic.status}>{explanation}</p>
      {diagnostic.status === 'BELOW_MINIMUM_QUANTITY' && diagnostic.remainingAmount !== null ? (
        <p className="text-sm text-muted-foreground">{t('promotions.preview.additionalShortfall', { amount: isolated(diagnostic.remainingAmount) })}</p>
      ) : null}
      {showsPotential(example) ? <p className="text-sm text-muted-foreground" data-testid="savings-preview-potential">{t('promotions.preview.potential', { amount: isolated(diagnostic.potentialSaving) })}</p> : null}
      {winner ? (
        <div className="space-y-1 rounded-lg border border-border bg-card px-3 py-2 text-sm" data-testid="savings-preview-winner" data-reason={winner.reason}>
          <p className="font-semibold">{t('promotions.preview.winner.title')}</p>
          <p className="text-muted-foreground">{t(competitionKey(winner.reason))}</p>
          <ul className="space-y-0.5">
            {winner.winners.map((part, index) => (
              <li key={`${part.promotionId ?? 'product'}-${index}`}>
                <bdi dir="auto">{t('promotions.preview.winner.line', {
                  name: part.name ?? t('promotions.preview.winner.productDiscount'),
                  discount: isolateLtr(part.discountType === 'PERCENTAGE' ? `${part.value}%` : isolated(part.value)),
                  saving: isolated(part.saving),
                })}</bdi>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">{t(winner.reason === 'ITEM_OFFER_BEATEN_BY_CART_LEVEL' ? 'promotions.preview.winner.totalsCart' : 'promotions.preview.winner.totals', { saving: isolated(winner.saving), compared: isolated(winner.comparedSaving) })}</p>
        </div>
      ) : null}
      {alternative ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning" data-testid="savings-preview-tie">
          {t('promotions.preview.tie')}{' '}
          {alternative.status === 'APPLIED' ? t('promotions.preview.tieAlt.APPLIED', { amount: isolated(alternative.appliedSaving) }) : t('promotions.preview.tieAlt.OTHER')}
        </p>
      ) : null}
      {checkoutKnown ? (
        <div className="space-y-0.5 border-t border-border pt-2 text-sm" data-testid="savings-preview-checkout" data-eligible={example.zoneMinimumShortfall === null}>
          <p className="font-semibold">{t('promotions.preview.checkout.title')}</p>
          <p className={example.zoneMinimumShortfall === null ? 'text-muted-foreground' : 'text-warning'}>
            {example.zoneMinimumShortfall === null ? t('promotions.preview.checkout.ok') : t('promotions.preview.checkout.shortfall', { amount: isolated(example.zoneMinimumShortfall) })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
