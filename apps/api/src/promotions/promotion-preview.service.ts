import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { RestaurantAccessContext } from '../auth/context/restaurant-access.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { dateOnlyString, localDateIn } from '../menu/product-discount';
import {
  evaluatePromotions,
  type EngineProductLine,
  type EngineStrategy,
  type PromotionEvaluationStatus,
} from './promotion-engine';
import type { PromotionPreviewDto } from './promotion-preview.dto';
import { PromotionsService, toPromotionCandidate } from './promotions.service';

export interface PromotionPreview {
  strategy: EngineStrategy;
  merchandiseOriginal: string;
  merchandisePayable: string;
  deliveryFeeOriginal: string;
  deliveryFeePayable: string;
  grandTotal: string;
  appliedSaving: string;
  diagnostic: {
    status: PromotionEvaluationStatus;
    potentialSaving: string;
    remainingAmount: string | null;
    remainingQuantity: number | null;
  };
  zoneMinimumShortfall: string | null;
}

function invalid(code: string, message: string): never {
  throw new UnprocessableEntityException({ error: { code, message } });
}

const ZERO = new Prisma.Decimal(0);
// Sort after persisted UUIDs on an exact tie; a new draft has no stable id yet.
const NEW_DRAFT_ID = 'preview-draft';

@Injectable()
export class PromotionPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotions: PromotionsService,
  ) {}

  /** A read-only example basket, not a quote or an availability promise. */
  async preview(
    scope: Pick<
      RestaurantAccessContext,
      'restaurantId' | 'membershipId' | 'allBranches'
    >,
    dto: PromotionPreviewDto,
  ): Promise<PromotionPreview> {
    const { restaurantId, membershipId, allBranches } = scope;
    return this.prisma.$transaction(
      async (tx) => {
        const branch = await tx.branch.findFirst({
          where: {
            id: dto.branchId,
            restaurantId,
            status: 'ACTIVE',
            ...(!allBranches && {
              membershipBranches: {
                some: { restaurantMembershipId: membershipId },
              },
            }),
          },
          select: { timezone: true },
        });
        if (!branch) {
          invalid(
            'PROMOTION_PREVIEW_BRANCH_INVALID',
            'Choose an available Branch.',
          );
        }
        if (
          (dto.orderType === 'DELIVERY') !==
          (dto.deliveryZoneId !== undefined)
        ) {
          invalid(
            'PROMOTION_PREVIEW_ZONE_INVALID',
            'Choose a Delivery Zone only for a delivery preview.',
          );
        }
        const zone = dto.deliveryZoneId
          ? await tx.deliveryZone.findFirst({
              where: {
                id: dto.deliveryZoneId,
                restaurantId,
                branchId: dto.branchId,
                status: 'ACTIVE',
              },
              select: { deliveryFee: true, minimumOrder: true },
            })
          : null;
        if (dto.deliveryZoneId && !zone) {
          invalid(
            'PROMOTION_PREVIEW_ZONE_INVALID',
            'Choose an available Delivery Zone in this Branch.',
          );
        }
        if (dto.promotionId) {
          const existing = await tx.promotion.findFirst({
            where: {
              id: dto.promotionId,
              restaurantId,
              ...(!allBranches && {
                OR: [
                  { branches: { none: {} } },
                  { branches: { some: { branchId: dto.branchId } } },
                ],
              }),
            },
            select: { id: true },
          });
          if (!existing) {
            throw new NotFoundException({
              error: {
                code: 'PROMOTION_NOT_FOUND',
                message: 'Promotion not found.',
              },
            });
          }
        }
        // An unchanged stored fixed item promotion stays previewable with the DEC-077 write gate off.
        const stored = dto.promotionId
          ? await this.promotions.storedConfig(
              tx,
              restaurantId,
              dto.promotionId,
            )
          : null;
        const { config, defaultLocale } = await this.promotions.validateDraft(
          tx,
          restaurantId,
          dto.draft,
          stored,
          false,
        );
        const draft = toPromotionCandidate(
          config,
          dto.promotionId ?? NEW_DRAFT_ID,
          'ACTIVE',
          defaultLocale,
        ).promotion;
        const productIds = [
          ...new Set(dto.items.map(({ productId }) => productId)),
        ];
        const products =
          productIds.length === 0
            ? []
            : await tx.product.findMany({
                where: { restaurantId, id: { in: productIds } },
                select: {
                  id: true,
                  basePrice: true,
                  discountType: true,
                  discountValue: true,
                  discountEnabled: true,
                  discountStartsOn: true,
                  discountEndsOn: true,
                  category: { select: { id: true, menuId: true } },
                  variants: {
                    where: { status: 'ACTIVE' },
                    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
                    take: 1,
                    select: { id: true, price: true, discountApplies: true },
                  },
                },
              });
        const byId = new Map(products.map((product) => [product.id, product]));
        const lines: EngineProductLine[] = dto.items.map(
          ({ productId, quantity }, index) => {
            const product = byId.get(productId);
            if (!product) {
              invalid(
                'PROMOTION_PREVIEW_PRODUCT_INVALID',
                'Choose a Product from this Restaurant.',
              );
            }
            // A simple sample uses the first enabled size and no paid extras.
            const size = product.variants[0];
            return {
              index,
              kind: 'PRODUCT',
              productId,
              categoryId: product.category.id,
              menuId: product.category.menuId,
              variantId: size?.id ?? null,
              sizeDiscountApplies: size?.discountApplies ?? true,
              quantity,
              unitPrice: size?.price ?? product.basePrice,
              modifiersUnitTotal: ZERO,
              productDiscount: {
                type: product.discountType,
                value: product.discountValue,
                enabled: product.discountEnabled,
                startsOn: dateOnlyString(product.discountStartsOn),
                endsOn: dateOnlyString(product.discountEndsOn),
              },
            };
          },
        );
        const current = await this.promotions.loadCandidates(
          tx,
          restaurantId,
          defaultLocale,
        );
        const result = evaluatePromotions({
          lines,
          promotions: [
            ...current
              .map(({ promotion }) => promotion)
              .filter(({ id }) => id !== draft.id),
            draft,
          ],
          context: {
            today: localDateIn(branch.timezone, new Date()),
            branchId: dto.branchId,
            orderType: dto.orderType,
            deliveryZoneId: dto.deliveryZoneId ?? null,
            deliveryFee: zone?.deliveryFee ?? null,
          },
        });
        const evaluation = result.evaluations.find(
          ({ promotionId }) => promotionId === draft.id,
        );
        if (!evaluation)
          throw new Error(
            'The promotion engine did not evaluate the preview draft.',
          );
        const applied = result.applied.find(
          ({ promotionId }) => promotionId === draft.id,
        );
        return {
          strategy: result.strategy,
          merchandiseOriginal: result.merchandiseOriginal.toFixed(2),
          merchandisePayable: result.merchandisePayable.toFixed(2),
          deliveryFeeOriginal: result.deliveryFeeOriginal.toFixed(2),
          deliveryFeePayable: result.deliveryFeePayable.toFixed(2),
          grandTotal: result.grandTotal.toFixed(2),
          appliedSaving: (applied?.amount ?? ZERO).toFixed(2),
          diagnostic: {
            status: evaluation.status,
            potentialSaving: evaluation.potentialSaving.toFixed(2),
            remainingAmount: evaluation.remainingAmount?.toFixed(2) ?? null,
            remainingQuantity: evaluation.remainingQuantity,
          },
          zoneMinimumShortfall:
            zone && result.merchandisePayable.lessThan(zone.minimumOrder)
              ? zone.minimumOrder.minus(result.merchandisePayable).toFixed(2)
              : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
