import { Injectable } from '@nestjs/common';
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
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: scope.restaurantId },
      select: { defaultLocale: true },
    });

    // Explicitly Tenant-scoped by the query itself, not merely trusted from
    // RestaurantAccessGuard having already authorized this restaurantId --
    // defense in depth (mirrors every existing Menu/Category/Product list
    // query's own stated rationale).
    const rows = await this.prisma.restaurantLocale.findMany({
      where: { restaurantId: scope.restaurantId },
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
}
