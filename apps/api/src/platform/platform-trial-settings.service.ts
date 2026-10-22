import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PlatformAuditService } from './platform-audit.service';
import type { PlatformAdminPrincipal } from './platform-auth.service';
import {
  addDays,
  formatDateOnly,
  todayInCairo,
} from './billing/subscription-dates';
import { SubscriptionSyncService } from './billing/subscription-sync.service';

const SETTINGS_ID = 'trial';

export interface PlatformTrialSettingsView {
  enabled: boolean;
  defaultDays: number;
  defaultPackage: { id: string; name: string } | null;
  updatedAt: string | null;
}

export interface ActiveTrialAdjustmentView {
  adjusted: number;
  skipped: number;
}

export type TrialSettingsOutcome =
  | { outcome: 'ok'; data: PlatformTrialSettingsView }
  | { outcome: 'PACKAGE_NOT_AVAILABLE' };

const include = {
  defaultPackage: { select: { id: true, name: true } },
} as const;

/** Small, explicit Platform defaults for newly-created trials (DEC-056). */
@Injectable()
export class PlatformTrialSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
    private readonly sync: SubscriptionSyncService,
  ) {}

  async get(): Promise<PlatformTrialSettingsView> {
    const row = await this.prisma.platformTrialSettings.findUnique({
      where: { id: SETTINGS_ID },
      include,
    });
    return {
      enabled: row?.enabled ?? true,
      defaultDays: row?.defaultDays ?? 15,
      defaultPackage: row?.defaultPackage ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async update(
    admin: PlatformAdminPrincipal,
    input: {
      enabled: boolean;
      defaultDays: number;
      defaultPackageId: string | null;
    },
  ): Promise<TrialSettingsOutcome> {
    if (input.defaultPackageId) {
      const pkg = await this.prisma.package.findUnique({
        where: { id: input.defaultPackageId },
        select: { status: true },
      });
      if (!pkg || pkg.status !== 'ACTIVE') {
        return { outcome: 'PACKAGE_NOT_AVAILABLE' };
      }
    }

    const before = await this.get();
    const row = await this.prisma.platformTrialSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        enabled: input.enabled,
        defaultDays: input.defaultDays,
        defaultPackageId: input.defaultPackageId,
      },
      update: {
        enabled: input.enabled,
        defaultDays: input.defaultDays,
        defaultPackageId: input.defaultPackageId,
      },
      include,
    });
    await this.audit.record({
      admin,
      action: 'platform.trial_settings_updated',
      details: {
        from: {
          enabled: before.enabled,
          defaultDays: before.defaultDays,
          defaultPackageId: before.defaultPackage?.id ?? null,
        },
        to: {
          enabled: row.enabled,
          defaultDays: row.defaultDays,
          defaultPackageId: row.defaultPackage?.id ?? null,
        },
      },
    });
    return {
      outcome: 'ok',
      data: {
        enabled: row.enabled,
        defaultDays: row.defaultDays,
        defaultPackage: row.defaultPackage,
        updatedAt: row.updatedAt.toISOString(),
      },
    };
  }

  /** Adds or removes days from every active/upcoming trial; conflicting or impossible rows are skipped. */
  async adjustActive(
    admin: PlatformAdminPrincipal,
    days: number,
  ): Promise<ActiveTrialAdjustmentView> {
    const today = todayInCairo();
    const trials = await this.prisma.subscription.findMany({
      where: {
        kind: 'TRIAL',
        status: 'ACTIVE',
        endsAt: { gt: today },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        restaurant: { select: { id: true, name: true } },
      },
      orderBy: { endsAt: 'asc' },
    });

    let adjusted = 0;
    let skipped = 0;
    for (const trial of trials) {
      const nextEnd = addDays(trial.endsAt, days);
      if (nextEnd <= trial.startsAt) {
        skipped += 1;
        continue;
      }
      const clash = await this.prisma.subscription.findFirst({
        where: {
          restaurantId: trial.restaurant.id,
          id: { not: trial.id },
          status: 'ACTIVE',
          startsAt: { lt: nextEnd },
          endsAt: { gt: trial.startsAt },
        },
        select: { id: true },
      });
      if (clash) {
        skipped += 1;
        continue;
      }
      try {
        const changed = await this.prisma.subscription.updateMany({
          where: { id: trial.id, endsAt: trial.endsAt, status: 'ACTIVE' },
          data: { endsAt: nextEnd },
        });
        if (changed.count !== 1) {
          skipped += 1;
          continue;
        }
      } catch {
        skipped += 1;
        continue;
      }
      adjusted += 1;
      await this.audit.record({
        admin,
        action: 'trial.updated',
        restaurant: trial.restaurant,
        details: {
          subscriptionId: trial.id,
          from: formatDateOnly(trial.endsAt),
          to: formatDateOnly(nextEnd),
          source: 'bulk',
        },
      });
      await this.sync.syncRestaurant(trial.restaurant.id);
    }
    await this.audit.record({
      admin,
      action: 'platform.active_trials_adjusted',
      details: { days, adjusted, skipped },
    });
    return { adjusted, skipped };
  }
}
