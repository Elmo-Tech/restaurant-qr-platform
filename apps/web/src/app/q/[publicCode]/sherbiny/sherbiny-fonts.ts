import fonts from '../../../../fonts/sherbiny.module.css';

/**
 * Arabic face of the El Sherbiny concept (Noto Sans Arabic). Latin text keeps the concept's Arial stack.
 * Imported only by the exclusive renderer (loaded on demand), so other Restaurants never download it.
 * Self-hosted: see src/fonts.
 */
export const SHERBINY_FONT_CLASSES = fonts.arabic;
