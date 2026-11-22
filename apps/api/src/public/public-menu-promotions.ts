import { type Prisma } from '../generated/prisma/client';
import { dateOnlyString } from '../menu/product-discount';
import {
  evaluatePromotions,
  type EngineContext,
  type EngineLineResult,
  type EngineProductLine,
  type EnginePromotion,
} from '../promotions/promotion-engine';

/** A menu-only preview, not an applied discount or a cart price. */
export type PublicItemPromotion = {
  scope: 'PRODUCT' | 'CATEGORY' | 'MENU';
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: string;
  amountOff: string;
  /** Only the existing Product discount uses a qualified price preview. */
  previewPrice: string | null;
};

export async function loadMenuItemPromotions(
  db: Pick<Prisma.TransactionClient, 'promotion'>,
  restaurantId: string,
  menuId: string,
  categoryIds: string[],
): Promise<EnginePromotion[]> {
  const rows = await db.promotion.findMany({
    where: {
      restaurantId,
      status: 'ACTIVE',
      OR: [
        { scope: 'MENU', menus: { some: { menuId } } },
        {
          scope: 'CATEGORY',
          categories: { some: { categoryId: { in: categoryIds } } },
        },
      ],
    },
    select: {
      id: true,
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
      branches: { select: { branchId: true } },
      menus: { select: { menuId: true } },
      categories: { select: { categoryId: true } },
    },
  });
  return rows.map(({ branches, menus, categories, ...row }) => ({
    ...row,
    startsOn: dateOnlyString(row.startsOn),
    endsOn: dateOnlyString(row.endsOn),
    branchIds: branches.map(({ branchId }) => branchId),
    menuIds: menus.map(({ menuId }) => menuId),
    categoryIds: categories.map(({ categoryId }) => categoryId),
    productIds: [],
    deliveryZoneIds: [],
  }));
}

/** Evaluate only item scope. Before Branch selection, advertise only a winner that agrees in every Branch. */
export function resolveMenuItemPromotions(
  lines: readonly EngineProductLine[],
  promotions: readonly EnginePromotion[],
  branches: readonly Pick<EngineContext, 'today' | 'branchId'>[],
): Map<number, PublicItemPromotion> {
  const itemPromotions = promotions.filter(
    ({ scope }) => scope === 'CATEGORY' || scope === 'MENU',
  );
  const consensus = new Map<number, EngineLineResult>();
  for (const [branchIndex, branch] of branches.entries()) {
    const { lines: results } = evaluatePromotions({
      lines,
      promotions: itemPromotions,
      // Item eligibility is independent of fulfillment and delivery fees.
      context: {
        ...branch,
        orderType: 'DINE_IN',
        deliveryZoneId: null,
        deliveryFee: null,
      },
    });
    for (const result of results) {
      if (branchIndex === 0 && result.itemWinner) {
        consensus.set(result.index, result);
      } else if (branchIndex > 0) {
        const previous = consensus.get(result.index);
        if (
          previous &&
          (result.itemWinner?.scope !== previous.itemWinner?.scope ||
            result.itemWinner?.promotionId !== previous.itemWinner?.promotionId)
        ) {
          consensus.delete(result.index);
        }
      }
    }
    if (consensus.size === 0) break;
  }
  const labels = new Map<number, PublicItemPromotion>();
  for (const line of lines) {
    const result = consensus.get(line.index);
    if (!result?.itemWinner) continue;
    const { scope, discountType, value } = result.itemWinner;
    labels.set(line.index, {
      scope,
      type: discountType,
      value: value.toFixed(2),
      amountOff: result.legacyUnitDiscount
        .plus(result.promotionUnitDiscount)
        .toFixed(2),
      previewPrice:
        scope === 'PRODUCT'
          ? line.unitPrice.minus(result.legacyUnitDiscount).toFixed(2)
          : null,
    });
  }
  return labels;
}
