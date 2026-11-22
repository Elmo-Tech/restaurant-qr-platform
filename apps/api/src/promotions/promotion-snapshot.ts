import { Prisma } from '../generated/prisma/client';
import type {
  EngineOrderType,
  EnginePromotion,
  EngineResult,
  PromotionDiscountTypeName,
  PromotionScopeName,
} from './promotion-engine';

/**
 * Unified Promotions -- the historical snapshot model accepted by the Product
 * Owner on 2026-11-21 (UNIFIED_PROMOTIONS_HISTORICAL_SNAPSHOTS.md). Pure: maps
 * one `evaluatePromotions` result to the row shapes B2 persists, so the order
 * transaction only writes what this returns. No Prisma client, no clock.
 *
 *   order_items.discount_amount (+ type/value snapshots)  legacy Product discount ONLY, only when it applied
 *   order_items.line_total        (unit - legacy unit discount + modifiers) x qty   (before new promotions)
 *   order_promotions              one row per applied NEW promotion (CATEGORY / MENU / CART / QUANTITY / DELIVERY)
 *   order_promotion_allocations   the per-line shares of every merchandise promotion (never DELIVERY)
 *   orders.promotion_discount_amount  sum of the merchandise allocations
 *   orders.discount_total_amount      legacy line discounts + promotion_discount_amount
 *   orders.subtotal_amount            sum(line_total) - sum(allocations)   (NET merchandise)
 *   orders.delivery_fee_amount        NET fee = delivery_fee_original_amount - delivery_discount_amount
 *   orders.total_amount               subtotal_amount + delivery_fee_amount
 */

const ZERO = new Prisma.Decimal(0);

export interface PromotionLabel {
  internalName: string;
  /** The default-locale customer title at order time (null if none). */
  title: string | null;
}

export interface OrderPricingSnapshotInput {
  result: EngineResult;
  /** The candidates passed to the engine (for the configuration snapshot). */
  promotions: readonly EnginePromotion[];
  labels: ReadonlyMap<string, PromotionLabel>;
  orderType: EngineOrderType;
}

export interface OrderMoneySnapshot {
  subtotalAmount: Prisma.Decimal;
  discountTotalAmount: Prisma.Decimal;
  promotionDiscountAmount: Prisma.Decimal;
  /** NULL for DINE_IN / PICKUP (and every legacy order). */
  deliveryFeeOriginalAmount: Prisma.Decimal | null;
  deliveryDiscountAmount: Prisma.Decimal;
  deliveryFeeAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

export interface OrderItemMoneySnapshot {
  lineIndex: number;
  lineTotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  discountTypeSnapshot: PromotionDiscountTypeName | null;
  discountValueSnapshot: Prisma.Decimal | null;
}

/** JSON-safe copy of the promotion rule as it was (money as strings). */
export interface PromotionConfigSnapshot {
  scope: PromotionScopeName;
  discountType: PromotionDiscountTypeName;
  value: string;
  priority: number;
  startsOn: string | null;
  endsOn: string | null;
  minimumSubtotal: string | null;
  minimumQuantity: number | null;
  quantityBasis: string | null;
  branchIds: string[];
  menuIds: string[];
  categoryIds: string[];
  productIds: string[];
  deliveryZoneIds: string[];
}

export interface OrderPromotionRowSnapshot {
  promotionId: string;
  scope: PromotionScopeName;
  discountType: PromotionDiscountTypeName;
  value: Prisma.Decimal;
  amount: Prisma.Decimal;
  internalNameSnapshot: string;
  titleSnapshot: string | null;
  configSnapshot: PromotionConfigSnapshot;
  /** order_promotion_allocations rows (by engine line index); empty for DELIVERY. */
  allocations: { lineIndex: number; amount: Prisma.Decimal }[];
}

export interface OrderPricingSnapshot {
  order: OrderMoneySnapshot;
  items: OrderItemMoneySnapshot[];
  promotions: OrderPromotionRowSnapshot[];
}

function configOf(promotion: EnginePromotion): PromotionConfigSnapshot {
  return {
    scope: promotion.scope,
    discountType: promotion.discountType,
    value: promotion.value.toFixed(2),
    priority: promotion.priority,
    startsOn: promotion.startsOn,
    endsOn: promotion.endsOn,
    minimumSubtotal: promotion.minimumSubtotal
      ? promotion.minimumSubtotal.toFixed(2)
      : null,
    minimumQuantity: promotion.minimumQuantity,
    quantityBasis: promotion.quantityBasis,
    branchIds: [...promotion.branchIds],
    menuIds: [...promotion.menuIds],
    categoryIds: [...promotion.categoryIds],
    productIds: [...promotion.productIds],
    deliveryZoneIds: [...promotion.deliveryZoneIds],
  };
}

export function buildOrderPricingSnapshot(
  input: OrderPricingSnapshotInput,
): OrderPricingSnapshot {
  const { result, labels, orderType } = input;
  const promotionById = new Map(input.promotions.map((p) => [p.id, p]));

  const items: OrderItemMoneySnapshot[] = result.lines.map((line) => {
    const legacy =
      line.itemWinner?.source === 'PRODUCT_DISCOUNT' &&
      line.legacyLineDiscount.greaterThan(ZERO)
        ? line.itemWinner
        : null;
    return {
      lineIndex: line.index,
      lineTotal: line.lineTotal,
      discountAmount: legacy ? line.legacyLineDiscount : ZERO,
      discountTypeSnapshot: legacy ? legacy.discountType : null,
      discountValueSnapshot: legacy ? legacy.value : null,
    };
  });

  const promotions: OrderPromotionRowSnapshot[] = result.applied.map(
    (applied) => {
      const promotion = promotionById.get(applied.promotionId);
      const label = labels.get(applied.promotionId);
      if (!promotion || !label) {
        throw new Error(
          `buildOrderPricingSnapshot: missing promotion or label ${applied.promotionId}`,
        );
      }
      return {
        promotionId: applied.promotionId,
        scope: applied.scope,
        discountType: applied.discountType,
        value: applied.value,
        amount: applied.amount,
        internalNameSnapshot: label.internalName,
        titleSnapshot: label.title,
        configSnapshot: configOf(promotion),
        allocations: applied.allocations.map((allocation) => ({
          lineIndex: allocation.lineIndex,
          amount: allocation.amount,
        })),
      };
    },
  );

  const isDelivery = orderType === 'DELIVERY';
  const deliveryDiscountAmount = result.deliveryDiscount?.amount ?? ZERO;
  return {
    order: {
      subtotalAmount: result.merchandisePayable,
      discountTotalAmount: result.merchandiseDiscountTotal,
      promotionDiscountAmount: result.promotionMerchandiseDiscountTotal,
      deliveryFeeOriginalAmount: isDelivery ? result.deliveryFeeOriginal : null,
      deliveryDiscountAmount,
      deliveryFeeAmount: result.deliveryFeePayable,
      totalAmount: result.merchandisePayable.plus(result.deliveryFeePayable),
    },
    items,
    promotions,
  };
}

/**
 * Every reconciliation rule of the snapshot model, including the cross-row
 * ones the database cannot CHECK. Returns the broken rules (empty = valid). B2
 * calls it before persisting; the unit tests call it on every scenario.
 */
export function checkOrderPricingSnapshot(
  snapshot: OrderPricingSnapshot,
): string[] {
  const problems: string[] = [];
  const { order, items, promotions } = snapshot;
  const sum = (values: Prisma.Decimal[]) =>
    values.reduce((acc, value) => acc.plus(value), ZERO);

  const merchandise = promotions.filter((p) => p.scope !== 'DELIVERY');
  const delivery = promotions.filter((p) => p.scope === 'DELIVERY');
  const allocations = merchandise.flatMap((p) => p.allocations);
  const lineTotals = sum(items.map((item) => item.lineTotal));
  const legacy = sum(items.map((item) => item.discountAmount));
  const allocated = sum(allocations.map((a) => a.amount));

  if (
    !order.subtotalAmount
      .plus(order.deliveryFeeAmount)
      .equals(order.totalAmount)
  ) {
    problems.push('subtotal + delivery fee != total');
  }
  if (!lineTotals.minus(allocated).equals(order.subtotalAmount)) {
    problems.push('sum(line_total) - sum(allocations) != subtotal');
  }
  if (!allocated.equals(order.promotionDiscountAmount)) {
    problems.push('sum(allocations) != promotion_discount_amount');
  }
  if (
    !legacy
      .plus(order.promotionDiscountAmount)
      .equals(order.discountTotalAmount)
  ) {
    problems.push(
      'legacy line discounts + promotion discount != discount_total',
    );
  }
  for (const promotion of merchandise) {
    if (
      !sum(promotion.allocations.map((a) => a.amount)).equals(promotion.amount)
    ) {
      problems.push(`allocations of ${promotion.promotionId} != its amount`);
    }
  }
  for (const promotion of delivery) {
    if (promotion.allocations.length > 0) {
      problems.push('a delivery promotion has line allocations');
    }
  }
  const deliveryAmount = sum(delivery.map((p) => p.amount));
  if (delivery.length > 1) problems.push('more than one delivery promotion');
  if (!deliveryAmount.equals(order.deliveryDiscountAmount)) {
    problems.push('delivery promotion amount != delivery_discount_amount');
  }
  if (order.deliveryFeeOriginalAmount === null) {
    if (!order.deliveryDiscountAmount.isZero()) {
      problems.push('delivery discount without an original fee');
    }
  } else if (
    !order.deliveryFeeOriginalAmount
      .minus(order.deliveryDiscountAmount)
      .equals(order.deliveryFeeAmount)
  ) {
    problems.push('original fee - delivery discount != delivery fee');
  }
  const lineIndexes = new Set(items.map((item) => item.lineIndex));
  for (const allocation of allocations) {
    if (!allocation.amount.greaterThan(ZERO)) {
      problems.push('a non-positive allocation');
    }
    if (!lineIndexes.has(allocation.lineIndex)) {
      problems.push('an allocation to an unknown line');
    }
  }
  for (const promotion of promotions) {
    if (!promotion.amount.greaterThan(ZERO)) {
      problems.push(`promotion ${promotion.promotionId} has no amount`);
    }
  }
  const money = [
    order.subtotalAmount,
    order.discountTotalAmount,
    order.promotionDiscountAmount,
    order.deliveryDiscountAmount,
    order.deliveryFeeAmount,
    order.totalAmount,
    ...items.flatMap((item) => [item.lineTotal, item.discountAmount]),
  ];
  if (money.some((value) => value.isNegative())) {
    problems.push('a negative amount');
  }
  for (const item of items) {
    const hasType = item.discountTypeSnapshot !== null;
    if (hasType !== item.discountAmount.greaterThan(ZERO)) {
      problems.push(`line ${item.lineIndex}: legacy snapshot without amount`);
    }
  }
  return problems;
}
