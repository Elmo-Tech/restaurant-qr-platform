'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../../lib/i18n/messages';
import * as importApi from '../../../../../../lib/menu-import/api';
import type {
  ApproveResult,
  DraftCategory,
  DraftFlag,
  DraftProduct,
  ImportDraft,
} from '../../../../../../lib/menu-import/types';
import { formatMoney } from '../../../../../../lib/public-menu/price-format';
import { localeDirection, localeLabel } from '../../../../../../lib/settings/locale-labels';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Badge } from '../../../../../../components/ui/Badge';
import { Button } from '../../../../../../components/ui/Button';
import { Card } from '../../../../../../components/ui/Card';
import { ConfirmDialog } from '../../../../../../components/ui/ConfirmDialog';
import { Input } from '../../../../../../components/ui/Input';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { Select } from '../../../../../../components/ui/Select';

interface ImportReviewProps {
  restaurantId: string;
  publicId: string;
  currencyCode: string;
  onApproved: (result: ApproveResult) => void;
  onDiscarded: () => void;
}

const FLAG_VARIANT: Record<DraftFlag, 'destructive' | 'warning' | 'info' | 'neutral'> = {
  MISSING_PRICE: 'destructive',
  MISSING_NAME: 'destructive',
  LOW_CONFIDENCE: 'warning',
  ALREADY_EXISTS: 'info',
  MISSING_TRANSLATION: 'neutral',
};

/** Review of the Draft: edit, include / exclude, then approve. Every edit is saved at once and the Draft reloaded, so the flags are always the Backend's. */
export function ImportReview({
  restaurantId,
  publicId,
  currencyCode,
  onApproved,
  onDiscarded,
}: ImportReviewProps) {
  const { t, tp, locale } = useStaffI18n();
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [productStatus, setProductStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const fail = useCallback((caught: unknown) => {
    if (isUnauthenticatedError(caught)) {
      redirectToLogin();
      return;
    }
    setError(describeError(caught));
  }, []);

  const reload = useCallback(async () => {
    try {
      setDraft(await importApi.getDraft(restaurantId, publicId));
    } catch (caught) {
      fail(caught);
    }
  }, [restaurantId, publicId, fail]);

  useEffect(() => {
    let cancelled = false;
    importApi
      .getDraft(restaurantId, publicId)
      .then((loaded) => {
        if (!cancelled) setDraft(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) fail(caught);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, publicId, fail]);

  /** Saves one edit, then reloads the Draft. */
  async function save(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await reload();
    } catch (caught) {
      fail(caught);
      await reload();
    }
  }

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      onApproved(await importApi.approveImport(restaurantId, publicId, productStatus));
    } catch (caught) {
      fail(caught);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    setBusy(true);
    try {
      await importApi.discardImport(restaurantId, publicId);
      onDiscarded();
    } catch (caught) {
      setConfirmDiscard(false);
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  if (!draft) {
    return error ? <Alert variant="error">{error}</Alert> : <LoadingState label={t('import.loading')} />;
  }

  const locales = [draft.defaultLocale, ...draft.activeLocales.filter((l) => l !== draft.defaultLocale)];
  const toAdd = draft.categories
    .filter((c) => c.included)
    .reduce((sum, c) => sum + c.products.filter((p) => p.included).length, 0);
  const categoriesWithItems = draft.categories.filter(
    (c) => c.included && c.products.some((p) => p.included),
  ).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{t('import.review.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('import.review.summary', { products: toAdd, categories: categoriesWithItems })}
          {' · '}
          <span dir="auto">{t('import.review.file', { name: draft.job.sourceFileName })}</span>
        </p>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {draft.job.warnings.map((warning) => (
        <Alert key={warning} variant="warning">
          {t(
            (`import.review.warning.${warning}` in WARNING_KEYS
              ? `import.review.warning.${warning}`
              : 'import.review.warning.default') as MessageKey,
          )}
        </Alert>
      ))}

      {draft.blockerCount > 0 ? (
        <Alert variant="warning">{tp('import.review.blockers', draft.blockerCount)}</Alert>
      ) : toAdd === 0 ? (
        <Alert variant="info">{t('import.review.empty')}</Alert>
      ) : (
        <Alert variant="success">{t('import.review.ready')}</Alert>
      )}

      {draft.categories.map((category) => (
        <CategoryCard
          key={category.id}
          category={category}
          locales={locales}
          defaultLocale={draft.defaultLocale}
          currencyCode={currencyCode}
          uiLocale={locale}
          onCategory={(input) =>
            save(() => importApi.updateDraftCategory(restaurantId, publicId, category.id, input))
          }
          onProduct={(productId, input) =>
            save(() => importApi.updateDraftProduct(restaurantId, publicId, productId, input))
          }
        />
      ))}

      <Card className="sticky bottom-3 z-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="import-status" className="text-sm font-medium text-secondary-foreground">
              {t('import.approve.status')}
            </label>
            <Select
              id="import-status"
              value={productStatus}
              onChange={(event) => setProductStatus(event.target.value as 'ACTIVE' | 'INACTIVE')}
              className="sm:w-64"
            >
              <option value="ACTIVE">{t('import.approve.published')}</option>
              <option value="INACTIVE">{t('import.approve.hidden')}</option>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setConfirmDiscard(true)} disabled={busy}>
              {t('import.discard')}
            </Button>
            <Button onClick={() => void approve()} disabled={busy || draft.blockerCount > 0 || toAdd === 0}>
              {busy ? t('import.approve.submitting') : t('import.approve.submit')}
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDiscard}
        title={t('import.discard.title')}
        description={t('import.discard.body')}
        confirmLabel={t('import.discard.confirm')}
        isSubmitting={busy}
        onConfirm={() => void discard()}
        onClose={() => setConfirmDiscard(false)}
      />
    </div>
  );
}

const WARNING_KEYS: Record<string, true> = {
  'import.review.warning.RESULT_TRUNCATED': true,
  'import.review.warning.MODEL_OUTPUT_MAY_BE_INCOMPLETE': true,
  'import.review.warning.SOME_FILES_FAILED': true,
};

interface CategoryCardProps {
  category: DraftCategory;
  locales: string[];
  defaultLocale: string;
  currencyCode: string;
  uiLocale: string;
  onCategory: (input: {
    included?: boolean;
    useExisting?: boolean;
    names?: Record<string, string | null>;
  }) => Promise<void>;
  onProduct: (
    productId: string,
    input: {
      included?: boolean;
      price?: string | null;
      names?: Record<string, string | null>;
    },
  ) => Promise<void>;
}

function CategoryCard({
  category,
  locales,
  defaultLocale,
  currencyCode,
  uiLocale,
  onCategory,
  onProduct,
}: CategoryCardProps) {
  const { t } = useStaffI18n();
  const title = category.names[defaultLocale] ?? Object.values(category.names)[0] ?? '';
  const missingName = category.flags.includes('MISSING_NAME');

  return (
    <Card className="flex flex-col gap-4 p-0">
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={category.included}
            onChange={(event) => void onCategory({ included: event.target.checked })}
          />
          {t('import.category.include')}
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          {locales.map((code) => (
            <div key={code} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor={`c-${category.id}-${code}`}>
                {t('import.category.name', { language: localeLabel(code) })}
              </label>
              <Input
                id={`c-${category.id}-${code}`}
                key={`${code}-${category.names[code] ?? ''}`}
                dir={localeDirection(code)}
                defaultValue={category.names[code] ?? ''}
                aria-invalid={code === defaultLocale && missingName}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value !== (category.names[code] ?? '')) void onCategory({ names: { [code]: value } });
                }}
              />
            </div>
          ))}
        </div>

        {category.matchedCategoryId ? (
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t('import.category.existsHint')}</span>
            <Select
              aria-label={t('import.category.existsHint')}
              value={category.useExisting ? 'existing' : 'new'}
              onChange={(event) => void onCategory({ useExisting: event.target.value === 'existing' })}
              className="sm:w-80"
            >
              <option value="existing">{t('import.category.useExisting', { name: title })}</option>
              <option value="new">{t('import.category.createNew')}</option>
            </Select>
          </div>
        ) : null}
      </div>

      <ul className={category.included ? 'divide-y divide-border' : 'divide-y divide-border opacity-50'}>
        {category.products.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            locales={locales}
            defaultLocale={defaultLocale}
            currencyCode={currencyCode}
            uiLocale={uiLocale}
            onChange={(input) => onProduct(product.id, input)}
          />
        ))}
      </ul>
    </Card>
  );
}

function ProductRow({
  product,
  locales,
  defaultLocale,
  currencyCode,
  uiLocale,
  onChange,
}: {
  product: DraftProduct;
  locales: string[];
  defaultLocale: string;
  currencyCode: string;
  uiLocale: string;
  onChange: (input: {
    included?: boolean;
    price?: string | null;
    names?: Record<string, string | null>;
  }) => Promise<void>;
}) {
  const { t } = useStaffI18n();
  const hasSizes = product.sizes.length >= 2;

  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={product.included}
            onChange={(event) => void onChange({ included: event.target.checked })}
          />
          {product.included ? t('import.product.include') : t('import.product.hidden')}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {product.flags.map((flag) => (
            <Badge key={flag} variant={FLAG_VARIANT[flag]}>
              {t(`import.product.flag.${flag}` as MessageKey)}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px]">
        {locales.map((code) => (
          <div key={code} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`p-${product.id}-${code}`}>
              {t('import.product.name', { language: localeLabel(code) })}
            </label>
            <Input
              id={`p-${product.id}-${code}`}
              key={`${code}-${product.names[code] ?? ''}`}
              dir={localeDirection(code)}
              defaultValue={product.names[code] ?? ''}
              aria-invalid={code === defaultLocale && !product.names[code]}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value !== (product.names[code] ?? '')) void onChange({ names: { [code]: value } });
              }}
            />
          </div>
        ))}

        {hasSizes ? null : (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`pr-${product.id}`}>
              {t('import.product.price')} ({currencyCode})
            </label>
            <Input
              id={`pr-${product.id}`}
              key={`price-${product.price ?? ''}`}
              inputMode="decimal"
              dir="ltr"
              placeholder={t('import.product.pricePlaceholder')}
              defaultValue={product.price ?? ''}
              aria-invalid={product.flags.includes('MISSING_PRICE')}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value !== (product.price ?? '')) void onChange({ price: value === '' ? null : value });
              }}
            />
          </div>
        )}
      </div>

      {hasSizes ? (
        <div className="text-sm">
          <span className="font-medium text-secondary-foreground">{t('import.product.sizes')}: </span>
          <span className="text-muted-foreground" dir="auto">
            {product.sizes
              .map(
                (size) =>
                  `${size.names[defaultLocale] ?? Object.values(size.names)[0] ?? ''} ${formatMoney(size.price, currencyCode, uiLocale)}`,
              )
              .join(' · ')}
          </span>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('import.product.sizesNote')}</p>
        </div>
      ) : null}
    </li>
  );
}
