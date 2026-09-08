'use client';

import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
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
import { IconPlus } from '../../../../../components/staff/icons';
import { PrimaryBadge, StatusBadge } from './StatusBadges';

interface MenuContextBarProps {
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

/**
 * UX-3 responsive-fix, Section 6: a plain native `<select>` always shows
 * whichever `<option>`'s own text is selected as its collapsed display --
 * there is no way to show a richer collapsed label than the option list
 * itself without either a custom combobox (explicitly out of scope here)
 * or a decorative overlay that risks a mismatch between what is displayed
 * and what is actually selected/announced. The Primary/Active badges
 * rendered next to this Select already carry that status for whichever
 * Menu is currently selected, so the option text stays the plain Menu
 * name only, for every option -- this removes the duplication the
 * Product Owner flagged without inventing new UI.
 */
function menuOptionLabel(menu: Menu): string {
  return menu.translation.name;
}

/**
 * UX-3, Section 5/6: replaces the previous permanent "Menus" column with a
 * compact context bar -- a Menu selector plus badges/actions for whichever
 * Menu is currently selected. All mutation logic below (Create/Edit
 * submit, Set-Primary) is carried over unchanged from the former
 * `MenusPanel` -- only the surrounding presentation changed. Menu
 * switching still goes exclusively through the caller-supplied
 * `onSelectMenu` (`MenuWorkspace`'s race-safe `selectMenu`), never a new
 * selection path.
 */
export function MenuContextBar({
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
}: MenuContextBarProps) {
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MenuFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [primaryPending, setPrimaryPending] = useState(false);
  const [primaryError, setPrimaryError] = useState<string | null>(null);

  const selectedMenu = menus?.find((menu) => menu.id === selectedMenuId) ?? null;

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
    if (primaryPending) return;
    setPrimaryPending(true);
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
      setPrimaryPending(false);
    }
  }

  if (error) {
    return (
      <Alert variant="error">
        <div className="flex items-center justify-between gap-4">
          <span>{error}</span>
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  if (menus === null) {
    return (
      <Card>
        <LoadingState label="Loading Menus…" />
      </Card>
    );
  }

  if (menus.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-[#302C29]">No menus yet</p>
          <p className="mt-1 text-sm text-[#655D56]">
            Create your first menu to start adding categories and products.
          </p>
        </div>
        {canManage ? (
          mode === 'idle' ? (
            <Button className="self-start" onClick={startCreate}>
              <IconPlus className="mr-1.5 h-4 w-4" /> New Menu
            </Button>
          ) : null
        ) : null}
        {mode !== 'idle' ? (
          <MenuForm
            mode={mode}
            form={form}
            setForm={setForm}
            formError={formError}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
            onCancel={cancelForm}
          />
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 flex-col gap-1.5 sm:max-w-sm">
          <label htmlFor="menu-context-select" className="text-xs font-medium uppercase tracking-wide text-[#AFA397]">
            Menu
          </label>
          <Select
            id="menu-context-select"
            value={selectedMenuId ?? ''}
            onChange={(event) => onSelectMenu(event.target.value)}
          >
            {menus.map((menu) => (
              <option key={menu.id} value={menu.id}>
                {menuOptionLabel(menu)}
              </option>
            ))}
          </Select>
        </div>

        {selectedMenu ? (
          <div className="flex items-center gap-2">
            {selectedMenu.isPrimary ? <PrimaryBadge /> : null}
            <StatusBadge active={selectedMenu.status === 'ACTIVE'} />
          </div>
        ) : null}

        {canManage && selectedMenu && mode === 'idle' ? (
          <div className="flex flex-wrap items-center gap-2">
            {!selectedMenu.isPrimary ? (
              <Button
                variant="secondary"
                className="px-3 py-1.5 text-xs"
                disabled={primaryPending}
                onClick={() => void handleSetPrimary(selectedMenu)}
              >
                {primaryPending ? 'Setting…' : 'Set as primary'}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={() => startEdit(selectedMenu)}
            >
              Edit Menu
            </Button>
            <Button className="px-3 py-1.5 text-xs" onClick={startCreate}>
              <IconPlus className="mr-1 h-3.5 w-3.5" /> New Menu
            </Button>
          </div>
        ) : null}
      </div>

      {primaryError ? <Alert variant="error">{primaryError}</Alert> : null}

      {mode !== 'idle' ? (
        <MenuForm
          mode={mode}
          form={form}
          setForm={setForm}
          formError={formError}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onCancel={cancelForm}
        />
      ) : null}
    </Card>
  );
}

/**
 * Temporary Create/Edit Menu form (UX-3, Section 16): carried over from the
 * former `MenusPanel` unchanged in behavior, only repositioned to render as
 * a card beneath the context bar instead of consuming a permanent column.
 * UX-4 replaces this with a proper drawer.
 */
function MenuForm({
  mode,
  form,
  setForm,
  formError,
  isSubmitting,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit';
  form: MenuFormState;
  setForm: Dispatch<SetStateAction<MenuFormState>>;
  formError: string | null;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 border-t border-[#E5DED6] pt-4">
      <p className="text-sm font-medium text-[#302C29]">
        {mode === 'create' ? 'Create Menu' : 'Edit Menu'}
      </p>
      {formError ? <Alert variant="error">{formError}</Alert> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Internal name" htmlFor="menu-nameInternal">
          <Input
            id="menu-nameInternal"
            required
            value={form.nameInternal}
            onChange={(event) => setForm((prev) => ({ ...prev, nameInternal: event.target.value }))}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label="Display name" htmlFor="menu-name">
          <Input
            id="menu-name"
            required
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            disabled={isSubmitting}
          />
        </FormField>
      </div>
      <FormField label="Description" htmlFor="menu-description">
        <Textarea
          id="menu-description"
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          disabled={isSubmitting}
        />
      </FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Status" htmlFor="menu-status">
          <Select
            id="menu-status"
            value={form.status}
            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as MenuStatus }))}
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
            onChange={(event) => setForm((prev) => ({ ...prev, displayOrder: event.target.value }))}
            disabled={isSubmitting}
          />
        </FormField>
      </div>
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
