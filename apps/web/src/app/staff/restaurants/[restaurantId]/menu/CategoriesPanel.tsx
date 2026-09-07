'use client';

import { useState, type FormEvent } from 'react';
import * as menuApi from '../../../../../lib/menu/api';
import type {
  Category,
  CategoryStatus,
  Menu,
} from '../../../../../lib/menu/types';
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

const KEEP_CURRENT_MENU = '__keep_current_menu__';

interface CategoriesPanelProps {
  restaurantId: string;
  menuId: string | null;
  menus: Menu[];
  categories: Category[] | null;
  error: string | null;
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
  onRetry: () => void;
  canManage: boolean;
  onCreated: (category: Category) => void;
  onUpdated: (category: Category) => void;
  onMoved: (category: Category) => void;
  onCategoryNotFound: () => void;
  onMenuNotFound: () => void;
}

interface CategoryFormState {
  name: string;
  description: string;
  status: CategoryStatus;
  displayOrder: string;
  targetMenuId: string;
}

const EMPTY_FORM: CategoryFormState = {
  name: '',
  description: '',
  status: 'ACTIVE',
  displayOrder: '0',
  targetMenuId: KEEP_CURRENT_MENU,
};

function toFormState(category: Category): CategoryFormState {
  return {
    name: category.translation.name,
    description: category.translation.description ?? '',
    status: category.status,
    displayOrder: String(category.displayOrder),
    targetMenuId: KEEP_CURRENT_MENU,
  };
}

export function CategoriesPanel({
  restaurantId,
  menuId,
  menus,
  categories,
  error,
  selectedCategoryId,
  onSelectCategory,
  onRetry,
  canManage,
  onCreated,
  onUpdated,
  onMoved,
  onCategoryNotFound,
  onMenuNotFound,
}: CategoriesPanelProps) {
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function startCreate() {
    setMode('create');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(category: Category) {
    setMode('edit');
    setEditingId(category.id);
    setForm(toFormState(category));
    setFormError(null);
  }

  function cancelForm() {
    setMode('idle');
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || !menuId) return;

    const displayOrder = Number(form.displayOrder);
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      setFormError('Display order must be a whole number of 0 or more.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      if (mode === 'create') {
        const created = await menuApi.createCategory(restaurantId, {
          menuId,
          name: form.name,
          description: form.description.trim() === '' ? null : form.description,
          status: form.status,
          displayOrder,
        });
        onCreated(created);
        setMode('idle');
        setEditingId(null);
      } else if (mode === 'edit' && editingId) {
        const isMoving = form.targetMenuId !== KEEP_CURRENT_MENU;
        const updated = await menuApi.updateCategory(restaurantId, editingId, {
          ...(isMoving ? { menuId: form.targetMenuId } : {}),
          name: form.name,
          description: form.description.trim() === '' ? null : form.description,
          status: form.status,
          displayOrder,
        });
        setMode('idle');
        setEditingId(null);
        if (isMoving) {
          onMoved(updated);
        } else {
          onUpdated(updated);
        }
      }
    } catch (submitError) {
      if (isUnauthenticatedError(submitError)) {
        redirectToLogin();
        return;
      }
      if (submitError instanceof ApiError) {
        if (submitError.code === 'CATEGORY_NOT_FOUND') {
          onCategoryNotFound();
          setMode('idle');
          setEditingId(null);
          return;
        }
        if (submitError.code === 'MENU_NOT_FOUND') {
          onMenuNotFound();
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

  const moveTargets = menus.filter((menu) => menu.id !== menuId);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#302C29]">Categories</h2>
        {canManage && mode === 'idle' && menuId ? (
          <Button variant="secondary" onClick={startCreate}>
            Create Category
          </Button>
        ) : null}
      </div>

      {!menuId ? (
        <p className="text-sm text-[#655D56]">Select a Menu to see its Categories.</p>
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

          {categories === null && !error ? (
            <LoadingState label="Loading Categories…" />
          ) : null}

          {categories !== null && categories.length === 0 && mode === 'idle' ? (
            <p className="text-sm text-[#655D56]">
              No Categories yet.
              {canManage ? ' Create the first one to get started.' : ''}
            </p>
          ) : null}

          {categories !== null && categories.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {categories.map((category) => (
                <li key={category.id}>
                  <div
                    className={`rounded-md border px-3 py-2 ${
                      category.id === selectedCategoryId
                        ? 'border-[#7A5138] bg-[#F8F5F1]'
                        : 'border-[#E5DED6] bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectCategory(category.id)}
                      className="w-full text-left"
                    >
                      <p className="text-sm font-medium text-[#1D1A18]">
                        {category.translation.name}
                      </p>
                      <p className="text-xs text-[#655D56]">
                        {category.status} · order {category.displayOrder}
                      </p>
                    </button>
                    {canManage ? (
                      <div className="mt-2">
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => startEdit(category)}
                        >
                          Edit
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      {mode !== 'idle' && menuId ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-[#E5DED6] pt-3">
          <p className="text-sm font-medium text-[#302C29]">
            {mode === 'create' ? 'Create Category' : 'Edit Category'}
          </p>
          {formError ? <Alert variant="error">{formError}</Alert> : null}
          <FormField label="Name" htmlFor="category-name">
            <Input
              id="category-name"
              required
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label="Description" htmlFor="category-description">
            <Textarea
              id="category-description"
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label="Status" htmlFor="category-status">
            <Select
              id="category-status"
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  status: event.target.value as CategoryStatus,
                }))
              }
              disabled={isSubmitting}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </Select>
          </FormField>
          <FormField label="Display order" htmlFor="category-displayOrder">
            <Input
              id="category-displayOrder"
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
          {mode === 'edit' && moveTargets.length > 0 ? (
            <FormField label="Move to Menu" htmlFor="category-move">
              <Select
                id="category-move"
                value={form.targetMenuId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, targetMenuId: event.target.value }))
                }
                disabled={isSubmitting}
              >
                <option value={KEEP_CURRENT_MENU}>Keep in current Menu</option>
                {moveTargets.map((menu) => (
                  <option key={menu.id} value={menu.id}>
                    {menu.translation.name}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
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
