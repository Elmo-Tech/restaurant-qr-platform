import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../database/prisma.service';
import { PlatformAuditService, SYSTEM_ACTOR } from '../platform-audit.service';
import { todayInCairo } from './subscription-dates';
import { decideSync } from './subscription-sync';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Keeps each Restaurant in step with its subscriptions (DEC-049): its Package follows the
 * subscription that covers today, and it is suspended once its last subscription ended and the grace
 * period passed (and reactivated by the next one, if the platform suspended it). Idempotent: running
 * it again changes nothing. The decision itself is the pure `decideSync`; this applies it with
 * compare-and-set updates so a concurrent manual change is never overwritten.
 *
 * It runs for one Restaurant whenever a subscription changes, and for all Restaurants that have
 * subscriptions once an hour inside the API process (no scheduler dependency; safe with several
 * instances because every step is idempotent).
 */
@Injectable()
export class SubscriptionSyncService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SubscriptionSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  onApplicationBootstrap(): void {
    // Not during tests: the e2e suites boot the whole app and must not have a background writer.
    if (process.env.NODE_ENV === 'test') return;
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Every Restaurant that has at least one live subscription. */
  async sweep(now: Date = new Date()): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const rows = await this.prisma.restaurant.findMany({
        where: { subscriptions: { some: { status: 'ACTIVE' } } },
        select: { id: true },
      });
      for (const row of rows) {
        try {
          await this.syncRestaurant(row.id, now);
        } catch (error) {
          this.logger.error(
            `Subscription sync failed for restaurant ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Subscription sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.sweeping = false;
    }
  }

  async syncRestaurant(
    restaurantId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        status: true,
        packageId: true,
        package: { select: { name: true } },
        subscriptionSuspendedAt: true,
        subscriptionOverrideAt: true,
        subscriptions: {
          select: {
            status: true,
            packageId: true,
            startsAt: true,
            endsAt: true,
            packageName: true,
          },
        },
      },
    });
    if (!restaurant) return;

    const decision = decideSync({
      today: todayInCairo(now),
      graceDays: this.config.get('SUBSCRIPTION_GRACE_DAYS', { infer: true }),
      restaurant,
      subscriptions: restaurant.subscriptions,
    });
    const subject = { id: restaurant.id, name: restaurant.name };

    if (decision.setPackageId !== undefined) {
      const target = await this.prisma.package.findUnique({
        where: { id: decision.setPackageId },
        select: { name: true },
      });
      const changed = await this.prisma.restaurant.updateMany({
        where: { id: restaurant.id, packageId: restaurant.packageId },
        data: { packageId: decision.setPackageId },
      });
      if (changed.count === 1) {
        await this.audit.record({
          admin: SYSTEM_ACTOR,
          action: 'restaurant.package_changed',
          restaurant: subject,
          details: {
            from: restaurant.package?.name ?? null,
            to: target?.name ?? null,
            reason: 'subscription',
          },
        });
      }
    }

    if (decision.suspend) {
      const changed = await this.prisma.restaurant.updateMany({
        where: { id: restaurant.id, status: 'ACTIVE' },
        data: { status: 'SUSPENDED', subscriptionSuspendedAt: now },
      });
      if (changed.count === 1) {
        await this.audit.record({
          admin: SYSTEM_ACTOR,
          action: 'restaurant.auto_suspended',
          restaurant: subject,
          details: { reason: 'subscription_ended' },
        });
      }
    }

    if (decision.reactivate) {
      const changed = await this.prisma.restaurant.updateMany({
        where: {
          id: restaurant.id,
          status: 'SUSPENDED',
          subscriptionSuspendedAt: { not: null },
        },
        data: { status: 'ACTIVE', subscriptionSuspendedAt: null },
      });
      if (changed.count === 1) {
        await this.audit.record({
          admin: SYSTEM_ACTOR,
          action: 'restaurant.auto_reactivated',
          restaurant: subject,
          details: { reason: 'subscription_started' },
        });
      }
    }
  }
}
