import { Injectable } from '@nestjs/common';
import { resolveLocalizedName } from '../common/name-translations';
import {
  dateOnlyString,
  localDateIn,
  resolveActiveDiscount,
} from '../menu/product-discount';
import { PrismaService } from '../database/prisma.service';
import type { ProductAvailability, QrType } from '../generated/prisma/client';
import {
  normalizePlatformLocale,
  type PlatformSupportedLocale,
} from '../restaurants/platform-locales';
import {
  resolveTableOrderingAvailability,
  type GuestTableOrderingState,
} from '../table-sessions/table-session-availability';
import {
  dateOnly,
  isLiveOn,
  MAX_ACTIVE_ANNOUNCEMENTS,
  resolveAnnouncementText,
} from '../announcements/announcements';
import {
  evaluateHours,
  summarizeHours,
  toPublicHours,
  type PublicHours,
} from '../branches/branch-hours';
import { resolvePublicLocale } from './public-locale';
import { resolvePublicField } from './public-translation-fallback';
import type { PublicTranslatableRow } from './public-translation-fallback';
import {
  CONTACT_COLUMNS,
  contactFromColumns,
  type RestaurantContact,
} from '../restaurants/restaurant-contact';

export interface GetPublicMenuInput {
  publicCode: string;
  /** Raw `?lang=` query value, or `null` if omitted. */
  explicitLang: string | null;
  /** Raw `Accept-Language` request header, or `null` if absent. */
  acceptLanguageHeader: string | null;
}

export interface PublicMenuContext {
  qrType: QrType;
  /**
   * Table Sessions: TABLE QR only (null for GENERIC) -- whether Table QR ordering is
   * currently open. Advisory (the order endpoint re-checks under the table lock);
   * never exposes session, bill or payment data.
   */
  tableOrdering: GuestTableOrderingState | null;
  restaurant: {
    name: string;
    currencyCode: string;
    logoAssetPath: string | null;
    /** Guest hero cover image; null keeps the default branded hero. */
    coverAssetPath: string | null;
    /** Contact details for the Guest Menu (DEC-042); a field is null when not set. */
    contact: RestaurantContact;
    /** Public code of the Restaurant's own (generic) QR: the link the Guest may share. Never a Table QR code. Null when the Restaurant has no active generic QR. */
    shareCode: string | null;
    /** Opening-hours summary for the badge; null = always open, show nothing. */
    hours: PublicHours | null;
  };
  /** The Branch display name, already resolved to the menu content language (requested -> default -> legacy name). */
  branch: { name: string } | null;
  table: { number: string } | null;
  /** Live announcements for the banner (DEC-042): at most three, already in the Guest's language. */
  announcements: PublicAnnouncement[];
  /**
   * How a GENERIC QR order is taken (DEC-042); null for a TABLE QR. `pickup` / `delivery` are the
   * Restaurant's own switches (what kinds of order it takes, whoever receives them). `whatsapp`
   * says WHERE they go: true = the order is sent to the Restaurant on WhatsApp INSTEAD of the
   * dashboard (nothing is created in the app); false = the dashboard, as always.
   */
  ordering: { pickup: boolean; delivery: boolean; whatsapp: boolean } | null;
  /**
   * FT-7: GENERIC QR only (null for TABLE) -- the Restaurant's ACTIVE
   * Branches eligible for Pickup, exposing only the Branch id (the same
   * raw-id convention this response already uses for Category/Product/
   * Modifier ids) and its display name. An empty array means Pickup is
   * unavailable. Order creation re-validates whatever id the Guest picks.
   */
  pickupBranches: { id: string; name: string; hours: PublicHours | null }[] | null;
  /**
   * FT-8: GENERIC QR only (null for TABLE) -- the ACTIVE Branches that have
   * at least one ACTIVE Delivery zone, each with only its ACTIVE zones
   * (id, name, fee, minimum -- exact decimal strings). Empty means Delivery
   * is unavailable. Display data only: Order creation re-resolves the zone,
   * fee and minimum from the database and never trusts these values.
   */
  deliveryBranches: PublicMenuDeliveryBranch[] | null;
}

export interface PublicMenuDeliveryZone {
  id: string;
  name: string;
  deliveryFee: string;
  minimumOrder: string;
}

/** The Branch columns the opening-hours evaluation needs. */
const HOURS_SELECT = { dayOfWeek: true, opensMinute: true, closesMinute: true } as const;

function hoursOf(
  branch: {
    timezone: string;
    hoursMode: 'ALWAYS_OPEN' | 'SCHEDULE';
    temporarilyClosed: boolean;
    openingHours: { dayOfWeek: number; opensMinute: number; closesMinute: number }[];
  },
  now: Date,
): PublicHours | null {
  return toPublicHours(
    evaluateHours(
      {
        mode: branch.hoursMode ?? 'ALWAYS_OPEN',
        temporarilyClosed: branch.temporarilyClosed ?? false,
        intervals: branch.openingHours ?? [],
      },
      now,
      branch.timezone,
    ),
  );
}

export interface PublicAnnouncement {
  id: string;
  style: 'INFO' | 'PROMO' | 'WARNING';
  text: string;
}

export interface PublicMenuDeliveryBranch {
  id: string;
  name: string;
  /** Opening hours of this Branch (DEC-042); null = always open. */
  hours: PublicHours | null;
  zones: PublicMenuDeliveryZone[];
}

export interface PublicMenuLocale {
  requested: string | null;
  resolved: string;
  default: string;
  available: string[];
}

export interface PublicMenuModifierOption {
  id: string;
  name: string;
  priceAdjustment: string;
}

export interface PublicMenuModifierGroup {
  id: string;
  name: string;
  helperText: string | null;
  minimumSelections: number;
  maximumSelections: number;
  options: PublicMenuModifierOption[];
}

export interface PublicProductDiscount {
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  /** The configured value: a percentage (e.g. "20.00") or an amount. */
  value: string;
  /** Amount taken off one unit of `basePrice`. */
  amountOff: string;
  /** Unit price after the discount (before any paid extras). */
  discountedPrice: string;
  /** Last day the discount applies (YYYY-MM-DD, Branch timezone), or null when open-ended. */
  endsOn: string | null;
}

export interface PublicMenuVariant {
  id: string;
  name: string;
  /** The full price of this size. */
  price: string;
  discountedPrice: string | null;
  isDefault: boolean;
}

export interface PublicMenuProduct {
  id: string;
  name: string;
  description: string | null;
  /** The ORIGINAL price. When `discount` is present the Guest is charged `discount.discountedPrice` per unit instead. */
  basePrice: string;
  /**
   * Product Discounts V1: present only while a discount currently applies
   * (enabled, inside its date window in the Branch timezone). Never a fake
   * markdown: it is absent when it would take nothing off. Display data only --
   * order creation re-resolves it from the database.
   */
  discount: PublicProductDiscount | null;
  primaryImageAssetPath: string | null;
  availability: ProductAvailability;
  featured: boolean;
  modifierGroups: PublicMenuModifierGroup[];
  /**
   * Product Variants (DEC-041): the ACTIVE sizes, in display order. Empty = a single price (`basePrice`).
   * Each size carries its full price; `discountedPrice` is present only while the Product discount
   * currently applies to THIS size.
   */
  variants: PublicMenuVariant[];
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

  /**
   * Table Sessions: the cheap advisory re-check behind the Guest "Check again"
   * action -- the same availability the menu context reports, without loading
   * the whole menu. Same QR resolution rules (an unknown, INACTIVE or GENERIC QR
   * converges on `qrNotFound`).
   */
  async getTableOrdering(
    publicCode: string,
  ): Promise<
    | { outcome: 'found'; tableOrdering: GuestTableOrderingState }
    | { outcome: 'qrNotFound' }
  > {
    const qr = await this.prisma.qrCode.findUnique({
      where: { publicCode },
      select: {
        type: true,
        status: true,
        tableId: true,
        restaurant: { select: { status: true, tableOrderingEnabled: true } },
        table: { select: { status: true, staffOpenRequired: true } },
      },
    });
    if (
      !qr ||
      qr.status !== 'ACTIVE' ||
      qr.restaurant.status !== 'ACTIVE' ||
      qr.type !== 'TABLE' ||
      !qr.tableId ||
      !qr.table ||
      qr.table.status !== 'ACTIVE'
    ) {
      return { outcome: 'qrNotFound' };
    }
    if (qr.restaurant.tableOrderingEnabled === false) {
      return { outcome: 'found', tableOrdering: 'DISABLED' };
    }
    return {
      outcome: 'found',
      tableOrdering: await resolveTableOrderingAvailability(this.prisma, {
        tableId: qr.tableId,
        staffOpenRequired: qr.table.staffOpenRequired,
      }),
    };
  }

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
        tableId: true,
        restaurant: {
          select: {
            name: true,
            status: true,
            defaultLocale: true,
            currencyCode: true,
            logoAssetPath: true,
            coverAssetPath: true,
            pickupEnabled: true,
            deliveryEnabled: true,
            tableOrderingEnabled: true,
            whatsappOrderingEnabled: true,
            ...CONTACT_COLUMNS,
          },
        },
        // At most one row per platform locale, so no extra filtering is needed.
        branch: {
          select: {
            name: true,
            timezone: true,
            hoursMode: true,
            temporarilyClosed: true,
            openingHours: { select: HOURS_SELECT },
            translations: { select: { locale: true, name: true } },
          },
        },
        table: { select: { tableNumber: true, staffOpenRequired: true } },
      },
    });

    if (!qr || qr.status !== 'ACTIVE' || qr.restaurant.status !== 'ACTIVE') {
      return { outcome: 'qrNotFound' };
    }

    const tableOrdering: GuestTableOrderingState | null =
      qr.type === 'TABLE' && qr.tableId && qr.table
        ? qr.restaurant.tableOrderingEnabled === false
          ? 'DISABLED'
          : await resolveTableOrderingAvailability(this.prisma, {
              tableId: qr.tableId,
              staffOpenRequired: qr.table.staffOpenRequired === true,
            })
        : null;

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

    // One query for a GENERIC QR: every ACTIVE Branch (Pickup) plus its
    // ACTIVE Delivery zones (Delivery-eligible = at least one). TABLE QRs
    // skip it entirely.
    const activeBranches =
      qr.type === 'GENERIC'
        ? await this.prisma.branch.findMany({
            where: { restaurantId: qr.restaurantId, status: 'ACTIVE' },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              name: true,
              timezone: true,
              hoursMode: true,
              temporarilyClosed: true,
              openingHours: { select: HOURS_SELECT },
              createdAt: true,
              translations: { select: { locale: true, name: true } },
              deliveryZones: {
                where: { status: 'ACTIVE' },
                orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
                select: {
                  id: true,
                  name: true,
                  deliveryFee: true,
                  minimumOrder: true,
                  translations: { select: { locale: true, name: true } },
                },
              },
            },
          })
        : null;

    // Product Discounts V1: "today" is evaluated in the Branch timezone -- the
    // table's own Branch for a TABLE QR, otherwise the Restaurant's oldest ACTIVE
    // Branch (a GENERIC QR menu is shown before a Branch is chosen; order creation
    // re-evaluates with the chosen Branch's own timezone). Never the server's.
    const menuTimezone =
      qr.type === 'TABLE'
        ? (qr.branch?.timezone ?? 'UTC')
        : ([...(activeBranches ?? [])].sort(
            (x, y) => x.createdAt.getTime() - y.createdAt.getTime(),
          )[0]?.timezone ?? 'UTC');
    const now = new Date();
    const today = localDateIn(menuTimezone, now);

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
            discountType: true,
            discountValue: true,
            discountEnabled: true,
            discountStartsOn: true,
            discountEndsOn: true,
            primaryImageAssetPath: true,
            availability: true,
            featured: true,
            translations: {
              where: { locale: { in: localesToLoad } },
              select: { locale: true, name: true, description: true },
            },
            // DEC-041: only ACTIVE sizes are ever offered to a Guest.
            variants: {
              where: { status: 'ACTIVE' },
              orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                price: true,
                isDefault: true,
                discountApplies: true,
                translations: {
                  where: { locale: { in: localesToLoad } },
                  select: { locale: true, name: true },
                },
              },
            },
            // FT-6A: only ACTIVE Groups/Options are ever offered to a
            // Guest -- an INACTIVE (deactivated) Group or Option is hidden
            // entirely, never shown disabled (mirrors Category/Product
            // status filtering above).
            modifierGroups: {
              where: { status: 'ACTIVE' },
              orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                minimumSelections: true,
                maximumSelections: true,
                translations: {
                  where: { locale: { in: localesToLoad } },
                  select: { locale: true, name: true, helperText: true },
                },
                options: {
                  where: { status: 'ACTIVE' },
                  orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
                  select: {
                    id: true,
                    priceAdjustment: true,
                    translations: {
                      where: { locale: { in: localesToLoad } },
                      select: { locale: true, name: true },
                    },
                  },
                },
              },
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

        const modifierGroups: PublicMenuModifierGroup[] = [];
        for (const group of product.modifierGroups) {
          // `resolvePublicField`/`pickRow` are typed against the
          // Menu/Category/Product `{locale, name, description}` shape --
          // ModifierGroupTranslation's third field is `helperText`, so it is
          // adapted to that shape here rather than duplicating the same
          // field-level fallback algorithm a second time.
          const groupRows: PublicTranslatableRow[] = group.translations.map(
            (row) => ({ locale: row.locale, name: row.name, description: row.helperText }),
          );
          const groupDefault = pickRow(groupRows, defaultLocale);
          if (!groupDefault) continue; // Defensive only -- see class docstring.
          const groupFields = resolvePublicField(
            pickRow(groupRows, resolved),
            groupDefault,
          );

          const options: PublicMenuModifierOption[] = [];
          for (const option of group.options) {
            const optionRows: PublicTranslatableRow[] = option.translations.map(
              (row) => ({ locale: row.locale, name: row.name, description: null }),
            );
            const optionDefault = pickRow(optionRows, defaultLocale);
            if (!optionDefault) continue; // Defensive only.
            const optionFields = resolvePublicField(
              pickRow(optionRows, resolved),
              optionDefault,
            );
            options.push({
              id: option.id,
              name: optionFields.name,
              priceAdjustment: option.priceAdjustment.toFixed(2),
            });
          }

          modifierGroups.push({
            id: group.id,
            name: groupFields.name,
            helperText: groupFields.description,
            minimumSelections: group.minimumSelections,
            maximumSelections: group.maximumSelections,
            options,
          });
        }

        // DEC-041: each ACTIVE size with its own price; the discount is computed on THIS size's
        // price and only for sizes the Product discount applies to.
        const discountConfig = {
          type: product.discountType,
          value: product.discountValue,
          enabled: product.discountEnabled,
          startsOn: dateOnlyString(product.discountStartsOn),
          endsOn: dateOnlyString(product.discountEndsOn),
        };
        const variants: PublicMenuVariant[] = [];
        for (const variant of product.variants) {
          const variantRows: PublicTranslatableRow[] = variant.translations.map((row) => ({
            locale: row.locale,
            name: row.name,
            description: null,
          }));
          const variantDefault = pickRow(variantRows, defaultLocale);
          if (!variantDefault) continue; // Defensive only -- a default-locale name always exists.
          const variantFields = resolvePublicField(pickRow(variantRows, resolved), variantDefault);
          const appliedToSize = variant.discountApplies
            ? resolveActiveDiscount(variant.price, discountConfig, today)
            : null;
          variants.push({
            id: variant.id,
            name: variantFields.name,
            price: variant.price.toFixed(2),
            discountedPrice: appliedToSize ? appliedToSize.discountedPrice.toFixed(2) : null,
            isDefault: variant.isDefault,
          });
        }

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
          discount: (() => {
            const applied = resolveActiveDiscount(
              product.basePrice,
              {
                type: product.discountType,
                value: product.discountValue,
                enabled: product.discountEnabled,
                startsOn: dateOnlyString(product.discountStartsOn),
                endsOn: dateOnlyString(product.discountEndsOn),
              },
              today,
            );
            return applied
              ? {
                  type: applied.type,
                  value: applied.value.toFixed(2),
                  amountOff: applied.unitDiscount.toFixed(2),
                  discountedPrice: applied.discountedPrice.toFixed(2),
                  endsOn: dateOnlyString(product.discountEndsOn),
                }
              : null;
          })(),
          primaryImageAssetPath: product.primaryImageAssetPath,
          availability: product.availability,
          featured: product.featured,
          modifierGroups,
          variants,
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

    // Display names resolve to the menu content language, then the Restaurant
    // default language, then the legacy single-language name -- so existing
    // data and a missing translation never produce an empty label.
    const displayName = (
      legacyName: string,
      translations: { locale: string; name: string }[],
    ): string =>
      resolveLocalizedName({
        requestedLocale: resolved,
        defaultLocale,
        translations,
        legacyName,
      });
    // Staff can switch Pickup and / or Delivery off for the whole Restaurant: the
    // Guest then sees no branch for that type, exactly as if none were eligible.
    // (`!== false`: only an explicit off switches a type off.)
    // WhatsApp ordering needs a number to send to; without one it is not offered.
    const whatsappOrdering =
      qr.restaurant.whatsappOrderingEnabled === true && !!qr.restaurant.whatsappNumber;
    const appPickup = qr.restaurant.pickupEnabled !== false;
    const appDelivery = qr.restaurant.deliveryEnabled !== false;
    // WhatsApp only decides where an order goes, never which kinds are offered.
    const pickupOffered = appPickup;
    const deliveryOffered = appDelivery;
    const pickupBranches = activeBranches
      ? (pickupOffered ? activeBranches : []).map((branch) => ({
          id: branch.id,
          name: displayName(branch.name, branch.translations),
          hours: hoursOf(branch, now),
        }))
      : null;
    const deliveryBranches = activeBranches
      ? (deliveryOffered ? activeBranches : [])
          .filter((branch) => branch.deliveryZones.length > 0)
          .map((branch) => ({
            id: branch.id,
            name: displayName(branch.name, branch.translations),
            hours: hoursOf(branch, now),
            zones: branch.deliveryZones.map((zone) => ({
              id: zone.id,
              name: displayName(zone.name, zone.translations),
              deliveryFee: zone.deliveryFee.toFixed(2),
              minimumOrder: zone.minimumOrder.toFixed(2),
            })),
          }))
      : null;

    // Opening-hours badge: the Table's Branch, or all the Branches this QR can order from.
    const offeredHours = [
      ...(pickupBranches ?? []).map((branch) => branch.hours),
      ...(deliveryBranches ?? []).map((branch) => branch.hours),
    ];
    const hours =
      qr.type === 'TABLE'
        ? qr.branch
          ? hoursOf(qr.branch, now)
          : null
        : summarizeHours(offeredHours);

    // Announcements: ACTIVE, inside their (inclusive) date range today, newest last, at most three.
    const announcementRows = await this.prisma.restaurantAnnouncement.findMany({
      where: { restaurantId: qr.restaurantId, status: 'ACTIVE' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: MAX_ACTIVE_ANNOUNCEMENTS,
      select: {
        id: true,
        status: true,
        style: true,
        startsOn: true,
        endsOn: true,
        translations: { select: { locale: true, text: true } },
      },
    });
    const announcements: PublicAnnouncement[] = [];
    for (const row of announcementRows) {
      const live = isLiveOn(
        { status: row.status, startsOn: dateOnly(row.startsOn), endsOn: dateOnly(row.endsOn) },
        today,
      );
      const text = resolveAnnouncementText(row.translations, resolved, defaultLocale);
      if (live && text !== null) announcements.push({ id: row.id, style: row.style, text });
    }

    const shareCode =
      qr.type === 'GENERIC'
        ? input.publicCode
        : ((
            await this.prisma.qrCode.findFirst({
              where: { restaurantId: qr.restaurantId, type: 'GENERIC', status: 'ACTIVE' },
              select: { publicCode: true },
            })
          )?.publicCode ?? null);

    return {
      outcome: 'found',
      data: {
        context: {
          qrType: qr.type,
          tableOrdering,
          restaurant: {
            name: qr.restaurant.name,
            currencyCode: qr.restaurant.currencyCode,
            logoAssetPath: qr.restaurant.logoAssetPath,
            coverAssetPath: qr.restaurant.coverAssetPath,
            contact: contactFromColumns(qr.restaurant),
            shareCode,
            hours,
          },
          branch: qr.branch
            ? { name: displayName(qr.branch.name, qr.branch.translations) }
            : null,
          table: qr.table ? { number: qr.table.tableNumber } : null,
          announcements,
          ordering:
            qr.type === 'GENERIC'
              ? { pickup: appPickup, delivery: appDelivery, whatsapp: whatsappOrdering }
              : null,
          pickupBranches,
          deliveryBranches,
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
