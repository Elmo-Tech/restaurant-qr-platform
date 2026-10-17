import type { OrderType } from '../orders/types';

/** Mirrors `apps/api/src/orders/kitchen.service.ts`'s `KitchenTicket` (Kitchen View V1). No prices, no phone numbers. */
export type KitchenStatus = 'ACCEPTED' | 'PREPARING' | 'READY';

export interface KitchenTicketItem {
  name: string;
  /** The chosen size (DEC-041), or null for a product without sizes. */
  variantName: string | null;
  quantity: number;
  modifiers: { groupName: string; optionName: string }[];
}

export interface KitchenTicket {
  id: string;
  status: KitchenStatus;
  type: OrderType;
  /** The Dine-In round (CLAUDE.md #24), or null. */
  roundNumber: number | null;
  createdAt: string;
  /** When the order entered its current status: the ticket's own timer. */
  statusSince: string;
  branch: { id: string; name: string };
  table: { id: string; tableNumber: string } | null;
  customerName: string | null;
  notes: string | null;
  items: KitchenTicketItem[];
}
