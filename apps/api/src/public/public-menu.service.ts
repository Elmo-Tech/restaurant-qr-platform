import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { ProductAvailability, QrType } from '../generated/prisma/client';
import {
  normalizePlatformLocale,
  type PlatformSupportedLocale,
} from '../restaurants/platform-locales';
import { resolvePublicLocale } from './public-locale';
import { resolvePublicField } from './public-translation-fallback';
import type { PublicTranslatableRow } from './public-translation-fallback';

export interface GetPublicMenuInput {
  publicCode: string;
  /** Raw `?lang=` query value, or `null` if omitted. */
  explicitLang: string | null;
  /** Raw `Accept-Language` request header, or `null` if absent. */
  acceptLanguageHeader: string | null;
}

export interface PublicMenuContext {
  qrType: QrType;
  restaurant: { name: string; currencyCode: string };
  branch: { name: string } | null;
  table: { number: string } | null;
}

export interface PublicMenuLocale {
  requested: string | null;
  resolved: string;
  default: string;
  available: string[];
}

export interface PublicMenuProduct {
  id: string;
  name: string;
  description: string | null;
  basePrice: string;
  primaryImageAssetPath: string | null;
  availability: ProductAvailability;
  featured: boolean;
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  description: string | null;
  imageAssetPath: string | null;
  products: PublicMenuProduct[];
}

export interface PublicMenuData {
  context: PublicMenuContext;
  locale: PublicMenuLocale;
  menu: {
    id: string;
    name: string;
    description: string | null;
    categories: PublicMenuCategory[];
  };
}

export type GetPublicMenuResult =
  | { outcome: 'found'; data: PublicMenuData }
  | { outcome: 'qrNotFound' }
  | { outcome: 'menuNotAvailable' };

function pickRow(
  rows: PublicTranslatableRow[],
  locale: string,
): PublicTranslatableRow | undefined {
  return rows.find((row) => row.locale === locale);
}

/**
 * FT-3: the public, unauthenticated Guest QR Menu aggregate -- a single
 * bounded read (four Prisma calls total, never one query per Category/
 * Product/translation row) that resolves a `publicCode` all the way down to
 * a render-ready Menu. Never writes anything; every method here is a pure
 * read (Section 10/25 no-mutation-on-GET requirement).
 */
@Injectable()
export class PublicMenuService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicMenu(input: GetPublicMenuInput): Promise<GetPublicMenuResult> {
    // One query resolves the QR itself plus its Restaurant/Branch/Table
    // context in a single round trip (Prisma joins to-one relations) --
    // Section 3/10. An unknown `publicCode`, an INACTIVE QR, or a
    // suspended/inactive Restaurant all converge on the identical
    // `qrNotFound` outcome (QR_SPEC.md #47/#48): never a distinguishable
    // "QR exists but Restaurant is suspended" leak.
    const qr = await this.prisma.qrCode.findUnique({
      where: { publicCode: input.publicCode },
      select: {
        type: true,
        status: true,
        restaurantId: true,
        restaurant: {
          select: {
            name: true,
            status: true,
            defaultLocale: true,
            currencyCode: true,
          },
        },
        branch: { select: { name: true } },
        table: { select: { tableNumber: true } },
      },
    });

    if (!qr || qr.status !== 'ACTIVE' || qr.restaurant.status !== 'ACTIVE') {
      return { outcome: 'qrNotFound' };
    }

    const activeLocaleRows = await this.prisma.restaurantLocale.findMany({
      where: { restaurantId: qr.restaurantId, isActive: true },
      select: { locale: true },
    });
    const activeLocales = activeLocaleRows
      .map((row) => normalizePlatformLocale(row.locale))
      .filter((locale): locale is PlatformSupportedLocale => locale !== null);
    // Defensive only: the Restaurant Languages backfill guarantees the
    // default locale always has an active RestaurantLocale row.
    const defaultLocale =
      normalizePlatformLocale(qr.restaurant.defaultLocale) ?? 'en';

    const { requested, resolved } = resolvePublicLocale({
      explicitLang: input.explicitLang,
      acceptLanguageHeader: input.acceptLanguageHeader,
      activeLocales,
      defaultLocale,
    });

    // Only ever the (at most two) locales this response can actually use --
    // never every locale a Menu/Category/Product happens to have a row for
    // (Section 10).
    const localesToLoad = Array.from(new Set([resolved, defaultLocale]));

    // Section 4: exactly the Restaurant's PRIMARY + ACTIVE Menu, never a
    // fallback to some other Menu. No active primary Menu at all is its own
    // stable outcome, never silently substituted.
    const menu = await this.prisma.menu.findFirst({
      where: { restaurantId: qr.restaurantId, isPrimary: true, status: 'ACTIVE' },
      select: {
        id: true,
        translations: {
          where: { locale: { in: localesToLoad } },
          select: { locale: true, name: true, description: true },
        },
      },
    });
    if (!menu) {
      return { outcome: 'menuNotAvailable' };
    }
    const menuDefaultTranslation = pickRow(menu.translations, defaultLocale);
    if (!menuDefaultTranslation) {
      // Defensive only -- see class docstring.
      return { outcome: 'menuNotAvailable' };
    }
    const menuFields = resolvePublicField(
      pickRow(menu.translations, resolved),
      menuDefaultTranslation,
    );

    // One nested query for every ACTIVE Category and, within each, every
    // ACTIVE Product plus both locales' translations -- Section 6/10: never
    // a query per Category or per Product. Sort order is left entirely to
    // Postgres via `orderBy`, the same displayOrder-then-id tie-break every
    // existing Staff list query already uses.
    const categories = await this.prisma.category.findMany({
      where: { restaurantId: qr.restaurantId, menuId: menu.id, status: 'ACTIVE' },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        imageAssetPath: true,
        translations: {
          where: { locale: { in: localesToLoad } },
          select: { locale: true, name: true, description: true },
        },
        products: {
          where: { status: 'ACTIVE' },
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            basePrice: true,
            primaryImageAssetPath: true,
            availability: true,
            featured: true,
            translations: {
              where: { locale: { in: localesToLoad } },
              select: { locale: true, name: true, description: true },
            },
          },
        },
      },
    });

    const publicCategories: PublicMenuCategory[] = [];
    for (const category of categories) {
      const categoryDefault = pickRow(category.translations, defaultLocale);
      if (!categoryDefault) continue; // Defensive only -- see class docstring.
      const categoryFields = resolvePublicField(
        pickRow(category.translations, resolved),
        categoryDefault,
      );

      const products: PublicMenuProduct[] = [];
      for (const product of category.products) {
        const productDefault = pickRow(product.translations, defaultLocale);
        if (!productDefault) continue; // Defensive only -- see class docstring.
        const productFields = resolvePublicField(
          pickRow(product.translations, resolved),
          productDefault,
        );

        // SOLD_OUT Products stay visible (Section 6) -- `availability` is
        // never used as a visibility filter, only `status` is (already
        // applied in the query's `where` above).
        products.push({
          id: product.id,
          name: productFields.name,
          description: productFields.description,
          // Exact decimal string, never Number/parseFloat (Section 7/
          // CLAUDE.md #27) -- Prisma.Decimal's own `toFixed` matches the
          // API-wide 2-fractional-digit money contract.
          basePrice: product.basePrice.toFixed(2),
          primaryImageAssetPath: product.primaryImageAssetPath,
          availability: product.availability,
          featured: product.featured,
        });
      }

      publicCategories.push({
        id: category.id,
        name: categoryFields.name,
        description: categoryFields.description,
        imageAssetPath: category.imageAssetPath,
        products,
      });
    }

    return {
      outcome: 'found',
      data: {
        context: {
          qrType: qr.type,
          restaurant: {
            name: qr.restaurant.name,
            currencyCode: qr.restaurant.currencyCode,
          },
          branch: qr.branch ? { name: qr.branch.name } : null,
          table: qr.table ? { number: qr.table.tableNumber } : null,
        },
        locale: {
          requested,
          resolved,
          default: defaultLocale,
          available: activeLocales,
        },
        menu: {
          id: menu.id,
          name: menuFields.name,
          description: menuFields.description,
          categories: publicCategories,
        },
      },
    };
  }
}
