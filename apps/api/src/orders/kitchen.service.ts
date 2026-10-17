import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { OrderStatus, OrderType } from '../generated/prisma/client';
import { resolveOrderBranchIdFilter } from './order-branch-scope';
import type { AuthorizedOrderScope } from './orders.service';

/** The only states a Kitchen Ticket can be in: an accepted order is NEW (`ACCEPTED`), being worked on (`PREPARING`), or done and waiting for service (`READY`). */
export const KITCHEN_STATUSES = [
  'ACCEPTED',
  'PREPARING',
  'READY',
] as const satisfies readonly OrderStatus[];
export type KitchenTicketStatus = (typeof KITCHEN_STATUSES)[number];

export interface KitchenTicketItem {
  /** The product name snapshot taken at order time. */
  name: string;
  /** The chosen size (DEC-041), or null for a product without sizes. */
  variantName: string | null;
  quantity: number;
  /** Selected options, in the order the Guest saw them. */
  modifiers: { groupName: string; optionName: string }[];
}

/**
 * Kitchen View V1 (VERSION_ROADMAP "V1 Kitchen View", STAFF_DASHBOARD_UX_SPEC #99-110):
 * what the kitchen needs to prepare an order and nothing else -- no prices, no
 * customer phone, no product marketing text.
 */
export interface KitchenTicket {
  id: string;
  status: KitchenTicketStatus;
  type: OrderType;
  /** The Dine-In round (CLAUDE.md #24), or null. */
  roundNumber: number | null;
  createdAt: Date;
  /** When the order entered its current status (the ticket's own timer), never earlier than `createdAt`. */
  statusSince: Date;
  branch: { id: string; name: string };
  /** Null for a PICKUP / DELIVERY order. */
  table: { id: string; tableNumber: string } | null;
  /** PICKUP / DELIVERY: the name to call out. Never the phone number. */
  customerName: string | null;
  /** The Guest's order note, if any -- shown prominently. */
  notes: string | null;
  items: KitchenTicketItem[];
}

export interface ListKitchenTicketsFilters {
  branchId?: string;
}

@Injectable()
export class KitchenService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Accepted orders still in the kitchen's hands, oldest first so the order
   * that has waited longest is first. Branch scope is resolved with the same
   * helper as the Orders list (a foreign `branchId` can only narrow, never
   * widen). A `PENDING` order is not a ticket yet (UX spec #109), and a
   * served / rejected / cancelled one is gone.
   */
  async listTickets(
    scope: AuthorizedOrderScope,
    filters: ListKitchenTicketsFilters,
  ): Promise<KitchenTicket[]> {
    const branchIdFilter = await resolveOrderBranchIdFilter(
      this.prisma,
      scope,
      filters.branchId,
    );

    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId: scope.restaurantId,
        status: { in: [...KITCHEN_STATUSES] },
        ...(branchIdFilter ? { branchId: { in: branchIdFilter } } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        type: true,
        roundNumber: true,
        createdAt: true,
        customerNameSnapshot: true,
        customerNotesSnapshot: true,
        branch: { select: { id: true, name: true } },
        table: { select: { id: true, tableNumber: true } },
        // The newest event is the transition into the current status.
        statusEvents: {
          orderBy: { transitionedAt: 'desc' },
          take: 1,
          select: { newStatus: true, transitionedAt: true },
        },
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            productNameSnapshot: true,
            variantNameSnapshot: true,
            quantity: true,
            modifiers: {
              orderBy: { displayOrder: 'asc' },
              select: {
                modifierGroupNameSnapshot: true,
                modifierOptionNameSnapshot: true,
              },
            },
          },
        },
      },
    });

    return orders.map((order) => {
      const latest = order.statusEvents[0];
      const statusSince =
        latest && latest.newStatus === order.status
          ? latest.transitionedAt
          : order.createdAt;
      return {
        id: order.id,
        status: order.status as KitchenTicketStatus,
        type: order.type,
        roundNumber: order.roundNumber,
        createdAt: order.createdAt,
        statusSince,
        branch: order.branch,
        table: order.table,
        customerName:
          order.type !== 'DINE_IN' ? order.customerNameSnapshot : null,
        notes: order.customerNotesSnapshot,
        items: order.items.map((item) => ({
          name: item.productNameSnapshot,
          variantName: item.variantNameSnapshot,
          quantity: item.quantity,
          modifiers: item.modifiers.map((modifier) => ({
            groupName: modifier.modifierGroupNameSnapshot,
            optionName: modifier.modifierOptionNameSnapshot,
          })),
        })),
      };
    });
  }
}
