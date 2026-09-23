'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as menuApi from '../../../../../../lib/menu/api';
import type {
  ModifierGroup,
  ModifierGroupStatus,
  ModifierOption,
  ModifierOptionStatus,
  ModifierPreset,
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
import { Button } from '../../../../../../components/ui/Button';
import { FormField } from '../../../../../../components/ui/FormField';
import { FormSection } from '../../../../../../components/ui/FormSection';
import { Input } from '../../../../../../components/ui/Input';
import { Select } from '../../../../../../components/ui/Select';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { LanguageTabs, type LanguageTabOption } from '../../../../../../components/menu/LanguageTabs';
import { TranslationFields } from '../../../../../../components/menu/TranslationFields';

/** Mirrors the Backend's accepted decimal-string shape (money-decimal.ts) -- helpful client validation only, never authoritative (CLAUDE.md #27). */
const MONEY_DECIMAL_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/;

export interface ModifiersSectionProps {
  restaurantId: string;
  productId: string;
  currencyCode: string;
  canManage: boolean;
  /** Same Restaurant Languages response `ProductEditor` already fetches for its own `ProductTranslationSection` -- reused here rather than a second fetch. */
  locales: RestaurantLocalesResponse | null;
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
}: ModifiersSectionProps) {
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

  if (status === 'loading') {
    return (
      <FormSection title="Modifiers">
        <LoadingState label="Loading modifiers…" />
      </FormSection>
    );
  }

  if (status === 'error') {
    return (
      <FormSection title="Modifiers">
        <Alert variant="error">{error}</Alert>
        <Button type="button" variant="secondary" onClick={() => void load()}>
          Retry
        </Button>
      </FormSection>
    );
  }

  const alreadyAppliedPresetIds = new Set(
    groups.map((group) => group.sourcePresetId).filter((id): id is string => id !== null),
  );

  return (
    <FormSection title="Modifiers">
      <p className="text-xs text-[#655D56]">
        Required or optional choices Guests select before adding this Product to their Cart
        (e.g. Size, Extras). Deactivating a Group/Option hides it from the Guest Menu without
        affecting past Orders.
      </p>

      {groups.length === 0 && addMode === 'none' ? (
        <p className="text-sm text-[#655D56]">No Modifier Groups yet.</p>
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
          + Add Modifier
        </Button>
      ) : null}

      {addMode === 'choose' ? (
        <div className="flex flex-wrap gap-2 rounded-md border border-[#E5DED6] p-3">
          <Button type="button" variant="secondary" onClick={() => setAddMode('preset')}>
            Use Preset
          </Button>
          <Button type="button" variant="secondary" onClick={() => setAddMode('custom')}>
            Create Custom
          </Button>
          <Button type="button" variant="secondary" onClick={() => setAddMode('none')}>
            Cancel
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
        setError('This preset is already attached to this Product.');
        return;
      }
      setError(describeError(err));
    } finally {
      setIsApplying(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="rounded-md border border-[#E5DED6] p-4">
        <LoadingState label="Loading presets…" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-md border border-[#E5DED6] p-4">
        <Alert variant="error">{error}</Alert>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Close
        </Button>
      </div>
    );
  }

  if (presets.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-[#E5DED6] p-4">
        <p className="text-sm text-[#655D56]">
          No presets exist yet in the Modifier Library. Create one from Menu Management → Modifier
          Library.
        </p>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[#E5DED6] p-4">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <FormField label="Preset" htmlFor="use-preset-select">
        <Select
          id="use-preset-select"
          value={selectedPresetId}
          onChange={(e) => setSelectedPresetId(e.target.value)}
          disabled={isApplying}
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id} disabled={alreadyAppliedPresetIds.has(preset.id)}>
              {preset.name}
              {alreadyAppliedPresetIds.has(preset.id) ? ' (already attached)' : ''}
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
          {isApplying ? 'Applying…' : 'Apply Preset'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isApplying}>
          Cancel
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
}: {
  restaurantId: string;
  productId: string;
  currencyCode: string;
  group: ModifierGroup;
  canManage: boolean;
  locales: RestaurantLocalesResponse | null;
  onGroupChanged: (group: ModifierGroup) => void;
  onOptionCreated: (groupId: string, option: ModifierOption) => void;
  onOptionChanged: (groupId: string, option: ModifierOption) => void;
  onGroupRemoved: (groupId: string) => void;
  onOptionRemoved: (groupId: string, optionId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingOption, setIsAddingOption] = useState(false);
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
    if (!window.confirm(`Delete "${group.name}"? This cannot be undone.`)) {
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
    if (!window.confirm(`Remove "${group.name}" from this Product?`)) {
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
    <div className="rounded-md border border-[#E5DED6] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#1D1A18]">{group.name}</h3>
            {group.sourcePresetId ? (
              <span className="rounded-full bg-[#EEF3EE] px-2 py-0.5 text-xs text-[#2F6B4F]">
                Based on preset
              </span>
            ) : null}
            {group.status === 'INACTIVE' ? (
              <span className="rounded-full bg-[#F1EDE7] px-2 py-0.5 text-xs text-[#655D56]">
                Inactive
              </span>
            ) : null}
          </div>
          {group.helperText ? (
            <p className="text-xs text-[#655D56]">{group.helperText}</p>
          ) : null}
          <p className="mt-1 text-xs text-[#655D56]">
            {group.minimumSelections === 0 ? 'Optional' : 'Required'} · min {group.minimumSelections} ·
            max {group.maximumSelections}
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
              Remove from Product
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={!canManage}
                onClick={() => setIsEditing((prev) => !prev)}
              >
                {isEditing ? 'Close' : 'Edit'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!canManage || isBusy}
                onClick={() => void toggleStatus()}
              >
                {group.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </Button>
              {group.canDelete ? (
                <Button
                  type="button"
                  variant="danger"
                  disabled={!canManage || isBusy}
                  onClick={() => void handleDelete()}
                >
                  Delete
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
            Add Option
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
  const [isEditing, setIsEditing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(`Delete "${option.name}"? This cannot be undone.`)) {
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
    <div className="flex items-center justify-between gap-4 rounded-md bg-[#F8F5F1] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm text-[#302C29]">
        <span>{option.name}</span>
        <span className="text-[#655D56]">
          {option.priceAdjustment === '0.00' ? '+0.00' : `+${option.priceAdjustment}`} {currencyCode}
        </span>
        {option.priceIsOverridden ? (
          <span className="rounded-full bg-[#FBF0DE] px-2 py-0.5 text-xs text-[#8A5138]">
            Overridden for this Product
          </span>
        ) : option.sourcePresetOptionId ? (
          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-[#655D56]">Default</span>
        ) : null}
        {option.status === 'INACTIVE' ? (
          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-[#655D56]">Inactive</span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {error ? <Alert variant="error">{error}</Alert> : null}
        {option.priceIsOverridden ? (
          <Button type="button" variant="secondary" disabled={!canManage || isBusy} onClick={() => void resetPrice()}>
            Reset to preset
          </Button>
        ) : null}
        <Button type="button" variant="secondary" disabled={!canManage} onClick={() => setIsEditing(true)}>
          Edit
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!canManage || isBusy}
          onClick={() => void toggleStatus()}
        >
          {option.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        </Button>
        {!option.sourcePresetOptionId && option.canDelete ? (
          <Button
            type="button"
            variant="danger"
            disabled={!canManage || isBusy}
            onClick={() => void handleDelete()}
          >
            Delete
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
  const [name, setName] = useState('');
  const [helperText, setHelperText] = useState('');
  const [minimumSelections, setMinimumSelections] = useState('0');
  const [maximumSelections, setMaximumSelections] = useState('1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (name.trim() === '') {
      setError('Name is required.');
      return;
    }
    const minimum = Number(minimumSelections);
    const maximum = Number(maximumSelections);
    if (!Number.isInteger(minimum) || minimum < 0) {
      setError('Minimum selections must be a whole number of 0 or more.');
      return;
    }
    if (!Number.isInteger(maximum) || maximum < 1) {
      setError('Maximum selections must be a whole number of 1 or more.');
      return;
    }
    if (maximum < minimum) {
      setError('Maximum selections must be at least the minimum.');
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
    <div className="rounded-md border border-[#E5DED6] p-4 flex flex-col gap-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <FormField label="Name" htmlFor="new-group-name">
        <Input id="new-group-name" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} />
      </FormField>
      <FormField label="Helper text (optional)" htmlFor="new-group-helper">
        <Input
          id="new-group-helper"
          value={helperText}
          onChange={(e) => setHelperText(e.target.value)}
          disabled={isSubmitting}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Minimum selections" htmlFor="new-group-min">
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
        <FormField label="Maximum selections" htmlFor="new-group-max">
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
          {isSubmitting ? 'Saving…' : 'Add Group'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
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
        { locale: '__default__', label: localeLabel(defaultLocale), stateLabel: 'Default' },
        ...secondaryLocales.map((locale) => ({
          locale,
          label: localeLabel(locale),
          stateLabel: translations.drafts[locale]?.exists ? 'Translated' : 'Not translated yet',
        })),
      ]
    : [];

  async function handleSave() {
    if (name.trim() === '') {
      setError('Name is required.');
      return;
    }
    const minimum = Number(minimumSelections);
    const maximum = Number(maximumSelections);
    if (!Number.isInteger(minimum) || minimum < 0) {
      setError('Minimum selections must be a whole number of 0 or more.');
      return;
    }
    if (!Number.isInteger(maximum) || maximum < 1) {
      setError('Maximum selections must be a whole number of 1 or more.');
      return;
    }
    if (maximum < minimum) {
      setError('Maximum selections must be at least the minimum.');
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
    <div className="flex flex-col gap-3 rounded-md bg-[#F8F5F1] p-3">
      {error ? <Alert variant="error">{error}</Alert> : null}

      <LanguageTabs options={tabOptions} activeLocale={activeLocale} onSelect={setActiveLocale} />

      {isDefaultTab ? (
        <>
          <FormField label="Name" htmlFor={`edit-group-name-${group.id}`}>
            <Input
              id={`edit-group-name-${group.id}`}
              dir={dir}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label="Helper text (optional)" htmlFor={`edit-group-helper-${group.id}`}>
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
          secondFieldLabel="Helper text"
          onChange={(patch) => translations.updateDraft(activeLocale, patch)}
          onSave={() => void translations.save(activeLocale)}
          onRemove={() => void translations.removeTranslation(activeLocale)}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Minimum selections" htmlFor={`edit-group-min-${group.id}`}>
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
        <FormField label="Maximum selections" htmlFor={`edit-group-max-${group.id}`}>
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
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
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
  const [name, setName] = useState('');
  const [priceAdjustment, setPriceAdjustment] = useState('0.00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (name.trim() === '') {
      setError('Name is required.');
      return;
    }
    if (!MONEY_DECIMAL_PATTERN.test(priceAdjustment)) {
      setError('Price adjustment must be a non-negative decimal amount, e.g. 10.00.');
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
    <div className="flex flex-col gap-3 rounded-md bg-[#F8F5F1] p-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Name" htmlFor="new-option-name">
          <Input
            id="new-option-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label="Price adjustment" htmlFor="new-option-price">
          <Input
            id="new-option-price"
            inputMode="decimal"
            value={priceAdjustment}
            onChange={(e) => setPriceAdjustment(e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSave()}>
          {isSubmitting ? 'Saving…' : 'Add Option'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
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
  const [priceAdjustment, setPriceAdjustment] = useState(option.priceAdjustment);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!MONEY_DECIMAL_PATTERN.test(priceAdjustment)) {
      setError('Price adjustment must be a non-negative decimal amount, e.g. 10.00.');
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
    <div className="flex flex-col gap-3 rounded-md bg-white p-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <p className="text-xs text-[#655D56]">
        Changing the price here overrides it for THIS Product only -- the preset&apos;s own default
        price (and every other Product using it) is unaffected. This Option&apos;s name and
        translations are managed in Menu Management → Modifier Library.
      </p>
      <FormField label="Price adjustment" htmlFor={`edit-linked-option-price-${option.id}`}>
        <Input
          id={`edit-linked-option-price-${option.id}`}
          inputMode="decimal"
          value={priceAdjustment}
          onChange={(e) => setPriceAdjustment(e.target.value)}
          disabled={isSubmitting}
        />
      </FormField>
      <div className="flex gap-2">
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSave()}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
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
        { locale: '__default__', label: localeLabel(defaultLocale), stateLabel: 'Default' },
        ...secondaryLocales.map((locale) => ({
          locale,
          label: localeLabel(locale),
          stateLabel: translations.drafts[locale]?.exists ? 'Translated' : 'Not translated yet',
        })),
      ]
    : [];

  async function handleSave() {
    if (name.trim() === '') {
      setError('Name is required.');
      return;
    }
    if (!MONEY_DECIMAL_PATTERN.test(priceAdjustment)) {
      setError('Price adjustment must be a non-negative decimal amount, e.g. 10.00.');
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
    <div className="flex flex-col gap-3 rounded-md bg-white p-3">
      {error ? <Alert variant="error">{error}</Alert> : null}

      <LanguageTabs options={tabOptions} activeLocale={activeLocale} onSelect={setActiveLocale} />

      <div className="grid grid-cols-2 gap-3">
        {isDefaultTab ? (
          <FormField label="Name" htmlFor={`edit-option-name-${option.id}`}>
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
        <FormField label="Price adjustment" htmlFor={`edit-option-price-${option.id}`}>
          <Input
            id={`edit-option-price-${option.id}`}
            inputMode="decimal"
            value={priceAdjustment}
            onChange={(e) => setPriceAdjustment(e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSave()}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
