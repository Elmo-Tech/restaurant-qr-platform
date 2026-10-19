import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import type { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { PlatformAuditService } from '../platform/platform-audit.service';
import type { PlatformAdminPrincipal } from '../platform/platform-auth.service';
import { PlatformRequestsService } from '../platform/requests/platform-requests.service';
import { MySubscriptionService } from './my-subscription.service';

const RESTAURANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const PRO = '33333333-3333-4333-8333-333333333333';
const CURRENT = '44444444-4444-4444-8444-444444444444';

const config = { get: () => 7 } as unknown as ConfigService<EnvConfig, true>;

interface Fakes {
  restaurant: unknown;
  user: unknown;
  pkg: unknown;
  open: unknown;
  createError?: Error;
}

function setup(over: Partial<Fakes> = {}) {
  const fakes: Fakes = {
    restaurant: { id: RESTAURANT, name: 'Cafe', packageId: CURRENT },
    user: { id: USER, email: 'owner@cafe.test' },
    pkg: { id: PRO, name: 'PRO', status: 'ACTIVE' },
    open: null,
    ...over,
  };
  const created: unknown[] = [];
  const prisma = {
    restaurant: {
      findUnique: jest.fn(() => Promise.resolve(fakes.restaurant)),
    },
    user: { findUnique: jest.fn(() => Promise.resolve(fakes.user)) },
    package: { findUnique: jest.fn(() => Promise.resolve(fakes.pkg)) },
    subscriptionRequest: {
      findFirst: jest.fn(() => Promise.resolve(fakes.open)),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        if (fakes.createError) return Promise.reject(fakes.createError);
        created.push(args.data);
        return Promise.resolve({
          id: 'req-1',
          kind: args.data.kind,
          packageName: args.data.packageName,
          message: args.data.message,
          status: 'NEW',
          createdAt: new Date('2026-10-19T10:00:00Z'),
        });
      }),
    },
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const service = new MySubscriptionService(
    prisma as unknown as PrismaService,
    audit as unknown as PlatformAuditService,
    config,
  );
  return { service, prisma, audit, created };
}

describe('MySubscriptionService.createRequest (DEC-050)', () => {
  it('records an upgrade request with the requester and package snapshot, and audits it', async () => {
    const { service, audit, created } = setup();
    const result = await service.createRequest(RESTAURANT, USER, {
      kind: 'UPGRADE',
      packageId: PRO,
      message: 'Call me after 5',
    });
    expect(result.outcome).toBe('ok');
    expect(created[0]).toMatchObject({
      restaurantId: RESTAURANT,
      kind: 'UPGRADE',
      packageId: PRO,
      packageName: 'PRO',
      requestedByUserId: USER,
      requestedByEmail: 'owner@cafe.test',
      message: 'Call me after 5',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: null,
        actorEmail: 'owner@cafe.test',
        action: 'subscription_request.created',
      }),
    );
  });

  it('accepts a renewal without a package', async () => {
    const { service, created } = setup();
    const result = await service.createRequest(RESTAURANT, USER, {
      kind: 'RENEWAL',
      packageId: null,
      message: null,
    });
    expect(result.outcome).toBe('ok');
    expect(created[0]).toMatchObject({
      kind: 'RENEWAL',
      packageId: null,
      packageName: null,
    });
  });

  it('refuses an upgrade without a package', async () => {
    const { service, created } = setup();
    const result = await service.createRequest(RESTAURANT, USER, {
      kind: 'UPGRADE',
      packageId: null,
      message: null,
    });
    expect(result.outcome).toBe('PACKAGE_REQUIRED');
    expect(created).toHaveLength(0);
  });

  it('refuses a package that is archived, missing, or the one the restaurant is already on', async () => {
    const archived = setup({
      pkg: { id: PRO, name: 'PRO', status: 'ARCHIVED' },
    });
    expect(
      (
        await archived.service.createRequest(RESTAURANT, USER, {
          kind: 'UPGRADE',
          packageId: PRO,
          message: null,
        })
      ).outcome,
    ).toBe('PACKAGE_NOT_AVAILABLE');

    const missing = setup({ pkg: null });
    expect(
      (
        await missing.service.createRequest(RESTAURANT, USER, {
          kind: 'UPGRADE',
          packageId: PRO,
          message: null,
        })
      ).outcome,
    ).toBe('PACKAGE_NOT_AVAILABLE');

    const same = setup({
      pkg: { id: CURRENT, name: 'BASIC', status: 'ACTIVE' },
    });
    expect(
      (
        await same.service.createRequest(RESTAURANT, USER, {
          kind: 'UPGRADE',
          packageId: CURRENT,
          message: null,
        })
      ).outcome,
    ).toBe('PACKAGE_NOT_AVAILABLE');

    const garbage = setup();
    expect(
      (
        await garbage.service.createRequest(RESTAURANT, USER, {
          kind: 'UPGRADE',
          packageId: 'not-a-uuid',
          message: null,
        })
      ).outcome,
    ).toBe('PACKAGE_NOT_AVAILABLE');
  });

  it('allows only one open request: the second is refused and the open one is returned', async () => {
    const open = {
      id: 'req-0',
      kind: 'RENEWAL',
      packageName: null,
      message: null,
      status: 'NEW',
      createdAt: new Date('2026-10-18T10:00:00Z'),
    };
    const { service, created } = setup({ open });
    const result = await service.createRequest(RESTAURANT, USER, {
      kind: 'RENEWAL',
      packageId: null,
      message: null,
    });
    expect(result.outcome).toBe('REQUEST_ALREADY_OPEN');
    expect(
      result.outcome === 'REQUEST_ALREADY_OPEN' && result.existing?.id,
    ).toBe('req-0');
    expect(created).toHaveLength(0);
  });

  it('treats a simultaneous second request (unique index) as already open', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const { service } = setup({ createError: duplicate });
    const result = await service.createRequest(RESTAURANT, USER, {
      kind: 'RENEWAL',
      packageId: null,
      message: null,
    });
    expect(result.outcome).toBe('REQUEST_ALREADY_OPEN');
  });

  it('knows nothing about a restaurant that does not exist', async () => {
    const { service } = setup({ restaurant: null });
    expect(
      (
        await service.createRequest(RESTAURANT, USER, {
          kind: 'RENEWAL',
          packageId: null,
          message: null,
        })
      ).outcome,
    ).toBe('RESTAURANT_NOT_FOUND');
  });
});

describe('PlatformRequestsService.update (DEC-050)', () => {
  const admin = {
    adminId: 'adm-1',
    email: 'admin@wayta.test',
  } as PlatformAdminPrincipal;
  const row = (status: string, note: string | null) => ({
    id: 'req-1',
    kind: 'UPGRADE',
    packageName: 'PRO',
    message: null,
    status,
    note,
    requestedByEmail: 'owner@cafe.test',
    handledByEmail: 'admin@wayta.test',
    handledAt: new Date('2026-10-19T12:00:00Z'),
    createdAt: new Date('2026-10-19T10:00:00Z'),
    restaurant: {
      id: RESTAURANT,
      name: 'Cafe',
      status: 'ACTIVE',
      package: { name: 'BASIC' },
    },
  });

  function build(before: { status: string; note: string | null } | null) {
    const update = jest.fn(
      (args: { data: { status: string; note: string | null } }) =>
        Promise.resolve(row(args.data.status, args.data.note)),
    );
    const prisma = {
      subscriptionRequest: {
        findUnique: jest.fn(() =>
          Promise.resolve(
            before && {
              id: 'req-1',
              ...before,
              restaurant: { id: RESTAURANT, name: 'Cafe' },
            },
          ),
        ),
        update,
      },
    };
    const audit = { record: jest.fn(() => Promise.resolve()) };
    return {
      service: new PlatformRequestsService(
        prisma as unknown as PrismaService,
        audit as unknown as PlatformAuditService,
      ),
      update,
      audit,
    };
  }

  it('records who handled it, keeps the note when none is sent, and audits a status change', async () => {
    const { service, update, audit } = build({
      status: 'NEW',
      note: 'first call',
    });
    const result = await service.update(
      admin,
      '55555555-5555-4555-8555-555555555555',
      { status: 'CONTACTED', note: undefined },
    );
    expect(result.outcome).toBe('ok');
    expect(update.mock.calls[0][0].data).toMatchObject({
      status: 'CONTACTED',
      note: 'first call',
      handledByEmail: 'admin@wayta.test',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription_request.status_changed',
        details: {
          requestId: expect.any(String) as string,
          from: 'NEW',
          to: 'CONTACTED',
        },
      }),
    );
  });

  it('clears the note when an empty one is sent and does not audit when only the note changed', async () => {
    const { service, update, audit } = build({
      status: 'CONTACTED',
      note: 'old',
    });
    await service.update(admin, '55555555-5555-4555-8555-555555555555', {
      status: 'CONTACTED',
      note: null,
    });
    expect(update.mock.calls[0][0].data.note).toBeNull();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('says not found for an unknown or malformed id', async () => {
    const { service } = build(null);
    expect(
      (
        await service.update(admin, '55555555-5555-4555-8555-555555555555', {
          status: 'DONE',
          note: undefined,
        })
      ).outcome,
    ).toBe('NOT_FOUND');
    expect(
      (await service.update(admin, 'nope', { status: 'DONE', note: undefined }))
        .outcome,
    ).toBe('NOT_FOUND');
  });
});
