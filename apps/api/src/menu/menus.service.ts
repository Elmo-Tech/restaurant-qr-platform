import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { MenuStatus } from '../generated/prisma/client';

const MAX_CREATE_ATTEMPTS = 2;

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
    for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt++) {
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
        if (isOnePrimaryMenuRace(error) && attempt < MAX_CREATE_ATTEMPTS) {
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
