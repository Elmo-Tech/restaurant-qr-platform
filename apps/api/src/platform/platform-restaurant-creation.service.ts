import { Injectable } from '@nestjs/common';
import { PasswordHasherService } from '../auth/password/password-hasher.service';
import { PrismaService } from '../database/prisma.service';
import {
  provisionRestaurant,
  type ProvisioningPrisma,
} from '../provisioning/provision-restaurant';
import { PlatformAuditService } from './platform-audit.service';
import type { PlatformAdminPrincipal } from './platform-auth.service';

export interface CreateRestaurantInput {
  restaurantName: string;
  ownerEmail: string;
  ownerPassword: string;
  branchName: string;
  defaultLocale: string;
  currencyCode: string;
  timezone: string;
  /** The billing country, 2 letters; missing = Egypt (DEC-049). */
  countryCode?: string;
  /** Optional package to put the new Restaurant on. */
  packageId: string | null;
}

export type CreateRestaurantOutcome =
  | {
      outcome: 'created';
      id: string;
      publicId: string;
      name: string;
      ownerEmail: string;
    }
  | { outcome: 'invalidInput'; problems: string[] }
  | { outcome: 'ownerEmailInUse' }
  | { outcome: 'alreadyExists' }
  | { outcome: 'packageNotFound' }
  | { outcome: 'packageArchived' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates a Restaurant with its OWNER from the platform console (DEC-047). It reuses the one
 * provisioning routine the operations CLI uses (Restaurant, locales, starter roles, OWNER user and
 * membership, first Branch, Generic QR: one transaction, no menu or fake data), then puts the
 * Restaurant on its package. The platform team types the owner's password; it is only ever passed
 * to the Argon2id hasher and is never stored in the audit log, returned or logged.
 */
@Injectable()
export class PlatformRestaurantCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasherService,
    private readonly audit: PlatformAuditService,
  ) {}

  async create(
    admin: PlatformAdminPrincipal,
    input: CreateRestaurantInput,
  ): Promise<CreateRestaurantOutcome> {
    // Check the package first so a bad choice cannot leave a Restaurant half set up.
    let packageName: string | null = null;
    if (input.packageId !== null) {
      if (!UUID.test(input.packageId)) return { outcome: 'packageNotFound' };
      const pkg = await this.prisma.package.findUnique({
        where: { id: input.packageId },
        select: { name: true, status: true },
      });
      if (!pkg) return { outcome: 'packageNotFound' };
      if (pkg.status === 'ARCHIVED') return { outcome: 'packageArchived' };
      packageName = pkg.name;
    }

    const result = await provisionRestaurant(
      this.prisma as unknown as ProvisioningPrisma,
      this.hasher,
      {
        restaurantName: input.restaurantName,
        ownerEmail: input.ownerEmail,
        ownerPassword: input.ownerPassword,
        branchName: input.branchName,
        defaultLocale: input.defaultLocale,
        currencyCode: input.currencyCode,
        timezone: input.timezone,
      },
    );
    if (result.outcome === 'invalidInput') {
      return { outcome: 'invalidInput', problems: result.problems };
    }
    if (result.outcome === 'conflict') return { outcome: 'ownerEmailInUse' };
    // The console creates new accounts only: an existing owner of the same name is a duplicate.
    if (result.outcome === 'alreadyProvisioned') {
      return { outcome: 'alreadyExists' };
    }

    const restaurant = await this.prisma.restaurant.update({
      where: { publicId: result.restaurantPublicId },
      data: {
        packageId: input.packageId,
        ...(input.countryCode ? { countryCode: input.countryCode.toUpperCase() } : {}),
      },
      select: { id: true, publicId: true, name: true },
    });
    await this.audit.record({
      admin,
      action: 'restaurant.created',
      restaurant: { id: restaurant.id, name: restaurant.name },
      details: { ownerEmail: result.ownerEmail, package: packageName },
    });
    return {
      outcome: 'created',
      id: restaurant.id,
      publicId: restaurant.publicId,
      name: restaurant.name,
      ownerEmail: result.ownerEmail,
    };
  }
}
