'use client';

import { useState, type FormEvent } from 'react';
import * as menuApi from '../../../../../lib/menu/api';
import type { Menu, MenuStatus } from '../../../../../lib/menu/types';
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

interface MenusPanelProps {
  menus: Menu[] | null;
  error: string | null;
  selectedMenuId: string | null;
  onSelectMenu: (menuId: string) => void;
  onRetry: () => void;
  canManage: boolean;
  restaurantId: string;
  onCreated: (menu: Menu) => void;
  onUpdated: () => void;
  onPrimaryChanged: () => void;
  onMenuNotFound: () => void;
}

interface MenuFormState {
  nameInternal: string;
  name: string;
  description: string;
  status: MenuStatus;
  displayOrder: string;
}

const EMPTY_FORM: MenuFormState = {
  nameInternal: '',
  name: '',
  description: '',
  status: 'ACTIVE',
  displayOrder: '0',
};

function toFormState(menu: Menu): MenuFormState {
  return {
    nameInternal: menu.nameInternal,
    name: menu.translation.name,
    description: menu.translation.description ?? '',
    status: menu.status,
    displayOrder: String(menu.displayOrder),
  };
}

export function MenusPanel({
  menus,
  error,
  selectedMenuId,
  onSelectMenu,
  onRetry,
  canManage,
  restaurantId,
  onCreated,
  onUpdated,
  onPrimaryChanged,
  onMenuNotFound,
}: MenusPanelProps) {
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MenuFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [primaryPendingId, setPrimaryPendingId] = useState<string | null>(
    null,
  );
  /**
   * Fix, Section 1: Set-Primary runs while `mode === 'idle'` (no Create/Edit
   * form open), but `formError` only renders inside that form -- reusing it
   * for Set-Primary would make a real 403/network failure completely
   * invisible whenever the form isn't open (the common case). Kept entirely
   * separate from `formError`: Create/Edit's own error behavior is
   * unchanged.
   */
  const [primaryError, setPrimaryError] = useState<string | null>(null);

  function startCreate() {
    setMode('create');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(menu: Menu) {
    setMode('edit');
    setEditingId(menu.id);
    setForm(toFormState(menu));
    setFormError(null);
  }

  function cancelForm() {
    setMode('idle');
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const displayOrder = Number(form.displayOrder);
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      setFormError('Display order must be a whole number of 0 or more.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      if (mode === 'create') {
        const created = await menuApi.createMenu(restaurantId, {
          nameInternal: form.nameInternal,
          name: form.name,
          description: form.description.trim() === '' ? null : form.description,
          status: form.status,
          displayOrder,
        });
        onCreated(created);
      } else if (mode === 'edit' && editingId) {
        await menuApi.updateMenu(restaurantId, editingId, {
          nameInternal: form.nameInternal,
          name: form.name,
          // Section 11: a blank field the User intentionally saved clears
          // description (null); omission is never sent from this form since
          // the field is always included once editing.
          description: form.description.trim() === '' ? null : form.description,
          status: form.status,
          displayOrder,
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
      if (submitError instanceof ApiError && submitError.code === 'MENU_NOT_FOUND') {
        onMenuNotFound();
        setMode('idle');
        setEditingId(null);
        return;
      }
      setFormError(describeError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetPrimary(menu: Menu) {
    if (primaryPendingId) return;
    setPrimaryPendingId(menu.id);
    setPrimaryError(null);
    try {
      await menuApi.setPrimaryMenu(restaurantId, menu.id);
      onPrimaryChanged();
    } catch (submitError) {
      if (isUnauthenticatedError(submitError)) {
        redirectToLogin();
        return;
      }
      if (submitError instanceof ApiError && submitError.code === 'MENU_NOT_FOUND') {
        onMenuNotFound();
        return;
      }
      setPrimaryError(describeError(submitError));
    } finally {
      setPrimaryPendingId(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#302C29]">Menus</h2>
        {canManage && mode === 'idle' ? (
          <Button variant="secondary" onClick={startCreate}>
            Create Menu
          </Button>
        ) : null}
      </div>

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

      {primaryError ? <Alert variant="error">{primaryError}</Alert> : null}

      {menus === null && !error ? <LoadingState label="Loading Menus…" /> : null}

      {menus !== null && menus.length === 0 && mode === 'idle' ? (
        <p className="text-sm text-[#655D56]">
          No Menus yet.
          {canManage ? ' Create the first one to get started.' : ''}
        </p>
      ) : null}

      {menus !== null && menus.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {menus.map((menu) => (
            <li key={menu.id}>
              <div
                className={`rounded-md border px-3 py-2 ${
                  menu.id === selectedMenuId
                    ? 'border-[#7A5138] bg-[#F8F5F1]'
                    : 'border-[#E5DED6] bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectMenu(menu.id)}
                  className="w-full text-left"
                >
                  <p className="text-sm font-medium text-[#1D1A18]">
                    {menu.translation.name}
                  </p>
                  <p className="text-xs text-[#655D56]">
                    {menu.nameInternal} · {menu.status} · order {menu.displayOrder}
                  </p>
                </button>
                <div className="mt-2 flex items-center gap-2">
                  {menu.isPrimary ? (
                    <span className="rounded-full bg-[#7A5138]/10 px-2 py-0.5 text-xs font-medium text-[#7A5138]">
                      Primary
                    </span>
                  ) : canManage ? (
                    <Button
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      disabled={primaryPendingId === menu.id}
                      onClick={() => void handleSetPrimary(menu)}
                    >
                      {primaryPendingId === menu.id
                        ? 'Setting…'
                        : 'Set as primary'}
                    </Button>
                  ) : null}
                  {canManage ? (
                    <Button
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      onClick={() => startEdit(menu)}
                    >
                      Edit
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {mode !== 'idle' ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-[#E5DED6] pt-3">
          <p className="text-sm font-medium text-[#302C29]">
            {mode === 'create' ? 'Create Menu' : 'Edit Menu'}
          </p>
          {formError ? <Alert variant="error">{formError}</Alert> : null}
          <FormField label="Internal name" htmlFor="menu-nameInternal">
            <Input
              id="menu-nameInternal"
              required
              value={form.nameInternal}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, nameInternal: event.target.value }))
              }
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label="Display name" htmlFor="menu-name">
            <Input
              id="menu-name"
              required
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label="Description" htmlFor="menu-description">
            <Textarea
              id="menu-description"
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label="Status" htmlFor="menu-status">
            <Select
              id="menu-status"
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  status: event.target.value as MenuStatus,
                }))
              }
              disabled={isSubmitting}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </Select>
          </FormField>
          <FormField label="Display order" htmlFor="menu-displayOrder">
            <Input
              id="menu-displayOrder"
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
