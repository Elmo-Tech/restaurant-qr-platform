'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import * as menuApi from '../../../../../../lib/menu/api';
import type { ProductVariant } from '../../../../../../lib/menu/types';
import type { RestaurantLocalesResponse } from '../../../../../../lib/settings/types';
import { localeDirection, localeLabel } from '../../../../../../lib/settings/locale-labels';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Badge } from '../../../../../../components/ui/Badge';
import { Button } from '../../../../../../components/ui/Button';
import { FormField } from '../../../../../../components/ui/FormField';
import { FormSection } from '../../../../../../components/ui/FormSection';
import { Input } from '../../../../../../components/ui/Input';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { Switch } from '../../../../../../components/ui/Switch';

/** The secondary language the name fields follow: the editor's content-language tab, or `null` for the default language. */
function resolveNameLocale(contentLocale: string, secondaryLocales: string[]): string | null {
  return contentLocale !== '__default__' && secondaryLocales.includes(contentLocale)
    ? contentLocale
    : null;
}

/** Mirrors the Backend's accepted decimal-string shape (money-decimal.ts) -- helpful client validation only, never authoritative (CLAUDE.md #27). */
const MONEY_DECIMAL_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/;

export interface VariantsSectionProps {
  restaurantId: string;
  productId: string;
  currencyCode: string;
  canManage: boolean;
  /** True while the Product has a discount configured: shows the per-size "discount applies" switch. */
  discountConfigured: boolean;
  locales: RestaurantLocalesResponse | null;
  /** The content language tab being edited in the Product editor: `'__default__'` or a locale code. */
  contentLocale: string;
  /** Called with the current sizes whenever they load or change, so the editor can follow them. */
  onVariantsChange?: (variants: ProductVariant[]) => void;
  /** Called with each size's name in the content language being edited (secondary languages only), for the preview. */
  onNamesChange?: (locale: string | null, names: Record<string, string>) => void;
}

/**
 * Product Variants (DEC-041): the "Sizes" section of the Product editor.
 * Each size has its FULL price (Small 60, Medium 80, Large 100); the Product
 * price follows the cheapest active size automatically. Sizes are saved on the
 * Backend as you edit them (like Add-ons), not with the Product's Save button.
 * Rendered inside the editor's own `<form>`, so every control here is
 * `type="button"` -- never a nested form.
 */
export function VariantsSection({
  restaurantId,
  productId,
  currencyCode,
  canManage,
  discountConfigured,
  locales,
  contentLocale,
  onVariantsChange,
  onNamesChange,
}: VariantsSectionProps) {
  const { t } = useStaffI18n();
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const defaultLocale = locales?.defaultLocale ?? null;
  const secondaryLocales = useMemo(
    () =>
      locales?.locales.filter((row) => !row.isDefault && row.isActive).map((row) => row.locale) ??
      [],
    [locales],
  );
  // Which language the name fields of the rows edit: follows the editor's content-language tab.
  const nameLocale = resolveNameLocale(contentLocale, secondaryLocales);

  // Each size's name in the secondary language being edited (loaded for the whole list at once).
  const [translatedNames, setTranslatedNames] = useState<Record<string, string>>({});
  const variantIdsKey = variants.map((variant) => variant.id).join(',');
  useEffect(() => {
    if (nameLocale === null || variantIdsKey === '') return;
    let cancelled = false;
    void Promise.all(
      variantIdsKey.split(',').map((id) =>
        menuApi
          .getProductVariantTranslations(restaurantId, productId, id)
          .then((rows) => [id, rows.find((row) => row.locale === nameLocale)?.name ?? ''] as const)
          .catch(() => [id, ''] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setTranslatedNames(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, productId, nameLocale, variantIdsKey]);

  useEffect(() => {
    onNamesChange?.(nameLocale, nameLocale === null ? {} : translatedNames);
  }, [nameLocale, translatedNames, onNamesChange]);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      setVariants(await menuApi.listProductVariants(restaurantId, productId));
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
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    if (status === 'loaded') onVariantsChange?.(variants);
  }, [variants, status, onVariantsChange]);

  /** Runs one mutation; on failure shows the Backend's message. */
  const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    setActionError(null);
    try {
      await action();
      return true;
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return false;
      }
      setActionError(describeError(err));
      return false;
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      setVariants(await menuApi.listProductVariants(restaurantId, productId));
    } catch (err) {
      if (isUnauthenticatedError(err)) redirectToLogin();
    }
  }, [restaurantId, productId]);

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= variants.length) return;
    const next = [...variants];
    [next[index], next[target]] = [next[target], next[index]];
    setVariants(next);
    const ok = await run(() =>
      menuApi.reorderProductVariants(
        restaurantId,
        productId,
        next.map((variant) => variant.id),
      ),
    );
    if (!ok) await reload();
  }

  async function removeVariant(variant: ProductVariant) {
    if (!window.confirm(t('variants.confirmDelete', { name: `\u2068${variant.name}\u2069` }))) return;
    await run(() => menuApi.deleteProductVariant(restaurantId, productId, variant.id));
    await reload();
  }

  if (status === 'loading') {
    return (
      <FormSection title={t('variants.title')}>
        <LoadingState label={t('variants.loading')} />
      </FormSection>
    );
  }
  if (status === 'error') {
    return (
      <FormSection title={t('variants.title')}>
        <Alert variant="error">{error}</Alert>
        <Button type="button" variant="secondary" onClick={() => void load()}>
          {t('common.retry')}
        </Button>
      </FormSection>
    );
  }

  const hasDefault = variants.some((variant) => variant.isDefault && variant.status === 'ACTIVE');

  return (
    <FormSection title={t('variants.title')}>
      <p className="text-sm text-muted-foreground">{t('variants.intro')}</p>

      {actionError ? <Alert variant="error">{actionError}</Alert> : null}

      {variants.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          {t('variants.empty')}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {variants.map((variant, index) => (
              <li key={variant.id}>
                <VariantRow
                  variant={variant}
                  index={index}
                  count={variants.length}
                  restaurantId={restaurantId}
                  productId={productId}
                  currencyCode={currencyCode}
                  canManage={canManage}
                  discountConfigured={discountConfigured}
                  nameLocale={nameLocale}
                  defaultLocale={defaultLocale}
                  loadedName={translatedNames[variant.id] ?? ''}
                  onTranslationSaved={(value) =>
                    setTranslatedNames((current) => ({ ...current, [variant.id]: value }))
                  }
                  run={run}
                  onSaved={(saved) =>
                    setVariants((current) =>
                      current.map((row) => (row.id === saved.id ? saved : row)),
                    )
                  }
                  onReload={reload}
                  onMove={(direction) => void move(index, direction)}
                  onDelete={() => void removeVariant(variant)}
                />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {hasDefault ? t('variants.hasDefaultNote') : t('variants.noDefaultNote')}
          </p>
        </>
      )}

      {canManage ? (
        <AddVariantForm
          restaurantId={restaurantId}
          productId={productId}
          variants={variants}
          defaultLocale={defaultLocale}
          nameLocale={nameLocale}
          currencyCode={currencyCode}
          run={run}
          onCreated={(created) => setVariants((current) => [...current, created])}
          onReload={reload}
        />
      ) : null}
    </FormSection>
  );
}

type RunFn = (action: () => Promise<unknown>) => Promise<boolean>;

interface SizeFormValues {
  name: string;
  /** The name in the content language when it is a secondary language ("" otherwise). */
  otherName: string;
  price: string;
}

/**
 * The "new size" fields, shared by the saved-product list and the create-mode
 * list. Only the language being edited is shown: the default language alone, or
 * (on a secondary language tab) that language plus the required default name.
 */
function SizeForm({
  defaultLocale,
  nameLocale,
  currencyCode,
  onAdd,
}: {
  defaultLocale: string | null;
  nameLocale: string | null;
  currencyCode: string;
  onAdd: (values: SizeFormValues) => Promise<boolean>;
}) {
  const { t } = useStaffI18n();
  const [name, setName] = useState('');
  const [otherName, setOtherName] = useState('');
  const [price, setPrice] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  async function add() {
    if (name.trim() === '') {
      setFieldError(t('variants.nameRequired'));
      return;
    }
    if (!MONEY_DECIMAL_PATTERN.test(price.trim())) {
      setFieldError(t('variants.priceInvalid'));
      return;
    }
    setFieldError(null);
    setIsAdding(true);
    const ok = await onAdd({ name: name.trim(), otherName: otherName.trim(), price: price.trim() });
    setIsAdding(false);
    if (ok) {
      setName('');
      setOtherName('');
      setPrice('');
    }
  }

  function onEnter(event: React.KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void add();
    }
  }

  const defaultNameField = (
    <FormField
      label={
        defaultLocale
          ? t('variants.nameDefaultLanguage', { language: localeLabel(defaultLocale) })
          : t('variants.name')
      }
      htmlFor="variant-new-name"
    >
      <Input
        id="variant-new-name"
        value={name}
        dir={defaultLocale ? localeDirection(defaultLocale) : undefined}
        lang={defaultLocale ?? undefined}
        placeholder={t('variants.namePlaceholder')}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={onEnter}
      />
    </FormField>
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
      <p className="text-sm font-medium text-foreground">{t('variants.addTitle')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
        {nameLocale === null ? (
          defaultNameField
        ) : (
          <FormField
            label={t('variants.nameInLanguage', { language: localeLabel(nameLocale) })}
            htmlFor="variant-new-name-other"
          >
            <Input
              id="variant-new-name-other"
              dir={localeDirection(nameLocale)}
              lang={nameLocale}
              value={otherName}
              onChange={(event) => setOtherName(event.target.value)}
              onKeyDown={onEnter}
            />
          </FormField>
        )}
        <FormField
          label={`${t('variants.price')} (${currencyCode})`}
          htmlFor="variant-new-price"
        >
          <Input
            id="variant-new-price"
            inputMode="decimal"
            dir="ltr"
            value={price}
            placeholder="0.00"
            onChange={(event) => setPrice(event.target.value)}
            onKeyDown={onEnter}
          />
        </FormField>
      </div>
      {nameLocale !== null ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
          {defaultNameField}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{t('variants.priceHint')}</p>
      {fieldError ? (
        <p role="alert" className="text-sm text-destructive">
          {fieldError}
        </p>
      ) : null}
      <div>
        <Button type="button" onClick={() => void add()} disabled={isAdding}>
          {t('variants.add')}
        </Button>
      </div>
    </div>
  );
}

function AddVariantForm({
  restaurantId,
  productId,
  variants,
  defaultLocale,
  nameLocale,
  currencyCode,
  run,
  onCreated,
  onReload,
}: {
  restaurantId: string;
  productId: string;
  variants: ProductVariant[];
  defaultLocale: string | null;
  nameLocale: string | null;
  currencyCode: string;
  run: RunFn;
  onCreated: (variant: ProductVariant) => void;
  onReload: () => Promise<void>;
}) {
  async function add(values: SizeFormValues): Promise<boolean> {
    const holder: { value: ProductVariant | null } = { value: null };
    const ok = await run(async () => {
      const created = await menuApi.createProductVariant(restaurantId, productId, {
        name: values.name,
        status: 'ACTIVE',
        price: values.price,
        displayOrder: variants.reduce((max, row) => Math.max(max, row.displayOrder), -1) + 1,
        // The first size is the one Guests see selected.
        isDefault: variants.length === 0,
      });
      holder.value = created;
      if (nameLocale !== null && values.otherName !== '') {
        await menuApi.putProductVariantTranslation(restaurantId, productId, created.id, nameLocale, {
          name: values.otherName,
        });
      }
    });
    if (holder.value) onCreated(holder.value);
    if (!ok) await onReload();
    return ok;
  }

  return (
    <SizeForm
      defaultLocale={defaultLocale}
      nameLocale={nameLocale}
      currencyCode={currencyCode}
      onAdd={add}
    />
  );
}

/** A size entered while the Product is being created: saved right after the Product exists. */
export interface SizeDraft {
  key: string;
  name: string;
  /** Names in secondary languages typed while adding (locale -> name). */
  translations: Record<string, string>;
  price: string;
}

/**
 * Create-mode sizes: the same fields as the saved-product list, kept locally until
 * the Product is created (the editor then saves each one). The Product price follows
 * the cheapest draft, like it does for saved sizes.
 */
export function DraftSizes({
  currencyCode,
  locales,
  contentLocale,
  drafts,
  onChange,
}: {
  currencyCode: string;
  locales: RestaurantLocalesResponse | null;
  contentLocale: string;
  drafts: SizeDraft[];
  onChange: (drafts: SizeDraft[]) => void;
}) {
  const { t } = useStaffI18n();
  const defaultLocale = locales?.defaultLocale ?? null;
  const secondaryLocales = useMemo(
    () =>
      locales?.locales.filter((row) => !row.isDefault && row.isActive).map((row) => row.locale) ??
      [],
    [locales],
  );
  const nameLocale = resolveNameLocale(contentLocale, secondaryLocales);

  async function add(values: SizeFormValues): Promise<boolean> {
    onChange([
      ...drafts,
      {
        key: crypto.randomUUID(),
        name: values.name,
        translations:
          nameLocale !== null && values.otherName !== '' ? { [nameLocale]: values.otherName } : {},
        price: values.price,
      },
    ]);
    return true;
  }

  return (
    <FormSection title={t('variants.title')}>
      <p className="text-sm text-muted-foreground">{t('variants.intro')}</p>
      <p className="text-xs text-muted-foreground">{t('variants.draftsNote')}</p>
      {drafts.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {drafts.map((draft, index) => (
            <li
              key={draft.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  <bdi>{draft.name}</bdi>
                  {index === 0 ? (
                    <span className="ms-2 align-middle">
                      <Badge variant="primary">{t('variants.default')}</Badge>
                    </span>
                  ) : null}
                </p>
                {Object.entries(draft.translations).map(([locale, text]) => (
                  <p key={locale} className="truncate text-xs text-muted-foreground" lang={locale}>
                    <bdi>{text}</bdi>
                  </p>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold text-foreground" dir="ltr">
                  {draft.price} {currencyCode}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onChange(drafts.filter((row) => row.key !== draft.key))}
                >
                  {t('variants.remove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <SizeForm
        defaultLocale={defaultLocale}
        nameLocale={nameLocale}
        currencyCode={currencyCode}
        onAdd={add}
      />
    </FormSection>
  );
}

function VariantRow({
  variant,
  index,
  count,
  restaurantId,
  productId,
  currencyCode,
  canManage,
  discountConfigured,
  nameLocale,
  defaultLocale,
  loadedName,
  onTranslationSaved,
  run,
  onSaved,
  onReload,
  onMove,
  onDelete,
}: {
  variant: ProductVariant;
  index: number;
  count: number;
  restaurantId: string;
  productId: string;
  currencyCode: string;
  canManage: boolean;
  discountConfigured: boolean;
  /** The secondary language the name field edits, or `null` for the default language. */
  nameLocale: string | null;
  defaultLocale: string | null;
  /** The saved name in `nameLocale` ("" when none). */
  loadedName: string;
  onTranslationSaved: (value: string) => void;
  run: RunFn;
  onSaved: (variant: ProductVariant) => void;
  onReload: () => Promise<void>;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const { t } = useStaffI18n();
  const [name, setName] = useState(variant.name);
  const [price, setPrice] = useState(variant.price);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // The secondary-language name being typed (null = untouched, show the saved one).
  const [draftName, setDraftName] = useState<string | null>(null);
  const translatedName = draftName ?? loadedName;

  const disabled = !canManage || isSaving;

  async function save(patch: menuApi.UpdateProductVariantInput) {
    setIsSaving(true);
    const holder: { value: ProductVariant | null } = { value: null };
    const ok = await run(async () => {
      holder.value = await menuApi.updateProductVariant(restaurantId, productId, variant.id, patch);
    });
    setIsSaving(false);
    if (ok && holder.value) {
      const saved = holder.value;
      onSaved(saved);
      setName(saved.name);
      setPrice(saved.price);
      setJustSaved(true);
    } else {
      await onReload();
    }
  }

  function commitName() {
    const trimmed = name.trim();
    if (trimmed === variant.name) return;
    if (trimmed === '') {
      setFieldError(t('variants.nameRequired'));
      setName(variant.name);
      return;
    }
    setFieldError(null);
    void save({ name: trimmed });
  }

  function commitPrice() {
    const trimmed = price.trim();
    if (trimmed === variant.price) return;
    if (!MONEY_DECIMAL_PATTERN.test(trimmed)) {
      setFieldError(t('variants.priceInvalid'));
      return;
    }
    setFieldError(null);
    void save({ price: trimmed });
  }

  async function commitTranslation() {
    if (nameLocale === null) return;
    const value = translatedName.trim();
    if (value === loadedName) return;
    const ok = await run(async () => {
      if (value === '') {
        await menuApi.deleteProductVariantTranslation(restaurantId, productId, variant.id, nameLocale);
      } else {
        await menuApi.putProductVariantTranslation(restaurantId, productId, variant.id, nameLocale, {
          name: value,
        });
      }
    });
    if (ok) {
      onTranslationSaved(value);
      setDraftName(null);
      setJustSaved(true);
    }
  }

  const inactive = variant.status === 'INACTIVE';

  return (
    <div
      className={`flex flex-col gap-4 rounded-xl border border-border bg-card p-4 ${
        inactive ? 'opacity-80' : ''
      }`}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
        {nameLocale === null ? (
          <FormField
            label={
              defaultLocale
                ? t('variants.nameDefaultLanguage', { language: localeLabel(defaultLocale) })
                : t('variants.name')
            }
            htmlFor={`variant-name-${variant.id}`}
          >
            <Input
              id={`variant-name-${variant.id}`}
              value={name}
              dir={defaultLocale ? localeDirection(defaultLocale) : undefined}
              lang={defaultLocale ?? undefined}
              disabled={disabled}
              onChange={(event) => setName(event.target.value)}
              onBlur={commitName}
            />
          </FormField>
        ) : (
          <FormField
            label={t('variants.nameInLanguage', { language: localeLabel(nameLocale) })}
            htmlFor={`variant-name-${variant.id}-${nameLocale}`}
          >
            <Input
              id={`variant-name-${variant.id}-${nameLocale}`}
              value={translatedName}
              dir={localeDirection(nameLocale)}
              lang={nameLocale}
              disabled={disabled}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => void commitTranslation()}
            />
            {translatedName.trim() === '' ? (
              <p className="text-xs text-muted-foreground">
                {t('variants.nameFallback', { name: `⁨${variant.name}⁩` })}
              </p>
            ) : null}
          </FormField>
        )}
        <FormField
          label={`${t('variants.price')} (${currencyCode})`}
          htmlFor={`variant-price-${variant.id}`}
        >
          <Input
            id={`variant-price-${variant.id}`}
            inputMode="decimal"
            dir="ltr"
            value={price}
            disabled={disabled}
            onChange={(event) => setPrice(event.target.value)}
            onBlur={commitPrice}
          />
        </FormField>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {variant.isDefault && !inactive ? (
          <Badge variant="primary">{t('variants.default')}</Badge>
        ) : null}
        {inactive ? <Badge variant="neutral">{t('variants.inactive')}</Badge> : null}
        {discountConfigured && !variant.discountApplies ? (
          <Badge variant="warning">{t('variants.discountOff')}</Badge>
        ) : null}
        <span role="status" className="text-xs text-success">
          {isSaving ? t('variants.saving') : justSaved ? t('variants.saved') : ''}
        </span>
      </div>

      {fieldError ? (
        <p role="alert" className="text-sm text-destructive">
          {fieldError}
        </p>
      ) : null}

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border px-3">
        <ToggleRow
          label={t('variants.active')}
          checked={!inactive}
          disabled={disabled}
          onChange={(next) => void save({ status: next ? 'ACTIVE' : 'INACTIVE' })}
        />
        <ToggleRow
          label={t('variants.default')}
          hint={inactive ? t('variants.defaultNeedsActive') : t('variants.defaultHint')}
          checked={variant.isDefault}
          disabled={disabled || inactive}
          onChange={(next) => void save({ isDefault: next })}
        />
        {discountConfigured ? (
          <ToggleRow
            label={t('variants.discountApplies')}
            hint={t('variants.discountAppliesHint')}
            checked={variant.discountApplies}
            disabled={disabled}
            onChange={(next) => void save({ discountApplies: next })}
          />
        ) : null}
      </div>

      {canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={index === 0}
              onClick={() => onMove(-1)}
              aria-label={t('variants.moveUp')}
            >
              <span aria-hidden="true">↑</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={index === count - 1}
              onClick={() => onMove(1)}
              aria-label={t('variants.moveDown')}
            >
              <span aria-hidden="true">↓</span>
            </Button>
          </div>
          {variant.canDelete ? (
            <Button type="button" variant="danger" onClick={onDelete}>
              {t('variants.delete')}
            </Button>
          ) : (
            <p className="max-w-sm text-xs text-muted-foreground">{t('variants.deleteInstead')}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch checked={checked} label={label} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
