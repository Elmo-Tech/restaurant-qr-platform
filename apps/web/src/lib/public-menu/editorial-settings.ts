/**
 * Presentation-only Editorial option. Defaults to the existing single "From" price.
 * Changing the option never changes effective prices or what checkout charges.
 */
export const EDITORIAL_PRICE_DISPLAYS = ['FROM','ALL_VARIANTS'] as const;
export type EditorialPriceDisplay = typeof EDITORIAL_PRICE_DISPLAYS[number];
export interface EditorialTemplateSettings { priceDisplay: EditorialPriceDisplay }
export const DEFAULT_EDITORIAL_SETTINGS: EditorialTemplateSettings = { priceDisplay: 'FROM' };
export function normalizeEditorialTemplateSettings(value:unknown):EditorialTemplateSettings {
  const row = value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
  return { priceDisplay:row.priceDisplay==='ALL_VARIANTS'?'ALL_VARIANTS':'FROM' };
}
export const EDITORIAL_DESIGN_PREVIEW_READY='wayta:editorial-design-preview:ready:v1';
export const EDITORIAL_DESIGN_PREVIEW_UPDATE='wayta:editorial-design-preview:update:v1';
export function isEditorialPreviewUpdate(input:unknown):input is {type:typeof EDITORIAL_DESIGN_PREVIEW_UPDATE;settings:unknown} {
  return !!input && typeof input==='object' && (input as {type?:unknown}).type===EDITORIAL_DESIGN_PREVIEW_UPDATE;
}
