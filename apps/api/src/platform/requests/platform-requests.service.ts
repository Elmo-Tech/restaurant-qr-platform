import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { PlatformAuditService } from '../platform-audit.service';
import type { PlatformAdminPrincipal } from '../platform-auth.service';

export type RequestFilter = 'open' | 'all';
export type RequestStatusKey = 'NEW' | 'CONTACTED' | 'DONE' | 'DISMISSED';

export interface SubscriptionRequestView {
  id: string;
  kind: 'UPGRADE' | 'RENEWAL';
  packageName: string | null;
  message: string | null;
  status: RequestStatusKey;
  note: string | null;
  requestedByEmail: string;
  handledByEmail: string | null;
  handledAt: string | null;
  createdAt: string;
  restaurant: {
    id: string;
    name: string;
    status: string;
    packageName: string | null;
  };
}

export type RequestOutcome =
  { outcome: 'ok'; data: SubscriptionRequestView } | { outcome: 'NOT_FOUND' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 200;

const select = {
  id: true,
  kind: true,
  packageName: true,
  message: true,
  status: true,
  note: true,
  requestedByEmail: true,
  handledByEmail: true,
  handledAt: true,
  createdAt: true,
  restaurant: {
    select: {
      id: true,
      name: true,
      status: true,
      package: { select: { name: true } },
    },
  },
} satisfies Prisma.SubscriptionRequestSelect;

type Row = Prisma.SubscriptionRequestGetPayload<{ select: typeof select }>;

const toView = (row: Row): SubscriptionRequestView => ({
  id: row.id,
  kind: row.kind,
  packageName: row.packageName,
  message: row.message,
  status: row.status,
  note: row.note,
  requestedByEmail: row.requestedByEmail,
  handledByEmail: row.handledByEmail,
  handledAt: row.handledAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  restaurant: {
    id: row.restaurant.id,
    name: row.restaurant.name,
    status: row.restaurant.status,
    packageName: row.restaurant.package?.name ?? null,
  },
});

/** The platform team's inbox of upgrade and renewal requests (DEC-050). */
@Injectable()
export class PlatformRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async list(filter: RequestFilter): Promise<SubscriptionRequestView[]> {
    const rows = await this.prisma.subscriptionRequest.findMany({
      where: filter === 'open' ? { status: { in: ['NEW', 'CONTACTED'] } } : {},
      select,
      // the oldest open request first (it has waited longest); history newest first
      orderBy: { createdAt: filter === 'open' ? 'asc' : 'desc' },
      take: LIMIT,
    });
    return rows.map(toView);
  }

  async update(
    admin: PlatformAdminPrincipal,
    requestId: string,
    input: { status: RequestStatusKey; note: string | null | undefined },
  ): Promise<RequestOutcome> {
    if (!UUID.test(requestId)) return { outcome: 'NOT_FOUND' };
    const before = await this.prisma.subscriptionRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        status: true,
        note: true,
        restaurant: { select: { id: true, name: true } },
      },
    });
    if (!before) return { outcome: 'NOT_FOUND' };

    const note = input.note === undefined ? before.note : input.note;
    const row = await this.prisma.subscriptionRequest.update({
      where: { id: requestId },
      data: {
        status: input.status,
        note,
        handledByEmail: admin.email,
        handledAt: new Date(),
      },
      select,
    });
    if (before.status !== input.status) {
      await this.audit.record({
        admin,
        action: 'subscription_request.status_changed',
        restaurant: before.restaurant,
        details: { requestId, from: before.status, to: input.status },
      });
    }
    return { outcome: 'ok', data: toView(row) };
  }

  openCount(): Promise<number> {
    return this.prisma.subscriptionRequest.count({
      where: { status: { in: ['NEW', 'CONTACTED'] } },
    });
  }
}
