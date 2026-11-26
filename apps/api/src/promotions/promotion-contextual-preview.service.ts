import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { localDateIn } from '../menu/product-discount';
import {
  DeliveryZoneInvalidError,
  ItemsUnavailableError,
  priceCart,
} from '../public/price-cart';
import type { CreateGuestOrderItemInput } from '../public/public-orders.service';
import {
  evaluatePromotions,
  type EngineOrderType,
  type EnginePromotion,
} from './promotion-engine';
import type { PromotionConfig } from './promotion-config';
import {
  PRODUCT_ORDER,
  productSelect,
  resolveLine,
  type OrderabilityReason,
  type ProductRow,
  type ResolvedLine,
} from './promotion-preview-catalog';
import { createEnvironment, lineOf } from './promotion-preview-environment';
import {
  MAX_BASKET_LINES,
  buildExamples,
  toExample,
  type BasketLine,
  type ContextualExample,
  type OmittedExample,
  type PreviewSample,
} from './promotion-preview-examples';
import type { PromotionPreviewDto } from './promotion-preview.dto';
import {
  NEW_DRAFT_ID,
  PromotionPreviewService,
  invalid,
  type PreviewScope,
} from './promotion-preview.service';
import { PromotionsService, toPromotionCandidate } from './promotions.service';

/** Backend-held ILLUSTRATIVE constants (DEC-077 D3.3). They are never read from, or presented as, restaurant data. */
export const ILLUSTRATIVE_UNIT_PRICE = new Prisma.Decimal('100.00');
export const ILLUSTRATIVE_DELIVERY_FEE = new Prisma.Decimal('30.00');
const SAMPLE_CATEGORY_ID = '00000000-0000-4000-8000-0000000000c1';
const SAMPLE_MENU_ID = '00000000-0000-4000-8000-0000000000e1';
const SAMPLE_ZONE_ID = '00000000-0000-4000-8000-0000000000d1';
const sampleProductId = (index: number) =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
const APPLICABLE_PRODUCTS_SHOWN = 5;
/** Applicable products read to build the sample (Menu order). A larger set is reported as `truncated`. */
const SCAN_LIMIT = 500;

export interface PreviewProblem {
  code: string;
  field: string;
}

/** An INCOMPLETE answer carries these four keys and nothing else: no financial figure of any kind. */
export interface ContextualPreviewIncomplete {
  state: 'INCOMPLETE';
  requestId: string;
  evaluatedAt: string;
  problems: PreviewProblem[];
}

/** Why an ILLUSTRATIVE answer is not REAL (stable, translatable codes). */
export type IllustrativeReason =
  /** A delivery preview needs a real, active Delivery Zone of the Branch; there is none for this context. */
  | 'NO_DELIVERY_ZONE'
  /** No product the draft applies to can be ordered by a Guest as a simple basket (see `applicableProducts.excluded`). */
  | 'NO_ORDERABLE_APPLICABLE_PRODUCT';

export interface ContextualAssumptions {
  simulatedAsActive: true;
  size: 'FIRST_ACTIVE_SIZE';
  paidExtrasIncluded: false;
  branchId: string;
  orderType: EngineOrderType;
  /** Always a real zone for a REAL delivery preview; null otherwise (never a sample zone). */
  deliveryZoneId: string | null;
  sampleProductId: string | null;
  /** Where the draft's own schedule stands today; the engine still applies it exactly as a quote would. */
  schedule: 'CURRENT' | 'NOT_STARTED' | 'EXPIRED';
  basket: 'BUILT_BY_BACKEND' | 'STAFF_ITEMS';
  /** Empty for REAL. */
  illustrativeReasons: IllustrativeReason[];
}

export interface ApplicableProduct {
  productId: string;
  name: string;
  unitPrice: string;
  /** Item scopes only: this draft's own per-unit saving and the unit price after it (both engine results). */
  unitSaving?: string;
  unitPriceAfter?: string;
}

export interface ExcludedProducts {
  code: OrderabilityReason;
  count: number;
}

export interface ContextualPreviewReady {
  state: 'REAL' | 'ILLUSTRATIVE';
  requestId: string;
  evaluatedAt: string;
  branchLocalDate: string;
  assumptions: ContextualAssumptions;
  applicableProducts: {
    /** Products the draft applies to AND a Guest can order as a simple basket (first size, no paid extras). */
    total: number;
    /** More applicable products exist than were read (`total` is then a lower bound). */
    truncated: boolean;
    items: ApplicableProduct[];
    /** Applicable, otherwise orderable products no simple basket can be built from, by reason. */
    excluded: ExcludedProducts[];
  };
  examples: ContextualExample[];
  omittedExamples: OmittedExample[];
  // The pre-B3 top-level fields stay (never removed or renamed in this series), mirroring the primary example.
  strategy: ContextualExample['strategy'];
  merchandiseOriginal: string;
  merchandisePayable: string;
  deliveryFeeOriginal: string;
  deliveryFeePayable: string;
  grandTotal: string;
  appliedSaving: string;
  diagnostic: ContextualExample['diagnostic'];
  zoneMinimumShortfall: string | null;
}

export type ContextualPreview =
  ContextualPreviewIncomplete | ContextualPreviewReady;

type OkLine = Extract<ResolvedLine, { ok: true }>;

interface Catalog {
  /** Item or zone problems that make the answer INCOMPLETE (a Staff basket the Guest quote would refuse). */
  problems: PreviewProblem[];
  /** What the baskets are built from. */
  samples: PreviewSample[];
  /** The applicable, Guest-orderable products in Menu order (chosen first). */
  listed: PreviewSample[];
  total: number;
  truncated: boolean;
  chosen: string | null;
  excluded: ExcludedProducts[];
}

function scheduleOf(
  config: PromotionConfig,
  today: string,
): ContextualAssumptions['schedule'] {
  if (config.startsOn !== null && today < config.startsOn) return 'NOT_STARTED';
  if (config.endsOn !== null && today > config.endsOn) return 'EXPIRED';
  return 'CURRENT';
}

/** Backend-held samples, shaped so the engine sees them as eligible for exactly what the draft targets. */
function illustrativeSamples(config: PromotionConfig): PreviewSample[] {
  const common = {
    variantId: null,
    sizeDiscountApplies: true,
    unitPrice: ILLUSTRATIVE_UNIT_PRICE,
    productDiscount: null,
    categoryId: config.categoryIds[0] ?? SAMPLE_CATEGORY_ID,
    menuId: config.menuIds[0] ?? SAMPLE_MENU_ID,
  };
  const ids =
    config.productIds.length > 0
      ? config.productIds.slice(0, MAX_BASKET_LINES)
      : Array.from({ length: MAX_BASKET_LINES }, (_, i) => sampleProductId(i));
  return ids.map((engineProductId, index) => ({
    ...common,
    productId: null,
    engineProductId,
    label: `Sample item ${index + 1}`,
  }));
}

@Injectable()
export class PromotionContextualPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotions: PromotionsService,
    private readonly shared: PromotionPreviewService,
  ) {}

  /**
   * DEC-077 B3 `CONTEXTUAL_V1`. Read-only: nothing is written, locked or reserved. The request-level selections
   * (Branch, zone, promotion, product) are validated exactly as the pre-B3 preview does and refuse with 422 / 404;
   * an invalid or unfinished DRAFT, or a Staff basket / delivery context a Guest quote would refuse, is reported as
   * `INCOMPLETE` with no figure. REAL means: the basket is one the Guest quote accepts, in a real delivery zone when
   * it is a delivery order.
   */
  async preview(
    scope: PreviewScope,
    dto: PromotionPreviewDto,
    requestId: string,
  ): Promise<ContextualPreview> {
    const { restaurantId } = scope;
    const now = new Date();
    const incomplete = (problems: PreviewProblem[]): ContextualPreview => ({
      state: 'INCOMPLETE',
      requestId,
      evaluatedAt: now.toISOString(),
      problems,
    });
    return this.prisma.$transaction(
      async (tx) => {
        const branch = await this.shared.loadBranch(tx, scope, dto.branchId);
        if (dto.deliveryZoneId !== undefined && dto.orderType !== 'DELIVERY') {
          invalid(
            'PROMOTION_PREVIEW_ZONE_INVALID',
            'Choose a Delivery Zone only for a delivery preview.',
          );
        }
        const chosenZone = dto.deliveryZoneId
          ? await tx.deliveryZone.findFirst({
              where: {
                id: dto.deliveryZoneId,
                restaurantId,
                branchId: dto.branchId,
                status: 'ACTIVE',
              },
              select: { id: true, deliveryFee: true, minimumOrder: true },
            })
          : null;
        if (dto.deliveryZoneId && !chosenZone) {
          invalid(
            'PROMOTION_PREVIEW_ZONE_INVALID',
            'Choose an available Delivery Zone in this Branch.',
          );
        }
        if (dto.promotionId) {
          await this.shared.assertPromotionVisible(
            tx,
            scope,
            dto.promotionId,
            dto.branchId,
          );
        }
        const stored = dto.promotionId
          ? await this.promotions.storedConfig(
              tx,
              restaurantId,
              dto.promotionId,
            )
          : null;
        // The full write rules of B1 and B2 (including legacy compatibility), reported instead of thrown.
        const checked = await this.promotions.checkDraft(
          tx,
          restaurantId,
          dto.draft,
          stored,
        );
        if (!checked.ok) {
          return incomplete(
            checked.problems.map(({ code, field }) => ({ code, field })),
          );
        }
        const { config, defaultLocale } = checked;
        const today = localDateIn(branch.timezone, now);
        const draftId = dto.promotionId ?? NEW_DRAFT_ID;
        const draft = toPromotionCandidate(
          config,
          draftId,
          'ACTIVE',
          defaultLocale,
        ).promotion;

        // A delivery fee promotion can only be shown on a delivery order; the effective type is stated in `assumptions`.
        const orderType: EngineOrderType =
          config.scope === 'DELIVERY' ? 'DELIVERY' : dto.orderType;
        // Every delivery preview, whatever the promotion scope, stands on a real active zone of THIS Branch (and
        // Restaurant): the chosen one, else the first in display order (restricted to the draft's zones when it names any).
        const zone =
          chosenZone ??
          (orderType === 'DELIVERY'
            ? await tx.deliveryZone.findFirst({
                where: {
                  restaurantId,
                  branchId: dto.branchId,
                  status: 'ACTIVE',
                  ...(config.deliveryZoneIds.length > 0 && {
                    id: { in: [...config.deliveryZoneIds] },
                  }),
                },
                orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
                select: { id: true, deliveryFee: true, minimumOrder: true },
              })
            : null);
        const missingZone = orderType === 'DELIVERY' && zone === null;
        const explicit = dto.items !== undefined;

        // The Guest quote's own validation (menu, product, size, modifiers, zone), run on candidate baskets so that a
        // REAL example is never a basket the quote would refuse. No promotion is loaded and nothing is written.
        const guestAccepts = async (
          items: CreateGuestOrderItemInput[],
        ): Promise<boolean> => {
          try {
            await priceCart(tx, {
              restaurantId,
              branchId: dto.branchId,
              branchTimezone: branch.timezone,
              // Items do not depend on the order type; a missing zone is reported on its own.
              orderType:
                orderType === 'DELIVERY' && zone ? 'DELIVERY' : 'PICKUP',
              defaultLocale,
              deliveryZoneId: orderType === 'DELIVERY' && zone ? zone.id : null,
              items,
              offersEnabled: false,
              promotionsEnabled: false,
              now,
            });
            return true;
          } catch (error) {
            if (
              error instanceof ItemsUnavailableError ||
              error instanceof DeliveryZoneInvalidError
            ) {
              return false;
            }
            throw error;
          }
        };

        // An illustrative answer needs no catalog: without a zone a generated delivery basket is illustrative as a whole.
        const catalog: Catalog | null =
          missingZone && !explicit
            ? null
            : await this.loadCatalog(tx, {
                restaurantId,
                defaultLocale,
                config,
                sampleProductId: dto.sampleProductId,
                items: dto.items,
                guestAccepts,
              });
        if (explicit) {
          const problems: PreviewProblem[] = [
            ...(missingZone
              ? [{ code: 'DELIVERY_ZONE_REQUIRED', field: 'deliveryZoneId' }]
              : []),
            ...(catalog?.problems ?? []),
          ];
          // Staff's own basket carries restaurant prices: with no valid zone or an unorderable line there is no REAL
          // answer, and substituting sample money for Staff's basket would be a different, unrequested preview.
          if (problems.length > 0) return incomplete(problems);
        }

        const illustrativeReasons: IllustrativeReason[] = [];
        if (missingZone) illustrativeReasons.push('NO_DELIVERY_ZONE');
        else if (catalog && catalog.samples.length === 0) {
          illustrativeReasons.push('NO_ORDERABLE_APPLICABLE_PRODUCT');
        }
        const illustrative = illustrativeReasons.length > 0;
        const samples =
          illustrative || catalog === null
            ? illustrativeSamples(config)
            : catalog.samples;
        // Money of different states is never combined: an ILLUSTRATIVE answer uses no restaurant price and no
        // restaurant delivery fee, and a REAL one uses no illustrative figure of either kind.
        const sampleDelivery = illustrative && orderType === 'DELIVERY';
        const context = {
          today,
          branchId: dto.branchId,
          orderType,
          deliveryZoneId: sampleDelivery
            ? (config.deliveryZoneIds[0] ?? SAMPLE_ZONE_ID)
            : illustrative
              ? null
              : (zone?.id ?? null),
          deliveryFee: sampleDelivery
            ? ILLUSTRATIVE_DELIVERY_FEE
            : illustrative
              ? null
              : (zone?.deliveryFee ?? null),
        };

        // The same candidate loading the Guest quote uses for other promotions, evaluated by the same engine.
        const current = await this.promotions.loadCandidates(
          tx,
          restaurantId,
          defaultLocale,
        );
        const others = current.filter(
          ({ promotion }) => promotion.id !== draftId,
        );
        const names = new Map(
          others.map(({ promotion, label }) => [
            promotion.id,
            label.title ?? label.internalName,
          ]),
        );
        const competitors: EnginePromotion[] = others.map(
          ({ promotion }) => promotion,
        );
        const environment = createEnvironment({
          draft,
          competitors,
          context,
          saved: dto.promotionId !== undefined,
          config,
          zoneMinimumShortfall: (result) =>
            !illustrative &&
            zone &&
            result.merchandisePayable.lessThan(zone.minimumOrder)
              ? zone.minimumOrder.minus(result.merchandisePayable).toFixed(2)
              : null,
          promotionName: (id) => names.get(id) ?? null,
        });

        const staffBasket: BasketLine[] = samples.map((sample, index) => ({
          sample,
          quantity: dto.items?.[index]?.quantity ?? 1,
        }));
        const set = explicit
          ? {
              examples: [
                toExample(
                  'SINGLE',
                  config.scope,
                  staffBasket,
                  environment.evaluate(staffBasket),
                  environment,
                ),
              ],
              omittedExamples: [],
            }
          : buildExamples(config, samples, environment);

        // The sample products Staff can recognise, with this draft's own per-unit saving for item scopes.
        const itemScope =
          config.scope === 'CATEGORY' || config.scope === 'MENU';
        const shown =
          illustrative || catalog === null
            ? []
            : catalog.listed.slice(0, APPLICABLE_PRODUCTS_SHOWN);
        const items: ApplicableProduct[] = shown.map((sample) => {
          const base = {
            productId: sample.productId as string,
            name: sample.label,
            unitPrice: sample.unitPrice.toFixed(2),
          };
          if (!itemScope) return base;
          // Alone and without the legacy Product discount: the draft's own saving, independent of competition.
          const alone = evaluatePromotions({
            lines: [
              lineOf(
                { sample: { ...sample, productDiscount: null }, quantity: 1 },
                0,
              ),
            ],
            promotions: [draft],
            context,
          });
          return {
            ...base,
            unitSaving: alone.lines[0].promotionUnitDiscount.toFixed(2),
            unitPriceAfter: alone.lines[0].netLineTotal.toFixed(2),
          };
        });

        const primary =
          set.examples.find(({ kind }) => kind === 'QUALIFYING') ??
          set.examples[set.examples.length - 1];
        return {
          state: illustrative ? 'ILLUSTRATIVE' : 'REAL',
          requestId,
          evaluatedAt: now.toISOString(),
          branchLocalDate: today,
          assumptions: {
            simulatedAsActive: true,
            size: 'FIRST_ACTIVE_SIZE',
            paidExtrasIncluded: false,
            branchId: dto.branchId,
            orderType,
            deliveryZoneId: illustrative ? null : (zone?.id ?? null),
            sampleProductId: illustrative ? null : (catalog?.chosen ?? null),
            schedule: scheduleOf(config, today),
            basket: explicit ? 'STAFF_ITEMS' : 'BUILT_BY_BACKEND',
            illustrativeReasons,
          },
          applicableProducts: {
            total: illustrative ? 0 : (catalog?.total ?? 0),
            truncated: illustrative ? false : (catalog?.truncated ?? false),
            items,
            excluded:
              illustrative && missingZone ? [] : (catalog?.excluded ?? []),
          },
          examples: set.examples,
          omittedExamples: set.omittedExamples,
          strategy: primary.strategy,
          merchandiseOriginal: primary.merchandiseOriginal,
          merchandisePayable: primary.merchandisePayable,
          deliveryFeeOriginal: primary.deliveryFeeOriginal,
          deliveryFeePayable: primary.deliveryFeePayable,
          grandTotal: primary.grandTotal,
          appliedSaving: primary.appliedSaving,
          diagnostic: primary.diagnostic,
          zoneMinimumShortfall: primary.zoneMinimumShortfall,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * The products the draft applies to that a Guest can order as a simple basket (ACTIVE, AVAILABLE, ACTIVE Category in
   * the ACTIVE primary Menu, first active size, every mandatory choice satisfiable without a paid extra, and accepted
   * by the Guest quote's own validation), in Menu order. `samples` is what the baskets are built from: Staff's explicit
   * items, else the chosen sample first. `listed` and `total` describe the applicable set.
   */
  private async loadCatalog(
    tx: Prisma.TransactionClient,
    input: {
      restaurantId: string;
      defaultLocale: string;
      config: PromotionConfig;
      sampleProductId: string | undefined;
      items: PromotionPreviewDto['items'];
      guestAccepts: (items: CreateGuestOrderItemInput[]) => Promise<boolean>;
    },
  ): Promise<Catalog> {
    const { restaurantId, defaultLocale, config, guestAccepts } = input;
    const select = productSelect(defaultLocale);
    const primaryMenu = await tx.menu.findFirst({
      where: { restaurantId, isPrimary: true, status: 'ACTIVE' },
      select: { id: true },
    });
    const primaryMenuId = primaryMenu?.id ?? null;
    const where =
      primaryMenuId !== null
        ? this.applicableWhere(restaurantId, primaryMenuId, config)
        : null;
    const [rows, count] = where
      ? await Promise.all([
          tx.product.findMany({
            where,
            orderBy: PRODUCT_ORDER,
            take: SCAN_LIMIT,
            select,
          }),
          tx.product.count({ where }),
        ])
      : [[], 0];

    const excluded = new Map<OrderabilityReason, number>();
    const exclude = (reason: OrderabilityReason) =>
      excluded.set(reason, (excluded.get(reason) ?? 0) + 1);
    const resolvable = (list: ProductRow[]) =>
      list.flatMap((row) => {
        const line = resolveLine(row, primaryMenuId);
        if (line.ok) return [line];
        exclude(line.reason);
        return [];
      });
    const priced = (line: OkLine) => line.sample.unitPrice.gt(0);

    let chosenLine: OkLine | undefined;
    if (input.sampleProductId !== undefined) {
      const row = where
        ? await tx.product.findFirst({
            where: { AND: [where, { id: input.sampleProductId }] },
            select,
          })
        : null;
      const line = row ? resolveLine(row, primaryMenuId) : null;
      if (!line?.ok || !(await guestAccepts([line.guestItem]))) {
        invalid(
          'PROMOTION_PREVIEW_PRODUCT_INVALID',
          'Choose a Product this promotion applies to.',
        );
      }
      chosenLine = line;
    }
    const lines = resolvable(rows);
    // Default sample: the first priced product, so a spend or fixed-amount threshold is reachable and meaningful.
    chosenLine ??= lines.find(priced) ?? lines[0];
    let ordered = chosenLine
      ? [
          chosenLine,
          ...lines.filter(
            ({ sample }) => sample.productId !== chosenLine?.sample.productId,
          ),
        ]
      : [];

    // The Guest quote is the authority for the lines the baskets are built from. It accepts them all, or the offenders
    // are dropped (never reached when the builder above matches the quote's rules).
    const window = ordered.slice(0, MAX_BASKET_LINES);
    if (
      window.length > 0 &&
      !(await guestAccepts(window.map((l) => l.guestItem)))
    ) {
      const refused = new Set<string>();
      for (const line of window) {
        if (!(await guestAccepts([line.guestItem]))) {
          refused.add(line.sample.productId as string);
          exclude('ITEM_NOT_ORDERABLE');
        }
      }
      ordered = ordered.filter(
        ({ sample }) => !refused.has(sample.productId as string),
      );
      if (chosenLine && refused.has(chosenLine.sample.productId as string)) {
        chosenLine = ordered[0];
      }
    }
    const listed = ordered.map(({ sample }) => sample);
    const base = {
      samples: listed,
      listed,
      total: ordered.length,
      truncated: count > rows.length,
      chosen: chosenLine?.sample.productId ?? null,
      excluded: [...excluded.entries()]
        .map(([code, total]) => ({ code, count: total }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      problems: [] as PreviewProblem[],
    };
    if (input.items === undefined) return base;

    // Staff's own basket: any product of this Restaurant, but every line must be one the Guest quote accepts.
    const ids = [...new Set(input.items.map(({ productId }) => productId))];
    const found = ids.length
      ? await tx.product.findMany({
          where: { restaurantId, id: { in: ids } },
          select,
        })
      : [];
    const byId = new Map(found.map((row) => [row.id, row]));
    if (input.items.some(({ productId }) => !byId.has(productId))) {
      invalid(
        'PROMOTION_PREVIEW_PRODUCT_INVALID',
        'Choose a Product from this Restaurant.',
      );
    }
    // An empty basket prices nothing: it cannot stand for a REAL example.
    const problems: PreviewProblem[] =
      input.items.length === 0 ? [{ code: 'ITEMS_EMPTY', field: 'items' }] : [];
    const seen = new Set<string>();
    const staffLines: OkLine[] = [];
    input.items.forEach(({ productId }, index) => {
      const field = `items[${index}].productId`;
      if (seen.has(productId)) {
        // The Guest quote refuses the same line twice (duplicateItems); a Staff basket must not repeat a product.
        problems.push({ code: 'ITEM_DUPLICATE', field });
        return;
      }
      seen.add(productId);
      const line = resolveLine(
        byId.get(productId) as ProductRow,
        primaryMenuId,
      );
      if (line.ok) staffLines.push(line);
      else problems.push({ code: line.reason, field });
    });
    if (
      problems.length === 0 &&
      !(await guestAccepts(staffLines.map(({ guestItem }) => guestItem)))
    ) {
      problems.push({ code: 'ITEM_NOT_ORDERABLE', field: 'items' });
    }
    return {
      ...base,
      problems,
      samples: staffLines.map(({ sample }) => sample),
    };
  }

  /** What "applicable" means per scope; null when nothing can apply (a MENU target outside the primary Menu). */
  private applicableWhere(
    restaurantId: string,
    primaryMenuId: string,
    config: PromotionConfig,
  ): Prisma.ProductWhereInput | null {
    const base: Prisma.ProductWhereInput = {
      restaurantId,
      status: 'ACTIVE',
      availability: 'AVAILABLE',
      category: { status: 'ACTIVE', menuId: primaryMenuId },
    };
    switch (config.scope) {
      case 'CATEGORY':
        return { ...base, categoryId: { in: [...config.categoryIds] } };
      case 'MENU':
        return config.menuIds.includes(primaryMenuId) ? base : null;
      case 'CART':
      case 'QUANTITY':
        return config.categoryIds.length > 0 || config.productIds.length > 0
          ? {
              ...base,
              OR: [
                { categoryId: { in: [...config.categoryIds] } },
                { id: { in: [...config.productIds] } },
              ],
            }
          : base;
      default:
        return base;
    }
  }
}
