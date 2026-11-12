import { FOOD_TAG_CATALOG, FOOD_TAG_RELATIONS } from './food-tag-catalog';
import { normalizeFoodText, suggestFoodTagCodes } from './food-tag-matcher';

const tags = FOOD_TAG_CATALOG.map((entry) => ({
  code: entry.code,
  aliases: [...entry.aliases.ar, ...entry.aliases.en, ...entry.aliases.it],
}));

describe('platform food tag catalog and conservative matching', () => {
  it('contains an extensive, unique, trilingual, multi-sector vocabulary', () => {
    const keys = FOOD_TAG_CATALOG.map((item) => item.code);
    expect(keys.length).toBeGreaterThan(350);
    expect(new Set(keys).size).toBe(keys.length);
    expect(FOOD_TAG_CATALOG.every((t) => t.nameAr && t.nameEn && t.nameIt)).toBe(true);
    expect(FOOD_TAG_CATALOG.reduce((n, t) => n + t.aliases.ar.length + t.aliases.en.length + t.aliases.it.length, 0)).toBeGreaterThan(1200);
    expect(FOOD_TAG_RELATIONS.every(([from, to]) => from !== to && keys.includes(from) && keys.includes(to))).toBe(true);
  });

  it('normalizes Arabic and Italian without turning related items into synonyms', () => {
    expect(normalizeFoodText('بِيتزا فَرَاخ')).toBe('بيتزا فراخ');
    expect(normalizeFoodText('Caffè al limone')).toBe('caffe al limone');
  });

  it('understands trilingual product titles from explicit words', () => {
    expect(suggestFoodTagCodes('beef_burger.jpg', tags)).toEqual(expect.arrayContaining(['BEEF', 'BURGER']));
    expect(suggestFoodTagCodes('بيتزا فراخ.png', tags)).toEqual(expect.arrayContaining(['PIZZA', 'CHICKEN']));
    expect(suggestFoodTagCodes('Pollo alla griglia.webp', tags)).toEqual(expect.arrayContaining(['CHICKEN', 'GRILLED']));
  });

  it('never infers RAW, COOKED, or sectors from tags or filenames', () => {
    expect(suggestFoodTagCodes('Beef.jpg', tags)).toContain('BEEF');
    expect(suggestFoodTagCodes('Beef.jpg', tags)).not.toContain('STEAK');
    expect(suggestFoodTagCodes('IMG_0087.jpg', tags)).toEqual([]);
  });

  it('does not match partial terms or cross-language false friends', () => {
    const basic = [
      { code: 'MILK', aliases: ['Milk', 'Latte'] },
      { code: 'LATTE', aliases: ['Latte', 'Caffè latte'] },
      { code: 'BURGER', aliases: ['Burger'] },
    ];
    expect(suggestFoodTagCodes('Latte.jpg', basic)).toEqual([]);
    expect(suggestFoodTagCodes('Burgersauce.jpg', basic)).toEqual([]);
    expect(suggestFoodTagCodes('Caffè latte.jpg', basic)).toEqual(['LATTE']);
  });
});
