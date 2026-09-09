'use client';

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
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
import { Dialog } from '../../../../../components/ui/Dialog';
import { FormField } from '../../../../../components/ui/FormField';
import { FormSection } from '../../../../../components/ui/FormSection';
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
 * Menu is currently selected. Menu switching still goes exclusively
 * through the caller-supplied `onSelectMenu` (`MenuWorkspace`'s race-safe
 * `selectMenu`), never a new selection path.
 *
 * UX-4: Create/Edit Menu moved from an inline form beneath this bar into
 * the shared `Dialog` (originally a right-side Drawer; replaced with a
 * centered Dialog per the Product Owner's presentation correction -- the
 * Menu/Category forms are short enough that a full-height side panel left
 * excessive empty space). All mutation logic (Create/Edit submit,
 * Set-Primary) is unchanged from UX-3 -- only the surrounding
 * presentation and identity-safety around the editor changed.
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
  const nameInternalRef = useRef<HTMLInputElement>(null);

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

  /**
   * UX-4, Section 6/22: the Menu being edited is pinned to `editingId` when
   * the Dialog opens (`startEdit`) and never re-derived from
   * `selectedMenuId`. The backdrop already blocks the User from changing
   * Menu selection while the Dialog is open, but if the edited Menu's
   * identity is ever invalidated from outside (e.g. it disappears from a
   * refreshed `menus` list), the Dialog closes/resets rather than risking
   * a submit against a stale target. This never changes
   * `selectMenu`/`selectCategory` or any request-generation guard in
   * `MenuWorkspace` -- purely a local safety check on this Dialog's own
   * `editingId`.
   */
  useEffect(() => {
    // `queueMicrotask` here is purely to satisfy eslint-plugin-react-hooks'
    // `set-state-in-effect` rule (same established pattern as
    // MenuWorkspace's own mount effect) -- it has nothing to do with the
    // safety guarantee itself, which is simply "close the Dialog once the
    // Menu it is editing is no longer in the loaded list."
    if (mode === 'edit' && editingId && menus && !menus.some((menu) => menu.id === editingId)) {
      queueMicrotask(() => {
        cancelForm();
      });
    }
  }, [menus, mode, editingId]);

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

  const dialog = (
    <Dialog
      open={mode !== 'idle'}
      title={mode === 'create' ? 'Create Menu' : 'Edit Menu'}
      isSubmitting={isSubmitting}
      submitLabel={isSubmitting ? 'Saving…' : mode === 'create' ? 'Create Menu' : 'Save changes'}
      onSubmit={handleSubmit}
      onClose={cancelForm}
      initialFocusRef={nameInternalRef}
    >
      <MenuFormFields
        form={form}
        setForm={setForm}
        formError={formError}
        isSubmitting={isSubmitting}
        nameInternalRef={nameInternalRef}
      />
    </Dialog>
  );

  if (error) {
    return (
      <>
        <Alert variant="error">
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onRetry}>
              Retry
            </Button>
          </div>
        </Alert>
        {dialog}
      </>
    );
  }

  if (menus === null) {
    return (
      <>
        <Card>
          <LoadingState label="Loading Menus…" />
        </Card>
        {dialog}
      </>
    );
  }

  if (menus.length === 0) {
    return (
      <>
        <Card className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium text-[#302C29]">No menus yet</p>
            <p className="mt-1 text-sm text-[#655D56]">
              Create your first menu to start adding categories and products.
            </p>
          </div>
          {canManage ? (
            <Button className="self-start" onClick={startCreate}>
              <IconPlus className="mr-1.5 h-4 w-4" /> New Menu
            </Button>
          ) : null}
        </Card>
        {dialog}
      </>
    );
  }

  return (
    <>
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

          {canManage && selectedMenu ? (
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
      </Card>
      {dialog}
    </>
  );
}

/**
 * Menu Dialog form fields (UX-4, Section 5/6/14/15/16/17): the exact same
 * Backend contract as before (`nameInternal`, `name`, `description`,
 * `status`, `displayOrder`) presented with clear sections instead of one
 * flat block. `Primary` is never editable here (Section 5/7) -- it stays
 * the dedicated `Set as primary` action above.
 */
function MenuFormFields({
  form,
  setForm,
  formError,
  isSubmitting,
  nameInternalRef,
}: {
  form: MenuFormState;
  setForm: Dispatch<SetStateAction<MenuFormState>>;
  formError: string | null;
  isSubmitting: boolean;
  nameInternalRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex flex-col gap-6">
      {formError ? <Alert variant="error">{formError}</Alert> : null}

      <FormSection title="General">
        <FormField label="Internal name" htmlFor="menu-nameInternal">
          <Input
            id="menu-nameInternal"
            ref={nameInternalRef}
            required
            value={form.nameInternal}
            onChange={(event) => setForm((prev) => ({ ...prev, nameInternal: event.target.value }))}
            disabled={isSubmitting}
          />
          <p className="mt-1 text-xs text-[#655D56]">
            Used internally by Staff and not shown to Guests.
          </p>
        </FormField>
        <FormField label="Name" htmlFor="menu-name">
          <Input
            id="menu-name"
            required
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label="Description" htmlFor="menu-description">
          <Textarea
            id="menu-description"
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label="Status" htmlFor="menu-status">
          <Select
            id="menu-status"
            value={form.status}
            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as MenuStatus }))}
            disabled={isSubmitting}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
          {form.status === 'INACTIVE' ? (
            <p className="mt-1 text-xs text-[#655D56]">Inactive items are hidden from Guest Menu.</p>
          ) : null}
        </FormField>
      </FormSection>

      <FormSection title="Advanced">
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
      </FormSection>
    </div>
  );
}
