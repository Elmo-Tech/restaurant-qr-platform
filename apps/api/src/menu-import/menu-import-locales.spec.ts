import { defaultText, keepActiveText } from './menu-import-locales';

const ARABIC_ONLY = new Set(['ar']);
const BOTH = new Set(['ar', 'en']);

describe('menu import: which language the text ends up in', () => {
  it('uses the default language, else the first language with a text', () => {
    expect(defaultText({ ar: 'مشروب', en: 'Drink' }, 'ar')).toBe('مشروب');
    expect(defaultText({ en: 'Drink' }, 'ar')).toBe('Drink');
    expect(defaultText({ fr: 'Boisson', en: 'Drink' }, 'ar')).toBe('Drink'); // first by language code
    expect(defaultText({}, 'ar')).toBeUndefined();
  });

  it('keeps the text in the active languages and drops the others when there is a choice', () => {
    expect(keepActiveText({ ar: 'صغير', en: 'S' }, ARABIC_ONLY, 'ar')).toEqual({
      ar: 'صغير',
    });
    expect(keepActiveText({ ar: 'صغير', en: 'S' }, BOTH, 'ar')).toEqual({
      ar: 'صغير',
      en: 'S',
    });
  });

  it('keeps text written only in a language the restaurant does not use, as it is, under the default language', () => {
    // A size labelled "S / M / L" in a restaurant that works in Arabic only: it used to vanish, and the size with it.
    expect(keepActiveText({ en: 'S' }, ARABIC_ONLY, 'ar')).toEqual({ ar: 'S' });
    // A category written only in English.
    expect(keepActiveText({ en: 'BURGER' }, ARABIC_ONLY, 'ar')).toEqual({
      ar: 'BURGER',
    });
  });

  it('gives back nothing when there is no text at all', () => {
    expect(keepActiveText({}, ARABIC_ONLY, 'ar')).toEqual({});
  });
});
