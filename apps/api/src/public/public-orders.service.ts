import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  validateGuestOrderFields,
  type GuestFieldError,
} from './guest-order-fields';
import { resolveLocalizedName } from '../common/name-translations';
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
  type OfferChoiceInput,
  type StoredOfferChoice,
} from '../offers/offer-order';
import {
  matchesStoredOrderRequestFingerprint,
  orderRequestFingerprint,
  type OrderRequestIdentity,
} from './order-request-fingerprint';
import {
  isClosedSessionTriggerViolation,
  resolveDineInSessionSlot,
  TableNotOrderableError,
  TableOrderingUnavailableError,
  type DineInSessionSlot,
} from '../table-sessions/table-session-ordering';

import type {
  OrderPricingSnapshot,
  PromotionLabel,
} from '../promotions/promotion-snapshot';
import type {
  PromotionEvaluation,
  PromotionScopeName,
  PromotionThresholdProgress,
} from '../promotions/promotion-engine';
import {
  priceCart,
  DeliveryZoneInvalidError,
  ItemsUnavailableError,
  OfferChangedError,
  OfferUnavailableError,
  type DeliveryMinimumShortfall,
} from './price-cart';

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

export interface QuoteGuestOrderInput {
  publicCode: string;
  /** The Guest's resolved menu content language (display only): used to localize Branch and zone names in the confirmation. Never authority. */
  locale?: string;
  items: CreateGuestOrderItemInput[];
  /** FT-7, GENERIC QR (Pickup) only: the Guest's chosen Pickup Branch. Never authority -- always re-validated against the Restaurant's ACTIVE Branches. Ignored entirely for a TABLE QR. */
  branchId?: string;
  /** GENERIC QR only; the QR determines whether this is Dine-In. */
  fulfillment?: 'PICKUP' | 'DELIVERY';
  /** DELIVERY only: identity of the chosen zone, never a fee/minimum/total. */
  deliveryZoneId?: string;
}

export interface CreateGuestOrderInput extends QuoteGuestOrderInput {
  clientRequestId: string;
  /**
   * The total payable the Guest was shown (decimal string). A staleness check
   * only: when it differs from the Backend's own total (a discount started,
   * ended or changed while the cart was open) NOTHING is created and the
   * current total is returned (PROMOTIONS_SPEC.md #46-48). Never used as a price.
   */
  expectedTotal?: string;
  customerName?: string;
  customerPhone?: string;
  customerNotes?: string;
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

export interface AppliedPromotionView {
  title: string | null;
  scope: PromotionScopeName;
  amount: string;
}

interface PublicPromotionProgressView {
  title: string | null;
  scope: 'CART' | 'QUANTITY' | 'DELIVERY';
  status: 'BELOW_MINIMUM_SUBTOTAL' | 'BELOW_MINIMUM_QUANTITY';
  subtotal: {
    basis: NonNullable<PromotionThresholdProgress['subtotal']>['basis'];
    current: string;
    required: string;
    remaining: string;
  } | null;
  quantity: PromotionThresholdProgress['quantity'];
}

export interface PublicQuoteView {
  type: OrderType;
  currencyCode: string;
  subtotal: string;
  discountTotal: string;
  deliveryFee: string;
  deliveryFeeOriginal: string | null;
  deliveryDiscount: string;
  total: string;
  promotions: AppliedPromotionView[];
  promotionProgress: PublicPromotionProgressView[];
  items: GuestOrderItemView[];
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
    promotionDiscount?: string;
    lineTotal: string;
  }[];
  subtotal: string;
  discountTotal: string;
  deliveryFee: string;
  total: string;
  promotions?: AppliedPromotionView[];
  deliveryFeeOriginal?: string | null;
  deliveryDiscount?: string;
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
  /** Sum of this line’s allocations; not yet subtracted from lineTotal. */
  promotionDiscount?: string;
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
  /** FT-8: exact money breakdown -- subtotal + deliveryFee = total. deliveryFee is 0.00 for DINE_IN/PICKUP. `subtotal` is already net of merchandise discounts. */
  subtotal: string;
  deliveryFee: string;
  /** All merchandise discounts (legacy and promotions); excludes delivery discounts. */
  discountTotal: string;
  promotions?: AppliedPromotionView[];
  deliveryFeeOriginal?: string | null;
  deliveryDiscount?: string;
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
  /** FT-8: net merchandise is below the zone's minimum order. */
  | {
      outcome: 'minimumOrderNotMet';
      zoneName: string;
      minimumOrder: string;
      remainingAmount: string;
      /** Quote only: a priced cart, not authorization to submit it. */
      subtotal?: string;
      quote?: PublicQuoteView;
    }
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
  | { outcome: 'tableOrderingDisabled' }
  /** API_CONVENTIONS.md #80: this `clientRequestId` already belongs to a materially different request in this QR + Branch scope. Nothing was created; the original Order is untouched. */
  | { outcome: 'idempotencyKeyReused' };

export type QuoteGuestOrderResult =
  | Exclude<CreateGuestOrderResult, { outcome: 'created' | 'quoted' }>
  | { outcome: 'publicQuote'; data: PublicQuoteView };

type CheckoutRequest =
  | { mode: 'quote'; input: QuoteGuestOrderInput }
  | { mode: 'submit'; input: CreateGuestOrderInput };

interface OrderViewRow {
  id: string;
  status: OrderStatus;
  currencyCode: string;
  totalAmount: Prisma.Decimal;
  createdAt: Date;
  type: OrderType;
  subtotalAmount: Prisma.Decimal;
  deliveryFeeAmount: Prisma.Decimal;
  deliveryFeeOriginalAmount?: Prisma.Decimal | null;
  deliveryDiscountAmount?: Prisma.Decimal;
  promotions?: {
    titleSnapshot: string | null;
    scope: PromotionScopeName;
    amount: Prisma.Decimal;
  }[];
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
    promotionAllocations?: { amount: Prisma.Decimal }[];
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
  deliveryFeeOriginalAmount: true,
  deliveryDiscountAmount: true,
  promotions: {
    select: { titleSnapshot: true, scope: true, amount: true },
    orderBy: [{ scope: 'asc' }, { promotionId: 'asc' }],
  },
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
      promotionAllocations: { select: { amount: true } },
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

/** The idempotent replay lookups also read the stored request fingerprint (never exposed in the view). */
const IDEMPOTENT_ORDER_SELECT = {
  ...ORDER_VIEW_SELECT,
  clientRequestFingerprint: true,
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
    discountTotal: amountString(order.discountTotalAmount),
    deliveryFeeOriginal: order.deliveryFeeOriginalAmount?.toFixed(2) ?? null,
    deliveryDiscount: amountString(order.deliveryDiscountAmount),
    promotions: (order.promotions ?? []).map(toPromotionView),
    items: order.items.map((item) => ({
      productId: item.productId,
      offerId: item.offerId ?? null,
      name: item.productNameSnapshot,
      variantName: item.variantNameSnapshot ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      discountAmount: amountString(item.discountAmount),
      promotionDiscount: amountString(
        item.promotionAllocations?.reduce(
          (sum, row) => sum.plus(row.amount),
          ZERO,
        ),
      ),
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

const ZERO = new Prisma.Decimal(0);

function amountString(value?: Prisma.Decimal): string {
  return (value ?? ZERO).toFixed(2);
}

function toPromotionView(row: {
  titleSnapshot: string | null;
  scope: PromotionScopeName;
  amount: Prisma.Decimal;
}): AppliedPromotionView {
  return {
    title: row.titleSnapshot,
    scope: row.scope,
    amount: row.amount.toFixed(2),
  };
}

function quoteMoney(snapshot: OrderPricingSnapshot) {
  const order = snapshot.order;
  return {
    subtotal: order.subtotalAmount.toFixed(2),
    discountTotal: order.discountTotalAmount.toFixed(2),
    deliveryFee: order.deliveryFeeAmount.toFixed(2),
    deliveryFeeOriginal: order.deliveryFeeOriginalAmount?.toFixed(2) ?? null,
    deliveryDiscount: order.deliveryDiscountAmount.toFixed(2),
    total: order.totalAmount.toFixed(2),
    promotions: snapshot.promotions.map(toPromotionView),
  };
}

function toPromotionProgress(
  evaluations: readonly PromotionEvaluation[],
  labels: ReadonlyMap<string, PromotionLabel>,
): PublicPromotionProgressView[] {
  const progress: PublicPromotionProgressView[] = [];
  for (const { promotionId, scope, status, thresholdProgress } of evaluations) {
    if (
      !thresholdProgress ||
      (scope !== 'CART' && scope !== 'QUANTITY' && scope !== 'DELIVERY') ||
      (status !== 'BELOW_MINIMUM_SUBTOTAL' &&
        status !== 'BELOW_MINIMUM_QUANTITY')
    ) {
      continue;
    }
    const { subtotal, quantity } = thresholdProgress;
    progress.push({
      title: labels.get(promotionId)?.title ?? null,
      scope,
      status,
      subtotal: subtotal
        ? {
            basis: subtotal.basis,
            current: subtotal.current.toFixed(2),
            required: subtotal.required.toFixed(2),
            remaining: subtotal.remaining.toFixed(2),
          }
        : null,
      quantity,
    });
  }
  return progress;
}

function minimumOrderRefusal(
  shortfall: DeliveryMinimumShortfall,
  quote?: PublicQuoteView,
): Extract<CreateGuestOrderResult, { outcome: 'minimumOrderNotMet' }> {
  return {
    outcome: 'minimumOrderNotMet',
    zoneName: shortfall.zoneName,
    minimumOrder: shortfall.minimumOrder.toFixed(2),
    remainingAmount: shortfall.remainingAmount.toFixed(2),
    ...(quote && { subtotal: shortfall.subtotal.toFixed(2), quote }),
  };
}

function allocationsByLine(snapshot: OrderPricingSnapshot) {
  const totals = new Map<number, Prisma.Decimal>();
  for (const promotion of snapshot.promotions) {
    for (const { lineIndex, amount } of promotion.allocations) {
      totals.set(lineIndex, (totals.get(lineIndex) ?? ZERO).plus(amount));
    }
  }
  return totals;
}

/** Preserve the rollback-only WhatsApp dry-run contract. */
class QuotedSignal extends Error {
  constructor(readonly quote: OrderQuote) {
    super('QUOTED');
  }
}

/** Thrown inside the transaction when the displayed total is stale; rolls everything back. */
class PriceChangedError extends Error {
  constructor(
    readonly subtotal: Prisma.Decimal,
    readonly discountTotal: Prisma.Decimal,
    readonly total: Prisma.Decimal,
  ) {
    super('displayed total no longer matches the current price');
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

  createOrder(input: CreateGuestOrderInput): Promise<CreateGuestOrderResult> {
    return this.checkout({ mode: 'submit', input });
  }

  quote(input: QuoteGuestOrderInput): Promise<QuoteGuestOrderResult> {
    return this.checkout({ mode: 'quote', input });
  }

  private checkout(request: {
    mode: 'quote';
    input: QuoteGuestOrderInput;
  }): Promise<QuoteGuestOrderResult>;
  private checkout(request: {
    mode: 'submit';
    input: CreateGuestOrderInput;
  }): Promise<CreateGuestOrderResult>;
  private async checkout(
    request: CheckoutRequest,
  ): Promise<CreateGuestOrderResult | QuoteGuestOrderResult> {
    const { input } = request;
    const submission = request.mode === 'submit' ? request.input : null;
    // DEC-069: a line is a Product line OR an Offer line, never both and never neither.
    if (
      input.items.some(
        (item) => (item.productId === undefined) === (item.offerId === undefined),
      )
    ) {
      return { outcome: 'itemsUnavailable' };
    }
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

    const viaWhatsapp = submission?.channel === 'WHATSAPP';
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
      if (submission && !viaWhatsapp && effective.whatsapp) {
        return { outcome: 'whatsappOnly' };
      }
      // Only actual submissions (including WhatsApp) carry customer details.
      if (
        submission &&
        (!submission.customerName?.trim() || !submission.customerPhone?.trim())
      ) {
        return { outcome: 'customerDetailsRequired' };
      }
      if (isDelivery) {
        if (submission && !submission.deliveryAddress?.trim()) {
          return { outcome: 'deliveryDetailsRequired' };
        }
        if (!input.deliveryZoneId) {
          return { outcome: 'deliveryZoneInvalid' };
        }
        deliveryZoneId = input.deliveryZoneId;
      }
      if (submission) {
        const validated = validateGuestOrderFields(submission, {
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
      }

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
    // API_CONVENTIONS.md #80/#81: the same key with a materially different
    // request is refused (409 IDEMPOTENCY_KEY_REUSED), never answered with the
    // unrelated original Order. The identity uses the resolved/normalized values
    // above and excludes prices, `expectedTotal` and `locale`, so a genuine retry
    // after a price change or a language switch still replays. A dry run stores
    // nothing and never takes part in idempotency.
    const requestIdentity: OrderRequestIdentity | null =
      !submission || submission.dryRun
        ? null
        : {
            qrCodeId: qr.id,
            branchId,
            orderType,
            channel: submission.channel ?? 'APP',
            items: input.items,
            customerName,
            customerPhone,
            customerNotes,
            deliveryZoneId: orderType === 'DELIVERY' ? deliveryZoneId : null,
            deliveryAddress,
            deliveryBuilding,
            deliveryFloor,
            deliveryApartment,
            deliveryLandmark,
          };
    const existing =
      requestIdentity && submission
        ? await this.prisma.order.findFirst({
            where: {
              qrCodeId: qr.id,
              branchId,
              clientRequestId: submission.clientRequestId,
            },
            select: IDEMPOTENT_ORDER_SELECT,
          })
        : null;
    if (existing && requestIdentity) {
      if (
        !matchesStoredOrderRequestFingerprint(
          existing.clientRequestFingerprint,
          requestIdentity,
        )
      ) {
        return { outcome: 'idempotencyKeyReused' };
      }
      return { outcome: 'created', data: toGuestOrderView(existing, input.locale) };
    }

    const now = new Date();
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
          now,
          branchTimezone,
        )
      ) {
        return { outcome: 'branchClosed' };
      }
    }

    const pricingContext = {
      restaurantId,
      branchId,
      branchTimezone,
      defaultLocale,
      orderType,
      deliveryZoneId,
      now,
      locale: input.locale,
      items: input.items,
      offersEnabled: features.OFFERS,
      promotionsEnabled: features.PROMOTIONS,
    };
    try {
      if (!submission) {
        // No Order lookup, Table Session slot or lock; a quote does not reserve a price.
        const priced = await this.prisma.$transaction((tx) =>
          priceCart(tx, pricingContext),
        );
        const allocations = allocationsByLine(priced.snapshot);
        const data: PublicQuoteView = {
          type: orderType,
          currencyCode,
          ...quoteMoney(priced.snapshot),
          promotionProgress: toPromotionProgress(
            priced.promotionEvaluations,
            priced.promotionLabels,
          ),
          items: priced.itemsData.map((line, index) => ({
            productId: line.productId,
            offerId: line.offerId ?? null,
            name: line.productNameSnapshot,
            variantName: line.variantNameSnapshot,
            quantity: line.quantity,
            unitPrice: line.unitPrice.toFixed(2),
            discountAmount: line.discountAmount.toFixed(2),
            promotionDiscount: amountString(allocations.get(index)),
            lineTotal: line.lineTotal.toFixed(2),
            modifiers: [
              ...priced.quoteDetails[index].modifiers,
              ...offerChoiceModifiers(line.offerChoices?.create ?? []),
            ],
          })),
        };
        return priced.deliveryMinimumShortfall
          ? minimumOrderRefusal(priced.deliveryMinimumShortfall, data)
          : { outcome: 'publicQuote', data };
      }
      return await this.prisma.$transaction(
        async (tx): Promise<CreateGuestOrderResult> => {
          // Table Sessions: a Dine-In order locks its Table row FIRST (fixed lock
          // order, see table-session-ordering.ts), then attaches to the OPEN
          // session or opens one, and takes the next round number -- all inside
          // THIS transaction, so a rejected/failed order leaves no session, event
          // or round behind. Pickup and Delivery never enter this branch.
          let sessionSlot: DineInSessionSlot | null = null;
          if (orderType === 'DINE_IN' && tableId && !submission.dryRun) {
            sessionSlot = await resolveDineInSessionSlot(tx, {
              restaurantId,
              branchId,
              tableId,
            });
          }

          const priced = await priceCart(tx, pricingContext);
          // Delivery never resolves a Table Session; refuse before any order or WhatsApp writes.
          if (priced.deliveryMinimumShortfall) {
            return minimumOrderRefusal(priced.deliveryMinimumShortfall);
          }
          const {
            snapshot,
            itemsData,
            quoteDetails,
            deliveryZoneNameSnapshot,
          } = priced;
          const {
            subtotalAmount: subtotal,
            discountTotalAmount: discountTotal,
            totalAmount: total,
          } = snapshot.order;

          // Product Discounts V1 (PROMOTIONS_SPEC.md #46-48): if the total the Guest
          // was shown no longer matches (a discount started, ended or changed), do
          // not silently charge the new amount -- roll back and report it.
          if (
            submission.expectedTotal !== undefined &&
            !new Prisma.Decimal(submission.expectedTotal).equals(total)
          ) {
            throw new PriceChangedError(subtotal, discountTotal, total);
          }

          if (submission.dryRun) {
            const branch = await tx.branch.findFirst({
              where: { id: branchId, restaurantId },
              select: {
                name: true,
                translations: {
                  where: { locale: defaultLocale },
                  select: { name: true },
                  take: 1,
                },
              },
            });
            const allocations = allocationsByLine(snapshot);
            const quote: OrderQuote = {
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
                kind:
                  quoteDetails[index].offerSlots === null
                    ? ('PRODUCT' as const)
                    : ('OFFER' as const),
                offerSlots: quoteDetails[index].offerSlots,
                name: line.productNameSnapshot,
                categoryName: quoteDetails[index].categoryName,
                categoryOrder: quoteDetails[index].categoryOrder,
                variantName: line.variantNameSnapshot,
                quantity: line.quantity,
                modifiers: quoteDetails[index].modifiers,
                unitPrice: line.unitPrice.toFixed(2),
                discountAmount: line.discountAmount.toFixed(2),
                promotionDiscount: amountString(allocations.get(index)),
                lineTotal: line.lineTotal.toFixed(2),
              })),
              ...quoteMoney(snapshot),
              customerName,
              customerPhone,
              customerNotes,
              deliveryAddress,
              deliveryBuilding,
              deliveryFloor,
              deliveryApartment,
              deliveryLandmark,
            };
            throw new QuotedSignal(quote);
          }

          // Prisma does not promise nested create result ordering. Assign each item's ID
          // before writing so even identical-priced lines receive the right allocation.
          const itemIds = snapshot.promotions.some(
            (row) => row.allocations.length > 0,
          )
            ? itemsData.map(() => randomUUID())
            : [];
          const created = await tx.order.create({
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
              clientRequestId: submission.clientRequestId,
              clientRequestFingerprint: requestIdentity
                ? orderRequestFingerprint(requestIdentity)
                : null,
              status: 'PENDING',
              type: orderType,
              customerNameSnapshot: customerName,
              customerPhoneSnapshot: customerPhone,
              customerNotesSnapshot: customerNotes,
              currencyCode,
              ...snapshot.order,
              deliveryZoneId: orderType === 'DELIVERY' ? deliveryZoneId : null,
              deliveryZoneNameSnapshot,
              deliveryAddressSnapshot: deliveryAddress,
              deliveryBuildingSnapshot: deliveryBuilding,
              deliveryFloorSnapshot: deliveryFloor,
              deliveryApartmentSnapshot: deliveryApartment,
              deliveryLandmarkSnapshot: deliveryLandmark,
              items: {
                create: itemsData.map((line, index) =>
                  itemIds.length ? { ...line, id: itemIds[index] } : line,
                ),
              },
              // FT-11 Section 1: initial Order creation establishes the first
              // status timestamp -- a nested create, so it commits inside this
              // exact transaction alongside the Order itself, never as a
              // separate best-effort write.
              statusEvents: {
                create: {
                  restaurantId,
                  branchId,
                  previousStatus: null,
                  newStatus: 'PENDING',
                },
              },
            },
            select: ORDER_VIEW_SELECT,
          });
          if (snapshot.promotions.length === 0) {
            return {
              outcome: 'created',
              data: toGuestOrderView(created, input.locale),
            };
          }
          await persistPromotionSnapshots(
            tx,
            restaurantId,
            created.id,
            itemIds,
            snapshot.promotions,
          );
          const withPromotions = await tx.order.findUniqueOrThrow({
            where: { id: created.id, restaurantId },
            select: ORDER_VIEW_SELECT,
          });
          return {
            outcome: 'created',
            data: toGuestOrderView(withPromotions, input.locale),
          };
        },
      );
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
      if (submission && requestIdentity && isClientRequestIdConflict(error)) {
        // Section 11: a genuine concurrent double-submit raced past the
        // fast-path check above -- the OTHER request's transaction won;
        // fetch and return ITS Order as success, never a duplicate-create
        // error. Scoped by `qrCodeId` (same rationale as the fast path
        // above) -- never returns a different Table's winning Order.
        // The winner is compared exactly like the fast path: a concurrent
        // request with the same key but a different payload gets 409, not
        // the winner's Order.
        const winner = await this.prisma.order.findFirst({
          where: {
            qrCodeId: qr.id,
            branchId,
            clientRequestId: submission.clientRequestId,
          },
          select: IDEMPOTENT_ORDER_SELECT,
        });
        if (winner) {
          if (
            requestIdentity &&
            !matchesStoredOrderRequestFingerprint(
              winner.clientRequestFingerprint,
              requestIdentity,
            )
          ) {
            return { outcome: 'idempotencyKeyReused' };
          }
          return { outcome: 'created', data: toGuestOrderView(winner, input.locale) };
        }
      }
      throw error;
    }
  }
}

async function persistPromotionSnapshots(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  orderId: string,
  itemIds: readonly string[],
  promotions: OrderPricingSnapshot['promotions'],
): Promise<void> {
  const allocations: Prisma.OrderPromotionAllocationCreateManyInput[] = [];
  const rows = promotions.map(({ allocations: shares, ...promotion }) => {
    const id = randomUUID();
    for (const { lineIndex, amount } of shares) {
      const orderItemId = itemIds[lineIndex];
      if (!orderItemId)
        throw new Error('Promotion allocation refers to an unknown order line');
      allocations.push({ orderPromotionId: id, orderItemId, orderId, amount });
    }
    return {
      ...promotion,
      configSnapshot: { ...promotion.configSnapshot },
      id,
      orderId,
      restaurantId,
    };
  });
  await tx.orderPromotion.createMany({ data: rows });
  if (allocations.length > 0) {
    await tx.orderPromotionAllocation.createMany({ data: allocations });
  }
}
