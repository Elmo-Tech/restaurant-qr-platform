import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { PlatformAdminPrincipal } from './platform-auth.service';

/** What the platform team can do; the audit log stores these as text. */
export type PlatformAction =
  | 'admin.login'
  | 'admin.created'
  | 'admin.status_changed'
  | 'admin.password_reset'
  | 'admin.password_changed'
  | 'restaurant.created'
  | 'restaurant.status_changed'
  | 'restaurant.feature_changed'
  | 'restaurant.package_changed'
  | 'package.created'
  | 'package.updated'
  | 'package.deleted'
  | 'platform.public_settings_updated'
  | 'platform.trial_settings_updated'
  | 'platform.active_trials_adjusted'
  | 'restaurant.country_changed'
  | 'subscription.created'
  | 'trial.created'
  | 'trial.updated'
  | 'subscription.cancelled'
  | 'payment.recorded'
  | 'payment.voided'
  | 'restaurant.auto_suspended'
  | 'restaurant.auto_reactivated'
  | 'subscription_request.created'
  | 'subscription_request.status_changed';

/** The audit actor of work the platform does by itself (the hourly subscription check). */
export const SYSTEM_ACTOR = null;

export interface AuditEntryView {
  id: string;
  action: string;
  adminEmail: string;
  restaurantId: string | null;
  restaurantName: string | null;
  details: unknown;
  createdAt: string;
}

/** The platform team's own history: who did what to which Restaurant, and when. */
@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    /** The administrator who acted, or `SYSTEM_ACTOR` (null) for the platform itself. */
    admin: Pick<PlatformAdminPrincipal, 'adminId' | 'email'> | null;
    /** Who acted when it was not an administrator (a restaurant User's e-mail); default `system`. */
    actorEmail?: string;
    action: PlatformAction;
    restaurant?: { id: string; name: string } | null;
    details?: Prisma.InputJsonObject;
  }): Promise<void> {
    await this.prisma.platformAuditLog.create({
      data: {
        adminId: input.admin?.adminId ?? null,
        adminEmail: input.admin?.email ?? input.actorEmail ?? 'system',
        action: input.action,
        restaurantId: input.restaurant?.id ?? null,
        restaurantName: input.restaurant?.name ?? null,
        details: input.details ?? {},
      },
    });
  }

  async recent(input: {
    restaurantId?: string;
    limit: number;
  }): Promise<AuditEntryView[]> {
    const rows = await this.prisma.platformAuditLog.findMany({
      where: input.restaurantId ? { restaurantId: input.restaurantId } : {},
      orderBy: { createdAt: 'desc' },
      take: input.limit,
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      adminEmail: row.adminEmail,
      restaurantId: row.restaurantId,
      restaurantName: row.restaurantName,
      details: row.details,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
