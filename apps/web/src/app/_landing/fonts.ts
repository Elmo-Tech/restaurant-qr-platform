import fonts from '../../fonts/landing.module.css';

/**
 * The landing page's display voice. Latin headlines set in Bricolage Grotesque; Arabic glyphs fall through
 * to Readex Pro (a rounded geometric Arabic that sits well beside it). Body text keeps the product's IBM
 * Plex Sans from the root layout. Plex Mono sets prices and order-ticket details.
 *
 * Self-hosted (src/fonts, see its README): each export's `variable` class sets the custom property the
 * landing styles read.
 */
export const display = { variable: fonts.display };
export const displayArabic = { variable: fonts.displayArabic };
export const mono = { variable: fonts.mono };
