/** Staff design editor <-> embedded guest menu handshake for the live El Makkboz draft preview. */
export const MAKKBOZ_DESIGN_PREVIEW_READY = 'wayta:makkboz-design-preview:ready:v1';
export const MAKKBOZ_DESIGN_PREVIEW_UPDATE = 'wayta:makkboz-design-preview:update:v1';
export function isMakkbozPreviewUpdate(
  value: unknown,
): value is { type: typeof MAKKBOZ_DESIGN_PREVIEW_UPDATE; settings: unknown } {
  return !!value && typeof value === 'object' && (value as { type?: unknown }).type === MAKKBOZ_DESIGN_PREVIEW_UPDATE;
}
