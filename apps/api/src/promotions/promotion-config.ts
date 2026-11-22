import { Prisma } from '../generated/prisma/client';
import { dateOnlyString, dateOnlyToDate } from '../menu/product-discount';
import type { PromotionDraftDto } from './promotion.dto';
import type { EnginePromotion, PromotionStatusName } from './promotion-engine';

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
