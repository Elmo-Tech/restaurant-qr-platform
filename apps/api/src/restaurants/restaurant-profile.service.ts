import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/** Safe Restaurant Profile shape -- never `publicId`, `status`, `currencyCode`/`defaultLocale` mutation authority, `createdAt`/`updatedAt`. */
export interface RestaurantProfile {
  name: string;
  logoAssetPath: string | null;
  /** Guest Menu hero cover image; null keeps the default branded hero. */
  coverAssetPath: string | null;
}

export interface UpdateRestaurantProfileInput {
  restaurantId: string;
  name: string;
}

export interface SetRestaurantLogoInput {
  restaurantId: string;
  imageAssetPath: string;
}

export type SetRestaurantLogoResult = {
  data: RestaurantProfile;
  previousLogoAssetPath: string | null;
};

export interface ClearRestaurantLogoInput {
  restaurantId: string;
}

export type ClearRestaurantLogoResult = {
  previousLogoAssetPath: string | null;
};

const PROFILE_SELECT = {
  name: true,
  logoAssetPath: true,
  coverAssetPath: true,
} as const;

export interface SetRestaurantCoverInput {
  restaurantId: string;
  imageAssetPath: string;
}

export type SetRestaurantCoverResult = {
  data: RestaurantProfile;
  previousCoverAssetPath: string | null;
};

export type ClearRestaurantCoverResult = {
  previousCoverAssetPath: string | null;
};

/**
 * FT-12: Restaurant Profile (name, logo). `restaurantId` authority always
 * comes from the caller's already-authorized `request.restaurantAccess.
 * restaurantId` -- this service performs no Membership query of its own.
 * Mirrors `ProductsService.setProductImage`/`clearProductImage`'s exact
 * save-new-file-then-DB-write-then-best-effort-delete-old-file contract
 * (the Controller orchestrates the actual file I/O via
 * `ImageStorageService`; this service only ever reads/writes
 * `Restaurant.logoAssetPath`).
 */
@Injectable()
export class RestaurantProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(input: UpdateRestaurantProfileInput): Promise<RestaurantProfile> {
    return this.prisma.restaurant.update({
      where: { id: input.restaurantId },
      data: { name: input.name },
      select: PROFILE_SELECT,
    });
  }

  async setLogo(input: SetRestaurantLogoInput): Promise<SetRestaurantLogoResult> {
    const existing = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { logoAssetPath: true },
    });

    const data = await this.prisma.restaurant.update({
      where: { id: input.restaurantId },
      data: { logoAssetPath: input.imageAssetPath },
      select: PROFILE_SELECT,
    });

    return { data, previousLogoAssetPath: existing.logoAssetPath };
  }

  /** Same save-file, then DB write, then best-effort delete of the old file contract as the logo. */
  async setCover(input: SetRestaurantCoverInput): Promise<SetRestaurantCoverResult> {
    const existing = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { coverAssetPath: true },
    });

    const data = await this.prisma.restaurant.update({
      where: { id: input.restaurantId },
      data: { coverAssetPath: input.imageAssetPath },
      select: PROFILE_SELECT,
    });

    return { data, previousCoverAssetPath: existing.coverAssetPath };
  }

  async clearCover(input: { restaurantId: string }): Promise<ClearRestaurantCoverResult> {
    const existing = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { coverAssetPath: true },
    });

    if (existing.coverAssetPath !== null) {
      await this.prisma.restaurant.update({
        where: { id: input.restaurantId },
        data: { coverAssetPath: null },
      });
    }

    return { previousCoverAssetPath: existing.coverAssetPath };
  }

  async clearLogo(input: ClearRestaurantLogoInput): Promise<ClearRestaurantLogoResult> {
    const existing = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { logoAssetPath: true },
    });

    if (existing.logoAssetPath !== null) {
      await this.prisma.restaurant.update({
        where: { id: input.restaurantId },
        data: { logoAssetPath: null },
      });
    }

    return { previousLogoAssetPath: existing.logoAssetPath };
  }
}
