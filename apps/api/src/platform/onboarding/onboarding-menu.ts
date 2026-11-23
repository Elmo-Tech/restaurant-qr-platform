import { isWellFormedMoneyDecimalString } from '../../menu/money-decimal';
import {
  normalizePlatformLocale,
  PLATFORM_SUPPORTED_LOCALES,
} from '../../restaurants/platform-locales';
import {
  MAX_CATEGORIES,
  MAX_PRODUCTS,
} from '../../menu-import/menu-import-extraction';

type NameTranslation = { locale: string; name: string };
type TextTranslation = NameTranslation & { description?: string };

type DraftVariant = { translations: NameTranslation[]; price: string };
type DraftOption = { translations: NameTranslation[]; price: string };
type DraftModifierGroup = {
  translations: TextTranslation[];
  minSelections: number;
  maxSelections: number;
  options: DraftOption[];
};
type DraftProduct = {
  translations: TextTranslation[];
  price: string;
  variants: DraftVariant[];
  modifierGroups: DraftModifierGroup[];
};
type DraftCategory = {
  translations: TextTranslation[];
  products: DraftProduct[];
};

/** No IDs or persistence settings. Array order becomes display order; the first menu is primary. */
export type OnboardingMenuDraft = {
  menus: { translations: TextTranslation[]; categories: DraftCategory[] }[];
};

export const ONBOARDING_MENU_LIMITS = {
  menus: 10,
  categories: MAX_CATEGORIES,
  products: MAX_PRODUCTS,
  variantsPerProduct: 32,
  groupsPerProduct: 20,
  optionsPerGroup: 32,
  name: 120,
  description: 500,
  entities: 6_000,
  textBytes: 512 * 1024,
} as const;

class InvalidDraft extends Error {
  constructor(readonly path: string) {
    super('Invalid onboarding menu draft');
  }
}

/** Rejects unknown fields without echoing keys or values; draft blanks are allowed, not publishable. */
export function sanitizeOnboardingMenuDraft(
  input: unknown,
):
  { ok: true; value: OnboardingMenuDraft } | { ok: false; problems: string[] } {
  const limits = ONBOARDING_MENU_LIMITS;
  let entities = 0;
  let categories = 0;
  let products = 0;
  let textBytes = 0;

  function object(
    value: unknown,
    path: string,
    keys: readonly string[],
  ): Record<string, unknown> {
    if (
      value === null ||
      typeof value !== 'object' ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    ) {
      throw new InvalidDraft(path);
    }
    const record = value as Record<string, unknown>;
    // Use own fields only, including for subsequent reads (no inherited data).
    const clean: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      if (!keys.includes(key)) throw new InvalidDraft(path);
      clean[key] = record[key];
    }
    return clean;
  }

  function list<T>(
    value: unknown,
    path: string,
    limit: number,
    parse: (entry: unknown, path: string) => T,
  ): T[] {
    if (!Array.isArray(value) || value.length > limit) {
      throw new InvalidDraft(path);
    }
    return Array.from(value, (entry, index) => {
      if (++entities > limits.entities) throw new InvalidDraft('menuDraft');
      return parse(entry, `${path}[${index}]`);
    });
  }

  function text(value: unknown, path: string, limit: number): string {
    if (
      typeof value !== 'string' ||
      value.length > limit ||
      // PostgreSQL cannot store NUL or lone UTF-16 surrogates in text/JSONB.
      value.includes('\u0000') ||
      /[\uD800-\uDFFF]/u.test(value)
    ) {
      throw new InvalidDraft(path);
    }
    textBytes += Buffer.byteLength(value);
    if (textBytes > limits.textBytes) throw new InvalidDraft('menuDraft');
    return value.trim();
  }

  function translations(
    value: unknown,
    path: string,
    described: boolean,
  ): TextTranslation[] {
    const seen = new Set<string>();
    return list(value, path, PLATFORM_SUPPORTED_LOCALES.length, (entry, at) => {
      const fields = object(
        entry,
        at,
        described ? ['locale', 'name', 'description'] : ['locale', 'name'],
      );
      const locale = normalizePlatformLocale(
        text(fields.locale, `${at}.locale`, 16),
      );
      if (!locale || seen.has(locale)) throw new InvalidDraft(`${at}.locale`);
      seen.add(locale);
      const name = text(fields.name, `${at}.name`, limits.name);
      const description = Object.hasOwn(fields, 'description')
        ? text(fields.description, `${at}.description`, limits.description)
        : '';
      return { locale, name, ...(description ? { description } : {}) };
    });
  }

  function price(value: unknown, path: string): string {
    if (value !== '' && !isWellFormedMoneyDecimalString(value)) {
      throw new InvalidDraft(path);
    }
    return value;
  }

  function selections(value: unknown, path: string, minimum: number): number {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < minimum ||
      value > limits.optionsPerGroup
    ) {
      throw new InvalidDraft(path);
    }
    return value;
  }

  function pricedName(value: unknown, at: string): DraftVariant | DraftOption {
    const fields = object(value, at, ['translations', 'price']);
    return {
      translations: translations(
        fields.translations,
        `${at}.translations`,
        false,
      ),
      price: price(fields.price, `${at}.price`),
    };
  }

  function group(value: unknown, at: string): DraftModifierGroup {
    const fields = object(value, at, [
      'translations',
      'minSelections',
      'maxSelections',
      'options',
    ]);
    return {
      translations: translations(
        fields.translations,
        `${at}.translations`,
        true,
      ),
      minSelections: selections(fields.minSelections, `${at}.minSelections`, 0),
      maxSelections: selections(fields.maxSelections, `${at}.maxSelections`, 1),
      options: list(
        fields.options,
        `${at}.options`,
        limits.optionsPerGroup,
        pricedName,
      ),
    };
  }

  function product(value: unknown, at: string): DraftProduct {
    if (++products > limits.products) throw new InvalidDraft('menuDraft');
    const fields = object(value, at, [
      'translations',
      'price',
      'variants',
      'modifierGroups',
    ]);
    return {
      translations: translations(
        fields.translations,
        `${at}.translations`,
        true,
      ),
      price: price(fields.price, `${at}.price`),
      variants: list(
        fields.variants,
        `${at}.variants`,
        limits.variantsPerProduct,
        pricedName,
      ),
      modifierGroups: list(
        fields.modifierGroups,
        `${at}.modifierGroups`,
        limits.groupsPerProduct,
        group,
      ),
    };
  }

  function category(value: unknown, at: string): DraftCategory {
    if (++categories > limits.categories) throw new InvalidDraft('menuDraft');
    const fields = object(value, at, ['translations', 'products']);
    return {
      translations: translations(
        fields.translations,
        `${at}.translations`,
        true,
      ),
      products: list(
        fields.products,
        `${at}.products`,
        limits.products,
        product,
      ),
    };
  }

  try {
    const root = object(input, 'menuDraft', ['menus']);
    const menus = list(root.menus, 'menus', limits.menus, (entry, at) => {
      const fields = object(entry, at, ['translations', 'categories']);
      return {
        translations: translations(
          fields.translations,
          `${at}.translations`,
          true,
        ),
        categories: list(
          fields.categories,
          `${at}.categories`,
          limits.categories,
          category,
        ),
      };
    });
    return { ok: true, value: { menus } };
  } catch (error) {
    if (!(error instanceof InvalidDraft)) throw error;
    return { ok: false, problems: [error.path] };
  }
}

/** Publish-time completeness on a sanitized draft, with the target's current locale configuration. */
export function validateOnboardingMenuDraft(
  draft: OnboardingMenuDraft,
  locales: { defaultLocale: string; activeLocales: readonly string[] },
): string[] {
  const problems: string[] = [];
  const active = new Set(locales.activeLocales);
  function problem(path: string) {
    if (problems.length < 50) problems.push(path);
  }
  function translations(values: readonly NameTranslation[], path: string) {
    if (!values.some((entry) => entry.locale === locales.defaultLocale)) {
      problem(path);
    }
    values.forEach((entry, index) => {
      if (!active.has(entry.locale)) problem(`${path}[${index}].locale`);
      if (!entry.name) problem(`${path}[${index}].name`);
    });
  }
  function priced(
    entity: DraftVariant | DraftOption | DraftProduct,
    at: string,
  ) {
    translations(entity.translations, `${at}.translations`);
    if (!entity.price) problem(`${at}.price`);
  }

  if (!active.has(locales.defaultLocale)) problem('menuDraft');
  if (draft.menus.length === 0) problem('menus');
  draft.menus.forEach((menu, i) => {
    const at = `menus[${i}]`;
    translations(menu.translations, `${at}.translations`);
    if (menu.categories.length === 0) problem(`${at}.categories`);
    menu.categories.forEach((category, j) => {
      const cat = `${at}.categories[${j}]`;
      translations(category.translations, `${cat}.translations`);
      if (category.products.length === 0) problem(`${cat}.products`);
      category.products.forEach((product, k) => {
        const item = `${cat}.products[${k}]`;
        priced(product, item);
        product.variants.forEach((variant, n) =>
          priced(variant, `${item}.variants[${n}]`),
        );
        product.modifierGroups.forEach((group, n) => {
          const mod = `${item}.modifierGroups[${n}]`;
          translations(group.translations, `${mod}.translations`);
          if (group.maxSelections < group.minSelections)
            problem(`${mod}.maxSelections`);
          if (group.options.length === 0) problem(`${mod}.options`);
          if (group.minSelections > group.options.length)
            problem(`${mod}.minSelections`);
          group.options.forEach((option, m) =>
            priced(option, `${mod}.options[${m}]`),
          );
        });
      });
    });
  });
  return problems;
}
