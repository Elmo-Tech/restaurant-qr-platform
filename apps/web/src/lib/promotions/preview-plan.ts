import type { Promotion, PromotionDraft, PromotionTargets, PreviewOrderType } from './api.ts';
import { toPromotionDraft, type DraftFields } from './draft.ts';

/**
 * Plans one contextual preview request (DEC-077 B4).
 *
 * This module only CHOOSES the context: which draft, which Branch and which delivery order to ask about. It contains no
 * money arithmetic and no pricing rule: the Backend (`CONTEXTUAL_V1`) builds the baskets, runs the real engine and
 * returns every figure. The browser only ever displays those figures.
 */

export type PreviewBranch = PromotionTargets['branches'][number];
export type PreviewZone = PromotionTargets['deliveryZones'][number];

export type IncompleteReason = 'VALUE_MISSING' | 'VALUE_INVALID' | 'NAMES' | 'TRANSLATION' | 'CATEGORY_TARGETS' | 'MENU_TARGETS' |
  'MINIMUM_QUANTITY' | 'MINIMUM_SUBTOTAL' | 'DATES' | 'PRIORITY' | 'ZONE_BRANCH' | 'NO_BRANCH' | 'OTHER';

export interface PlannedRequest {
  draft: PromotionDraft;
  promotionId?: string;
  branchId: string;
  orderType: PreviewOrderType;
  deliveryZoneId?: string;
}

export type PreviewPlan =
  | { kind: 'incomplete'; reason: IncompleteReason }
  | {
    kind: 'request';
    request: PlannedRequest;
    /** Identifies the exact question asked, so an answer can be tied to the draft it answers. */
    key: string;
  };

function incompleteReason(fields: DraftFields, error: string): IncompleteReason {
  switch (error) {
    case 'promotions.validation.names': return 'NAMES';
    case 'promotions.validation.translation': return 'TRANSLATION';
    case 'promotions.validation.value': return 'VALUE_INVALID';
    case 'promotions.validation.targets': return fields.scope === 'MENU' ? 'MENU_TARGETS' : 'CATEGORY_TARGETS';
    case 'promotions.validation.minimumQuantity': return 'MINIMUM_QUANTITY';
    case 'promotions.validation.minimumSubtotal':
    case 'promotions.validation.minimumSubtotalRequired':
    case 'promotions.validation.minimumSubtotalPositive': return 'MINIMUM_SUBTOTAL';
    case 'promotions.validation.dates': return 'DATES';
    case 'promotions.validation.priority': return 'PRIORITY';
    case 'promotions.validation.zoneBranch': return 'ZONE_BRANCH';
    default: return 'OTHER';
  }
}

/**
 * Chooses the preview context. A draft the browser can already see is unusable (missing value, bad shape) is
 * INCOMPLETE without a request. Otherwise the Backend decides (it re-validates with the full write rules and can still
 * answer INCOMPLETE with its own problems).
 *
 * `original` carries the stored promotion being edited; its `updatedAt` and status are part of the key so a save or an
 * activation always asks again.
 */
export function planPreview(
  fields: DraftFields,
  targets: PromotionTargets,
  original: Pick<Promotion, 'id' | 'scope' | 'needsMinimumSubtotal' | 'updatedAt' | 'status'> | null,
): PreviewPlan {
  if (!fields.value.trim()) return { kind: 'incomplete', reason: 'VALUE_MISSING' };
  const validated = toPromotionDraft(fields, targets, original);
  if ('error' in validated) return { kind: 'incomplete', reason: incompleteReason(fields, validated.error) };
  const { draft } = validated;

  const branches = targets.branches.filter((branch) => branch.status === 'ACTIVE' && (!draft.branchIds.length || draft.branchIds.includes(branch.id)));
  if (!branches.length) return { kind: 'incomplete', reason: 'NO_BRANCH' };

  let branch = branches[0];
  let zoneId: string | undefined;
  if (draft.scope === 'DELIVERY') {
    // A delivery fee promotion is always asked about a delivery order. Prefer a Branch that really has one of its
    // areas; when none does the Backend answers ILLUSTRATIVE (no real zone) instead of inventing a real price.
    const zones = targets.deliveryZones.filter((item) => item.status === 'ACTIVE' && (!draft.deliveryZoneIds.length || draft.deliveryZoneIds.includes(item.id)));
    const match = branches.find((candidate) => zones.some((item) => item.branchId === candidate.id));
    if (match) {
      branch = match;
      zoneId = zones.find((item) => item.branchId === match.id)?.id;
    }
  }
  const request: PlannedRequest = {
    draft,
    ...(original ? { promotionId: original.id } : {}),
    branchId: branch.id,
    orderType: draft.scope === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
    ...(zoneId ? { deliveryZoneId: zoneId } : {}),
  };
  return { kind: 'request', request, key: JSON.stringify([request, original?.updatedAt ?? null, original?.status ?? null]) };
}
