'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../../../../../components/ui/Button';
import { Alert } from '../../../../../../components/ui/Alert';
import { Input } from '../../../../../../components/ui/Input';
import { Select } from '../../../../../../components/ui/Select';
import type { ModifierGroup, ProductVariant } from '../../../../../../lib/menu/types';
import { getModifierSizeSettings, putModifierSizeSettings,
  type ModifierSizeSettings, type ModifierSizeOptionSettings } from '../../../../../../lib/menu/api';
import { useStaffI18n } from '../../../../../../lib/i18n/client';

const MONEY = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/;

interface Props {
  restaurantId: string;
  productId: string;
  group: ModifierGroup;
  variants: ProductVariant[];
  currencyCode: string;
  canManage: boolean;
}

/**
 * Inside ProductEditor <form>: buttons MUST have type="button".
 * Each size inherits defaults until the Staff intentionally saves overrides.
 * The Preset stays the source for inherited prices; never mutate its rows.
 */
export function ModifierSizeSettingsEditor({
  restaurantId, productId, group, variants, currencyCode, canManage,
}: Props) {
  const { locale } = useStaffI18n();
  const ar = locale.startsWith('ar');
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<ModifierSizeSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!variantId) return;
    setState('loading');
    setError('');
    setSaved(false);
    try {
      const next = await getModifierSizeSettings(restaurantId, productId, group.id, variantId);
      setData(next);
      setDirty(false);
      setState('ready');
    } catch {
      setState('error');
      setError(ar ? 'تعذر تحميل إضافات الحجم. حاول تاني.' : 'Could not load size add-ons. Retry.');
    }
  }, [restaurantId, productId, group.id, variantId, ar]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) void load(); });
    return () => { mounted = false; };
  }, [load]);

  function chooseSize(nextId: string) {
    if (saving || nextId === variantId) return;
    if (dirty && !window.confirm(ar
      ? 'فيه تعديلات لسه متحفظتش. تغيّر الحجم وتسيبها؟'
      : 'You have unsaved changes. Switch size and discard them?')) return;
    setVariantId(nextId);
    setData(null);
    setDirty(false);
    setError('');
  }

  function updateGroup(enabled: boolean) {
    setData(current => current ? { ...current, enabled } : null);
    setSaved(false);
    setDirty(true);
  }
  function updateOption(optionId: string, patch: Partial<ModifierSizeOptionSettings>) {
    setData(current => current ? {
      ...current,
      options: current.options.map(option => option.optionId === optionId
        ? {...option, ...patch} : option),
    } : null);
    setSaved(false);
    setDirty(true);
  }

  async function save() {
    if (!data || saving || !canManage) return;
    if (data.options.some(option => option.priceAdjustment !== null &&
        !MONEY.test(option.priceAdjustment))) {
      setError(ar ? 'اكتب سعر الإضافة بشكل صحيح (رقم موجب وبحد أقصى رقمين بعد العلامة).' :
        'Enter a valid non-negative price with at most two decimal places.');
      return;
    }
    if (data.enabled && group.status === 'ACTIVE' &&
      group.options.filter(option => option.status === 'ACTIVE' &&
        data.options.find(row => row.optionId === option.id)?.enabled).length < group.minimumSelections) {
      setError(ar ? 'عدد الإضافات المتاحة أقل من الحد الأدنى المطلوب للمجموعة.' :
        'This size needs enough enabled options to satisfy the required minimum.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const next = await putModifierSizeSettings(restaurantId, productId, group.id, variantId, data);
      setData(next);
      setDirty(false);
      setSaved(true);
    } catch {
      setError(ar ? 'تعذر الحفظ. اتأكد من الإضافات وحاول تاني.' :
        'Could not save. Review the options and retry.');
    } finally {
      setSaving(false);
    }
  }

  if (variants.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`modifier-size-${group.id}`}
          className="text-xs font-semibold text-foreground">
          {ar ? 'اختار الحجم' : 'Select size'}
        </label>
        <Select id={`modifier-size-${group.id}`}
          value={variantId} onChange={event => chooseSize(event.target.value)}
          disabled={saving} className="max-w-48">
          {variants.map(size => (
            <option key={size.id} value={size.id}>{size.name}</option>
          ))}
        </Select>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {ar
          ? 'الإضافات بترث إعداد المنتج أو الـTemplate تلقائيًا. أي تغيير هنا هيطبّق على الحجم ده بس.'
          : 'Add-ons inherit Product or Template defaults. Overrides here affect only the chosen size.'}
      </p>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {state === 'loading' ? (
        <p role="status" className="text-sm text-muted-foreground">
          {ar ? 'جاري تحميل الإضافات...' : 'Loading add-ons...'}
        </p>
      ) : state === 'error' ? (
        <Button type="button" variant="secondary" onClick={() => void load()}>
          {ar ? 'إعادة المحاولة' : 'Retry'}
        </Button>
      ) : data ? (
        <>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
            <span className="font-semibold">
              {ar ? 'تفعيل مجموعة الإضافات للحجم ده' : 'Enable this add-on group for this size'}
            </span>
            <input type="checkbox" checked={data.enabled} disabled={!canManage || saving}
              onChange={e => updateGroup(e.target.checked)}
              className="size-5 accent-primary" />
          </label>

          {data.enabled ? (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {group.options.map(option => {
                const rule = data.options.find(row => row.optionId === option.id);
                if (!rule) return null;
                const unavailable = option.status !== 'ACTIVE';
                return (
                  <div key={option.id} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(130px,170px)] sm:items-center">
                    <div className="min-w-0">
                      <label className="flex min-h-9 items-center gap-2 text-sm font-medium text-foreground">
                        <input type="checkbox" checked={rule.enabled && !unavailable}
                          disabled={!canManage || saving || unavailable}
                          onChange={e => updateOption(option.id, {enabled:e.target.checked})}
                          className="size-4 accent-primary" />
                        <span dir="auto">{option.name}</span>
                      </label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {unavailable
                          ? (ar ? 'الإضافة مقفولة على مستوى المنتج' : 'Disabled for this Product')
                          : (ar ? 'السعر الأساسي' : 'Base price') + ': ' + option.priceAdjustment + ' ' + currencyCode}
                      </p>
                    </div>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      <span>{ar ? 'سعر مخصص للحجم (اختياري)' : 'Price for this size (optional)'}</span>
                      <Input inputMode="decimal" dir="ltr"
                        aria-label={(ar ? 'السعر المخصص - ' : 'Size price - ') + option.name}
                        placeholder={option.priceAdjustment}
                        value={rule.priceAdjustment ?? ''}
                        onChange={e => updateOption(option.id, {
                          priceAdjustment: e.target.value === '' ? null : e.target.value,
                        })}
                        disabled={!canManage || saving || unavailable || !rule.enabled}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              {ar ? 'المجموعة دي مش هتظهر للعميل لما يختار الحجم ده.' :
                'Guests choosing this size will not see this group.'}
            </p>
          )}

          {saved ? (
            <p role="status" className="text-xs font-semibold text-success">
              {ar ? 'تم حفظ تخصيص الحجم.' : 'Size settings saved.'}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void save()}
              disabled={!canManage || !dirty || saving}>
              {saving ? (ar ? 'جاري الحفظ...' : 'Saving...') : (ar ? 'حفظ تخصيص الحجم' : 'Save size settings')}
            </Button>
            <Button type="button" variant="secondary" disabled={!canManage || saving}
              onClick={() => {
                setData(current => current ? {
                  enabled: true,
                  options: current.options.map(option => ({
                    optionId: option.optionId, enabled: true, priceAdjustment: null,
                  })),
                } : null);
                setDirty(true);
                setSaved(false);
              }}>
              {ar ? 'رجوع لإعدادات المنتج' : 'Reset to Product defaults'}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
