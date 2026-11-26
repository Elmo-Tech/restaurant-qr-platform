import type { DiscountType, PromotionScope } from './api.ts';
import type { DraftFields } from './draft.ts';
import type { MessageKey } from '../i18n/messages';

export interface SentencePart { key: MessageKey; params: Record<string, string> }

/** Keeps a number or currency run in one left-to-right piece inside an Arabic or English sentence. */
export const isolateLtr = (text: string) => `\u2066${text}\u2069`;

const present = (value: string) => value.trim() !== '';

/**
 * The plain-language sentences shown under the discount fields: what the customer gets, with the entered values inserted
 * as text. No formula, no calculation: it only names what Staff typed.
 */
export function describePromotion(fields: Pick<DraftFields, 'scope' | 'discountType' | 'value' | 'minimumSubtotal' | 'minimumQuantity' | 'quantityBasis'>, currencyCode: string): SentencePart[] {
  const scope: PromotionScope = fields.scope;
  const type: DiscountType = fields.discountType;
  if (!present(fields.value)) return [{ key: 'promotions.sentence.pending', params: {} }];
  const value = isolateLtr(type === 'PERCENTAGE' ? `${fields.value.trim()}%` : `${fields.value.trim()} ${currencyCode}`);
  const parts: SentencePart[] = [{ key: `promotions.sentence.discount.${scope}.${type}` as MessageKey, params: { value } }];
  const minimum = present(fields.minimumSubtotal) ? isolateLtr(`${fields.minimumSubtotal.trim()} ${currencyCode}`) : null;
  if (scope === 'CART' && minimum) parts.push({ key: 'promotions.sentence.condition.CART', params: { minimum } });
  if (scope === 'DELIVERY' && minimum) parts.push({ key: 'promotions.sentence.condition.DELIVERY', params: { minimum } });
  if (scope === 'QUANTITY' && present(fields.minimumQuantity)) {
    const basis = fields.quantityBasis === 'DISTINCT_PRODUCTS' ? 'DISTINCT_PRODUCTS' : 'UNITS';
    parts.push({ key: `promotions.sentence.condition.QUANTITY.${basis}` as MessageKey, params: { quantity: isolateLtr(fields.minimumQuantity.trim()) } });
    if (minimum) parts.push({ key: 'promotions.sentence.condition.QUANTITY.spend', params: { minimum } });
  }
  parts.push({ key: 'promotions.sentence.competition', params: {} });
  return parts;
}
