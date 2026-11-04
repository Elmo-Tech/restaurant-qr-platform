import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { backfillRestaurantSlugs } from './restaurant-slug-store';

/**
 * DEC-066: once the slug table exists, every Restaurant that has no readable link yet gets one when the
 * API starts, so an existing deployment needs no manual step. Idempotent (a Restaurant with a slug is never
 * touched), safe with several instances (the unique index decides; a loser retries), and a failure only
 * logs: the opaque QR code links keep working without a slug. `scripts/backfill-restaurant-slugs.ts` is the
 * same code, runnable by hand (with `--dry-run`).
 */
@Injectable()
export class RestaurantSlugBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RestaurantSlugBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    // Not during tests: the e2e suites boot the whole app and must not have a background writer.
    if (process.env.NODE_ENV === 'test') return;
    try {
      const summary = await backfillRestaurantSlugs(this.prisma);
      if (summary.assigned.length > 0) {
        this.logger.log(
          `Assigned readable menu links to ${summary.assigned.length} restaurant(s); ${summary.alreadyHadSlug} already had one.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Restaurant slug backfill failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
