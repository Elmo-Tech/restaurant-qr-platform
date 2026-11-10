import { ImageResponse } from 'next/og';
import { API_ORIGIN, SERVER_API_BASE_URL } from '../../lib/api/config';
import { getPublicMenu } from '../../lib/public-menu/api';
import { buildRestaurantSeo, seoText } from '../../lib/public-menu/restaurant-seo';
import { restaurantSlugFromHost } from '../../lib/public-menu/restaurant-subdomains';

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
  const slug = restaurantSlugFromHost(host, base);
  const primaryHost = new URL(API_ORIGIN).hostname;

  let name = 'Wayta';
  let description = 'Digital QR menus and restaurant ordering, made simple.';
  let coverPath: string | null = null;
  let logoPath: string | null = null;
  let label = 'DIGITAL MENU';

  if (slug) {
    const result = await getPublicMenu(slug, undefined);
    const seo = result.outcome === 'found'
      ? buildRestaurantSeo(result.data, base, API_ORIGIN)
      : null;
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
  const headline = seoText(name, 55);
  const subtitle = seoText(description, 125);

  return new ImageResponse(
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', position: 'relative',
        backgroundColor: '#14232b', color: '#ffffff', padding: '56px',
        fontFamily: 'sans-serif', overflow: 'hidden',
      }}
    >
      {cover ? (
        // ImageResponse uses ordinary img tags; the source is bounded public image bytes.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" width={WIDTH} height={HEIGHT} style={{
          position: 'absolute', top: 0, left: 0, width: WIDTH, height: HEIGHT,
          objectFit: 'cover', opacity: 0.5,
        }} />
      ) : null}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        background: 'linear-gradient(90deg, rgba(8,19,25,0.96) 0%, rgba(8,19,25,0.72) 72%, rgba(8,19,25,0.35) 100%)',
      }} />
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {logo ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 116, height: 116, backgroundColor: '#ffffff',
              borderRadius: 24, padding: 12,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" width={92} height={92} style={{ objectFit: 'contain' }} />
            </div>
          ) : (
            <div style={{
              width: 104, height: 104, borderRadius: 24, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#e5bb78', color: '#132b30', fontSize: 56, fontWeight: 800,
            }}>W</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 24, letterSpacing: 3, fontWeight: 700, color: '#f0cfa0' }}>{label}</div>
            <div style={{ fontSize: 23, color: '#f4f5f6' }}>waytaapp.com</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1050 }}>
          <div style={{
            fontSize: headline.length > 34 ? 51 : 68, lineHeight: 1.19,
            fontWeight: 750, whiteSpace: 'pre-wrap',
          }}>{headline}</div>
          <div style={{
            fontSize: 28, lineHeight: 1.45, color: '#ecedf0',
            whiteSpace: 'pre-wrap',
          }}>{subtitle}</div>
        </div>
      </div>
    </div>,
    { width: WIDTH, height: HEIGHT, headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120' } },
  );
}
