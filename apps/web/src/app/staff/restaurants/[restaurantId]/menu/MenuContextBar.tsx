'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import * as menuApi from '../../../../../lib/menu/api';
import type { Menu, MenuStatus } from '../../../../../lib/menu/types';
import type { RestaurantLocalesResponse } from '../../../../../lib/settings/types';
import { localeDirection, localeLabel } from '../../../../../lib/settings/locale-labels';
import { useTranslationsEditor } from '../../../../../lib/menu/use-translations-editor';
import { ApiError } from '../../../../../lib/api/errors';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { Card } from '../../../../../components/ui/Card';
import { EmptyState } from '../../../../../components/ui/EmptyState';
import { Dialog } from '../../../../../components/ui/Dialog';
import { FormField } from '../../../../../components/ui/FormField';
import { FormSection } from '../../../../../components/ui/FormSection';
import { Input } from '../../../../../components/ui/Input';
import { Select } from '../../../../../components/ui/Select';
import { Textarea } from '../../../../../components/ui/Textarea';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { IconPlus } from '../../../../../components/staff/icons';
import { LanguageTabs, type LanguageTabOption } from '../../../../../components/menu/LanguageTabs';
import { TranslationFields } from '../../../../../components/menu/TranslationFields';
import { PrimaryBadge, StatusBadge } from './StatusBadges';

interface MenuContextBarProps {
  menus: Menu[] | null;
  error: string | null;
  selectedMenuId: string | null;
  onSelectMenu: (menuId: string) => void;
  onRetry: () => void;
  canManage: boolean;
  restaurantId: string;
  /** Restaurant Languages (FT-1, Section 4) -- sole authority for which secondary-locale tabs render; `null` while loading/unavailable shows default-locale fields only. */
  locales: RestaurantLocalesResponse | null;
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

/** One in-progress, not-yet-saved secondary-locale translation typed while creating (FT-1 correction 2, Section 2). */
interface SecondaryDraft {
  name: string;
  description: string;
}
type SecondaryDrafts = Record<string, SecondaryDraft>;

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
  locales,
  onCreated,
  onUpdated,
  onPrimaryChanged,
  onMenuNotFound,
}: MenuContextBarProps) {
  const { t } = useStaffI18n();
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MenuFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [primaryPending, setPrimaryPending] = useState(false);
  const [primaryError, setPrimaryError] = useState<string | null>(null);
  const [secondaryDrafts, setSecondaryDrafts] = useState<SecondaryDrafts>({});
  const nameInternalRef = useRef<HTMLInputElement>(null);

  const selectedMenu = menus?.find((menu) => menu.id === selectedMenuId) ?? null;

  function startCreate() {
    setMode('create');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setSecondaryDrafts({});
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
      setFormError(t('menu.form.displayOrderInvalid'));
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

        // Secondary-locale translations are only created once the Menu
        // itself exists (FT-1 correction 2, Section 2): PUT each entered
        // draft now, using the Menu id the create call just returned.
        // A blank draft is skipped entirely -- never PUT an empty
        // translation (Section 5).
        const translationFailures: string[] = [];
        for (const [locale, draft] of Object.entries(secondaryDrafts)) {
          if (draft.name.trim() === '') continue;
          try {
            await menuApi.putMenuTranslation(restaurantId, created.id, locale, {
              name: draft.name.trim(),
              description: draft.description.trim() === '' ? null : draft.description.trim(),
            });
          } catch (translationError) {
            if (isUnauthenticatedError(translationError)) {
              redirectToLogin();
              return;
            }
            translationFailures.push(localeLabel(locale));
          }
        }

        onCreated(created);

        if (translationFailures.length > 0) {
          // The Menu itself was created successfully -- never duplicate-
          // create it on retry (Section 5). Drop into Edit mode for the
          // Menu that now exists so the User can retry the failed
          // translation(s) through the normal per-locale Save flow.
          setMode('edit');
          setEditingId(created.id);
          setForm(toFormState(created));
          setFormError(t('menu.menus.createdPartial', { languages: translationFailures.join(', ') }));
          return;
        }
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
      title={mode === 'create' ? t('menu.menus.create') : t('menu.menus.edit')}
      isSubmitting={isSubmitting}
      submitLabel={
        isSubmitting
          ? t('common.saving')
          : mode === 'create'
            ? t('menu.menus.create')
            : t('menu.form.saveChanges')
      }
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
        restaurantId={restaurantId}
        entityId={mode === 'edit' ? editingId : null}
        locales={locales}
        secondaryDrafts={secondaryDrafts}
        setSecondaryDrafts={setSecondaryDrafts}
      />
    </Dialog>
  );

  if (error) {
    return (
      <>
        <Alert variant="error">
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t('common.retry')}
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
          <LoadingState label={t('menu.menus.loading')} />
        </Card>
        {dialog}
      </>
    );
  }

  if (menus.length === 0) {
    return (
      <>
        <EmptyState
          title={t('menu.menus.emptyTitle')}
          description={t('menu.menus.emptyHint')}
          action={
            canManage ? (
              <Button onClick={startCreate}>
                <IconPlus className="h-4 w-4" /> {t('menu.menus.new')}
              </Button>
            ) : undefined
          }
        />
        {dialog}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 basis-48 items-center gap-3 sm:max-w-sm">
            <label htmlFor="menu-context-select" className="flex-shrink-0 text-xs font-semibold text-muted-foreground">
              {t('menu.menus.label')}
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
            <div className="ms-auto flex flex-wrap items-center gap-2">
              {!selectedMenu.isPrimary ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={primaryPending}
                  onClick={() => void handleSetPrimary(selectedMenu)}
                >
                  {primaryPending ? t('menu.menus.settingPrimary') : t('menu.menus.setPrimary')}
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" onClick={() => startEdit(selectedMenu)}>
                {t('menu.menus.edit')}
              </Button>
              <Button variant="secondary" size="sm" onClick={startCreate}>
                <IconPlus className="h-3.5 w-3.5" /> {t('menu.menus.new')}
              </Button>
            </div>
          ) : null}
        </div>

        {primaryError ? <Alert variant="error">{primaryError}</Alert> : null}
      </div>
      {dialog}
    </>
  );
}

/**
 * Menu Dialog form fields (UX-4, Section 5/6/14/15/16/17; FT-1, Section 7;
 * FT-1 correction, Section 3). Structural fields (`nameInternal`, `status`,
 * `displayOrder`) are always editable here exactly as before. `name`/
 * `description` are the Restaurant's DEFAULT-locale content, saved through
 * the same `createMenu`/`updateMenu` call as before -- Language tabs only
 * control which locale's content is being viewed/edited, they never change
 * how the surrounding structural form submits. `Primary` is never editable
 * here (Section 5/7) -- it stays the dedicated `Set as primary` action
 * above.
 *
 * Create and Edit both show the same `[ English ] [ العربية ]` Languages
 * section for every ACTIVE Restaurant content language (FT-1 correction 2,
 * Section 1/2) -- Create just cannot save a secondary-locale translation to
 * the Backend yet (there is no Menu row to attach it to), so it collects
 * drafts locally in `secondaryDrafts` instead of calling the translation
 * hook, and the parent's `handleSubmit` PUTs each non-empty draft only
 * after the Menu itself has been created. Switching tabs while creating
 * never calls the Backend at all.
 */
function MenuFormFields({
  form,
  setForm,
  formError,
  isSubmitting,
  nameInternalRef,
  restaurantId,
  entityId,
  locales,
  secondaryDrafts,
  setSecondaryDrafts,
}: {
  form: MenuFormState;
  setForm: Dispatch<SetStateAction<MenuFormState>>;
  formError: string | null;
  isSubmitting: boolean;
  nameInternalRef: RefObject<HTMLInputElement | null>;
  restaurantId: string;
  entityId: string | null;
  locales: RestaurantLocalesResponse | null;
  secondaryDrafts: SecondaryDrafts;
  setSecondaryDrafts: Dispatch<SetStateAction<SecondaryDrafts>>;
}) {
  const { t } = useStaffI18n();
  return (
    <div className="flex flex-col gap-6">
      {formError ? <Alert variant="error">{formError}</Alert> : null}

      <FormSection title={t('menu.form.general')}>
        <FormField label={t('menu.form.internalName')} htmlFor="menu-nameInternal">
          <Input
            id="menu-nameInternal"
            ref={nameInternalRef}
            required
            value={form.nameInternal}
            onChange={(event) => setForm((prev) => ({ ...prev, nameInternal: event.target.value }))}
            disabled={isSubmitting}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('menu.form.internalNameHint')}</p>
        </FormField>
        <FormField label={t('menu.form.status')} htmlFor="menu-status">
          <Select
            id="menu-status"
            value={form.status}
            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as MenuStatus }))}
            disabled={isSubmitting}
          >
            <option value="ACTIVE">{t('common.active')}</option>
            <option value="INACTIVE">{t('common.inactive')}</option>
          </Select>
          {form.status === 'INACTIVE' ? (
            <p className="mt-1 text-xs text-muted-foreground">{t('menu.form.inactiveHint')}</p>
          ) : null}
        </FormField>
      </FormSection>

      {entityId === null ? (
        <MenuCreateLanguages
          form={form}
          setForm={setForm}
          isSubmitting={isSubmitting}
          locales={locales}
          secondaryDrafts={secondaryDrafts}
          setSecondaryDrafts={setSecondaryDrafts}
        />
      ) : (
        <MenuTranslationSection
          restaurantId={restaurantId}
          entityId={entityId}
          locales={locales}
          form={form}
          setForm={setForm}
          isSubmitting={isSubmitting}
        />
      )}

      <FormSection title={t('menu.form.advanced')}>
        <FormField label={t('menu.form.displayOrder')} htmlFor="menu-displayOrder">
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

/**
 * Create-mode Languages section (FT-1 correction 2, Section 1/2): shows the
 * same `[ English ] [ العربية ]` tabs as Edit, for every ACTIVE Restaurant
 * locale -- but since there is no Menu row yet, secondary-locale content is
 * only ever kept in local `secondaryDrafts` state, never sent to the
 * Backend here. No GET, no PUT, no DELETE happens while switching tabs or
 * typing; the parent's `handleSubmit` is the only place a secondary draft
 * is ever PUT, and only after the Menu itself has been created.
 */
function MenuCreateLanguages({
  form,
  setForm,
  isSubmitting,
  locales,
  secondaryDrafts,
  setSecondaryDrafts,
}: {
  form: MenuFormState;
  setForm: Dispatch<SetStateAction<MenuFormState>>;
  isSubmitting: boolean;
  locales: RestaurantLocalesResponse | null;
  secondaryDrafts: SecondaryDrafts;
  setSecondaryDrafts: Dispatch<SetStateAction<SecondaryDrafts>>;
}) {
  const { t } = useStaffI18n();
  const defaultLocale = locales?.defaultLocale ?? null;
  const secondaryLocales = useMemo(
    () =>
      locales?.locales.filter((row) => !row.isDefault && row.isActive).map((row) => row.locale) ?? [],
    [locales],
  );

  const [activeLocale, setActiveLocale] = useState<string>('__default__');
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
      <LanguageTabs options={tabOptions} activeLocale={activeLocale} onSelect={setActiveLocale} />

      {isDefaultTab ? (
        <>
          <FormField label={t('menu.tr.name')} htmlFor="menu-name">
            <Input
              id="menu-name"
              dir={dir}
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label={t('menu.tr.description')} htmlFor="menu-description">
            <Textarea
              id="menu-description"
              dir={dir}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              disabled={isSubmitting}
            />
          </FormField>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t('menu.form.optionalLanguage')}</p>
          <FormField label={t('menu.tr.name')} htmlFor={`menu-create-name-${activeLocale}`}>
            <Input
              id={`menu-create-name-${activeLocale}`}
              dir={dir}
              value={secondaryDrafts[activeLocale]?.name ?? ''}
              onChange={(event) => updateDraft(activeLocale, { name: event.target.value })}
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label={t('menu.tr.description')} htmlFor={`menu-create-description-${activeLocale}`}>
            <Textarea
              id={`menu-create-description-${activeLocale}`}
              dir={dir}
              value={secondaryDrafts[activeLocale]?.description ?? ''}
              onChange={(event) => updateDraft(activeLocale, { description: event.target.value })}
              disabled={isSubmitting}
            />
          </FormField>
        </>
      )}
    </FormSection>
  );
}

/**
 * Edit-only Languages section (FT-1 correction, Section 3): only ever
 * rendered once `entityId` is non-null, so the translation hook always has
 * a real Menu to load/save against.
 */
function MenuTranslationSection({
  restaurantId,
  entityId,
  locales,
  form,
  setForm,
  isSubmitting,
}: {
  restaurantId: string;
  entityId: string;
  locales: RestaurantLocalesResponse | null;
  form: MenuFormState;
  setForm: Dispatch<SetStateAction<MenuFormState>>;
  isSubmitting: boolean;
}) {
  const { t } = useStaffI18n();
  const defaultLocale = locales?.defaultLocale ?? null;
  // Memoized: a fresh array identity on every render (e.g. from typing in a
  // translation field, which re-renders this component via `translations`'
  // own state) would otherwise make `useTranslationsEditor` see a "new"
  // `locales` value on every keystroke and re-fetch, wiping out whatever was
  // just typed before it could be saved.
  const secondaryLocales = useMemo(
    () =>
      locales?.locales.filter((row) => !row.isDefault && row.isActive).map((row) => row.locale) ?? [],
    [locales],
  );

  const [activeLocale, setActiveLocale] = useState<string>('__default__');

  const translations = useTranslationsEditor({
    restaurantId,
    entityId,
    locales: secondaryLocales,
    list: menuApi.getMenuTranslations,
    put: menuApi.putMenuTranslation,
    remove: menuApi.deleteMenuTranslation,
  });

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
      <LanguageTabs options={tabOptions} activeLocale={activeLocale} onSelect={setActiveLocale} />

      {isDefaultTab ? (
        <>
          <FormField label={t('menu.tr.name')} htmlFor="menu-name">
            <Input
              id="menu-name"
              dir={dir}
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label={t('menu.tr.description')} htmlFor="menu-description">
            <Textarea
              id="menu-description"
              dir={dir}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              disabled={isSubmitting}
            />
          </FormField>
        </>
      ) : (
        <TranslationFields
          idPrefix="menu-translation"
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
