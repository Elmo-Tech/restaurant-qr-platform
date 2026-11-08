/**
 * Offers / Bundles (DEC-069): an offer item can BE a menu item (a Product, and its size when it has sizes) instead of typed
 * text. A linked item's name is read live from the menu (so a rename follows), and the item is only orderable while the
 * product is: ACTIVE, AVAILABLE, in an ACTIVE category of the Restaurant's ACTIVE primary menu, and its size ACTIVE.
 * Pure helpers; the three readers (Staff view, Guest menu, order creation) share them.
 */

/** The relation fields a reader adds to the option select (names for `locales` only; the Staff view passes none = all). */
export function optionItemSelect(locales?: readonly string[]) {
  const translations = {
    ...(locales ? { where: { locale: { in: [...locales] } } } : {}),
    select: { locale: true, name: true },
  };
  return {
    productId: true,
    variantId: true,
    quantity: true,
    product: {
      select: {
        status: true,
        availability: true,
        category: { select: { status: true, menu: { select: { status: true, isPrimary: true } } } },
        translations,
      },
    },
    variant: { select: { status: true, translations } },
  } as const;
}

export interface ItemRow {
  productId: string | null;
  variantId: string | null;
  product: {
    status: string;
    availability: string;
    category: { status: string; menu: { status: string; isPrimary: boolean } };
    translations: { locale: string; name: string }[];
  } | null;
  variant: { status: string; translations: { locale: string; name: string }[] } | null;
}

/** A typed-text item is always orderable; a linked one only while its product (and size) is. */
export function itemOrderable(row: ItemRow): boolean {
  if (row.productId === null) return true;
  const product = row.product;
  if (!product) return false;
  if (
    product.status !== 'ACTIVE' ||
    product.availability !== 'AVAILABLE' ||
    product.category.status !== 'ACTIVE' ||
    product.category.menu.status !== 'ACTIVE' ||
    !product.category.menu.isPrimary
  ) {
    return false;
  }
  return row.variantId === null || row.variant?.status === 'ACTIVE';
}

const pick = (rows: { locale: string; name: string }[], locale: string): string | undefined =>
  rows.find((row) => row.locale === locale && row.name.trim() !== '')?.name;

/** The name in `locale`, else in the default language, else null. A linked item with a size reads "Pizza (Large)". */
export function itemName(
  row: ItemRow,
  ownNames: { locale: string; name: string }[],
  locale: string,
  defaultLocale: string,
): string | null {
  if (row.productId === null) return pick(ownNames, locale) ?? pick(ownNames, defaultLocale) ?? null;
  const product = row.product;
  if (!product) return null;
  const base = pick(product.translations, locale) ?? pick(product.translations, defaultLocale);
  if (!base) return null;
  if (row.variantId === null) return base;
  const size = row.variant
    ? (pick(row.variant.translations, locale) ?? pick(row.variant.translations, defaultLocale))
    : undefined;
  return size ? `${base} (${size})` : base;
}

/** Every language a linked item has a name in (the Staff editor shows it), sizes appended per language. */
export function itemNamesByLocale(row: ItemRow): Record<string, string> {
  const result: Record<string, string> = {};
  for (const translation of row.product?.translations ?? []) {
    const size = row.variant?.translations.find((t) => t.locale === translation.locale)?.name;
    result[translation.locale] = size ? `${translation.name} (${size})` : translation.name;
  }
  return result;
}
