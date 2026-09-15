import { API_ORIGIN } from '../api/config';

/**
 * The one place that turns a Backend-stored relative asset path (e.g.
 * `/media/<uuid>.jpg`) into an absolute, browser-loadable URL (FT-2,
 * Section 18) -- every place that needs to display a Product/Category
 * image (Staff Product Editor, Staff Product list, and later the Public
 * Menu) must go through this helper rather than concatenating strings
 * itself. Returns `null` unchanged so callers can render their own
 * placeholder for "no image" without a separate null-check convention.
 */
export function resolveAssetUrl(assetPath: string | null | undefined): string | null {
  if (!assetPath) return null;
  return `${API_ORIGIN}${assetPath}`;
}
