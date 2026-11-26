import { Prisma } from '../generated/prisma/client';
import { dateOnlyString, dateOnlyToDate } from '../menu/product-discount';
import type { PromotionDraftDto } from './promotion.dto';
import type { EnginePromotion, PromotionStatusName } from './promotion-engine';

const ZERO = new Prisma.Decimal(0);

export const promotionConfigSelect = {
  id: true,
  internalName: true,
  scope: true,
  discountType: true,
  value: true,
  status: true,
  priority: true,
  startsOn: true,
  endsOn: true,
  minimumSubtotal: true,
  minimumQuantity: true,
  quantityBasis: true,
  translations: {
    select: { locale: true, title: true, description: true },
    orderBy: { locale: 'asc' },
  },
  branches: { select: { branchId: true }, orderBy: { branchId: 'asc' } },
  menus: { select: { menuId: true }, orderBy: { menuId: 'asc' } },
  categories: { select: { categoryId: true }, orderBy: { categoryId: 'asc' } },
  products: { select: { productId: true }, orderBy: { productId: 'asc' } },
  deliveryZones: {
    select: { deliveryZoneId: true },
    orderBy: { deliveryZoneId: 'asc' },
  },
} satisfies Prisma.PromotionSelect;

export type PromotionTranslation = {
  locale: string;
  title: string;
  description: string | null;
};

export type PromotionConfig = Omit<EnginePromotion, 'id' | 'status'> & {
  internalName: string;
  translations: readonly PromotionTranslation[];
};

export type PromotionCandidate = {
  promotion: EnginePromotion;
  label: { internalName: string; title: string | null };
};

export function fromDraft(dto: PromotionDraftDto): PromotionConfig {
  const ids = (values: string[] = []) =>
    values.map((value) => value.toLowerCase());
  return {
    internalName: dto.internalName.trim(),
    scope: dto.scope,
    discountType: dto.discountType,
    value: new Prisma.Decimal(dto.value),
    priority: dto.priority ?? 100,
    startsOn: dto.startsOn ?? null,
    endsOn: dto.endsOn ?? null,
    minimumSubtotal:
      dto.minimumSubtotal == null
        ? null
        : new Prisma.Decimal(dto.minimumSubtotal),
    minimumQuantity: dto.minimumQuantity ?? null,
    quantityBasis: dto.quantityBasis ?? null,
    branchIds: ids(dto.branchIds),
    menuIds: ids(dto.menuIds),
    categoryIds: ids(dto.categoryIds),
    productIds: ids(dto.productIds),
    deliveryZoneIds: ids(dto.deliveryZoneIds),
    translations: dto.translations.map(({ locale, title, description }) => ({
      locale,
      title: title.trim(),
      description: description?.trim() || null,
    })),
  };
}

export function configFromRow({
  branches,
  menus,
  categories,
  products,
  deliveryZones,
  ...row
}: Prisma.PromotionGetPayload<{
  select: typeof promotionConfigSelect;
}>): PromotionConfig {
  return {
    internalName: row.internalName,
    scope: row.scope,
    discountType: row.discountType,
    value: row.value,
    priority: row.priority,
    minimumSubtotal: row.minimumSubtotal,
    minimumQuantity: row.minimumQuantity,
    quantityBasis: row.quantityBasis,
    translations: row.translations,
    startsOn: dateOnlyString(row.startsOn),
    endsOn: dateOnlyString(row.endsOn),
    branchIds: branches.map(({ branchId }) => branchId),
    menuIds: menus.map(({ menuId }) => menuId),
    categoryIds: categories.map(({ categoryId }) => categoryId),
    productIds: products.map(({ productId }) => productId),
    deliveryZoneIds: deliveryZones.map(({ deliveryZoneId }) => deliveryZoneId),
  };
}

export function toPromotionCandidate(
  { internalName, translations, ...config }: PromotionConfig,
  id: string,
  status: PromotionStatusName,
  defaultLocale: string,
): PromotionCandidate {
  return {
    promotion: { id, status, ...config },
    label: {
      internalName,
      title:
        translations.find(({ locale }) => locale === defaultLocale)?.title ??
        null,
    },
  };
}

/** CATEGORY / MENU with a fixed amount: the DEC-077 item-scope discount that the write gate controls. */
export function isFixedItemPromotion(
  config: Pick<PromotionConfig, 'scope' | 'discountType'>,
): boolean {
  return (
    (config.scope === 'CATEGORY' || config.scope === 'MENU') &&
    config.discountType === 'FIXED_AMOUNT'
  );
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, index) => id === right[index]);
}

function sameMoney(
  a: Prisma.Decimal | null,
  b: Prisma.Decimal | null,
): boolean {
  if (a === null || b === null) return a === b;
  return a.equals(b);
}

/**
 * True when `after` differs from `before` at most in metadata (internal name, customer titles / descriptions).
 * Compares NORMALIZED values, so a client that re-sends the stored form is not changing anything.
 */
export function changesOnlyMetadata(
  before: PromotionConfig,
  after: PromotionConfig,
): boolean {
  return (
    before.scope === after.scope &&
    before.discountType === after.discountType &&
    before.value.equals(after.value) &&
    before.priority === after.priority &&
    before.startsOn === after.startsOn &&
    before.endsOn === after.endsOn &&
    sameMoney(before.minimumSubtotal, after.minimumSubtotal) &&
    before.minimumQuantity === after.minimumQuantity &&
    before.quantityBasis === after.quantityBasis &&
    sameIds(before.branchIds, after.branchIds) &&
    sameIds(before.menuIds, after.menuIds) &&
    sameIds(before.categoryIds, after.categoryIds) &&
    sameIds(before.productIds, after.productIds) &&
    sameIds(before.deliveryZoneIds, after.deliveryZoneIds)
  );
}

/** A missing or zero CART minimum is the pre-DEC-077 "no minimum" state. The engine keeps evaluating it as such. */
export function hasNoCartMinimum(
  config: Pick<PromotionConfig, 'scope' | 'minimumSubtotal'>,
): boolean {
  return (
    config.scope === 'CART' &&
    (config.minimumSubtotal === null || config.minimumSubtotal.isZero())
  );
}

/**
 * DEC-077 D2.4-D2.5: must the saved result of this write carry a minimum > 0?
 * Always for a new or reactivated CART promotion (`before` null). For a stored LEGACY one (CART, NULL or 0.00) only when
 * the NORMALIZED result differs from the stored one in more than metadata (scope, type, value, minimum, dates, targets,
 * priority); a client that re-sends the stored values is not changing anything, and the client sends no flag. NULL and
 * 0.00 are the same "no minimum" here.
 */
export function requiresPositiveCartMinimum(
  before: PromotionConfig | null,
  after: PromotionConfig,
): boolean {
  if (after.scope !== 'CART') return false;
  if (before === null || !hasNoCartMinimum(before)) return true;
  const unchanged = changesOnlyMetadata(
    { ...before, minimumSubtotal: ZERO },
    { ...after, minimumSubtotal: after.minimumSubtotal ?? ZERO },
  );
  return !unchanged;
}

/**
 * DEC-077 B1 write gate. With writes off, a fixed item configuration is refused unless it is the stored fixed item
 * promotion with metadata-only edits. Evaluation is never gated; this only guards what Staff may save, activate or
 * simulate.
 */
export function fixedItemGateProblem(
  before: PromotionConfig | null,
  after: PromotionConfig,
  writesEnabled: boolean,
): { code: 'FIXED_ITEM_SCOPE_NOT_ENABLED'; field: 'discountType' } | null {
  if (writesEnabled || !isFixedItemPromotion(after)) return null;
  if (
    before !== null &&
    isFixedItemPromotion(before) &&
    changesOnlyMetadata(before, after)
  ) {
    return null;
  }
  return { code: 'FIXED_ITEM_SCOPE_NOT_ENABLED', field: 'discountType' };
}

export const staffPromotionSelect = {
  ...promotionConfigSelect,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  _count: { select: { orderPromotions: true } },
} satisfies Prisma.PromotionSelect;

export type StaffPromotionRow = Prisma.PromotionGetPayload<{
  select: typeof staffPromotionSelect;
}>;

export type StaffPromotion = Omit<
  PromotionConfig,
  'value' | 'minimumSubtotal'
> & {
  id: string;
  /** DEC-077 D2.9: informational. True for a legacy (NULL / 0.00 minimum), non-archived CART promotion. */
  needsMinimumSubtotal: boolean;
  value: string;
  minimumSubtotal: string | null;
  status: PromotionStatusName;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  canDelete: boolean;
};

export function toStaffPromotion(row: StaffPromotionRow): StaffPromotion {
  return {
    ...configFromRow(row),
    id: row.id,
    needsMinimumSubtotal: row.status !== 'ARCHIVED' && hasNoCartMinimum(row),
    value: row.value.toFixed(2),
    minimumSubtotal: row.minimumSubtotal?.toFixed(2) ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    canDelete: row._count.orderPromotions === 0,
  };
}

export function promotionScalarData(config: PromotionConfig) {
  return {
    internalName: config.internalName,
    scope: config.scope,
    discountType: config.discountType,
    value: config.value,
    priority: config.priority,
    startsOn: config.startsOn ? dateOnlyToDate(config.startsOn) : null,
    endsOn: config.endsOn ? dateOnlyToDate(config.endsOn) : null,
    minimumSubtotal: config.minimumSubtotal,
    minimumQuantity: config.minimumQuantity,
    quantityBasis: config.quantityBasis,
  };
}

type TargetField =
  'branchIds' | 'menuIds' | 'categoryIds' | 'productIds' | 'deliveryZoneIds';

function widensSet(
  before: readonly string[],
  after: readonly string[],
): boolean {
  // Empty means unrestricted (for required scopes both sets are nonempty).
  if (before.length === 0) return false;
  if (after.length === 0) return true;
  const allowed = new Set(before);
  return after.some((id) => !allowed.has(id));
}

/** Confirm explicitly before an existing Promotion gains any potentially eligible targets. */
export function widenedTargets(
  before: PromotionConfig,
  after: PromotionConfig,
): (TargetField | 'scope')[] {
  const fields: (TargetField | 'scope')[] = [];
  if (widensSet(before.branchIds, after.branchIds)) fields.push('branchIds');
  if (before.scope !== after.scope) return [...fields, 'scope'];

  if (after.scope === 'CART' || after.scope === 'QUANTITY') {
    // Restrictions are the union of categories and products, not separate filters.
    const previous = new Set([
      ...before.categoryIds.map((id) => `category:${id}`),
      ...before.productIds.map((id) => `product:${id}`),
    ]);
    if (previous.size > 0) {
      if (after.categoryIds.length + after.productIds.length === 0) {
        fields.push('categoryIds', 'productIds');
      } else {
        if (after.categoryIds.some((id) => !previous.has(`category:${id}`)))
          fields.push('categoryIds');
        if (after.productIds.some((id) => !previous.has(`product:${id}`)))
          fields.push('productIds');
      }
    }
  } else {
    for (const field of [
      'menuIds',
      'categoryIds',
      'deliveryZoneIds',
    ] as const) {
      if (widensSet(before[field], after[field])) fields.push(field);
    }
  }
  return fields;
}
