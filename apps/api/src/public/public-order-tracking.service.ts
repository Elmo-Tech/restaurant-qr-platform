import { Injectable } from '@nestjs/common';
import { resolveLocalizedName } from '../common/name-translations';
import { isWellFormedUuid } from '../common/is-uuid';
import { PrismaService } from '../database/prisma.service';
import type { OrderStatus, OrderType } from '../generated/prisma/client';
import { flowFor, samePhone, trackingRef } from './order-tracking';

/** How far back the "find my order by phone" lookup reaches. */
const LOOKUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const LOOKUP_CANDIDATES = 300;
const LOOKUP_RESULTS = 10;

/**
 * What a Guest may see about an order: its progress and a summary. No name, phone,
 * address, notes, items or prices of lines; never an internal id other than the one
 * the caller already holds.
 */
export interface OrderTrackingView {
  /** Short reference to read out ("A1B2C3D4"). */
  ref: string;
  type: OrderType;
  status: OrderStatus;
  createdAt: string;
  /** When the order last changed status. */
  updatedAt: string;
  /** The steps of this order type, in order (REJECTED / CANCELLED are not steps). */
  flow: OrderStatus[];
  /** When each status was reached, oldest first. */
  events: { status: OrderStatus; at: string }[];
  itemCount: number;
  total: string;
  currencyCode: string;
  /** Branch display name (Pickup and Delivery), or the table number for Dine-in. */
  branchName: string | null;
  tableNumber: string | null;
}

export type GetTrackingResult =
  { outcome: 'found'; data: OrderTrackingView } | { outcome: 'notFound' };

const SELECT = {
  id: true,
  type: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  totalAmount: true,
  currencyCode: true,
  customerPhoneSnapshot: true,
  table: { select: { tableNumber: true } },
  branch: {
    select: {
      name: true,
      translations: { select: { locale: true, name: true } },
    },
  },
  items: { select: { quantity: true } },
  statusEvents: {
    orderBy: { transitionedAt: 'asc' },
    select: { newStatus: true, transitionedAt: true },
  },
} as const;

type Row = {
  id: string;
  type: OrderType;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  totalAmount: { toFixed(digits: number): string };
  currencyCode: string;
  table: { tableNumber: string } | null;
  branch: { name: string; translations: { locale: string; name: string }[] };
  items: { quantity: number }[];
  statusEvents: { newStatus: OrderStatus; transitionedAt: Date }[];
};

@Injectable()
export class PublicOrderTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The restaurant a public code belongs to, or null (unknown code, inactive QR or
   * Restaurant). Tracking never reveals anything outside this Restaurant.
   */
  private async restaurantOf(
    publicCode: string,
  ): Promise<{ id: string; defaultLocale: string } | null> {
    const qr = await this.prisma.qrCode.findUnique({
      where: { publicCode },
      select: {
        status: true,
        restaurantId: true,
        restaurant: { select: { status: true, defaultLocale: true } },
      },
    });
    if (!qr || qr.status !== 'ACTIVE' || qr.restaurant.status !== 'ACTIVE')
      return null;
    return { id: qr.restaurantId, defaultLocale: qr.restaurant.defaultLocale };
  }

  /** Tracking of one order the caller holds the id of (returned to them when they placed it). */
  async getTracking(input: {
    publicCode: string;
    orderId: string;
    locale: string | undefined;
  }): Promise<GetTrackingResult> {
    if (!isWellFormedUuid(input.orderId)) return { outcome: 'notFound' };
    const restaurant = await this.restaurantOf(input.publicCode);
    if (!restaurant) return { outcome: 'notFound' };
    const order = await this.prisma.order.findFirst({
      where: { id: input.orderId, restaurantId: restaurant.id },
      select: SELECT,
    });
    if (!order) return { outcome: 'notFound' };
    return {
      outcome: 'found',
      data: this.toView(
        order,
        input.locale ?? restaurant.defaultLocale,
        restaurant.defaultLocale,
      ),
    };
  }

  /**
   * The recent Pickup / Delivery orders placed with this phone number (last 24 hours), for a
   * Guest on another device. Same safe view as above; the order id is NOT returned.
   */
  async lookupByPhone(input: {
    publicCode: string;
    phone: string;
    locale: string | undefined;
  }): Promise<OrderTrackingView[]> {
    const restaurant = await this.restaurantOf(input.publicCode);
    if (!restaurant) return [];
    const candidates = await this.prisma.order.findMany({
      where: {
        restaurantId: restaurant.id,
        type: { in: ['PICKUP', 'DELIVERY'] },
        customerPhoneSnapshot: { not: null },
        createdAt: { gte: new Date(Date.now() - LOOKUP_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
      take: LOOKUP_CANDIDATES,
      select: SELECT,
    });
    const locale = input.locale ?? restaurant.defaultLocale;
    const customerPhones = new Map<string, string | null>();
    for (const row of candidates)
      customerPhones.set(row.id, row.customerPhoneSnapshot);
    return candidates
      .filter((row) =>
        samePhone(customerPhones.get(row.id) ?? null, input.phone),
      )
      .slice(0, LOOKUP_RESULTS)
      .map((row) => this.toView(row, locale, restaurant.defaultLocale));
  }

  private toView(
    row: Row,
    locale: string,
    defaultLocale: string,
  ): OrderTrackingView {
    return {
      ref: trackingRef(row.id),
      type: row.type,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      flow: flowFor(row.type),
      events: row.statusEvents.map((event) => ({
        status: event.newStatus,
        at: event.transitionedAt.toISOString(),
      })),
      itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
      total: row.totalAmount.toFixed(2),
      currencyCode: row.currencyCode,
      branchName:
        row.type === 'DINE_IN'
          ? null
          : resolveLocalizedName({
              requestedLocale: locale,
              defaultLocale,
              translations: row.branch.translations,
              legacyName: row.branch.name,
            }),
      tableNumber: row.table?.tableNumber ?? null,
    };
  }
}
