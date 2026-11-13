import { prepareFoodTagAliases } from './food-tag-dictionary.service';

function sample() {
  return {
    nameAr: 'دجاج',
    nameEn: 'Chicken',
    nameIt: 'Pollo',
    aliasesAr: ['فراخ', ' دجاج '],
    aliasesEn: ['CHICKEN', 'Chicken breast'],
    aliasesIt: ['POLLO', 'Petto di pollo'],
  };
}

describe('food tag editor normalization', () => {
  it('always indexes canonical labels and deduplicates aliases per language', () => {
    const prepared = prepareFoodTagAliases(sample());
    expect(prepared.filter((row) => row.locale === 'ar')).toHaveLength(2);
    expect(prepared.filter((row) => row.locale === 'en')).toHaveLength(2);
    expect(prepared.filter((row) => row.locale === 'it')).toHaveLength(2);
    expect(prepared).toEqual(
      expect.arrayContaining([
        { locale: 'ar', term: 'دجاج', normalized: 'دجاج' },
        { locale: 'en', term: 'Chicken', normalized: 'chicken' },
        { locale: 'it', term: 'Pollo', normalized: 'pollo' },
      ]),
    );
  });

  it('retains different per-language meanings instead of silently merging tags', () => {
    const prepared = prepareFoodTagAliases({
      ...sample(),
      nameEn: 'Latte',
      nameIt: 'Latte',
      aliasesEn: [],
      aliasesIt: [],
    });
    expect(prepared).toContainEqual({
      locale: 'en',
      term: 'Latte',
      normalized: 'latte',
    });
    expect(prepared).toContainEqual({
      locale: 'it',
      term: 'Latte',
      normalized: 'latte',
    });
  });

  it('rejects alias terms with no searchable letters or numbers', () => {
    expect(() =>
      prepareFoodTagAliases({ ...sample(), aliasesAr: ['!!'] }),
    ).toThrow();
  });
});
