'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import * as menuApi from '../../../../../lib/menu/api';
import type { Product, ProductStatus } from '../../../../../lib/menu/types';
import { ApiError } from '../../../../../lib/api/errors';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { SectionCard } from '../../../../../components/ui/SectionCard';
import { EmptyState } from '../../../../../components/ui/EmptyState';
import { Input } from '../../../../../components/ui/Input';
import { Select } from '../../../../../components/ui/Select';
import { Switch } from '../../../../../components/ui/Switch';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import {
  IconImage,
  IconPencil,
  IconPlus,
  IconSearch,
} from '../../../../../components/staff/icons';
import { DragGrip, MoveArrows, useDragReorder } from '../../../../../components/menu/reorder';
import { FeaturedBadge, StatusBadge } from './StatusBadges';
import { resolveAssetUrl } from '../../../../../lib/media/asset-url';

type StatusFilter = 'ALL' | ProductStatus;
type AvailabilityFilter = 'ALL' | 'AVAILABLE' | 'SOLD_OUT';

/** One shared column template so the header and every row line up, with the name taking all the slack (and truncating) instead of pushing the other columns off screen. */
const ROW_GRID = 'xl:grid xl:grid-cols-[24px_44px_minmax(0,1fr)_120px_140px_40px] xl:items-center xl:gap-3';

interface ProductListProps {
  restaurantId: string;
  /** `null` while the "All products" view is selected (or nothing is). */
  categoryId: string | null;
  /** The "All products" view: every Product of the Menu, tagged with its Category, not reorderable. */
  isAllProducts: boolean;
  /** Category id -> display name (for the tag in the "All products" view). */
  categoryNames: Record<string, string>;
  categoryName?: string;
  menuName?: string;
  products: Product[] | null;
  error: string | null;
  onRetry: () => void;
  canManage: boolean;
  currencyCode: string;
  onAvailabilityChanged: () => void;
  onProductNotFound: () => void;
  /** Drag-and-drop / arrow ordering: gets the full new order of this Category's products. */
  onReorder: (productIds: string[]) => void;
}

/** FT-2, Section 17: shows `Product.primaryImageAssetPath` when present; keeps the existing plain placeholder otherwise. */
function ProductThumbnail({ imageAssetPath }: { imageAssetPath: string | null }) {
  const imageUrl = resolveAssetUrl(imageAssetPath);
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable static/local image.
      <img
        src={imageUrl}
        alt=""
        className="h-11 w-11 flex-shrink-0 rounded-lg border border-border object-cover"
      />
    );
  }
  return (
    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <IconImage className="h-5 w-5" />
    </span>
  );
}

function matchesSearch(product: Product, query: string): boolean {
  if (query.trim() === '') return true;
  const haystack = `${product.translation.name} ${product.translation.description ?? ''}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

function AddProductButton({
  restaurantId,
  categoryId,
  variant = 'primary',
}: {
  restaurantId: string;
  /** `null` from the "All products" view: the editor then starts with its own default Category. */
  categoryId: string | null;
  variant?: 'primary' | 'secondary';
}) {
  const { t } = useStaffI18n();
  return (
    <Button asChild variant={variant} size="sm">
      <Link
        href={`/staff/restaurants/${restaurantId}/menu/products/new${
          categoryId ? `?categoryId=${categoryId}` : ''
        }`}
      >
        <IconPlus />
        {t('menu.products.add')}
      </Link>
    </Button>
  );
}

/**
 * The Products of the selected Category as one scannable list: image, name
 * (with a one-line description that truncates), price, an availability switch
 * that takes effect immediately, status, and edit. The name column absorbs the
 * slack, so a long description can never push price / availability off screen.
 * Staff drag a row by its grip (desktop) or use the arrows (touch / keyboard)
 * to set the order guests see; ordering is paused while a search or filter
 * hides rows, because the order of a partial list would be ambiguous.
 *
 * Filtering stays purely local over the loaded Category; `basePrice` is the
 * exact string the Backend returned (CLAUDE.md #27). Create / Edit open the
 * dedicated Product Editor route.
 */
export function ProductList({
  restaurantId,
  categoryId,
  isAllProducts,
  categoryNames,
  categoryName,
  menuName,
  products,
  error,
  onRetry,
  canManage,
  currencyCode,
  onAvailabilityChanged,
  onProductNotFound,
  onReorder,
}: ProductListProps) {
  const { t } = useStaffI18n();
  const [availabilityPendingId, setAvailabilityPendingId] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('ALL');

  const isFiltering =
    searchQuery.trim() !== '' || statusFilter !== 'ALL' || availabilityFilter !== 'ALL';

  const filteredProducts = useMemo(() => {
    if (!products) return null;
    return products.filter(
      (product) =>
        matchesSearch(product, searchQuery) &&
        (statusFilter === 'ALL' || product.status === statusFilter) &&
        (availabilityFilter === 'ALL' || product.availability === availabilityFilter),
    );
  }, [products, searchQuery, statusFilter, availabilityFilter]);

  const productIds = useMemo(() => (products ?? []).map((product) => product.id), [products]);
  const canReorder = canManage && !isAllProducts && !isFiltering && (products?.length ?? 0) > 1;
  const reorder = useDragReorder({ ids: productIds, enabled: canReorder, onReorder });

  async function handleSetAvailability(product: Product, available: boolean) {
    if (availabilityPendingId) return;
    setAvailabilityPendingId(product.id);
    setAvailabilityError(null);
    try {
      await menuApi.updateProductAvailability(
        restaurantId,
        product.id,
        available ? 'AVAILABLE' : 'SOLD_OUT',
      );
      onAvailabilityChanged();
    } catch (submitError) {
      if (isUnauthenticatedError(submitError)) {
        redirectToLogin();
        return;
      }
      if (submitError instanceof ApiError && submitError.code === 'PRODUCT_NOT_FOUND') {
        onProductNotFound();
        return;
      }
      setAvailabilityError(describeError(submitError));
    } finally {
      setAvailabilityPendingId(null);
    }
  }

  const subtitle = isAllProducts
    ? menuName
    : categoryName
      ? menuName
        ? `${categoryName} · ${menuName}`
        : categoryName
      : undefined;
  const hasScope = isAllProducts || categoryId !== null;

  function availabilitySwitch(product: Product) {
    const available = product.availability === 'AVAILABLE';
    return (
      <span className="inline-flex items-center gap-2">
        <Switch
          checked={available}
          label={t('menu.products.availabilityAria', { name: product.translation.name })}
          disabled={!canManage || availabilityPendingId !== null}
          onCheckedChange={(next) => void handleSetAvailability(product, next)}
        />
        <span
          className={`text-xs font-medium ${available ? 'text-success' : 'text-destructive'}`}
        >
          {availabilityPendingId === product.id
            ? t('menu.products.updating')
            : available
              ? t('menu.badge.available')
              : t('menu.badge.soldOut')}
        </span>
      </span>
    );
  }

  function editLink(product: Product) {
    return (
      <Button asChild variant="ghost" size="icon">
        <Link
          href={`/staff/restaurants/${restaurantId}/menu/products/${product.id}?categoryId=${product.categoryId}`}
          aria-label={t('menu.products.editAria', { name: product.translation.name })}
        >
          <IconPencil className="h-4 w-4" />
        </Link>
      </Button>
    );
  }

  return (
    <SectionCard
      className="min-w-0"
      bodyClassName="flex flex-col gap-4"
      title={t('menu.products.title')}
      description={subtitle}
      actions={canManage && hasScope ? <AddProductButton restaurantId={restaurantId} categoryId={categoryId} /> : undefined}
    >
      {!hasScope ? (
        <EmptyState compact title={t('menu.products.selectCategory')} />
      ) : (
        <>
          {error ? (
            <Alert variant="error">
              <div className="flex items-center justify-between gap-4">
                <span>{error}</span>
                <Button variant="secondary" size="sm" onClick={onRetry}>
                  {t('common.retry')}
                </Button>
              </div>
            </Alert>
          ) : null}
          {availabilityError ? <Alert variant="error">{availabilityError}</Alert> : null}

          {products === null && !error ? <LoadingState label={t('menu.products.loading')} /> : null}

          {products !== null && products.length === 0 ? (
            <EmptyState
              icon={<IconImage />}
              title={t('menu.products.emptyTitle')}
              description={t('menu.products.emptyHint')}
              action={
                canManage && hasScope ? (
                  <AddProductButton restaurantId={restaurantId} categoryId={categoryId} variant="secondary" />
                ) : undefined
              }
            />
          ) : null}

          {products !== null && products.length > 0 ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1 sm:max-w-xs">
                  <IconSearch className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t('menu.products.searchPlaceholder')}
                    className="ps-8"
                    aria-label={t('menu.products.searchAria')}
                  />
                </div>
                <Select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className="sm:w-36"
                  aria-label={t('menu.products.filterStatus')}
                >
                  <option value="ALL">{t('menu.products.allStatuses')}</option>
                  <option value="ACTIVE">{t('common.active')}</option>
                  <option value="INACTIVE">{t('common.inactive')}</option>
                </Select>
                <Select
                  value={availabilityFilter}
                  onChange={(event) => setAvailabilityFilter(event.target.value as AvailabilityFilter)}
                  className="sm:w-40"
                  aria-label={t('menu.products.filterAvailability')}
                >
                  <option value="ALL">{t('menu.products.allAvailability')}</option>
                  <option value="AVAILABLE">{t('menu.badge.available')}</option>
                  <option value="SOLD_OUT">{t('menu.badge.soldOut')}</option>
                </Select>
              </div>

              {canManage && isFiltering && products.length > 1 ? (
                <p className="text-xs text-muted-foreground">{t('menu.reorder.filtered')}</p>
              ) : null}

              {filteredProducts && filteredProducts.length === 0 ? (
                <EmptyState compact icon={<IconSearch />} title={t('menu.products.noMatch')} />
              ) : null}

              {filteredProducts && filteredProducts.length > 0 ? (
                <div className="flex flex-col">
                  {/* Column labels (desktop): the same grid as every row. */}
                  <div
                    className={`hidden border-b border-border px-2 pb-2 text-xs font-medium text-muted-foreground ${ROW_GRID}`}
                    aria-hidden="true"
                  >
                    <span />
                    <span />
                    <span>{t('menu.products.col.product')}</span>
                    <span>{t('menu.products.col.price')}</span>
                    <span>{t('menu.products.col.availability')}</span>
                    <span />
                  </div>

                  <ul className="flex flex-col gap-3 xl:gap-0 xl:divide-y xl:divide-border">
                    {filteredProducts.map((product) => {
                      const index = productIds.indexOf(product.id);
                      const isDragging = reorder.draggingId === product.id;
                      const isOver = reorder.overId === product.id;
                      return (
                        <li
                          key={product.id}
                          data-reorder-row
                          {...reorder.rowProps(product.id)}
                          className={`rounded-lg border border-border bg-card p-3 transition-colors xl:rounded-none xl:border-0 xl:bg-transparent xl:px-2 xl:py-3 xl:hover:bg-muted/40 ${ROW_GRID} ${
                            isDragging ? 'opacity-50' : ''
                          } ${isOver ? 'outline outline-2 -outline-offset-2 outline-primary' : ''}`}
                        >
                          {/* grip: desktop only (the arrows are the touch / keyboard path) */}
                          <span className="hidden xl:block">
                            {canReorder ? (
                              <DragGrip
                                name={product.translation.name}
                                handleProps={reorder.handleProps(product.id)}
                              />
                            ) : null}
                          </span>

                          <div className="flex items-start gap-3 xl:contents">
                            <ProductThumbnail imageAssetPath={product.primaryImageAssetPath} />
                            <div className="min-w-0 flex-1 xl:flex-none">
                              <p className="flex items-center gap-2 font-medium text-foreground">
                                <span dir="auto" className="truncate">
                                  {product.translation.name}
                                </span>
                                {product.featured ? <FeaturedBadge /> : null}
                                {product.status === 'INACTIVE' ? <StatusBadge active={false} /> : null}
                              </p>
                              {isAllProducts || product.translation.description ? (
                                <p dir="auto" className="truncate text-xs text-muted-foreground">
                                  {isAllProducts && categoryNames[product.categoryId] ? (
                                    <span className="font-semibold text-secondary-foreground">
                                      {categoryNames[product.categoryId]}
                                      {product.translation.description ? ' · ' : ''}
                                    </span>
                                  ) : null}
                                  {product.translation.description}
                                </p>
                              ) : null}
                              <p className="mt-1 text-sm font-medium text-secondary-foreground xl:hidden">
                                <ProductPrice product={product} currencyCode={currencyCode} />
                              </p>
                            </div>
                          </div>

                          <span className="hidden whitespace-nowrap text-sm font-medium text-foreground xl:block">
                            <ProductPrice product={product} currencyCode={currencyCode} />
                          </span>

                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 xl:mt-0 xl:contents">
                            {availabilitySwitch(product)}
                            <span className="ms-auto flex items-center gap-1 xl:ms-0 xl:justify-end">
                              {canReorder ? (
                                <MoveArrows
                                  name={product.translation.name}
                                  index={index}
                                  count={productIds.length}
                                  onMove={(delta) => reorder.moveBy(product.id, delta)}
                                  className="xl:hidden"
                                />
                              ) : null}
                              {canManage ? editLink(product) : null}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

/** The list price: the original struck through with the discounted price while a discount is active, and a small state badge otherwise. */
function ProductPrice({ product, currencyCode }: { product: Product; currencyCode: string }) {
  const { t } = useStaffI18n();
  const discount = product.discount;
  if (!discount) {
    return (
      <bdi dir="ltr">
        {product.basePrice} {currencyCode}
      </bdi>
    );
  }
  return (
    <span className="flex flex-col items-start gap-0.5">
      {discount.state === 'ACTIVE' && discount.discountedPrice ? (
        <>
          <bdi dir="ltr" className="text-xs font-normal text-muted-foreground line-through">
            {product.basePrice} {currencyCode}
          </bdi>
          <bdi dir="ltr">
            {discount.discountedPrice} {currencyCode}
          </bdi>
        </>
      ) : (
        <bdi dir="ltr">
          {product.basePrice} {currencyCode}
        </bdi>
      )}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
          discount.state === 'ACTIVE' ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'
        }`}
      >
        {t(`product.discount.listBadge.${discount.state}` as const)}
      </span>
    </span>
  );
}
