import { ImageResponse } from 'next/og';
import { API_ORIGIN, SERVER_API_BASE_URL } from '../../lib/api/config';
import { getPublicMenu } from '../../lib/public-menu/api';
import { buildRestaurantSeo } from '../../lib/public-menu/restaurant-seo';
import { restaurantSlugFromHost } from '../../lib/public-menu/restaurant-subdomains';
import { shareCardView } from './ShareCardView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WIDTH = 1200;
const HEIGHT = 630;
const MAX_MEDIA_BYTES = 3_000_000;
const SUPPORTED_IMAGES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** Read only small, already-public Wayta media from our private API network. */
async function mediaDataUrl(path: string | null): Promise<string | null> {
  if (!path || !/^\/media\/[a-zA-Z0-9._/-]+$/.test(path) ||
      path.includes('..') || path.includes('//')) return null;
  try {
    const response = await fetch(new URL(path, new URL(SERVER_API_BASE_URL).origin), {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const type = response.headers.get('content-type')?.split(';')[0]?.toLowerCase();
    if (!type || !SUPPORTED_IMAGES.has(type)) {
      await response.body?.cancel();
      return null;
    }
    const declaredSize = Number(response.headers.get('content-length') || '0');
    if (declaredSize > MAX_MEDIA_BYTES) {
      await response.body?.cancel();
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_MEDIA_BYTES) return null;
    return 'data:' + type + ';base64,' + bytes.toString('base64');
  } catch {
    return null; // The text-only branded card still works if an upload is unavailable.
  }
}

export async function GET(request: Request): Promise<Response> {
  const base = process.env.RESTAURANT_BASE_DOMAIN;
  const host = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (process.env.NODE_ENV === 'development') console.log('[seo-host-route]', JSON.stringify({host: request.headers.get('host'), forwarded: request.headers.get('x-forwarded-host'), base, url: request.url}));
  const slug = restaurantSlugFromHost(host, base);
  const primaryHost = new URL(API_ORIGIN).hostname;

  let name = 'Wayta';
  let description = 'Digital QR menus and restaurant ordering, made simple.';
  let coverPath: string | null = null;
  let logoPath: string | null = null;
  let label = 'DIGITAL MENU';

  if (slug) {
    const result = await getPublicMenu(slug, undefined);
    if (result.outcome !== 'found') return new Response('Not Found', { status: 404 });
    const seo = buildRestaurantSeo(result.data, base, API_ORIGIN);
    // Never show another restaurant's branding under a different tenant host.
    if (!seo || seo.canonical !== 'https://' + slug + '.' + base + '/') {
      return new Response('Not Found', { status: 404 });
    }
    name = seo.name;
    description = seo.description;
    coverPath = result.data.context.restaurant.coverAssetPath;
    logoPath = result.data.context.restaurant.logoAssetPath;
    label = 'OFFICIAL RESTAURANT MENU';
  } else if (host !== primaryHost && host !== base) {
    return new Response('Not Found', { status: 404 });
  }

  const [cover, logo] = await Promise.all([mediaDataUrl(coverPath), mediaDataUrl(logoPath)]);
  return new ImageResponse(
    shareCardView({ name, description, cover, logo, label }),
    { width: WIDTH, height: HEIGHT, headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120' } },
  );
}
