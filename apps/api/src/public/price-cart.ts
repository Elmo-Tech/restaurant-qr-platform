import { resolveLocalizedName } from '../common/name-translations';
import { Prisma } from '../generated/prisma/client';
import type { OrderType } from '../generated/prisma/client';
import { dateOnlyString, localDateIn } from '../menu/product-discount';
import {
  itemName,
  itemOrderable,
  optionItemSelect,
} from '../offers/offer-items';
import {
  resolveOfferChoices,
  type OrderableOffer,
} from '../offers/offer-order';
import { offerAvailability } from '../offers/offer-rules';
import {
  evaluatePromotions,
  type EngineLine,
  type EnginePromotion,
} from '../promotions/promotion-engine';
import {
  buildOrderPricingSnapshot,
  checkOrderPricingSnapshot,
  type PromotionLabel,
} from '../promotions/promotion-snapshot';
import type {
  CreateGuestOrderItemInput,
  QuoteOfferSlot,
} from './public-orders.service';

export class ItemsUnavailableError extends Error {}
export class DeliveryZoneInvalidError extends Error {}
export class OfferUnavailableError extends Error {
  constructor(readonly offerIds: string[]) {
    super('offer unavailable');
  }
}
export class OfferChangedError extends Error {
  constructor(readonly offerIds: string[]) {
    super('offer changed');
  }
}
export interface DeliveryMinimumShortfall {
  zoneName: string;
  minimumOrder: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  remainingAmount: Prisma.Decimal;
}

interface PriceCartContext {
  restaurantId: string;
  branchId: string;
  branchTimezone: string;
  orderType: OrderType;
  defaultLocale: string;
  locale?: string;
  deliveryZoneId: string | null;
  items: readonly CreateGuestOrderItemInput[];
  offersEnabled: boolean;
  promotionsEnabled: boolean;
  now: Date;
}

/** Reads and prices a resolved cart. Never writes or resolves a Table Session slot. */
export async function priceCart(
  tx: Prisma.TransactionClient,
  ctx: PriceCartContext,
) {
  const {
    restaurantId,
    branchId,
    branchTimezone,
    orderType,
    defaultLocale,
    locale,
    deliveryZoneId,
    items,
    offersEnabled,
    promotionsEnabled,
    now,
  } = ctx;
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

  const distinctProductIds = [
    ...new Set(
      items.flatMap((item) => (item.productId ? [item.productId] : [])),
    ),
  ];
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
      categoryId: true,
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
          variantId: true,
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
                select: {
                  variantId: true,
                  enabled: true,
                  priceAdjustment: true,
                },
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
  const today = localDateIn(branchTimezone, now);

  // DEC-069: every Offer of this order is re-resolved HERE, fresh and Tenant-scoped, and must be ACTIVE, valid
  // today (weekday and dates, in THIS Branch's timezone) and allowed by the package. A missing, foreign,
  // switched-off, archived or expired Offer rejects the whole order with the same OFFER_UNAVAILABLE.
  const distinctOfferIds = Array.from(
    new Set(items.flatMap((item) => (item.offerId ? [item.offerId] : []))),
  );
  const offerById = new Map<string, OrderableOffer>();
  if (distinctOfferIds.length > 0) {
    if (!offersEnabled) {
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
          const optionName = itemName(
            option,
            option.translations,
            defaultLocale,
            defaultLocale,
          );
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
  const engineLines: EngineLine[] = [];
  const lineDetails = items.map((item, index) => {
    if (item.offerId !== undefined) {
      // DEC-069: an Offer line. Price = the fixed offer price + the paid adjustments of the chosen options;
      // the Guest's choices must satisfy every slot exactly. Product discounts never apply to it.
      const offer = offerById.get(item.offerId);
      if (offer === undefined) throw new OfferUnavailableError([item.offerId]);
      const resolved = resolveOfferChoices(offer, item.offerChoices ?? []);
      if (!resolved.ok) throw new OfferChangedError([item.offerId]);
      engineLines.push({
        index,
        kind: 'OFFER',
        quantity: item.quantity,
        offerUnitTotal: resolved.unitTotal,
      });
      const offerSlots: QuoteOfferSlot[] = [];
      for (const choice of resolved.choices) {
        let entry = offerSlots.find(
          (slot) =>
            slot.title === choice.slotTitleSnapshot &&
            slot.included === choice.included,
        );
        if (!entry) {
          entry = {
            title: choice.slotTitleSnapshot,
            included: choice.included,
            choices: [],
          };
          offerSlots.push(entry);
        }
        entry.choices.push({
          name: choice.optionNameSnapshot,
          quantity: choice.quantity,
          priceAdjustment: choice.priceAdjustment.toFixed(2),
        });
      }
      quoteDetails.push({
        categoryName: '',
        categoryOrder: -1,
        offerSlots,
        modifiers: [],
      });
      return {
        productId: null,
        offerId: item.offerId,
        productNameSnapshot: offer.nameSnapshot,
        unitPrice: resolved.basePrice,
        quantity: item.quantity,
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
    const product =
      item.productId === undefined
        ? undefined
        : productById.get(item.productId);
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
    let size: {
      id: string;
      nameSnapshot: string;
      price: Prisma.Decimal;
      discountApplies: boolean;
    } | null = null;
    if (product.variants.length > 0) {
      const chosen = product.variants.find(
        (variant) => variant.id === item.variantId,
      );
      const chosenName = chosen?.translations[0]?.name;
      if (chosen === undefined || chosenName === undefined)
        throw new ItemsUnavailableError();
      size = {
        id: chosen.id,
        nameSnapshot: chosenName,
        price: chosen.price,
        discountApplies: chosen.discountApplies,
      };
    } else if (item.variantId !== undefined) {
      throw new ItemsUnavailableError();
    }
    const currentSizeId = size?.id ?? null;
    // DEC-074: a Size Group belongs only to its own size (and never to a
    // line without a size); a Product Group may be switched off per size.
    const availableGroups = product.modifierGroups.filter(
      (group) =>
        (!group.variantId || group.variantId === currentSizeId) &&
        (!currentSizeId ||
          !(group.sizeSettings ?? []).some(
            (setting) =>
              setting.variantId === currentSizeId && !setting.enabled,
          )),
    );

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
          ? (option.sizeSettings ?? []).find(
              (setting) => setting.variantId === currentSizeId,
            )
          : null;
        if (override?.enabled === false) continue;
        optionLookup.set(option.id, {
          group,
          option,
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
      selectedCountByGroup.set(
        group.id,
        (selectedCountByGroup.get(group.id) ?? 0) + 1,
      );
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
    engineLines.push({
      index,
      kind: 'PRODUCT',
      productId: product.id,
      categoryId: product.categoryId,
      menuId: primaryMenu.id,
      variantId: currentSizeId,
      sizeDiscountApplies: size?.discountApplies ?? true,
      quantity: item.quantity,
      unitPrice,
      modifiersUnitTotal: modifiersTotal,
      productDiscount: {
        type: product.discountType,
        value: product.discountValue,
        enabled: product.discountEnabled,
        startsOn: dateOnlyString(product.discountStartsOn),
        endsOn: dateOnlyString(product.discountEndsOn),
      },
    });

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
      productId: product.id,
      productNameSnapshot,
      unitPrice,
      quantity: item.quantity,
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
  const zone =
    orderType === 'DELIVERY'
      ? await tx.deliveryZone.findFirst({
          where: {
            id: deliveryZoneId ?? '',
            restaurantId,
            branchId,
            status: 'ACTIVE',
          },
          select: {
            name: true,
            deliveryFee: true,
            minimumOrder: true,
            translations: { select: { locale: true, name: true } },
            restaurant: { select: { defaultLocale: true } },
          },
        })
      : null;
  if (orderType === 'DELIVERY' && !zone) throw new DeliveryZoneInvalidError();

  const { promotions, labels } = promotionsEnabled
    ? await loadPromotions(tx, restaurantId, defaultLocale, today)
    : { promotions: [], labels: new Map<string, PromotionLabel>() };
  const result = evaluatePromotions({
    lines: engineLines,
    promotions,
    context: {
      today,
      branchId,
      orderType,
      deliveryZoneId,
      deliveryFee: zone?.deliveryFee ?? null,
    },
  });
  const snapshot = buildOrderPricingSnapshot({
    result,
    promotions,
    labels,
    orderType,
  });
  // Disabled restaurants keep the legacy delivery snapshot shape.
  if (!promotionsEnabled) snapshot.order.deliveryFeeOriginalAmount = null;
  const problems = checkOrderPricingSnapshot(snapshot);
  if (problems.length > 0) {
    throw new Error(`Invalid order pricing snapshot: ${problems.join('; ')}`);
  }

  // DEC-036/075: the zone minimum is the net merchandise payable, not the fee or gross items.
  // Refuse this pricing result; never suppress a promotion to meet the minimum.
  const subtotal = snapshot.order.subtotalAmount;
  const deliveryMinimumShortfall: DeliveryMinimumShortfall | null =
    zone && subtotal.lessThan(zone.minimumOrder)
      ? {
          zoneName: resolveLocalizedName({
            requestedLocale: locale ?? zone.restaurant.defaultLocale,
            defaultLocale: zone.restaurant.defaultLocale,
            translations: zone.translations,
            legacyName: zone.name,
          }),
          minimumOrder: zone.minimumOrder,
          subtotal,
          remainingAmount: zone.minimumOrder.minus(subtotal),
        }
      : null;

  const itemsData = snapshot.items.map(({ lineIndex, ...money }) => ({
    ...lineDetails[lineIndex],
    ...money,
  }));
  return {
    snapshot,
    itemsData,
    quoteDetails,
    deliveryMinimumShortfall,
    deliveryZoneNameSnapshot: zone?.name ?? null,
    promotionEvaluations: result.evaluations,
    promotionLabels: labels,
  };
}

async function loadPromotions(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  defaultLocale: string,
  today: string,
): Promise<{
  promotions: EnginePromotion[];
  labels: Map<string, PromotionLabel>;
}> {
  const date = new Date(`${today}T00:00:00.000Z`);
  const rows = await tx.promotion.findMany({
    where: {
      restaurantId,
      status: 'ACTIVE',
      AND: [
        { OR: [{ startsOn: null }, { startsOn: { lte: date } }] },
        { OR: [{ endsOn: null }, { endsOn: { gte: date } }] },
      ],
    },
    select: {
      id: true,
      internalName: true,
      scope: true,
      discountType: true,
      value: true,
      status: true,
      priority: true,
      startsOn: true,
      endsOn: true,
      minimumSubtotal: true,
      minimumQuantity: true,
      quantityBasis: true,
      translations: {
        where: { locale: defaultLocale },
        select: { title: true },
      },
      branches: { select: { branchId: true }, orderBy: { branchId: 'asc' } },
      menus: { select: { menuId: true }, orderBy: { menuId: 'asc' } },
      categories: {
        select: { categoryId: true },
        orderBy: { categoryId: 'asc' },
      },
      products: { select: { productId: true }, orderBy: { productId: 'asc' } },
      deliveryZones: {
        select: { deliveryZoneId: true },
        orderBy: { deliveryZoneId: 'asc' },
      },
    },
  });
  const labels = new Map<string, PromotionLabel>();
  const promotions = rows.map(
    ({
      internalName,
      translations,
      branches,
      menus,
      categories,
      products,
      deliveryZones,
      ...row
    }) => {
      labels.set(row.id, {
        internalName,
        title: translations[0]?.title ?? null,
      });
      return {
        ...row,
        startsOn: dateOnlyString(row.startsOn),
        endsOn: dateOnlyString(row.endsOn),
        branchIds: branches.map(({ branchId }) => branchId),
        menuIds: menus.map(({ menuId }) => menuId),
        categoryIds: categories.map(({ categoryId }) => categoryId),
        productIds: products.map(({ productId }) => productId),
        deliveryZoneIds: deliveryZones.map(
          ({ deliveryZoneId }) => deliveryZoneId,
        ),
      };
    },
  );
  return { promotions, labels };
}
