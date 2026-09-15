import { resolvePublicLocale } from './public-locale';

describe('resolvePublicLocale', () => {
  it('uses a valid, currently-active explicit ?lang', () => {
    const result = resolvePublicLocale({
      explicitLang: 'ar',
      acceptLanguageHeader: null,
      activeLocales: ['en', 'ar'],
      defaultLocale: 'en',
    });

    expect(result).toEqual({ requested: 'ar', resolved: 'ar' });
  });

  it('falls back to the default locale when the explicit ?lang is unsupported, never consulting Accept-Language', () => {
    const result = resolvePublicLocale({
      explicitLang: 'fr',
      acceptLanguageHeader: 'ar',
      activeLocales: ['en', 'ar'],
      defaultLocale: 'en',
    });

    expect(result).toEqual({ requested: 'fr', resolved: 'en' });
  });

  it('falls back to the default locale when the explicit ?lang is currently inactive for the Restaurant, never consulting Accept-Language', () => {
    const result = resolvePublicLocale({
      explicitLang: 'ar',
      acceptLanguageHeader: 'ar',
      activeLocales: ['en'],
      defaultLocale: 'en',
    });

    expect(result).toEqual({ requested: 'ar', resolved: 'en' });
  });

  it('matches an Accept-Language preference against an active Restaurant locale when no explicit lang is given', () => {
    const result = resolvePublicLocale({
      explicitLang: null,
      acceptLanguageHeader: 'ar-EG,en;q=0.8',
      activeLocales: ['en', 'ar'],
      defaultLocale: 'en',
    });

    expect(result).toEqual({ requested: null, resolved: 'ar' });
  });

  it('respects Accept-Language quality weighting over list order', () => {
    const result = resolvePublicLocale({
      explicitLang: null,
      acceptLanguageHeader: 'en;q=0.5,ar;q=0.9',
      activeLocales: ['en', 'ar'],
      defaultLocale: 'en',
    });

    expect(result).toEqual({ requested: null, resolved: 'ar' });
  });

  it('falls back to the default locale when Accept-Language matches no active locale', () => {
    const result = resolvePublicLocale({
      explicitLang: null,
      acceptLanguageHeader: 'fr-FR,de;q=0.8',
      activeLocales: ['en', 'ar'],
      defaultLocale: 'en',
    });

    expect(result).toEqual({ requested: null, resolved: 'en' });
  });

  it('falls back to the default locale when there is no explicit lang and no Accept-Language header', () => {
    const result = resolvePublicLocale({
      explicitLang: null,
      acceptLanguageHeader: null,
      activeLocales: ['en', 'ar'],
      defaultLocale: 'en',
    });

    expect(result).toEqual({ requested: null, resolved: 'en' });
  });

  it('never crashes on a malformed Accept-Language header', () => {
    const result = resolvePublicLocale({
      explicitLang: null,
      acceptLanguageHeader: ';;q=,,',
      activeLocales: ['en', 'ar'],
      defaultLocale: 'en',
    });

    expect(result).toEqual({ requested: null, resolved: 'en' });
  });
});
