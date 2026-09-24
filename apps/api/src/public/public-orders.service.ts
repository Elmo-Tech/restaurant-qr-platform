import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { OrderStatus, OrderType } from '../generated/prisma/client';

export interface CreateGuestOrderItemInput {
  productId: string;
  quantity: number;
  /** Option IDENTITY only -- never a price/name (CRITICAL MONEY RULE). Omitted/undefined is normalized to no selections. */
  modifierOptionIds?: string[];
}

export interface CreateGuestOrderInput {
  publicCode: string;
  clientRequestId: string;
  items: CreateGuestOrderItemInput[];
  /** FT-7, GENERIC QR (Pickup) only: the Guest's chosen Pickup Branch. Never authority -- always re-validated against the Restaurant's ACTIVE Branches. Ignored entirely for a TABLE QR. */
  branchId?: string;
  /** FT-7, GENERIC QR (Pickup) only -- required there, ignored for a TABLE QR. Already DTO-trimmed. */
  customerName?: string;
  customerPhone?: string;
  customerNotes?: string;
}

export interface GuestOrderItemModifierView {
  groupName: string;
  optionName: string;
  priceAdjustment: string;
}

export interface GuestOrderItemView {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: string;
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
  /** FT-7: only the safe public Branch display name, PICKUP only (null for DINE_IN). */
  pickupBranch: { name: string } | null;
  items: GuestOrderItemView[];
}

export type CreateGuestOrderResult =
  | { outcome: 'created'; data: GuestOrderView }
  | { outcome: 'qrNotFound' }
  | { outcome: 'itemsUnavailable' }
  | { outcome: 'duplicateItems' }
  /** FT-7: GENERIC QR checkout without a non-empty customer name AND phone. */
  | { outcome: 'customerDetailsRequired' }
  /** FT-7: GENERIC QR, more than one ACTIVE Branch, and no branchId supplied. */
  | { outcome: 'branchRequired' }
  /** FT-7: supplied branchId is unknown, foreign, or INACTIVE -- deliberately one indistinguishable outcome. */
  | { outcome: 'branchInvalid' }
  /** FT-7: GENERIC QR whose Restaurant has zero ACTIVE Branches. */
  | { outcome: 'pickupUnavailable' };

interface OrderViewRow {
  id: string;
  status: OrderStatus;
  currencyCode: string;
  totalAmount: Prisma.Decimal;
  createdAt: Date;
  type: OrderType;
  table: { tableNumber: string } | null;
  branch: { name: string };
  items: {
    productId: string;
    productNameSnapshot: string;
    unitPrice: Prisma.Decimal;
    quantity: number;
    lineTotal: Prisma.Decimal;
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
  table: { select: { tableNumber: true } },
  branch: { select: { name: true } },
  items: {
    select: {
      productId: true,
      productNameSnapshot: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
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

function toGuestOrderView(order: OrderViewRow): GuestOrderView {
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
    pickupBranch: order.type === 'PICKUP' ? { name: order.branch.name } : null,
    items: order.items.map((item) => ({
      productId: item.productId,
      name: item.productNameSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      lineTotal: item.lineTotal.toFixed(2),
      modifiers: item.modifiers.map((modifier) => ({
        groupName: modifier.modifierGroupNameSnapshot,
        optionName: modifier.modifierOptionNameSnapshot,
        priceAdjustment: modifier.priceAdjustmentSnapshot.toFixed(2),
      })),
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
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(input: CreateGuestOrderInput): Promise<CreateGuestOrderResult> {
    const productIds = input.items.map((item) => item.productId);

    // FT-6A: line identity is (productId + its exact set of selected
    // Modifier Options), NOT productId alone -- "Burger + Cheese" and
    // "Burger + Bacon" are two genuinely distinct lines (Cart identity
    // requirement) and must both be accepted; only a true repeat of the
    // SAME Product with the SAME selections in two items is a duplicate.
    const lineKeys = input.items.map((item) => {
      const optionIds = item.modifierOptionIds ?? [];
      return `${item.productId}::${[...optionIds].sort().join(',')}`;
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
          select: { status: true, defaultLocale: true, currencyCode: true },
        },
        table: { select: { tableNumber: true, status: true } },
      },
    });

    if (!qr || qr.status !== 'ACTIVE' || qr.restaurant.status !== 'ACTIVE') {
      return { outcome: 'qrNotFound' };
    }
    const restaurantId = qr.restaurantId;
    const defaultLocale = qr.restaurant.defaultLocale;
    const currencyCode = qr.restaurant.currencyCode;

    // FT-7: the QR type -- never anything in the request body -- decides the
    // Order type and where Branch/Table authority comes from.
    let orderType: OrderType;
    let branchId: string;
    let tableId: string | null;
    let customerName: string | null = null;
    let customerPhone: string | null = null;
    let customerNotes: string | null = null;

    if (qr.type === 'TABLE') {
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
    } else {
      // GENERIC QR -> PICKUP (no Table). Customer name + phone are required.
      customerName = input.customerName?.trim() || null;
      customerPhone = input.customerPhone?.trim() || null;
      customerNotes = input.customerNotes?.trim() || null;
      if (!customerName || !customerPhone) {
        return { outcome: 'customerDetailsRequired' };
      }

      // Pickup Branch authority: only an ACTIVE Branch of THIS QR's own
      // Restaurant is ever eligible; a client-supplied branchId is checked
      // against that server-resolved set, never trusted.
      const activeBranches = await this.prisma.branch.findMany({
        where: { restaurantId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (activeBranches.length === 0) {
        return { outcome: 'pickupUnavailable' };
      }
      if (input.branchId) {
        if (!activeBranches.some((branch) => branch.id === input.branchId)) {
          return { outcome: 'branchInvalid' };
        }
        branchId = input.branchId;
      } else if (activeBranches.length === 1) {
        branchId = activeBranches[0].id;
      } else {
        return { outcome: 'branchRequired' };
      }
      orderType = 'PICKUP';
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
    const existing = await this.prisma.order.findFirst({
      where: { qrCodeId: qr.id, branchId, clientRequestId: input.clientRequestId },
      select: ORDER_VIEW_SELECT,
    });
    if (existing) {
      return { outcome: 'created', data: toGuestOrderView(existing) };
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
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
            translations: {
              where: { locale: defaultLocale },
              select: { name: true },
              take: 1,
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

        let total = new Prisma.Decimal(0);
        const itemsData = input.items.map((item) => {
          const product = productById.get(item.productId);
          const productNameSnapshot = product?.translations[0]?.name;
          if (product === undefined || productNameSnapshot === undefined) {
            // Defensive only -- Batch C/D creation guarantees a
            // default-locale translation always exists once a Product
            // does.
            throw new ItemsUnavailableError();
          }

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
            }
          >();
          for (const group of product.modifierGroups) {
            for (const option of group.options) {
              optionLookup.set(option.id, { group, option });
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
            const { group, option } = found;
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
              priceAdjustment: option.priceAdjustment,
            });
            selectedCountByGroup.set(group.id, (selectedCountByGroup.get(group.id) ?? 0) + 1);
          }

          // Every ACTIVE Group belonging to this Product must have its
          // selection count within [minimumSelections, maximumSelections]
          // -- including a required Group (minimumSelections >= 1) with
          // ZERO selections, which must fail here, not silently pass.
          for (const group of product.modifierGroups) {
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
          const unitPrice = product.basePrice;
          const modifiersTotal = selections.reduce(
            (sum, selection) => sum.plus(selection.priceAdjustment),
            new Prisma.Decimal(0),
          );
          const lineTotal = unitPrice.plus(modifiersTotal).times(item.quantity);
          total = total.plus(lineTotal);

          return {
            productId: item.productId,
            productNameSnapshot,
            unitPrice,
            quantity: item.quantity,
            lineTotal,
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

        return tx.order.create({
          data: {
            restaurantId,
            branchId,
            tableId,
            qrCodeId: qr.id,
            clientRequestId: input.clientRequestId,
            status: 'PENDING',
            type: orderType,
            customerNameSnapshot: customerName,
            customerPhoneSnapshot: customerPhone,
            customerNotesSnapshot: customerNotes,
            currencyCode,
            totalAmount: total,
            items: { create: itemsData },
          },
          select: ORDER_VIEW_SELECT,
        });
      });

      return { outcome: 'created', data: toGuestOrderView(created) };
    } catch (error) {
      if (error instanceof ItemsUnavailableError) {
        return { outcome: 'itemsUnavailable' };
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
          return { outcome: 'created', data: toGuestOrderView(winner) };
        }
      }
      throw error;
    }
  }
}
