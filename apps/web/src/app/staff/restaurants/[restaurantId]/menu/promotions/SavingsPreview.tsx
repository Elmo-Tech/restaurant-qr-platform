'use client';

import { useState } from 'react';
import { Alert } from '../../../../../../components/ui/Alert';
import { Button } from '../../../../../../components/ui/Button';
import { Card } from '../../../../../../components/ui/Card';
import { FormField } from '../../../../../../components/ui/FormField';
import { Input } from '../../../../../../components/ui/Input';
import { Select } from '../../../../../../components/ui/Select';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { localizedName } from '../../../../../../lib/i18n/localized-name';
import type { MessageKey } from '../../../../../../lib/i18n/messages';
import { previewOrderTypes, previewPromotion, type PreviewOrderType, type Promotion, type PromotionPreview, type PromotionTargets } from '../../../../../../lib/promotions/api';
import { normalizePromotionNumber, toPromotionDraft, type DraftFields } from '../../../../../../lib/promotions/draft';
import { promotionError } from '../../../../../../lib/promotions/errors';

interface BasketRow { key: number; productId: string; quantity: string }
type PreviewRun = { key: string; result: PromotionPreview } | { key: string; error: MessageKey };

export function SavingsPreview({ restaurantId, original, fields, targets, currencyCode, disabled }: {
  restaurantId: string;
  original: Promotion | null;
  fields: DraftFields;
  targets: PromotionTargets;
  currencyCode: string;
  disabled: boolean;
}) {
  const { t, locale } = useStaffI18n();
  const branches = targets.branches.filter((branch) => branch.status === 'ACTIVE');
  const [branchId, setBranchId] = useState(() => branches.find((branch) => fields.branchIds.includes(branch.id))?.id ?? branches[0]?.id ?? '');
  const [orderType, setOrderType] = useState<PreviewOrderType>(fields.scope === 'DELIVERY' ? 'DELIVERY' : 'PICKUP');
  const [selectedZone, setSelectedZone] = useState('');
  const [basket, setBasket] = useState<BasketRow[]>([]);
  const [nextRow, setNextRow] = useState(0);
  const [run, setRun] = useState<PreviewRun | null>(null);
  const [pending, setPending] = useState(false);
  const products = targets.products.filter((item) => item.status === 'ACTIVE' && item.availability === 'AVAILABLE');
  const zones = targets.deliveryZones.filter((zone) => zone.branchId === branchId && zone.status === 'ACTIVE');
  const isDelivery = orderType === 'DELIVERY';
  const zoneId = isDelivery ? (zones.find((zone) => zone.id === selectedZone) ?? zones.find((zone) => fields.deliveryZoneIds.includes(zone.id)) ?? zones[0])?.id : undefined;
  const key = JSON.stringify([fields, branchId, orderType, zoneId, basket]);
  const current = run?.key === key ? run : null;
  const result = current && 'result' in current ? current.result : null;
  const selectedBranch = branches.find((branch) => branch.id === branchId);
  const money = (amount: string) => <bdi dir="ltr" className="tabular-nums">{amount} {currencyCode}</bdi>;

  async function calculate() {
    if (!selectedBranch || disabled || pending || (isDelivery && !zoneId)) return;
    const draft = toPromotionDraft(fields, targets);
    if ('error' in draft) { setRun({ key, error: draft.error }); return; }
    if ((!basket.length && !isDelivery) || basket.some((row) => !products.some((product) => product.id === row.productId) || !/^(?:[1-9]|[1-9][0-9])$/.test(row.quantity))) {
      setRun({ key, error: 'promotions.previewBasket' });
      return;
    }
    setPending(true);
    setRun(null);
    try {
      const result = await previewPromotion(restaurantId, {
        draft: draft.draft, promotionId: original?.id, branchId, orderType, deliveryZoneId: zoneId,
        items: basket.map(({ productId, quantity }) => ({ productId, quantity: Number(quantity) })),
      });
      setRun({ key, result });
    } catch (caught) {
      setRun({ key, error: promotionError(caught) });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="min-w-0 space-y-4 p-4 sm:p-6">
      <h2 className="text-base font-semibold">{t('promotions.preview')}</h2>
      <p className="text-sm text-muted-foreground">{t('promotions.previewHint')}</p>
      {!selectedBranch ? <Alert variant="info">{t('promotions.previewNoBranches')}</Alert> : null}
      <form onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
        <fieldset disabled={disabled || pending || !selectedBranch} className="min-w-0 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('promotions.previewBranch')} htmlFor="promo-preview-branch">
              <Select id="promo-preview-branch" value={branchId} onChange={(e) => { setBranchId(e.target.value); setSelectedZone(''); }}>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{localizedName(branch, locale)}</option>)}
              </Select>
            </FormField>
            <FormField label={t('promotions.previewType')} htmlFor="promo-preview-type">
              <Select id="promo-preview-type" value={orderType} onChange={(e) => { const next = previewOrderTypes.find((type) => type === e.target.value); if (next) setOrderType(next); }}>
                {previewOrderTypes.map((type) => <option key={type} value={type}>{t(`orders.type.${type}`)}</option>)}
              </Select>
            </FormField>
          </div>
          {selectedBranch ? <bdi className="text-xs text-muted-foreground">{selectedBranch.timezone}</bdi> : null}
          {isDelivery ? (
            <FormField label={t('promotions.previewZone')} htmlFor="promo-preview-zone">
              <Select id="promo-preview-zone" value={zoneId ?? ''} onChange={(e) => setSelectedZone(e.target.value)}>
                {!zoneId ? <option value="">{t('promotions.previewNoZones')}</option> : null}
                {zones.map((zone) => <option key={zone.id} value={zone.id}>{localizedName(zone, locale)}</option>)}
              </Select>
            </FormField>
          ) : null}
          {basket.map((row) => (
            <div key={row.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-lg border border-border p-3">
              <div className="col-span-2">
                <FormField label={t('promotions.previewProduct')} htmlFor={`promo-preview-product-${row.key}`}>
                  <Select id={`promo-preview-product-${row.key}`} required value={row.productId} onChange={(e) => setBasket((prior) => prior.map((item) => item.key === row.key ? { ...item, productId: e.target.value } : item))}>
                    <option value="">{t('promotions.previewChoose')}</option>
                    {products.map((item) => <option key={item.id} value={item.id}>{localizedName(item, locale)}</option>)}
                  </Select>
                </FormField>
              </div>
              <FormField label={t('promotions.previewQuantity')} htmlFor={`promo-preview-qty-${row.key}`}>
                <Input id={`promo-preview-qty-${row.key}`} dir="ltr" inputMode="numeric" required maxLength={2} value={row.quantity} onChange={(e) => setBasket((prior) => prior.map((item) => item.key === row.key ? { ...item, quantity: normalizePromotionNumber(e.target.value) } : item))} />
              </FormField>
              <Button type="button" variant="ghost" onClick={() => setBasket((prior) => prior.filter((item) => item.key !== row.key))}>{t('common.remove')}</Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={!products.length || basket.length >= 20} onClick={() => { setBasket((prior) => [...prior, { key: nextRow, productId: '', quantity: '1' }]); setNextRow((prior) => prior + 1); }}>{t('promotions.previewAdd')}</Button>
            <Button type="submit" disabled={isDelivery && !zoneId}>{t(pending ? 'common.loading' : 'promotions.previewRun')}</Button>
          </div>
        </fieldset>
      </form>
      {current && 'error' in current ? <Alert variant="error">{t(current.error)}</Alert> : null}
      {result ? (
        <div role="status" className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
          <p className="font-semibold">{t(`promotions.diagnostic.${result.diagnostic.status}`)}</p>
          <p className="text-xs text-muted-foreground">{t(`promotions.strategy.${result.strategy}`)}</p>
          <dl className="space-y-2 text-sm">
            <div className="grid gap-0.5 sm:flex sm:justify-between sm:gap-2"><dt>{t('promotions.previewMerchandise')}</dt><dd>{money(result.merchandiseOriginal)} / {money(result.merchandisePayable)}</dd></div>
            {isDelivery ? <div className="grid gap-0.5 sm:flex sm:justify-between sm:gap-2"><dt>{t('promotions.previewFee')}</dt><dd>{money(result.deliveryFeeOriginal)} / {money(result.deliveryFeePayable)}</dd></div> : null}
            <div className="grid gap-0.5 font-semibold sm:flex sm:justify-between sm:gap-2"><dt>{t('common.total')}</dt><dd>{money(result.grandTotal)}</dd></div>
            <div className="grid gap-0.5 sm:flex sm:justify-between sm:gap-2"><dt>{t('promotions.previewApplied')}</dt><dd>{money(result.appliedSaving)}</dd></div>
            {result.diagnostic.potentialSaving !== null ? <div className="grid gap-0.5 sm:flex sm:justify-between sm:gap-2"><dt>{t('promotions.previewPotential')}</dt><dd>{money(result.diagnostic.potentialSaving)}</dd></div> : null}
            {result.diagnostic.remainingAmount !== null ? <div className="grid gap-0.5 sm:flex sm:justify-between sm:gap-2"><dt>{t('promotions.previewRemainingAmount')}</dt><dd>{money(result.diagnostic.remainingAmount)}</dd></div> : null}
          </dl>
          {result.diagnostic.remainingQuantity !== null ? <p className="text-sm">{t('promotions.previewRemainingQuantity', { quantity: result.diagnostic.remainingQuantity })}</p> : null}
          {result.zoneMinimumShortfall !== null ? <Alert variant="warning">{t('promotions.previewShortfall', { amount: `\u2066${result.zoneMinimumShortfall} ${currencyCode}\u2069` })}</Alert> : null}
        </div>
      ) : null}
    </Card>
  );
}
