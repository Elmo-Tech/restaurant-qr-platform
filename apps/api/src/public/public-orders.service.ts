import { Injectable } from '@nestjs/common';
import {
  validateGuestOrderFields,
  type GuestFieldError,
} from './guest-order-fields';
import { resolveLocalizedName } from '../common/name-translations';
import {
  dateOnlyString,
  localDateIn,
  resolveActiveDiscount,
} from '../menu/product-discount';
import { isClosedNow } from '../branches/branch-hours';
import { PrismaService } from '../database/prisma.service';
import { effectiveOrdering } from '../entitlements/effective-ordering';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { Prisma } from '../generated/prisma/client';
import type { OrderStatus, OrderType } from '../generated/prisma/client';
import {
  OFFER_CHOICES_SELECT,
  offerChoiceModifiers,
  offerLineKey,
  resolveOfferChoices,
  type OfferChoiceInput,
  type OrderableOffer,
  type StoredOfferChoice,
} from '../offers/offer-order';
import { itemName, itemOrderable, optionItemSelect } from '../offers/offer-items';
import { offerAvailability } from '../offers/offer-rules';
import {
  isClosedSessionTriggerViolation,
  resolveDineInSessionSlot,
  TableNotOrderableError,
  TableOrderingUnavailableError,
  type DineInSessionSlot,
} from '../table-sessions/table-session-ordering';

export interface CreateGuestOrderItemInput {
  /** A product line: the Product's identity. Exactly one of `productId` / `offerId` is set (DEC-069). */
  productId?: string;
  /** An offer line (DEC-069): the Offer's identity; the choices are in `offerChoices`. */
  offerId?: string;
  /** Offer line only: one entry per chosen option (slot, option, quantity) -- identities, never a price or a name. */
  offerChoices?: OfferChoiceInput[];
  quantity: number;
  /** Option IDENTITY only -- never a price/name (CRITICAL MONEY RULE). Omitted/undefined is normalized to no selections. */
  modifierOptionIds?: string[];
  /** Chosen size IDENTITY only (DEC-041); required when the Product has active sizes. */
  variantId?: string;
}

export interface CreateGuestOrderInput {
  publicCode: string;
  clientRequestId: string;
  /** The Guest's resolved menu content language (display only): used to localize Branch and zone names in the confirmation. Never authority. */
  locale?: string;
  /**
   * The total payable the Guest was shown (decimal string). A staleness check
   * only: when it differs from the Backend's own total (a discount started,
   * ended or changed while the cart was open) NOTHING is created and the
   * current total is returned (PROMOTIONS_SPEC.md #46-48). Never used as a price.
   */
  expectedTotal?: string;
  items: CreateGuestOrderItemInput[];
  /** FT-7, GENERIC QR (Pickup) only: the Guest's chosen Pickup Branch. Never authority -- always re-validated against the Restaurant's ACTIVE Branches. Ignored entirely for a TABLE QR. */
  branchId?: string;
  /** FT-7, GENERIC QR (Pickup) only -- required there, ignored for a TABLE QR. Already DTO-trimmed. */
  customerName?: string;
  customerPhone?: string;
  customerNotes?: string;
  /** FT-8, GENERIC QR only: the ONLY thing the Guest chooses about the Order type -- PICKUP (default) or DELIVERY. Ignored for a TABLE QR. */
  fulfillment?: 'PICKUP' | 'DELIVERY';
  /** FT-8, DELIVERY only: identity of the chosen zone -- never a fee/minimum/total. */
  deliveryZoneId?: string;
  deliveryAddress?: string;
  deliveryBuilding?: string;
  deliveryFloor?: string;
  deliveryApartment?: string;
  deliveryLandmark?: string;
  /**
   * DEC-042: 'WHATSAPP' prices and validates the order exactly like a real one but never stores
   * it (with `dryRun`): the Restaurant takes it on WhatsApp instead. GENERIC QR only.
   */
  channel?: 'APP' | 'WHATSAPP';
  /** Validate and price everything, then roll back: nothing is created. */
  dryRun?: boolean;
}

/** One slot of an Offer line in the WhatsApp quote: `included` marks the free gift items. */
export interface QuoteOfferSlot {
  title: string;
  included: boolean;
  choices: { name: string; quantity: number; priceAdjustment: string }[];
}

/** The authoritative priced order of a dry run: what the WhatsApp message is built from. */
export interface OrderQuote {
  restaurantId: string;
  branchId: string;
  restaurantName: string;
  /** The Restaurant's WhatsApp number the message goes to (international, as stored). */
  whatsappNumber: string;
  defaultLocale: string;
  currencyCode: string;
  orderType: OrderType;
  branchName: string;
  deliveryZoneName: string | null;
  items: {
    /** An Offer line (DEC-069) is listed first in the WhatsApp message under its own "Offers" group. */
    kind: 'PRODUCT' | 'OFFER';
    /** Offer lines only: every slot with what the Guest chose (or what is included), in the Restaurant's default language. */
    offerSlots: QuoteOfferSlot[] | null;
    name: string;
    /** The Category the product sits in (the Restaurant's default language), so equal names in two Categories stay apart. */
    categoryName: string;
    /** The Category's position in the menu: the order the message groups by. */
    categoryOrder: number;
    variantName: string | null;
    quantity: number;
    /** The chosen extras with their group and their own price ("0.00" when free), in menu order. */
    modifiers: {
      groupName: string;
      optionName: string;
      priceAdjustment: string;
    }[];
    unitPrice: string;
    discountAmount: string;
    lineTotal: string;
  }[];
  subtotal: string;
  discountTotal: string;
  deliveryFee: string;
  total: string;
  customerName: string | null;
  customerPhone: string | null;
  customerNotes: string | null;
  deliveryAddress: string | null;
  deliveryBuilding: string | null;
  deliveryFloor: string | null;
  deliveryApartment: string | null;
  deliveryLandmark: string | null;
}

export interface GuestOrderItemModifierView {
  groupName: string;
  optionName: string;
  priceAdjustment: string;
}

export interface GuestOrderItemView {
  /** Null for an Offer line (DEC-069). */
  productId: string | null;
  /** Set for an Offer line; its choices are listed in `modifiers`. */
  offerId: string | null;
  name: string;
  /** The chosen size (DEC-041), or null for a product without sizes. */
  variantName: string | null;
  quantity: number;
  /** The price of one unit BEFORE any product discount (the chosen size's price when it has sizes). */
  unitPrice: string;
  /** Product Discounts V1: the total discount taken off this line ("0.00" when none). `lineTotal` is already net of it. */
  discountAmount: string;
  lineTotal: string;
  modifiers: GuestOrderItemModifierView[];
}

/** Safe Guest-facing Order confirmation shape (Section 22) -- never restaurantId/branchId/tableId/qrCodeId, only what a confirmation screen needs to render. */
export interface GuestOrderView {
  id: string;
  status: OrderStatus;
  currencyCode: string;
  total: string;
  createdAt: string;
  /** FT-7: DINE_IN or PICKUP -- derived from the QR type server-side, never client-chosen. */
  type: OrderType;
  /** Null for a PICKUP Order. */
  table: { number: string } | null;
  /** FT-7: only the safe public Branch display name, PICKUP only (null otherwise). */
  pickupBranch: { name: string } | null;
  /** FT-8: DELIVERY only -- Branch and zone display names (null otherwise). */
  delivery: { branchName: string; zoneName: string } | null;
  /** FT-8: exact money breakdown -- subtotal + deliveryFee = total. deliveryFee is 0.00 for DINE_IN/PICKUP. `subtotal` is already net of product discounts. */
  subtotal: string;
  deliveryFee: string;
  /** Product Discounts V1: sum of the items' discounts ("0.00" when none). */
  discountTotal: string;
  items: GuestOrderItemView[];
}

export type CreateGuestOrderResult =
  | { outcome: 'created'; data: GuestOrderView }
  /** DEC-042 dry run: everything validated and priced, nothing stored. */
  | { outcome: 'quoted'; quote: OrderQuote }
  /** DEC-042: WhatsApp ordering is off, or the Restaurant has no WhatsApp number. */
  | { outcome: 'whatsappUnavailable' }
  /** DEC-042: WhatsApp ordering is on, so the app takes no Pickup / Delivery order (they go to WhatsApp). */
  | { outcome: 'whatsappOnly' }
  | { outcome: 'qrNotFound' }
  | { outcome: 'itemsUnavailable' }
  | { outcome: 'duplicateItems' }
  /** FT-7: GENERIC QR checkout without a non-empty customer name AND phone. */
  | { outcome: 'customerDetailsRequired' }
  /** A provided checkout field is not acceptable (invalid phone, too short/long, ...): one stable code per field, nothing was created. */
  | { outcome: 'invalidFields'; errors: GuestFieldError[] }
  /** FT-7: GENERIC QR, more than one ACTIVE Branch, and no branchId supplied. */
  | { outcome: 'branchRequired' }
  /** DEC-042: the Branch is closed right now (opening hours or manual closure); Pickup and Delivery only. */
  | { outcome: 'branchClosed' }
  /** FT-7: supplied branchId is unknown, foreign, or INACTIVE -- deliberately one indistinguishable outcome. */
  | { outcome: 'branchInvalid' }
  /** FT-7: GENERIC QR whose Restaurant has zero ACTIVE Branches. */
  | { outcome: 'pickupUnavailable' }
  /** FT-8: DELIVERY without a non-empty address. */
  | { outcome: 'deliveryDetailsRequired' }
  /** FT-8: GENERIC QR whose Restaurant has no ACTIVE Branch with an ACTIVE Delivery zone. */
  | { outcome: 'deliveryUnavailable' }
  /** FT-8: zone missing, unknown, foreign, INACTIVE, or not in the selected Branch -- one indistinguishable outcome. */
  | { outcome: 'deliveryZoneInvalid' }
  /** FT-8: items subtotal is below the zone's minimum order. Values come from the Backend's own zone row. */
  | { outcome: 'minimumOrderNotMet'; zoneName: string; minimumOrder: string }
  /** Product Discounts V1: the displayed total is stale; `total` is the Backend's current payable total. Nothing was created. */
  | {
      outcome: 'priceChanged';
      /** The CURRENT authoritative amounts (API_CONVENTIONS.md #75 `details.pricing`). */
      pricing: {
        subtotal: string;
        discountTotal: string;
        total: string;
        currencyCode: string;
      };
    }
  /** DEC-069: an Offer in the order is missing, switched off, outside its dates or weekdays, or the feature is not allowed. Nothing was created. */
  | { outcome: 'offerUnavailable'; offerIds: string[] }
  /** DEC-069: an Offer's slots or options no longer match what the Guest chose (or the choices are not complete). Nothing was created. */
  | { outcome: 'offerChanged'; offerIds: string[] }
  /** Table Sessions: a TABLE QR whose table is locked by staff (no OPEN session and a staff open is required). Never produced for Pickup/Delivery. */
  | { outcome: 'tableOrderingUnavailable' }
  /** DEC-038: the Restaurant switched Table ordering off (view-only Table channel). */
  | { outcome: 'tableOrderingDisabled' };

interface OrderViewRow {
  id: string;
  status: OrderStatus;
  currencyCode: string;
  totalAmount: Prisma.Decimal;
  createdAt: Date;
  type: OrderType;
  subtotalAmount: Prisma.Decimal;
  deliveryFeeAmount: Prisma.Decimal;
  discountTotalAmount?: Prisma.Decimal;
  deliveryZoneNameSnapshot: string | null;
  table: { tableNumber: string } | null;
  branch: { name: string; translations?: { locale: string; name: string }[] };
  restaurant?: { defaultLocale: string };
  deliveryZone?: { translations: { locale: string; name: string }[] } | null;
  items: {
    productId: string | null;
    offerId?: string | null;
    /** DEC-069: the choices of an Offer line, projected into `modifiers`. */
    offerChoices?: StoredOfferChoice[];
    productNameSnapshot: string;
    unitPrice: Prisma.Decimal;
    quantity: number;
    lineTotal: Prisma.Decimal;
    discountAmount?: Prisma.Decimal;
    variantNameSnapshot?: string | null;
    modifiers: {
      modifierGroupNameSnapshot: string;
      modifierOptionNameSnapshot: string;
      priceAdjustmentSnapshot: Prisma.Decimal;
    }[];
  }[];
}

const ORDER_VIEW_SELECT = {
  id: true,
  status: true,
  currencyCode: true,
  totalAmount: true,
  createdAt: true,
  type: true,
  subtotalAmount: true,
  deliveryFeeAmount: true,
  discountTotalAmount: true,
  deliveryZoneNameSnapshot: true,
  table: { select: { tableNumber: true } },
  branch: {
    select: { name: true, translations: { select: { locale: true, name: true } } },
  },
  restaurant: { select: { defaultLocale: true } },
  deliveryZone: {
    select: { translations: { select: { locale: true, name: true } } },
  },
  items: {
    select: {
      productId: true,
      offerId: true,
      ...OFFER_CHOICES_SELECT,
      productNameSnapshot: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
      discountAmount: true,
      variantNameSnapshot: true,
      modifiers: {
        select: {
          modifierGroupNameSnapshot: true,
          modifierOptionNameSnapshot: true,
          priceAdjustmentSnapshot: true,
        },
        orderBy: { displayOrder: 'asc' },
      },
    },
  },
} satisfies Prisma.OrderSelect;

function toGuestOrderView(order: OrderViewRow, locale?: string): GuestOrderView {
  const defaultLocale = order.restaurant?.defaultLocale ?? 'en';
  const requestedLocale = locale ?? defaultLocale;
  // Display names follow the Guest's content language (requested -> default ->
  // legacy name). The zone falls back to the order's own historical snapshot,
  // never to a live rename.
  const branchName = resolveLocalizedName({
    requestedLocale,
    defaultLocale,
    translations: order.branch.translations ?? [],
    legacyName: order.branch.name,
  });
  const zoneName = (snapshot: string): string =>
    resolveLocalizedName({
      requestedLocale,
      defaultLocale,
      translations: order.deliveryZone?.translations ?? [],
      legacyName: snapshot,
    });
  return {
    id: order.id,
    status: order.status,
    currencyCode: order.currencyCode,
    // Exact decimal string, never Number/parseFloat (Section 8) --
    // Prisma.Decimal's own `toFixed` matches the API-wide 2-fractional-
    // digit money contract.
    total: order.totalAmount.toFixed(2),
    createdAt: order.createdAt.toISOString(),
    type: order.type,
    table: order.table ? { number: order.table.tableNumber } : null,
    pickupBranch: order.type === 'PICKUP' ? { name: branchName } : null,
    delivery:
      order.type === 'DELIVERY' && order.deliveryZoneNameSnapshot !== null
        ? { branchName, zoneName: zoneName(order.deliveryZoneNameSnapshot) }
        : null,
    subtotal: order.subtotalAmount.toFixed(2),
    deliveryFee: order.deliveryFeeAmount.toFixed(2),
    discountTotal: (order.discountTotalAmount ?? new Prisma.Decimal(0)).toFixed(2),
    items: order.items.map((item) => ({
      productId: item.productId,
      offerId: item.offerId ?? null,
      name: item.productNameSnapshot,
      variantName: item.variantNameSnapshot ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      discountAmount: (item.discountAmount ?? new Prisma.Decimal(0)).toFixed(2),
      lineTotal: item.lineTotal.toFixed(2),
      modifiers: [
        ...item.modifiers.map((modifier) => ({
          groupName: modifier.modifierGroupNameSnapshot,
          optionName: modifier.modifierOptionNameSnapshot,
          priceAdjustment: modifier.priceAdjustmentSnapshot.toFixed(2),
        })),
        ...offerChoiceModifiers(item.offerChoices ?? []),
      ],
    })),
  };
}

/**
 * Escapes `$transaction`'s callback distinctly from a real Prisma/database
 * error, so the outer `catch` can tell "an item is no longer orderable"
 * apart from "an unrelated persistence failure" (which must keep
 * propagating unmapped, exactly like `isTableNumberConflict`'s sibling
 * pattern in `tables.service.ts`).
 */
class ItemsUnavailableError extends Error {}

/** DEC-042: thrown at the end of a dry run to carry the priced order out of (and roll back) the transaction. */
class QuotedSignal extends Error {
  constructor(readonly quote: OrderQuote) {
    super('QUOTED');
  }
}

/** FT-8: thrown inside the transaction when the zone is not a valid ACTIVE zone of the resolved Branch. */
class DeliveryZoneInvalidError extends Error {}

/** DEC-069: an Offer is missing, off, not valid today, or not allowed for this Restaurant; rolls everything back. */
class OfferUnavailableError extends Error {
  constructor(readonly offerIds: string[]) {
    super('offer unavailable');
  }
}

/** DEC-069: the Guest's choices do not fit the Offer as it is now; rolls everything back. */
class OfferChangedError extends Error {
  constructor(readonly offerIds: string[]) {
    super('offer changed');
  }
}

/** Product Discounts V1: thrown inside the transaction when the displayed total is stale; rolls everything back. */
class PriceChangedError extends Error {
  constructor(
    readonly subtotal: Prisma.Decimal,
    readonly discountTotal: Prisma.Decimal,
    readonly total: Prisma.Decimal,
  ) {
    super('displayed total no longer matches the current price');
  }
}

/** FT-8: thrown inside the transaction when the items subtotal is below the zone minimum. */
class MinimumOrderNotMetError extends Error {
  constructor(
    readonly zoneName: string,
    readonly minimumOrder: Prisma.Decimal,
  ) {
    super('minimum order not met');
  }
}

/**
 * The real Postgres unique-index name behind
 * `@@unique([qrCodeId, branchId, clientRequestId])` on `Order`, following
 * the `<table>_<col1>_<col2>_..._key` convention Prisma already used for
 * `tables_branch_id_table_number_key`. FT-5 critical fix scoped it to the QR
 * (originally `orders_restaurant_id_client_request_id_key`, too broad);
 * FT-7 adds `branchId` because one GENERIC QR serves every Pickup Branch of
 * a Restaurant (see `apps/api/prisma/migrations/20260923150000_add_order_pickup_type`).
 */
const CLIENT_REQUEST_ID_UNIQUE_CONSTRAINT =
  'orders_qr_code_id_branch_id_client_request_id_key';

function isClientRequestIdConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  if (error.code !== 'P2002') {
    return false;
  }

  const meta = error.meta as
    | { driverAdapterError?: { cause?: { constraint?: { index?: string } } } }
    | undefined;

  return (
    meta?.driverAdapterError?.cause?.constraint?.index ===
    CLIENT_REQUEST_ID_UNIQUE_CONSTRAINT
  );
}

/**
 * FT-5/FT-7: Guest Order creation from an ACTIVE QR -- a TABLE QR creates a
 * DINE_IN Order (FT-5, unchanged), a GENERIC QR creates a PICKUP Order
 * (FT-7). The QR type alone decides which. Every
 * authoritative fact -- Tenant/Branch/Table identity, which Products are
 * actually orderable right now, unit price, line totals, the Order total --
 * is resolved fresh from the database inside one transaction; nothing from
 * the Guest's request body is ever trusted beyond `productId` +
 * `quantity` (Section 4/6/8).
 */
@Injectable()
export class PublicOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async createOrder(input: CreateGuestOrderInput): Promise<CreateGuestOrderResult> {
    // DEC-069: a line is a Product line OR an Offer line, never both and never neither.
    if (
      input.items.some(
        (item) => (item.productId === undefined) === (item.offerId === undefined),
      )
    ) {
      return { outcome: 'itemsUnavailable' };
    }
    const productIds = input.items.flatMap((item) =>
      item.productId === undefined ? [] : [item.productId],
    );

    // FT-6A: line identity is (productId + its exact set of selected
    // Modifier Options), NOT productId alone -- "Burger + Cheese" and
    // "Burger + Bacon" are two genuinely distinct lines (Cart identity
    // requirement) and must both be accepted; only a true repeat of the
    // SAME Product with the SAME selections in two items is a duplicate.
    // An Offer line's identity is the Offer plus its exact choices.
    const lineKeys = input.items.map((item) => {
      if (item.offerId !== undefined) {
        return offerLineKey(item.offerId, item.offerChoices ?? []);
      }
      const optionIds = item.modifierOptionIds ?? [];
      return `${item.productId}::${item.variantId ?? ''}::${[...optionIds].sort().join(',')}`;
    });
    if (new Set(lineKeys).size !== lineKeys.length) {
      return { outcome: 'duplicateItems' };
    }
    // A duplicate modifierOptionId within one line item is rejected before
    // any DB work, exactly like the line-identity check above -- never
    // silently deduplicated.
    for (const item of input.items) {
      const optionIds = item.modifierOptionIds ?? [];
      if (new Set(optionIds).size !== optionIds.length) {
        return { outcome: 'duplicateItems' };
      }
    }

    // Section 3/5: ordering works ONLY from an ACTIVE TABLE QR whose Table
    // is itself ACTIVE and whose Restaurant is ACTIVE -- an unknown QR, an
    // INACTIVE QR, a GENERIC QR, a suspended Restaurant, or an INACTIVE
    // Table all converge on the identical `qrNotFound` outcome, exactly
    // like `PublicMenuService`'s own QR resolution (QR_SPEC.md #47/#48):
    // never a distinguishable reason.
    const qr = await this.prisma.qrCode.findUnique({
      where: { publicCode: input.publicCode },
      select: {
        id: true,
        type: true,
        status: true,
        restaurantId: true,
        branchId: true,
        tableId: true,
        restaurant: {
          select: {
            name: true,
            status: true,
            defaultLocale: true,
            currencyCode: true,
            pickupEnabled: true,
            deliveryEnabled: true,
            tableOrderingEnabled: true,
            whatsappOrderingEnabled: true,
            whatsappNumber: true,
            countryCode: true,
          },
        },
        branch: { select: { timezone: true } },
        table: { select: { tableNumber: true, status: true } },
      },
    });

    if (!qr || qr.status !== 'ACTIVE' || qr.restaurant.status !== 'ACTIVE') {
      return { outcome: 'qrNotFound' };
    }
    const restaurantId = qr.restaurantId;
    // What the platform allows this Restaurant (DEC-043) combined with its own switches: the same
    // answer the Guest menu used to decide what to offer.
    const features = await this.entitlements.forRestaurant(restaurantId);
    const effective = effectiveOrdering(qr.restaurant, features);
    const defaultLocale = qr.restaurant.defaultLocale;
    const currencyCode = qr.restaurant.currencyCode;

    // FT-7: the QR type -- never anything in the request body -- decides the
    // Order type and where Branch/Table authority comes from.
    let orderType: OrderType;
    let branchId: string;
    // Product Discounts V1: the date window is evaluated in THIS Branch's
    // timezone (never the server's); UTC only if a timezone cannot be read.
    let branchTimezone = 'UTC';
    let tableId: string | null;
    let customerName: string | null = null;
    let customerPhone: string | null = null;
    let customerNotes: string | null = null;
    let deliveryZoneId: string | null = null;
    let deliveryAddress: string | null = null;
    let deliveryBuilding: string | null = null;
    let deliveryFloor: string | null = null;
    let deliveryApartment: string | null = null;
    let deliveryLandmark: string | null = null;

    const viaWhatsapp = input.channel === 'WHATSAPP';
    if (viaWhatsapp) {
      // WhatsApp ordering is for the Restaurant QR only (a Table QR keeps ordering through the app).
      if (qr.type !== 'GENERIC') return { outcome: 'qrNotFound' };
      if (!effective.whatsapp) {
        return { outcome: 'whatsappUnavailable' };
      }
    }

    if (qr.type === 'TABLE') {
      // Table channel switched off by the Restaurant (DEC-038): a view-only menu.
      // Refused before anything else, so no Order and no Table Session can result.
      if (!effective.table) {
        return { outcome: 'tableOrderingDisabled' };
      }
      // DINE_IN, exactly as FT-5: Branch/Table come from the QR/Table only.
      // Any `branchId`/customer field a client sent is IGNORED here, never
      // read -- a TABLE QR cannot be turned into a Pickup Order or have its
      // Branch overridden.
      if (
        !qr.branchId ||
        !qr.tableId ||
        !qr.table ||
        qr.table.status !== 'ACTIVE'
      ) {
        return { outcome: 'qrNotFound' };
      }
      orderType = 'DINE_IN';
      branchId = qr.branchId;
      tableId = qr.tableId;
      branchTimezone = qr.branch?.timezone ?? 'UTC';
    } else {
      // GENERIC QR -> PICKUP (default) or DELIVERY (no Table). The Guest
      // chooses only the fulfillment MODE; anything else about the Order
      // type/Branch/fee is resolved here from the database.
      const isDelivery = input.fulfillment === 'DELIVERY';
      // Restaurant-wide switch (Settings -> Restaurant QR): a type staff switched off
      // is refused before anything else, with the same outcome as "no eligible branch".
      // It is also refused when there is nowhere for it to go (no dashboard orders and no WhatsApp).
      if (!(isDelivery ? effective.delivery : effective.pickup)) {
        return { outcome: isDelivery ? 'deliveryUnavailable' : 'pickupUnavailable' };
      }
      // DEC-042: while WhatsApp ordering is on, Pickup and Delivery orders go to WhatsApp INSTEAD
      // of the dashboard, so the app endpoint creates none of them.
      if (!viaWhatsapp && effective.whatsapp) {
        return { outcome: 'whatsappOnly' };
      }
      // Missing details keep their own stable outcomes; details that are present must also be
      // acceptable (a real phone for the Restaurant's country, sane lengths, no control
      // characters) and are stored normalized (phone as E.164).
      if (!input.customerName?.trim() || !input.customerPhone?.trim()) {
        return { outcome: 'customerDetailsRequired' };
      }
      if (isDelivery) {
        if (!input.deliveryAddress?.trim()) {
          return { outcome: 'deliveryDetailsRequired' };
        }
        if (!input.deliveryZoneId) {
          return { outcome: 'deliveryZoneInvalid' };
        }
        deliveryZoneId = input.deliveryZoneId;
      }
      const validated = validateGuestOrderFields(input, {
        defaultCountry: qr.restaurant.countryCode,
        delivery: isDelivery,
      });
      if (!validated.ok) {
        return { outcome: 'invalidFields', errors: validated.errors };
      }
      customerName = validated.fields.customerName;
      customerPhone = validated.fields.customerPhone;
      customerNotes = validated.fields.customerNotes;
      deliveryAddress = validated.fields.deliveryAddress;
      deliveryBuilding = validated.fields.deliveryBuilding;
      deliveryFloor = validated.fields.deliveryFloor;
      deliveryApartment = validated.fields.deliveryApartment;
      deliveryLandmark = validated.fields.deliveryLandmark;

      // Branch authority: only an eligible Branch of THIS QR's own
      // Restaurant -- ACTIVE for Pickup; ACTIVE with at least one ACTIVE
      // Delivery zone for Delivery -- and a client-supplied branchId is
      // checked against that server-resolved set, never trusted.
      const eligibleBranches = await this.prisma.branch.findMany({
        where: isDelivery
          ? { restaurantId, status: 'ACTIVE', deliveryZones: { some: { status: 'ACTIVE' } } }
          : { restaurantId, status: 'ACTIVE' },
        select: { id: true, timezone: true },
      });
      if (eligibleBranches.length === 0) {
        return { outcome: isDelivery ? 'deliveryUnavailable' : 'pickupUnavailable' };
      }
      if (input.branchId) {
        if (!eligibleBranches.some((branch) => branch.id === input.branchId)) {
          return { outcome: 'branchInvalid' };
        }
        branchId = input.branchId;
      } else if (eligibleBranches.length === 1) {
        branchId = eligibleBranches[0].id;
      } else {
        return { outcome: 'branchRequired' };
      }
      branchTimezone =
        eligibleBranches.find((branch) => branch.id === branchId)?.timezone ?? 'UTC';
      orderType = isDelivery ? 'DELIVERY' : 'PICKUP';
      tableId = null;
    }

    // Section 11/23 idempotency fast path: a genuine retry with the same
    // clientRequestId for the SAME resolved QR returns the ORIGINAL Order,
    // never a second one -- checked before any validation/transaction work.
    // Scoped by `qrCodeId`, NOT `restaurantId` (FT-5 critical fix):
    // `clientRequestId` is client-controlled, so two different TABLE QRs in
    // the same Restaurant may legitimately submit the same value, and a
    // request from one Table must never resolve to another Table's Order
    // merely because they share a Restaurant and a client-chosen id.
    // FT-7: also scoped by the resolved `branchId` -- one GENERIC QR serves
    // every Pickup Branch, so the same client id for two different Branches
    // must stay two different Orders. For a TABLE QR, `branchId` is fixed by
    // the Table, so this changes nothing there.
    const existing = input.dryRun
      ? null
      : await this.prisma.order.findFirst({
          where: { qrCodeId: qr.id, branchId, clientRequestId: input.clientRequestId },
          select: ORDER_VIEW_SELECT,
        });
    if (existing) {
      return { outcome: 'created', data: toGuestOrderView(existing, input.locale) };
    }

    // Opening hours (DEC-042): a closed Branch takes no Pickup / Delivery orders. Dine-In is
    // not blocked (the Guest is already seated). Checked after the idempotent replay above
    // so a retry of an order accepted while open still returns it.
    if (orderType !== 'DINE_IN') {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, restaurantId },
        select: {
          hoursMode: true,
          temporarilyClosed: true,
          openingHours: { select: { dayOfWeek: true, opensMinute: true, closesMinute: true } },
        },
      });
      if (
        branch &&
        isClosedNow(
          {
            mode: branch.hoursMode,
            temporarilyClosed: branch.temporarilyClosed,
            intervals: branch.openingHours,
          },
          new Date(),
          branchTimezone,
        )
      ) {
        return { outcome: 'branchClosed' };
      }
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // Table Sessions: a Dine-In order locks its Table row FIRST (fixed lock
        // order, see table-session-ordering.ts), then attaches to the OPEN
        // session or opens one, and takes the next round number -- all inside
        // THIS transaction, so a rejected/failed order leaves no session, event
        // or round behind. Pickup and Delivery never enter this branch.
        let sessionSlot: DineInSessionSlot | null = null;
        if (orderType === 'DINE_IN' && tableId) {
          sessionSlot = await resolveDineInSessionSlot(tx, {
            restaurantId,
            branchId,
            tableId,
          });
        }

        // Section 6: every submitted Product must belong to an ACTIVE
        // Category inside the Restaurant's CURRENT ACTIVE PRIMARY Menu --
        // resolved fresh, inside this same transaction, never trusted
        // because the Guest's Menu page loaded it a moment ago.
        const primaryMenu = await tx.menu.findFirst({
          where: { restaurantId, isPrimary: true, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!primaryMenu) {
          throw new ItemsUnavailableError();
        }

        const distinctProductIds = Array.from(new Set(productIds));
        const products = await tx.product.findMany({
          where: {
            id: { in: distinctProductIds },
            restaurantId,
            status: 'ACTIVE',
            availability: 'AVAILABLE',
            category: { status: 'ACTIVE', menuId: primaryMenu.id },
          },
          select: {
            id: true,
            basePrice: true,
            category: {
              select: {
                displayOrder: true,
                translations: {
                  where: { locale: defaultLocale },
                  select: { name: true },
                  take: 1,
                },
              },
            },
            discountType: true,
            discountValue: true,
            discountEnabled: true,
            discountStartsOn: true,
            discountEndsOn: true,
            translations: {
              where: { locale: defaultLocale },
              select: { name: true },
              take: 1,
            },
            // DEC-041: only ACTIVE sizes are authoritative for a submission; a size that was
            // hidden since the Guest loaded the menu is treated like an unknown id.
            variants: {
              where: { status: 'ACTIVE' },
              select: {
                id: true,
                price: true,
                discountApplies: true,
                translations: {
                  where: { locale: defaultLocale },
                  select: { name: true },
                  take: 1,
                },
              },
            },
            // FT-6A: only ACTIVE Groups/Options are ever authoritative for
            // a submission -- a Group/Option deactivated since the Guest
            // loaded the Menu is treated exactly like a foreign/unknown id
            // below (CRITICAL MONEY RULE: re-resolved fresh here, never
            // trusted from the request).
            modifierGroups: {
              where: { status: 'ACTIVE' },
              select: {
                id: true,
                minimumSelections: true,
                maximumSelections: true,
                displayOrder: true,
                sizeSettings: { select: { variantId: true, enabled: true } },
                translations: {
                  where: { locale: defaultLocale },
                  select: { name: true },
                  take: 1,
                },
                options: {
                  where: { status: 'ACTIVE' },
                  select: {
                    id: true,
                    priceAdjustment: true,
                    displayOrder: true,
                    sizeSettings: {
                      select: { variantId: true, enabled: true, priceAdjustment: true },
                    },
                    translations: {
                      where: { locale: defaultLocale },
                      select: { name: true },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        });

        const productById = new Map(products.map((product) => [product.id, product]));
        // Section 6: if ANY requested Product is missing from the
        // orderable set above (foreign, INACTIVE, SOLD_OUT, or outside the
        // current primary Menu), the WHOLE Order is rejected -- no partial
        // Orders.
        if (productById.size !== distinctProductIds.length) {
          throw new ItemsUnavailableError();
        }

        // Product Discounts V1: today's calendar date in the order Branch's
        // timezone, shared by every line of this order.
        const today = localDateIn(branchTimezone, new Date());

        // DEC-069: every Offer of this order is re-resolved HERE, fresh and Tenant-scoped, and must be ACTIVE, valid
        // today (weekday and dates, in THIS Branch's timezone) and allowed by the package. A missing, foreign,
        // switched-off, archived or expired Offer rejects the whole order with the same OFFER_UNAVAILABLE.
        const distinctOfferIds = Array.from(
          new Set(input.items.flatMap((item) => (item.offerId ? [item.offerId] : []))),
        );
        const offerById = new Map<string, OrderableOffer>();
        if (distinctOfferIds.length > 0) {
          if (!features.OFFERS) {
            throw new OfferUnavailableError(distinctOfferIds);
          }
          const offerRows = await tx.offer.findMany({
            where: { id: { in: distinctOfferIds }, restaurantId, status: 'ACTIVE' },
            select: {
              id: true,
              price: true,
              status: true,
              daysOfWeek: true,
              startsOn: true,
              endsOn: true,
              translations: {
                where: { locale: defaultLocale },
                select: { name: true },
                take: 1,
              },
              slots: {
                where: { restaurantId },
                select: {
                  id: true,
                  kind: true,
                  requiredCount: true,
                  displayOrder: true,
                  translations: {
                    where: { locale: defaultLocale },
                    select: { title: true },
                    take: 1,
                  },
                  options: {
                    where: { restaurantId },
                    select: {
                      id: true,
                      priceAdjustment: true,
                      displayOrder: true,
                      // a typed item's own name (default language); a menu-linked item reads the menu's
                      translations: {
                        where: { locale: defaultLocale },
                        select: { locale: true, name: true },
                      },
                      ...optionItemSelect([defaultLocale]),
                    },
                  },
                },
              },
            },
          });
          const unavailable: string[] = [];
          for (const id of distinctOfferIds) {
            const row = offerRows.find((candidate) => candidate.id === id);
            const nameSnapshot = row?.translations[0]?.name;
            if (
              row === undefined ||
              nameSnapshot === undefined ||
              offerAvailability(
                {
                  status: row.status,
                  daysOfWeek: row.daysOfWeek,
                  startsOn: dateOnlyString(row.startsOn),
                  endsOn: dateOnlyString(row.endsOn),
                },
                today,
              ) !== 'AVAILABLE'
            ) {
              unavailable.push(id);
              continue;
            }
            const slots: OrderableOffer['slots'] = [];
            for (const slot of row.slots) {
              const titleSnapshot = slot.translations[0]?.title;
              if (titleSnapshot === undefined) {
                // Defensive only -- a default-locale title always exists.
                unavailable.push(id);
                break;
              }
              const options: OrderableOffer['slots'][number]['options'] = [];
              for (const option of slot.options) {
                const optionName = itemName(option, option.translations, defaultLocale, defaultLocale);
                // A linked item whose product is sold out / hidden is not offered: a missing included item (or a
                // choice group with nothing left) makes the whole offer unavailable, a missing choice is "changed".
                if (optionName === null || !itemOrderable(option)) {
                  if (slot.kind === 'FIXED') unavailable.push(id);
                  continue;
                }
                options.push({
                  id: option.id,
                  displayOrder: option.displayOrder,
                  nameSnapshot: optionName,
                  priceAdjustment: option.priceAdjustment,
                  quantity: option.quantity,
                });
              }
              if (slot.kind !== 'FIXED' && options.length === 0) unavailable.push(id);
              slots.push({
                id: slot.id,
                kind: slot.kind,
                requiredCount: slot.requiredCount,
                displayOrder: slot.displayOrder,
                titleSnapshot,
                options,
              });
            }
            if (!unavailable.includes(id)) {
              offerById.set(id, { id, price: row.price, nameSnapshot, slots });
            }
          }
          if (unavailable.length > 0) {
            throw new OfferUnavailableError(unavailable);
          }
        }
        let total = new Prisma.Decimal(0);
        let discountTotal = new Prisma.Decimal(0);
        // What only the WhatsApp message needs (the Category and the priced extras); kept beside `itemsData`
        // because that array is written to the database as it is.
        const quoteDetails: {
          categoryName: string;
          categoryOrder: number;
          offerSlots: QuoteOfferSlot[] | null;
          modifiers: {
            groupName: string;
            optionName: string;
            priceAdjustment: string;
          }[];
        }[] = [];
        const itemsData = input.items.map((item) => {
          if (item.offerId !== undefined) {
            // DEC-069: an Offer line. Price = the fixed offer price + the paid adjustments of the chosen options;
            // the Guest's choices must satisfy every slot exactly. Product discounts never apply to it.
            const offer = offerById.get(item.offerId);
            if (offer === undefined) throw new OfferUnavailableError([item.offerId]);
            const resolved = resolveOfferChoices(offer, item.offerChoices ?? []);
            if (!resolved.ok) throw new OfferChangedError([item.offerId]);
            const lineTotal = resolved.unitTotal.times(item.quantity);
            total = total.plus(lineTotal);
            const offerSlots: QuoteOfferSlot[] = [];
            for (const choice of resolved.choices) {
              let entry = offerSlots.find((slot) => slot.title === choice.slotTitleSnapshot && slot.included === choice.included);
              if (!entry) {
                entry = { title: choice.slotTitleSnapshot, included: choice.included, choices: [] };
                offerSlots.push(entry);
              }
              entry.choices.push({
                name: choice.optionNameSnapshot,
                quantity: choice.quantity,
                priceAdjustment: choice.priceAdjustment.toFixed(2),
              });
            }
            quoteDetails.push({ categoryName: '', categoryOrder: -1, offerSlots, modifiers: [] });
            return {
              productId: null,
              offerId: item.offerId,
              productNameSnapshot: offer.nameSnapshot,
              unitPrice: resolved.basePrice,
              quantity: item.quantity,
              lineTotal,
              discountAmount: new Prisma.Decimal(0),
              discountTypeSnapshot: null,
              discountValueSnapshot: null,
              variantId: null,
              variantNameSnapshot: null,
              variantPriceSnapshot: null,
              offerChoices: {
                create: resolved.choices.map((choice) => ({
                  offerSlotId: choice.slotId,
                  offerSlotOptionId: choice.optionId,
                  slotKind: choice.slotKind,
                  slotTitleSnapshot: choice.slotTitleSnapshot,
                  optionNameSnapshot: choice.optionNameSnapshot,
                  priceAdjustmentSnapshot: choice.priceAdjustment,
                  quantity: choice.quantity,
                  included: choice.included,
                  displayOrder: choice.displayOrder,
                })),
              },
            };
          }
          const product = item.productId === undefined ? undefined : productById.get(item.productId);
          const productNameSnapshot = product?.translations[0]?.name;
          if (product === undefined || productNameSnapshot === undefined) {
            // Defensive only -- Batch C/D creation guarantees a
            // default-locale translation always exists once a Product
            // does.
            throw new ItemsUnavailableError();
          }

          // Resolve the chosen size first: it determines which modifier groups,
          // options and override prices are authoritative for this line.
          // A foreign, inactive or omitted size fails closed exactly as before.
          let size: { id: string; nameSnapshot: string; price: Prisma.Decimal; discountApplies: boolean } | null = null;
          if (product.variants.length > 0) {
            const chosen = product.variants.find((variant) => variant.id === item.variantId);
            const chosenName = chosen?.translations[0]?.name;
            if (chosen === undefined || chosenName === undefined) throw new ItemsUnavailableError();
            size = {
              id: chosen.id, nameSnapshot: chosenName, price: chosen.price,
              discountApplies: chosen.discountApplies,
            };
          } else if (item.variantId !== undefined) {
            throw new ItemsUnavailableError();
          }
          const currentSizeId = size?.id ?? null;
          const availableGroups = product.modifierGroups.filter(group =>
            !currentSizeId || !group.sizeSettings.some(setting =>
              setting.variantId === currentSizeId && !setting.enabled));

          // FT-6A CRITICAL MONEY RULE: every selected modifierOptionId is
          // re-resolved against this Product's OWN currently-ACTIVE
          // Modifier Groups/Options -- an id that is unknown, belongs to a
          // different Product, or whose Group/Option has since been
          // deactivated all converge on the identical whole-order
          // `itemsUnavailable` rejection (Section: "guest-safe unavailable/
          // config-changed error", never a distinguishable reason).
          const optionLookup = new Map<
            string,
            {
              group: (typeof product.modifierGroups)[number];
              option: (typeof product.modifierGroups)[number]['options'][number];
              priceAdjustment: Prisma.Decimal;
            }
          >();
          for (const group of availableGroups) {
            for (const option of group.options) {
              const override = currentSizeId
                ? option.sizeSettings.find(setting => setting.variantId === currentSizeId)
                : null;
              if (override?.enabled === false) continue;
              optionLookup.set(option.id, {
                group, option,
                priceAdjustment: override?.priceAdjustment ?? option.priceAdjustment,
              });
            }
          }

          interface Selection {
            groupId: string;
            groupDisplayOrder: number;
            optionId: string;
            optionDisplayOrder: number;
            groupNameSnapshot: string;
            optionNameSnapshot: string;
            priceAdjustment: Prisma.Decimal;
          }

          const selections: Selection[] = [];
          const selectedCountByGroup = new Map<string, number>();
          for (const optionId of item.modifierOptionIds ?? []) {
            const found = optionLookup.get(optionId);
            if (!found) {
              throw new ItemsUnavailableError();
            }
            const { group, option, priceAdjustment } = found;
            const groupNameSnapshot = group.translations[0]?.name;
            const optionNameSnapshot = option.translations[0]?.name;
            if (groupNameSnapshot === undefined || optionNameSnapshot === undefined) {
              // Defensive only -- see productNameSnapshot check above.
              throw new ItemsUnavailableError();
            }
            selections.push({
              groupId: group.id,
              groupDisplayOrder: group.displayOrder,
              optionId: option.id,
              optionDisplayOrder: option.displayOrder,
              groupNameSnapshot,
              optionNameSnapshot,
              priceAdjustment,
            });
            selectedCountByGroup.set(group.id, (selectedCountByGroup.get(group.id) ?? 0) + 1);
          }

          // Every ACTIVE Group belonging to this Product must have its
          // selection count within [minimumSelections, maximumSelections]
          // -- including a required Group (minimumSelections >= 1) with
          // ZERO selections, which must fail here, not silently pass.
          for (const group of availableGroups) {
            const count = selectedCountByGroup.get(group.id) ?? 0;
            if (count < group.minimumSelections || count > group.maximumSelections) {
              throw new ItemsUnavailableError();
            }
          }

          // Stable Group-then-Option presentation order, independent of
          // the order the Guest happened to submit ids in.
          selections.sort(
            (a, b) =>
              a.groupDisplayOrder - b.groupDisplayOrder ||
              a.optionDisplayOrder - b.optionDisplayOrder,
          );

          // Section 8: exact Decimal arithmetic, never Number/parseFloat.
          // `unitPrice` keeps its established meaning -- Product.basePrice
          // alone (ORDER_LIFECYCLE_SPEC.md #42's "Base item price"); Modifier
          // adjustments are summed separately into `lineTotal` and preserved
          // individually via the OrderItemModifier snapshot rows below.
          // DEC-041 CRITICAL MONEY RULE: a Product with active sizes is priced by the size the
          // Guest chose, re-resolved here (never trusted from the request). The size is required;
          // an unknown, foreign or no-longer-active size, or a size sent for a Product that has
          // none, all converge on the same whole-order `itemsUnavailable` rejection.

          const unitPrice = size ? size.price : product.basePrice;
          const modifiersTotal = selections.reduce(
            (sum, selection) => sum.plus(selection.priceAdjustment),
            new Prisma.Decimal(0),
          );
          // Product Discounts V1: the discount comes only from the product row
          // read inside this transaction -- never from the request. It applies
          // to the base price per unit (paid extras are never discounted); the
          // line is (price - unit discount + extras) * quantity.
          const applied = size !== null && !size.discountApplies ? null : resolveActiveDiscount(
            unitPrice,
            {
              type: product.discountType,
              value: product.discountValue,
              enabled: product.discountEnabled,
              startsOn: dateOnlyString(product.discountStartsOn),
              endsOn: dateOnlyString(product.discountEndsOn),
            },
            today,
          );
          const unitDiscount = applied?.unitDiscount ?? new Prisma.Decimal(0);
          const lineDiscount = unitDiscount.times(item.quantity);
          const lineTotal = unitPrice
            .minus(unitDiscount)
            .plus(modifiersTotal)
            .times(item.quantity);
          total = total.plus(lineTotal);
          discountTotal = discountTotal.plus(lineDiscount);

          quoteDetails.push({
            categoryName: product.category.translations[0]?.name ?? '',
            categoryOrder: product.category.displayOrder,
            offerSlots: null,
            modifiers: selections.map((selection) => ({
              groupName: selection.groupNameSnapshot,
              optionName: selection.optionNameSnapshot,
              priceAdjustment: selection.priceAdjustment.toFixed(2),
            })),
          });
          return {
            productId: item.productId as string,
            productNameSnapshot,
            unitPrice,
            quantity: item.quantity,
            lineTotal,
            discountAmount: lineDiscount,
            discountTypeSnapshot: applied?.type ?? null,
            discountValueSnapshot: applied?.value ?? null,
            variantId: size?.id ?? null,
            variantNameSnapshot: size?.nameSnapshot ?? null,
            variantPriceSnapshot: size?.price ?? null,
            modifiers: {
              create: selections.map((selection, index) => ({
                modifierGroupId: selection.groupId,
                modifierOptionId: selection.optionId,
                modifierGroupNameSnapshot: selection.groupNameSnapshot,
                modifierOptionNameSnapshot: selection.optionNameSnapshot,
                priceAdjustmentSnapshot: selection.priceAdjustment,
                displayOrder: index,
              })),
            },
          };
        });

        // FT-8: authoritative Delivery money. The zone is re-resolved HERE,
        // inside the same transaction as the pricing above, and must be an
        // ACTIVE zone of the resolved Branch (and Restaurant) -- a foreign,
        // INACTIVE, or wrong-Branch zone all converge on one outcome. The
        // fee/minimum come only from this row, never from the request.
        const subtotal = total;
        let deliveryFee = new Prisma.Decimal(0);
        let deliveryZoneNameSnapshot: string | null = null;
        if (orderType === 'DELIVERY') {
          const zone = await tx.deliveryZone.findFirst({
            where: { id: deliveryZoneId ?? '', restaurantId, branchId, status: 'ACTIVE' },
            select: {
              name: true,
              deliveryFee: true,
              minimumOrder: true,
              translations: { select: { locale: true, name: true } },
              restaurant: { select: { defaultLocale: true } },
            },
          });
          if (!zone) {
            throw new DeliveryZoneInvalidError();
          }
          if (subtotal.lessThan(zone.minimumOrder)) {
            // The Guest-facing message uses their content language; the order
            // snapshot below always keeps the zone's default-locale name.
            throw new MinimumOrderNotMetError(
              resolveLocalizedName({
                requestedLocale: input.locale ?? zone.restaurant.defaultLocale,
                defaultLocale: zone.restaurant.defaultLocale,
                translations: zone.translations,
                legacyName: zone.name,
              }),
              zone.minimumOrder,
            );
          }
          deliveryFee = zone.deliveryFee;
          deliveryZoneNameSnapshot = zone.name;
        }

        // Product Discounts V1 (PROMOTIONS_SPEC.md #46-48): if the total the Guest
        // was shown no longer matches (a discount started, ended or changed), do
        // not silently charge the new amount -- roll back and report it.
        if (input.expectedTotal !== undefined) {
          const authoritativeTotal = subtotal.plus(deliveryFee);
          if (!new Prisma.Decimal(input.expectedTotal).equals(authoritativeTotal)) {
            throw new PriceChangedError(subtotal, discountTotal, authoritativeTotal);
          }
        }

        if (input.dryRun) {
          const branch = await tx.branch.findFirst({
            where: { id: branchId, restaurantId },
            select: {
              name: true,
              translations: { where: { locale: defaultLocale }, select: { name: true }, take: 1 },
            },
          });
          throw new QuotedSignal({
            restaurantId,
            branchId,
            restaurantName: qr.restaurant.name,
            whatsappNumber: qr.restaurant.whatsappNumber ?? '',
            defaultLocale,
            currencyCode,
            orderType,
            branchName: branch?.translations[0]?.name ?? branch?.name ?? '',
            deliveryZoneName: deliveryZoneNameSnapshot,
            items: itemsData.map((line, index) => ({
              kind: quoteDetails[index].offerSlots === null ? ('PRODUCT' as const) : ('OFFER' as const),
              offerSlots: quoteDetails[index].offerSlots,
              name: line.productNameSnapshot,
              categoryName: quoteDetails[index].categoryName,
              categoryOrder: quoteDetails[index].categoryOrder,
              variantName: line.variantNameSnapshot,
              quantity: line.quantity,
              modifiers: quoteDetails[index].modifiers,
              unitPrice: line.unitPrice.toFixed(2),
              discountAmount: line.discountAmount.toFixed(2),
              lineTotal: line.lineTotal.toFixed(2),
            })),
            subtotal: subtotal.toFixed(2),
            discountTotal: discountTotal.toFixed(2),
            deliveryFee: deliveryFee.toFixed(2),
            total: subtotal.plus(deliveryFee).toFixed(2),
            customerName,
            customerPhone,
            customerNotes,
            deliveryAddress,
            deliveryBuilding,
            deliveryFloor,
            deliveryApartment,
            deliveryLandmark,
          });
        }

        return tx.order.create({
          data: {
            restaurantId,
            branchId,
            tableId,
            ...(sessionSlot
              ? {
                  tableSessionId: sessionSlot.tableSessionId,
                  roundNumber: sessionSlot.roundNumber,
                }
              : {}),
            qrCodeId: qr.id,
            clientRequestId: input.clientRequestId,
            status: 'PENDING',
            type: orderType,
            customerNameSnapshot: customerName,
            customerPhoneSnapshot: customerPhone,
            customerNotesSnapshot: customerNotes,
            currencyCode,
            subtotalAmount: subtotal,
            deliveryFeeAmount: deliveryFee,
            discountTotalAmount: discountTotal,
            totalAmount: subtotal.plus(deliveryFee),
            deliveryZoneId: orderType === 'DELIVERY' ? deliveryZoneId : null,
            deliveryZoneNameSnapshot,
            deliveryAddressSnapshot: deliveryAddress,
            deliveryBuildingSnapshot: deliveryBuilding,
            deliveryFloorSnapshot: deliveryFloor,
            deliveryApartmentSnapshot: deliveryApartment,
            deliveryLandmarkSnapshot: deliveryLandmark,
            items: { create: itemsData },
            // FT-11 Section 1: initial Order creation establishes the first
            // status timestamp -- a nested create, so it commits inside this
            // exact transaction alongside the Order itself, never as a
            // separate best-effort write.
            statusEvents: {
              create: { restaurantId, branchId, previousStatus: null, newStatus: 'PENDING' },
            },
          },
          select: ORDER_VIEW_SELECT,
        });
      });

      return { outcome: 'created', data: toGuestOrderView(created, input.locale) };
    } catch (error) {
      if (error instanceof QuotedSignal) {
        return { outcome: 'quoted', quote: error.quote };
      }
      if (error instanceof ItemsUnavailableError) {
        return { outcome: 'itemsUnavailable' };
      }
      if (error instanceof TableOrderingUnavailableError) {
        return { outcome: 'tableOrderingUnavailable' };
      }
      if (error instanceof TableNotOrderableError) {
        return { outcome: 'qrNotFound' };
      }
      if (isClosedSessionTriggerViolation(error)) {
        // Defense in depth: the database trigger refused to attach the order to
        // a session that is not OPEN. Never expose the raw database error.
        return { outcome: 'tableOrderingUnavailable' };
      }
      if (error instanceof DeliveryZoneInvalidError) {
        return { outcome: 'deliveryZoneInvalid' };
      }
      if (error instanceof OfferUnavailableError) {
        return { outcome: 'offerUnavailable', offerIds: error.offerIds };
      }
      if (error instanceof OfferChangedError) {
        return { outcome: 'offerChanged', offerIds: error.offerIds };
      }
      if (error instanceof PriceChangedError) {
        return {
          outcome: 'priceChanged',
          pricing: {
            subtotal: error.subtotal.toFixed(2),
            discountTotal: error.discountTotal.toFixed(2),
            total: error.total.toFixed(2),
            currencyCode,
          },
        };
      }
      if (error instanceof MinimumOrderNotMetError) {
        return {
          outcome: 'minimumOrderNotMet',
          zoneName: error.zoneName,
          minimumOrder: error.minimumOrder.toFixed(2),
        };
      }
      if (isClientRequestIdConflict(error)) {
        // Section 11: a genuine concurrent double-submit raced past the
        // fast-path check above -- the OTHER request's transaction won;
        // fetch and return ITS Order as success, never a duplicate-create
        // error. Scoped by `qrCodeId` (same rationale as the fast path
        // above) -- never returns a different Table's winning Order.
        const winner = await this.prisma.order.findFirst({
          where: { qrCodeId: qr.id, branchId, clientRequestId: input.clientRequestId },
          select: ORDER_VIEW_SELECT,
        });
        if (winner) {
          return { outcome: 'created', data: toGuestOrderView(winner, input.locale) };
        }
      }
      throw error;
    }
  }
}
