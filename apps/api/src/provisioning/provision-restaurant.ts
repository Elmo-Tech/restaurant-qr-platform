import { randomUUID } from 'node:crypto';
import { STARTER_ROLE_KINDS } from '../auth/permission/role-permissions';
import { starterRoleData } from '../auth/permission/starter-roles';
import { createBranchPublicId } from '../branches/branch-public-id';
import { Prisma } from '../generated/prisma/client';
import { createQrPublicCode } from '../qr/qr-public-code';
import {
  PLATFORM_SUPPORTED_LOCALES,
  normalizePlatformLocale,
  type PlatformSupportedLocale,
} from '../restaurants/platform-locales';

/**
 * FT-9: Operations-only provisioning of ONE new Restaurant -- there is no
 * public signup and no Platform Admin in V1. Creates, atomically:
 *   Restaurant (ACTIVE) + its Platform locales (all active) + an OWNER User
 *   and Membership (Restaurant-wide access) + one ACTIVE Branch + the
 *   Restaurant's Generic QR.
 * It creates NO Menu, Category, Product or any other fake data -- the Owner
 * builds the menu in Staff.
 *
 * Safe by construction:
 * - the owner password is a required INPUT (the CLI reads it from the
 *   environment, never argv), is only ever passed to the Argon2id hasher, and
 *   is never logged, returned or placed in an error;
 * - an owner e-mail that already exists is a CONFLICT (nothing is written)
 *   unless that same user already owns a Restaurant with this exact name, in
 *   which case the run is a no-op "already provisioned" (safe to re-run);
 * - everything is one transaction: any failure leaves no partial Restaurant.
 */

export interface ProvisionRestaurantInput {
  restaurantName: string;
  ownerEmail: string;
  ownerPassword: string;
  branchName: string;
  defaultLocale: string;
  currencyCode: string;
  timezone: string;
}

export type ProvisionRestaurantResult =
  | {
      outcome: 'provisioned';
      restaurantPublicId: string;
      branchName: string;
      ownerEmail: string;
      genericQrPublicCode: string;
    }
  | { outcome: 'alreadyProvisioned'; restaurantPublicId: string }
  | { outcome: 'conflict'; reason: 'ownerEmailInUse' }
  | { outcome: 'invalidInput'; problems: string[] };

/** The minimal Prisma shape this needs (a real PrismaClient, or a test double). */
export interface ProvisioningPrisma {
  $transaction<T>(callback: (tx: ProvisioningTx) => Promise<T>): Promise<T>;
}

export interface ProvisioningTx {
  user: {
    findUnique(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<{ id: string }>;
  };
  restaurantRole: {
    create(args: unknown): Promise<{ id: string }>;
  };
  restaurantMembership: {
    findFirst(
      args: unknown,
    ): Promise<{ restaurant: { publicId: string } } | null>;
    create(args: unknown): Promise<unknown>;
  };
  restaurant: {
    create(args: unknown): Promise<{ id: string; publicId: string }>;
  };
  restaurantSetup: { create(args: unknown): Promise<unknown> };
  restaurantLocale: { createMany(args: unknown): Promise<unknown> };
  branch: { create(args: unknown): Promise<{ id: string; name: string }> };
  qrCode: { create(args: unknown): Promise<{ publicCode: string }> };
}

export interface PasswordHasher {
  hashPassword(password: string): Promise<string>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Trims and validates the operator input. Returns problems (never echoing the password) or the normalized values. */
export function validateProvisionInput(input: ProvisionRestaurantInput):
  | {
      ok: true;
      value: ProvisionRestaurantInput & {
        defaultLocale: PlatformSupportedLocale;
      };
    }
  | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const restaurantName = input.restaurantName.trim();
  const branchName = input.branchName.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const currencyCode = input.currencyCode.trim().toUpperCase();
  const timezone = input.timezone.trim();
  const defaultLocale = normalizePlatformLocale(input.defaultLocale);

  if (restaurantName.length < 2 || restaurantName.length > 100) {
    problems.push('restaurant name must be 2-100 characters');
  }
  if (branchName.length < 1 || branchName.length > 100) {
    problems.push('branch name must be 1-100 characters');
  }
  if (!EMAIL_PATTERN.test(ownerEmail) || ownerEmail.length > 254) {
    problems.push('owner email is not a valid email address');
  }
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    problems.push('currency must be a 3-letter ISO code such as EGP');
  }
  if (defaultLocale === null) {
    problems.push(
      `default locale must be one of: ${PLATFORM_SUPPORTED_LOCALES.join(', ')}`,
    );
  }
  if (!isValidTimezone(timezone)) {
    problems.push(
      'timezone must be a valid IANA timezone such as Africa/Cairo',
    );
  }
  if (input.ownerPassword.length === 0) {
    problems.push('owner password is required');
  }

  if (problems.length > 0 || defaultLocale === null) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    value: {
      restaurantName,
      branchName,
      ownerEmail,
      ownerPassword: input.ownerPassword,
      currencyCode,
      timezone,
      defaultLocale,
    },
  };
}

export async function provisionRestaurant(
  prisma: ProvisioningPrisma,
  hasher: PasswordHasher,
  rawInput: ProvisionRestaurantInput,
): Promise<ProvisionRestaurantResult> {
  const validated = validateProvisionInput(rawInput);
  if (!validated.ok) {
    return { outcome: 'invalidInput', problems: validated.problems };
  }
  const input = validated.value;

  // Hashing enforces the password length policy (the error never contains the password).
  let passwordHash: string;
  try {
    passwordHash = await hasher.hashPassword(input.ownerPassword);
  } catch {
    return {
      outcome: 'invalidInput',
      problems: [
        'owner password does not satisfy the password policy (length)',
      ],
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { emailNormalized: input.ownerEmail },
        select: { id: true },
      });

      if (existingUser) {
        // Re-run of the same provisioning: this user already OWNS a Restaurant with this exact name.
        const owned = await tx.restaurantMembership.findFirst({
          where: {
            userId: existingUser.id,
            role: 'OWNER',
            restaurant: { name: input.restaurantName },
          },
          select: { restaurant: { select: { publicId: true } } },
        });
        if (owned) {
          return {
            outcome: 'alreadyProvisioned' as const,
            restaurantPublicId: owned.restaurant.publicId,
          };
        }
        // An unrelated existing identity: never attach, never overwrite its password.
        return {
          outcome: 'conflict' as const,
          reason: 'ownerEmailInUse' as const,
        };
      }

      const restaurant = await tx.restaurant.create({
        data: {
          // No Restaurant publicId convention exists yet (the `branch-` form is
          // Branch-only by decision); an opaque prefixed UUID, Backend-generated.
          publicId: `restaurant-${randomUUID()}`,
          name: input.restaurantName,
          status: 'ACTIVE',
          defaultLocale: input.defaultLocale,
          currencyCode: input.currencyCode,
        },
        select: { id: true, publicId: true },
      });

      // Only NEW restaurants enter optional setup. Existing tenants never get a
      // row from migration or from a provisioning no-op.
      await tx.restaurantSetup.create({
        data: { restaurantId: restaurant.id },
      });

      // Every Platform-supported locale is active from day one; the default is one of them.
      await tx.restaurantLocale.createMany({
        data: PLATFORM_SUPPORTED_LOCALES.map((locale) => ({
          restaurantId: restaurant.id,
          locale,
          isActive: true,
        })),
      });

      const user = await tx.user.create({
        data: {
          email: input.ownerEmail,
          emailNormalized: input.ownerEmail,
          passwordHash,
          status: 'ACTIVE',
          preferredLocale: null,
        },
        select: { id: true },
      });

      // FT-12C: every Restaurant starts with its five starter Roles; the
      // protected Owner Role is what the first Owner holds.
      let ownerRoleId = '';
      for (const kind of STARTER_ROLE_KINDS) {
        const role = await tx.restaurantRole.create({
          data: { restaurantId: restaurant.id, ...starterRoleData(kind) },
          select: { id: true },
        });
        if (kind === 'OWNER') {
          ownerRoleId = role.id;
        }
      }

      await tx.restaurantMembership.create({
        data: {
          restaurantId: restaurant.id,
          userId: user.id,
          role: 'OWNER',
          roleId: ownerRoleId,
          status: 'ACTIVE',
          allBranches: true,
        },
      });

      const branch = await tx.branch.create({
        data: {
          publicId: createBranchPublicId(),
          restaurantId: restaurant.id,
          name: input.branchName,
          status: 'ACTIVE',
          timezone: input.timezone,
        },
        select: { id: true, name: true },
      });

      const qr = await tx.qrCode.create({
        data: {
          publicCode: createQrPublicCode(),
          restaurantId: restaurant.id,
          branchId: null,
          tableId: null,
          type: 'GENERIC',
          status: 'ACTIVE',
        },
        select: { publicCode: true },
      });

      return {
        outcome: 'provisioned' as const,
        restaurantPublicId: restaurant.publicId,
        branchName: branch.name,
        ownerEmail: input.ownerEmail,
        genericQrPublicCode: qr.publicCode,
      };
    });
  } catch (error) {
    // A concurrent provisioning of the same owner e-mail lost the unique race.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return { outcome: 'conflict', reason: 'ownerEmailInUse' };
    }
    throw error;
  }
}
