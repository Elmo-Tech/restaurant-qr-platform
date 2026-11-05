/** Staff design editor <-> embedded guest menu handshake for the live Meat Lovers draft preview. */
export const MEAT_LOVERS_DESIGN_PREVIEW_READY = 'wayta:meat-lovers-design-preview:ready:v1';
export const MEAT_LOVERS_DESIGN_PREVIEW_UPDATE = 'wayta:meat-lovers-design-preview:update:v1';
export function isMeatLoversPreviewUpdate(
  value: unknown,
): value is { type: typeof MEAT_LOVERS_DESIGN_PREVIEW_UPDATE; settings: unknown } {
  return !!value && typeof value === 'object' && (value as { type?: unknown }).type === MEAT_LOVERS_DESIGN_PREVIEW_UPDATE;
}
