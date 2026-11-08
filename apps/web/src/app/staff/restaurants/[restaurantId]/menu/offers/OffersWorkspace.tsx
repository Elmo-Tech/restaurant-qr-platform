'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../../lib/i18n/messages';
import * as offersApi from '../../../../../../lib/offers/api';
import type {
  MenuItemChoice,
  Offer,
  OfferBadge,
  OfferInput,
} from '../../../../../../lib/offers/api';
import { resolveAssetUrl } from '../../../../../../lib/media/asset-url';
import { validateImageFile } from '../../../../../../lib/menu/image-validation';
import { formatMoney } from '../../../../../../lib/public-menu/price-format';
import { useActiveLocales } from '../../../../../../lib/settings/use-active-locales';
import { localeDirection, localeLabel } from '../../../../../../lib/settings/locale-labels';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Badge } from '../../../../../../components/ui/Badge';
import { Button } from '../../../../../../components/ui/Button';
import { ConfirmDialog } from '../../../../../../components/ui/ConfirmDialog';
import { FormField } from '../../../../../../components/ui/FormField';
import { ImageField } from '../../../../../../components/menu/ImageField';
import { Input } from '../../../../../../components/ui/Input';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { SectionCard } from '../../../../../../components/ui/SectionCard';
import { Select } from '../../../../../../components/ui/Select';
import { Switch } from '../../../../../../components/ui/Switch';
import { MenuHubBackLink } from '../../../../../../components/staff/MenuHubBackLink';
import { MenuSectionTabs } from '../MenuSectionTabs';
import { OfferPreview } from './OfferPreview';
import type { PublicOffer } from '../../../../../../lib/public-menu/types';

/** The limits the Backend enforces (OFFERS_SPEC.md #1); the editor only mirrors them for instant feedback. */
const MAX_SLOTS = 6;
const MAX_OPTIONS = 20;
const MAX_PICK = 20;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

const STATE_VARIANT: Record<Offer['state'], 'success' | 'info' | 'neutral' | 'warning'> = {
  LIVE: 'success',
  TODAY_OFF: 'warning',
  SCHEDULED: 'info',
  EXPIRED: 'neutral',
  OFF: 'neutral',
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * The editor's model. An offer is NOT given a "type": it is a list of INCLUDED items (what the guest always gets, picked
 * from the menu with a quantity) plus optional CHOICE GROUPS (what the guest must pick). No group = nothing for the guest
 * to choose. On save the included items become one FIXED slot and each group a SINGLE (pick 1) or MULTI (pick N) slot.
 */
interface DraftItem {
  key: string;
  id?: string;
  /** Set = this item IS a menu item (its name follows the menu); null = a typed item with its own names. */
  productId: string | null;
  variantId: string | null;
  names: Record<string, string>;
  /** The menu's current names for a linked item (display only). */
  shownNames: Record<string, string>;
  quantity: number;
  adjustment: string;
  orderable: boolean;
}

interface DraftGroup {
  key: string;
  id?: string;
  /** 1 = the guest picks one; more = picks that many in total. */
  count: number;
  titles: Record<string, string>;
  options: DraftItem[];
}

interface Draft {
  id: string | null;
  names: Record<string, string>;
  descriptions: Record<string, string>;
  price: string;
  badge: OfferBadge;
  days: number[];
  startsOn: string;
  endsOn: string;
  active: boolean;
  imageAssetPath: string | null;
  included: DraftItem[];
  /** Kept so an edit keeps the id (and the title) of the existing included slot. */
  includedSlotId?: string;
  includedTitles: Record<string, string>;
  groups: DraftGroup[];
}

let keyCounter = 0;
const nextKey = (): string => `k${++keyCounter}`;

const typedItem = (): DraftItem => ({
  key: nextKey(),
  productId: null,
  variantId: null,
  names: {},
  shownNames: {},
  quantity: 1,
  adjustment: '0',
  orderable: true,
});

const menuItem = (choice: MenuItemChoice, variantId: string | null): DraftItem => {
  const variant = choice.variants.find((v) => v.id === variantId);
  const shownNames: Record<string, string> = {};
  for (const [code, name] of Object.entries(choice.names)) {
    const size = variant?.names[code];
    shownNames[code] = size ? `${name} (${size})` : name;
  }
  return {
    key: nextKey(),
    productId: choice.id,
    variantId,
    names: {},
    shownNames,
    quantity: 1,
    adjustment: '0',
    orderable: choice.available,
  };
};

const emptyGroup = (): DraftGroup => ({
  key: nextKey(),
  count: 1,
  titles: {},
  // no empty row: choices are added from the menu (or by typing, only when asked)
  options: [],
});

const emptyDraft = (): Draft => ({
  id: null,
  names: {},
  descriptions: {},
  price: '',
  badge: 'OFFER',
  days: [...ALL_DAYS],
  startsOn: '',
  endsOn: '',
  active: true,
  imageAssetPath: null,
  included: [],
  includedTitles: {},
  groups: [],
});

const optionToItem = (option: Offer['slots'][number]['options'][number]): DraftItem => ({
  key: nextKey(),
  id: option.id,
  productId: option.productId,
  variantId: option.variantId,
  names: option.productId ? {} : { ...option.names },
  shownNames: option.productId ? { ...option.names } : {},
  quantity: option.quantity,
  adjustment: option.priceAdjustment,
  orderable: option.orderable,
});

const toDraft = (offer: Offer): Draft => {
  const fixed = offer.slots.filter((slot) => slot.kind === 'FIXED');
  return {
    id: offer.id,
    names: { ...offer.names },
    descriptions: { ...offer.descriptions },
    price: offer.price,
    badge: offer.badge,
    days: offer.daysOfWeek.length === 0 ? [...ALL_DAYS] : [...offer.daysOfWeek],
    startsOn: offer.startsOn ?? '',
    endsOn: offer.endsOn ?? '',
    active: offer.status === 'ACTIVE',
    imageAssetPath: offer.imageAssetPath,
    // every included slot of an older offer is shown as one list
    included: fixed.flatMap((slot) => slot.options.map(optionToItem)),
    includedSlotId: fixed[0]?.id,
    includedTitles: fixed[0] ? { ...fixed[0].titles } : {},
    groups: offer.slots
      .filter((slot) => slot.kind !== 'FIXED')
      .map((slot) => ({
        key: nextKey(),
        id: slot.id,
        count: slot.kind === 'SINGLE' ? 1 : slot.requiredCount,
        titles: { ...slot.titles },
        options: slot.options.map(optionToItem),
      })),
  };
};

/** "١٢٫٥" / "12,5" / " 12.50 " -> "12.5": Western digits, a dot, no spaces. */
function normalizeMoneyInput(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٫,،]/g, '.')
    .replace(/\s+/g, '');
}

/** The default title of the included part when the editor makes one (the guest sees it above the included items). */
const INCLUDED_TITLE: Record<string, string> = { ar: 'مضمّن في العرض', en: 'Included' };

/** Instant, local checks that mirror the Backend (which stays the authority). Returns a sentence or null. */
function validate(
  draft: Draft,
  defaultLocale: string,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string | null {
  const language = localeLabel(defaultLocale);
  if (!draft.names[defaultLocale]?.trim()) return t('offers.error.name', { language });
  if (!MONEY.test(normalizeMoneyInput(draft.price))) return t('offers.error.price');
  if (draft.startsOn && draft.endsOn && draft.endsOn < draft.startsOn) return t('offers.error.dates');
  const slotCount = draft.groups.length + (draft.included.length > 0 ? 1 : 0);
  if (slotCount === 0) return t('offers.error.empty');
  const optionCount = draft.included.length + draft.groups.reduce((sum, group) => sum + group.options.length, 0);
  if (slotCount > MAX_SLOTS || optionCount > MAX_OPTIONS) {
    return t('offers.error.tooMany', { slots: MAX_SLOTS, options: MAX_OPTIONS });
  }
  const itemProblem = (item: DraftItem, priced: boolean): string | null => {
    if (item.productId === null && !item.names[defaultLocale]?.trim()) return t('offers.error.optionName', { language });
    if (priced && !MONEY.test(normalizeMoneyInput(item.adjustment || '0'))) return t('offers.error.adjustment');
    return null;
  };
  for (const item of draft.included) {
    const problem = itemProblem(item, false);
    if (problem) return problem;
  }
  for (const group of draft.groups) {
    if (!group.titles[defaultLocale]?.trim()) return t('offers.error.slotTitle', { language });
    if (group.options.length === 0) return t('offers.error.optionsRequired');
    if (group.count === 1 && group.options.length < 2) return t('offers.error.single');
    if (group.count < 1 || group.count > MAX_PICK) return t('offers.error.count');
    for (const option of group.options) {
      const problem = itemProblem(option, true);
      if (problem) return problem;
    }
  }
  return null;
}

/** The request body for the Backend: every active language is sent (a blank one removes that language). */
function toInput(draft: Draft, locales: string[]): OfferInput {
  const text = (map: Record<string, string>): Record<string, string | null> =>
    Object.fromEntries(locales.map((code) => [code, map[code]?.trim() || null]));
  const item = (option: DraftItem, priced: boolean) => ({
    ...(option.id ? { id: option.id } : {}),
    ...(option.productId
      ? { productId: option.productId, variantId: option.variantId }
      : { names: text(option.names) }),
    ...(priced ? { priceAdjustment: normalizeMoneyInput(option.adjustment || '0') || '0' } : { quantity: option.quantity }),
  });
  const includedTitles: Record<string, string> = {};
  for (const code of locales) includedTitles[code] = draft.includedTitles[code]?.trim() || INCLUDED_TITLE[code] || INCLUDED_TITLE.en;
  return {
    status: draft.active ? 'ACTIVE' : 'INACTIVE',
    badge: draft.badge,
    price: normalizeMoneyInput(draft.price),
    daysOfWeek: draft.days.length === ALL_DAYS.length ? [] : [...draft.days].sort((a, b) => a - b),
    startsOn: draft.startsOn || null,
    endsOn: draft.endsOn || null,
    names: text(draft.names),
    descriptions: text(draft.descriptions),
    slots: [
      ...draft.groups.map((group) => ({
        ...(group.id ? { id: group.id } : {}),
        kind: group.count === 1 ? ('SINGLE' as const) : ('MULTI' as const),
        ...(group.count === 1 ? {} : { requiredCount: group.count }),
        titles: text(group.titles),
        options: group.options.map((option) => item(option, true)),
      })),
      ...(draft.included.length > 0
        ? [
            {
              ...(draft.includedSlotId ? { id: draft.includedSlotId } : {}),
              kind: 'FIXED' as const,
              titles: includedTitles,
              options: draft.included.map((option) => item(option, false)),
            },
          ]
        : []),
    ],
  };
}

/** Adds a menu item to an INCLUDED list: the same product + size again just raises its quantity. */
function addIncluded(list: DraftItem[], item: DraftItem): DraftItem[] {
  const same = item.productId !== null ? list.find((c) => c.productId === item.productId && c.variantId === item.variantId) : undefined;
  if (!same) return [...list, item];
  return list.map((c) => (c === same ? { ...c, quantity: Math.min(99, c.quantity + item.quantity) } : c));
}

/** Adds a menu item to a CHOICE group: the same product + size twice would be two identical choices, so it is ignored. */
function addChoice(list: DraftItem[], item: DraftItem): DraftItem[] {
  const exists = item.productId !== null && list.some((c) => c.productId === item.productId && c.variantId === item.variantId);
  return exists ? list : [...list, item];
}

/** The draft as a guest would receive it, in one language (the preview feeds it to the real guest components). */
function draftToPublicOffer(draft: Draft, language: 'ar' | 'en', defaultLocale: string, placeholder: string): PublicOffer {
  const pickText = (map: Record<string, string>): string => map[language]?.trim() || map[defaultLocale]?.trim() || Object.values(map).find((v) => v.trim()) || '';
  const option = (item: DraftItem, slot: string, index: number) => ({
    id: `${slot}-${index}`,
    name: (item.productId ? pickText(item.shownNames) : pickText(item.names)) || '…',
    priceAdjustment: MONEY.test(normalizeMoneyInput(item.adjustment || '0')) ? normalizeMoneyInput(item.adjustment || '0') : '0',
    quantity: item.quantity,
  });
  const groups = draft.groups.map((group, g) => ({
    id: `g${g}`,
    kind: group.count === 1 ? ('SINGLE' as const) : ('MULTI' as const),
    requiredCount: group.count === 1 ? 1 : group.count,
    title: pickText(group.titles) || '…',
    options: group.options.map((o, i) => option(o, `g${g}`, i)),
  }));
  const included = draft.included.length > 0
    ? [{
        id: 'included',
        kind: 'FIXED' as const,
        requiredCount: 0,
        title: draft.includedTitles[language]?.trim() || INCLUDED_TITLE[language],
        options: draft.included.map((o, i) => ({ ...option(o, 'included', i), priceAdjustment: '0.00' })),
      }]
    : [];
  const price = normalizeMoneyInput(draft.price);
  return {
    id: 'preview',
    name: pickText(draft.names) || placeholder,
    description: pickText(draft.descriptions) || null,
    price: MONEY.test(price) ? price : '0',
    badge: draft.badge,
    imageAssetPath: null,
    daysOfWeek: draft.days.length === ALL_DAYS.length ? [] : [...draft.days].sort((a, b) => a - b),
    startsOn: draft.startsOn || null,
    endsOn: draft.endsOn || null,
    availableToday: true,
    soldOut: false,
    slots: [...groups, ...included],
  };
}

/** The best name of an item for the Staff's own language (then the default language, then any). */
function itemLabel(item: DraftItem, locale: string, defaultLocale: string): string {
  const map = item.productId ? item.shownNames : item.names;
  return map[locale] ?? map[defaultLocale] ?? Object.values(map)[0] ?? '';
}

/**
 * The shared "add an item from the menu" control: one dropdown of the menu's products (one entry per size when a product
 * has sizes), grouped by category. Picking one adds it and resets the dropdown.
 */
function MenuItemPicker({
  id,
  label,
  placeholder,
  items,
  locale,
  defaultLocale,
  onPick,
}: {
  id: string;
  label: string;
  placeholder: string;
  items: MenuItemChoice[] | null;
  locale: string;
  defaultLocale: string;
  onPick: (item: DraftItem) => void;
}) {
  const name = (names: Record<string, string>): string =>
    names[locale] ?? names[defaultLocale] ?? Object.values(names)[0] ?? '';
  const byCategory = new Map<string, MenuItemChoice[]>();
  for (const choice of items ?? []) {
    const category = name(choice.categoryNames);
    byCategory.set(category, [...(byCategory.get(category) ?? []), choice]);
  }
  return (
    <FormField label={label} htmlFor={id}>
      <Select
        id={id}
        value=""
        disabled={items === null}
        onChange={(event) => {
          const [productId, variantId] = event.target.value.split('|');
          const choice = (items ?? []).find((candidate) => candidate.id === productId);
          if (choice) onPick(menuItem(choice, variantId || null));
        }}
      >
        <option value="">{placeholder}</option>
        {[...byCategory.entries()].map(([category, choices]) => (
          <optgroup key={category} label={category}>
            {choices.flatMap((choice) =>
              choice.variants.length === 0
                ? [
                    <option key={choice.id} value={choice.id}>
                      {name(choice.names)}
                    </option>,
                  ]
                : choice.variants.map((variant) => (
                    <option key={`${choice.id}|${variant.id}`} value={`${choice.id}|${variant.id}`}>
                      {name(choice.names)} ({name(variant.names)})
                    </option>
                  )),
            )}
          </optgroup>
        ))}
      </Select>
    </FormField>
  );
}

export function OffersWorkspace({
  restaurantId,
  defaultLocale,
  currencyCode,
  canManage,
}: {
  restaurantId: string;
  defaultLocale: string;
  currencyCode: string;
  canManage: boolean;
}) {
  const { t, tp, locale } = useStaffI18n();
  const activeLocales = useActiveLocales(restaurantId, defaultLocale);
  const locales = useMemo(() => activeLocales ?? [defaultLocale], [activeLocales, defaultLocale]);
  const [items, setItems] = useState<Offer[] | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItemChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Offer | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const fail = useCallback((caught: unknown, target: 'page' | 'form' = 'page') => {
    if (isUnauthenticatedError(caught)) {
      redirectToLogin();
      return;
    }
    (target === 'page' ? setError : setFormError)(describeError(caught));
  }, []);

  const reload = useCallback(async () => {
    try {
      setItems(await offersApi.listOffers(restaurantId));
    } catch (caught) {
      fail(caught);
    }
  }, [restaurantId, fail]);

  useEffect(() => {
    let cancelled = false;
    offersApi
      .listOffers(restaurantId)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((caught: unknown) => {
        if (!cancelled) fail(caught);
      });
    // The menu's items for the pickers (the editor works without them: typed items still work).
    offersApi
      .listMenuItems(restaurantId)
      .then((list) => {
        if (!cancelled) setMenuItems(list);
      })
      .catch(() => {
        if (!cancelled) setMenuItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, fail]);

  const photoPreview = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile]);
  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    },
    [photoPreview],
  );

  function openEditor(next: Draft) {
    setNotice(null);
    setError(null);
    setFormError(null);
    setPhotoFile(null);
    setPhotoRemoved(false);
    setPhotoError(null);
    setDraft(next);
  }

  function patchDraft(change: (current: Draft) => Draft) {
    setDraft((current) => (current ? change(current) : current));
  }

  function patchGroup(groupKey: string, change: (group: DraftGroup) => DraftGroup) {
    patchDraft((current) => ({
      ...current,
      groups: current.groups.map((group) => (group.key === groupKey ? change(group) : group)),
    }));
  }

  function moveGroup(groupKey: string, direction: -1 | 1) {
    patchDraft((current) => {
      const index = current.groups.findIndex((group) => group.key === groupKey);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.groups.length) return current;
      const groups = [...current.groups];
      [groups[index], groups[target]] = [groups[target], groups[index]];
      return { ...current, groups };
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setFormError(null);
    const problem = validate(draft, defaultLocale, t);
    if (problem) {
      setFormError(problem);
      return;
    }
    setSaving(true);
    try {
      const input = toInput(draft, locales);
      const saved = draft.id
        ? await offersApi.updateOffer(restaurantId, draft.id, input)
        : await offersApi.createOffer(restaurantId, input);
      // The photo is its own request (like Product photos): the offer is already saved when it fails.
      try {
        if (photoFile) await offersApi.uploadOfferImage(restaurantId, saved.id, photoFile);
        else if (photoRemoved && draft.imageAssetPath) await offersApi.removeOfferImage(restaurantId, saved.id);
      } catch (photoCaught) {
        setError(describeError(photoCaught));
      }
      setDraft(null);
      setNotice(t('offers.saved'));
      await reload();
    } catch (caught) {
      fail(caught, 'form');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(offer: Offer, next: boolean) {
    setBusyId(offer.id);
    setNotice(null);
    setError(null);
    try {
      await offersApi.updateOffer(restaurantId, offer.id, { status: next ? 'ACTIVE' : 'INACTIVE' });
      setNotice(next ? t('offers.enabled') : t('offers.disabled'));
      await reload();
    } catch (caught) {
      fail(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function handleMove(offer: Offer, direction: -1 | 1) {
    if (!items) return;
    const index = items.findIndex((candidate) => candidate.id === offer.id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= items.length) return;
    const ids = items.map((candidate) => candidate.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusyId(offer.id);
    setNotice(null);
    setError(null);
    try {
      await offersApi.reorderOffers(restaurantId, ids);
      setNotice(t('offers.reordered'));
      await reload();
    } catch (caught) {
      fail(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    setSaving(true);
    try {
      await offersApi.deleteOffer(restaurantId, toDelete.id);
      setToDelete(null);
      setNotice(t('offers.deleted'));
      await reload();
    } catch (caught) {
      setToDelete(null);
      fail(caught);
    } finally {
      setSaving(false);
    }
  }

  const dayName = (day: number): string => t(`offers.day.${day}` as MessageKey);
  const daysText = (offer: Offer): string =>
    offer.daysOfWeek.length === 0
      ? t('offers.days.everyDay')
      : (locale === 'ar' ? [6, 0, 1, 2, 3, 4, 5] : ALL_DAYS)
          .filter((day) => offer.daysOfWeek.includes(day))
          .map(dayName)
          .join(locale === 'ar' ? '، ' : ', ');
  const shownName = (offer: Offer): string =>
    offer.names[locale] ?? offer.names[defaultLocale] ?? Object.values(offer.names)[0] ?? '';

  /** One row of an item (included or a choice): its name, a menu / typed tag, quantity or extra price, remove. */
  function renderItem(
    item: DraftItem,
    kind: 'included' | 'choice',
    onChange: (next: DraftItem) => void,
    onRemove: () => void,
    canRemove: boolean,
  ) {
    const linked = item.productId !== null;
    const missing = linked && itemLabel(item, locale, defaultLocale) === '';
    return (
      <li key={item.key} className="grid items-end gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
        <div className="flex flex-col gap-2">
          {linked ? (
            <div>
              <p dir="auto" className="text-sm font-semibold text-foreground">
                {missing ? t('offers.item.missing') : itemLabel(item, locale, defaultLocale)}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="info">{t('offers.item.menuTag')}</Badge>
                {!item.orderable ? <Badge variant="warning">{t('offers.item.soldOut')}</Badge> : null}
              </p>
            </div>
          ) : (
            locales.map((code) => (
              <FormField
                key={code}
                label={t(code === defaultLocale ? 'offers.option.nameDefault' : 'offers.option.name', {
                  language: localeLabel(code),
                })}
                htmlFor={`item-${item.key}-name-${code}`}
              >
                <Input
                  id={`item-${item.key}-name-${code}`}
                  dir={localeDirection(code)}
                  maxLength={80}
                  value={item.names[code] ?? ''}
                  onChange={(event) => onChange({ ...item, names: { ...item.names, [code]: event.target.value } })}
                />
              </FormField>
            ))
          )}
        </div>
        {kind === 'included' ? (
          <FormField label={t('offers.item.quantity')} htmlFor={`item-${item.key}-qty`}>
            <Input
              id={`item-${item.key}-qty`}
              type="number"
              dir="ltr"
              min={1}
              max={99}
              value={item.quantity}
              onChange={(event) =>
                onChange({ ...item, quantity: Math.min(99, Math.max(1, Math.floor(Number(event.target.value)) || 1)) })
              }
            />
          </FormField>
        ) : (
          <FormField label={`${t('offers.option.price')} (${currencyCode})`} htmlFor={`item-${item.key}-price`}>
            <Input
              id={`item-${item.key}-price`}
              dir="ltr"
              inputMode="decimal"
              autoComplete="off"
              aria-describedby={`item-${item.key}-price-hint`}
              value={item.adjustment}
              onChange={(event) => onChange({ ...item, adjustment: event.target.value })}
            />
            <span id={`item-${item.key}-price-hint`} className="sr-only">
              {t('offers.option.priceHint')}
            </span>
          </FormField>
        )}
        <Button type="button" variant="ghost" size="sm" disabled={!canRemove} onClick={onRemove}>
          {t('offers.option.remove')}
        </Button>
      </li>
    );
  }

  // ------------------------------------------------------------------ editor
  if (draft) {
    const optionCount = draft.included.length + draft.groups.reduce((sum, group) => sum + group.options.length, 0);
    const dayOrder = locale === 'ar' ? [6, 0, 1, 2, 3, 4, 5] : ALL_DAYS;
    const imageUrl = photoRemoved ? null : (photoPreview ?? resolveAssetUrl(draft.imageAssetPath));
    return (
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
      <form className="flex min-w-0 flex-col gap-6" onSubmit={(event) => void handleSave(event)} noValidate>
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>
            {t('offers.back')}
          </Button>
        </div>
        <PageHeader
          title={draft.id ? t('offers.editor.edit') : t('offers.editor.create')}
          description={t('offers.limits', { slots: MAX_SLOTS, options: MAX_OPTIONS })}
        />
        {formError ? <Alert variant="error">{formError}</Alert> : null}

        <SectionCard title={t('offers.section.basics')}>
          <div className="flex flex-col gap-4">
            {locales.map((code) => (
              <FormField
                key={code}
                label={t(code === defaultLocale ? 'offers.field.nameDefault' : 'offers.field.name', {
                  language: localeLabel(code),
                })}
                htmlFor={`offer-name-${code}`}
              >
                <Input
                  id={`offer-name-${code}`}
                  dir={localeDirection(code)}
                  maxLength={120}
                  value={draft.names[code] ?? ''}
                  onChange={(event) =>
                    patchDraft((current) => ({ ...current, names: { ...current.names, [code]: event.target.value } }))
                  }
                />
              </FormField>
            ))}
            {locales.map((code) => (
              <FormField
                key={code}
                label={t('offers.field.description', { language: localeLabel(code) })}
                htmlFor={`offer-description-${code}`}
              >
                <Input
                  id={`offer-description-${code}`}
                  dir={localeDirection(code)}
                  maxLength={300}
                  value={draft.descriptions[code] ?? ''}
                  onChange={(event) =>
                    patchDraft((current) => ({
                      ...current,
                      descriptions: { ...current.descriptions, [code]: event.target.value },
                    }))
                  }
                />
              </FormField>
            ))}
            <p className="-mt-2 text-xs text-muted-foreground">{t('offers.field.descriptionHint')}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={`${t('offers.field.price')} (${currencyCode})`} htmlFor="offer-price">
                <Input
                  id="offer-price"
                  dir="ltr"
                  inputMode="decimal"
                  autoComplete="off"
                  value={draft.price}
                  onChange={(event) => patchDraft((current) => ({ ...current, price: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">{t('offers.field.priceHint')}</p>
              </FormField>
              <FormField label={t('offers.field.badge')} htmlFor="offer-badge">
                <Select
                  id="offer-badge"
                  value={draft.badge}
                  onChange={(event) =>
                    patchDraft((current) => ({ ...current, badge: event.target.value as OfferBadge }))
                  }
                >
                  {(['OFFER', 'GIFT', 'MOST_ORDERED'] as const).map((badge) => (
                    <option key={badge} value={badge}>
                      {t(`offers.badge.${badge}` as MessageKey)}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t('offers.section.photo')}>
          <ImageField
            idPrefix="offer"
            imageUrl={imageUrl}
            onSelectFile={(file) => {
              const problem = validateImageFile(file);
              if (problem) {
                setPhotoError(problem);
                return;
              }
              setPhotoError(null);
              setPhotoRemoved(false);
              setPhotoFile(file);
            }}
            onRemove={
              imageUrl
                ? () => {
                    setPhotoFile(null);
                    setPhotoRemoved(true);
                  }
                : undefined
            }
            isBusy={saving}
            error={photoError}
            selectLabel={imageUrl ? t('offers.photo.replace') : t('offers.photo.choose')}
            removeLabel={t('offers.photo.remove')}
            helperText={t('offers.photo.hint')}
          />
        </SectionCard>

        <SectionCard
          title={t('offers.section.included')}
          description={`${t('offers.included.hint')} (${optionCount}/${MAX_OPTIONS})`}
        >
          <div className="flex flex-col gap-4">
            {draft.included.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('offers.included.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {draft.included.map((item) =>
                  renderItem(
                    item,
                    'included',
                    (next) =>
                      patchDraft((current) => ({
                        ...current,
                        included: current.included.map((candidate) => (candidate.key === item.key ? next : candidate)),
                      })),
                    () =>
                      patchDraft((current) => ({
                        ...current,
                        included: current.included.filter((candidate) => candidate.key !== item.key),
                      })),
                    true,
                  ),
                )}
              </ul>
            )}
            <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <MenuItemPicker
                id="included-menu-picker"
                label={t('offers.item.fromMenu')}
                placeholder={t('offers.item.pickPlaceholder')}
                items={menuItems}
                locale={locale}
                defaultLocale={defaultLocale}
                onPick={(picked) => patchDraft((current) => ({ ...current, included: addIncluded(current.included, picked) }))}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={optionCount >= MAX_OPTIONS}
                onClick={() => patchDraft((current) => ({ ...current, included: [...current.included, typedItem()] }))}
              >
                {t('offers.item.addCustom')}
              </Button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t('offers.section.groups')} description={t('offers.groups.hint')}>
          <div className="flex flex-col gap-4">
            {draft.groups.map((group, groupIndex) => (
              <fieldset key={group.key} className="min-w-0 rounded-xl border border-border bg-card p-4">
                <legend className="px-1 text-sm font-bold text-foreground">
                  {t('offers.group.title', { number: groupIndex + 1 })}
                </legend>
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
                    <div className="flex flex-col gap-3">
                      {locales.map((code) => (
                        <FormField
                          key={code}
                          label={t(code === defaultLocale ? 'offers.group.titleDefault' : 'offers.group.titleField', {
                            language: localeLabel(code),
                          })}
                          htmlFor={`group-${group.key}-title-${code}`}
                        >
                          <Input
                            id={`group-${group.key}-title-${code}`}
                            dir={localeDirection(code)}
                            maxLength={80}
                            value={group.titles[code] ?? ''}
                            onChange={(event) =>
                              patchGroup(group.key, (current) => ({
                                ...current,
                                titles: { ...current.titles, [code]: event.target.value },
                              }))
                            }
                          />
                        </FormField>
                      ))}
                    </div>
                    <FormField label={t('offers.group.count')} htmlFor={`group-${group.key}-count`}>
                      <Input
                        id={`group-${group.key}-count`}
                        type="number"
                        dir="ltr"
                        min={1}
                        max={MAX_PICK}
                        value={group.count}
                        onChange={(event) =>
                          patchGroup(group.key, (current) => ({
                            ...current,
                            count: Math.min(MAX_PICK, Math.max(1, Math.floor(Number(event.target.value)) || 1)),
                          }))
                        }
                      />
                      <p className="text-xs text-muted-foreground">{t('offers.group.countHint')}</p>
                    </FormField>
                  </div>

                  <ul className="flex flex-col gap-3">
                    {group.options.map((option) =>
                      renderItem(
                        option,
                        'choice',
                        (next) =>
                          patchGroup(group.key, (current) => ({
                            ...current,
                            options: current.options.map((candidate) => (candidate.key === option.key ? next : candidate)),
                          })),
                        () =>
                          patchGroup(group.key, (current) => ({
                            ...current,
                            options: current.options.filter((candidate) => candidate.key !== option.key),
                          })),
                        group.options.length > 1,
                      ),
                    )}
                  </ul>
                  <p className="-mt-1 text-xs text-muted-foreground">{t('offers.option.priceHint')}</p>

                  <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <MenuItemPicker
                      id={`group-${group.key}-menu-picker`}
                      label={t('offers.group.addFromMenu')}
                      placeholder={t('offers.item.pickPlaceholder')}
                      items={menuItems}
                      locale={locale}
                      defaultLocale={defaultLocale}
                      onPick={(picked) =>
                        patchGroup(group.key, (current) => ({ ...current, options: addChoice(current.options, picked) }))
                      }
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={optionCount >= MAX_OPTIONS}
                      onClick={() =>
                        patchGroup(group.key, (current) => ({ ...current, options: [...current.options, typedItem()] }))
                      }
                    >
                      {t('offers.item.addCustom')}
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex-1" />
                    <Button type="button" variant="ghost" size="sm" disabled={groupIndex === 0} onClick={() => moveGroup(group.key, -1)}>
                      {t('offers.group.moveUp')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={groupIndex === draft.groups.length - 1}
                      onClick={() => moveGroup(group.key, 1)}
                    >
                      {t('offers.group.moveDown')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        patchDraft((current) => ({
                          ...current,
                          groups: current.groups.filter((candidate) => candidate.key !== group.key),
                        }))
                      }
                    >
                      {t('offers.group.remove')}
                    </Button>
                  </div>
                </div>
              </fieldset>
            ))}
            <div>
              <Button
                type="button"
                variant="secondary"
                disabled={draft.groups.length + (draft.included.length > 0 ? 1 : 0) >= MAX_SLOTS}
                onClick={() => patchDraft((current) => ({ ...current, groups: [...current.groups, emptyGroup()] }))}
              >
                {t('offers.group.add')}
              </Button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t('offers.section.when')}>
          <div className="flex flex-col gap-4">
            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-sm font-medium text-secondary-foreground">
                {t('offers.field.days')}
              </legend>
              <div className="flex flex-wrap gap-2">
                {dayOrder.map((day) => {
                  const on = draft.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        patchDraft((current) => ({
                          ...current,
                          days: on ? current.days.filter((d) => d !== day) : [...current.days, day],
                        }))
                      }
                      className={`min-h-10 rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        on
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-foreground hover:bg-muted'
                      }`}
                    >
                      {dayName(day)}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{t('offers.field.daysHint')}</p>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('offers.field.startsOn')} htmlFor="offer-starts">
                <Input
                  id="offer-starts"
                  type="date"
                  dir="ltr"
                  value={draft.startsOn}
                  onChange={(event) => patchDraft((current) => ({ ...current, startsOn: event.target.value }))}
                />
              </FormField>
              <FormField label={t('offers.field.endsOn')} htmlFor="offer-ends">
                <Input
                  id="offer-ends"
                  type="date"
                  dir="ltr"
                  value={draft.endsOn}
                  min={draft.startsOn || undefined}
                  onChange={(event) => patchDraft((current) => ({ ...current, endsOn: event.target.value }))}
                />
              </FormField>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{t('offers.field.active')}</p>
                <p className="text-xs text-muted-foreground">{t('offers.field.activeHint')}</p>
              </div>
              <Switch
                checked={draft.active}
                onCheckedChange={(next) => patchDraft((current) => ({ ...current, active: next }))}
                label={t('offers.field.active')}
              />
            </div>
          </div>
        </SectionCard>

        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
          <Button type="button" variant="secondary" onClick={() => setDraft(null)} disabled={saving}>
            {t('offers.back')}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? t('offers.editor.saving') : t('offers.editor.save')}
          </Button>
        </div>
      </form>
      <div className="min-w-0 xl:sticky xl:top-4">
        <OfferPreview
          offer={(language) => draftToPublicOffer(draft, language, defaultLocale, t('offers.preview.placeholderName'))}
          currencyCode={currencyCode}
          imageUrl={imageUrl}
        />
      </div>
      </div>
    );
  }

  // -------------------------------------------------------------------- list
  return (
    <div className="flex flex-col gap-6">
      <MenuHubBackLink restaurantId={restaurantId} parent="hub" />
      <MenuSectionTabs restaurantId={restaurantId} active="offers" offersEnabled />
      <PageHeader title={t('offers.title')} description={t('offers.description')} />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <SectionCard
        title={t('offers.title')}
        actions={canManage ? <Button onClick={() => openEditor(emptyDraft())}>{t('offers.add')}</Button> : null}
      >
        {items === null && !error ? <LoadingState label={t('offers.loading')} /> : null}
        {items !== null && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('offers.empty')}</p>
        ) : null}
        {items !== null && items.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {items.map((offer, index) => {
              const thumb = resolveAssetUrl(offer.imageAssetPath);
              return (
                <li
                  key={offer.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
                      <img src={thumb} alt="" className="size-14 shrink-0 rounded-lg border border-border object-cover" />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-accent text-xl"
                      >
                        🎁
                      </span>
                    )}
                    <div className="min-w-0">
                      <p dir="auto" className="truncate text-sm font-semibold text-foreground">
                        {shownName(offer)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <bdi>{formatMoney(offer.price, currencyCode, locale)}</bdi> · {daysText(offer)} ·{' '}
                        {tp('offers.slotsCount', offer.slots.length)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="neutral">{t(`offers.badge.${offer.badge}` as MessageKey)}</Badge>
                    <Badge variant={STATE_VARIANT[offer.state]} dot>
                      {t(`offers.state.${offer.state}` as MessageKey)}
                    </Badge>
                    {canManage ? (
                      <>
                        <Switch
                          checked={offer.status === 'ACTIVE'}
                          disabled={busyId === offer.id}
                          onCheckedChange={(next) => void handleToggle(offer, next)}
                          label={t('offers.switchLabel', { name: shownName(offer) })}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === offer.id || index === 0}
                          aria-label={`${t('offers.moveUp')}: ${shownName(offer)}`}
                          onClick={() => void handleMove(offer, -1)}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === offer.id || index === items.length - 1}
                          aria-label={`${t('offers.moveDown')}: ${shownName(offer)}`}
                          onClick={() => void handleMove(offer, 1)}
                        >
                          ↓
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => openEditor(toDraft(offer))}>
                          {t('offers.edit')}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setToDelete(offer)}>
                          {t('offers.delete')}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </SectionCard>

      <ConfirmDialog
        open={toDelete !== null}
        title={t('offers.delete.title')}
        description={t('offers.delete.body')}
        confirmLabel={t('offers.delete')}
        isSubmitting={saving}
        onConfirm={() => void handleDelete()}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
