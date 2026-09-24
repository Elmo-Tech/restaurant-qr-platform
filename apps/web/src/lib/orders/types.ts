export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'SERVED'
  | 'REJECTED'
  | 'CANCELLED';

/** Mirrors the Backend's `OrderListItem` exactly (FT-5). Never full item snapshots -- Detail alone carries those. */
export type OrderType = 'DINE_IN' | 'PICKUP' | 'DELIVERY';

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
  /** FT-8: DELIVERY only -- the zone name snapshot. */
  deliveryZoneName: string | null;
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
  /** FT-8: DELIVERY only -- snapshots as of submission time. */
  delivery: {
    zoneName: string;
    address: string;
    building: string | null;
    floor: string | null;
    apartment: string | null;
    landmark: string | null;
  } | null;
  /** FT-8: exact money breakdown -- subtotalAmount + deliveryFee = totalAmount. */
  subtotalAmount: string;
  deliveryFee: string;
  currencyCode: string;
  totalAmount: string;
  items: OrderItemView[];
}
