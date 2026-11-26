import { Prisma } from '../generated/prisma/client';
import {
  evaluatePromotions,
  type EngineContext,
  type EngineProductLine,
  type EnginePromotion,
  type EngineResult,
} from './promotion-engine';
import type { PromotionConfig } from './promotion-config';
import type {
  BasketEvaluation,
  BasketLine,
  ExampleEnvironment,
} from './promotion-preview-examples';

const ZERO = new Prisma.Decimal(0);

/**
 * The lowest id a stored promotion can have. The engine's last tie-break is the promotion id (lower first); a draft
 * that is not saved yet has none, so the preview prices it as sorting LAST (`NEW_DRAFT_ID`, after every UUID) and uses
 * this id to ask what would change if it sorted FIRST.
 */
export const LOWEST_PROMOTION_ID = '00000000-0000-0000-0000-000000000000';

export function lineOf(
  { sample, quantity }: BasketLine,
  index: number,
): EngineProductLine {
  return {
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
  };
}

export interface EnvironmentInput {
  draft: EnginePromotion;
  /** Every other active promotion, exactly as the Guest quote loads them (the draft itself excluded). */
  competitors: readonly EnginePromotion[];
  context: EngineContext;
  /** The draft is a stored promotion being edited: its id is final, so a tie-break cannot change its outcome. */
  saved: boolean;
  config: Pick<PromotionConfig, 'scope' | 'categoryIds' | 'menuIds'>;
  zoneMinimumShortfall(result: EngineResult): string | null;
  promotionName(promotionId: string): string | null;
}

/** Binds the shared engine to one draft, its competitors and a context; every figure it returns is an engine result. */
export function createEnvironment(input: EnvironmentInput): ExampleEnvironment {
  const { draft, competitors, context, config } = input;
  const price = (
    basket: readonly BasketLine[],
    promotions: readonly EnginePromotion[],
    draftId: string,
    withoutLegacyDiscount = false,
  ): BasketEvaluation => {
    const result = evaluatePromotions({
      lines: basket.map((line, index) =>
        lineOf(
          withoutLegacyDiscount
            ? { ...line, sample: { ...line.sample, productDiscount: null } }
            : line,
          index,
        ),
      ),
      promotions,
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
        result.applied.find(({ promotionId }) => promotionId === draftId) ??
        null,
    };
  };
  const withDraft = [...competitors, draft];
  const itemLevel = [
    ...competitors.filter(
      ({ scope }) => scope !== 'CART' && scope !== 'QUANTITY',
    ),
    draft,
  ];

  return {
    draftId: draft.id,
    evaluate: (basket) => price(basket, withDraft, draft.id),
    evaluateAlone: (basket) => price(basket, [draft], draft.id, true),
    evaluateItemLevel: (basket) => price(basket, itemLevel, draft.id),
    targetsLine: ({ categoryId, menuId }) =>
      config.scope === 'CATEGORY'
        ? config.categoryIds.includes(categoryId)
        : config.scope === 'MENU'
          ? config.menuIds.includes(menuId)
          : false,
    tieBreakAlternative: (basket, evaluated) => {
      if (input.saved) return null;
      const alternative = price(
        basket,
        [...competitors, { ...draft, id: LOWEST_PROMOTION_ID }],
        LOWEST_PROMOTION_ID,
      );
      const outcome = (value: BasketEvaluation) =>
        `${value.evaluation.status}|${(value.applied?.amount ?? ZERO).toFixed(2)}`;
      if (outcome(alternative) === outcome(evaluated)) return null;
      return {
        status: alternative.evaluation.status,
        appliedSaving: (alternative.applied?.amount ?? ZERO).toFixed(2),
      };
    },
    zoneMinimumShortfall: (result) => input.zoneMinimumShortfall(result),
    promotionName: (promotionId) => input.promotionName(promotionId),
  };
}
