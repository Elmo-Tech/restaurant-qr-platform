import {
  STARTER_ROLE_KINDS,
  type StarterRoleKind,
} from './../../src/auth/permission/role-permissions';
import { starterRoleData } from './../../src/auth/permission/starter-roles';
import { PrismaService } from './../../src/database/prisma.service';

/**
 * E2E fixture (FT-12C): every Membership now references a Restaurant-scoped
 * `RestaurantRole`. Returns the Restaurant's starter Role of `kind`, creating
 * it from the same templates production provisioning/backfill use when the
 * test's directly-created Restaurant does not have it yet.
 */
export async function ensureStarterRole(
  prisma: PrismaService,
  restaurantId: string,
  kind: StarterRoleKind,
) {
  // Seed the whole starter set (as provisioning/backfill do), so an Invitation
  // or role change to ANY starter kind finds its Role row.
  for (const starterKind of STARTER_ROLE_KINDS) {
    const exists = await prisma.restaurantRole.findFirst({
      where: { restaurantId, kind: starterKind },
      select: { id: true },
    });
    if (!exists) {
      await prisma.restaurantRole.create({
        data: { restaurantId, ...starterRoleData(starterKind) },
      });
    }
  }
  return prisma.restaurantRole.findFirstOrThrow({ where: { restaurantId, kind } });
}
