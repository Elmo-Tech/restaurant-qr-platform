import {
  ONBOARDING_MENU_LIMITS,
  sanitizeOnboardingMenuDraft,
  validateOnboardingMenuDraft,
  type OnboardingMenuDraft,
} from './onboarding-menu';

const en = (name: string) => ({ locale: 'en', name });
const draft = (): OnboardingMenuDraft => ({
  menus: [
    {
      translations: [{ locale: ' EN ', name: ' Brunch ', description: '  ' }],
      categories: [
        {
          translations: [en('Breakfast')],
          products: [
            {
              translations: [en('Coffee')],
              price: '12.50',
              variants: [{ translations: [en('Small')], price: '12.50' }],
              modifierGroups: [
                {
                  translations: [
                    { ...en('Extra'), description: '  Select one  ' },
                  ],
                  minSelections: 1,
                  maxSelections: 1,
                  options: [{ translations: [en('Milk')], price: '0' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});
const productPath = 'menus[0].categories[0].products[0]';
const defaultLocales = { defaultLocale: 'en', activeLocales: ['ar', 'en'] };

function validated(input: unknown) {
  const result = sanitizeOnboardingMenuDraft(input);
  if (!result.ok)
    throw new Error(`Invalid test input: ${result.problems.join(', ')}`);
  return result.value;
}

describe('onboarding menu draft contract', () => {
  it('normalizes names and locales without inventing translations or altering money', () => {
    const original = draft();
    const result = validated(original);
    expect(result.menus[0].translations).toEqual([en('Brunch')]);
    expect(original.menus[0].translations[0].name).toBe(' Brunch ');
    const product = result.menus[0].categories[0].products[0];
    expect(product.price).toBe('12.50');
    expect(product.modifierGroups[0].translations[0].description).toBe(
      'Select one',
    );
    expect(validateOnboardingMenuDraft(result, defaultLocales)).toEqual([]);
  });

  it('refuses unknown fields at every depth without reporting their names or values', () => {
    const value = draft();
    const product = value.menus[0].categories[0].products[0];
    Object.assign(product.modifierGroups[0].options[0], {
      modifierGroupId: 'out-of-scope',
      secret: 'do not echo',
    });
    expect(sanitizeOnboardingMenuDraft(value)).toEqual({
      ok: false,
      problems: [`${productPath}.modifierGroups[0].options[0]`],
    });
    expect(
      sanitizeOnboardingMenuDraft({ ...draft(), restaurantId: 'out-of-scope' }),
    ).toEqual({ ok: false, problems: ['menuDraft'] });
  });

  it('does not silently drop descriptions that the variant and option models cannot store', () => {
    const value = draft();
    const [variant] = value.menus[0].categories[0].products[0].variants;
    Object.assign(variant.translations[0], {
      description: 'Undeliverable text',
    });
    expect(sanitizeOnboardingMenuDraft(value)).toEqual({
      ok: false,
      problems: [`${productPath}.variants[0].translations[0]`],
    });
  });

  it.each([2.5, '-2.50', '1.005', '01.25', '1e3', ' 2', '1000000000000', null])(
    'refuses invalid money %p',
    (price) => {
      const value = draft();
      Object.assign(value.menus[0].categories[0].products[0], { price });
      expect(sanitizeOnboardingMenuDraft(value)).toEqual({
        ok: false,
        problems: [`${productPath}.price`],
      });
    },
  );

  it('retains only valid draft shapes and blocks incomplete names, prices and impossible required choices', () => {
    const value = draft();
    const [product] = value.menus[0].categories[0].products;
    product.price = '';
    product.translations = [en('   ')];
    product.variants[0].translations = [];
    product.modifierGroups[0].minSelections = 2;
    expect(
      validateOnboardingMenuDraft(validated(value), defaultLocales),
    ).toEqual([
      `${productPath}.translations[0].name`,
      `${productPath}.price`,
      `${productPath}.variants[0].translations`,
      `${productPath}.modifierGroups[0].maxSelections`,
      `${productPath}.modifierGroups[0].minSelections`,
    ]);
    expect(
      validateOnboardingMenuDraft(validated({ menus: [] }), defaultLocales),
    ).toEqual(['menus']);
  });

  it('does not allow duplicate, unsupported, or inactive translations', () => {
    const value = draft();
    value.menus[0].translations.push(en('Duplicate locale'));
    expect(sanitizeOnboardingMenuDraft(value)).toEqual({
      ok: false,
      problems: ['menus[0].translations[1].locale'],
    });
    value.menus[0].translations[1] = {
      locale: 'en-us',
      name: 'Unsupported locale',
    };
    expect(sanitizeOnboardingMenuDraft(value)).toEqual({
      ok: false,
      problems: ['menus[0].translations[1].locale'],
    });
    value.menus[0].translations[1] = { locale: 'ar', name: 'قائمة' };
    expect(
      validateOnboardingMenuDraft(validated(value), {
        defaultLocale: 'en',
        activeLocales: ['en'],
      }),
    ).toEqual(['menus[0].translations[1].locale']);
  });

  it('bounds collection size and rejects text that PostgreSQL cannot represent', () => {
    const value = draft();
    expect(
      sanitizeOnboardingMenuDraft({
        menus: Array.from(
          { length: ONBOARDING_MENU_LIMITS.menus + 1 },
          () => value.menus[0],
        ),
      }),
    ).toEqual({ ok: false, problems: ['menus'] });
    for (const name of [
      '\u0000',
      '\uD800',
      'x'.repeat(ONBOARDING_MENU_LIMITS.name + 1),
    ]) {
      value.menus[0].translations[0].name = name;
      expect(sanitizeOnboardingMenuDraft(value)).toEqual({
        ok: false,
        problems: ['menus[0].translations[0].name'],
      });
    }
    value.menus[0].translations[0].name = 'قائمة 🍽️';
    expect(validated(value).menus[0].translations[0].name).toBe('قائمة 🍽️');
  });
});
