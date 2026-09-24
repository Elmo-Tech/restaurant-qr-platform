export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'REJECTED'
  | 'CANCELLED';

/** Mirrors the Backend's `OrderListItem` exactly (FT-5). Never full item snapshots -- Detail alone carries those. */
export type OrderType = 'DINE_IN' | 'PICKUP';

export interface OrderListItem {
  id: string;
  createdAt: string;
  status: OrderStatus;
  type: OrderType;
  branch: { id: string; name: string };
  /** Null for a PICKUP Order. */
  table: { id: string; tableNumber: string } | null;
  /** PICKUP only (null for DINE_IN). */
  customer: { name: string; phone: string } | null;
  currencyCode: string;
  totalAmount: string;
  itemCount: number;
}

/** FT-6A, mirrors the Backend's `OrderItemModifierView` exactly (ORDER_LIFECYCLE_SPEC.md #41) -- always the value at Order submission time, never re-derived from the live Modifier configuration. */
export interface OrderItemModifierView {
  groupName: string;
  optionName: string;
  priceAdjustment: string;
}

export interface OrderItemView {
  productId: string;
  productNameSnapshot: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  modifiers: OrderItemModifierView[];
}

/** Mirrors the Backend's `OrderDetail` exactly (FT-5). */
export interface OrderDetail {
  id: string;
  createdAt: string;
  status: OrderStatus;
  type: OrderType;
  restaurant: { id: string; name: string };
  branch: { id: string; name: string };
  /** Null for a PICKUP Order. */
  table: { id: string; tableNumber: string } | null;
  /** PICKUP only (null for DINE_IN). */
  customer: { name: string; phone: string; notes: string | null } | null;
  currencyCode: string;
  totalAmount: string;
  items: OrderItemView[];
}
