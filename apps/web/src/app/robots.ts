import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { API_ORIGIN } from '../lib/api/config';
import { getPublicMenu } from '../lib/public-menu/api';
import { buildRestaurantSeo } from '../lib/public-menu/restaurant-seo';
import { restaurantSlugFromHost } from '../lib/public-menu/restaurant-subdomains';

export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = process.env.RESTAURANT_BASE_DOMAIN;
  const slug = restaurantSlugFromHost((await headers()).get('host'), base);
  if (slug) {
    const result = await getPublicMenu(slug, undefined);
    const seo = result.outcome === 'found'
      ? buildRestaurantSeo(result.data, base, API_ORIGIN)
      : null;
    const active = seo?.canonical === 'https://' + slug + '.' + base + '/';
    if (!active) return { rules: [{ userAgent: '*', disallow: '/' }] };
    return {
      rules: [{
        userAgent: '*', allow: '/',
        disallow: ['/staff/', '/api/', '/socket.io/', '/q/'],
      }],
      sitemap: seo.canonical + 'sitemap.xml',
    };
  }
  return {
    rules: [{
      userAgent: '*', allow: '/',
      disallow: ['/staff/', '/api/', '/socket.io/'],
    }],
    sitemap: 'https://waytaapp.com/sitemap.xml',
  };
}
