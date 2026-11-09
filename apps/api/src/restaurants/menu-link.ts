import { slugProblem } from './restaurant-slug';

/** A slug is a public lookup, never an authorization. Opaque table QR links stay unchanged. */
export function restaurantMenuUrl(
  slug: string,
  webOrigin: string,
  baseDomain?: string,
): string {
  if (baseDomain && !slugProblem(slug)) return `https://${slug}.${baseDomain}/`;
  return `${webOrigin.replace(/\/+$/, '')}/q/${encodeURIComponent(slug)}`;
}
