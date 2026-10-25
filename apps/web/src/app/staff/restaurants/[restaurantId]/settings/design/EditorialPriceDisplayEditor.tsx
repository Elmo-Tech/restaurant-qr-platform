'use client';

import { useEffect, useState } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import {
  getEditorialTemplateSettings,
  saveEditorialTemplateSettings,
} from '../../../../../../lib/settings/api';
import { describeError, isUnauthenticatedError, redirectToLogin } from '../../../../../../lib/menu/error-message';
import {
  DEFAULT_EDITORIAL_SETTINGS,
  type EditorialPriceDisplay,
  type EditorialTemplateSettings,
} from '../../../../../../lib/public-menu/editorial-settings';

/**
 * The single Editorial pricing-display preference.
 * The iframe sees unsaved choices; guests see saved settings from the API only.
 */
export function EditorialPriceDisplayEditor({
  restaurantId,
  canManage,
  onPreviewChange,
}: {
  restaurantId: string;
  canManage: boolean;
  onPreviewChange: (value: EditorialTemplateSettings) => void;
}) {
  const { t } = useStaffI18n();
  const [mode, setMode] = useState<EditorialPriceDisplay>(DEFAULT_EDITORIAL_SETTINGS.priceDisplay);
  const [saved, setSaved] = useState<EditorialPriceDisplay>(DEFAULT_EDITORIAL_SETTINGS.priceDisplay);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getEditorialTemplateSettings(restaurantId)
      .then((config) => {
        if (cancelled) return;
        setMode(config.priceDisplay);
        setSaved(config.priceDisplay);
        onPreviewChange(config);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        if (isUnauthenticatedError(reason)) redirectToLogin();
        else setError(describeError(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [restaurantId, onPreviewChange]);

  const choose = (next: EditorialPriceDisplay) => {
    setMode(next);
    setJustSaved(false);
    onPreviewChange({ priceDisplay: next });
  };

  const save = async () => {
    if (!canManage || saving || loading || mode === saved) return;
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const result = await saveEditorialTemplateSettings(restaurantId, { priceDisplay: mode });
      setMode(result.priceDisplay);
      setSaved(result.priceDisplay);
      onPreviewChange(result);
      setJustSaved(true);
    } catch (reason: unknown) {
      if (isUnauthenticatedError(reason)) redirectToLogin();
      else setError(describeError(reason));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">{t('design.editorialPriceLoading')}</p>;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-secondary/40 p-4">
      <div>
        <h3 className="text-sm font-bold text-foreground">{t('design.editorialPriceHeading')}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('design.editorialPriceHint')}</p>
      </div>
      <fieldset className="space-y-2" disabled={!canManage || saving}>
        <legend className="sr-only">{t('design.editorialPriceHeading')}</legend>
        {([
          { value: 'FROM', title: 'design.editorialPriceFrom', subtitle: 'design.editorialPriceFromHint' },
          { value: 'ALL_VARIANTS', title: 'design.editorialPriceAll', subtitle: 'design.editorialPriceAllHint' },
        ] as const).map(option => (
          <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-start transition-colors ${mode === option.value ? 'border-primary bg-accent' : 'border-border bg-card'}`}>
            <input type="radio" name="editorialPriceDisplay" className="mt-1 accent-primary"
              value={option.value} checked={mode === option.value}
              onChange={() => choose(option.value)} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{t(option.title)}</span>
              <span className="block text-xs leading-relaxed text-muted-foreground">{t(option.subtitle)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      {justSaved && mode === saved ? <p role="status" className="text-sm font-semibold text-green-700">{t('design.editorialPriceSaved')}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void save()}
          disabled={!canManage || saving || mode === saved}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? '...' : t('design.editorialPriceSave')}
        </button>
        {mode !== saved ? <span className="text-xs text-muted-foreground">{t('design.editorialPriceUnsaved')}</span> : null}
      </div>
    </section>
  );
}
