import { API_ORIGIN } from '../../lib/api/config';
import { getPublicMenu } from '../../lib/public-menu/api';
import { buildRestaurantSeo } from '../../lib/public-menu/restaurant-seo';
import { restaurantSlugFromHost } from '../../lib/public-menu/restaurant-subdomains';

export const dynamic = 'force-dynamic';
const base = process.env.RESTAURANT_BASE_DOMAIN;
const apiHost = new URL(API_ORIGIN).hostname;

function response(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * Explicit host-aware route instead of the file-based Next.js metadata route:
 * no platform sitemap must ever be cached/reused for a tenant hostname.
 */
export async function GET(request: Request): Promise<Response> {
  const rawHost = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const slug = restaurantSlugFromHost(rawHost, base);
  if (slug) {
    const result = await getPublicMenu(slug, undefined);
    const seo = result.outcome === 'found'
      ? buildRestaurantSeo(result.data, base, API_ORIGIN)
      : null;
    if (!seo || seo.canonical !== 'https://' + slug + '.' + base + '/') {
      return response('User-agent: *\nDisallow: /\n');
    }
    return response(
      'User-agent: *\nAllow: /\nDisallow: /staff/\nDisallow: /login\nDisallow: /api/\nDisallow: /socket.io/\nDisallow: /q/\n' +
      'Sitemap: ' + seo.canonical + 'sitemap.xml\n',
    );
  }

  if (rawHost !== (base || 'waytaapp.com') && rawHost !== apiHost) return response('Not Found', 404);
  return response(
    'User-agent: *\nAllow: /\nDisallow: /staff/\nDisallow: /login\nDisallow: /api/\nDisallow: /socket.io/\n' +
    'Sitemap: https://waytaapp.com/sitemap.xml\n',
  );
}
