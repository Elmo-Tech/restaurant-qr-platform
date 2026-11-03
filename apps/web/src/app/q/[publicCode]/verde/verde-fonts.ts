import { Barlow_Condensed, DM_Sans, Tajawal } from 'next/font/google';

/**
 * Type of the approved VERDE concept: Barlow Condensed for the poster-style Latin display,
 * DM Sans for Latin UI, Tajawal for Arabic. Imported only by the VERDE renderer (which is loaded
 * on demand), so other Restaurants' menus never download these faces.
 */
const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--v-font-display',
  display: 'swap',
});
const latin = DM_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--v-font-latin',
  display: 'swap',
});
const arabic = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['500', '700', '800', '900'],
  variable: '--v-font-arabic',
  display: 'swap',
});

export const VERDE_FONT_CLASSES = `${display.variable} ${latin.variable} ${arabic.variable}`;
