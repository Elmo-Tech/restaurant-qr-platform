import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../common/is-uuid';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { MenuStatus } from '../generated/prisma/client';

/**
 * Shared bounded-retry cap for both operations that can legitimately race
 * on `menus_one_primary_menu` (first-Menu Create, below, and Set-Primary,
 * Batch F). This is intentionally bounded, not unlimited: it resolves the
 * ordinary two-request race (loser retries once, observes the winner's
 * already-committed state, and its retry succeeds) but is NOT a guarantee
 * that every possible contention pattern resolves within one retry --
 * Create Menu's specific race does resolve deterministically within one
 * retry (see `createMenu`'s docstring for why), but Set-Primary's does not
 * under continued/repeated contention from more than two concurrent
 * requests (see `setPrimaryMenu`'s docstring). When the bounded retry is
 * exhausted, the still-unresolved named `menus_one_primary_menu` conflict
 * is thrown rather than swallowed -- correctness never depends on the
 * retry succeeding, only on the database's partial unique index, which
 * remains the final at-most-one-primary-Menu guarantee regardless of how
 * many attempts a given request takes. An unrelated P2002 (any index other
 * than `menus_one_primary_menu`) is never caught here at all.
 */
const MAX_PRIMARY_RACE_ATTEMPTS = 2;

/**
 * The real Postgres partial unique index name behind the "at most one
 * isPrimary=true Menu per Restaurant" invariant (DATABASE_SPEC.md #58,
 * migration `20260905143207_add_core_menu_schema`). Two concurrent
 * first-Menu requests can both observe `count === 0` under READ COMMITTED
 * and both attempt `isPrimary = true`; exactly one commits, and the loser's
 * insert fails this index. `meta.driverAdapterError.cause.constraint.index`
 * is the same driver-adapter-level P2002 shape already established and
 * reused by Business Foundation T for named unique constraints -- a
 * Postgres index violation (whether from a Prisma `@@unique`/`@unique` or,
 * as here, a custom-SQL partial unique index) is reported identically.
 */
const ONE_PRIMARY_MENU_INDEX = 'menus_one_primary_menu';

function isOnePrimaryMenuRace(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  const meta = error.meta as
    | { driverAdapterError?: { cause?: { constraint?: { index?: string } } } }
    | undefined;
  return (
    meta?.driverAdapterError?.cause?.constraint?.index ===
    ONE_PRIMARY_MENU_INDEX
  );
}

/** Safe Menu translation shape -- never a raw Prisma `MenuTranslation` row (no `id`/`menuId`). */
export interface MenuTranslationView {
  locale: string;
  name: string;
  description: string | null;
}

/** Safe Menu shape shared by List and Create. Never `restaurantId`, `createdAt`, `updatedAt`, or a raw Prisma entity. */
export interface MenuWithTranslation {
  id: string;
  nameInternal: string;
  status: MenuStatus;
  displayOrder: number;
  isPrimary: boolean;
  translation: MenuTranslationView;
}

/** The minimum safe authorized scope this query needs -- exactly `request.restaurantAccess.restaurantId`. */
export interface AuthorizedMenuScope {
  restaurantId: string;
}

/**
 * Client-writable Create Menu input, already DTO-validated and normalized.
 * `restaurantId` here is the Backend-authorized value from
 * `request.restaurantAccess.restaurantId` -- never a client-supplied value.
 * `name`/`description` are the default-locale `MenuTranslation` content, not
 * persisted onto `Menu` itself.
 */
export interface CreateMenuInput {
  restaurantId: string;
  nameInternal: string;
  name: string;
  description: string | null;
  status: MenuStatus;
  displayOrder: number;
}

/**
 * `menuId` is the raw, unauthorized `:menuId` route parameter -- every
 * field other than `restaurantId`/`menuId` is genuinely optional
 * (`undefined` means "omitted, leave unchanged"; `description: null` means
 * "clear this field"), mirroring `UpdateProductInput`'s settled convention
 * exactly. `isPrimary` has no field here at all -- it is never writable
 * through this generic Update, only through `setPrimaryMenu` below.
 */
export interface UpdateMenuInput {
  restaurantId: string;
  menuId: string;
  nameInternal?: string;
  name?: string;
  description?: string | null;
  status?: MenuStatus;
  displayOrder?: number;
}

export type UpdateMenuResult =
  | { outcome: 'updated'; data: MenuWithTranslation }
  | { outcome: 'menuNotFound' };

export interface SetPrimaryMenuInput {
  restaurantId: string;
  menuId: string;
}

export type SetPrimaryMenuResult =
  | { outcome: 'updated'; data: MenuWithTranslation }
  | { outcome: 'menuNotFound' };

/**
 * Day 1 Menu Vertical Slice, Batch C: Menu List and Create.
 *
 * `isPrimary` is entirely server-controlled (settled contract #7): the
 * first Menu created for a Restaurant becomes primary, every subsequent one
 * does not. The database's `menus_one_primary_menu` partial unique index is
 * the final concurrency guarantee -- this service does not attempt to
 * replicate that invariant with a distributed lock or `SERIALIZABLE`
 * isolation. Two truly concurrent first-Menu requests race the ordinary
 * READ COMMITTED count-then-insert window; the loser's transaction rolls
 * back entirely (no partial Menu-without-translation row is ever left
 * behind) and is retried once, recomputing the count against the winner's
 * now-committed row -- the retry always resolves to `isPrimary = false`.
 * This never surfaces a raw Prisma/P2002 error to the caller.
 */
@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}

  async listMenus(scope: AuthorizedMenuScope): Promise<MenuWithTranslation[]> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: scope.restaurantId },
      select: { defaultLocale: true },
    });

    // Explicitly Tenant-scoped by the query itself, not merely trusted from
    // RestaurantAccessGuard having already authorized this restaurantId --
    // defense in depth (mirrors BranchesService.listBranches). Only the
    // Restaurant's own default-locale translation row is fetched per Menu
    // (bounded `where`+`take: 1` inside the relation load, not a second
    // per-row query) -- no full-locale-set N+1.
    const menus = await this.prisma.menu.findMany({
      where: { restaurantId: scope.restaurantId },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        nameInternal: true,
        status: true,
        displayOrder: true,
        isPrimary: true,
        translations: {
          where: { locale: restaurant.defaultLocale },
          select: { locale: true, name: true, description: true },
          take: 1,
        },
      },
    });

    return menus.map((menu) => ({
      id: menu.id,
      nameInternal: menu.nameInternal,
      status: menu.status,
      displayOrder: menu.displayOrder,
      isPrimary: menu.isPrimary,
      // Defensive only: Batch C creation is atomic (Menu + its default-locale
      // translation always committed together), so this fallback is not
      // expected to be exercised under normal operation.
      translation: menu.translations[0] ?? {
        locale: restaurant.defaultLocale,
        name: menu.nameInternal,
        description: null,
      },
    }));
  }

  async createMenu(input: CreateMenuInput): Promise<MenuWithTranslation> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { defaultLocale: true },
    });

    let lastRaceError: unknown;
    for (let attempt = 1; attempt <= MAX_PRIMARY_RACE_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const existingMenuCount = await tx.menu.count({
            where: { restaurantId: input.restaurantId },
          });

          const menu = await tx.menu.create({
            data: {
              restaurantId: input.restaurantId,
              nameInternal: input.nameInternal,
              status: input.status,
              displayOrder: input.displayOrder,
              isPrimary: existingMenuCount === 0,
            },
            select: {
              id: true,
              nameInternal: true,
              status: true,
              displayOrder: true,
              isPrimary: true,
            },
          });

          const translation = await tx.menuTranslation.create({
            data: {
              menuId: menu.id,
              locale: restaurant.defaultLocale,
              name: input.name,
              description: input.description,
            },
            select: { locale: true, name: true, description: true },
          });

          return { ...menu, translation };
        });
      } catch (error) {
        if (
          isOnePrimaryMenuRace(error) &&
          attempt < MAX_PRIMARY_RACE_ATTEMPTS
        ) {
          lastRaceError = error;
          continue;
        }
        throw error;
      }
    }

    // Unreachable in practice (the loop always returns or throws), but
    // keeps the function's control flow explicit for TypeScript.
    throw lastRaceError;
  }

  async updateMenu(input: UpdateMenuInput): Promise<UpdateMenuResult> {
    // A value that isn't even a well-formed UUID can never match any real
    // row (mirrors `ProductsService.updateProduct`'s established
    // `isWellFormedUuid` pre-check).
    if (!isWellFormedUuid(input.menuId)) {
      return { outcome: 'menuNotFound' };
    }

    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { defaultLocale: true },
    });

    return this.prisma.$transaction(async (tx) => {
      // Menu identity + Tenant check together, in one query -- never
      // `findUnique({ id })` followed by a separate ownership comparison,
      // so a foreign-Restaurant Menu can never even be loaded before being
      // hidden.
      const existing = await tx.menu.findFirst({
        where: { id: input.menuId, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!existing) {
        return { outcome: 'menuNotFound' };
      }

      // Explicit field-by-field `data` object, never a spread of `input` --
      // matches `updateProduct`'s established convention so no future field
      // ever silently becomes persistence authority. `isPrimary` can never
      // appear here at all, since `UpdateMenuInput` has no such field.
      const menuData: {
        nameInternal?: string;
        status?: MenuStatus;
        displayOrder?: number;
      } = {};
      if (input.nameInternal !== undefined) {
        menuData.nameInternal = input.nameInternal;
      }
      if (input.status !== undefined) {
        menuData.status = input.status;
      }
      if (input.displayOrder !== undefined) {
        menuData.displayOrder = input.displayOrder;
      }

      // Mirrors `updateProduct`: even an empty `data` object still performs
      // the update call as a safe no-op that returns the current row.
      const updatedMenu = await tx.menu.update({
        where: { id: existing.id },
        data: menuData,
        select: {
          id: true,
          nameInternal: true,
          status: true,
          displayOrder: true,
          isPrimary: true,
        },
      });

      const translationData: { name?: string; description?: string | null } =
        {};
      if (input.name !== undefined) {
        translationData.name = input.name;
      }
      if (input.description !== undefined) {
        translationData.description = input.description;
      }
      if (Object.keys(translationData).length > 0) {
        await tx.menuTranslation.updateMany({
          where: { menuId: existing.id, locale: restaurant.defaultLocale },
          data: translationData,
        });
      }

      // Always re-read the current default-locale translation for the
      // response, whether or not it was just modified.
      const translation = await tx.menuTranslation.findFirstOrThrow({
        where: { menuId: existing.id, locale: restaurant.defaultLocale },
        select: { locale: true, name: true, description: true },
      });

      return { outcome: 'updated', data: { ...updatedMenu, translation } };
    });
  }

  /**
   * Settled contract (Batch F #12/#13): switches the Restaurant's primary
   * Menu. If the target is already primary, this is an idempotent no-op
   * success (no write at all). Otherwise, within one transaction, the
   * Restaurant's current primary Menu (if any) is unset before the target
   * is set -- this never commits a transient two-primary state, though the
   * database's `menus_one_primary_menu` partial unique index remains the
   * final authority regardless.
   *
   * Concurrency (#14): two concurrent Set-Primary calls targeting different
   * Menus in the same Restaurant can legitimately race -- the loser's
   * `tx.menu.update({ isPrimary: true })` can violate
   * `menus_one_primary_menu` if the winner's new primary committed between
   * the loser's own unset-old-primary step and its set-new-primary step
   * (the loser's `updateMany` unset query, evaluated after the winner
   * commits, no longer matches the winner's now-different primary row, so
   * it silently affects zero rows -- Postgres does not retroactively widen
   * an already-executing `UPDATE ... WHERE` to newly-matching rows). This
   * is the same race shape as `createMenu`'s first-Menu race and reuses the
   * identical `isOnePrimaryMenuRace` detection and the same bounded retry,
   * but it is NOT guaranteed to resolve within that one retry the way
   * `createMenu`'s race is: with more than two concurrent Set-Primary
   * requests targeting different Menus, a retrying request can itself race
   * again and hit the same named conflict. If the bounded retry is
   * exhausted, the still-unresolved `menus_one_primary_menu` conflict is
   * thrown rather than swallowed -- the database's partial unique index
   * remains the final at-most-one-primary-Menu guarantee regardless of
   * retry outcome. Only this specific named-index P2002 is caught; any
   * other error (including an unrelated P2002) propagates unchanged,
   * without retry.
   */
  async setPrimaryMenu(
    input: SetPrimaryMenuInput,
  ): Promise<SetPrimaryMenuResult> {
    if (!isWellFormedUuid(input.menuId)) {
      return { outcome: 'menuNotFound' };
    }

    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { defaultLocale: true },
    });

    let lastRaceError: unknown;
    for (let attempt = 1; attempt <= MAX_PRIMARY_RACE_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const target = await tx.menu.findFirst({
            where: { id: input.menuId, restaurantId: input.restaurantId },
            select: { id: true, isPrimary: true },
          });
          if (!target) {
            return { outcome: 'menuNotFound' };
          }

          if (!target.isPrimary) {
            // Restaurant-scoped unset -- never affects another Restaurant's
            // Menus. Matches zero or one row under the established DB
            // invariant; a zero-row match (no current primary) is a safe
            // no-op, not an error.
            await tx.menu.updateMany({
              where: { restaurantId: input.restaurantId, isPrimary: true },
              data: { isPrimary: false },
            });
            await tx.menu.update({
              where: { id: target.id },
              data: { isPrimary: true },
            });
          }

          const updatedMenu = await tx.menu.findUniqueOrThrow({
            where: { id: target.id },
            select: {
              id: true,
              nameInternal: true,
              status: true,
              displayOrder: true,
              isPrimary: true,
            },
          });
          const translation = await tx.menuTranslation.findFirstOrThrow({
            where: {
              menuId: target.id,
              locale: restaurant.defaultLocale,
            },
            select: { locale: true, name: true, description: true },
          });

          return { outcome: 'updated', data: { ...updatedMenu, translation } };
        });
      } catch (error) {
        if (
          isOnePrimaryMenuRace(error) &&
          attempt < MAX_PRIMARY_RACE_ATTEMPTS
        ) {
          lastRaceError = error;
          continue;
        }
        throw error;
      }
    }

    // Unreachable in practice (the loop always returns or throws), but
    // keeps the function's control flow explicit for TypeScript.
    throw lastRaceError;
  }
}
