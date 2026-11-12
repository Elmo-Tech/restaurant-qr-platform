'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import * as menuApi from '../../../../../../lib/menu/api';
import type {
  ModifierGroup,
  ModifierGroupStatus,
  ModifierOption,
  ModifierOptionStatus,
  ModifierPreset,
  ProductVariant,
} from '../../../../../../lib/menu/types';
import type { RestaurantLocalesResponse } from '../../../../../../lib/settings/types';
import { localeDirection, localeLabel } from '../../../../../../lib/settings/locale-labels';
import { useTranslationsEditor } from '../../../../../../lib/menu/use-translations-editor';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { ApiError } from '../../../../../../lib/api/errors';
import { Alert } from '../../../../../../components/ui/Alert';
import { Badge } from '../../../../../../components/ui/Badge';
import { Button } from '../../../../../../components/ui/Button';
import { FormField } from '../../../../../../components/ui/FormField';
import { FormSection } from '../../../../../../components/ui/FormSection';
import { Input } from '../../../../../../components/ui/Input';
import { Select } from '../../../../../../components/ui/Select';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { LanguageTabs, type LanguageTabOption } from '../../../../../../components/menu/LanguageTabs';
import { TranslationFields } from '../../../../../../components/menu/TranslationFields';
import { ModifierSizeSettingsEditor } from './ModifierSizeSettingsEditor';

/** Mirrors the Backend's accepted decimal-string shape (money-decimal.ts) -- helpful client validation only, never authoritative (CLAUDE.md #27). */
const MONEY_DECIMAL_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/;

export interface ModifiersSectionProps {
  restaurantId: string;
  productId: string;
  currencyCode: string;
  canManage: boolean;
  /** Product sizes used to configure add-ons independently for each size. */
  variants: ProductVariant[];
  /** Same Restaurant Languages response `ProductEditor` already fetches for its own `ProductTranslationSection` -- reused here rather than a second fetch. */
  locales: RestaurantLocalesResponse | null;
  /** Called with the current Groups whenever they load or change, so the Product Editor's guest preview can show them. */
  onGroupsChange?: (groups: ModifierGroup[]) => void;
}

/**
 * FT-6A (closeout: full EN/AR localization added); FT-6B (Preset library +
 * per-Product price override, nested-<form> bug fixed): a clean "Modifiers"
 * section on the Product Editor -- create/edit Modifier Groups and their
 * Options, deactivate rather than hard-delete (DATABASE_SPEC.md #58:
 * history must never break). Only rendered in Edit mode (Groups nest under
 * an existing `productId`, exactly like `ProductTranslationSection`).
 *
 * IMPORTANT: this whole section renders INSIDE `ProductEditor`'s own outer
 * `<form onSubmit={handleSubmit}>` (Section 1) -- every interactive element
 * here MUST be `type="button"` with an explicit `onClick`, never a nested
 * `<form>`/`type="submit"` of its own (invalid HTML: "<form> cannot be a
 * descendant of <form>", and Chrome/React would otherwise submit/reload the
 * WHOLE Product Editor on a Modifier action).
 */
export function ModifiersSection({
  restaurantId,
  productId,
  currencyCode,
  canManage,
  locales,
  variants,
  onGroupsChange,
}: ModifiersSectionProps) {
  const { t } = useStaffI18n();
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [addMode, setAddMode] = useState<'none' | 'choose' | 'preset' | 'custom'>('none');

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await menuApi.listModifierGroups(restaurantId, productId);
      setGroups(data);
      setStatus('loaded');
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setStatus('error');
      setError(describeError(err));
    }
  }, [restaurantId, productId]);

  useEffect(() => {
    // `queueMicrotask` satisfies eslint-plugin-react-hooks'
    // `set-state-in-effect` rule (same pattern as `ProductEditor`'s own
    // mount effect) -- it has nothing to do with the load itself.
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    if (status === 'loaded') onGroupsChange?.(groups);
  }, [groups, status, onGroupsChange]);

  if (status === 'loading') {
    return (
      <FormSection title={t('mod.title')}>
        <LoadingState label={t('mod.loading')} />
      </FormSection>
    );
  }

  if (status === 'error') {
    return (
      <FormSection title={t('mod.title')}>
        <Alert variant="error">{error}</Alert>
        <Button type="button" variant="secondary" onClick={() => void load()}>
          {t('common.retry')}
        </Button>
      </FormSection>
    );
  }

  const alreadyAppliedPresetIds = new Set(
    groups.map((group) => group.sourcePresetId).filter((id): id is string => id !== null),
  );

  return (
    <FormSection title={t('mod.title')}>
      <p className="text-xs text-muted-foreground">{t('mod.intro')}</p>

      {groups.length === 0 && addMode === 'none' ? (
        <p className="text-sm text-muted-foreground">{t('mod.noGroups')}</p>
      ) : null}

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <ModifierGroupCard
            key={group.id}
            restaurantId={restaurantId}
            productId={productId}
            currencyCode={currencyCode}
            group={group}
            canManage={canManage}
            locales={locales}
            variants={variants}
            onGroupChanged={(updated) =>
              setGroups((prev) => prev.map((g) => (g.id === updated.id ? { ...updated, options: g.options } : g)))
            }
            onOptionCreated={(groupId, option) =>
              setGroups((prev) =>
                prev.map((g) => (g.id === groupId ? { ...g, options: [...g.options, option] } : g)),
              )
            }
            onOptionChanged={(groupId, option) =>
              setGroups((prev) =>
                prev.map((g) =>
                  g.id === groupId
                    ? { ...g, options: g.options.map((o) => (o.id === option.id ? option : o)) }
                    : g,
                ),
              )
            }
            onGroupRemoved={(groupId) => setGroups((prev) => prev.filter((g) => g.id !== groupId))}
            onOptionRemoved={(groupId, optionId) =>
              setGroups((prev) =>
                prev.map((g) =>
                  g.id === groupId ? { ...g, options: g.options.filter((o) => o.id !== optionId) } : g,
                ),
              )
            }
          />
        ))}
      </div>

      {addMode === 'none' ? (
        <Button type="button" variant="secondary" disabled={!canManage} onClick={() => setAddMode('choose')}>
          {t('mod.add')}
        </Button>
      ) : null}

      {addMode === 'choose' ? (
        <div className="flex flex-wrap gap-2 rounded-md border border-border p-3">
          <Button type="button" variant="secondary" onClick={() => setAddMode('preset')}>
            {t('mod.usePreset')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setAddMode('custom')}>
            {t('mod.createCustom')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setAddMode('none')}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : null}

      {addMode === 'preset' ? (
        <UsePresetPicker
          restaurantId={restaurantId}
          productId={productId}
          alreadyAppliedPresetIds={alreadyAppliedPresetIds}
          onCancel={() => setAddMode('none')}
          onApplied={(group) => {
            setGroups((prev) => [...prev, group]);
            setAddMode('none');
          }}
        />
      ) : null}

      {addMode === 'custom' ? (
        <NewModifierGroupForm
          restaurantId={restaurantId}
          productId={productId}
          nextDisplayOrder={groups.length}
          onCancel={() => setAddMode('none')}
          onCreated={(group) => {
            setGroups((prev) => [...prev, group]);
            setAddMode('none');
          }}
        />
      ) : null}
    </FormSection>
  );
}

/**
 * FT-6B, Section 2/4 "Use Preset": lists the Restaurant's own active
 * Presets, letting Staff attach one to this Product. A Preset already
 * attached to this Product is disabled in the list rather than hidden --
 * Staff can see AT A GLANCE which presets are already in use here (Section
 * 4: "Prevent accidentally attaching the same Preset twice").
 */
function UsePresetPicker({
  restaurantId,
  productId,
  alreadyAppliedPresetIds,
  onCancel,
  onApplied,
}: {
  restaurantId: string;
  productId: string;
  alreadyAppliedPresetIds: Set<string>;
  onCancel: () => void;
  onApplied: (group: ModifierGroup) => void;
}) {
  const { t } = useStaffI18n();
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<ModifierPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      void (async () => {
        setStatus('loading');
        setError(null);
        try {
          const data = await menuApi.listModifierPresets(restaurantId);
          setPresets(data);
          const firstAvailable = data.find((preset) => !alreadyAppliedPresetIds.has(preset.id));
          setSelectedPresetId(firstAvailable?.id ?? '');
          setStatus('loaded');
        } catch (err) {
          if (isUnauthenticatedError(err)) {
            redirectToLogin();
            return;
          }
          setStatus('error');
          setError(describeError(err));
        }
      })();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on mount; alreadyAppliedPresetIds identity changes every parent render.
  }, [restaurantId]);

  async function handleApply() {
    if (selectedPresetId === '') return;
    setIsApplying(true);
    setError(null);
    try {
      const group = await menuApi.applyModifierPreset(restaurantId, productId, selectedPresetId);
      onApplied(group);
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      if (err instanceof ApiError && err.code === 'MODIFIER_PRESET_ALREADY_APPLIED') {
        setError(t('mod.preset.alreadyAttached'));
        return;
      }
      setError(describeError(err));
    } finally {
      setIsApplying(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="rounded-md border border-border p-4">
        <LoadingState label={t('mod.preset.loading')} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-md border border-border p-4">
        <Alert variant="error">{error}</Alert>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('common.close')}
        </Button>
      </div>
    );
  }

  if (presets.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-border p-4">
        <p className="text-sm text-muted-foreground">{t('mod.preset.none')}</p>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('common.close')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <FormField label={t('mod.preset.label')} htmlFor="use-preset-select">
        <Select
          id="use-preset-select"
          value={selectedPresetId}
          onChange={(e) => setSelectedPresetId(e.target.value)}
          disabled={isApplying}
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id} disabled={alreadyAppliedPresetIds.has(preset.id)}>
              {preset.name}
              {alreadyAppliedPresetIds.has(preset.id) ? t('mod.preset.attachedSuffix') : ''}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={isApplying || selectedPresetId === '' || alreadyAppliedPresetIds.has(selectedPresetId)}
          onClick={() => void handleApply()}
        >
          {isApplying ? t('mod.preset.applying') : t('mod.preset.apply')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isApplying}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function ModifierGroupCard({
  restaurantId,
  productId,
  currencyCode,
  group,
  canManage,
  locales,
  onGroupChanged,
  onOptionCreated,
  onOptionChanged,
  onGroupRemoved,
  onOptionRemoved,
  variants,
}: {
  restaurantId: string;
  productId: string;
  currencyCode: string;
  group: ModifierGroup;
  canManage: boolean;
  locales: RestaurantLocalesResponse | null;
  variants: ProductVariant[];
  onGroupChanged: (group: ModifierGroup) => void;
  onOptionCreated: (groupId: string, option: ModifierOption) => void;
  onOptionChanged: (groupId: string, option: ModifierOption) => void;
  onGroupRemoved: (groupId: string) => void;
  onOptionRemoved: (groupId: string, optionId: string) => void;
}) {
  const { t } = useStaffI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingOption, setIsAddingOption] = useState(false);
  const [showSizeSettings, setShowSizeSettings] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleStatus() {
    setIsBusy(true);
    setError(null);
    try {
      const nextStatus: ModifierGroupStatus = group.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const updated = await menuApi.updateModifierGroup(restaurantId, productId, group.id, {
        status: nextStatus,
      });
      onGroupChanged(updated);
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
    if (!window.confirm(t('mod.confirmDelete', { name: group.name }))) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await menuApi.deleteModifierGroup(restaurantId, productId, group.id);
      onGroupRemoved(group.id);
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setError(describeError(err));
      setIsBusy(false);
    }
  }

  async function handleRemoveFromProduct() {
    if (!window.confirm(t('mod.confirmRemove', { name: group.name }))) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const result = await menuApi.removeModifierGroupFromProduct(restaurantId, productId, group.id);
      if (result === null) {
        onGroupRemoved(group.id);
      } else {
        onGroupChanged(result);
        setIsBusy(false);
      }
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
    <div className="rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 dir="auto" className="text-start text-sm font-semibold text-foreground">
              {group.name}
            </h3>
            {group.sourcePresetId ? <Badge variant="success">{t('mod.basedOnPreset')}</Badge> : null}
            {group.status === 'INACTIVE' ? <Badge variant="neutral">{t('common.inactive')}</Badge> : null}
          </div>
          {group.helperText ? (
            <p dir="auto" className="text-start text-xs text-muted-foreground">
              {group.helperText}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {t('mod.selectionRange', {
              kind: group.minimumSelections === 0 ? t('mod.optional') : t('mod.required'),
              min: group.minimumSelections,
              max: group.maximumSelections,
            })}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {group.sourcePresetId ? (
            // Preset-linked: name/helperText/min-max/translations sync from
            // the Modifier Library and are not locally editable, and
            // deactivating in place would be misleading -- "Remove from
            // Product" is the only V1 way to stop using the Preset here.
            <Button
              type="button"
              variant="danger"
              disabled={!canManage || isBusy}
              onClick={() => void handleRemoveFromProduct()}
            >
              {t('mod.removeFromProduct')}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={!canManage}
                onClick={() => setIsEditing((prev) => !prev)}
              >
                {isEditing ? t('common.close') : t('common.edit')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!canManage || isBusy}
                onClick={() => void toggleStatus()}
              >
                {group.status === 'ACTIVE' ? t('common.deactivate') : t('common.activate')}
              </Button>
              {group.canDelete ? (
                <Button
                  type="button"
                  variant="danger"
                  disabled={!canManage || isBusy}
                  onClick={() => void handleDelete()}
                >
                  {t('common.delete')}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-2">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}

      {isEditing && !group.sourcePresetId ? (
        <div className="mt-3">
          <EditModifierGroupForm
            restaurantId={restaurantId}
            productId={productId}
            group={group}
            locales={locales}
            onSaved={(updated) => {
              onGroupChanged(updated);
              setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      ) : null}

      {variants.some(size => size.status === 'ACTIVE') ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t('mod.title')} · {variants.length} {t('variants.title')}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t('mod.selectionRange', {
                  kind: group.minimumSelections === 0 ? t('mod.optional') : t('mod.required'),
                  min: group.minimumSelections, max: group.maximumSelections,
                })}
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary"
              onClick={() => setShowSizeSettings(value => !value)}>
              {showSizeSettings ? t('common.close') : (t('variants.title') + ' · ' + t('common.edit'))}
            </Button>
          </div>
          {showSizeSettings ? (
            <ModifierSizeSettingsEditor
              restaurantId={restaurantId}
              productId={productId}
              group={group}
              variants={variants.filter(size => size.status === 'ACTIVE')}
              currencyCode={currencyCode}
              canManage={canManage}
            />
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        {group.options.map((option) => (
          <ModifierOptionRow
            key={option.id}
            restaurantId={restaurantId}
            productId={productId}
            groupId={group.id}
            option={option}
            currencyCode={currencyCode}
            canManage={canManage}
            locales={locales}
            onChanged={(updated) => onOptionChanged(group.id, updated)}
            onRemoved={(optionId) => onOptionRemoved(group.id, optionId)}
          />
        ))}
      </div>

      {isAddingOption ? (
        <div className="mt-3">
          <NewModifierOptionForm
            restaurantId={restaurantId}
            productId={productId}
            groupId={group.id}
            nextDisplayOrder={group.options.length}
            onCancel={() => setIsAddingOption(false)}
            onCreated={(option) => {
              onOptionCreated(group.id, option);
              setIsAddingOption(false);
            }}
          />
        </div>
      ) : (
        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            disabled={!canManage}
            onClick={() => setIsAddingOption(true)}
          >
            {t('mod.addOption')}
          </Button>
        </div>
      )}
    </div>
  );
}

function ModifierOptionRow({
  restaurantId,
  productId,
  groupId,
  option,
  currencyCode,
  canManage,
  locales,
  onChanged,
  onRemoved,
}: {
  restaurantId: string;
  productId: string;
  groupId: string;
  option: ModifierOption;
  currencyCode: string;
  canManage: boolean;
  locales: RestaurantLocalesResponse | null;
  onChanged: (option: ModifierOption) => void;
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
      await menuApi.deleteModifierOption(restaurantId, productId, groupId, option.id);
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
      const nextStatus: ModifierOptionStatus = option.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const updated = await menuApi.updateModifierOption(
        restaurantId,
        productId,
        groupId,
        option.id,
        { status: nextStatus },
      );
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

  async function resetPrice() {
    setIsBusy(true);
    setError(null);
    try {
      const updated = await menuApi.resetModifierOptionPrice(restaurantId, productId, groupId, option.id);
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
    if (option.sourcePresetOptionId) {
      // Preset-linked: name and translations are owned by the Modifier
      // Library and must not be edited here -- only the Product-specific
      // price override is a legitimate local action for this Option.
      return (
        <EditLinkedOptionPriceForm
          restaurantId={restaurantId}
          productId={productId}
          groupId={groupId}
          option={option}
          onSaved={(updated) => {
            onChanged(updated);
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      );
    }
    return (
      <EditModifierOptionForm
        restaurantId={restaurantId}
        productId={productId}
        groupId={groupId}
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
      <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
        <span dir="auto">{option.name}</span>
        <bdi dir="ltr" className="text-muted-foreground">
          {option.priceAdjustment === '0.00' ? '+0.00' : `+${option.priceAdjustment}`} {currencyCode}
        </bdi>
        {option.priceIsOverridden ? (
          <Badge variant="warning">{t('mod.overridden')}</Badge>
        ) : option.sourcePresetOptionId ? (
          <Badge variant="neutral" className="bg-card">{t('menu.content.default')}</Badge>
        ) : null}
        {option.status === 'INACTIVE' ? (
          <Badge variant="neutral" className="bg-card">{t('common.inactive')}</Badge>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {error ? <Alert variant="error">{error}</Alert> : null}
        {option.priceIsOverridden ? (
          <Button type="button" variant="secondary" disabled={!canManage || isBusy} onClick={() => void resetPrice()}>
            {t('mod.resetToPreset')}
          </Button>
        ) : null}
        <Button type="button" variant="secondary" disabled={!canManage} onClick={() => setIsEditing(true)}>
          {t('common.edit')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!canManage || isBusy}
          onClick={() => void toggleStatus()}
        >
          {option.status === 'ACTIVE' ? t('common.deactivate') : t('common.activate')}
        </Button>
        {!option.sourcePresetOptionId && option.canDelete ? (
          <Button
            type="button"
            variant="danger"
            disabled={!canManage || isBusy}
            onClick={() => void handleDelete()}
          >
            {t('common.delete')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function NewModifierGroupForm({
  restaurantId,
  productId,
  nextDisplayOrder,
  onCancel,
  onCreated,
}: {
  restaurantId: string;
  productId: string;
  nextDisplayOrder: number;
  onCancel: () => void;
  onCreated: (group: ModifierGroup) => void;
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
      const created = await menuApi.createModifierGroup(restaurantId, productId, {
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
    <div className="rounded-md border border-border p-4 flex flex-col gap-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <FormField label={t('menu.tr.name')} htmlFor="new-group-name">
        <Input id="new-group-name" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} />
      </FormField>
      <FormField label={t('mod.helperOptional')} htmlFor="new-group-helper">
        <Input
          id="new-group-helper"
          value={helperText}
          onChange={(e) => setHelperText(e.target.value)}
          disabled={isSubmitting}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('mod.minSelections')} htmlFor="new-group-min">
          <Input
            id="new-group-min"
            type="number"
            min={0}
            step={1}
            value={minimumSelections}
            onChange={(e) => setMinimumSelections(e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label={t('mod.maxSelections')} htmlFor="new-group-max">
          <Input
            id="new-group-max"
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
          {isSubmitting ? t('common.saving') : t('mod.addGroup')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function EditModifierGroupForm({
  restaurantId,
  productId,
  group,
  locales,
  onSaved,
  onCancel,
}: {
  restaurantId: string;
  productId: string;
  group: ModifierGroup;
  locales: RestaurantLocalesResponse | null;
  onSaved: (group: ModifierGroup) => void;
  onCancel: () => void;
}) {
  const { t } = useStaffI18n();
  const [name, setName] = useState(group.name);
  const [helperText, setHelperText] = useState(group.helperText ?? '');
  const [minimumSelections, setMinimumSelections] = useState(String(group.minimumSelections));
  const [maximumSelections, setMaximumSelections] = useState(String(group.maximumSelections));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLocale, setActiveLocale] = useState<string>('__default__');

  const defaultLocale = locales?.defaultLocale ?? null;
  // Memoized: an unstable array identity here would make useTranslationsEditor
  // re-fetch (and wipe in-progress edits) on every keystroke, mirroring
  // `ProductTranslationSection`'s identical note.
  const secondaryLocales = useMemo(
    () => locales?.locales.filter((row) => !row.isDefault && row.isActive).map((row) => row.locale) ?? [],
    [locales],
  );

  const listGroupTranslations = useCallback(
    async (rid: string, gid: string) => {
      const rows = await menuApi.getModifierGroupTranslations(rid, productId, gid);
      return rows.map((row) => ({ locale: row.locale, name: row.name, description: row.helperText }));
    },
    [productId],
  );
  const putGroupTranslation = useCallback(
    async (rid: string, gid: string, locale: string, input: menuApi.TranslationInput) => {
      const saved = await menuApi.putModifierGroupTranslation(rid, productId, gid, locale, {
        name: input.name,
        helperText: input.description ?? null,
      });
      return { locale: saved.locale, name: saved.name, description: saved.helperText };
    },
    [productId],
  );
  const removeGroupTranslation = useCallback(
    (rid: string, gid: string, locale: string) =>
      menuApi.deleteModifierGroupTranslation(rid, productId, gid, locale),
    [productId],
  );

  const translations = useTranslationsEditor({
    restaurantId,
    entityId: group.id,
    locales: secondaryLocales,
    list: listGroupTranslations,
    put: putGroupTranslation,
    remove: removeGroupTranslation,
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
      const updated = await menuApi.updateModifierGroup(restaurantId, productId, group.id, {
        name: name.trim(),
        helperText: helperText.trim() === '' ? null : helperText.trim(),
        minimumSelections: minimum,
        maximumSelections: maximum,
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
    <div className="flex flex-col gap-3 rounded-md bg-muted p-3">
      {error ? <Alert variant="error">{error}</Alert> : null}

      <LanguageTabs options={tabOptions} activeLocale={activeLocale} onSelect={setActiveLocale} />

      {isDefaultTab ? (
        <>
          <FormField label={t('menu.tr.name')} htmlFor={`edit-group-name-${group.id}`}>
            <Input
              id={`edit-group-name-${group.id}`}
              dir={dir}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label={t('mod.helperOptional')} htmlFor={`edit-group-helper-${group.id}`}>
            <Input
              id={`edit-group-helper-${group.id}`}
              dir={dir}
              value={helperText}
              onChange={(e) => setHelperText(e.target.value)}
              disabled={isSubmitting}
            />
          </FormField>
        </>
      ) : (
        <TranslationFields
          idPrefix={`modifier-group-translation-${group.id}`}
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
        <FormField label={t('mod.minSelections')} htmlFor={`edit-group-min-${group.id}`}>
          <Input
            id={`edit-group-min-${group.id}`}
            type="number"
            min={0}
            step={1}
            value={minimumSelections}
            onChange={(e) => setMinimumSelections(e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label={t('mod.maxSelections')} htmlFor={`edit-group-max-${group.id}`}>
          <Input
            id={`edit-group-max-${group.id}`}
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
          {isSubmitting ? t('common.saving') : t('common.save')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function NewModifierOptionForm({
  restaurantId,
  productId,
  groupId,
  nextDisplayOrder,
  onCancel,
  onCreated,
}: {
  restaurantId: string;
  productId: string;
  groupId: string;
  nextDisplayOrder: number;
  onCancel: () => void;
  onCreated: (option: ModifierOption) => void;
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
      const created = await menuApi.createModifierOption(restaurantId, productId, groupId, {
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
        <FormField label={t('menu.tr.name')} htmlFor="new-option-name">
          <Input
            id="new-option-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label={t('mod.priceAdjustment')} htmlFor="new-option-price">
          <Input
            id="new-option-price"
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

/**
 * FT-6B semantics cleanup: the ONLY Product-local action offered for a
 * preset-linked Option -- overriding its price for this Product. Name and
 * translations are owned by the Modifier Library and are deliberately not
 * editable here (`EditModifierOptionForm` remains for Custom Options only).
 */
function EditLinkedOptionPriceForm({
  restaurantId,
  productId,
  groupId,
  option,
  onSaved,
  onCancel,
}: {
  restaurantId: string;
  productId: string;
  groupId: string;
  option: ModifierOption;
  onSaved: (option: ModifierOption) => void;
  onCancel: () => void;
}) {
  const { t } = useStaffI18n();
  const [priceAdjustment, setPriceAdjustment] = useState(option.priceAdjustment);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!MONEY_DECIMAL_PATTERN.test(priceAdjustment)) {
      setError(t('mod.err.priceInvalid'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await menuApi.updateModifierOption(restaurantId, productId, groupId, option.id, {
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
      <p className="text-xs text-muted-foreground">{t('mod.linkedPriceNote')}</p>
      <FormField label={t('mod.priceAdjustment')} htmlFor={`edit-linked-option-price-${option.id}`}>
        <Input
          id={`edit-linked-option-price-${option.id}`}
          inputMode="decimal"
            dir="ltr"
          value={priceAdjustment}
          onChange={(e) => setPriceAdjustment(e.target.value)}
          disabled={isSubmitting}
        />
      </FormField>
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

function EditModifierOptionForm({
  restaurantId,
  productId,
  groupId,
  option,
  locales,
  onSaved,
  onCancel,
}: {
  restaurantId: string;
  productId: string;
  groupId: string;
  option: ModifierOption;
  locales: RestaurantLocalesResponse | null;
  onSaved: (option: ModifierOption) => void;
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
      const rows = await menuApi.getModifierOptionTranslations(rid, productId, groupId, oid);
      return rows.map((row) => ({ locale: row.locale, name: row.name, description: null }));
    },
    [productId, groupId],
  );
  const putOptionTranslation = useCallback(
    async (rid: string, oid: string, locale: string, input: menuApi.TranslationInput) => {
      const saved = await menuApi.putModifierOptionTranslation(rid, productId, groupId, oid, locale, {
        name: input.name,
      });
      return { locale: saved.locale, name: saved.name, description: null };
    },
    [productId, groupId],
  );
  const removeOptionTranslation = useCallback(
    (rid: string, oid: string, locale: string) =>
      menuApi.deleteModifierOptionTranslation(rid, productId, groupId, oid, locale),
    [productId, groupId],
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
      const updated = await menuApi.updateModifierOption(restaurantId, productId, groupId, option.id, {
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
          <FormField label={t('menu.tr.name')} htmlFor={`edit-option-name-${option.id}`}>
            <Input
              id={`edit-option-name-${option.id}`}
              dir={dir}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </FormField>
        ) : (
          <TranslationFields
            idPrefix={`modifier-option-translation-${option.id}`}
            locale={activeLocale}
            dir={dir}
            draft={translations.drafts[activeLocale]}
            hideSecondField
            onChange={(patch) => translations.updateDraft(activeLocale, patch)}
            onSave={() => void translations.save(activeLocale)}
            onRemove={() => void translations.removeTranslation(activeLocale)}
          />
        )}
        <FormField label={t('mod.priceAdjustment')} htmlFor={`edit-option-price-${option.id}`}>
          <Input
            id={`edit-option-price-${option.id}`}
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
