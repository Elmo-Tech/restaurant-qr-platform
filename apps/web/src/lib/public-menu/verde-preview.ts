/** Staff design editor <-> embedded guest menu handshake for the live VERDE draft preview. */
export const VERDE_DESIGN_PREVIEW_READY = 'wayta:verde-design-preview:ready:v1';
export const VERDE_DESIGN_PREVIEW_UPDATE = 'wayta:verde-design-preview:update:v1';
export function isVerdePreviewUpdate(
  value: unknown,
): value is { type: typeof VERDE_DESIGN_PREVIEW_UPDATE; settings: unknown } {
  return !!value && typeof value === 'object' && (value as { type?: unknown }).type === VERDE_DESIGN_PREVIEW_UPDATE;
}
