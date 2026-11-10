import { API_ORIGIN } from '../../lib/api/config';
import { getPublicMenu } from '../../lib/public-menu/api';
import { buildRestaurantSeo } from '../../lib/public-menu/restaurant-seo';
import { restaurantSlugFromHost } from '../../lib/public-menu/restaurant-subdomains';

export const dynamic = 'force-dynamic';
const base = process.env.RESTAURANT_BASE_DOMAIN;
const apiHost = new URL(API_ORIGIN).hostname;

function xml(url: string | null): Response {
  // Only a validated canonical URL ever reaches this function.
  const item = url
    ? '<url><loc>' + url.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</loc></url>'
    : '';
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    item + '</urlset>\n';
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Never enumerate cross-tenant restaurant URLs on the platform sitemap. */
export async function GET(request: Request): Promise<Response> {
  const rawHost = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const slug = restaurantSlugFromHost(rawHost, base);
  if (slug) {
    const result = await getPublicMenu(slug, undefined);
    const seo = result.outcome === 'found'
      ? buildRestaurantSeo(result.data, base, API_ORIGIN)
      : null;
    return xml(seo?.canonical === 'https://' + slug + '.' + base + '/' ? seo.canonical : null);
  }
  if (rawHost !== (base || 'waytaapp.com') && rawHost !== apiHost) {
    return new Response('Not Found', { status: 404 });
  }
  return xml('https://waytaapp.com/');
}
