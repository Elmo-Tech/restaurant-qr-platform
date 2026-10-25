/**
 * A small, restaurant-scoped display preference; never used to calculate order prices.
 * The existing Editorial design remains unchanged until explicitly switched to ALL_VARIANTS.
 */
export const EDITORIAL_PRICE_DISPLAYS = ['FROM', 'ALL_VARIANTS'] as const;
export type EditorialPriceDisplay = typeof EDITORIAL_PRICE_DISPLAYS[number];

export interface EditorialTemplateSettings {
  priceDisplay: EditorialPriceDisplay;
}

export const DEFAULT_EDITORIAL_SETTINGS: EditorialTemplateSettings = {
  priceDisplay: 'FROM',
};

export function normalizeEditorialSettings(value: unknown): EditorialTemplateSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_EDITORIAL_SETTINGS };
  }
  const row = value as Record<string, unknown>;
  return {
    priceDisplay: row.priceDisplay === 'ALL_VARIANTS' ? 'ALL_VARIANTS' : 'FROM',
  };
}
