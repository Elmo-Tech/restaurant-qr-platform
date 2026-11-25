import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { OnboardingMenuImportService } from '../src/platform/onboarding/onboarding-menu-import.service';
import { OnboardingCasesService } from '../src/platform/onboarding/onboarding-cases.service';
import { PlatformAuditService } from '../src/platform/platform-audit.service';
import type { PlatformAdminPrincipal } from '../src/platform/platform-auth.service';
import { MenuImportExtractor } from '../src/menu-import/menu-import-extractor';

const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const pdf = Buffer.from('%PDF-test');
const files = [
  {
    buffer: pdf,
    originalname: 'menu.pdf',
    mimetype: 'application/pdf',
    size: pdf.length,
  },
];
const code = (error: unknown) =>
  error instanceof HttpException
    ? (error.getResponse() as { error: { code: string } }).error.code
    : undefined;

// Independent clients exercise PostgreSQL locks, not a shared in-memory service lock.
describeSandbox('onboarding import grants (PostgreSQL)', () => {
  let db: PrismaService;
  let other: PrismaService;
  let admin: PlatformAdminPrincipal;
  let packageId: string;
  const ids: string[] = [];
  const limits = {
    ONBOARDING_IMPORT_OPERATOR_DAILY_LIMIT: 10,
    ONBOARDING_IMPORT_GLOBAL_DAILY_LIMIT: 30,
    ONBOARDING_IMPORT_OPERATOR_CONCURRENCY: 1,
    ONBOARDING_IMPORT_GLOBAL_CONCURRENCY: 3,
  };
  const cases = {
    get: jest.fn(() => Promise.resolve({ outcome: 'ok', data: null })),
  } as unknown as OnboardingCasesService;
  const extractor = { extract: jest.fn() };
  const service = (
    client: PrismaService,
    overrides: Partial<typeof limits> = {},
  ) =>
    new OnboardingMenuImportService(
      client,
      cases,
      extractor as unknown as MenuImportExtractor,
      new PlatformAuditService(client),
      new ConfigService({ ...limits, ...overrides }),
    );

  beforeAll(async () => {
    db = new PrismaService(new ConfigService({ DATABASE_URL: SANDBOX_URL }));
    other = new PrismaService(new ConfigService({ DATABASE_URL: SANDBOX_URL }));
    await assertSandboxIdentity(db);
    await assertSandboxIdentity(other);
    const email = `${randomUUID()}@example.test`;
    const actor = await db.platformAdmin.create({
      data: {
        email,
        emailNormalized: email,
        displayName: 'Integration',
        passwordHash: 'unused',
        status: 'ACTIVE',
      },
    });
    admin = {
      adminId: actor.id,
      email,
      displayName: actor.displayName,
      sessionId: randomUUID(),
    };
    const name = randomUUID();
    packageId = (
      await db.package.create({
        data: {
          name,
          nameNormalized: name,
          nameEn: name,
          nameEnNormalized: name,
        },
      })
    ).id;
  });
  afterEach(async () => {
    if (admin)
      await db.$executeRaw`DELETE FROM onboarding_import_usage WHERE operator_id = ${admin.adminId}::uuid`;
    extractor.extract.mockReset();
  });
  afterAll(async () => {
    try {
      if (admin) {
        await db.platformAuditLog.deleteMany({
          where: { adminId: admin.adminId },
        });
        await db.onboardingCase.deleteMany({ where: { id: { in: ids } } });
        await db.package.delete({ where: { id: packageId } });
        await db.platformAdmin.delete({ where: { id: admin.adminId } });
      }
    } finally {
      await db?.$disconnect();
      await other?.$disconnect();
    }
  });
  async function fixture(attempts = 0) {
    const row = await db.onboardingCase.create({
      data: {
        mode: 'REAL',
        packageId,
        modeConfig: { packageId },
        details: { restaurant: { name: 'Test', defaultLocale: 'en' } },
        importGrantId: randomUUID(),
        importGrantExpiresAt: new Date(Date.now() + 3_600_000),
        importAttempts: attempts,
      },
    });
    ids.push(row.id);
    const [clock] = await db.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    expect(row.importGrantExpiresAt!.getTime()).toBeGreaterThan(
      clock.now.getTime(),
    );
    return row;
  }
  async function usage() {
    return db.$queryRaw<
      { finished_at: Date | null }[]
    >`SELECT finished_at FROM onboarding_import_usage WHERE operator_id = ${admin.adminId}::uuid`;
  }

  it('atomically enforces cross-instance concurrency without consuming the rejected attempt', async () => {
    const first = await fixture();
    const second = await fixture();
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish!: (value: unknown) => void;
    extractor.extract.mockImplementation(() => {
      started();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const pending = service(db)
      .stage(admin, first.id, first.revision, files)
      .catch((error: unknown) => error);
    await entered;
    try {
      const rejected = await service(other)
        .stage(admin, second.id, second.revision, files)
        .catch((error: unknown) => error);
      expect(code(rejected)).toBe('ONBOARDING_IMPORT_LIMIT');
      expect(
        (
          await db.onboardingCase.findUniqueOrThrow({
            where: { id: second.id },
          })
        ).importAttempts,
      ).toBe(0);
      expect(await usage()).toHaveLength(1);
    } finally {
      finish({});
      await pending;
    }
    expect((await usage())[0].finished_at).not.toBeNull();
  });

  it.each([
    ['operator daily', { ONBOARDING_IMPORT_OPERATOR_DAILY_LIMIT: 1 }, true],
    ['global daily', { ONBOARDING_IMPORT_GLOBAL_DAILY_LIMIT: 1 }, false],
    [
      'operator concurrency',
      { ONBOARDING_IMPORT_OPERATOR_CONCURRENCY: 1 },
      true,
    ],
    ['global concurrency', { ONBOARDING_IMPORT_GLOBAL_CONCURRENCY: 1 }, false],
  ])(
    'enforces %s ceiling across clients',
    async (_name, override, sameOperator) => {
      const row = await fixture();
      const operator = sameOperator ? admin.adminId : randomUUID();
      const id = randomUUID();
      const concurrency =
        'ONBOARDING_IMPORT_OPERATOR_CONCURRENCY' in override ||
        'ONBOARDING_IMPORT_GLOBAL_CONCURRENCY' in override;
      await db.$executeRaw`INSERT INTO onboarding_import_usage (id, operator_id, started_at, lease_until, finished_at) VALUES (${id}::uuid, ${operator}::uuid, now(), now(), ${concurrency ? null : new Date()})`;
      try {
        const result = await service(other, override)
          .stage(admin, row.id, row.revision, files)
          .catch((error: unknown) => error);
        expect(code(result)).toBe('ONBOARDING_IMPORT_LIMIT');
        expect(
          (await db.onboardingCase.findUniqueOrThrow({ where: { id: row.id } }))
            .importAttempts,
        ).toBe(0);
      } finally {
        await db.$executeRaw`DELETE FROM onboarding_import_usage WHERE id = ${id}::uuid`;
      }
    },
  );

  it('keeps ambiguous provider failures occupied after the lease expires', async () => {
    const row = await fixture();
    extractor.extract.mockRejectedValue(new Error('timeout'));
    const result = await service(db)
      .stage(admin, row.id, row.revision, files)
      .catch((error: unknown) => error);
    expect(code(result)).toBe('ONBOARDING_IMPORT_FAILED');
    expect((await usage())[0].finished_at).toBeNull();
    await db.$executeRaw`UPDATE onboarding_import_usage SET started_at = now() - interval '8 days', lease_until = now() - interval '7 days' WHERE operator_id = ${admin.adminId}::uuid`;
    expect((await usage())[0].finished_at).toBeNull();
    const retry = await fixture();
    const blocked = await service(other)
      .stage(admin, retry.id, retry.revision, files)
      .catch((error: unknown) => error);
    expect(code(blocked)).toBe('ONBOARDING_IMPORT_LIMIT');
  });

  it('rejects a fourth case attempt even after regrant', async () => {
    const row = await fixture(3);
    expect(
      (
        await service(other).setGrant(
          admin,
          row.id,
          row.revision,
          'regrant',
          undefined,
          false,
        )
      ).outcome,
    ).toBe('ok');
    const updated = await db.onboardingCase.findUniqueOrThrow({
      where: { id: row.id },
    });
    const result = await service(db)
      .stage(admin, row.id, updated.revision, files)
      .catch((error: unknown) => error);
    expect(code(result)).toBe('ONBOARDING_IMPORT_QUOTA');
    expect(await usage()).toHaveLength(0);
  });

  it('rejects extraction after revocation', async () => {
    const row = await fixture();
    expect(
      (
        await service(other).setGrant(
          admin,
          row.id,
          row.revision,
          'revoke',
          undefined,
          true,
        )
      ).outcome,
    ).toBe('ok');
    const updated = await db.onboardingCase.findUniqueOrThrow({
      where: { id: row.id },
    });
    const result = await service(db)
      .stage(admin, row.id, updated.revision, files)
      .catch((error: unknown) => error);
    expect(code(result)).toBe('ONBOARDING_IMPORT_GRANT_REQUIRED');
    expect(await usage()).toHaveLength(0);
  });

  it.each(['revocation', 'expiry'] as const)(
    'rejects a result after grant %s during extraction',
    async (change) => {
      const row = await fixture();
      let started!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      let finish!: (value: unknown) => void;
      extractor.extract.mockImplementation(() => {
        started();
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
      const pending = service(db)
        .stage(admin, row.id, row.revision, files)
        .catch((error: unknown) => error);
      await entered;
      try {
        if (change === 'revocation') {
          expect(
            (
              await service(other).setGrant(
                admin,
                row.id,
                row.revision,
                'revoke',
                undefined,
                true,
              )
            ).outcome,
          ).toBe('ok');
        } else {
          await other.$executeRaw`UPDATE onboarding_cases SET import_grant_expires_at = now() - interval '1 second' WHERE id = ${row.id}::uuid`;
        }
      } finally {
        finish({
          schemaVersion: 1,
          status: 'EXTRACTED',
          categories: [
            {
              translations: { en: { name: 'Drinks' } },
              products: [
                { translations: { en: { name: 'Tea' } }, price: '5.00' },
              ],
            },
          ],
        });
      }
      expect(code(await pending)).toBe('ONBOARDING_IMPORT_GRANT_REQUIRED');
      expect(
        (await db.onboardingCase.findUniqueOrThrow({ where: { id: row.id } }))
          .menuDraft,
      ).toBeNull();
      expect((await usage())[0].finished_at).not.toBeNull();
    },
  );

  it('regrant during extraction invalidates the in-flight generation and preserves attempts', async () => {
    const row = await fixture(1);
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish!: (value: unknown) => void;
    extractor.extract.mockImplementation(() => {
      started();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const pending = service(db)
      .stage(admin, row.id, row.revision, files)
      .catch((error: unknown) => error);
    await entered;
    try {
      expect(
        (
          await service(other).setGrant(
            admin,
            row.id,
            row.revision,
            'regrant',
            undefined,
            false,
          )
        ).outcome,
      ).toBe('ok');
      const updated = await db.onboardingCase.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(updated.importGrantId).not.toBe(row.importGrantId);
      expect(updated.importAttempts).toBe(2);
    } finally {
      finish({
        schemaVersion: 1,
        status: 'EXTRACTED',
        categories: [
          {
            translations: { en: { name: 'Drinks' } },
            products: [
              {
                translations: { en: { name: 'Tea' } },
                price: '5.00',
                confidence: 'HIGH',
              },
            ],
          },
        ],
      });
      const result = await pending;
      expect(result).toMatchObject({ outcome: 'revisionConflict' });
    }
    expect(
      (await db.onboardingCase.findUniqueOrThrow({ where: { id: row.id } }))
        .menuDraft,
    ).toBeNull();
  });
});
