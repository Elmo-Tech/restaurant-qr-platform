import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { API_ORIGIN } from '../lib/api/config';
import { getPublicMenu } from '../lib/public-menu/api';
import { buildRestaurantSeo } from '../lib/public-menu/restaurant-seo';
import { restaurantSlugFromHost } from '../lib/public-menu/restaurant-subdomains';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.RESTAURANT_BASE_DOMAIN;
  const slug = restaurantSlugFromHost((await headers()).get('host'), base);
  if (!slug) return [{ url: 'https://waytaapp.com/', changeFrequency: 'weekly', priority: 1 }];

  const result = await getPublicMenu(slug, undefined);
  const seo = result.outcome === 'found'
    ? buildRestaurantSeo(result.data, base, API_ORIGIN)
    : null;
  // Never enumerate other restaurants or index an inactive subscription or Table QR.
  if (!seo || seo.canonical !== 'https://' + slug + '.' + base + '/') return [];
  return [{ url: seo.canonical, changeFrequency: 'daily', priority: 0.8 }];
}
