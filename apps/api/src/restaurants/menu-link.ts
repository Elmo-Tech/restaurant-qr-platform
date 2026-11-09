/** A slug is a public lookup, never an authorization. Opaque table QR links stay unchanged. */
export function restaurantMenuUrl(
  slug: string,
  webOrigin: string,
  subdomainOrigin?: string,
): string {
  if (!subdomainOrigin) return `${webOrigin.replace(/\/+$/, '')}/q/${slug}`;
  const origin = new URL(subdomainOrigin);
  origin.hostname = `${slug}.${origin.hostname}`;
  return origin.origin;
}
