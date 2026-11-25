/* eslint-disable @typescript-eslint/no-unsafe-member-access -- supertest JSON is untyped */
import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { PasswordHasherService } from '../src/auth/password/password-hasher.service';
import { validationExceptionFactory } from '../src/common/http/validation-exception.factory';
import { MenuImportExtractor } from '../src/menu-import/menu-import-extractor';

const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const origin = process.env.PLATFORM_ORIGIN ?? 'http://localhost:3001';
const password = 'Platform-Admin-Pw-1';
const extracted = {
  schemaVersion: 1,
  status: 'EXTRACTED',
  categories: [
    {
      translations: { en: { name: 'Drinks' } },
      products: [{ translations: { en: { name: 'Tea' } }, price: '5.00' }],
    },
  ],
};

describeSandbox('onboarding imports across Nest API instances', () => {
  let first: INestApplication<App>;
  let second: INestApplication<App>;
  let guard: PrismaService;
  let db: PrismaService;
  let adminId: string;
  let packageId: string;
  let cookie: string;
  let secondCookie: string;
  let secondAdminId: string = randomUUID();
  const ids: string[] = [];
  let releaseExtractor: (value: unknown) => void;
  let enteredExtractor: () => void;
  let extractionEntered: Promise<void>;
  const extractor = {
    extract: jest.fn(() => {
      enteredExtractor();
      return new Promise((resolve) => {
        releaseExtractor = resolve;
      });
    }),
  };

  async function appInstance() {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MenuImportExtractor)
      .useValue(extractor)
      .compile();
    const app = module.createNestApplication<INestApplication<App>>();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();
    return app;
  }
  beforeAll(async () => {
    guard = new PrismaService(new ConfigService({ DATABASE_URL: SANDBOX_URL }));
    await assertSandboxIdentity(guard);
    process.env.CORS_ORIGIN ??= 'http://localhost:3000';
    process.env.PLATFORM_ORIGIN ??= origin;
    first = await appInstance();
    second = await appInstance();
    db = first.get(PrismaService);
    await assertSandboxIdentity(db);
    await assertSandboxIdentity(second.get(PrismaService));
    const email = `${randomUUID()}@example.test`;
    const actor = await db.platformAdmin.create({
      data: {
        email,
        emailNormalized: email,
        displayName: 'Integration',
        passwordHash: await first
          .get(PasswordHasherService)
          .hashPassword(password),
        status: 'ACTIVE',
      },
    });
    adminId = actor.id;
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
    const login = await request(first.getHttpServer())
      .post('/api/v1/platform/auth/login')
      .set('Origin', origin)
      .send({ email, password });
    expect(login.status).toBe(200);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    cookie = (
      cookies.find((value) =>
        value.startsWith(
          `${process.env.PLATFORM_SESSION_COOKIE_NAME ?? 'platform_session'}=`,
        ),
      ) ?? ''
    ).split(';')[0];
    expect(cookie).not.toBe('');
    const secondEmail = `${randomUUID()}@example.test`;
    const secondAdmin = await db.platformAdmin.create({
      data: {
        email: secondEmail,
        emailNormalized: secondEmail,
        displayName: 'Second operator',
        passwordHash: await first
          .get(PasswordHasherService)
          .hashPassword(password),
        status: 'ACTIVE',
      },
    });
    secondAdminId = secondAdmin.id;
    const secondLogin = await request(second.getHttpServer())
      .post('/api/v1/platform/auth/login')
      .set('Origin', origin)
      .send({ email: secondEmail, password });
    expect(secondLogin.status).toBe(200);
    const secondCookies = secondLogin.headers[
      'set-cookie'
    ] as unknown as string[];
    secondCookie = (
      secondCookies.find((value) =>
        value.startsWith(
          `${process.env.PLATFORM_SESSION_COOKIE_NAME ?? 'platform_session'}=`,
        ),
      ) ?? ''
    ).split(';')[0];
    expect(secondCookie).not.toBe('');
  }, 30000);
  afterAll(async () => {
    try {
      if (db && adminId) {
        await db.$executeRaw`DELETE FROM onboarding_import_usage WHERE operator_id = ${adminId}::uuid OR operator_id = ${secondAdminId}::uuid`;
        await db.platformAuditLog.deleteMany({
          where: { adminId: { in: [adminId, secondAdminId].filter(Boolean) } },
        });
        await db.onboardingCase.deleteMany({ where: { id: { in: ids } } });
        if (packageId) await db.package.delete({ where: { id: packageId } });
        await db.platformSession.deleteMany({
          where: { adminId: { in: [adminId, secondAdminId] } },
        });
        await db.platformAdmin.deleteMany({
          where: { id: { in: [adminId, secondAdminId] } },
        });
      }
    } finally {
      await first?.close();
      await second?.close();
      await guard?.$disconnect();
    }
  });
  async function fixture() {
    const row = await db.onboardingCase.create({
      data: {
        mode: 'REAL',
        packageId,
        modeConfig: { packageId },
        details: { restaurant: { name: 'Test', defaultLocale: 'en' } },
        importGrantId: randomUUID(),
        importGrantExpiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    ids.push(row.id);
    return row;
  }
  const upload = (
    app: INestApplication<App>,
    id: string,
    revision: number,
    session = cookie,
  ) =>
    request(app.getHttpServer())
      .post(`/api/v1/platform/onboarding-cases/${id}/menu-import`)
      .set('Origin', origin)
      .set('Cookie', session)
      .field('revision', revision)
      .attach('file', Buffer.from('%PDF-test'), 'menu.pdf');

  afterEach(async () => {
    if (db && adminId)
      await db.$executeRaw`DELETE FROM onboarding_import_usage WHERE operator_id = ${adminId}::uuid OR operator_id = ${secondAdminId}::uuid`;
  });

  it.each([
    ['operator concurrency', 'ONBOARDING_IMPORT_OPERATOR_CONCURRENCY', false],
    ['global concurrency', 'ONBOARDING_IMPORT_GLOBAL_CONCURRENCY', true],
    ['operator daily', 'ONBOARDING_IMPORT_OPERATOR_DAILY_LIMIT', false],
    ['global daily', 'ONBOARDING_IMPORT_GLOBAL_DAILY_LIMIT', true],
  ] as const)(
    'serializes simultaneous claims at the %s limit',
    async (_label, limit, differentOperators) => {
      for (const app of [first, second]) {
        const config = app.get(ConfigService);
        config.set('ONBOARDING_IMPORT_OPERATOR_CONCURRENCY', 10);
        config.set('ONBOARDING_IMPORT_GLOBAL_CONCURRENCY', 10);
        config.set('ONBOARDING_IMPORT_OPERATOR_DAILY_LIMIT', 10);
        config.set('ONBOARDING_IMPORT_GLOBAL_DAILY_LIMIT', 10);
        config.set(limit, 1);
      }
      const a = await fixture();
      const b = await fixture();
      extractionEntered = new Promise((resolve) => {
        enteredExtractor = resolve;
      });
      let releaseLock!: () => void;
      let locked!: () => void;
      const holding = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      const ready = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const lock = guard.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(718203541)`;
          locked();
          await holding;
        },
        { timeout: 15000 },
      );
      await ready;
      const p1 = Promise.resolve(upload(first, a.id, a.revision));
      const p2 = Promise.resolve(
        upload(
          second,
          b.id,
          b.revision,
          differentOperators ? secondCookie : cookie,
        ),
      );
      try {
        let waiting = 0;
        for (let i = 0; i < 200 && waiting < 2; i++) {
          const [row] = await guard.$queryRaw<
            { n: bigint }[]
          >`SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'advisory' AND query LIKE '%pg_advisory_xact_lock%'`;
          waiting = Number(row.n);
          if (waiting < 2) await delay(10);
        }
        expect(waiting).toBeGreaterThanOrEqual(2);
      } finally {
        releaseLock();
        await lock;
      }
      try {
        await Promise.race([
          extractionEntered,
          ...[p1, p2].map((pending) =>
            pending.then((response) => {
              if (response.status !== 429)
                throw new Error(
                  `Unexpected early response: ${response.status}`,
                );
              return new Promise<void>(() => undefined);
            }),
          ),
        ]);
        const rejected = await Promise.race([p1, p2]);
        expect(rejected.status).toBe(429);
        expect(rejected.body.error.code).toBe('ONBOARDING_IMPORT_LIMIT');
        const rows = await db.onboardingCase.findMany({
          where: { id: { in: [a.id, b.id] } },
          select: { importAttempts: true },
        });
        expect(rows.map((row) => row.importAttempts).sort()).toEqual([0, 1]);
      } finally {
        releaseExtractor?.(extracted);
        await Promise.all([p1, p2]);
      }
    },
    30000,
  );

  it('does not expose a recovery bypass to a signed-in platform admin', async () => {
    const row = await fixture();
    extractor.extract.mockRejectedValueOnce(
      new Error('ambiguous provider failure'),
    );
    expect((await upload(first, row.id, row.revision)).status).toBe(503);
    const [slot] = await db.$queryRaw<
      { id: string; finished_at: Date | null }[]
    >`SELECT id, finished_at FROM onboarding_import_usage WHERE operator_id = ${adminId}::uuid`;
    expect(slot.finished_at).toBeNull();
    const attempted = await request(second.getHttpServer())
      .post(
        `/api/v1/platform/onboarding-cases/${row.id}/menu-import/executions/${slot.id}/recover`,
      )
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({
        reason: 'test',
        evidence: 'test',
        verifiedStopped: true,
        downstreamState: 'COMPLETED',
      });
    expect(attempted.status).toBe(404);
    const [after] = await db.$queryRaw<
      { finished_at: Date | null }[]
    >`SELECT finished_at FROM onboarding_import_usage WHERE id = ${slot.id}::uuid`;
    expect(after.finished_at).toBeNull();
    const retry = await fixture();
    expect((await upload(second, retry.id, retry.revision)).status).toBe(429);
  });
});
