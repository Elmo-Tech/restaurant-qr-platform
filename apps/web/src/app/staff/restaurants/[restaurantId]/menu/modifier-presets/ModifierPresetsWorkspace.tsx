'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import * as menuApi from '../../../../../../lib/menu/api';
import type {
  ModifierPreset,
  ModifierPresetOption,
  ModifierPresetOptionStatus,
  ModifierPresetStatus,
} from '../../../../../../lib/menu/types';
import * as settingsApi from '../../../../../../lib/settings/api';
import type { RestaurantLocalesResponse } from '../../../../../../lib/settings/types';
import { localeDirection, localeLabel } from '../../../../../../lib/settings/locale-labels';
import { useTranslationsEditor } from '../../../../../../lib/menu/use-translations-editor';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Badge } from '../../../../../../components/ui/Badge';
import { Button } from '../../../../../../components/ui/Button';
import { Card } from '../../../../../../components/ui/Card';
import { FormField } from '../../../../../../components/ui/FormField';
import { Input } from '../../../../../../components/ui/Input';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { LanguageTabs, type LanguageTabOption } from '../../../../../../components/menu/LanguageTabs';
import { TranslationFields } from '../../../../../../components/menu/TranslationFields';
import { MenuSectionTabs } from '../MenuSectionTabs';

const MONEY_DECIMAL_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/;

export interface ModifierPresetsWorkspaceProps {
  restaurantId: string;
  currencyCode: string;
  canManage: boolean;
  hasMenuManagePermission: boolean;
}

/**
 * FT-6B, Section 7: a minimal Restaurant-wide Modifier Preset library
 * screen -- list, create, edit a Preset's name/helperText/min-max (every
 * active locale), add/edit its Options (name/price, every active locale).
 * Saving a Preset's field here syncs it into every linked Product-local
 * Modifier Group/Option (`ModifiersSection.tsx`'s "Based on preset" rows)
 * via the Backend's own sync logic -- this page never touches a Product
 * directly. No nested `<form>` anywhere (same discipline as
 * `ModifiersSection.tsx`, Section 1) even though this page is not itself
 * inside another form -- consistency avoids the same class of bug
 * resurfacing here later.
 */
export function ModifierPresetsWorkspace({
  restaurantId,
  currencyCode,
  canManage,
  hasMenuManagePermission,
}: ModifierPresetsWorkspaceProps) {
  const { t } = useStaffI18n();
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<ModifierPreset[]>([]);
  const [locales, setLocales] = useState<RestaurantLocalesResponse | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const [presetsData, localesData] = await Promise.all([
        menuApi.listModifierPresets(restaurantId),
        settingsApi.getRestaurantLocales(restaurantId),
      ]);
      setPresets(presetsData);
      setLocales(localesData);
      setStatus('loaded');
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setStatus('error');
      setError(describeError(err));
    }
  }, [restaurantId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/staff/restaurants/${restaurantId}/menu/overview`} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"><span aria-hidden="true" className="rtl:rotate-180">←</span>{t('menuHub.back')}</Link>
      <PageHeader title={t('presets.title')} description={t('presets.subtitle')} />

      <MenuSectionTabs restaurantId={restaurantId} active="modifier-library" />

      {!canManage && hasMenuManagePermission ? (
        <Alert variant="info">{t('presets.needsFullScope')}</Alert>
      ) : null}

      {status === 'loading' ? (
        <Card>
          <LoadingState label={t('presets.loading')} />
        </Card>
      ) : status === 'error' ? (
        <Card className="flex flex-col gap-3">
          <Alert variant="error">{error}</Alert>
          <Button variant="secondary" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          <Card className="flex flex-col gap-2">
            {presets.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('presets.none')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {presets.map((preset) => (
                  <li key={preset.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPresetId(preset.id);
                        setIsCreating(false);
                      }}
                      className={`w-full rounded-md px-3 py-2 text-start text-sm ${
                        selectedPresetId === preset.id
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <bdi dir="auto">{preset.name}</bdi>
                      {preset.status === 'INACTIVE' ? t('presets.inactiveSuffix') : ''}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={!canManage}
              onClick={() => {
                setIsCreating(true);
                setSelectedPresetId(null);
              }}
            >
              {t('presets.new')}
            </Button>
          </Card>

          <Card>
            {isCreating ? (
              <NewPresetForm
                restaurantId={restaurantId}
                nextDisplayOrder={presets.length}
                onCancel={() => setIsCreating(false)}
                onCreated={(preset) => {
                  setPresets((prev) => [...prev, preset]);
                  setSelectedPresetId(preset.id);
                  setIsCreating(false);
                }}
              />
            ) : selectedPreset ? (
              <PresetDetail
                // Keying by preset id forces a fresh mount (and fresh
                // internal `useState`) whenever the User selects a
                // DIFFERENT preset -- simpler and lint-clean vs. an effect
                // that resets local form state on prop change.
                key={selectedPreset.id}
                restaurantId={restaurantId}
                currencyCode={currencyCode}
                canManage={canManage}
                locales={locales}
                preset={selectedPreset}
                onPresetChanged={(updated) =>
                  setPresets((prev) =>
                    prev.map((p) => (p.id === updated.id ? { ...updated, options: p.options } : p)),
                  )
                }
                onOptionCreated={(option) =>
                  setPresets((prev) =>
                    prev.map((p) =>
                      p.id === selectedPreset.id ? { ...p, options: [...p.options, option] } : p,
                    ),
                  )
                }
                onOptionChanged={(option) =>
                  setPresets((prev) =>
                    prev.map((p) =>
                      p.id === selectedPreset.id
                        ? { ...p, options: p.options.map((o) => (o.id === option.id ? option : o)) }
                        : p,
                    ),
                  )
                }
                onPresetRemoved={(presetId) => {
                  setPresets((prev) => prev.filter((p) => p.id !== presetId));
                  setSelectedPresetId(null);
                }}
                onOptionRemoved={(optionId) =>
                  setPresets((prev) =>
                    prev.map((p) =>
                      p.id === selectedPreset.id
                        ? { ...p, options: p.options.filter((o) => o.id !== optionId) }
                        : p,
                    ),
                  )
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t('presets.selectHint')}</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function NewPresetForm({
  restaurantId,
  nextDisplayOrder,
  onCancel,
  onCreated,
}: {
  restaurantId: string;
  nextDisplayOrder: number;
  onCancel: () => void;
  onCreated: (preset: ModifierPreset) => void;
}) {
  const { t } = useStaffI18n();
  const [name, setName] = useState('');
  const [helperText, setHelperText] = useState('');
  const [minimumSelections, setMinimumSelections] = useState('0');
  const [maximumSelections, setMaximumSelections] = useState('1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (name.trim() === '') {
      setError(t('menu.tr.nameRequired'));
      return;
    }
    const minimum = Number(minimumSelections);
    const maximum = Number(maximumSelections);
    if (!Number.isInteger(minimum) || minimum < 0) {
      setError(t('mod.err.minInvalid'));
      return;
    }
    if (!Number.isInteger(maximum) || maximum < 1) {
      setError(t('mod.err.maxInvalid'));
      return;
    }
    if (maximum < minimum) {
      setError(t('mod.err.maxLessThanMin'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const created = await menuApi.createModifierPreset(restaurantId, {
        name: name.trim(),
        helperText: helperText.trim() === '' ? null : helperText.trim(),
        status: 'ACTIVE',
        minimumSelections: minimum,
        maximumSelections: maximum,
        displayOrder: nextDisplayOrder,
      });
      onCreated(created);
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setError(describeError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">{t('presets.newTitle')}</h2>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <FormField label={t('menu.tr.name')} htmlFor="new-preset-name">
        <Input id="new-preset-name" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} />
      </FormField>
      <FormField label={t('mod.helperOptional')} htmlFor="new-preset-helper">
        <Input
          id="new-preset-helper"
          value={helperText}
          onChange={(e) => setHelperText(e.target.value)}
          disabled={isSubmitting}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('mod.minSelections')} htmlFor="new-preset-min">
          <Input
            id="new-preset-min"
            type="number"
            min={0}
            step={1}
            value={minimumSelections}
            onChange={(e) => setMinimumSelections(e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label={t('mod.maxSelections')} htmlFor="new-preset-max">
          <Input
            id="new-preset-max"
            type="number"
            min={1}
            step={1}
            value={maximumSelections}
            onChange={(e) => setMaximumSelections(e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSave()}>
          {isSubmitting ? t('common.saving') : t('presets.create')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function PresetDetail({
  restaurantId,
  currencyCode,
  canManage,
  locales,
  preset,
  onPresetChanged,
  onOptionCreated,
  onOptionChanged,
  onPresetRemoved,
  onOptionRemoved,
}: {
  restaurantId: string;
  currencyCode: string;
  canManage: boolean;
  locales: RestaurantLocalesResponse | null;
  preset: ModifierPreset;
  onPresetChanged: (preset: ModifierPreset) => void;
  onOptionCreated: (option: ModifierPresetOption) => void;
  onOptionChanged: (option: ModifierPresetOption) => void;
  onPresetRemoved: (presetId: string) => void;
  onOptionRemoved: (optionId: string) => void;
}) {
  const { t } = useStaffI18n();
  const [name, setName] = useState(preset.name);
  const [helperText, setHelperText] = useState(preset.helperText ?? '');
  const [minimumSelections, setMinimumSelections] = useState(String(preset.minimumSelections));
  const [maximumSelections, setMaximumSelections] = useState(String(preset.maximumSelections));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isAddingOption, setIsAddingOption] = useState(false);
  const [activeLocale, setActiveLocale] = useState<string>('__default__');

  const defaultLocale = locales?.defaultLocale ?? null;
  const secondaryLocales = useMemo(
    () => locales?.locales.filter((row) => !row.isDefault && row.isActive).map((row) => row.locale) ?? [],
    [locales],
  );

  const listPresetTranslations = useCallback(
    async (rid: string, pid: string) => {
      const rows = await menuApi.getModifierPresetTranslations(rid, pid);
      return rows.map((row) => ({ locale: row.locale, name: row.name, description: row.helperText }));
    },
    [],
  );
  const putPresetTranslation = useCallback(
    async (rid: string, pid: string, locale: string, input: menuApi.TranslationInput) => {
      const saved = await menuApi.putModifierPresetTranslation(rid, pid, locale, {
        name: input.name,
        helperText: input.description ?? null,
      });
      return { locale: saved.locale, name: saved.name, description: saved.helperText };
    },
    [],
  );
  const removePresetTranslation = useCallback(
    (rid: string, pid: string, locale: string) => menuApi.deleteModifierPresetTranslation(rid, pid, locale),
    [],
  );

  const translations = useTranslationsEditor({
    restaurantId,
    entityId: preset.id,
    locales: secondaryLocales,
    list: listPresetTranslations,
    put: putPresetTranslation,
    remove: removePresetTranslation,
  });

  const isDefaultTab = activeLocale === '__default__';
  const currentLocale = isDefaultTab ? defaultLocale : activeLocale;
  const dir = currentLocale ? localeDirection(currentLocale) : 'ltr';

  const tabOptions: LanguageTabOption[] = defaultLocale
    ? [
        { locale: '__default__', label: localeLabel(defaultLocale), stateLabel: t('menu.content.default') },
        ...secondaryLocales.map((locale) => ({
          locale,
          label: localeLabel(locale),
          stateLabel: translations.drafts[locale]?.exists ? t('menu.content.translated') : t('menu.content.notTranslated'),
        })),
      ]
    : [];

  async function handleSave() {
    if (name.trim() === '') {
      setError(t('menu.tr.nameRequired'));
      return;
    }
    const minimum = Number(minimumSelections);
    const maximum = Number(maximumSelections);
    if (!Number.isInteger(minimum) || minimum < 0) {
      setError(t('mod.err.minInvalid'));
      return;
    }
    if (!Number.isInteger(maximum) || maximum < 1) {
      setError(t('mod.err.maxInvalid'));
      return;
    }
    if (maximum < minimum) {
      setError(t('mod.err.maxLessThanMin'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await menuApi.updateModifierPreset(restaurantId, preset.id, {
        name: name.trim(),
        helperText: helperText.trim() === '' ? null : helperText.trim(),
        minimumSelections: minimum,
        maximumSelections: maximum,
      });
      onPresetChanged(updated);
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setError(describeError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleStatus() {
    setIsBusy(true);
    setError(null);
    try {
      const nextStatus: ModifierPresetStatus = preset.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const updated = await menuApi.updateModifierPreset(restaurantId, preset.id, { status: nextStatus });
      onPresetChanged(updated);
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setError(describeError(err));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(t('presets.confirmDelete', { name: preset.name }))) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await menuApi.deleteModifierPreset(restaurantId, preset.id);
      onPresetRemoved(preset.id);
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setError(describeError(err));
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 dir="auto" className="text-start text-sm font-semibold text-foreground">
          {preset.name}
        </h2>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!canManage || isBusy}
            onClick={() => void toggleStatus()}
          >
            {preset.status === 'ACTIVE' ? t('common.deactivate') : t('common.activate')}
          </Button>
          {preset.canDelete ? (
            <Button type="button" variant="danger" disabled={!canManage || isBusy} onClick={() => void handleDelete()}>
              {t('common.delete')}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <LanguageTabs options={tabOptions} activeLocale={activeLocale} onSelect={setActiveLocale} />

      {isDefaultTab ? (
        <>
          <FormField label={t('menu.tr.name')} htmlFor={`preset-name-${preset.id}`}>
            <Input
              id={`preset-name-${preset.id}`}
              dir={dir}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting || !canManage}
            />
          </FormField>
          <FormField label={t('mod.helperOptional')} htmlFor={`preset-helper-${preset.id}`}>
            <Input
              id={`preset-helper-${preset.id}`}
              dir={dir}
              value={helperText}
              onChange={(e) => setHelperText(e.target.value)}
              disabled={isSubmitting || !canManage}
            />
          </FormField>
        </>
      ) : (
        <TranslationFields
          idPrefix={`preset-translation-${preset.id}`}
          locale={activeLocale}
          dir={dir}
          draft={translations.drafts[activeLocale]}
          secondFieldLabel={t('mod.helperText')}
          onChange={(patch) => translations.updateDraft(activeLocale, patch)}
          onSave={() => void translations.save(activeLocale)}
          onRemove={() => void translations.removeTranslation(activeLocale)}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('mod.minSelections')} htmlFor={`preset-min-${preset.id}`}>
          <Input
            id={`preset-min-${preset.id}`}
            type="number"
            min={0}
            step={1}
            value={minimumSelections}
            onChange={(e) => setMinimumSelections(e.target.value)}
            disabled={isSubmitting || !canManage}
          />
        </FormField>
        <FormField label={t('mod.maxSelections')} htmlFor={`preset-max-${preset.id}`}>
          <Input
            id={`preset-max-${preset.id}`}
            type="number"
            min={1}
            step={1}
            value={maximumSelections}
            onChange={(e) => setMaximumSelections(e.target.value)}
            disabled={isSubmitting || !canManage}
          />
        </FormField>
      </div>
      <div>
        <Button type="button" disabled={isSubmitting || !canManage} onClick={() => void handleSave()}>
          {isSubmitting ? t('common.saving') : t('common.save')}
        </Button>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">{t('presets.options')}</h3>
        <div className="flex flex-col gap-2">
          {preset.options.map((option) => (
            <PresetOptionRow
              key={option.id}
              restaurantId={restaurantId}
              presetId={preset.id}
              option={option}
              currencyCode={currencyCode}
              canManage={canManage}
              locales={locales}
              onChanged={onOptionChanged}
              onRemoved={onOptionRemoved}
            />
          ))}
        </div>

        {isAddingOption ? (
          <div className="mt-3">
            <NewPresetOptionForm
              restaurantId={restaurantId}
              presetId={preset.id}
              nextDisplayOrder={preset.options.length}
              onCancel={() => setIsAddingOption(false)}
              onCreated={(option) => {
                onOptionCreated(option);
                setIsAddingOption(false);
              }}
            />
          </div>
        ) : (
          <div className="mt-3">
            <Button type="button" variant="secondary" disabled={!canManage} onClick={() => setIsAddingOption(true)}>
              {t('mod.addOption')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function PresetOptionRow({
  restaurantId,
  presetId,
  option,
  currencyCode,
  canManage,
  locales,
  onChanged,
  onRemoved,
}: {
  restaurantId: string;
  presetId: string;
  option: ModifierPresetOption;
  currencyCode: string;
  canManage: boolean;
  locales: RestaurantLocalesResponse | null;
  onChanged: (option: ModifierPresetOption) => void;
  onRemoved: (optionId: string) => void;
}) {
  const { t } = useStaffI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(t('mod.confirmDelete', { name: option.name }))) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await menuApi.deleteModifierPresetOption(restaurantId, presetId, option.id);
      onRemoved(option.id);
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setError(describeError(err));
      setIsBusy(false);
    }
  }

  async function toggleStatus() {
    setIsBusy(true);
    setError(null);
    try {
      const nextStatus: ModifierPresetOptionStatus = option.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const updated = await menuApi.updateModifierPresetOption(restaurantId, presetId, option.id, {
        status: nextStatus,
      });
      onChanged(updated);
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setError(describeError(err));
    } finally {
      setIsBusy(false);
    }
  }

  if (isEditing) {
    return (
      <EditPresetOptionForm
        restaurantId={restaurantId}
        presetId={presetId}
        option={option}
        locales={locales}
        onSaved={(updated) => {
          onChanged(updated);
          setIsEditing(false);
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-muted px-3 py-2">
      <div className="flex items-center gap-2 text-sm text-foreground">
        <span dir="auto">{option.name}</span>
        <bdi dir="ltr" className="text-muted-foreground">
          {option.priceAdjustment === '0.00' ? '+0.00' : `+${option.priceAdjustment}`} {currencyCode}
        </bdi>
        {option.status === 'INACTIVE' ? <Badge variant="neutral">{t('common.inactive')}</Badge> : null}
      </div>
      <div className="flex shrink-0 gap-2">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Button type="button" variant="secondary" disabled={!canManage} onClick={() => setIsEditing(true)}>
          {t('common.edit')}
        </Button>
        <Button type="button" variant="secondary" disabled={!canManage || isBusy} onClick={() => void toggleStatus()}>
          {option.status === 'ACTIVE' ? t('common.deactivate') : t('common.activate')}
        </Button>
        {option.canDelete ? (
          <Button type="button" variant="danger" disabled={!canManage || isBusy} onClick={() => void handleDelete()}>
            {t('common.delete')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function NewPresetOptionForm({
  restaurantId,
  presetId,
  nextDisplayOrder,
  onCancel,
  onCreated,
}: {
  restaurantId: string;
  presetId: string;
  nextDisplayOrder: number;
  onCancel: () => void;
  onCreated: (option: ModifierPresetOption) => void;
}) {
  const { t } = useStaffI18n();
  const [name, setName] = useState('');
  const [priceAdjustment, setPriceAdjustment] = useState('0.00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (name.trim() === '') {
      setError(t('menu.tr.nameRequired'));
      return;
    }
    if (!MONEY_DECIMAL_PATTERN.test(priceAdjustment)) {
      setError(t('mod.err.priceInvalid'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const created = await menuApi.createModifierPresetOption(restaurantId, presetId, {
        name: name.trim(),
        status: 'ACTIVE',
        priceAdjustment,
        displayOrder: nextDisplayOrder,
      });
      onCreated(created);
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setError(describeError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md bg-muted p-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('menu.tr.name')} htmlFor="new-preset-option-name">
          <Input
            id="new-preset-option-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label={t('mod.priceAdjustment')} htmlFor="new-preset-option-price">
          <Input
            id="new-preset-option-price"
            inputMode="decimal"
            dir="ltr"
            value={priceAdjustment}
            onChange={(e) => setPriceAdjustment(e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSave()}>
          {isSubmitting ? t('common.saving') : t('mod.addOption')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function EditPresetOptionForm({
  restaurantId,
  presetId,
  option,
  locales,
  onSaved,
  onCancel,
}: {
  restaurantId: string;
  presetId: string;
  option: ModifierPresetOption;
  locales: RestaurantLocalesResponse | null;
  onSaved: (option: ModifierPresetOption) => void;
  onCancel: () => void;
}) {
  const { t } = useStaffI18n();
  const [name, setName] = useState(option.name);
  const [priceAdjustment, setPriceAdjustment] = useState(option.priceAdjustment);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLocale, setActiveLocale] = useState<string>('__default__');

  const defaultLocale = locales?.defaultLocale ?? null;
  const secondaryLocales = useMemo(
    () => locales?.locales.filter((row) => !row.isDefault && row.isActive).map((row) => row.locale) ?? [],
    [locales],
  );

  const listOptionTranslations = useCallback(
    async (rid: string, oid: string) => {
      const rows = await menuApi.getModifierPresetOptionTranslations(rid, presetId, oid);
      return rows.map((row) => ({ locale: row.locale, name: row.name, description: null }));
    },
    [presetId],
  );
  const putOptionTranslation = useCallback(
    async (rid: string, oid: string, locale: string, input: menuApi.TranslationInput) => {
      const saved = await menuApi.putModifierPresetOptionTranslation(rid, presetId, oid, locale, {
        name: input.name,
      });
      return { locale: saved.locale, name: saved.name, description: null };
    },
    [presetId],
  );
  const removeOptionTranslation = useCallback(
    (rid: string, oid: string, locale: string) =>
      menuApi.deleteModifierPresetOptionTranslation(rid, presetId, oid, locale),
    [presetId],
  );

  const translations = useTranslationsEditor({
    restaurantId,
    entityId: option.id,
    locales: secondaryLocales,
    list: listOptionTranslations,
    put: putOptionTranslation,
    remove: removeOptionTranslation,
  });

  const isDefaultTab = activeLocale === '__default__';
  const currentLocale = isDefaultTab ? defaultLocale : activeLocale;
  const dir = currentLocale ? localeDirection(currentLocale) : 'ltr';

  const tabOptions: LanguageTabOption[] = defaultLocale
    ? [
        { locale: '__default__', label: localeLabel(defaultLocale), stateLabel: t('menu.content.default') },
        ...secondaryLocales.map((locale) => ({
          locale,
          label: localeLabel(locale),
          stateLabel: translations.drafts[locale]?.exists ? t('menu.content.translated') : t('menu.content.notTranslated'),
        })),
      ]
    : [];

  async function handleSave() {
    if (name.trim() === '') {
      setError(t('menu.tr.nameRequired'));
      return;
    }
    if (!MONEY_DECIMAL_PATTERN.test(priceAdjustment)) {
      setError(t('mod.err.priceInvalid'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await menuApi.updateModifierPresetOption(restaurantId, presetId, option.id, {
        name: name.trim(),
        priceAdjustment,
      });
      onSaved(updated);
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setError(describeError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md bg-card p-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <LanguageTabs options={tabOptions} activeLocale={activeLocale} onSelect={setActiveLocale} />
      <div className="grid grid-cols-2 gap-3">
        {isDefaultTab ? (
          <FormField label={t('menu.tr.name')} htmlFor={`preset-option-name-${option.id}`}>
            <Input
              id={`preset-option-name-${option.id}`}
              dir={dir}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </FormField>
        ) : (
          <TranslationFields
            idPrefix={`preset-option-translation-${option.id}`}
            locale={activeLocale}
            dir={dir}
            draft={translations.drafts[activeLocale]}
            hideSecondField
            onChange={(patch) => translations.updateDraft(activeLocale, patch)}
            onSave={() => void translations.save(activeLocale)}
            onRemove={() => void translations.removeTranslation(activeLocale)}
          />
        )}
        <FormField label={t('mod.priceAdjustment')} htmlFor={`preset-option-price-${option.id}`}>
          <Input
            id={`preset-option-price-${option.id}`}
            inputMode="decimal"
            dir="ltr"
            value={priceAdjustment}
            onChange={(e) => setPriceAdjustment(e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSave()}>
          {isSubmitting ? t('common.saving') : t('common.save')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
