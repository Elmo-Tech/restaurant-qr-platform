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
  ModifierGroup,
  Product,
  ProductAvailability,
  ProductStatus,
  ProductVariant,
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
import { DraftSizes, VariantsSection, type SizeDraft } from './VariantsSection';
import { ProductPreview } from './ProductPreview';
import { toMinorUnits } from '../../../../../../lib/public-menu/money';
import { useAddonsPreview } from './use-addons-preview';
import { Switch } from '../../../../../../components/ui/Switch';
import type {
  PublicMenuVariant,
  PublicProductDiscount,
} from '../../../../../../lib/public-menu/types';
import {
  previewDiscount,
  validateDiscountForm,
} from '../../../../../../lib/menu/discount';
import type { ProductDiscountInput } from '../../../../../../lib/menu/api';

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
  /** Product Discounts V1: NONE = no discount configured. */
  discountMode: 'NONE' | 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountEnabled: boolean;
  discountValue: string;
  discountStartsOn: string;
  discountEndsOn: string;
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
  discountMode: 'NONE',
  discountEnabled: true,
  discountValue: '',
  discountStartsOn: '',
  discountEndsOn: '',
};

/** The write shape for the form's discount section (`null` removes the discount). */
function toDiscountInput(form: ProductFormState): ProductDiscountInput | null {
  if (form.discountMode === 'NONE') return null;
  return {
    enabled: form.discountEnabled,
    type: form.discountMode,
    value: form.discountValue.trim(),
    startsOn: form.discountStartsOn === '' ? null : form.discountStartsOn,
    endsOn: form.discountEndsOn === '' ? null : form.discountEndsOn,
  };
}

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
    discountMode: product.discount ? product.discount.type : 'NONE',
    discountEnabled: product.discount ? product.discount.enabled : true,
    discountValue: product.discount ? product.discount.value : '',
    discountStartsOn: product.discount?.startsOn ?? '',
    discountEndsOn: product.discount?.endsOn ?? '',
  };
}

/** A product added to (or moved into) a Category goes to the end of it. Drag-and-drop ordering in the Menu workspace is the way to place it elsewhere. */
function nextDisplayOrder(products: readonly Product[], categoryId: string): number {
  let max = -1;
  for (const product of products) {
    if (product.categoryId === categoryId && product.displayOrder > max) max = product.displayOrder;
  }
  return max + 1;
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
  const sizeErrorParam = searchParams.get('sizeError');
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
  // The content language tab being edited: shared with the preview so it shows (in the right
  // language and direction) exactly what is being typed.
  const [activeLocale, setActiveLocale] = useState<string>('__default__');
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  // The product's add-ons (reported by the Add-ons section) and which preview view is open.
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[] | null>(null);
  const [previewView, setPreviewView] = useState<'card' | 'page'>('card');
  // The product's sizes (reported by the Sizes section) for the guest preview.
  const [variants, setVariants] = useState<ProductVariant[] | null>(null);
  // Each size's name in the secondary content language being edited (for the preview).
  const [variantNames, setVariantNames] = useState<{
    locale: string | null;
    names: Record<string, string>;
  }>({ locale: null, names: {} });
  const handleVariantNames = useCallback(
    (locale: string | null, names: Record<string, string>) => setVariantNames({ locale, names }),
    [],
  );
  // Create mode: sizes typed before the Product exists (saved right after it is created).
  const [sizeDrafts, setSizeDrafts] = useState<SizeDraft[]>([]);
  const handleDraftsChange = useCallback((drafts: SizeDraft[]) => {
    setSizeDrafts(drafts);
    if (drafts.length === 0) return;
    const cheapest = drafts.reduce((best, draft) =>
      toMinorUnits(draft.price) < toMinorUnits(best.price) ? draft : best,
    );
    setForm((prev) => (prev.basePrice === cheapest.price ? prev : { ...prev, basePrice: cheapest.price }));
  }, []);
  // While the Product has active sizes its price IS the cheapest size: keep the form's price in step.
  const handleVariantsChange = useCallback((list: ProductVariant[]) => {
    setVariants(list);
    const active = list.filter((variant) => variant.status === 'ACTIVE');
    if (active.length === 0) return;
    const cheapest = active.reduce((best, variant) =>
      toMinorUnits(variant.price) < toMinorUnits(best.price) ? variant : best,
    );
    setForm((prev) => (prev.basePrice === cheapest.price ? prev : { ...prev, basePrice: cheapest.price }));
  }, []);

  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const secondaryLocales = useMemo(
    () =>
      locales?.locales.filter((row) => !row.isDefault && row.isActive).map((row) => row.locale) ?? [],
    [locales],
  );
  // Saved translations (edit mode). Lifted here so the preview can show the language being
  // edited; the editor section below only renders them.
  const translations = useTranslationsEditor({
    restaurantId,
    entityId: mode === 'edit' ? (productId ?? null) : null,
    locales: secondaryLocales,
    list: menuApi.getProductTranslations,
    put: menuApi.putProductTranslation,
    remove: menuApi.deleteProductTranslation,
  });

  const addonsPreview = useAddonsPreview({
    restaurantId,
    productId: mode === 'edit' ? (productId ?? null) : null,
    groups: modifierGroups,
    locale: activeLocale === '__default__' ? (locales?.defaultLocale ?? 'en') : activeLocale,
    defaultLocale: locales?.defaultLocale ?? 'en',
    enabled: previewView === 'page',
  });

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
        menuApi.listProducts(restaurantId),
      ]);
      if (requestRef.current !== requestId) return; // superseded -- discard.

      setMenus(menusData);
      setCategories(categoriesData);
      setLocales(localesData);
      setAllProducts(productsData);

      if (mode === 'edit') {
        const found = productsData.find((candidate) => candidate.id === productId);
        if (!found) {
          setStatus('error');
          setLoadError(t('product.notFound'));
          return;
        }
        setProduct(found);
        setForm(toFormState(found));
        if (translationErrorParam || imageErrorParam || sizeErrorParam) {
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
          if (sizeErrorParam) {
            failures.push(t('product.failSizes'));
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
        setForm({
          ...EMPTY_FORM,
          categoryId: preselected,
          displayOrder: String(nextDisplayOrder(productsData, preselected)),
        });
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
    sizeErrorParam,
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
    if (form.discountMode !== 'NONE') {
      const discountError = validateDiscountForm({
        type: form.discountMode,
        value: form.discountValue,
        basePrice: form.basePrice,
        startsOn: form.discountStartsOn,
        endsOn: form.discountEndsOn,
      });
      if (discountError) {
        setFormError(t(`product.discount.error.${discountError}` as const));
        return;
      }
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
          ...(form.discountMode === 'NONE' ? {} : { discount: toDiscountInput(form) }),
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

        // Sizes typed in the Sizes section are created now (DEC-041); the Backend keeps the
        // Product price equal to the cheapest one. The first size is the default.
        let sizesFailed = false;
        for (const [index, draft] of sizeDrafts.entries()) {
          try {
            const createdSize = await menuApi.createProductVariant(restaurantId, created.id, {
              name: draft.name,
              status: 'ACTIVE',
              price: draft.price,
              displayOrder: index,
              isDefault: index === 0,
            });
            for (const [locale, text] of Object.entries(draft.translations)) {
              await menuApi.putProductVariantTranslation(restaurantId, created.id, createdSize.id, locale, {
                name: text,
              });
            }
          } catch (sizeError) {
            if (isUnauthenticatedError(sizeError)) {
              redirectToLogin();
              return;
            }
            sizesFailed = true;
            break;
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
        if (sizesFailed) {
          failureParams.set('sizeError', '1');
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
        discount: toDiscountInput(form),
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

  // ---- live preview: the form as guests would see it, in the language being edited ----
  const defaultLocaleCode = locales?.defaultLocale ?? 'en';
  const previewLocale = activeLocale === '__default__' ? defaultLocaleCode : activeLocale;
  const secondaryDraftText =
    activeLocale === '__default__'
      ? null
      : mode === 'create'
        ? (secondaryDrafts[activeLocale] ?? null)
        : (translations.drafts[activeLocale] ?? null);
  const secondaryHasName = secondaryDraftText !== null && secondaryDraftText.name.trim() !== '';
  const previewName = secondaryHasName ? secondaryDraftText.name : form.name;
  const previewDescription = secondaryHasName ? secondaryDraftText.description : form.description;
  const previewDiscountResult =
    form.discountMode !== 'NONE' && form.discountEnabled
      ? previewDiscount(form.basePrice, form.discountMode, form.discountValue)
      : null;
  const discountIsOn = form.discountMode !== 'NONE' && form.discountEnabled;
  // Saved sizes in edit mode; the not-yet-saved drafts in create mode.
  const sizeSource: ProductVariant[] =
    mode === 'create'
      ? sizeDrafts.map((draft, index) => ({
          id: draft.key,
          status: 'ACTIVE' as const,
          name: draft.name,
          price: draft.price,
          displayOrder: index,
          isDefault: index === 0,
          discountApplies: true,
          canDelete: true,
        }))
      : (variants ?? []);
  const hasActiveSizes = sizeSource.some((variant) => variant.status === 'ACTIVE');
  // The sizes as a guest sees them: each size's own price, discounted only where the discount applies.
  const previewVariants: PublicMenuVariant[] = sizeSource
    .filter((variant) => variant.status === 'ACTIVE')
    .map((variant) => {
      const discount =
        discountIsOn && variant.discountApplies && form.discountMode !== 'NONE'
          ? previewDiscount(variant.price, form.discountMode, form.discountValue)
          : null;
      const localized =
        variantNames.locale !== null && variantNames.locale === previewLocale
          ? (variantNames.names[variant.id] ?? '')
          : '';
      return {
        id: variant.id,
        name: localized.trim() !== '' ? localized : variant.name,
        price: variant.price,
        discountedPrice: discount ? discount.discountedPrice : null,
        isDefault: variant.isDefault,
      };
    });
  const previewGuestDiscount: PublicProductDiscount | null = previewDiscountResult
    ? {
        type: form.discountMode === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED_AMOUNT',
        value: form.discountValue.trim(),
        amountOff: previewDiscountResult.unitDiscount,
        discountedPrice: previewDiscountResult.discountedPrice,
        endsOn: form.discountEndsOn === '' ? null : form.discountEndsOn,
      }
    : null;

  const sections: { id: string; label: string }[] = [
    { id: 'product-section-basics', label: t('product.nav.basics') },
    { id: 'product-section-pricing', label: t('product.nav.pricing') },
    { id: 'product-section-sizes', label: t('product.nav.sizes') },
    { id: 'product-section-visibility', label: t('product.nav.visibility') },
    { id: 'product-section-addons', label: t('product.nav.addons') },
  ];
  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function changeCategory(categoryId: string) {
    setForm((prev) => ({
      ...prev,
      categoryId,
      // Moving a product to another Category puts it at the end of that Category.
      displayOrder:
        categoryId === (product?.categoryId ?? '')
          ? String(product?.displayOrder ?? 0)
          : String(nextDisplayOrder(allProducts, categoryId)),
    }));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Always-visible header: where you are, what you can jump to, and Save. */}
      <div className="sticky top-2 z-20 flex flex-col gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href={backHref} className="text-sm text-primary hover:underline">
              <span aria-hidden="true" className="inline-block rtl:rotate-180">
                ←
              </span>{' '}
              {t('product.backToMenu')}
            </Link>
            <h1 className="mt-0.5 truncate text-lg font-semibold text-foreground">
              {mode === 'create'
                ? t('product.createTitle')
                : t('product.editTitle', {
                    name: `\u2068${product?.translation.name ?? t('product.fallbackName')}\u2069`,
                  })}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {saveNotice ? (
              <span role="status" className="text-sm text-success">
                {saveNotice}
              </span>
            ) : null}
            <Button type="submit" disabled={isBusy}>
              {isSubmitting
                ? t('common.saving')
                : mode === 'create'
                  ? t('product.createContinue')
                  : t('menu.form.saveChanges')}
            </Button>
          </div>
        </div>
        <nav aria-label={t('product.nav.label')} className="flex flex-wrap gap-1.5">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => scrollToSection(section.id)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-secondary-foreground outline-none transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              {section.label}
            </button>
          ))}
        </nav>
      </div>

      {!canManage ? (
        <Alert variant="info">{t('guard.noPermission.menuManage')}</Alert>
      ) : null}

      {formError ? <Alert variant="error">{formError}</Alert> : null}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* 1. Basics: image, then the name and description per language. */}
          <Card id="product-section-basics" className="scroll-mt-40 flex flex-col gap-6">
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

            {mode === 'create' ? (
              <ProductCreateLanguages
                form={form}
                setForm={setForm}
                isBusy={isBusy}
                locales={locales}
                secondaryDrafts={secondaryDrafts}
                setSecondaryDrafts={setSecondaryDrafts}
                activeLocale={activeLocale}
                onActiveLocaleChange={setActiveLocale}
              />
            ) : (
              <ProductTranslationSection
                locales={locales}
                form={form}
                setForm={setForm}
                isBusy={isBusy}
                translations={translations}
                secondaryLocales={secondaryLocales}
                activeLocale={activeLocale}
                onActiveLocaleChange={setActiveLocale}
              />
            )}
          </Card>

          {/* 2. Pricing and discount. */}
          <Card id="product-section-pricing" className="scroll-mt-40">
            <FormSection title={t('product.section.pricing')}>
              <FormField label={t('product.price', { currency: currencyCode })} htmlFor="product-basePrice">
                <Input
                  id="product-basePrice"
                  inputMode="decimal"
                  dir="ltr"
                  required
                  value={form.basePrice}
                  onChange={(event) => setForm((prev) => ({ ...prev, basePrice: event.target.value }))}
                  disabled={isBusy || hasActiveSizes}
                />
                {hasActiveSizes ? (
                  <p className="text-xs text-muted-foreground">{t('product.priceFromSizes')}</p>
                ) : null}
              </FormField>

              <div className="mt-1 flex flex-col gap-4 border-t border-border pt-4">
                <FormField label={t('product.discount.type')} htmlFor="product-discount-type">
                  <Select
                    id="product-discount-type"
                    value={form.discountMode}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        discountMode: event.target.value as ProductFormState['discountMode'],
                      }))
                    }
                    disabled={isBusy}
                  >
                    <option value="NONE">{t('product.discount.none')}</option>
                    <option value="PERCENTAGE">{t('product.discount.percentage')}</option>
                    <option value="FIXED_AMOUNT">{t('product.discount.fixed')}</option>
                  </Select>
                </FormField>

                {form.discountMode !== 'NONE' ? (
                  <>
                    <FormField
                      label={
                        form.discountMode === 'PERCENTAGE'
                          ? t('product.discount.valuePercent')
                          : t('product.discount.valueFixed', { currency: currencyCode })
                      }
                      htmlFor="product-discount-value"
                    >
                      <Input
                        id="product-discount-value"
                        inputMode="decimal"
                        dir="ltr"
                        value={form.discountValue}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, discountValue: event.target.value }))
                        }
                        disabled={isBusy}
                      />
                    </FormField>

                    <SwitchRow
                      label={t('product.discount.enabled')}
                      hint={t('product.discount.enabledHint')}
                      checked={form.discountEnabled}
                      disabled={isBusy}
                      onChange={(next) => setForm((prev) => ({ ...prev, discountEnabled: next }))}
                    />

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField label={t('product.discount.startsOn')} htmlFor="product-discount-starts">
                        <Input
                          id="product-discount-starts"
                          type="date"
                          dir="ltr"
                          value={form.discountStartsOn}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, discountStartsOn: event.target.value }))
                          }
                          disabled={isBusy}
                        />
                      </FormField>
                      <FormField label={t('product.discount.endsOn')} htmlFor="product-discount-ends">
                        <Input
                          id="product-discount-ends"
                          type="date"
                          dir="ltr"
                          value={form.discountEndsOn}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, discountEndsOn: event.target.value }))
                          }
                          disabled={isBusy}
                        />
                      </FormField>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('product.discount.datesHint')}</p>

                    <DiscountPreview
                      currencyCode={currencyCode}
                      basePrice={form.basePrice}
                      type={form.discountMode}
                      value={form.discountValue}
                      savedDiscount={product?.discount ?? null}
                    />
                  </>
                ) : null}
              </div>
            </FormSection>
          </Card>

          {/* 3. Sizes: configured on the saved product, in this same page (DEC-041). */}
          <Card id="product-section-sizes" className="scroll-mt-40 flex flex-col gap-6">
            {mode === 'edit' && productId ? (
              <VariantsSection
                restaurantId={restaurantId}
                productId={productId}
                currencyCode={currencyCode}
                canManage={canManage}
                discountConfigured={form.discountMode !== 'NONE'}
                locales={locales}
                contentLocale={activeLocale}
                onVariantsChange={handleVariantsChange}
                onNamesChange={handleVariantNames}
              />
            ) : (
              <DraftSizes
                currencyCode={currencyCode}
                locales={locales}
                contentLocale={activeLocale}
                drafts={sizeDrafts}
                onChange={handleDraftsChange}
              />
            )}
          </Card>

          {/* 4. Where it lives and who sees it: one place, switches for the on/off facts. */}
          <Card id="product-section-visibility" className="scroll-mt-40">
            <FormSection title={t('product.section.visibility')}>
              <FormField label={t('product.category')} htmlFor="product-category">
                <Select
                  id="product-category"
                  required
                  value={form.categoryId}
                  onChange={(event) => changeCategory(event.target.value)}
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

              <div className="flex flex-col divide-y divide-border rounded-lg border border-border px-4">
                <SwitchRow
                  label={t('product.switch.active')}
                  hint={form.status === 'INACTIVE' ? t('product.inactiveHint') : t('product.switch.activeHint')}
                  checked={form.status === 'ACTIVE'}
                  disabled={isBusy}
                  onChange={(next) =>
                    setForm((prev) => ({ ...prev, status: next ? 'ACTIVE' : 'INACTIVE' }))
                  }
                />
                <SwitchRow
                  label={t('product.switch.available')}
                  hint={t('product.switch.availableHint')}
                  checked={form.availability === 'AVAILABLE'}
                  disabled={isBusy}
                  onChange={(next) =>
                    setForm((prev) => ({ ...prev, availability: next ? 'AVAILABLE' : 'SOLD_OUT' }))
                  }
                />
                <SwitchRow
                  label={t('menu.badge.featured')}
                  hint={t('product.switch.featuredHint')}
                  checked={form.featured}
                  disabled={isBusy}
                  onChange={(next) => setForm((prev) => ({ ...prev, featured: next }))}
                />
                <SwitchRow
                  label={t('product.allowNotes')}
                  hint={t('product.switch.notesHint')}
                  checked={form.allowCustomerNotes}
                  disabled={isBusy}
                  onChange={(next) => setForm((prev) => ({ ...prev, allowCustomerNotes: next }))}
                />
              </div>
            </FormSection>
          </Card>

          {/* 5. Add-ons: configured on the saved product, in this same page. */}
          <Card id="product-section-addons" className="scroll-mt-40 flex flex-col gap-6">
            {mode === 'edit' && productId ? (
              <ModifiersSection
                restaurantId={restaurantId}
                productId={productId}
                currencyCode={currencyCode}
                locales={locales}
                canManage={canManage}
                onGroupsChange={setModifierGroups}
              />
            ) : (
              <FormSection title={t('mod.title')}>
                <p className="text-sm text-muted-foreground">{t('product.modifiersCreateFirst')}</p>
              </FormSection>
            )}
          </Card>
        </div>

        {/* The preview stays in view while the form scrolls (desktop); below the form on small screens. */}
        <aside className="min-w-0 xl:sticky xl:top-32">
          <ProductPreview
            values={{
              name: previewName,
              description: previewDescription,
              basePrice: MONEY_DECIMAL_PATTERN.test(form.basePrice) ? form.basePrice : '0.00',
              discount: previewGuestDiscount,
              imageUrl: displayImageUrl,
              soldOut: form.availability === 'SOLD_OUT',
              featured: form.featured,
              active: form.status === 'ACTIVE',
            }}
            locale={previewLocale}
            usingFallback={activeLocale !== '__default__' && !secondaryHasName}
            currencyCode={currencyCode}
            modifierGroups={addonsPreview}
            variants={previewVariants}
            addonsAvailable={mode === 'edit'}
            view={previewView}
            onViewChange={setPreviewView}
          />
        </aside>
      </div>
    </form>
  );
}

/** A labelled on/off row: the switch is the control, the text says what it does. */
function SwitchRow({
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
  activeLocale,
  onActiveLocaleChange,
}: {
  form: ProductFormState;
  setForm: (updater: (prev: ProductFormState) => ProductFormState) => void;
  isBusy: boolean;
  locales: RestaurantLocalesResponse | null;
  secondaryDrafts: SecondaryDrafts;
  setSecondaryDrafts: (updater: (prev: SecondaryDrafts) => SecondaryDrafts) => void;
  activeLocale: string;
  onActiveLocaleChange: (locale: string) => void;
}) {
  const { t } = useStaffI18n();
  const defaultLocale = locales?.defaultLocale ?? null;
  const secondaryLocales = useMemo(
    () =>
      locales?.locales.filter((row) => !row.isDefault && row.isActive).map((row) => row.locale) ?? [],
    [locales],
  );

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
      <LanguageTabs options={tabOptions} activeLocale={activeLocale} onSelect={onActiveLocaleChange} />

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
  locales,
  form,
  setForm,
  isBusy,
  translations,
  secondaryLocales,
  activeLocale,
  onActiveLocaleChange,
}: {
  locales: RestaurantLocalesResponse | null;
  form: ProductFormState;
  setForm: (updater: (prev: ProductFormState) => ProductFormState) => void;
  isBusy: boolean;
  /** The saved-translations editor state (owned by the Product Editor so the preview can read it). */
  translations: ReturnType<typeof useTranslationsEditor>;
  secondaryLocales: string[];
  activeLocale: string;
  onActiveLocaleChange: (locale: string) => void;
}) {
  const { t } = useStaffI18n();
  const defaultLocale = locales?.defaultLocale ?? null;

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
      <LanguageTabs options={tabOptions} activeLocale={activeLocale} onSelect={onActiveLocaleChange} />

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

/**
 * The guest price preview inside the Pricing & discount section: the original
 * price crossed out, the discounted price prominently, and -- when this product
 * already has a saved discount -- its current state. Display only; the Backend
 * calculates every real price.
 */
function DiscountPreview({
  currencyCode,
  basePrice,
  type,
  value,
  savedDiscount,
}: {
  currencyCode: string;
  basePrice: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: string;
  savedDiscount: Product['discount'];
}) {
  const { t } = useStaffI18n();
  const preview = previewDiscount(basePrice, type, value);
  const isActiveNow = savedDiscount?.state === 'ACTIVE';

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{t('product.discount.previewTitle')}</p>
        {savedDiscount ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              isActiveNow ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'
            }`}
          >
            {t(`product.discount.state.${savedDiscount.state}` as const)}
          </span>
        ) : null}
      </div>
      {preview ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="sr-only">{t('product.discount.original')}</span>
            <bdi dir="ltr" className="text-sm text-muted-foreground line-through">
              {basePrice} {currencyCode}
            </bdi>
            <span className="sr-only">{t('product.discount.discounted')}</span>
            <bdi dir="ltr" className="text-xl font-bold text-foreground">
              {preview.discountedPrice} {currencyCode}
            </bdi>
            {preview.percentLabel ? (
              <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">
                <bdi dir="ltr">-{preview.percentLabel}</bdi>
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('product.discount.saving', { amount: preview.unitDiscount, currency: currencyCode })}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t('product.discount.error.valueRequired')}</p>
      )}
      {savedDiscount && !isActiveNow ? (
        <p className="text-xs text-muted-foreground">{t('product.discount.previewInactive')}</p>
      ) : null}
      {savedDiscount?.discountedPrice ? (
        <p className="text-xs font-medium text-foreground">
          {t('product.discount.currentPrice', {
            price: savedDiscount.discountedPrice,
            currency: currencyCode,
          })}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{t('product.discount.previewNote')}</p>
    </div>
  );
}
