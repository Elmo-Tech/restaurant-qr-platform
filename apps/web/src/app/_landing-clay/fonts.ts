import { Baloo_Bhaijaan_2, DM_Sans, Nunito } from 'next/font/google';

/**
 * Claymorphism typography: Nunito for headings (rounded terminals suit soft clay), with Baloo Bhaijaan 2 as
 * its rounded Arabic companion (Nunito has no Arabic glyphs, so Arabic falls through to it), and DM Sans for
 * body text (Arabic body falls through to the app's IBM Plex Sans Arabic).
 */
export const heading = Nunito({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--clay-font-heading-latin',
  display: 'swap',
});

export const headingArabic = Baloo_Bhaijaan_2({
  subsets: ['arabic'],
  weight: ['600', '700', '800'],
  variable: '--clay-font-heading-arabic',
  display: 'swap',
});

export const body = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--clay-font-body',
  display: 'swap',
});
