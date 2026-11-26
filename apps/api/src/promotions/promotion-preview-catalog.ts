import { Prisma } from '../generated/prisma/client';
import { dateOnlyString } from '../menu/product-discount';
import type { CreateGuestOrderItemInput } from '../public/public-orders.service';
import type { PreviewSample } from './promotion-preview-examples';

/**
 * DEC-077 B3: which products a REAL preview may stand on.
 *
 * A REAL example must be a basket the Guest quote accepts. `priceCart` (the Guest quote's own validation, run by the
 * preview service as a final gate) is the authority; this module only BUILDS the one simple line per product that can
 * pass it: the product's first active size and, for every mandatory choice, the cheapest valid selection. It never
 * invents a price: a mandatory choice that cannot be satisfied without a paid extra (the preview assumes none) or at
 * all makes the product unavailable for a REAL example, with a reason code Staff UI can translate.
 */

/** Reason codes (stable, translatable). Item-level problems of an INCOMPLETE answer and exclusions share them. */
export type OrderabilityReason =
  | 'ITEM_PRODUCT_INACTIVE'
  | 'ITEM_PRODUCT_SOLD_OUT'
  | 'ITEM_CATEGORY_INACTIVE'
  | 'ITEM_OUTSIDE_PRIMARY_MENU'
  | 'ITEM_NAME_MISSING'
  | 'ITEM_SIZE_UNAVAILABLE'
  /** A mandatory choice (modifier group) has too few free options; the preview assumes no paid extras. */
  | 'ITEM_REQUIRED_CHOICE_NEEDS_PAID_EXTRA'
  /** A mandatory choice has too few available options (or an impossible range): the Guest cannot order the product. */
  | 'ITEM_REQUIRED_CHOICE_UNAVAILABLE'
  /** The Guest quote refuses the line for a reason this builder does not model. */
  | 'ITEM_NOT_ORDERABLE'
  | 'ITEM_DUPLICATE';

/** What the Guest quote reads of a product (the same fields and filters `priceCart` selects). */
export const productSelect = (defaultLocale: string) =>
  ({
    id: true,
    status: true,
    availability: true,
    basePrice: true,
    discountType: true,
    discountValue: true,
    discountEnabled: true,
    discountStartsOn: true,
    discountEndsOn: true,
    category: { select: { id: true, menuId: true, status: true } },
    translations: {
      where: { locale: defaultLocale },
      select: { name: true },
      take: 1,
    },
    // A simple sample uses the first enabled size and no paid extras (the same rule as the pre-B3 preview).
    variants: {
      where: { status: 'ACTIVE' },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      take: 1,
      select: {
        id: true,
        price: true,
        discountApplies: true,
        translations: {
          where: { locale: defaultLocale },
          select: { name: true },
          take: 1,
        },
      },
    },
    modifierGroups: {
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        variantId: true,
        minimumSelections: true,
        maximumSelections: true,
        sizeSettings: { select: { variantId: true, enabled: true } },
        translations: {
          where: { locale: defaultLocale },
          select: { name: true },
          take: 1,
        },
        options: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            priceAdjustment: true,
            displayOrder: true,
            sizeSettings: {
              select: {
                variantId: true,
                enabled: true,
                priceAdjustment: true,
              },
            },
            translations: {
              where: { locale: defaultLocale },
              select: { name: true },
              take: 1,
            },
          },
        },
      },
    },
  }) satisfies Prisma.ProductSelect;

export type ProductRow = Prisma.ProductGetPayload<{
  select: ReturnType<typeof productSelect>;
}>;

/** Menu order, so the first sample is stable across requests. */
export const PRODUCT_ORDER = [
  { category: { displayOrder: 'asc' } },
  { category: { id: 'asc' } },
  { displayOrder: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ProductOrderByWithRelationInput[];

export type ResolvedLine =
  | {
      ok: true;
      sample: PreviewSample;
      /** The Guest cart line this sample stands for (what the final `priceCart` gate is given, quantity 1). */
      guestItem: CreateGuestOrderItemInput;
    }
  | { ok: false; reason: OrderabilityReason };

function toSample(
  row: ProductRow,
  size: ProductRow['variants'][number] | undefined,
): PreviewSample {
  return {
    productId: row.id,
    engineProductId: row.id,
    categoryId: row.category.id,
    menuId: row.category.menuId,
    variantId: size?.id ?? null,
    sizeDiscountApplies: size?.discountApplies ?? true,
    unitPrice: size?.price ?? row.basePrice,
    productDiscount: {
      type: row.discountType,
      value: row.discountValue,
      enabled: row.discountEnabled,
      startsOn: dateOnlyString(row.discountStartsOn),
      endsOn: dateOnlyString(row.discountEndsOn),
    },
    label: row.translations[0]?.name ?? 'Product',
  };
}

/**
 * The simple Guest line of one product, or the reason there is none. `primaryMenuId` is the Restaurant's ACTIVE primary
 * Menu (null when it has none: nothing is orderable).
 */
export function resolveLine(
  row: ProductRow,
  primaryMenuId: string | null,
): ResolvedLine {
  if (row.status !== 'ACTIVE')
    return { ok: false, reason: 'ITEM_PRODUCT_INACTIVE' };
  if (row.availability !== 'AVAILABLE') {
    return { ok: false, reason: 'ITEM_PRODUCT_SOLD_OUT' };
  }
  if (row.category.status !== 'ACTIVE') {
    return { ok: false, reason: 'ITEM_CATEGORY_INACTIVE' };
  }
  if (primaryMenuId === null || row.category.menuId !== primaryMenuId) {
    return { ok: false, reason: 'ITEM_OUTSIDE_PRIMARY_MENU' };
  }
  if (row.translations[0]?.name === undefined) {
    return { ok: false, reason: 'ITEM_NAME_MISSING' };
  }

  // The first ACTIVE size, which must carry a name (a nameless size is refused by the Guest quote).
  const size = row.variants[0];
  if (size && size.translations[0]?.name === undefined) {
    return { ok: false, reason: 'ITEM_SIZE_UNAVAILABLE' };
  }
  const sizeId = size?.id ?? null;
  // DEC-074 (as the Guest quote): a Size Group belongs only to its own size, and a Product Group may be switched
  // off per size.
  const groups = row.modifierGroups.filter(
    (group) =>
      (!group.variantId || group.variantId === sizeId) &&
      (sizeId === null ||
        !group.sizeSettings.some(
          (setting) => setting.variantId === sizeId && !setting.enabled,
        )),
  );

  const selected: string[] = [];
  let needsPaidExtra = false;
  for (const group of groups) {
    const required = group.minimumSelections;
    if (required <= 0) continue; // an optional choice is simply not chosen
    if (
      required > group.maximumSelections ||
      group.translations[0]?.name === undefined
    ) {
      return { ok: false, reason: 'ITEM_REQUIRED_CHOICE_UNAVAILABLE' };
    }
    const options = group.options
      .flatMap((option) => {
        const override = sizeId
          ? option.sizeSettings.find((setting) => setting.variantId === sizeId)
          : undefined;
        if (override?.enabled === false) return [];
        if (option.translations[0]?.name === undefined) return [];
        return [
          {
            id: option.id,
            displayOrder: option.displayOrder,
            price: override?.priceAdjustment ?? option.priceAdjustment,
          },
        ];
      })
      .sort(
        (a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id),
      );
    const free = options.filter(({ price }) => price.isZero());
    if (free.length >= required) {
      selected.push(...free.slice(0, required).map(({ id }) => id));
    } else if (options.length >= required) {
      needsPaidExtra = true;
    } else {
      return { ok: false, reason: 'ITEM_REQUIRED_CHOICE_UNAVAILABLE' };
    }
  }
  if (needsPaidExtra) {
    return { ok: false, reason: 'ITEM_REQUIRED_CHOICE_NEEDS_PAID_EXTRA' };
  }

  return {
    ok: true,
    sample: toSample(row, size),
    guestItem: {
      productId: row.id,
      quantity: 1,
      ...(size ? { variantId: size.id } : {}),
      ...(selected.length > 0 ? { modifierOptionIds: selected } : {}),
    },
  };
}
