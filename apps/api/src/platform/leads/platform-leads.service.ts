import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { PlatformAdminPrincipal } from '../platform-auth.service';

export type LeadFilter = 'open' | 'all';
export type LeadStatusKey = 'NEW' | 'CONTACTED' | 'DONE' | 'DISMISSED';

export interface SignupLeadView {
  id: string;
  kind: 'SUBSCRIBE' | 'TRIAL';
  packageName: string | null;
  name: string;
  email: string;
  phone: string;
  restaurantName: string | null;
  message: string | null;
  locale: string;
  status: LeadStatusKey;
  note: string | null;
  handledByEmail: string | null;
  handledAt: string | null;
  createdAt: string;
}

export type LeadOutcome =
  { outcome: 'ok'; data: SignupLeadView } | { outcome: 'NOT_FOUND' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 200;

const select = {
  id: true,
  kind: true,
  packageName: true,
  name: true,
  email: true,
  phone: true,
  restaurantName: true,
  message: true,
  locale: true,
  status: true,
  note: true,
  handledByEmail: true,
  handledAt: true,
  createdAt: true,
} satisfies Prisma.SignupLeadSelect;

type Row = Prisma.SignupLeadGetPayload<{ select: typeof select }>;

const toView = (row: Row): SignupLeadView => ({
  ...row,
  handledAt: row.handledAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

/** The platform team's inbox of subscription and trial requests from the landing page (DEC-053). */
@Injectable()
export class PlatformLeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: LeadFilter): Promise<SignupLeadView[]> {
    const rows = await this.prisma.signupLead.findMany({
      where: filter === 'open' ? { status: { in: ['NEW', 'CONTACTED'] } } : {},
      select,
      // the one that has waited longest first; history newest first
      orderBy: { createdAt: filter === 'open' ? 'asc' : 'desc' },
      take: LIMIT,
    });
    return rows.map(toView);
  }

  async update(
    admin: PlatformAdminPrincipal,
    leadId: string,
    input: { status: LeadStatusKey; note: string | null | undefined },
  ): Promise<LeadOutcome> {
    if (!UUID.test(leadId)) return { outcome: 'NOT_FOUND' };
    const before = await this.prisma.signupLead.findUnique({
      where: { id: leadId },
      select: { note: true },
    });
    if (!before) return { outcome: 'NOT_FOUND' };
    const row = await this.prisma.signupLead.update({
      where: { id: leadId },
      data: {
        status: input.status,
        note: input.note === undefined ? before.note : input.note,
        handledByEmail: admin.email,
        handledAt: new Date(),
      },
      select,
    });
    return { outcome: 'ok', data: toView(row) };
  }

  openCount(): Promise<number> {
    return this.prisma.signupLead.count({
      where: { status: { in: ['NEW', 'CONTACTED'] } },
    });
  }
}
