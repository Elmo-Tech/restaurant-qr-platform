'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import * as menuApi from '../../../../../../lib/menu/api';
import type {
  ModifierGroup,
  ModifierGroupStatus,
  ModifierOption,
  ModifierOptionStatus,
} from '../../../../../../lib/menu/types';
import type { RestaurantLocalesResponse } from '../../../../../../lib/settings/types';
import { localeDirection, localeLabel } from '../../../../../../lib/settings/locale-labels';
import { useTranslationsEditor } from '../../../../../../lib/menu/use-translations-editor';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Button } from '../../../../../../components/ui/Button';
import { FormField } from '../../../../../../components/ui/FormField';
import { FormSection } from '../../../../../../components/ui/FormSection';
import { Input } from '../../../../../../components/ui/Input';
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
 * FT-6A (closeout: full EN/AR localization added): a clean "Modifiers"
 * section on the Product Editor -- create/edit Modifier Groups and their
 * Options, deactivate rather than hard-delete (DATABASE_SPEC.md #58:
 * history must never break). Only rendered in Edit mode (Groups nest under
 * an existing `productId`, exactly like `ProductTranslationSection`).
 * Every active Restaurant locale is editable via the same `LanguageTabs` +
 * `useTranslationsEditor` + `TranslationFields` combination Product/Menu/
 * Category already use -- the default locale's name/helperText live on the
 * always-visible non-translatable form (submitted through the generic
 * update call, exactly like `ProductTranslationSection`'s "Default" tab
 * reusing the main form's own state); every OTHER active locale goes
 * through the dedicated `putModifier{Group,Option}Translation` endpoint.
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
  const [isAddingGroup, setIsAddingGroup] = useState(false);

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

  return (
    <FormSection title="Modifiers">
      <p className="text-xs text-[#655D56]">
        Required or optional choices Guests select before adding this Product to their Cart
        (e.g. Size, Extras). Deactivating a Group/Option hides it from the Guest Menu without
        affecting past Orders.
      </p>

      {groups.length === 0 && !isAddingGroup ? (
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
          />
        ))}
      </div>

      {isAddingGroup ? (
        <NewModifierGroupForm
          restaurantId={restaurantId}
          productId={productId}
          nextDisplayOrder={groups.length}
          onCancel={() => setIsAddingGroup(false)}
          onCreated={(group) => {
            setGroups((prev) => [...prev, group]);
            setIsAddingGroup(false);
          }}
        />
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled={!canManage}
          onClick={() => setIsAddingGroup(true)}
        >
          Add Modifier Group
        </Button>
      )}
    </FormSection>
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

  return (
    <div className="rounded-md border border-[#E5DED6] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#1D1A18]">{group.name}</h3>
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
        </div>
      </div>

      {error ? (
        <div className="mt-2">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}

      {isEditing ? (
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
}: {
  restaurantId: string;
  productId: string;
  groupId: string;
  option: ModifierOption;
  currencyCode: string;
  canManage: boolean;
  locales: RestaurantLocalesResponse | null;
  onChanged: (option: ModifierOption) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (isEditing) {
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
      <div className="flex items-center gap-2 text-sm text-[#302C29]">
        <span>{option.name}</span>
        <span className="text-[#655D56]">
          {option.priceAdjustment === '0.00' ? '+0.00' : `+${option.priceAdjustment}`} {currencyCode}
        </span>
        {option.status === 'INACTIVE' ? (
          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-[#655D56]">Inactive</span>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-2">
        {error ? <Alert variant="error">{error}</Alert> : null}
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <form onSubmit={handleSubmit} className="rounded-md border border-[#E5DED6] p-4 flex flex-col gap-3">
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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Add Group'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md bg-[#F8F5F1] p-3">
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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md bg-[#F8F5F1] p-3">
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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Add Option'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md bg-white p-3">
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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
