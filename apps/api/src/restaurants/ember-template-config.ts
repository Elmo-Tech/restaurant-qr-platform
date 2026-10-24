/** Presentation-only configuration for the first Signature/Premium template. */
export const EMBER_PALETTES = ['EMBER', 'NOIR', 'COPPER'] as const;
export const EMBER_MOTIONS = ['SUBTLE', 'OFF'] as const;
export type EmberPalette = (typeof EMBER_PALETTES)[number];
export type EmberMotion = (typeof EMBER_MOTIONS)[number];

export interface EmberTemplateSettings {
  palette: EmberPalette;
  motion: EmberMotion;
  headlineAr: string;
  headlineEn: string;
  subtitleAr: string;
  subtitleEn: string;
}

export const DEFAULT_EMBER_SETTINGS: EmberTemplateSettings = {
  palette: 'EMBER',
  motion: 'SUBTLE',
  headlineAr: '',
  headlineEn: '',
  subtitleAr: '',
  subtitleEn: '',
};

/** Revalidate stored JSON before rendering; never accept URLs, scripts or custom CSS. */
export function normalizeEmberSettings(value: unknown): EmberTemplateSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...DEFAULT_EMBER_SETTINGS };
  }
  const row = value as Record<string, unknown>;
  const text = (key: string, limit: number): string =>
    typeof row[key] === 'string' ? row[key].trim().slice(0, limit) : '';
  return {
    palette: EMBER_PALETTES.includes(row.palette as EmberPalette)
      ? (row.palette as EmberPalette) : 'EMBER',
    motion: EMBER_MOTIONS.includes(row.motion as EmberMotion)
      ? (row.motion as EmberMotion) : 'SUBTLE',
    headlineAr: text('headlineAr', 80),
    headlineEn: text('headlineEn', 80),
    subtitleAr: text('subtitleAr', 180),
    subtitleEn: text('subtitleEn', 180),
  };
}
