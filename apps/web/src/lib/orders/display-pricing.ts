import { fromMinorUnits, toMinorUnits } from '../public-menu/money.ts';
import type { OrderDetail } from './types';

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
  const hasDiscount = order.discountTotal !== '0.00';
  const hasDeliveryDiscount = order.type === 'DELIVERY' && deliveryFeeOriginal != null &&
    deliveryDiscount != null && deliveryDiscount !== '0.00';

  return {
    hasDiscount,
    grossSubtotal: hasDiscount
      ? fromMinorUnits(toMinorUnits(order.subtotalAmount) + toMinorUnits(order.discountTotal))
      : order.subtotalAmount,
    merchandisePromotions: promotions.filter(({ scope }) => scope !== 'DELIVERY'),
    deliveryFee: hasDeliveryDiscount ? deliveryFeeOriginal : order.deliveryFee,
    deliveryDiscount: hasDeliveryDiscount
      ? {
          amount: deliveryDiscount,
          title: promotions.find(({ scope }) => scope === 'DELIVERY')?.title,
        }
      : null,
  };
}
