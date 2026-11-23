import { Injectable, NotFoundException } from '@nestjs/common';
import type { RestaurantAccessContext } from '../auth/context/restaurant-access.service';
import {
  resolveLocalizedName,
  type NameTranslationView,
} from '../common/name-translations';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';

export type PromotionReadScope = Pick<
  RestaurantAccessContext,
  'restaurantId' | 'membershipId' | 'allBranches'
>;

const translations = {
  select: { locale: true, name: true },
  orderBy: { locale: 'asc' },
} as const;
const ordered = [{ displayOrder: 'asc' }, { id: 'asc' }] as const;
const targetSelect = { id: true, status: true, translations } as const;

@Injectable()
export class PromotionTargetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list({ restaurantId, membershipId, allBranches }: PromotionReadScope) {
    // Branches and zones carry branch-scoped operational context. The menu catalog is Restaurant-wide.
    const branchWhere: Prisma.BranchWhereInput = {
      restaurantId,
      ...(allBranches
        ? {}
        : {
            membershipBranches: {
              some: { restaurantMembershipId: membershipId },
            },
          }),
    };
    const [restaurant, branches, menus, categories, products, deliveryZones] =
      await Promise.all([
        this.prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: {
            defaultLocale: true,
            locales: {
              where: { isActive: true },
              select: { locale: true },
              orderBy: { locale: 'asc' },
            },
          },
        }),
        this.prisma.branch.findMany({
          where: branchWhere,
          select: { ...targetSelect, name: true, timezone: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.menu.findMany({
          where: { restaurantId },
          select: { ...targetSelect, nameInternal: true },
          orderBy: [...ordered],
        }),
        this.prisma.category.findMany({
          where: { restaurantId, menu: { restaurantId } },
          select: { ...targetSelect, menuId: true },
          orderBy: [...ordered],
        }),
        this.prisma.product.findMany({
          where: {
            restaurantId,
            category: { restaurantId, menu: { restaurantId } },
          },
          select: { ...targetSelect, categoryId: true, availability: true },
          orderBy: [...ordered],
        }),
        this.prisma.deliveryZone.findMany({
          where: { restaurantId, branch: branchWhere },
          select: { ...targetSelect, branchId: true, name: true },
          orderBy: [...ordered],
        }),
      ]);
    if (!restaurant) {
      throw new NotFoundException({
        error: {
          code: 'RESTAURANT_NOT_FOUND',
          message: 'Restaurant not found.',
        },
      });
    }
    const { defaultLocale } = restaurant;
    const localized = (names: NameTranslationView[], fallback: string) =>
      resolveLocalizedName({
        defaultLocale,
        requestedLocale: defaultLocale,
        translations: names,
        legacyName: fallback,
      });
    return {
      defaultLocale,
      activeLocales: restaurant.locales.map(({ locale }) => locale),
      branches,
      menus: menus.map(({ nameInternal, ...row }) => ({
        ...row,
        name: localized(row.translations, nameInternal),
      })),
      categories: categories.map((row) => ({
        ...row,
        name: localized(row.translations, row.translations[0]?.name ?? row.id),
      })),
      products: products.map((row) => ({
        ...row,
        name: localized(row.translations, row.translations[0]?.name ?? row.id),
      })),
      deliveryZones,
    };
  }
}
