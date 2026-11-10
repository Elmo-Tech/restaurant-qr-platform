import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, base), 'utf8');

test('Restaurant metadata is server-side, tenant-specific, and never indexes table or invalid QR', () => {
  const page = read('app/q/[publicCode]/page.tsx');
  const seo = read('lib/public-menu/restaurant-seo.ts');
  assert.match(page, /export async function generateMetadata/);
  assert.match(page, /getPublicMenu\(publicCode, lang\)/);
  assert.match(page, /outcome !== 'found'/);
  assert.match(page, /index: false/);
  assert.match(page, /if \(designPreview \|\| template\)/);
  assert.match(page, /alternates: \{ canonical: seo.canonical \}/);
  assert.match(page, /summary_large_image/);
  assert.match(page, /restaurantJsonLd\(seo\)/);
  assert.match(seo, /qrType !== 'GENERIC'/);
  assert.match(seo, /validRestaurantHostSlug\(slug\)/);
  assert.match(seo, /seoText\(data.menu.description/);
  assert.match(seo, /restaurant\.logoAssetPath/);
  assert.match(seo, /restaurant\.coverAssetPath/);
  assert.match(seo, /new URL\('\/share-card', canonical\)/);
  assert.match(seo, /\.replace\(\/<\/g, /);
});

test('Internal SSR API request forwards only validated tenant Host to enforce API QR ownership', () => {
  const api = read('lib/public-menu/api.ts');
  assert.match(api, /restaurantSlugFromHost\(incomingHeaders.get\('host'\), baseDomain\)/);
  assert.match(api, /tenantHost \? \{ host: tenantHost \}/);
  assert.match(api, /cache: 'no-store'/);
  assert.doesNotMatch(api, /cookie:\s*incomingHeaders/i);
  assert.match(api, /formerRestaurantCanonicalSlug/);
  assert.match(api, /entry.redirectToSlug !== target/);
  assert.match(api, /headers: \{ host: base \}/);
  const page = read('app/q/[publicCode]/page.tsx');
  assert.match(page, /await formerRestaurantCanonicalSlug\(segment\)/);
});

test('A tenant can fetch only its own social card, robots and sitemap; inactive tenants are not indexed', () => {
  const proxy = read('proxy.ts');
  const card = read('app/share-card/route.tsx');
  const robots = read('app/robots.ts');
  const sitemap = read('app/sitemap.ts');
  for (const route of ['/share-card', '/robots.txt', '/sitemap.xml']) {
    assert.ok(proxy.includes("pathname === '" + route + "'"), route + ' must stay on the restaurant host');
  }
  assert.match(card, /export async function GET/);
  assert.match(card, /width: WIDTH, height: HEIGHT/);
  assert.match(card, /seo.canonical !== 'https:\/\/' \+ slug/);
  assert.match(card, /MAX_MEDIA_BYTES/);
  assert.match(card, /SUPPORTED_IMAGES/);
  assert.match(card, /result.outcome === 'found'/);
  assert.match(robots, /disallow: '\/'/);
  assert.match(robots, /sitemap: seo.canonical \+ 'sitemap.xml'/);
  assert.match(sitemap, /if \(!seo \|\| seo.canonical !==/);
  assert.match(sitemap, /return \[\]/);
});

test('Wayta landing keeps its own indexed identity and internal pages are noindex', () => {
  const home = read('app/page.tsx');
  const root = read('app/layout.tsx');
  const staff = read('app/staff/layout.tsx');
  const login = read('app/login/page.tsx');
  assert.match(home, /canonical: 'https:\/\/waytaapp.com\/'/);
  assert.match(home, /siteName: 'Wayta'/);
  assert.match(home, /https:\/\/waytaapp.com\/share-card/);
  assert.match(root, /metadataBase: new URL\('https:\/\/waytaapp.com'\)/);
  assert.match(staff, /index: false, follow: false/);
  assert.match(login, /index: false, follow: false/);
});
