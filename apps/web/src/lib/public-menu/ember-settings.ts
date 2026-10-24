/** Shared presentation-only shape of the published/draft EMBER configuration. */
export type EmberPalette = 'EMBER' | 'NOIR' | 'COPPER';
export type EmberMotion = 'SUBTLE' | 'OFF';

export interface EmberTemplateSettings {
  palette: EmberPalette;
  motion: EmberMotion;
  headlineAr: string;
  headlineEn: string;
  subtitleAr: string;
  subtitleEn: string;
}

export interface EmberTemplateConfigView {
  draft: EmberTemplateSettings;
  published: EmberTemplateSettings;
}

export const DEFAULT_EMBER_SETTINGS: EmberTemplateSettings = {
  palette: 'EMBER',
  motion: 'SUBTLE',
  headlineAr: '',
  headlineEn: '',
  subtitleAr: '',
  subtitleEn: '',
};
