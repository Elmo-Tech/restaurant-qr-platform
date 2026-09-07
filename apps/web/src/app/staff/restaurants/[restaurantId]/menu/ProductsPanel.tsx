'use client';

import { useState, type FormEvent } from 'react';
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

/** Mirrors the Backend's accepted decimal-string shape (money-decimal.ts) -- helpful client validation only, never authoritative. */
const MONEY_DECIMAL_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/;

interface ProductsPanelProps {
  restaurantId: string;
  categoryId: string | null;
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

export function ProductsPanel({
  restaurantId,
  categoryId,
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
}: ProductsPanelProps) {
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availabilityPendingId, setAvailabilityPendingId] = useState<
    string | null
  >(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );

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
      setFormError(
        'Price must be a plain decimal amount with up to 2 decimal places, e.g. 10.50.',
      );
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

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#302C29]">Products</h2>
        {canManage && mode === 'idle' && categoryId ? (
          <Button variant="secondary" onClick={startCreate}>
            Create Product
          </Button>
        ) : null}
      </div>

      {!categoryId ? (
        <p className="text-sm text-[#655D56]">
          Select a Category to see its Products.
        </p>
      ) : (
        <>
          {error ? (
            <Alert variant="error">
              <div className="flex items-center justify-between gap-4">
                <span>{error}</span>
                <Button
                  variant="secondary"
                  className="px-2 py-1 text-xs"
                  onClick={onRetry}
                >
                  Retry
                </Button>
              </div>
            </Alert>
          ) : null}
          {availabilityError ? (
            <Alert variant="error">{availabilityError}</Alert>
          ) : null}

          {products === null && !error ? (
            <LoadingState label="Loading Products…" />
          ) : null}

          {products !== null && products.length === 0 && mode === 'idle' ? (
            <p className="text-sm text-[#655D56]">
              No Products yet.
              {canManage ? ' Create the first one to get started.' : ''}
            </p>
          ) : null}

          {products !== null && products.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {products.map((product) => (
                <li key={product.id}>
                  <div className="rounded-md border border-[#E5DED6] bg-white px-3 py-2">
                    <p className="text-sm font-medium text-[#1D1A18]">
                      {product.translation.name}
                      {product.featured ? (
                        <span className="ml-2 rounded-full bg-[#C89B6D]/20 px-2 py-0.5 text-xs font-medium text-[#7A5138]">
                          Featured
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-[#655D56]">
                      {product.basePrice} {currencyCode} · {product.status} ·{' '}
                      {product.availability} · order {product.displayOrder}
                    </p>
                    <div className="mt-2 flex gap-2">
                      {canManage ? (
                        <>
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
                          <Button
                            variant="secondary"
                            className="px-2 py-1 text-xs"
                            onClick={() => startEdit(product)}
                          >
                            Edit
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      {mode !== 'idle' && categoryId ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-[#E5DED6] pt-3">
          <p className="text-sm font-medium text-[#302C29]">
            {mode === 'create' ? 'Create Product' : 'Edit Product'}
          </p>
          {formError ? <Alert variant="error">{formError}</Alert> : null}
          <FormField label="Name" htmlFor="product-name">
            <Input
              id="product-name"
              required
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label="Description" htmlFor="product-description">
            <Textarea
              id="product-description"
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label="Status" htmlFor="product-status">
            <Select
              id="product-status"
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  status: event.target.value as ProductStatus,
                }))
              }
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
                  setForm((prev) => ({
                    ...prev,
                    availability: event.target.value as 'AVAILABLE' | 'SOLD_OUT',
                  }))
                }
                disabled={isSubmitting}
              >
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="SOLD_OUT">SOLD_OUT</option>
              </Select>
            </FormField>
          ) : null}
          <FormField
            label={`Price (${currencyCode})`}
            htmlFor="product-basePrice"
          >
            <Input
              id="product-basePrice"
              inputMode="decimal"
              required
              value={form.basePrice}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, basePrice: event.target.value }))
              }
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label="Display order" htmlFor="product-displayOrder">
            <Input
              id="product-displayOrder"
              type="number"
              min={0}
              step={1}
              required
              value={form.displayOrder}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, displayOrder: event.target.value }))
              }
              disabled={isSubmitting}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-[#302C29]">
            <input
              type="checkbox"
              checked={form.allowCustomerNotes}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  allowCustomerNotes: event.target.checked,
                }))
              }
              disabled={isSubmitting}
            />
            Allow customer notes
          </label>
          <label className="flex items-center gap-2 text-sm text-[#302C29]">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, featured: event.target.checked }))
              }
              disabled={isSubmitting}
            />
            Featured
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={cancelForm}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
