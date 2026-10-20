import { Bricolage_Grotesque, IBM_Plex_Mono, Readex_Pro } from 'next/font/google';

/**
 * The landing page's display voice. Latin headlines set in Bricolage Grotesque; Arabic glyphs fall through
 * to Readex Pro (a rounded geometric Arabic that sits well beside it). Body text keeps the product's IBM
 * Plex Sans from the root layout. Plex Mono sets prices and order-ticket details.
 */
export const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--lp-font-display-latin',
  display: 'swap',
});

export const displayArabic = Readex_Pro({
  subsets: ['arabic'],
  weight: ['500', '600', '700'],
  variable: '--lp-font-display-arabic',
  display: 'swap',
});

export const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--lp-font-mono',
  display: 'swap',
});
