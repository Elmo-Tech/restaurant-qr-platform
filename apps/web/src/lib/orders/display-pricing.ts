import { fromMinorUnits, toMinorUnits, ZERO_MINOR_UNITS } from '../public-menu/money.ts';
import type { OrderDetail, OrderItemView } from './types';

type DisplayPricingInput = Pick<OrderDetail,
  | 'type'
  | 'subtotalAmount'
  | 'discountTotal'
  | 'deliveryFee'
  | 'deliveryFeeOriginal'
  | 'deliveryDiscount'
  | 'promotions'
>;

/** Presentation only: the payable totals and each saving come from the stored snapshots. */
export function orderDisplayPricing(order: DisplayPricingInput) {
  const { deliveryFeeOriginal, deliveryDiscount, promotions = [] } = order;
  const merchandisePromotions = promotions.filter(({ scope }) => scope !== 'DELIVERY');
  const discountTotal = toMinorUnits(order.discountTotal);
  const legacyDiscount = merchandisePromotions.reduce(
    (remaining, { amount }) => remaining - toMinorUnits(amount),
    discountTotal,
  );
  const hasDiscount = discountTotal > ZERO_MINOR_UNITS;
  const hasDeliveryDiscount = order.type === 'DELIVERY' && deliveryFeeOriginal != null &&
    deliveryDiscount != null && deliveryDiscount !== '0.00';

  return {
    hasDiscount,
    grossSubtotal: hasDiscount
      ? fromMinorUnits(toMinorUnits(order.subtotalAmount) + discountTotal)
      : order.subtotalAmount,
    legacyDiscount: fromMinorUnits(legacyDiscount),
    merchandisePromotions,
    deliveryFee: hasDeliveryDiscount ? deliveryFeeOriginal : order.deliveryFee,
    deliveryDiscount: hasDeliveryDiscount
      ? {
          amount: deliveryDiscount,
          title: promotions.find(({ scope }) => scope === 'DELIVERY')?.title,
        }
      : null,
  };
}

/** Stored lineTotal already includes the legacy discount, but not its promotion allocation. */
export function orderItemDisplayPricing(
  item: Pick<OrderItemView, 'lineTotal' | 'discountAmount' | 'promotionDiscount'>,
) {
  const lineTotal = toMinorUnits(item.lineTotal);
  const legacy = toMinorUnits(item.discountAmount);
  const allocated = toMinorUnits(item.promotionDiscount ?? '0.00');
  return {
    grossLineTotal: fromMinorUnits(lineTotal + legacy),
    netLineTotal: fromMinorUnits(lineTotal - allocated),
    hasDiscount: legacy + allocated > ZERO_MINOR_UNITS,
  };
}
