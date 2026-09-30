'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import * as menuApi from '../../../../../../lib/menu/api';
import * as settingsApi from '../../../../../../lib/settings/api';
import type {
  Category,
  Menu,
  Product,
  ProductAvailability,
  ProductStatus,
} from '../../../../../../lib/menu/types';
import type { RestaurantLocalesResponse } from '../../../../../../lib/settings/types';
import { localeDirection, localeLabel } from '../../../../../../lib/settings/locale-labels';
import { useTranslationsEditor } from '../../../../../../lib/menu/use-translations-editor';
import { ApiError } from '../../../../../../lib/api/errors';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Button } from '../../../../../../components/ui/Button';
import { Card } from '../../../../../../components/ui/Card';
import { FormField } from '../../../../../../components/ui/FormField';
import { FormSection } from '../../../../../../components/ui/FormSection';
import { Input } from '../../../../../../components/ui/Input';
import { Select } from '../../../../../../components/ui/Select';
import { Textarea } from '../../../../../../components/ui/Textarea';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { LanguageTabs, type LanguageTabOption } from '../../../../../../components/menu/LanguageTabs';
import { TranslationFields } from '../../../../../../components/menu/TranslationFields';
import { ImageField } from '../../../../../../components/menu/ImageField';
import { resolveAssetUrl } from '../../../../../../lib/media/asset-url';
import { validateImageFile } from '../../../../../../lib/menu/image-validation';
import { ModifiersSection } from './ModifiersSection';

/** Mirrors the Backend's accepted decimal-string shape (money-decimal.ts) -- helpful client validation only, never authoritative (CLAUDE.md #27). */
const MONEY_DECIMAL_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/;

export interface ProductEditorProps {
  restaurantId: string;
  currencyCode: string;
  /** `menu.manage` AND `allBranches === true` -- the Server page already refuses to render this component at all when false; kept here only to disable controls defensively. */
  canManage: boolean;
  mode: 'create' | 'edit';
  productId?: string;
}

interface ProductFormState {
  categoryId: string;
  name: string;
  description: string;
  status: ProductStatus;
  availability: ProductAvailability;
  basePrice: string;
  displayOrder: string;
  allowCustomerNotes: boolean;
  featured: boolean;
}

const EMPTY_FORM: ProductFormState = {
  categoryId: '',
  name: '',
  description: '',
  status: 'ACTIVE',
  availability: 'AVAILABLE',
  basePrice: '0.00',
  displayOrder: '0',
  allowCustomerNotes: false,
  featured: false,
};

function toFormState(product: Product): ProductFormState {
  return {
    categoryId: product.categoryId,
    name: product.translation.name,
    description: product.translation.description ?? '',
    status: product.status,
    availability: product.availability,
    basePrice: product.basePrice,
    displayOrder: String(product.displayOrder),
    allowCustomerNotes: product.allowCustomerNotes,
    featured: product.featured,
  };
}

/** One in-progress, not-yet-saved secondary-locale translation typed while creating (FT-1 correction 2, Section 4). */
interface SecondaryDraft {
  name: string;
  description: string;
}
type SecondaryDrafts = Record<string, SecondaryDraft>;

/**
 * Dedicated Product Editor (FT-1, Section 9/10) -- replaces the former
 * inline Create/Edit form that used to live beneath the Product list.
 * Sections: Basic information, Pricing, Availability, Menu placement,
 * Customer options, Languages. Deliberately does NOT render Variants,
 * Modifiers, Dietary/Allergens/Nutrition, or any image upload UI (Section
 * 9/11) -- those are out of scope for this batch entirely, not disabled
 * placeholders.
 *
 * `status`/`basePrice`/`displayOrder`/`allowCustomerNotes`/`featured`/
 * `categoryId`/default-locale `name`/`description` all save through the
 * existing generic `createProduct`/`updateProduct` contract, exactly as
 * before. `availability` is the one field with its own dedicated Backend
 * endpoint (Section 13): on Edit, a changed `availability` is saved via
 * `updateProductAvailability` as a second call after the generic Update
 * succeeds, and a failure there is surfaced without pretending the whole
 * Save failed (Section 18/19) -- the generic fields the first call
 * persisted stay persisted and reflected in the form.
 */
export function ProductEditor({
  restaurantId,
  currencyCode,
  canManage,
  mode,
  productId,
}: ProductEditorProps) {
  const { t } = useStaffI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCategoryIdParam = searchParams.get('categoryId');
  const translationErrorParam = searchParams.get('translationError');
  const imageErrorParam = searchParams.get('imageError');
  const createdParam = searchParams.get('created');

  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locales, setLocales] = useState<RestaurantLocalesResponse | null>(null);
  const [product, setProduct] = useState<Product | null>(null);

  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [secondaryDrafts, setSecondaryDrafts] = useState<SecondaryDrafts>({});

  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setStatus('loading');
    setLoadError(null);
    try {
      const [menusData, categoriesData, localesData, productsData] = await Promise.all([
        menuApi.listMenus(restaurantId),
        menuApi.listCategories(restaurantId),
        settingsApi.getRestaurantLocales(restaurantId),
        mode === 'edit' ? menuApi.listProducts(restaurantId) : Promise.resolve<Product[]>([]),
      ]);
      if (requestRef.current !== requestId) return; // superseded -- discard.

      setMenus(menusData);
      setCategories(categoriesData);
      setLocales(localesData);

      if (mode === 'edit') {
        const found = productsData.find((candidate) => candidate.id === productId);
        if (!found) {
          setStatus('error');
          setLoadError(t('product.notFound'));
          return;
        }
        setProduct(found);
        setForm(toFormState(found));
        if (translationErrorParam || imageErrorParam) {
          // Redirected here straight after Create because one or more
          // secondary-locale translations and/or the image upload failed
          // to save (FT-1 correction 2 / FT-2, Section 5/14) -- the
          // Product itself is real and already created, never
          // duplicate-create it; just surface the failure(s) so the User
          // can retry below.
          const failures: string[] = [];
          if (translationErrorParam) {
            const failedLabels = translationErrorParam.split(',').map(localeLabel).join(', ');
            failures.push(t('product.failTranslation', { languages: failedLabels }));
          }
          if (imageErrorParam) {
            failures.push(t('product.failImage'));
          }
          setFormError(
            t('product.createdPartial', { problems: failures.join(t('menu.form.and')) }),
          );
        } else if (createdParam) {
          // FT-6B, Section 8: a fully successful Create now lands here
          // directly (see `handleSubmit` below) rather than back on Menu
          // Management -- this explicit notice keeps that redirect from
          // feeling like a silent, unexplained screen switch (the original
          // FT-2 correction's concern), while letting Staff configure
          // Modifiers/Presets immediately without a second navigation.
          setSaveNotice(t('product.createdNotice'));
        }
      } else {
        const preselected =
          initialCategoryIdParam && categoriesData.some((category) => category.id === initialCategoryIdParam)
            ? initialCategoryIdParam
            : (categoriesData[0]?.id ?? '');
        setForm({ ...EMPTY_FORM, categoryId: preselected });
      }
      setStatus('loaded');
    } catch (error) {
      if (requestRef.current !== requestId) return;
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setStatus('error');
      setLoadError(describeError(error));
    }
  }, [
    restaurantId,
    mode,
    productId,
    initialCategoryIdParam,
    translationErrorParam,
    imageErrorParam,
    createdParam,
    t,
  ]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  // FT-2, Section 16: a local object-URL preview only ever exists for a
  // `pendingImageFile` (Create mode, before the Product exists). Computed
  // with `useMemo` rather than effect+state, so the URL is available on the
  // very same render as the file selection; the effect below only revokes
  // the previous URL once it's no longer used, never calls setState.
  const pendingImagePreviewUrl = useMemo(
    () => (pendingImageFile ? URL.createObjectURL(pendingImageFile) : null),
    [pendingImageFile],
  );
  useEffect(() => {
    return () => {
      if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl);
    };
  }, [pendingImagePreviewUrl]);

  function handleSelectImageFile(file: File) {
    const validationError = validateImageFile(file);
    if (validationError) {
      setImageError(validationError);
      return;
    }
    setImageError(null);
    if (mode === 'create') {
      // No Product exists yet -- keep the file locally; `handleSubmit`
      // uploads it right after Create succeeds (Section 14).
      setPendingImageFile(file);
      return;
    }
    if (productId) {
      void uploadImageNow(productId, file);
    }
  }

  async function uploadImageNow(id: string, file: File) {
    setImageUploadBusy(true);
    setImageError(null);
    try {
      const result = await menuApi.uploadProductImage(restaurantId, id, file);
      setProduct((prev) =>
        prev ? { ...prev, primaryImageAssetPath: result.primaryImageAssetPath } : prev,
      );
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setImageError(describeError(error));
    } finally {
      setImageUploadBusy(false);
    }
  }

  async function handleRemoveImage() {
    if (mode === 'create') {
      // Nothing persisted yet -- just drop the local selection.
      setPendingImageFile(null);
      return;
    }
    if (!productId) return;
    setImageUploadBusy(true);
    setImageError(null);
    try {
      await menuApi.removeProductImage(restaurantId, productId);
      setProduct((prev) => (prev ? { ...prev, primaryImageAssetPath: null } : prev));
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setImageError(describeError(error));
    } finally {
      setImageUploadBusy(false);
    }
  }

  const categoryGroups = useMemo(() => {
    const byMenu = new Map<string, Category[]>();
    for (const category of categories) {
      const list = byMenu.get(category.menuId) ?? [];
      list.push(category);
      byMenu.set(category.menuId, list);
    }
    return menus
      .map((menu) => ({ menu, categories: byMenu.get(menu.id) ?? [] }))
      .filter((group) => group.categories.length > 0);
  }, [menus, categories]);

  const selectedCategory = categories.find((category) => category.id === form.categoryId);
  const backHref = selectedCategory
    ? `/staff/restaurants/${restaurantId}/menu?menuId=${selectedCategory.menuId}&categoryId=${selectedCategory.id}`
    : `/staff/restaurants/${restaurantId}/menu`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    if (form.categoryId === '') {
      setFormError(t('product.categoryRequired'));
      return;
    }
    if (form.name.trim() === '') {
      setFormError(t('menu.tr.nameRequired'));
      return;
    }
    const displayOrder = Number(form.displayOrder);
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      setFormError(t('menu.form.displayOrderInvalid'));
      return;
    }
    if (!MONEY_DECIMAL_PATTERN.test(form.basePrice)) {
      setFormError(t('product.priceInvalid'));
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setSaveNotice(null);
    try {
      if (mode === 'create') {
        const created = await menuApi.createProduct(restaurantId, {
          categoryId: form.categoryId,
          name: form.name,
          description: form.description.trim() === '' ? null : form.description,
          status: form.status,
          availability: form.availability,
          basePrice: form.basePrice,
          displayOrder,
          allowCustomerNotes: form.allowCustomerNotes,
          featured: form.featured,
        });

        // Secondary-locale translations are only created once the Product
        // itself exists (FT-1 correction 2, Section 4): PUT each entered
        // draft now, using the Product id the create call just returned. A
        // blank draft is skipped entirely -- never PUT an empty translation
        // (Section 5).
        const translationFailures: string[] = [];
        for (const [locale, draft] of Object.entries(secondaryDrafts)) {
          if (draft.name.trim() === '') continue;
          try {
            await menuApi.putProductTranslation(restaurantId, created.id, locale, {
              name: draft.name.trim(),
              description: draft.description.trim() === '' ? null : draft.description.trim(),
            });
          } catch (translationError) {
            if (isUnauthenticatedError(translationError)) {
              redirectToLogin();
              return;
            }
            translationFailures.push(locale);
          }
        }

        // The selected image (if any) is only uploaded once the Product
        // exists, exactly like a secondary translation (FT-2, Section 14).
        let imageUploadFailed = false;
        if (pendingImageFile) {
          try {
            await menuApi.uploadProductImage(restaurantId, created.id, pendingImageFile);
          } catch (imageUploadError) {
            if (isUnauthenticatedError(imageUploadError)) {
              redirectToLogin();
              return;
            }
            imageUploadFailed = true;
          }
        }

        // The Product itself was created successfully either way -- never
        // duplicate-create it on retry (Section 5). A partial translation
        // and/or image failure sends the User to the Product Edit route
        // (with the failure carried over as query params) so they can
        // retry there without hiding that the Product is real and already
        // saved.
        //
        // FT-6B, Section 8: full success ALSO now lands on the Product
        // Edit route (revising the earlier FT-2 correction that returned
        // to Menu Management instead) -- Modifiers/Presets can only be
        // configured once the Product exists, so redirecting straight to
        // Edit lets Staff do that immediately without a second navigation.
        // The `created=1` param drives an explicit "Product created"
        // notice (above) so this still reads as an intentional landing,
        // never a silent, unexplained screen switch.
        const failureParams = new URLSearchParams();
        if (translationFailures.length > 0) {
          failureParams.set('translationError', translationFailures.join(','));
        }
        if (imageUploadFailed) {
          failureParams.set('imageError', '1');
        }
        if (failureParams.size === 0) {
          failureParams.set('created', '1');
        }
        router.replace(
          `/staff/restaurants/${restaurantId}/menu/products/${created.id}?categoryId=${created.categoryId}&${failureParams.toString()}`,
        );
        return;
      }

      if (!productId) return;
      const updated = await menuApi.updateProduct(restaurantId, productId, {
        categoryId: form.categoryId,
        name: form.name,
        description: form.description.trim() === '' ? null : form.description,
        status: form.status,
        basePrice: form.basePrice,
        displayOrder,
        allowCustomerNotes: form.allowCustomerNotes,
        featured: form.featured,
      });

      let finalAvailability = updated.availability;
      let availabilityWarning: string | null = null;
      if (form.availability !== updated.availability) {
        try {
          const availabilityResult = await menuApi.updateProductAvailability(
            restaurantId,
            productId,
            form.availability,
          );
          finalAvailability = availabilityResult.availability;
        } catch (availabilityError) {
          if (isUnauthenticatedError(availabilityError)) {
            redirectToLogin();
            return;
          }
          availabilityWarning = describeError(availabilityError);
        }
      }

      const finalProduct: Product = { ...updated, availability: finalAvailability };
      setProduct(finalProduct);
      setForm(toFormState(finalProduct));
      setSaveNotice(
        availabilityWarning
          ? t('product.availabilityFailed', { reason: availabilityWarning })
          : t('product.saved'),
      );
    } catch (submitError) {
      if (isUnauthenticatedError(submitError)) {
        redirectToLogin();
        return;
      }
      if (submitError instanceof ApiError) {
        if (submitError.code === 'PRODUCT_NOT_FOUND') {
          setFormError(t('product.gone'));
          return;
        }
        if (submitError.code === 'CATEGORY_NOT_FOUND') {
          setFormError(t('product.categoryGone'));
          return;
        }
      }
      setFormError(describeError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status === 'loading') {
    return (
      <Card>
        <LoadingState label={t('product.loading')} />
      </Card>
    );
  }

  if (status === 'error') {
    return (
      <Card className="flex flex-col gap-3">
        <Alert variant="error">{loadError}</Alert>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
          <Link href={`/staff/restaurants/${restaurantId}/menu`}>
            <Button variant="secondary" type="button">
              {t('product.backToMenu')}
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  const isBusy = isSubmitting || !canManage || imageUploadBusy;
  const displayImageUrl = pendingImagePreviewUrl ?? resolveAssetUrl(product?.primaryImageAssetPath);
  const hasRemovableImage = mode === 'create' ? pendingImageFile !== null : product?.primaryImageAssetPath != null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href={backHref} className="text-sm text-primary hover:underline">
            <span aria-hidden="true" className="inline-block rtl:rotate-180">
              ←
            </span>{' '}
            {t('product.backToMenu')}
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-foreground">
            {mode === 'create'
              ? t('product.createTitle')
              : t('product.editTitle', {
                  name: `\u2068${product?.translation.name ?? t('product.fallbackName')}\u2069`,
                })}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {saveNotice ? <span className="text-sm text-success">{saveNotice}</span> : null}
          <Button type="submit" disabled={isBusy}>
            {isSubmitting
              ? t('common.saving')
              : mode === 'create'
                ? t('product.createContinue')
                : t('menu.form.saveChanges')}
          </Button>
        </div>
      </div>

      {!canManage ? (
        <Alert variant="info">{t('guard.noPermission.menuManage')}</Alert>
      ) : null}

      {formError ? <Alert variant="error">{formError}</Alert> : null}

      <Card className="flex flex-col gap-6">
        <FormSection title={t('menu.form.image')}>
          <ImageField
            idPrefix="product"
            imageUrl={displayImageUrl}
            onSelectFile={handleSelectImageFile}
            onRemove={hasRemovableImage ? () => void handleRemoveImage() : undefined}
            isBusy={imageUploadBusy}
            error={imageError}
            selectLabel={displayImageUrl ? t('menu.form.replaceImage') : t('menu.form.chooseImage')}
            helperText={
              mode === 'create'
                ? t('product.imageHintCreate')
                : t('menu.form.imageHint')
            }
          />
        </FormSection>
      </Card>

      <Card className="flex flex-col gap-6">
        {mode === 'create' ? (
          <ProductCreateLanguages
            form={form}
            setForm={setForm}
            isBusy={isBusy}
            locales={locales}
            secondaryDrafts={secondaryDrafts}
            setSecondaryDrafts={setSecondaryDrafts}
          />
        ) : (
          <ProductTranslationSection
            restaurantId={restaurantId}
            entityId={productId ?? ''}
            locales={locales}
            form={form}
            setForm={setForm}
            isBusy={isBusy}
          />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <FormSection title={t('product.section.pricing')}>
            <FormField label={t('product.price', { currency: currencyCode })} htmlFor="product-basePrice">
              <Input
                id="product-basePrice"
                inputMode="decimal"
                dir="ltr"
                required
                value={form.basePrice}
                onChange={(event) => setForm((prev) => ({ ...prev, basePrice: event.target.value }))}
                disabled={isBusy}
              />
            </FormField>
          </FormSection>
        </Card>

        <Card>
          <FormSection title={t('product.section.availability')}>
            <FormField label={t('menu.form.status')} htmlFor="product-status">
              <Select
                id="product-status"
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as ProductStatus }))}
                disabled={isBusy}
              >
                <option value="ACTIVE">{t('common.active')}</option>
                <option value="INACTIVE">{t('common.inactive')}</option>
              </Select>
              {form.status === 'INACTIVE' ? (
                <p className="mt-1 text-xs text-muted-foreground">{t('product.inactiveHint')}</p>
              ) : null}
            </FormField>
            <FormField label={t('product.availability')} htmlFor="product-availability">
              <Select
                id="product-availability"
                value={form.availability}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, availability: event.target.value as ProductAvailability }))
                }
                disabled={isBusy}
              >
                <option value="AVAILABLE">{t('menu.badge.available')}</option>
                <option value="SOLD_OUT">{t('menu.badge.soldOut')}</option>
              </Select>
            </FormField>
          </FormSection>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <FormSection title={t('product.section.placement')}>
            <FormField label={t('product.category')} htmlFor="product-category">
              <Select
                id="product-category"
                required
                value={form.categoryId}
                onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                disabled={isBusy}
              >
                {form.categoryId === '' ? <option value="">{t('product.selectCategory')}</option> : null}
                {categoryGroups.map((group) => (
                  <optgroup key={group.menu.id} label={group.menu.translation.name}>
                    {group.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.translation.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </FormField>
            <FormField label={t('menu.form.displayOrder')} htmlFor="product-displayOrder">
              <Input
                id="product-displayOrder"
                type="number"
                min={0}
                step={1}
                required
                value={form.displayOrder}
                onChange={(event) => setForm((prev) => ({ ...prev, displayOrder: event.target.value }))}
                disabled={isBusy}
              />
            </FormField>
          </FormSection>
        </Card>

        <Card>
          <FormSection title={t('product.section.customer')}>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.allowCustomerNotes}
                onChange={(event) => setForm((prev) => ({ ...prev, allowCustomerNotes: event.target.checked }))}
                disabled={isBusy}
              />
              {t('product.allowNotes')}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(event) => setForm((prev) => ({ ...prev, featured: event.target.checked }))}
                disabled={isBusy}
              />
              {t('menu.badge.featured')}
            </label>
          </FormSection>
        </Card>
      </div>

      {mode === 'edit' && productId ? (
        <Card className="flex flex-col gap-6">
          <ModifiersSection
            restaurantId={restaurantId}
            productId={productId}
            currencyCode={currencyCode}
            locales={locales}
            canManage={canManage}
          />
        </Card>
      ) : (
        <Card className="flex flex-col gap-6">
          <FormSection title={t('mod.title')}>
            <p className="text-sm text-muted-foreground">{t('product.modifiersCreateFirst')}</p>
          </FormSection>
        </Card>
      )}
    </form>
  );
}

/**
 * Create-mode Languages section (FT-1 correction 2, Section 1/4), mirroring
 * `MenuContextBar.MenuCreateLanguages`/`CategoryNavigation.CategoryCreateLanguages`
 * exactly: shows the same `[ English ] [ العربية ]` tabs as Edit for every
 * ACTIVE Restaurant locale, but keeps secondary-locale content in local
 * `secondaryDrafts` only -- no GET/PUT/DELETE happens until the parent's
 * `handleSubmit` PUTs each non-empty draft after the Product has actually
 * been created.
 */
function ProductCreateLanguages({
  form,
  setForm,
  isBusy,
  locales,
  secondaryDrafts,
  setSecondaryDrafts,
}: {
  form: ProductFormState;
  setForm: (updater: (prev: ProductFormState) => ProductFormState) => void;
  isBusy: boolean;
  locales: RestaurantLocalesResponse | null;
  secondaryDrafts: SecondaryDrafts;
  setSecondaryDrafts: (updater: (prev: SecondaryDrafts) => SecondaryDrafts) => void;
}) {
  const { t } = useStaffI18n();
  const defaultLocale = locales?.defaultLocale ?? null;
  const secondaryLocales = useMemo(
    () =>
      locales?.locales.filter((row) => !row.isDefault && row.isActive).map((row) => row.locale) ?? [],
    [locales],
  );

  const [activeLocale, setActiveLocale] = useState<string>('__default__');
  const isDefaultTab = activeLocale === '__default__';
  const currentLocale = isDefaultTab ? defaultLocale : activeLocale;
  const dir = currentLocale ? localeDirection(currentLocale) : 'ltr';

  const tabOptions: LanguageTabOption[] = defaultLocale
    ? [
        { locale: '__default__', label: localeLabel(defaultLocale), stateLabel: t('menu.content.default') },
        ...secondaryLocales.map((locale) => ({
          locale,
          label: localeLabel(locale),
          stateLabel: secondaryDrafts[locale]?.name.trim() ? t('menu.content.draftEntered') : t('menu.content.notTranslated'),
        })),
      ]
    : [];

  function updateDraft(locale: string, patch: Partial<SecondaryDraft>) {
    setSecondaryDrafts((prev) => ({
      ...prev,
      [locale]: { ...(prev[locale] ?? { name: '', description: '' }), ...patch },
    }));
  }

  return (
    <FormSection title={t('menu.form.contentLanguages')}>
      <LanguageTabs options={tabOptions} activeLocale={activeLocale} onSelect={setActiveLocale} />

      {isDefaultTab ? (
        <>
          <FormField label={t('menu.tr.name')} htmlFor="product-name">
            <Input
              id="product-name"
              dir={dir}
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              disabled={isBusy}
            />
          </FormField>
          <FormField label={t('menu.tr.description')} htmlFor="product-description">
            <Textarea
              id="product-description"
              dir={dir}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              disabled={isBusy}
            />
          </FormField>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t('menu.form.optionalLanguage')}</p>
          <FormField label={t('menu.tr.name')} htmlFor={`product-create-name-${activeLocale}`}>
            <Input
              id={`product-create-name-${activeLocale}`}
              dir={dir}
              value={secondaryDrafts[activeLocale]?.name ?? ''}
              onChange={(event) => updateDraft(activeLocale, { name: event.target.value })}
              disabled={isBusy}
            />
          </FormField>
          <FormField label={t('menu.tr.description')} htmlFor={`product-create-description-${activeLocale}`}>
            <Textarea
              id={`product-create-description-${activeLocale}`}
              dir={dir}
              value={secondaryDrafts[activeLocale]?.description ?? ''}
              onChange={(event) => updateDraft(activeLocale, { description: event.target.value })}
              disabled={isBusy}
            />
          </FormField>
        </>
      )}
    </FormSection>
  );
}

/**
 * Edit-only Languages section (FT-1 correction, Section 3): only ever
 * rendered once the Product exists (`mode === 'edit'`), mirroring
 * `MenuContextBar.MenuTranslationSection`/`CategoryNavigation.CategoryTranslationSection`
 * exactly. Create shows the same tabs via `ProductCreateLanguages` above,
 * backed by local drafts instead of the translation hook.
 */
function ProductTranslationSection({
  restaurantId,
  entityId,
  locales,
  form,
  setForm,
  isBusy,
}: {
  restaurantId: string;
  entityId: string;
  locales: RestaurantLocalesResponse | null;
  form: ProductFormState;
  setForm: (updater: (prev: ProductFormState) => ProductFormState) => void;
  isBusy: boolean;
}) {
  const { t } = useStaffI18n();
  const defaultLocale = locales?.defaultLocale ?? null;
  // Memoized: see MenuContextBar's identical note -- an unstable array
  // identity here would make useTranslationsEditor re-fetch (and wipe
  // in-progress edits) on every keystroke in a translation field.
  const secondaryLocales = useMemo(
    () =>
      locales?.locales.filter((row) => !row.isDefault && row.isActive).map((row) => row.locale) ?? [],
    [locales],
  );

  const [activeLocale, setActiveLocale] = useState<string>('__default__');

  const translations = useTranslationsEditor({
    restaurantId,
    entityId,
    locales: secondaryLocales,
    list: menuApi.getProductTranslations,
    put: menuApi.putProductTranslation,
    remove: menuApi.deleteProductTranslation,
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

  return (
    <FormSection title={t('menu.form.contentLanguages')}>
      <LanguageTabs options={tabOptions} activeLocale={activeLocale} onSelect={setActiveLocale} />

      {isDefaultTab ? (
        <>
          <FormField label={t('menu.tr.name')} htmlFor="product-name">
            <Input
              id="product-name"
              dir={dir}
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              disabled={isBusy}
            />
          </FormField>
          <FormField label={t('menu.tr.description')} htmlFor="product-description">
            <Textarea
              id="product-description"
              dir={dir}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              disabled={isBusy}
            />
          </FormField>
        </>
      ) : (
        <TranslationFields
          idPrefix="product-translation"
          locale={activeLocale}
          dir={dir}
          draft={translations.drafts[activeLocale]}
          onChange={(patch) => translations.updateDraft(activeLocale, patch)}
          onSave={() => void translations.save(activeLocale)}
          onRemove={() => void translations.removeTranslation(activeLocale)}
        />
      )}
    </FormSection>
  );
}
