'use client';

import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
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
import { Card } from '../../../../../components/ui/Card';
import { FormField } from '../../../../../components/ui/FormField';
import { Input } from '../../../../../components/ui/Input';
import { Select } from '../../../../../components/ui/Select';
import { Textarea } from '../../../../../components/ui/Textarea';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import {
  IconImage,
  IconPencil,
  IconPlus,
  IconSearch,
} from '../../../../../components/staff/icons';
import { AvailabilityBadge, FeaturedBadge, StatusBadge } from './StatusBadges';

/** Mirrors the Backend's accepted decimal-string shape (money-decimal.ts) -- helpful client validation only, never authoritative. */
const MONEY_DECIMAL_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/;

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
  onCreated: () => void;
  onUpdated: () => void;
  onAvailabilityChanged: () => void;
  onProductNotFound: () => void;
  onCategoryNotFound: () => void;
}

interface ProductFormState {
  name: string;
  description: string;
  status: ProductStatus;
  availability: 'AVAILABLE' | 'SOLD_OUT';
  basePrice: string;
  displayOrder: string;
  allowCustomerNotes: boolean;
  featured: boolean;
}

const EMPTY_FORM: ProductFormState = {
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

function ProductThumbnail() {
  return (
    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-[#F1ECE6] text-[#AFA397]">
      <IconImage className="h-5 w-5" />
    </span>
  );
}

function matchesSearch(product: Product, query: string): boolean {
  if (query.trim() === '') return true;
  const haystack = `${product.translation.name} ${product.translation.description ?? ''}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

/**
 * UX-3, Section 8/9/10: Products become the dominant, wide workspace area,
 * presented as a professional list/table (desktop) or stacked cards
 * (mobile) instead of small equal-width cards. Search/Status/Availability
 * filtering (Section 8) operates only on the already-loaded `products`
 * array for the current Category -- purely local `useState`/`useMemo`, no
 * new Backend call. All mutation logic below (Create/Edit submit,
 * availability toggle) is carried over unchanged from the former
 * `ProductsPanel`. `basePrice` is rendered as the exact string the Backend
 * returned -- never `Number()`/`parseFloat()` (CLAUDE.md #27).
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
  onCreated,
  onUpdated,
  onAvailabilityChanged,
  onProductNotFound,
  onCategoryNotFound,
}: ProductListProps) {
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  function startCreate() {
    setMode('create');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(product: Product) {
    setMode('edit');
    setEditingId(product.id);
    setForm(toFormState(product));
    setFormError(null);
  }

  function cancelForm() {
    setMode('idle');
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || !categoryId) return;

    const displayOrder = Number(form.displayOrder);
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      setFormError('Display order must be a whole number of 0 or more.');
      return;
    }
    if (!MONEY_DECIMAL_PATTERN.test(form.basePrice)) {
      setFormError('Price must be a plain decimal amount with up to 2 decimal places, e.g. 10.50.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      if (mode === 'create') {
        await menuApi.createProduct(restaurantId, {
          categoryId,
          name: form.name,
          description: form.description.trim() === '' ? null : form.description,
          status: form.status,
          availability: form.availability,
          basePrice: form.basePrice,
          displayOrder,
          allowCustomerNotes: form.allowCustomerNotes,
          featured: form.featured,
        });
        onCreated();
      } else if (mode === 'edit' && editingId) {
        await menuApi.updateProduct(restaurantId, editingId, {
          name: form.name,
          description: form.description.trim() === '' ? null : form.description,
          status: form.status,
          basePrice: form.basePrice,
          displayOrder,
          allowCustomerNotes: form.allowCustomerNotes,
          featured: form.featured,
        });
        onUpdated();
      }
      setMode('idle');
      setEditingId(null);
    } catch (submitError) {
      if (isUnauthenticatedError(submitError)) {
        redirectToLogin();
        return;
      }
      if (submitError instanceof ApiError) {
        if (submitError.code === 'PRODUCT_NOT_FOUND') {
          onProductNotFound();
          setMode('idle');
          setEditingId(null);
          return;
        }
        if (submitError.code === 'CATEGORY_NOT_FOUND') {
          onCategoryNotFound();
          setMode('idle');
          setEditingId(null);
          return;
        }
      }
      setFormError(describeError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

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

  const subtitle = categoryName
    ? menuName
      ? `${categoryName} · ${menuName}`
      : categoryName
    : null;

  return (
    <Card className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#302C29]">Products</h2>
          {subtitle ? <p className="text-xs text-[#655D56]">{subtitle}</p> : null}
        </div>
        {canManage && categoryId && mode === 'idle' ? (
          <Button className="px-3 py-1.5 text-xs" onClick={startCreate}>
            <IconPlus className="mr-1 h-3.5 w-3.5" /> Add Product
          </Button>
        ) : null}
      </div>

      {!categoryId ? (
        <p className="text-sm text-[#655D56]">Select a Category to see its Products.</p>
      ) : (
        <>
          {error ? (
            <Alert variant="error">
              <div className="flex items-center justify-between gap-4">
                <span>{error}</span>
                <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onRetry}>
                  Retry
                </Button>
              </div>
            </Alert>
          ) : null}
          {availabilityError ? <Alert variant="error">{availabilityError}</Alert> : null}

          {products === null && !error ? <LoadingState label="Loading Products…" /> : null}

          {products !== null && products.length === 0 && mode === 'idle' ? (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-medium text-[#302C29]">No products in this category</p>
                <p className="mt-1 text-sm text-[#655D56]">Add the first product.</p>
              </div>
              {canManage ? (
                <Button variant="secondary" className="self-start px-3 py-1.5 text-xs" onClick={startCreate}>
                  <IconPlus className="mr-1 h-3.5 w-3.5" /> Add Product
                </Button>
              ) : null}
            </div>
          ) : null}

          {products !== null && products.length > 0 ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1 sm:max-w-xs">
                  <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#AFA397]" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search products…"
                    className="pl-8"
                    aria-label="Search products"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className="sm:w-36"
                  aria-label="Filter by status"
                >
                  <option value="ALL">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
                <Select
                  value={availabilityFilter}
                  onChange={(event) => setAvailabilityFilter(event.target.value as AvailabilityFilter)}
                  className="sm:w-40"
                  aria-label="Filter by availability"
                >
                  <option value="ALL">All availability</option>
                  <option value="AVAILABLE">Available</option>
                  <option value="SOLD_OUT">Sold out</option>
                </Select>
              </div>

              {filteredProducts && filteredProducts.length === 0 ? (
                <p className="text-sm text-[#655D56]">No products match the current filters.</p>
              ) : null}

              {/* Desktop: table-like list (Section 9). */}
              <div className="hidden overflow-x-auto xl:block">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#E5DED6] text-left text-xs font-medium uppercase tracking-wide text-[#AFA397]">
                      <th className="py-2 pr-4 font-medium">Product</th>
                      <th className="py-2 pr-4 font-medium">Price</th>
                      <th className="py-2 pr-4 font-medium">Availability</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pl-4 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts?.map((product) => (
                      <tr key={product.id} className="border-b border-[#E5DED6] last:border-0">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <ProductThumbnail />
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-medium text-[#1D1A18]">
                                <span className="truncate">{product.translation.name}</span>
                                {product.featured ? <FeaturedBadge /> : null}
                              </p>
                              {product.translation.description ? (
                                <p className="truncate text-xs text-[#655D56]">
                                  {product.translation.description}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap text-[#302C29]">
                          {product.basePrice} {currencyCode}
                        </td>
                        <td className="py-3 pr-4">
                          <AvailabilityBadge availability={product.availability} />
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge active={product.status === 'ACTIVE'} />
                        </td>
                        <td className="py-3 pl-4">
                          {canManage ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="secondary"
                                className="px-2 py-1 text-xs"
                                disabled={availabilityPendingId === product.id}
                                onClick={() => void handleToggleAvailability(product)}
                              >
                                {availabilityPendingId === product.id
                                  ? 'Updating…'
                                  : product.availability === 'AVAILABLE'
                                    ? 'Mark Sold Out'
                                    : 'Mark Available'}
                              </Button>
                              <button
                                type="button"
                                onClick={() => startEdit(product)}
                                aria-label={`Edit ${product.translation.name}`}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#AFA397] hover:bg-[#F8F5F1] hover:text-[#7A5138]"
                              >
                                <IconPencil className="h-4 w-4" />
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: stacked cards (Section 17). */}
              <ul className="flex flex-col gap-3 xl:hidden">
                {filteredProducts?.map((product) => (
                  <li key={product.id} className="rounded-md border border-[#E5DED6] bg-white p-3">
                    <div className="flex items-start gap-3">
                      <ProductThumbnail />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-medium text-[#1D1A18]">
                          <span className="truncate">{product.translation.name}</span>
                          {product.featured ? <FeaturedBadge /> : null}
                        </p>
                        <p className="mt-0.5 text-sm text-[#302C29]">
                          {product.basePrice} {currencyCode}
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
                          className="flex-1 px-2 py-1.5 text-xs"
                          disabled={availabilityPendingId === product.id}
                          onClick={() => void handleToggleAvailability(product)}
                        >
                          {availabilityPendingId === product.id
                            ? 'Updating…'
                            : product.availability === 'AVAILABLE'
                              ? 'Mark Sold Out'
                              : 'Mark Available'}
                        </Button>
                        <button
                          type="button"
                          onClick={() => startEdit(product)}
                          aria-label={`Edit ${product.translation.name}`}
                          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-[#E5DED6] text-[#655D56] hover:bg-[#F8F5F1]"
                        >
                          <IconPencil className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}

      {mode !== 'idle' && categoryId ? (
        <ProductForm
          mode={mode}
          form={form}
          setForm={setForm}
          formError={formError}
          isSubmitting={isSubmitting}
          currencyCode={currencyCode}
          onSubmit={handleSubmit}
          onCancel={cancelForm}
        />
      ) : null}
    </Card>
  );
}

/**
 * Temporary Create/Edit Product form (UX-3, Section 16): carried over from
 * the former `ProductsPanel` unchanged in behavior, only repositioned
 * beneath the list instead of a full-width column. A dedicated Product
 * editor page is a later batch, not UX-3.
 */
function ProductForm({
  mode,
  form,
  setForm,
  formError,
  isSubmitting,
  currencyCode,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit';
  form: ProductFormState;
  setForm: Dispatch<SetStateAction<ProductFormState>>;
  formError: string | null;
  isSubmitting: boolean;
  currencyCode: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 border-t border-[#E5DED6] pt-4">
      <p className="text-sm font-medium text-[#302C29]">
        {mode === 'create' ? 'Create Product' : 'Edit Product'}
      </p>
      {formError ? <Alert variant="error">{formError}</Alert> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Name" htmlFor="product-name">
          <Input
            id="product-name"
            required
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label={`Price (${currencyCode})`} htmlFor="product-basePrice">
          <Input
            id="product-basePrice"
            inputMode="decimal"
            required
            value={form.basePrice}
            onChange={(event) => setForm((prev) => ({ ...prev, basePrice: event.target.value }))}
            disabled={isSubmitting}
          />
        </FormField>
      </div>
      <FormField label="Description" htmlFor="product-description">
        <Textarea
          id="product-description"
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          disabled={isSubmitting}
        />
      </FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label="Status" htmlFor="product-status">
          <Select
            id="product-status"
            value={form.status}
            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as ProductStatus }))}
            disabled={isSubmitting}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </Select>
        </FormField>
        {mode === 'create' ? (
          <FormField label="Availability" htmlFor="product-availability">
            <Select
              id="product-availability"
              value={form.availability}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, availability: event.target.value as 'AVAILABLE' | 'SOLD_OUT' }))
              }
              disabled={isSubmitting}
            >
              <option value="AVAILABLE">AVAILABLE</option>
              <option value="SOLD_OUT">SOLD_OUT</option>
            </Select>
          </FormField>
        ) : null}
        <FormField label="Display order" htmlFor="product-displayOrder">
          <Input
            id="product-displayOrder"
            type="number"
            min={0}
            step={1}
            required
            value={form.displayOrder}
            onChange={(event) => setForm((prev) => ({ ...prev, displayOrder: event.target.value }))}
            disabled={isSubmitting}
          />
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm text-[#302C29]">
        <input
          type="checkbox"
          checked={form.allowCustomerNotes}
          onChange={(event) => setForm((prev) => ({ ...prev, allowCustomerNotes: event.target.checked }))}
          disabled={isSubmitting}
        />
        Allow customer notes
      </label>
      <label className="flex items-center gap-2 text-sm text-[#302C29]">
        <input
          type="checkbox"
          checked={form.featured}
          onChange={(event) => setForm((prev) => ({ ...prev, featured: event.target.checked }))}
          disabled={isSubmitting}
        />
        Featured
      </label>
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
