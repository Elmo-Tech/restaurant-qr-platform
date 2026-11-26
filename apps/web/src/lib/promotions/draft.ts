import type { Promotion, PromotionDraft, PromotionScope, PromotionTargets } from './api';
import type { MessageKey } from '../i18n/messages';

export type DraftFields = Omit<PromotionDraft, 'priority' | 'startsOn' | 'endsOn' | 'minimumSubtotal' | 'minimumQuantity'> & {
  priority: string;
  startsOn: string;
  endsOn: string;
  minimumSubtotal: string;
  minimumQuantity: string;
};

/** CATEGORY and MENU discount the items themselves (per purchased unit); the other scopes discount a cart or a fee. */
export function isItemScope(scope: PromotionScope) {
  return scope === 'CATEGORY' || scope === 'MENU';
}

/**
 * DEC-077 B1: discount-type support and minimum applicability are two separate questions. Every scope supports both
 * discount types (a fixed item discount only while the backend write gate is on, see `canOfferFixed`); only a
 * cart, quantity or delivery promotion can have a minimum order amount.
 */
export function supportsMinimumSubtotal(scope: PromotionScope) {
  return !isItemScope(scope);
}

/** A stored fixed item promotion keeps its type in the form even when new fixed item promotions are not allowed. */
export function isFixedItem(row: Pick<PromotionDraft, 'scope' | 'discountType'> | null): boolean {
  return row !== null && isItemScope(row.scope) && row.discountType === 'FIXED_AMOUNT';
}

/** Whether FIXED_AMOUNT may be offered for `scope`: always for non-item scopes; for item scopes only while writes are enabled, or to keep an existing fixed item promotion as it is. */
export function canOfferFixed(scope: PromotionScope, fixedItemScopeEnabled: boolean, original: Promotion | null): boolean {
  return !isItemScope(scope) || fixedItemScopeEnabled || (isFixedItem(original) && original?.scope === scope);
}

/** True when saving would change the stored discount type of an existing promotion (needs an explicit confirmation). */
export function changesDiscountType(original: Promotion | null, fields: Pick<DraftFields, 'discountType'>): boolean {
  return original !== null && original.discountType !== fields.discountType;
}

export function hasItemRestrictions(scope: PromotionScope) {
  return scope === 'CART' || scope === 'QUANTITY';
}

export function blankDraft(original: Promotion | null): DraftFields {
  return {
    internalName: original?.internalName ?? '',
    scope: original?.scope ?? 'CART',
    discountType: original?.discountType ?? 'PERCENTAGE',
    value: original?.value ?? '',
    priority: String(original?.priority ?? 100),
    startsOn: original?.startsOn?.slice(0, 10) ?? '',
    endsOn: original?.endsOn?.slice(0, 10) ?? '',
    minimumSubtotal: original?.minimumSubtotal ?? '',
    minimumQuantity: String(original?.minimumQuantity ?? ''),
    quantityBasis: original?.quantityBasis ?? 'UNITS',
    branchIds: original?.branchIds ?? [],
    menuIds: original?.menuIds ?? [],
    categoryIds: original?.categoryIds ?? [],
    productIds: original?.productIds ?? [],
    deliveryZoneIds: original?.deliveryZoneIds ?? [],
    translations: original?.translations ?? [],
  };
}

function widens(previous: string[], next: string[]) {
  return previous.length > 0 && (!next.length || next.some((id) => !previous.includes(id)));
}

/** Show the confirmation before submitting; the API still checks widening against the locked row. */
export function widening(original: Promotion | null, draft: Pick<PromotionDraft, 'scope' | 'branchIds' | 'deliveryZoneIds' | 'menuIds' | 'categoryIds' | 'productIds'>) {
  if (!original) return { zone: false, other: false };
  const zone = original.scope === 'DELIVERY' && draft.scope === 'DELIVERY' && original.deliveryZoneIds.length > 0 && draft.deliveryZoneIds.length === 0;
  const branch = widens(original.branchIds, draft.branchIds);
  if (original.scope !== draft.scope) return { zone, other: true };
  if (hasItemRestrictions(draft.scope)) {
    const itemKeys = (row: typeof draft) => [...row.categoryIds.map((id) => `category:${id}`), ...row.productIds.map((id) => `product:${id}`)];
    return { zone, other: branch || widens(itemKeys(original), itemKeys(draft)) };
  }
  return { zone, other: branch || (draft.scope === 'CATEGORY' && widens(original.categoryIds, draft.categoryIds)) ||
    (draft.scope === 'MENU' && widens(original.menuIds, draft.menuIds)) ||
    (draft.scope === 'DELIVERY' && !zone && widens(original.deliveryZoneIds, draft.deliveryZoneIds)) };
}

/** Native Arabic keyboards can send Arabic-Indic numerals and the Arabic decimal separator. */
export function normalizePromotionNumber(value: string): string {
  return value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.');
}

const money = /^\d{1,12}(\.\d{1,2})?$/;
const whole = /^(0|[1-9]\d*)$/;

export function toPromotionDraft(fields: DraftFields, targets: PromotionTargets): { draft: PromotionDraft } | { error: MessageKey } {
  const { scope } = fields;
  const internalName = fields.internalName.trim();
  // Save retains omitted inactive locales on the server; preview accepts only active locales.
  const translations = fields.translations.filter((entry) => targets.activeLocales.includes(entry.locale) || entry.locale === targets.defaultLocale)
    .map((entry) => ({ ...entry, title: entry.title.trim(), description: entry.description?.trim() || null }));
  if (!internalName || !translations.some((entry) => entry.locale === targets.defaultLocale && entry.title)) return { error: 'promotions.validation.names' };
  if (translations.some((entry) => entry.description && !entry.title)) return { error: 'promotions.validation.translation' };
  // Never forced: a stored fixed item promotion must reach the API as the fixed promotion it is (DEC-077 B1).
  const { discountType } = fields;
  const value = fields.value.trim();
  // Shape validation only; the backend evaluates all money and pricing.
  if (!money.test(value) || !/[1-9]/.test(value) || (discountType === 'PERCENTAGE' && !/^(100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(value))) {
    return { error: 'promotions.validation.value' };
  }
  const minimumSubtotal = supportsMinimumSubtotal(scope) ? fields.minimumSubtotal.trim() || null : null;
  if (minimumSubtotal !== null && !money.test(minimumSubtotal)) return { error: 'promotions.validation.minimumSubtotal' };
  const minimumQuantity = scope === 'QUANTITY' ? Number(fields.minimumQuantity) : null;
  if (minimumQuantity !== null && (!whole.test(fields.minimumQuantity) || minimumQuantity < 1 || minimumQuantity > 2147483647)) return { error: 'promotions.validation.minimumQuantity' };
  const priority = Number(fields.priority);
  if (!whole.test(fields.priority) || priority > 1000) return { error: 'promotions.validation.priority' };
  if (fields.startsOn && fields.endsOn && fields.startsOn > fields.endsOn) return { error: 'promotions.validation.dates' };
  const menuIds = scope === 'MENU' ? fields.menuIds : [];
  const categoryIds = scope === 'CATEGORY' || hasItemRestrictions(scope) ? fields.categoryIds : [];
  const productIds = hasItemRestrictions(scope) ? fields.productIds : [];
  const deliveryZoneIds = scope === 'DELIVERY' ? fields.deliveryZoneIds : [];
  if ((scope === 'MENU' && !menuIds.length) || (scope === 'CATEGORY' && !categoryIds.length)) return { error: 'promotions.validation.targets' };
  if (fields.branchIds.length && deliveryZoneIds.some((id) => {
    const zone = targets.deliveryZones.find((candidate) => candidate.id === id);
    return zone ? !fields.branchIds.includes(zone.branchId) : false;
  })) return { error: 'promotions.validation.zoneBranch' };
  return { draft: {
    internalName, translations: translations.filter((entry) => entry.title), scope, discountType, value, priority,
    startsOn: fields.startsOn || null, endsOn: fields.endsOn || null,
    minimumSubtotal, minimumQuantity, quantityBasis: scope === 'QUANTITY' ? fields.quantityBasis : null,
    branchIds: fields.branchIds, menuIds, categoryIds, productIds, deliveryZoneIds,
  } };
}

export function hasUuidShape(value: string): boolean {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}
