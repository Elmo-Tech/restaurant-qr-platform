import type { PublicMenuData } from './types';
import { genericMenuUrl, validRestaurantHostSlug } from './restaurant-subdomains';

export interface RestaurantSeo {
  name: string;
  title: string;
  description: string;
  canonical: string;
  image: string;
  logo: string | null;
  cover: string | null;
  locale: 'ar_EG' | 'en_US';
}

/** User-maintained menu descriptions are public content, not HTML or SEO markup. */
export function seoText(raw: string | null | undefined, maxLength: number): string {
  const clean = (raw ?? '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return [...clean].slice(0, maxLength).join('');
}

/** Only public upload paths can become preview images. Never use arbitrary URLs. */
export function publicSeoImage(assetPath: string | null | undefined, canonical: string): string | null {
  if (!assetPath || !/^\/media\/[a-zA-Z0-9._/-]+$/.test(assetPath) ||
      assetPath.includes('..') || assetPath.includes('//')) return null;
  return new URL(assetPath, canonical).href;
}

/** One canonical, published GENERIC menu per restaurant. Table QRs are never indexed. */
export function buildRestaurantSeo(
  data: PublicMenuData,
  baseDomain: string | undefined,
  legacyOrigin: string,
): RestaurantSeo | null {
  const slug = data.context.restaurant.shareCode;
  if (data.context.qrType !== 'GENERIC' || !slug || !validRestaurantHostSlug(slug)) return null;
  const base = baseDomain && /^[a-z0-9.-]+$/.test(baseDomain) ? baseDomain.toLowerCase() : undefined;
  const canonical = genericMenuUrl(legacyOrigin, slug, base);
  const name = seoText(data.context.restaurant.name, 90);
  if (!name) return null;
  const arabic = data.locale.resolved.toLowerCase().startsWith('ar');
  const title = name + (arabic ? ' | المنيو والأسعار' : ' | Menu & prices');
  const description = seoText(data.menu.description, 165) ||
    (arabic
      ? 'تصفح منيو ' + name + ' وشاهد الأصناف والأسعار.'
      : 'Explore the menu, dishes and prices at ' + name + '.');
  return {
    name,
    title,
    description,
    canonical,
    // A correctly sized 1200x630 share card embeds the cover/logo and restaurant name.
    image: new URL('/share-card', canonical).href,
    logo: publicSeoImage(data.context.restaurant.logoAssetPath, canonical),
    cover: publicSeoImage(data.context.restaurant.coverAssetPath, canonical),
    locale: arabic ? 'ar_EG' : 'en_US',
  };
}

/** JSON-LD is emitted only for a public, active GENERIC restaurant menu. */
export function restaurantJsonLd(seo: RestaurantSeo): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: seo.name,
    description: seo.description,
    url: seo.canonical,
    ...(seo.logo ? { logo: seo.logo } : {}),
    ...(seo.cover ? { image: seo.cover } : {}),
  };
  // No inline HTML/script injection from restaurant-controlled names/descriptions.
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
