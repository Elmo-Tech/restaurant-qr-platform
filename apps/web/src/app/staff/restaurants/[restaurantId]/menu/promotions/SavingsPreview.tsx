'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge } from '../../../../../../components/ui/Badge';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { localizedName } from '../../../../../../lib/i18n/localized-name';
import type { MessageKey } from '../../../../../../lib/i18n/messages';
import { previewPromotion, type Promotion, type PromotionTargets } from '../../../../../../lib/promotions/api';
import type { DraftFields } from '../../../../../../lib/promotions/draft';
import { promotionError } from '../../../../../../lib/promotions/errors';
import { isZeroAmount, planSavingsPreview, schedulePreview, type IllustrativeExample, type LiveOutcome, type SavingsPreviewPlan } from '../../../../../../lib/promotions/savings-preview';

type LivePlan = Extract<SavingsPreviewPlan, { kind: 'live' }>;
/** Each answer keeps the plan it answers, so names and prices always belong together. */
type Settled = { key: string; plan: LivePlan; outcome: LiveOutcome } | { key: string; error: MessageKey };

const GENERIC_FAILURES: MessageKey[] = ['error.network', 'promotions.requestError'];

/**
 * Read-only "what the customer saves" card. It builds a small real example
 * from the restaurant's own menu, asks the existing Backend preview endpoint
 * (which runs the real promotion engine and writes nothing), and refreshes by
 * itself while the form changes. When no real example is possible it shows a
 * clearly labelled illustration with made-up prices, never sent to the API.
 */
export function SavingsPreview({ restaurantId, original, fields, targets, currencyCode, disabled }: {
  restaurantId: string;
  original: Promotion | null;
  fields: DraftFields;
  targets: PromotionTargets;
  currencyCode: string;
  /** Pauses new calculations (e.g. while saving); the last result stays visible. */
  disabled: boolean;
}) {
  const { t, locale } = useStaffI18n();
  const plan = useMemo(() => planSavingsPreview(fields, targets, original), [fields, targets, original]);
  const requestKey = plan.kind === 'live' ? JSON.stringify(plan.input) : null;
  const [settled, setSettled] = useState<Settled | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (plan.kind !== 'live' || requestKey === null || disabled) return;
    const key = requestKey;
    const asked = plan;
    // The cleanup cancels the debounce timer and aborts the request, so an older answer can never replace a newer one.
    return schedulePreview(plan.input, {
      fetcher: (input, signal) => previewPromotion(restaurantId, input, signal),
      onPending: () => setPendingKey(key),
      onResult: (outcome) => { setSettled({ key, plan: asked, outcome }); setPendingKey(null); },
      onError: (caught) => { setSettled({ key, error: promotionError(caught) }); setPendingKey(null); },
    });
    // `plan` is fully described by `requestKey`; `attempt` re-runs after a failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, disabled, restaurantId, attempt]);

  const money = (amount: string) => <bdi dir="ltr" className="tabular-nums">{amount} {currencyCode}</bdi>;
  const isolated = (amount: string) => `\u2066${amount} ${currencyCode}\u2069`;
  const updating = plan.kind === 'live' && (pendingKey === requestKey || settled?.key !== requestKey) && !disabled;

  let badge: ReactNode = null;
  let body: ReactNode;
  if (plan.kind === 'incomplete') {
    body = <p role="status" className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">{t(`promotions.previewIncomplete.${plan.reason}`)}</p>;
  } else if (plan.kind === 'illustrative') {
    badge = <Badge variant="warning">{t('promotions.previewExample')}</Badge>;
    body = (
      <>
        <p className="text-sm text-muted-foreground">{t(`promotions.previewReason.${plan.reason}`, { quantity: plan.requiredQuantity ?? 0 })}</p>
        <ExampleCard example={plan.example} money={money} />
        <p className="text-xs font-medium text-warning">{t('promotions.previewExampleNote')}</p>
      </>
    );
  } else {
    badge = <Badge variant="success">{t('promotions.previewLive')}</Badge>;
    // Show the latest answer; while a newer one loads, keep the previous one dimmed instead of flashing.
    const current = settled && 'outcome' in settled ? settled : null;
    const failed = settled && 'error' in settled && settled.key === requestKey ? settled.error : null;
    const context = plan.zone
      ? t('promotions.previewContextDelivery', { zone: localizedName(plan.zone, locale), branch: localizedName(plan.branch, locale) })
      : t('promotions.previewContext', { branch: localizedName(plan.branch, locale) });
    body = (
      <>
        {failed ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/25 bg-destructive-soft px-4 py-3 text-sm text-destructive">
            <span>{t(GENERIC_FAILURES.includes(failed) ? 'promotions.previewFailed' : failed)}</span>
            <button type="button" className="min-h-11 rounded-md px-3 font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setAttempt((value) => value + 1)}>
              {t('promotions.previewRetry')}
            </button>
          </div>
        ) : current ? (
          <div className={updating ? 'opacity-60 transition-opacity motion-reduce:transition-none' : 'transition-opacity motion-reduce:transition-none'}>
            <LiveCard outcome={current.outcome} plan={current.plan} money={money} isolated={isolated} />
          </div>
        ) : (
          <div className="h-40 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" aria-hidden="true" />
        )}
        <p className="text-xs text-muted-foreground"><bdi>{context}</bdi></p>
        {plan.requiredQuantity !== null ? (
          <p className="text-xs text-muted-foreground">
            {t(plan.input.draft.quantityBasis === 'DISTINCT_PRODUCTS' ? 'promotions.previewDistinctNeeded' : 'promotions.previewQuantityNeeded', { quantity: plan.requiredQuantity })}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{t('promotions.previewNote')}</p>
      </>
    );
  }

  return (
    <section aria-labelledby="savings-preview-title" aria-busy={updating} data-testid="savings-preview" className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="savings-preview-title" className="text-sm font-semibold text-foreground">{t('promotions.preview')}</h2>
        <div className="flex items-center gap-2">
          {updating ? <span className="text-xs text-muted-foreground">{t('promotions.previewUpdating')}</span> : null}
          {badge}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('promotions.previewHint')}</p>
      {body}
    </section>
  );
}

function PriceBlock({ label, original, payable, saving, money }: {
  label: string;
  original: string;
  payable: string;
  saving: string | null;
  money: (amount: string) => ReactNode;
}) {
  const { t } = useStaffI18n();
  const changed = original !== payable;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="savings-preview-payable">{money(payable)}</p>
        </div>
        {changed ? (
          <div className="text-end">
            <p className="text-xs text-muted-foreground">{t('promotions.previewOriginal')}</p>
            <p className="text-sm text-muted-foreground line-through" data-testid="savings-preview-original">{money(original)}</p>
          </div>
        ) : null}
      </div>
      {saving !== null ? (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm font-semibold text-success" data-testid="savings-preview-saving">
          <span>{t('promotions.previewSaves')}</span>{money(saving)}
        </p>
      ) : null}
    </div>
  );
}

function ItemList({ lines }: { lines: { key: string; name: ReactNode; quantity: number }[] }) {
  return (
    <ul className="space-y-1">
      {lines.map((line) => (
        <li key={line.key} className="flex min-w-0 items-baseline justify-between gap-2">
          <bdi dir="auto" className="min-w-0 break-words font-semibold text-foreground">{line.name}</bdi>
          {line.quantity > 1 ? <span className="shrink-0 text-sm text-muted-foreground"><bdi dir="ltr">× {line.quantity}</bdi></span> : null}
        </li>
      ))}
    </ul>
  );
}

function LiveCard({ outcome, plan, money, isolated }: {
  outcome: LiveOutcome;
  plan: LivePlan;
  money: (amount: string) => ReactNode;
  isolated: (amount: string) => string;
}) {
  const { t, locale } = useStaffI18n();
  const { result, input, adjustedForMinimum } = outcome;
  const { lines } = plan;
  const delivery = plan.zone !== null;
  const minimum = plan.input.draft.minimumSubtotal;
  const { diagnostic } = result;
  const applied = diagnostic.status === 'APPLIED' && !isZeroAmount(result.appliedSaving);
  const quantities = new Map(input.items.map((item) => [item.productId, item.quantity]));
  const items = lines.map(({ product }) => ({ key: product.id, name: localizedName(product, locale), quantity: quantities.get(product.id) ?? 1 }));
  const explanation = t(`promotions.diagnostic.${diagnostic.status}`, {
    amount: diagnostic.remainingAmount !== null ? isolated(diagnostic.remainingAmount) : '',
    quantity: diagnostic.remainingQuantity ?? 0,
  });

  return (
    <div className="space-y-4 rounded-xl bg-muted/40 p-4">
      {delivery ? (
        <>
          <PriceBlock label={t('promotions.previewDeliveryFee')} original={result.deliveryFeeOriginal} payable={result.deliveryFeePayable} saving={applied ? result.appliedSaving : null} money={money} />
          <div className="space-y-1 border-t border-border pt-3 text-sm">
            <p className="text-xs text-muted-foreground">{t('promotions.previewOrder')}</p>
            {items.length ? <ItemList lines={items} /> : null}
            <p className="flex justify-between gap-2"><span className="text-muted-foreground">{t('promotions.previewPays')}</span>{money(result.grandTotal)}</p>
          </div>
        </>
      ) : (
        <>
          <ItemList lines={items} />
          <PriceBlock label={t(applied ? 'promotions.previewAfter' : 'promotions.previewPays')} original={result.merchandiseOriginal} payable={result.merchandisePayable} saving={applied ? result.appliedSaving : null} money={money} />
        </>
      )}
      <div role="status" aria-live="polite" className="space-y-1 text-sm">
        <p className={applied ? 'font-medium text-success' : 'font-medium text-foreground'}>{explanation}</p>
        {diagnostic.status === 'LOST_TO_BETTER_OFFER' && diagnostic.potentialSaving !== null && !isZeroAmount(diagnostic.potentialSaving) ? (
          <p className="text-muted-foreground">{t('promotions.previewLostPotential', { amount: isolated(diagnostic.potentialSaving) })}</p>
        ) : null}
        {adjustedForMinimum && minimum !== null ? <p className="text-muted-foreground">{t('promotions.previewMinimumAdjusted', { amount: isolated(minimum) })}</p> : null}
        {result.zoneMinimumShortfall !== null ? <p className="text-warning">{t('promotions.previewZoneMinimum', { amount: isolated(result.zoneMinimumShortfall) })}</p> : null}
      </div>
    </div>
  );
}

function ExampleCard({ example, money }: { example: IllustrativeExample; money: (amount: string) => ReactNode }) {
  const { t } = useStaffI18n();
  const name = example.distinct ? t('promotions.previewExampleItems', { count: example.quantity }) : t('promotions.previewExampleItem');
  const items = <ItemList lines={[{ key: 'example', name, quantity: example.distinct ? 1 : example.quantity }]} />;
  const saving = isZeroAmount(example.saving) ? null : example.saving;
  return (
    <div className="space-y-4 rounded-xl border border-dashed border-warning/40 bg-muted/40 p-4" data-testid="savings-preview-example">
      {example.deliveryFee !== null && example.deliveryFeePayable !== null ? (
        <>
          <PriceBlock label={t('promotions.previewDeliveryFee')} original={example.deliveryFee} payable={example.deliveryFeePayable} saving={saving} money={money} />
          <div className="space-y-1 border-t border-border pt-3 text-sm">
            <p className="text-xs text-muted-foreground">{t('promotions.previewOrder')}</p>
            {items}
          </div>
        </>
      ) : (
        <>
          {items}
          <PriceBlock label={t('promotions.previewAfter')} original={example.original} payable={example.payable} saving={saving} money={money} />
        </>
      )}
    </div>
  );
}
