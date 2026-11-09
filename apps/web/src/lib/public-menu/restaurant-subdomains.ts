/**
 * Restaurant hostname boundary. A single left-most slug labels a tenant; nested names,
 * localhost, reserved infrastructure names and unrelated hosts are never restaurant menus.
 * No DNS lookup or user-controlled URL concatenation is performed here.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set([
  'admin', 'api', 'app', 'auth', 'cdn', 'control', 'dashboard', 'demo',
  'kitchen', 'login', 'logout', 'mail', 'menu', 'new', 'platform', 'q',
  'qr', 'restaurant', 'restaurants', 'staff', 'static', 'support', 'www',
]);

export function validRestaurantHostSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 40 && SLUG.test(slug) && !RESERVED.has(slug);
}

/** Returns null unless the host is *exactly* one safe restaurant label below baseDomain. */
export function restaurantSlugFromHost(host: string | null, baseDomain: string | undefined): string | null {
  if (!host || !baseDomain || !/^[a-z0-9.-]+$/.test(baseDomain)) return null;
  const hostname = host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const base = baseDomain.toLowerCase().replace(/\.$/, '');
  const suffix = `.${base}`;
  if (!hostname.endsWith(suffix)) return null;
  const slug = hostname.slice(0, -suffix.length);
  return validRestaurantHostSlug(slug) ? slug : null;
}

/** The canonical *generic* menu URL; opaque 43-character Table QR URLs never use this. */
export function genericMenuUrl(
  origin: string,
  segment: string,
  baseDomain: string | undefined,
): string {
  if (baseDomain && validRestaurantHostSlug(segment)) {
    return `https://${segment}.${baseDomain.toLowerCase()}/`;
  }
  return `${origin.replace(/\/$/, '')}/q/${encodeURIComponent(segment)}`;
}
