/** Staff design editor <-> embedded guest menu handshake for the live El Sherbiny draft preview. */
export const SHERBINY_DESIGN_PREVIEW_READY = 'wayta:sherbiny-design-preview:ready:v1';
export const SHERBINY_DESIGN_PREVIEW_UPDATE = 'wayta:sherbiny-design-preview:update:v1';
export function isSherbinyPreviewUpdate(
  value: unknown,
): value is { type: typeof SHERBINY_DESIGN_PREVIEW_UPDATE; settings: unknown } {
  return !!value && typeof value === 'object' && (value as { type?: unknown }).type === SHERBINY_DESIGN_PREVIEW_UPDATE;
}
