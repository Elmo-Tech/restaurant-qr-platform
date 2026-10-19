import { Injectable } from '@nestjs/common';
import {
  DUMMY_PASSWORD_HASH,
  normalizeLoginEmail,
} from '../auth/login/login.service';
import { PasswordHasherService } from '../auth/password/password-hasher.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma, type PlatformAdminStatus } from '../generated/prisma/client';
import { PlatformAuditService } from './platform-audit.service';
import type { PlatformAdminPrincipal } from './platform-auth.service';

export interface AdminView {
  id: string;
  email: string;
  displayName: string;
  status: PlatformAdminStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

export type AdminRefusal =
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'INVALID_PASSWORD'
  | 'WRONG_PASSWORD'
  | 'CANNOT_DISABLE_SELF'
  | 'LAST_ADMIN';

export type AdminOutcome<T> =
  { outcome: 'ok'; data: T } | { outcome: AdminRefusal };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const adminSelect = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.PlatformAdminSelect;

const toView = (
  row: Prisma.PlatformAdminGetPayload<{ select: typeof adminSelect }>,
): AdminView => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  status: row.status,
  lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
});

/**
 * Managing the platform team (DEC-048): create administrators, disable or re-enable them, reset a
 * colleague's password and change one's own. All administrators are equal (no roles). Passwords are
 * only ever passed to the Argon2id hasher; nothing here returns or logs one. Ending access (disable,
 * password reset or change) revokes the affected sessions so it takes effect at once.
 */
@Injectable()
export class PlatformAdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasherService,
    private readonly audit: PlatformAuditService,
  ) {}

  async list(): Promise<AdminView[]> {
    const rows = await this.prisma.platformAdmin.findMany({
      select: adminSelect,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toView);
  }

  async create(
    actor: PlatformAdminPrincipal,
    input: { email: string; displayName: string; password: string },
  ): Promise<AdminOutcome<AdminView>> {
    const hash = await this.hashOrNull(input.password);
    if (hash === null) return { outcome: 'INVALID_PASSWORD' };
    const email = input.email.trim();
    try {
      const row = await this.prisma.platformAdmin.create({
        data: {
          email,
          emailNormalized: normalizeLoginEmail(email),
          passwordHash: hash,
          displayName: input.displayName.trim(),
          status: 'ACTIVE',
        },
        select: adminSelect,
      });
      await this.audit.record({
        admin: actor,
        action: 'admin.created',
        details: { adminId: row.id, email: row.email },
      });
      return { outcome: 'ok', data: toView(row) };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { outcome: 'EMAIL_TAKEN' };
      }
      throw error;
    }
  }

  /** Disable (ends every session of that administrator) or re-enable. */
  async setStatus(
    actor: PlatformAdminPrincipal,
    adminId: string,
    status: PlatformAdminStatus,
  ): Promise<AdminOutcome<AdminView>> {
    if (!UUID.test(adminId)) return { outcome: 'NOT_FOUND' };
    if (status === 'DISABLED' && adminId === actor.adminId) {
      return { outcome: 'CANNOT_DISABLE_SELF' };
    }
    // Serializable: two administrators disabling each other at once cannot leave nobody active.
    const result = await this.prisma.$transaction(
      async (tx): Promise<AdminOutcome<AdminView & { changed: boolean }>> => {
        const current = await tx.platformAdmin.findUnique({
          where: { id: adminId },
          select: adminSelect,
        });
        if (!current) return { outcome: 'NOT_FOUND' };
        if (current.status === status) {
          return {
            outcome: 'ok',
            data: { ...toView(current), changed: false },
          };
        }
        if (status === 'DISABLED') {
          const active = await tx.platformAdmin.count({
            where: { status: 'ACTIVE' },
          });
          if (active <= 1) return { outcome: 'LAST_ADMIN' };
        }
        const row = await tx.platformAdmin.update({
          where: { id: adminId },
          data: { status },
          select: adminSelect,
        });
        if (status === 'DISABLED') {
          await tx.platformSession.updateMany({
            where: { adminId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        return { outcome: 'ok', data: { ...toView(row), changed: true } };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (result.outcome !== 'ok') return result;
    const { changed, ...view } = result.data;
    if (changed) {
      await this.audit.record({
        admin: actor,
        action: 'admin.status_changed',
        details: { adminId, email: view.email, to: status },
      });
    }
    return { outcome: 'ok', data: view };
  }

  /** A colleague sets another administrator's password; that administrator is signed out everywhere. */
  async resetPassword(
    actor: PlatformAdminPrincipal,
    adminId: string,
    newPassword: string,
  ): Promise<AdminOutcome<null>> {
    if (!UUID.test(adminId)) return { outcome: 'NOT_FOUND' };
    const target = await this.prisma.platformAdmin.findUnique({
      where: { id: adminId },
      select: { id: true, email: true },
    });
    if (!target) return { outcome: 'NOT_FOUND' };
    const hash = await this.hashOrNull(newPassword);
    if (hash === null) return { outcome: 'INVALID_PASSWORD' };
    await this.prisma.$transaction([
      this.prisma.platformAdmin.update({
        where: { id: adminId },
        data: { passwordHash: hash },
      }),
      this.prisma.platformSession.updateMany({
        where: { adminId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      admin: actor,
      action: 'admin.password_reset',
      details: { adminId, email: target.email },
    });
    return { outcome: 'ok', data: null };
  }

  /** Changing one's own password needs the current one; other sessions of the account end, this one stays. */
  async changeOwnPassword(
    actor: PlatformAdminPrincipal,
    currentPassword: string,
    newPassword: string,
  ): Promise<AdminOutcome<null>> {
    const row = await this.prisma.platformAdmin.findUnique({
      where: { id: actor.adminId },
      select: { passwordHash: true },
    });
    // verify even when the account vanished, so the work done is the same
    const matches = await this.hasher.verifyPassword(
      currentPassword,
      row?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!row || !matches) return { outcome: 'WRONG_PASSWORD' };
    const hash = await this.hashOrNull(newPassword);
    if (hash === null) return { outcome: 'INVALID_PASSWORD' };
    await this.prisma.$transaction([
      this.prisma.platformAdmin.update({
        where: { id: actor.adminId },
        data: { passwordHash: hash },
      }),
      this.prisma.platformSession.updateMany({
        where: {
          adminId: actor.adminId,
          revokedAt: null,
          id: { not: actor.sessionId },
        },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      admin: actor,
      action: 'admin.password_changed',
      details: { adminId: actor.adminId },
    });
    return { outcome: 'ok', data: null };
  }

  /** The Argon2id hash, or null when the password breaks the policy (the error never carries it). */
  private async hashOrNull(password: string): Promise<string | null> {
    try {
      return await this.hasher.hashPassword(password);
    } catch {
      return null;
    }
  }
}
