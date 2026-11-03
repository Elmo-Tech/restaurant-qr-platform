import fonts from '../../fonts/landing-clay.module.css';

/**
 * Claymorphism typography: Nunito for headings (rounded terminals suit soft clay), with Baloo Bhaijaan 2 as
 * its rounded Arabic companion (Nunito has no Arabic glyphs, so Arabic falls through to it), and DM Sans for
 * body text (Arabic body falls through to the app's IBM Plex Sans Arabic).
 *
 * Self-hosted (src/fonts, see its README): each export's `variable` class sets the custom property the
 * landing styles read.
 */
export const heading = { variable: fonts.heading };
export const headingArabic = { variable: fonts.headingArabic };
export const body = { variable: fonts.body };
