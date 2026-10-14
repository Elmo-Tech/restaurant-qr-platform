import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  PLATFORM_SUPPORTED_LOCALES,
  type PlatformSupportedLocale,
} from './platform-locales';

/** The minimum safe authorized scope this query needs -- exactly `request.restaurantAccess.restaurantId`. */
export interface AuthorizedRestaurantScope {
  restaurantId: string;
}

/** One row of the merged Platform-registry-plus-Restaurant-configuration projection (LOC-1 Section 4). Never a raw `RestaurantLocale` row -- no `id`, no `restaurantId`, no `createdAt`. */
export interface RestaurantLocaleView {
  locale: PlatformSupportedLocale;
  isDefault: boolean;
  isActive: boolean;
}

export interface RestaurantLocalesView {
  defaultLocale: string;
  locales: RestaurantLocaleView[];
}

/**
 * DEC-037 / I18N_SPEC.md #35A: the customer-facing entity kinds that must have
 * a name in a language before it can become the Restaurant's Default Locale.
 */
export const DEFAULT_LOCALE_ENTITY_KINDS = [
  'menus',
  'categories',
  'products',
  'modifierGroups',
  'modifierOptions',
  'modifierPresets',
  'modifierPresetOptions',
  'branches',
  'deliveryZones',
] as const;

export type DefaultLocaleEntityKind = (typeof DEFAULT_LOCALE_ENTITY_KINDS)[number];

/** How many entities of each kind still lack a name in `locale`. */
export interface DefaultLocaleReadiness {
  locale: PlatformSupportedLocale;
  /** True when this locale already is the Default, or nothing is missing. */
  ready: boolean;
  missing: Record<DefaultLocaleEntityKind, number>;
  totalMissing: number;
}

export type DefaultLocaleReadinessResult =
  | { outcome: 'ok'; data: DefaultLocaleReadiness }
  | { outcome: 'localeNotActive' };

export type SetDefaultLocaleResult =
  | { outcome: 'updated'; data: RestaurantLocalesView }
  | { outcome: 'localeNotActive' }
  | { outcome: 'incomplete'; data: DefaultLocaleReadiness };

export interface SetRestaurantLocaleInput {
  restaurantId: string;
  locale: PlatformSupportedLocale;
  isActive: boolean;
}

/**
 * A plain outcome, never an HTTP exception -- the controller alone decides
 * how each outcome maps to its HTTP status/body (mirrors every existing
 * Menu/Category/Product/Table service's established `outcome` convention,
 * e.g. `UpdateMenuResult`).
 */
export type SetRestaurantLocaleResult =
  | { outcome: 'updated'; data: { locale: string; isActive: boolean } }
  | { outcome: 'defaultLocaleRequired' };

/**
 * LOC-2A, approved LOC-1 contract: Restaurant Language Settings. Both
 * methods read `Restaurant.defaultLocale` fresh from the database on every
 * call (mirrors `MenusService`/`CategoriesService`/`ProductsService`'s own
 * `findUniqueOrThrow({ select: { defaultLocale: true } })` pattern
 * exactly) -- never cached, never trusted from an earlier request.
 *
 * This service deliberately does NOT implement any "repair" behavior for a
 * Restaurant whose `defaultLocale` has no active `RestaurantLocale` row
 * (LOC-1 Section 8 / this batch's Section 8): that invariant is established
 * once, by the standalone backfill tool (`scripts/backfill-restaurant-
 * locales.ts`) for existing data, and must be established atomically by any
 * future real Restaurant-creation service -- `listLocales`/`setLocaleState`
 * simply trust it holds, exactly like `MenusService.createMenu` trusts its
 * own atomic Menu+translation invariant rather than defensively re-checking
 * it on every read.
 */
@Injectable()
export class RestaurantLocalesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * LOC-1 Section 4 (amended): projects the COMPLETE Platform locale
   * registry, merged with whatever `RestaurantLocale` rows this Restaurant
   * actually has -- never only the rows that happen to exist. Every
   * `PLATFORM_SUPPORTED_LOCALES` entry appears exactly once, in the
   * registry's own fixed order, so the response is deterministic. A
   * missing row for a given Platform locale (whether truly "never
   * enabled," or a not-yet-backfilled default locale) is projected as
   * `isActive: false` -- this method never creates, updates, or deletes
   * any row; it is a pure read.
   */
  async listLocales(
    scope: AuthorizedRestaurantScope,
  ): Promise<RestaurantLocalesView> {
    return this.buildView(this.prisma, scope.restaurantId);
  }

  private async buildView(
    client: Prisma.TransactionClient | PrismaService,
    restaurantId: string,
  ): Promise<RestaurantLocalesView> {
    const restaurant = await client.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { defaultLocale: true },
    });

    // Explicitly Tenant-scoped by the query itself, not merely trusted from
    // RestaurantAccessGuard having already authorized this restaurantId --
    // defense in depth (mirrors every existing Menu/Category/Product list
    // query's own stated rationale).
    const rows = await client.restaurantLocale.findMany({
      where: { restaurantId },
      select: { locale: true, isActive: true },
    });
    const activeByLocale = new Map(
      rows.map((row) => [row.locale, row.isActive]),
    );

    const locales: RestaurantLocaleView[] = PLATFORM_SUPPORTED_LOCALES.map(
      (locale) => ({
        locale,
        isDefault: locale === restaurant.defaultLocale,
        isActive: activeByLocale.get(locale) ?? false,
      }),
    );

    return { defaultLocale: restaurant.defaultLocale, locales };
  }

  /**
   * LOC-1 Section 5 (amended): enable/disable one Platform-supported
   * locale for this Restaurant. `locale` here is already Pipe-validated
   * against the Platform allowlist (`LocaleParamPipe`) by the time it
   * reaches this service -- an unsupported value can never reach this
   * method at all, so it can never result in a write (this batch's Section
   * 14).
   *
   * Enable: an atomic create-or-activate upsert keyed by the existing
   * `@@unique([restaurantId, locale])` constraint -- concurrent enables of
   * the same locale settle on exactly one row by construction (Postgres
   * `INSERT ... ON CONFLICT DO UPDATE`), never a raw P2002 (this batch's
   * Section 13). Already-active is a harmless same-value write, not a
   * distinguishable error.
   *
   * Disable: a Tenant-scoped `updateMany` naturally yields a zero-row
   * no-op both when no `RestaurantLocale` row exists at all ("never
   * enabled") and when the row is already inactive -- this deliberately
   * never creates a row to represent either state (LOC-1 Section 5:
   * "Do NOT create an inactive RestaurantLocale row merely to represent
   * 'never enabled'"). Disabling the Restaurant's current default locale
   * is rejected before any write, inside the same transaction.
   */
  async setLocaleState(
    input: SetRestaurantLocaleInput,
  ): Promise<SetRestaurantLocaleResult> {
    return this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: input.restaurantId },
        select: { defaultLocale: true },
      });

      if (!input.isActive && input.locale === restaurant.defaultLocale) {
        return { outcome: 'defaultLocaleRequired' };
      }

      if (input.isActive) {
        await tx.restaurantLocale.upsert({
          where: {
            restaurantId_locale: {
              restaurantId: input.restaurantId,
              locale: input.locale,
            },
          },
          create: {
            restaurantId: input.restaurantId,
            locale: input.locale,
            isActive: true,
          },
          update: { isActive: true },
        });
      } else {
        await tx.restaurantLocale.updateMany({
          where: {
            restaurantId: input.restaurantId,
            locale: input.locale,
            isActive: true,
          },
          data: { isActive: false },
        });
      }

      return {
        outcome: 'updated',
        data: { locale: input.locale, isActive: input.isActive },
      };
    });
  }

  /**
   * DEC-037: how far each kind of customer-facing content is from having a
   * name in `locale`. A pure read; it is what the Staff UI shows before
   * asking the admin to confirm the change.
   */
  async getDefaultLocaleReadiness(
    scope: AuthorizedRestaurantScope,
    locale: PlatformSupportedLocale,
  ): Promise<DefaultLocaleReadinessResult> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: scope.restaurantId },
      select: { defaultLocale: true },
    });
    if (!(await this.isLocaleActive(this.prisma, scope.restaurantId, locale))) {
      return { outcome: 'localeNotActive' };
    }
    const missing = await this.countMissingNames(
      this.prisma,
      scope.restaurantId,
      locale,
    );
    return {
      outcome: 'ok',
      data: this.toReadiness(locale, restaurant.defaultLocale, missing),
    };
  }

  /**
   * DEC-037 / I18N_SPEC.md #35A: make an ACTIVE language the Restaurant's
   * Default Locale. Refused (nothing written) unless every entity has a name
   * in it. One transaction: `defaultLocale`, and the Default-Locale name
   * columns of Branches and Delivery Zones, move together. No translation
   * row is deleted or rewritten.
   */
  async setDefaultLocale(
    scope: AuthorizedRestaurantScope,
    locale: PlatformSupportedLocale,
  ): Promise<SetDefaultLocaleResult> {
    return this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: scope.restaurantId },
        select: { defaultLocale: true },
      });

      if (!(await this.isLocaleActive(tx, scope.restaurantId, locale))) {
        return { outcome: 'localeNotActive' } as const;
      }

      if (restaurant.defaultLocale === locale) {
        return {
          outcome: 'updated',
          data: await this.buildView(tx, scope.restaurantId),
        } as const;
      }

      const missing = await this.countMissingNames(tx, scope.restaurantId, locale);
      const readiness = this.toReadiness(locale, restaurant.defaultLocale, missing);
      if (!readiness.ready) {
        return { outcome: 'incomplete', data: readiness } as const;
      }

      await tx.restaurant.update({
        where: { id: scope.restaurantId },
        data: { defaultLocale: locale },
      });

      // `branches.name` / `delivery_zones.name` hold the Default-Locale name
      // (and the legacy fallback): re-point them to the new Default's name.
      const branchNames = await tx.branchTranslation.findMany({
        where: { locale, branch: { restaurantId: scope.restaurantId } },
        select: { branchId: true, name: true },
      });
      for (const row of branchNames) {
        await tx.branch.update({
          where: { id: row.branchId },
          data: { name: row.name },
        });
      }
      const zoneNames = await tx.deliveryZoneTranslation.findMany({
        where: { locale, deliveryZone: { restaurantId: scope.restaurantId } },
        select: { deliveryZoneId: true, name: true },
      });
      for (const row of zoneNames) {
        await tx.deliveryZone.update({
          where: { id: row.deliveryZoneId },
          data: { name: row.name },
        });
      }

      return {
        outcome: 'updated',
        data: await this.buildView(tx, scope.restaurantId),
      } as const;
    });
  }

  private async isLocaleActive(
    client: Prisma.TransactionClient | PrismaService,
    restaurantId: string,
    locale: string,
  ): Promise<boolean> {
    const row = await client.restaurantLocale.findUnique({
      where: { restaurantId_locale: { restaurantId, locale } },
      select: { isActive: true },
    });
    return row?.isActive === true;
  }

  private toReadiness(
    locale: PlatformSupportedLocale,
    currentDefault: string,
    missing: Record<DefaultLocaleEntityKind, number>,
  ): DefaultLocaleReadiness {
    const totalMissing = DEFAULT_LOCALE_ENTITY_KINDS.reduce(
      (sum, kind) => sum + missing[kind],
      0,
    );
    return {
      locale,
      ready: locale === currentDefault || totalMissing === 0,
      missing,
      totalMissing,
    };
  }

  /** Tenant-scoped counts of entities with no non-empty name in `locale`. */
  private async countMissingNames(
    client: Prisma.TransactionClient | PrismaService,
    restaurantId: string,
    locale: string,
  ): Promise<Record<DefaultLocaleEntityKind, number>> {
    const where = {
      restaurantId,
      translations: { none: { locale, name: { not: '' } } },
    };
    const [
      menus,
      categories,
      products,
      modifierGroups,
      modifierOptions,
      modifierPresets,
      modifierPresetOptions,
      branches,
      deliveryZones,
    ] = await Promise.all([
      client.menu.count({ where }),
      client.category.count({ where }),
      client.product.count({ where }),
      client.modifierGroup.count({ where }),
      client.modifierOption.count({ where }),
      client.modifierPreset.count({ where }),
      client.modifierPresetOption.count({ where }),
      client.branch.count({ where }),
      client.deliveryZone.count({ where }),
    ]);
    return {
      menus,
      categories,
      products,
      modifierGroups,
      modifierOptions,
      modifierPresets,
      modifierPresetOptions,
      branches,
      deliveryZones,
    };
  }
}
