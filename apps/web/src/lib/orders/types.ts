export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'REJECTED'
  | 'CANCELLED';

/** Mirrors the Backend's `OrderListItem` exactly (FT-5). Never full item snapshots -- Detail alone carries those. */
export interface OrderListItem {
  id: string;
  createdAt: string;
  status: OrderStatus;
  branch: { id: string; name: string };
  table: { id: string; tableNumber: string };
  currencyCode: string;
  totalAmount: string;
  itemCount: number;
}

export interface OrderItemView {
  productId: string;
  productNameSnapshot: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

/** Mirrors the Backend's `OrderDetail` exactly (FT-5). */
export interface OrderDetail {
  id: string;
  createdAt: string;
  status: OrderStatus;
  restaurant: { id: string; name: string };
  branch: { id: string; name: string };
  table: { id: string; tableNumber: string };
  currencyCode: string;
  totalAmount: string;
  items: OrderItemView[];
}
