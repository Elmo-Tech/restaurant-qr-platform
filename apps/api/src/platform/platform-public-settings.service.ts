import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PlatformAuditService } from './platform-audit.service';
import type { PlatformAdminPrincipal } from './platform-auth.service';
import {
  DEFAULT_POWERED_BY_URL,
  PLATFORM_PUBLIC_SETTINGS_ID,
} from './platform-public-settings.constants';

export interface PlatformPublicSettingsView {
  poweredByUrl: string;
  updatedAt: string | null;
}

function normalizeHttpsUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:') throw new Error('poweredByUrl must use HTTPS');
  return url.toString();
}

/** The small, explicit set of public Wayta branding values controlled by Platform Administrators. */
@Injectable()
export class PlatformPublicSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async get(): Promise<PlatformPublicSettingsView> {
    const row = await this.prisma.platformPublicSettings.findUnique({
      where: { id: PLATFORM_PUBLIC_SETTINGS_ID },
      select: { poweredByUrl: true, updatedAt: true },
    });
    return {
      poweredByUrl: row?.poweredByUrl ?? DEFAULT_POWERED_BY_URL,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async update(
    admin: PlatformAdminPrincipal,
    poweredByUrl: string,
  ): Promise<PlatformPublicSettingsView> {
    const nextUrl = normalizeHttpsUrl(poweredByUrl);
    const before = await this.get();
    if (before.poweredByUrl === nextUrl) return before;

    const row = await this.prisma.platformPublicSettings.upsert({
      where: { id: PLATFORM_PUBLIC_SETTINGS_ID },
      create: { id: PLATFORM_PUBLIC_SETTINGS_ID, poweredByUrl: nextUrl },
      update: { poweredByUrl: nextUrl },
      select: { poweredByUrl: true, updatedAt: true },
    });
    await this.audit.record({
      admin,
      action: 'platform.public_settings_updated',
      details: {
        field: 'poweredByUrl',
        from: before.poweredByUrl,
        to: row.poweredByUrl,
      },
    });
    return {
      poweredByUrl: row.poweredByUrl,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
