import {
  PLATFORM_SUPPORTED_LOCALES,
  isPlatformSupportedLocale,
  normalizePlatformLocale,
} from './platform-locales';

describe('PLATFORM_SUPPORTED_LOCALES', () => {
  it('is exactly en and ar, in this order', () => {
    expect(PLATFORM_SUPPORTED_LOCALES).toEqual(['en', 'ar']);
  });
});

describe('isPlatformSupportedLocale', () => {
  it.each(['en', 'ar'])('accepts %s', (locale) => {
    expect(isPlatformSupportedLocale(locale)).toBe(true);
  });

  it.each([
    'fr',
    'de',
    'EN',
    'En',
    'en-US',
    'en-us',
    'ar-EG',
    'ar-eg',
    '',
    'english',
    'arabic',
  ])('rejects %s', (value) => {
    expect(isPlatformSupportedLocale(value)).toBe(false);
  });
});

describe('normalizePlatformLocale', () => {
  it.each([
    ['en', 'en'],
    ['ar', 'ar'],
    ['EN', 'en'],
    ['AR', 'ar'],
    [' en ', 'en'],
    ['  ar', 'ar'],
    ['En', 'en'],
  ])('normalizes %s -> %s', (input, expected) => {
    expect(normalizePlatformLocale(input)).toBe(expected);
  });

  it.each(['fr', 'en-US', 'en-us', 'ar-EG', 'ar-eg', '', '  ', 'english'])(
    'returns null for unsupported %s',
    (value) => {
      expect(normalizePlatformLocale(value)).toBeNull();
    },
  );

  it.each([undefined, null, 42, {}, [], true])(
    'returns null for non-string input %p',
    (value) => {
      expect(normalizePlatformLocale(value)).toBeNull();
    },
  );
});
