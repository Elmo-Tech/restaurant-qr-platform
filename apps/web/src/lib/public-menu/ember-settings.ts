/** Published/Draft EMBER display settings; text defaults match its original reference demo. */
export type EmberPalette = 'EMBER' | 'NOIR' | 'COPPER';
export type EmberMotion = 'SUBTLE' | 'OFF';
export type EmberImageMode = 'AUTO' | 'CUSTOM';

export interface EmberTemplateSettings {
  palette: EmberPalette;
  motion: EmberMotion;
  navTaglineAr: string;
  navTaglineEn: string;
  eyebrowAr: string;
  eyebrowEn: string;
  headlineAr: string;
  headlineEn: string;
  subtitleAr: string;
  subtitleEn: string;
  signatureAr: string;
  signatureEn: string;
  marqueeAr: string;
  marqueeEn: string;
  heroImageMode: EmberImageMode;
  /** Server-owned asset returned by the dedicated upload endpoint. */
  heroImageAssetPath: string | null;
}

export interface EmberTemplateConfigView {
  draft: EmberTemplateSettings;
  published: EmberTemplateSettings;
}

export const DEFAULT_EMBER_SETTINGS: EmberTemplateSettings = {
  palette: 'EMBER',
  motion: 'SUBTLE',
  navTaglineAr: "نكهة مختلفة · طعم لا يُنسى",
  navTaglineEn: "BOLD FLAVORS · MADE FRESH",
  eyebrowAr: "THE ART OF THE PERFECT BITE — 01",
  eyebrowEn: "THE ART OF THE PERFECT BITE — 01",
  headlineAr: "FIRE FIRST.",
  headlineEn: "FIRE FIRST.",
  subtitleAr: "مذاق مختلف. أطباق تتحضّر بعناية، وتجربة تستحقها كل مرة.",
  subtitleEn: "Bold flavors. Freshly crafted. Every bite worth remembering.",
  signatureAr: "طازج. مميز. معمول بحب.",
  signatureEn: "FRESH. BOLD. UNFORGETTABLE.",
  marqueeAr: "✳ FRESH FOOD ✳ MADE WITH FIRE ✳ THE REAL DEAL",
  marqueeEn: "✳ FRESH FOOD ✳ MADE WITH FIRE ✳ THE REAL DEAL",
  heroImageMode: 'AUTO',
  heroImageAssetPath: null,
};
