import fonts from '../../../../fonts/verde.module.css';

/**
 * Type of the approved VERDE concept: Barlow Condensed for the poster-style Latin display,
 * DM Sans for Latin UI, Tajawal for Arabic. Imported only by the VERDE renderer (which is loaded
 * on demand), so other Restaurants' menus never download these faces. Self-hosted: see src/fonts.
 */
export const VERDE_FONT_CLASSES = `${fonts.display} ${fonts.latin} ${fonts.arabic}`;
