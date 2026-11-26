import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { dateOnlyString, localDateIn } from '../menu/product-discount';
import {
  evaluatePromotions,
  type EngineContext,
  type EngineOrderType,
  type EngineProductLine,
  type EnginePromotion,
} from './promotion-engine';
import type { PromotionConfig } from './promotion-config';
import {
  MAX_BASKET_LINES,
  buildExamples,
  toExample,
  type BasketEvaluation,
  type BasketLine,
  type ContextualExample,
  type ExampleEnvironment,
  type ExampleSet,
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

const ZERO = new Prisma.Decimal(0);

/** Backend-held ILLUSTRATIVE constants (DEC-077 D3.3). They are never read from, or presented as, restaurant data. */
export const ILLUSTRATIVE_UNIT_PRICE = new Prisma.Decimal('100.00');
export const ILLUSTRATIVE_DELIVERY_FEE = new Prisma.Decimal('30.00');
const SAMPLE_CATEGORY_ID = '00000000-0000-4000-8000-0000000000c1';
const SAMPLE_MENU_ID = '00000000-0000-4000-8000-0000000000e1';
const SAMPLE_ZONE_ID = '00000000-0000-4000-8000-0000000000d1';
const sampleProductId = (index: number) =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
const APPLICABLE_PRODUCTS_SHOWN = 5;

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

export interface ContextualAssumptions {
  simulatedAsActive: true;
  size: 'FIRST_ACTIVE_SIZE';
  paidExtrasIncluded: false;
  branchId: string;
  orderType: EngineOrderType;
  deliveryZoneId: string | null;
  sampleProductId: string | null;
  /** Where the draft's own schedule stands today; the engine still applies it exactly as a quote would. */
  schedule: 'CURRENT' | 'NOT_STARTED' | 'EXPIRED';
  basket: 'BUILT_BY_BACKEND' | 'STAFF_ITEMS';
}

export interface ApplicableProduct {
  productId: string;
  name: string;
  unitPrice: string;
  /** Item scopes only: this draft's own per-unit saving and the unit price after it (both engine results). */
  unitSaving?: string;
  unitPriceAfter?: string;
}

export interface ContextualPreviewReady {
  state: 'REAL' | 'ILLUSTRATIVE';
  requestId: string;
  evaluatedAt: string;
  branchLocalDate: string;
  assumptions: ContextualAssumptions;
  applicableProducts: { total: number; items: ApplicableProduct[] };
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

const productSelect = (defaultLocale: string) =>
  ({
    id: true,
    basePrice: true,
    discountType: true,
    discountValue: true,
    discountEnabled: true,
    discountStartsOn: true,
    discountEndsOn: true,
    category: { select: { id: true, menuId: true } },
    translations: {
      where: { locale: defaultLocale },
      select: { name: true },
      take: 1,
    },
    // A simple sample uses the first enabled size and no paid extras (the same rule as the pre-B3 preview).
    variants: {
      where: { status: 'ACTIVE' },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      take: 1,
      select: { id: true, price: true, discountApplies: true },
    },
  }) satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{
  select: ReturnType<typeof productSelect>;
}>;

/** Menu order, so the first sample is stable across requests. */
const PRODUCT_ORDER = [
  { category: { displayOrder: 'asc' } },
  { category: { id: 'asc' } },
  { displayOrder: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ProductOrderByWithRelationInput[];

function toSample(row: ProductRow): PreviewSample {
  const size = row.variants[0];
  return {
    productId: row.id,
    engineProductId: row.id,
    categoryId: row.category.id,
    menuId: row.category.menuId,
    variantId: size?.id ?? null,
    sizeDiscountApplies: size?.discountApplies ?? true,
    unitPrice: size?.price ?? row.basePrice,
    productDiscount: {
      type: row.discountType,
      value: row.discountValue,
      enabled: row.discountEnabled,
      startsOn: dateOnlyString(row.discountStartsOn),
      endsOn: dateOnlyString(row.discountEndsOn),
    },
    label: row.translations[0]?.name ?? 'Product',
  };
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

function scheduleOf(
  config: PromotionConfig,
  today: string,
): ContextualAssumptions['schedule'] {
  if (config.startsOn !== null && today < config.startsOn) return 'NOT_STARTED';
  if (config.endsOn !== null && today > config.endsOn) return 'EXPIRED';
  return 'CURRENT';
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
   * an invalid or unfinished DRAFT is reported as `INCOMPLETE` with no figure.
   */
  async preview(
    scope: PreviewScope,
    dto: PromotionPreviewDto,
    requestId: string,
  ): Promise<ContextualPreview> {
    const { restaurantId } = scope;
    const now = new Date();
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
          return {
            state: 'INCOMPLETE',
            requestId,
            evaluatedAt: now.toISOString(),
            problems: checked.problems.map(({ code, field }) => ({
              code,
              field,
            })),
          };
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

        const explicit = dto.items !== undefined;
        const catalog = await this.loadSamples(tx, {
          restaurantId,
          defaultLocale,
          config,
          sampleProductId: dto.sampleProductId,
          items: dto.items,
        });
        // Money from different states is never combined: an ILLUSTRATIVE answer uses no restaurant price and no
        // restaurant delivery fee. A delivery fee promotion without any real zone is therefore illustrative as a whole.
        const illustrative =
          !explicit &&
          (catalog.samples.length === 0 ||
            (config.scope === 'DELIVERY' && zone === null));
        const samples = illustrative
          ? illustrativeSamples(config)
          : catalog.samples;
        const illustrativeFee =
          illustrative && config.scope === 'DELIVERY'
            ? ILLUSTRATIVE_DELIVERY_FEE
            : null;
        const context: EngineContext = {
          today,
          branchId: dto.branchId,
          orderType,
          deliveryZoneId: illustrative
            ? config.scope === 'DELIVERY'
              ? (config.deliveryZoneIds[0] ?? SAMPLE_ZONE_ID)
              : null
            : (zone?.id ?? null),
          deliveryFee: illustrative
            ? illustrativeFee
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
        const lineOf = (
          { sample, quantity }: BasketLine,
          index: number,
        ): EngineProductLine => ({
          index,
          kind: 'PRODUCT',
          productId: sample.engineProductId,
          categoryId: sample.categoryId,
          menuId: sample.menuId,
          variantId: sample.variantId,
          sizeDiscountApplies: sample.sizeDiscountApplies,
          quantity,
          unitPrice: sample.unitPrice,
          modifiersUnitTotal: ZERO,
          productDiscount: sample.productDiscount,
        });
        const environment: ExampleEnvironment = {
          draftId,
          evaluate: (basket): BasketEvaluation => {
            const result = evaluatePromotions({
              lines: basket.map(lineOf),
              promotions: [...competitors, draft],
              context,
            });
            const evaluation = result.evaluations.find(
              ({ promotionId }) => promotionId === draftId,
            );
            if (!evaluation) {
              throw new Error(
                'The promotion engine did not evaluate the preview draft.',
              );
            }
            return {
              result,
              evaluation,
              applied:
                result.applied.find(
                  ({ promotionId }) => promotionId === draftId,
                ) ?? null,
            };
          },
          evaluateAlone: (basket): BasketEvaluation => {
            const result = evaluatePromotions({
              lines: basket.map((line, index) =>
                lineOf(
                  {
                    ...line,
                    sample: { ...line.sample, productDiscount: null },
                  },
                  index,
                ),
              ),
              promotions: [draft],
              context,
            });
            const evaluation = result.evaluations.find(
              ({ promotionId }) => promotionId === draftId,
            );
            if (!evaluation) {
              throw new Error(
                'The promotion engine did not evaluate the preview draft.',
              );
            }
            return { result, evaluation, applied: null };
          },
          zoneMinimumShortfall: (result) =>
            !illustrative &&
            zone &&
            result.merchandisePayable.lessThan(zone.minimumOrder)
              ? zone.minimumOrder.minus(result.merchandisePayable).toFixed(2)
              : null,
          promotionName: (id) => names.get(id) ?? null,
        };

        const staffBasket: BasketLine[] = samples.map((sample, index) => ({
          sample,
          quantity: dto.items?.[index]?.quantity ?? 1,
        }));
        const set: ExampleSet = explicit
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
        const shown = illustrative
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
            sampleProductId: illustrative ? null : (catalog.chosen ?? null),
            schedule: scheduleOf(config, today),
            basket: explicit ? 'STAFF_ITEMS' : 'BUILT_BY_BACKEND',
          },
          applicableProducts: {
            total: illustrative ? 0 : catalog.total,
            items,
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
   * The products Staff can order that the draft applies to (Guest-orderable: ACTIVE, AVAILABLE, ACTIVE Category in
   * the ACTIVE primary Menu, the same set a quote accepts), in Menu order. `samples` is what the baskets are built
   * from: Staff's explicit items, else the chosen sample first. `listed` and `total` describe the applicable set.
   */
  private async loadSamples(
    tx: Prisma.TransactionClient,
    input: {
      restaurantId: string;
      defaultLocale: string;
      config: PromotionConfig;
      sampleProductId: string | undefined;
      items: PromotionPreviewDto['items'];
    },
  ): Promise<{
    samples: PreviewSample[];
    listed: PreviewSample[];
    total: number;
    chosen: string | null;
  }> {
    const { restaurantId, defaultLocale, config } = input;
    const select = productSelect(defaultLocale);
    const primaryMenu = await tx.menu.findFirst({
      where: { restaurantId, isPrimary: true, status: 'ACTIVE' },
      select: { id: true },
    });
    const where = primaryMenu
      ? this.applicableWhere(restaurantId, primaryMenu.id, config)
      : null;
    const [rows, total] = where
      ? await Promise.all([
          tx.product.findMany({
            where,
            orderBy: PRODUCT_ORDER,
            take: MAX_BASKET_LINES,
            select,
          }),
          tx.product.count({ where }),
        ])
      : [[], 0];

    let chosenRow: ProductRow | undefined;
    if (input.sampleProductId !== undefined) {
      chosenRow = where
        ? ((await tx.product.findFirst({
            where: { AND: [where, { id: input.sampleProductId }] },
            select,
          })) ?? undefined)
        : undefined;
      if (!chosenRow) {
        invalid(
          'PROMOTION_PREVIEW_PRODUCT_INVALID',
          'Choose a Product this promotion applies to.',
        );
      }
    }
    // Default sample: the first priced product, so a spend or fixed-amount threshold is reachable and meaningful.
    chosenRow ??=
      rows.find((row) => (row.variants[0]?.price ?? row.basePrice).gt(0)) ??
      rows[0];
    const ordered = chosenRow
      ? [chosenRow, ...rows.filter(({ id }) => id !== chosenRow.id)]
      : [];
    const listed = ordered.map(toSample);

    if (input.items === undefined) {
      return {
        samples: listed,
        listed,
        total,
        chosen: chosenRow?.id ?? null,
      };
    }
    // Staff's own basket: any product of this Restaurant, priced exactly like the pre-B3 preview.
    const ids = [...new Set(input.items.map(({ productId }) => productId))];
    const found = ids.length
      ? await tx.product.findMany({
          where: { restaurantId, id: { in: ids } },
          select,
        })
      : [];
    const byId = new Map(found.map((row) => [row.id, toSample(row)]));
    const samples = input.items.map(({ productId }) => {
      const sample = byId.get(productId);
      if (!sample) {
        invalid(
          'PROMOTION_PREVIEW_PRODUCT_INVALID',
          'Choose a Product from this Restaurant.',
        );
      }
      return sample;
    });
    return { samples, listed, total, chosen: chosenRow?.id ?? null };
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
