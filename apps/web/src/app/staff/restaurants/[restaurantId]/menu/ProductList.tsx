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
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../../components/ui/Table';
import {
  IconImage,
  IconPencil,
  IconPlus,
  IconSearch,
} from '../../../../../components/staff/icons';
import { AvailabilityBadge, FeaturedBadge, StatusBadge } from './StatusBadges';
import { resolveAssetUrl } from '../../../../../lib/media/asset-url';

type StatusFilter = 'ALL' | ProductStatus;
type AvailabilityFilter = 'ALL' | 'AVAILABLE' | 'SOLD_OUT';

interface ProductListProps {
  restaurantId: string;
  categoryId: string | null;
  categoryName?: string;
  menuName?: string;
  products: Product[] | null;
  error: string | null;
  onRetry: () => void;
  canManage: boolean;
  currencyCode: string;
  onAvailabilityChanged: () => void;
  onProductNotFound: () => void;
}

/** FT-2, Section 17: shows `Product.primaryImageAssetPath` when present; keeps the existing plain placeholder otherwise -- no thumbnail-heavy redesign. */
function ProductThumbnail({ imageAssetPath }: { imageAssetPath: string | null }) {
  const imageUrl = resolveAssetUrl(imageAssetPath);
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable static/local image.
      <img
        src={imageUrl}
        alt=""
        className="h-10 w-10 flex-shrink-0 rounded-md border border-border object-cover"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
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
  categoryId: string;
  variant?: 'primary' | 'secondary';
}) {
  const { t } = useStaffI18n();
  return (
    <Button asChild variant={variant} size="sm">
      <Link href={`/staff/restaurants/${restaurantId}/menu/products/new?categoryId=${categoryId}`}>
        <IconPlus />
        {t('menu.products.add')}
      </Link>
    </Button>
  );
}

/**
 * UX-3, Section 8/9/10 (design-system-v2: rebuilt on `SectionCard` +
 * shared `Table` primitives): Products are the dominant, wide workspace
 * area, presented as a professional list/table (desktop) or stacked cards
 * (mobile) instead of small equal-width cards. Search/Status/Availability
 * filtering (Section 8) operates only on the already-loaded `products`
 * array for the current Category -- purely local `useState`/`useMemo`, no
 * new Backend call. `basePrice` is rendered as the exact string the Backend
 * returned -- never `Number()`/`parseFloat()` (CLAUDE.md #27).
 *
 * FT-1, Section 9: Create/Edit no longer happen inline here -- "Add
 * Product"/the row edit action are plain links to the dedicated Product
 * Editor route (`menu/products/new` / `menu/products/[productId]`), which
 * owns its own fetch/submit lifecycle entirely. The Availability toggle
 * stays here unchanged, calling the same dedicated `updateProductAvailability`
 * endpoint it always has.
 */
export function ProductList({
  restaurantId,
  categoryId,
  categoryName,
  menuName,
  products,
  error,
  onRetry,
  canManage,
  currencyCode,
  onAvailabilityChanged,
  onProductNotFound,
}: ProductListProps) {
  const { t } = useStaffI18n();
  const [availabilityPendingId, setAvailabilityPendingId] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('ALL');

  const filteredProducts = useMemo(() => {
    if (!products) return null;
    return products.filter(
      (product) =>
        matchesSearch(product, searchQuery) &&
        (statusFilter === 'ALL' || product.status === statusFilter) &&
        (availabilityFilter === 'ALL' || product.availability === availabilityFilter),
    );
  }, [products, searchQuery, statusFilter, availabilityFilter]);

  async function handleToggleAvailability(product: Product) {
    if (availabilityPendingId) return;
    setAvailabilityPendingId(product.id);
    setAvailabilityError(null);
    const next = product.availability === 'AVAILABLE' ? 'SOLD_OUT' : 'AVAILABLE';
    try {
      await menuApi.updateProductAvailability(restaurantId, product.id, next);
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

  const subtitle = categoryName ? (menuName ? `${categoryName} · ${menuName}` : categoryName) : undefined;

  return (
    <SectionCard
      className="min-w-0"
      bodyClassName="flex flex-col gap-4"
      title={t('menu.products.title')}
      description={subtitle}
      actions={canManage && categoryId ? <AddProductButton restaurantId={restaurantId} categoryId={categoryId} /> : undefined}
    >
      {!categoryId ? (
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
                canManage && categoryId ? (
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

              {filteredProducts && filteredProducts.length === 0 ? (
                <EmptyState compact icon={<IconSearch />} title={t('menu.products.noMatch')} />
              ) : null}

              {/* Desktop: a real table (Section 9), edge-aligned with the card's own padding. */}
              <div className="hidden xl:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('menu.products.col.product')}</TableHead>
                      <TableHead>{t('menu.products.col.price')}</TableHead>
                      <TableHead>{t('menu.products.col.availability')}</TableHead>
                      <TableHead>{t('menu.products.col.status')}</TableHead>
                      <TableHead className="text-end">{t('menu.products.col.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts?.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <ProductThumbnail imageAssetPath={product.primaryImageAssetPath} />
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-medium text-foreground">
                                <span dir="auto" className="truncate">
                                  {product.translation.name}
                                </span>
                                {product.featured ? <FeaturedBadge /> : null}
                              </p>
                              {product.translation.description ? (
                                <p dir="auto" className="truncate text-xs text-muted-foreground">
                                  {product.translation.description}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium text-foreground">
                          <bdi dir="ltr">
                            {product.basePrice} {currencyCode}
                          </bdi>
                        </TableCell>
                        <TableCell>
                          <AvailabilityBadge availability={product.availability} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge active={product.status === 'ACTIVE'} />
                        </TableCell>
                        <TableCell>
                          {canManage ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={availabilityPendingId === product.id}
                                onClick={() => void handleToggleAvailability(product)}
                              >
                                {availabilityPendingId === product.id
                                  ? t('menu.products.updating')
                                  : product.availability === 'AVAILABLE'
                                    ? t('menu.products.markSoldOut')
                                    : t('menu.products.markAvailable')}
                              </Button>
                              <Button asChild variant="ghost" size="icon">
                                <Link
                                  href={`/staff/restaurants/${restaurantId}/menu/products/${product.id}?categoryId=${categoryId}`}
                                  aria-label={t('menu.products.editAria', { name: product.translation.name })}
                                >
                                  <IconPencil className="h-4 w-4" />
                                </Link>
                              </Button>
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile/tablet: stacked cards (Section 17). */}
              <ul className="flex flex-col gap-3 xl:hidden">
                {filteredProducts?.map((product) => (
                  <li key={product.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-start gap-3">
                      <ProductThumbnail imageAssetPath={product.primaryImageAssetPath} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-medium text-foreground">
                          <span dir="auto" className="truncate">
                            {product.translation.name}
                          </span>
                          {product.featured ? <FeaturedBadge /> : null}
                        </p>
                        <p className="mt-0.5 text-sm text-secondary-foreground">
                          <bdi dir="ltr">
                            {product.basePrice} {currencyCode}
                          </bdi>
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <AvailabilityBadge availability={product.availability} />
                          <StatusBadge active={product.status === 'ACTIVE'} />
                        </div>
                      </div>
                    </div>
                    {canManage ? (
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          variant="secondary"
                          className="flex-1"
                          size="sm"
                          disabled={availabilityPendingId === product.id}
                          onClick={() => void handleToggleAvailability(product)}
                        >
                          {availabilityPendingId === product.id
                            ? t('menu.products.updating')
                            : product.availability === 'AVAILABLE'
                              ? t('menu.products.markSoldOut')
                              : t('menu.products.markAvailable')}
                        </Button>
                        <Button asChild variant="secondary" size="icon">
                          <Link
                            href={`/staff/restaurants/${restaurantId}/menu/products/${product.id}?categoryId=${categoryId}`}
                            aria-label={t('menu.products.editAria', { name: product.translation.name })}
                          >
                            <IconPencil className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}
