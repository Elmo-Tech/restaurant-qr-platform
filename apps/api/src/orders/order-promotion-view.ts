import type { Prisma, PromotionScope } from '../generated/prisma/client';

/** Historical Staff display data only; never follows the live Promotion reference. */
export interface OrderPromotionView {
  title: string | null;
  scope: PromotionScope;
  amount: string;
}

export const ORDER_PROMOTION_VIEW_SELECT = {
  titleSnapshot: true,
  scope: true,
  amount: true,
} satisfies Prisma.OrderPromotionSelect;

export function toOrderPromotionView(
  row: Prisma.OrderPromotionGetPayload<{
    select: typeof ORDER_PROMOTION_VIEW_SELECT;
  }>,
): OrderPromotionView {
  return {
    title: row.titleSnapshot,
    scope: row.scope,
    amount: row.amount.toFixed(2),
  };
}
