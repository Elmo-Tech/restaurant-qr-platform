'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Alert } from '../../../../../../components/ui/Alert';
import { Badge } from '../../../../../../components/ui/Badge';
import { Button } from '../../../../../../components/ui/Button';
import { Card } from '../../../../../../components/ui/Card';
import { Dialog } from '../../../../../../components/ui/Dialog';
import { FormField } from '../../../../../../components/ui/FormField';
import { Input } from '../../../../../../components/ui/Input';
import { Select } from '../../../../../../components/ui/Select';
import { Textarea } from '../../../../../../components/ui/Textarea';
import { ApiError } from '../../../../../../lib/api/errors';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { localizedName } from '../../../../../../lib/i18n/localized-name';
import type { MessageKey } from '../../../../../../lib/i18n/messages';
import { promotionScopes, savePromotion, type Promotion, type PromotionOption, type PromotionTargets } from '../../../../../../lib/promotions/api';
import { blankDraft, hasItemRestrictions, isPercentageOnly, normalizePromotionNumber, toPromotionDraft, widening, type DraftFields } from '../../../../../../lib/promotions/draft';
import { needsPromotionReload, promotionError } from '../../../../../../lib/promotions/errors';
import { localeDirection, localeLabel } from '../../../../../../lib/settings/locale-labels';
import { SavingsPreview } from './SavingsPreview';

const sectionTitle = 'text-base font-semibold text-foreground';
const disclosure = 'min-h-11 cursor-pointer rounded-md py-2 font-semibold focus-visible:outline-2 focus-visible:outline-ring';
const helper = 'text-sm text-muted-foreground';
const check = 'size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function TargetChoices({ title, hint, options, selected, onChange }: {
  title: string; hint?: string; options: PromotionOption[]; selected: string[]; onChange: (ids: string[]) => void;
}) {
  const { t, locale } = useStaffI18n();
  const [search, setSearch] = useState('');
  const term = search.trim().toLocaleLowerCase(locale);
  const missing = selected.filter((id) => !options.some((item) => item.id === id));
  const visible = options.filter((item) => !term || [localizedName(item, locale), item.name, ...(item.translations?.map((row) => row.name) ?? [])]
    .some((name) => name.toLocaleLowerCase(locale).includes(term)));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  return (
    <fieldset className="min-w-0 space-y-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {hint ? <p className={helper}>{hint}</p> : null}
      <p className="text-xs text-muted-foreground">{t('promotions.selectedCount', { count: selected.length })}</p>
      {options.length > 6 ? <Input aria-label={t('promotions.targetSearch', { target: title })} placeholder={t('promotions.targetSearch', { target: title })} value={search} dir="auto" onChange={(e) => setSearch(e.target.value)} /> : null}
      {!visible.length && !missing.length ? <p className={helper}>{t('promotions.noTargets')}</p> : null}
      <div className="max-h-52 overflow-y-auto overscroll-contain">
        {visible.map((item) => (
          <label className="flex min-h-11 cursor-pointer items-center gap-2 border-b border-border px-1 text-sm last:border-b-0 hover:bg-muted" key={item.id}>
            <input type="checkbox" className={check} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
            <bdi className="min-w-0 break-words">{localizedName(item, locale)}</bdi>
            {item.status === 'INACTIVE' ? <span className="ms-auto shrink-0 text-xs text-muted-foreground">{t('common.inactive')}</span> : null}
          </label>
        ))}
        {missing.map((id) => <label key={id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className={check} checked onChange={() => toggle(id)} />{t('promotions.unavailableSelection')}</label>)}
      </div>
    </fieldset>
  );
}

function PromotionSummary({ row, targets, currencyCode }: { row: Promotion; targets: PromotionTargets; currencyCode: string }) {
  const { t, locale } = useStaffI18n();
  const groups: { key: MessageKey; ids: string[]; options: PromotionOption[]; empty?: MessageKey }[] = [
    { key: 'promotions.branchTargets', ids: row.branchIds, options: targets.branches, empty: 'promotions.allBranches' },
    ...(row.scope === 'MENU' ? [{ key: 'promotions.menuTargets' as const, ids: row.menuIds, options: targets.menus }] : []),
    ...(row.scope === 'CATEGORY' || hasItemRestrictions(row.scope) ? [{ key: 'promotions.categoryTargets' as const, ids: row.categoryIds, options: targets.categories }] : []),
    ...(hasItemRestrictions(row.scope) ? [{ key: 'promotions.productTargets' as const, ids: row.productIds, options: targets.products }] : []),
    ...(row.scope === 'DELIVERY' ? [{ key: 'promotions.zoneTargets' as const, ids: row.deliveryZoneIds, options: targets.deliveryZones, empty: 'promotions.allZones' as const }] : []),
  ];
  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 dir="auto" className="min-w-0 break-words text-lg font-semibold">{row.internalName}</h2>
        <Badge variant={row.status === 'ACTIVE' ? 'success' : 'neutral'} dot>{t(`promotions.status.${row.status}`)}</Badge>
      </div>
      <p className={helper}>{t(`promotions.scopeHint.${row.scope}`)}</p>
      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div><dt className={helper}>{t('promotions.discountValue')}</dt><dd><bdi dir="ltr">{row.value}{row.discountType === 'PERCENTAGE' ? '%' : ` ${currencyCode}`}</bdi></dd></div>
        <div><dt className={helper}>{t('promotions.priority')}</dt><dd>{row.priority}</dd></div>
        {row.startsOn ? <div><dt className={helper}>{t('promotions.startsOn')}</dt><dd><bdi dir="ltr">{row.startsOn.slice(0, 10)}</bdi></dd></div> : null}
        {row.endsOn ? <div><dt className={helper}>{t('promotions.endsOn')}</dt><dd><bdi dir="ltr">{row.endsOn.slice(0, 10)}</bdi></dd></div> : null}
        {row.minimumSubtotal !== null ? <div><dt className={helper}>{t('promotions.minimumSubtotal')}</dt><dd><bdi dir="ltr">{row.minimumSubtotal} {currencyCode}</bdi></dd></div> : null}
        {row.minimumQuantity !== null ? <div><dt className={helper}>{t('promotions.minimumQuantity')}</dt><dd>{row.minimumQuantity} · {row.quantityBasis ? t(`promotions.basis.${row.quantityBasis}`) : ''}</dd></div> : null}
        {row.status !== 'ARCHIVED' ? groups.map((group) => (
          <div key={group.key} className="min-w-0"><dt className={helper}>{t(group.key)}</dt>
            <dd className="break-words">{group.ids.length ? group.ids.map((id, index) => {
              const option = group.options.find((item) => item.id === id);
              return <span key={id}>{index ? ' · ' : ''}<bdi>{option ? localizedName(option, locale) : t('promotions.unavailableSelection')}</bdi></span>;
            }) : t(group.empty ?? 'promotions.noSelection')}</dd>
          </div>
        )) : null}
      </dl>
      <details>
        <summary className={disclosure}>{t('promotions.guestCopy')}</summary>
        {row.translations.map((translation) => <div dir={localeDirection(translation.locale)} lang={translation.locale} key={translation.locale} className="border-t border-border py-2"><p className="break-words font-medium">{translation.title}</p>{translation.description ? <p className={`${helper} break-words`}>{translation.description}</p> : null}</div>)}
      </details>
    </Card>
  );
}

export function PromotionEditor({ restaurantId, original, targets, initialZoneId, canEdit, currencyCode, onBack, onSaved, onReload, reloading, onReloadTargets, targetsRefreshing, onUncertainCreate, actionBar }: {
  restaurantId: string;
  original: Promotion | null;
  targets: PromotionTargets;
  initialZoneId?: string;
  canEdit: boolean;
  currencyCode: string;
  onBack: () => void;
  onSaved: (row: Promotion) => void;
  onReload: (row: Promotion) => Promise<void>;
  reloading: boolean;
  onReloadTargets: () => void;
  targetsRefreshing: boolean;
  onUncertainCreate: () => void;
  actionBar: ReactNode;
}) {
  const { t } = useStaffI18n();
  const [initial] = useState<DraftFields>(() => {
    const baseline = blankDraft(original);
    return !original && initialZoneId ? { ...baseline, scope: 'DELIVERY', deliveryZoneIds: [initialZoneId] } : baseline;
  });
  const [fields, setFields] = useState(initial);
  const [error, setError] = useState<MessageKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [requiresReload, setRequiresReload] = useState(false);
  const [uncertainCreate, setUncertainCreate] = useState(false);
  const [serverWiden, setServerWiden] = useState(false);
  const [confirmWiden, setConfirmWiden] = useState(false);
  const [discard, setDiscard] = useState(false);
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial);
  const { scope } = fields;
  const { zone, other } = widening(original, fields);
  const mustConfirm = zone || other || serverWiden;
  const blocked = saving || reloading || targetsRefreshing || requiresReload || uncertainCreate;
  const branchZones = targets.deliveryZones.filter((item) => !fields.branchIds.length || fields.branchIds.includes(item.branchId) || fields.deliveryZoneIds.includes(item.id));
  const scopeSupportsMin = !isPercentageOnly(scope);

  function change<K extends keyof DraftFields>(key: K, value: DraftFields[K]) {
    setFields((prior) => ({ ...prior, [key]: value }));
    setError(null);
    if (key === 'scope' || key === 'branchIds' || key === 'menuIds' || key === 'categoryIds' || key === 'productIds' || key === 'deliveryZoneIds') {
      setConfirmWiden(false);
      setServerWiden(false);
    }
  }

  const translationFields = (locale: string) => {
    const saved = fields.translations.find((entry) => entry.locale === locale);
    const current = saved ?? { locale, title: '', description: null };
    const update = (values: Partial<typeof current>) => {
      change('translations', [...fields.translations.filter((entry) => entry.locale !== locale), { ...current, ...values }]);
    };
    const language = localeLabel(locale);
    const defaultLanguage = locale === targets.defaultLocale;
    return (
      <div key={locale} className="space-y-3" lang={locale}>
        {defaultLanguage ? <p className="text-xs font-semibold text-muted-foreground">{t('promotions.defaultLanguage', { language })}</p> : null}
        <FormField label={t('promotions.guestTitle', { language })} htmlFor={`promo-title-${locale}`}>
          <Input id={`promo-title-${locale}`} dir={localeDirection(locale)} required={defaultLanguage} maxLength={120} value={current.title} onChange={(e) => update({ title: e.target.value })} />
        </FormField>
        <FormField label={t('promotions.guestDescription', { language })} htmlFor={`promo-description-${locale}`}>
          <Textarea id={`promo-description-${locale}`} dir={localeDirection(locale)} rows={2} maxLength={500} value={current.description ?? ''} onChange={(e) => update({ description: e.target.value || null })} />
        </FormField>
      </div>
    );
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || blocked || (mustConfirm && !confirmWiden)) return;
    const result = toPromotionDraft(fields, targets);
    if ('error' in result) { setError(result.error); return; }
    setSaving(true);
    setError(null);
    try {
      const row = await savePromotion(restaurantId, result.draft, original, mustConfirm && confirmWiden);
      onSaved(row);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'PROMOTION_TARGET_WIDENING_CONFIRMATION_REQUIRED') {
        setServerWiden(true);
        setConfirmWiden(false);
      }
      setError(promotionError(caught));
      if (caught instanceof ApiError && (caught.code === 'PROMOTION_TARGET_CHANGED' || caught.code === 'INVALID_PROMOTION_TARGET')) onReloadTargets();
      if (needsPromotionReload(caught)) {
        if (original) setRequiresReload(true);
        else setUncertainCreate(true);
      }
    } finally {
      setSaving(false);
    }
  }

  const preview = original?.status !== 'ARCHIVED' ? (
    <SavingsPreview restaurantId={restaurantId} original={original} targets={targets} fields={fields} currencyCode={currencyCode} disabled={blocked} />
  ) : null;
  const extraLocales = targets.activeLocales.filter((locale) => locale !== targets.defaultLocale);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" disabled={saving || reloading} onClick={() => uncertainCreate ? onUncertainCreate() : dirty ? setDiscard(true) : onBack()}>{t('promotions.viewList')}</Button>
        {!blocked && !dirty ? actionBar : null}
      </div>
      {!canEdit && original ? <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2"><PromotionSummary row={original} targets={targets} currencyCode={currencyCode} />{preview}</div> : canEdit ? (
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <form onSubmit={(event) => void submit(event)} className="min-w-0 space-y-4">
            <fieldset disabled={blocked} className="min-w-0 space-y-4">
              <Card className="space-y-4 p-4 sm:p-6">
                <h2 className={sectionTitle}>{t('promotions.basics')}</h2>
                <FormField label={t('promotions.internalName')} htmlFor="promo-internal"><Input id="promo-internal" required maxLength={120} dir="auto" value={fields.internalName} onChange={(e) => change('internalName', e.target.value)} /></FormField>
                <FormField label={t('promotions.scope')} htmlFor="promo-editor-scope">
                  <Select id="promo-editor-scope" value={scope} aria-describedby="promo-scope-help" onChange={(e) => { const next = promotionScopes.find((item) => item === e.target.value); if (next) change('scope', next); }}>
                    {promotionScopes.map((item) => <option key={item} value={item}>{t(`promotions.scope.${item}`)}</option>)}
                  </Select>
                </FormField>
                <p id="promo-scope-help" className={helper}>{t(`promotions.scopeHint.${scope}`)}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {!isPercentageOnly(scope) ? <FormField label={t('promotions.discountType')} htmlFor="promo-type">
                    <Select id="promo-type" value={fields.discountType} onChange={(e) => change('discountType', e.target.value === 'FIXED_AMOUNT' ? 'FIXED_AMOUNT' : 'PERCENTAGE')}>
                      <option value="PERCENTAGE">{t('promotions.type.PERCENTAGE')}</option><option value="FIXED_AMOUNT">{t('promotions.type.FIXED_AMOUNT')}</option>
                    </Select>
                  </FormField> : null}
                  <FormField label={`${t('promotions.discountValue')} (${isPercentageOnly(scope) || fields.discountType === 'PERCENTAGE' ? '%' : currencyCode})`} htmlFor="promo-value">
                    <Input id="promo-value" dir="ltr" inputMode="decimal" maxLength={15} required value={fields.value} onChange={(e) => change('value', normalizePromotionNumber(e.target.value))} />
                  </FormField>
                </div>
              </Card>
              <Card className="space-y-4 p-4 sm:p-6">
                <h2 className={sectionTitle}>{t('promotions.guestCopy')}</h2>
                {translationFields(targets.defaultLocale)}
                {extraLocales.length ? <details className="space-y-3"><summary className={disclosure}>{t('promotions.otherLanguages')}</summary>{extraLocales.map(translationFields)}</details> : null}
              </Card>
              <Card className="space-y-4 p-4 sm:p-6">
                <h2 className={sectionTitle}>{t('promotions.eligibility')}</h2>
                {scope === 'CATEGORY' ? <TargetChoices key="mandatory-category" title={t('promotions.categoryTargets')} hint={t('promotions.requiredTargets')} options={targets.categories} selected={fields.categoryIds} onChange={(ids) => change('categoryIds', ids)} /> : null}
                {scope === 'MENU' ? <TargetChoices key="mandatory-menu" title={t('promotions.menuTargets')} hint={t('promotions.requiredTargets')} options={targets.menus} selected={fields.menuIds} onChange={(ids) => change('menuIds', ids)} /> : null}
                {scope === 'DELIVERY' ? <TargetChoices key="delivery" title={t('promotions.zoneTargets')} hint={t('promotions.allZones')} options={branchZones} selected={fields.deliveryZoneIds} onChange={(ids) => change('deliveryZoneIds', ids)} /> : null}
                {scope === 'QUANTITY' ? <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label={t('promotions.minimumQuantity')} htmlFor="promo-min-qty"><Input id="promo-min-qty" dir="ltr" inputMode="numeric" maxLength={10} required value={fields.minimumQuantity} onChange={(e) => change('minimumQuantity', normalizePromotionNumber(e.target.value))} /></FormField>
                  <FormField label={t('promotions.quantityBasis')} htmlFor="promo-basis"><Select id="promo-basis" value={fields.quantityBasis ?? 'UNITS'} onChange={(e) => change('quantityBasis', e.target.value === 'DISTINCT_PRODUCTS' ? 'DISTINCT_PRODUCTS' : 'UNITS')}>
                    <option value="UNITS">{t('promotions.basis.UNITS')}</option><option value="DISTINCT_PRODUCTS">{t('promotions.basis.DISTINCT_PRODUCTS')}</option>
                  </Select></FormField>
                </div> : null}
                {hasItemRestrictions(scope) ? (
                  <details className="space-y-3" open={Boolean(original && hasItemRestrictions(original.scope) && (original.categoryIds.length || original.productIds.length)) || undefined}>
                    <summary className={disclosure}>{t('promotions.restrictItems')}</summary>
                    <p className={helper}>{t('promotions.allItems')}</p>
                    <TargetChoices title={t('promotions.categoryTargets')} options={targets.categories} selected={fields.categoryIds} onChange={(ids) => change('categoryIds', ids)} />
                    <TargetChoices title={t('promotions.productTargets')} options={targets.products} selected={fields.productIds} onChange={(ids) => change('productIds', ids)} />
                  </details>
                ) : null}
                <details className="space-y-3" open={Boolean(original?.branchIds.length) || undefined}>
                  <summary className={disclosure}>{t('promotions.branchTargets')} · {t('promotions.selectedCount', { count: fields.branchIds.length })}</summary>
                  <TargetChoices title={t('promotions.branchTargets')} hint={t('promotions.allBranches')} options={targets.branches} selected={fields.branchIds} onChange={(ids) => change('branchIds', ids)} />
                </details>
                {scopeSupportsMin ? <FormField label={t('promotions.minimumSubtotal')} htmlFor="promo-min-subtotal"><Input id="promo-min-subtotal" dir="ltr" inputMode="decimal" maxLength={15} value={fields.minimumSubtotal} onChange={(e) => change('minimumSubtotal', normalizePromotionNumber(e.target.value))} /></FormField> : null}
              </Card>
              <Card className="p-4 sm:p-6">
                <details className="space-y-3" open={Boolean(original?.startsOn || original?.endsOn || (original && original.priority !== 100)) || undefined}>
                  <summary className={disclosure}>{t('promotions.schedule')}</summary>
                  <p className={helper}>{t('promotions.scheduleHint')}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label={t('promotions.startsOn')} htmlFor="promo-start"><Input id="promo-start" dir="ltr" type="date" value={fields.startsOn} onChange={(e) => change('startsOn', e.target.value)} /></FormField>
                    <FormField label={t('promotions.endsOn')} htmlFor="promo-end"><Input id="promo-end" dir="ltr" type="date" value={fields.endsOn} onChange={(e) => change('endsOn', e.target.value)} /></FormField>
                  </div>
                  <FormField label={t('promotions.priority')} htmlFor="promo-priority"><Input id="promo-priority" dir="ltr" inputMode="numeric" maxLength={4} value={fields.priority} onChange={(e) => change('priority', normalizePromotionNumber(e.target.value))} /></FormField>
                  <p className={helper}>{t('promotions.priorityHint')}</p>
                </details>
              </Card>
              {mustConfirm ? (
                <Alert variant="warning">
                  <p>{t(zone ? 'promotions.widenZone' : 'promotions.widenOther')}</p>
                  {zone ? <p className="mt-1">{t('promotions.widenAlternative')}</p> : null}
                  <label className="mt-1 flex min-h-11 items-center gap-2 font-semibold"><input type="checkbox" className={check} checked={confirmWiden} onChange={(e) => setConfirmWiden(e.target.checked)} />{t('promotions.confirmWiden')}</label>
                </Alert>
              ) : null}
            </fieldset>
            {error ? <Alert variant="error">{t(error)}</Alert> : null}
            {requiresReload && original ? <Alert variant="warning"><p>{t('promotions.reloadHelp')}</p><Button type="button" variant="secondary" disabled={reloading} onClick={() => void onReload(original)}>{t(reloading ? 'common.loading' : 'promotions.reload')}</Button></Alert> : null}
            {uncertainCreate ? <Alert variant="warning"><p>{t('promotions.uncertainCreate')}</p><Button type="button" variant="secondary" onClick={onUncertainCreate}>{t('promotions.viewList')}</Button></Alert> : null}
            <div className="flex flex-wrap justify-end rounded-xl border border-border bg-card p-3">
              <Button type="submit" className="h-11" disabled={blocked || (mustConfirm && !confirmWiden) || (original !== null && !dirty)}>{t(saving ? 'common.saving' : original ? 'common.save' : 'promotions.createInactive')}</Button>
            </div>
          </form>
          {preview}
        </div>
      ) : null}
      {discard ? <Dialog open title={t('promotions.unsaved')} submitLabel={t('promotions.discard')} submitVariant="danger" isSubmitting={false} onClose={() => setDiscard(false)} onSubmit={(event) => { event.preventDefault(); onBack(); }}>{null}</Dialog> : null}
    </>
  );
}
