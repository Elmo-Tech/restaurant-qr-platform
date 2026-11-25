/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
 * supertest exposes `response.body` as `any`; the assertions below read the JSON
 * envelope directly, exactly like the other HTTP e2e specs in this folder. */
import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../src/config/env.schema';
import { DemoService } from '../src/demo/demo.service';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import { MenuImportExtractor } from '../src/menu-import/menu-import-extractor';
import { OnboardingMenuImportService } from '../src/platform/onboarding/onboarding-menu-import.service';
import { OnboardingMenuWriterService } from '../src/platform/onboarding/onboarding-menu-writer.service';
import { PlatformAuditService } from '../src/platform/platform-audit.service';
import { SubscriptionSyncService } from '../src/platform/billing/subscription-sync.service';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PrismaService } from './../src/database/prisma.service';
import { OnboardingCasesService } from './../src/platform/onboarding/onboarding-cases.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/**
 * Owner onboarding cases (A1–A4) against real PostgreSQL through the real Nest app:
 * platform session + Origin rules, create / get / list / search, optimistic concurrency between two
 * operators, one open case per lead, duplicate warnings, submit-for-review gating, cancel, that no
 * password is ever stored and that the audit log carries no secret.
 *
 * Isolation: see `support/sandbox-guard.ts`; without TABLE_SESSION_IT_DATABASE_URL the suite is skipped.
 * Every fixture is fake (`@example.test`, `+2010000000xx`).
 */

const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const ADMIN_PASSWORD = 'Platform-Admin-Pw-1';
const SECRET = 'Sup3r-Secret-Owner-Pw';

describeSandbox('Onboarding cases API (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hasher: PasswordHasherService;
  const platformOrigin = process.env.PLATFORM_ORIGIN ?? 'http://localhost:3001';
  const tag = randomUUID().slice(0, 8);
  // Everything this suite creates, removed in afterAll so later suites see no leftovers (test hygiene).
  const fixtures = {
    adminEmails: [] as string[],
    packageIds: [] as string[],
    leadIds: [] as string[],
    restaurantIds: [] as string[],
    demoIds: [] as string[],
    userIds: [] as string[],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    try {
      await assertSandboxIdentity(prisma);
    } catch (error) {
      await app.close();
      throw error;
    }
    hasher = app.get(PasswordHasherService);
  });

  afterAll(async () => {
    if (prisma) await removeCreatedRows();
    await app?.close();
  });

  /** Deletes the suite's rows: cases first (every FK to them is SET NULL), then their fixtures. */
  async function removeCreatedRows() {
    const {
      adminEmails,
      packageIds,
      leadIds,
      restaurantIds,
      demoIds,
      userIds,
    } = fixtures;
    const remainingDemos = await prisma.restaurant.findMany({
      where: { id: { in: demoIds }, isDemo: true },
      select: { id: true },
    });
    for (const demo of remainingDemos)
      await app.get(DemoService).purge(demo.id);
    await prisma.onboardingCase.deleteMany({
      where: {
        OR: [
          { createdBy: { emailNormalized: { in: adminEmails } } },
          { leadId: { in: leadIds } },
        ],
      },
    });
    await prisma.platformAuditLog.deleteMany({
      where: { adminEmail: { in: adminEmails } },
    });
    await prisma.platformSession.deleteMany({
      where: { admin: { emailNormalized: { in: adminEmails } } },
    });
    await prisma.platformAdmin.deleteMany({
      where: { emailNormalized: { in: adminEmails } },
    });
    await prisma.signupLead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.subscription.deleteMany({
      where: { restaurantId: { in: restaurantIds } },
    });
    for (const restaurantId of restaurantIds) {
      await prisma.modifierOption.deleteMany({ where: { restaurantId } });
      await prisma.modifierGroup.deleteMany({ where: { restaurantId } });
      await prisma.productVariant.deleteMany({ where: { restaurantId } });
      await prisma.product.deleteMany({ where: { restaurantId } });
      await prisma.category.deleteMany({ where: { restaurantId } });
      await prisma.menu.deleteMany({ where: { restaurantId } });
      await prisma.qrCode.deleteMany({ where: { restaurantId } });
      await prisma.restaurantLocale.deleteMany({ where: { restaurantId } });
      await prisma.restaurantMembershipBranch.deleteMany({
        where: { membership: { restaurantId } },
      });
      await prisma.restaurantMembership.deleteMany({ where: { restaurantId } });
      await prisma.restaurantRole.deleteMany({ where: { restaurantId } });
      await prisma.branch.deleteMany({ where: { restaurantId } });
      await prisma.restaurantSetup.deleteMany({ where: { restaurantId } });
      await prisma.restaurantSlug.deleteMany({ where: { restaurantId } });
      await prisma.restaurantAcquisition.deleteMany({
        where: { restaurantId },
      });
      await prisma.restaurantOwnerContact.deleteMany({
        where: { restaurantId },
      });
      await prisma.restaurant.delete({ where: { id: restaurantId } });
    }
    await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
    for (const userId of userIds) {
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  }

  // ---------------------------------------------------------------- helpers

  async function addAdmin(): Promise<string> {
    const email = `pa-${randomUUID()}@example.test`;
    fixtures.adminEmails.push(email);
    await prisma.platformAdmin.create({
      data: {
        email,
        emailNormalized: email,
        passwordHash: await hasher.hashPassword(ADMIN_PASSWORD),
        displayName: 'Onboarding Operator',
        status: 'ACTIVE',
      },
    });
    return email;
  }

  async function platformLogin(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform/auth/login')
      .set('Origin', platformOrigin)
      .send({ email, password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((c) =>
      c.startsWith(
        `${process.env.PLATFORM_SESSION_COOKIE_NAME ?? 'platform_session'}=`,
      ),
    );
    return (cookie ?? '').split(';')[0];
  }

  const get = (
    path: string,
    cookie: string | null,
    origin: string | null = platformOrigin,
  ) => {
    let req = request(app.getHttpServer()).get(`/api/v1/platform${path}`);
    if (cookie) req = req.set('Cookie', cookie);
    return origin ? req.set('Origin', origin) : req;
  };
  const send = (
    method: 'patch' | 'post',
    path: string,
    cookie: string | null,
    body: Record<string, unknown>,
    origin: string | null = platformOrigin,
  ) => {
    let req = request(app.getHttpServer())[method](`/api/v1/platform${path}`);
    if (cookie) req = req.set('Cookie', cookie);
    req = req.send(body);
    return origin ? req.set('Origin', origin) : req;
  };

  async function addPackage(status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') {
    const name = `IT Onboarding ${randomUUID()}`;
    const pkg = await prisma.package.create({
      data: {
        name,
        nameNormalized: name.toLowerCase(),
        nameEn: name,
        nameEnNormalized: `en ${name.toLowerCase()}`,
        status,
      },
      select: { id: true },
    });
    fixtures.packageIds.push(pkg.id);
    return pkg;
  }

  async function addLead(email: string) {
    const lead = await prisma.signupLead.create({
      data: {
        kind: 'TRIAL',
        name: 'Lead Person',
        email,
        phone: '+201000000077',
        restaurantName: `Lead Bistro ${tag}`,
        locale: 'en',
      },
      select: { id: true },
    });
    fixtures.leadIds.push(lead.id);
    return lead;
  }

  /** A restaurant owned by `email` (a real owner account the wizard must warn about). */
  async function addOwnedRestaurant(name: string, email: string) {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `it-onb-${randomUUID()}`,
        name,
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
        locales: { create: [{ locale: 'en', isActive: true }] },
      },
    });
    fixtures.restaurantIds.push(restaurant.id);
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email.toLowerCase(),
        passwordHash: await hasher.hashPassword(ADMIN_PASSWORD),
        status: 'ACTIVE',
      },
    });
    fixtures.userIds.push(user.id);
    const role = await ensureStarterRole(prisma, restaurant.id, 'OWNER');
    await prisma.restaurantMembership.create({
      data: {
        restaurantId: restaurant.id,
        userId: user.id,
        role: 'OWNER',
        roleId: role.id,
        status: 'ACTIVE',
        allBranches: true,
      },
    });
    return restaurant;
  }

  const step1 = (name: string, email: string) => ({
    restaurant: {
      name,
      businessType: 'CAFE',
      branchName: 'Main',
      countryCode: 'EG',
      currencyCode: 'EGP',
      timezone: 'Africa/Cairo',
      defaultLocale: 'ar',
      additionalLocales: ['en'],
      websiteUrl: 'https://example.test',
    },
    owner: {
      fullName: 'Owner Example',
      phone: '+201000000001',
      email,
      additionalContact: 'Call after 5pm',
    },
    acquisition: {
      sourceType: 'PAID_AD',
      sourcePlatform: 'FACEBOOK',
      campaign: 'Spring campaign',
      adReference: 'AD-42',
    },
  });

  // ---------------------------------------------------------------- tests

  it('refuses without a platform session and from a foreign Origin', async () => {
    const cookie = await platformLogin(await addAdmin());
    const anonymous = await get('/onboarding-cases', null);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');
    const anonymousCreate = await send('post', '/onboarding-cases', null, {});
    expect(anonymousCreate.status).toBe(401);

    const foreignRead = await get(
      '/onboarding-cases',
      cookie,
      'http://evil.example.test',
    );
    expect(foreignRead.status).toBe(403);
    expect(foreignRead.body.error.code).toBe('CSRF_VALIDATION_FAILED');
    const foreignWrite = await send(
      'post',
      '/onboarding-cases',
      cookie,
      {},
      'http://evil.example.test',
    );
    expect(foreignWrite.status).toBe(403);
    // An unsafe request without any Origin / Referer is refused too.
    const noOrigin = await send('post', '/onboarding-cases', cookie, {}, null);
    expect(noOrigin.status).toBe(403);

    // A Restaurant Staff route session is not a platform session (and a bogus cookie is just 401).
    const bogus = await get(
      '/onboarding-cases',
      'platform_session=not-a-session',
    );
    expect(bogus.status).toBe(401);
  });

  it('creates, reads, lists and searches cases; unknown ids are 404', async () => {
    const cookie = await platformLogin(await addAdmin());
    const created = await send('post', '/onboarding-cases', cookie, {});
    expect(created.status).toBe(201);
    const view = created.body.data;
    expect(view).toMatchObject({
      status: 'DRAFT',
      mode: null,
      revision: 1,
      completedSteps: [],
      lead: null,
    });
    expect(view.details.restaurant).toMatchObject({
      countryCode: 'EG',
      currencyCode: 'EGP',
      timezone: 'Africa/Cairo',
    });
    expect(view.problems.customer).toContain('RESTAURANT_NAME_INVALID');
    expect(view.problems.mode).toEqual(['MODE_REQUIRED']);

    const name = `Searchable Cafe ${tag}`;
    const saved = await send('patch', `/onboarding-cases/${view.id}`, cookie, {
      revision: 1,
      details: step1(name, `Owner.${tag}@Example.test`),
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.revision).toBe(2);
    expect(saved.body.data.completedSteps).toEqual(['customer']);
    expect(saved.body.data.problems.customer).toEqual([]);
    expect(saved.body.data.details.acquisition.adReference).toBe('AD-42');

    const fetched = await get(`/onboarding-cases/${view.id}`, cookie);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.details.restaurant.name).toBe(name);

    const byName = await get(
      `/onboarding-cases?search=${encodeURIComponent(`searchable cafe ${tag}`)}`,
      cookie,
    );
    expect(byName.status).toBe(200);
    expect((byName.body.data as { id: string }[]).map((c) => c.id)).toEqual([
      view.id,
    ]);
    expect(byName.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    const byEmail = await get(
      `/onboarding-cases?search=${encodeURIComponent(`OWNER.${tag}`)}&status=DRAFT`,
      cookie,
    );
    expect(byEmail.body.data[0]).toMatchObject({
      id: view.id,
      ownerEmail: `owner.${tag}@example.test`,
      restaurantName: name,
      updatedBy: { displayName: 'Onboarding Operator' },
    });
    const none = await get(
      `/onboarding-cases?search=${encodeURIComponent(`searchable cafe ${tag}`)}&status=CANCELLED`,
      cookie,
    );
    expect(none.body.data).toEqual([]);
    expect((await get('/onboarding-cases?pageSize=51', cookie)).status).toBe(
      400,
    );

    for (const id of [randomUUID(), 'not-a-uuid']) {
      const missing = await get(`/onboarding-cases/${id}`, cookie);
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('ONBOARDING_CASE_NOT_FOUND');
    }
  });

  it('detects a revision conflict between two operators', async () => {
    const first = await platformLogin(await addAdmin());
    const second = await platformLogin(await addAdmin());
    const created = await send('post', '/onboarding-cases', first, {});
    const id = created.body.data.id as string;

    const a = await send('patch', `/onboarding-cases/${id}`, first, {
      revision: 1,
      details: { restaurant: { name: 'Operator A' } },
    });
    expect(a.status).toBe(200);
    const b = await send('patch', `/onboarding-cases/${id}`, second, {
      revision: 1,
      details: { restaurant: { name: 'Operator B' } },
    });
    expect(b.status).toBe(409);
    expect(b.body.error).toMatchObject({
      code: 'ONBOARDING_REVISION_CONFLICT',
      details: { currentRevision: 2 },
    });
    const row = await prisma.onboardingCase.findUniqueOrThrow({
      where: { id },
    });
    expect(row.restaurantName).toBe('Operator A');
    expect(row.revision).toBe(2);

    // Retrying with the fresh revision succeeds.
    const retry = await send('patch', `/onboarding-cases/${id}`, second, {
      revision: 2,
      details: { restaurant: { name: 'Operator B' } },
    });
    expect(retry.status).toBe(200);
    expect(retry.body.data.updatedBy.displayName).toBe('Onboarding Operator');
  });

  it('opens one case per lead: the second POST answers 409 with the existing id', async () => {
    const cookie = await platformLogin(await addAdmin());
    const other = await platformLogin(await addAdmin());
    const leadEmail = `lead.${tag}@example.test`;
    const lead = await addLead(leadEmail);

    const [x, y] = await Promise.all([
      send('post', '/onboarding-cases', cookie, { leadId: lead.id }),
      send('post', '/onboarding-cases', other, { leadId: lead.id }),
    ]);
    const statuses = [x.status, y.status].sort();
    expect(statuses).toEqual([201, 409]);
    const winner = x.status === 201 ? x : y;
    const loser = x.status === 201 ? y : x;
    expect(loser.body.error).toMatchObject({
      code: 'ONBOARDING_LEAD_IN_PROGRESS',
      details: { caseId: winner.body.data.id },
    });
    // Prefilled from the lead; the acquisition source is NOT invented.
    expect(winner.body.data.details.owner).toMatchObject({
      fullName: 'Lead Person',
      email: leadEmail,
      phone: '+201000000077',
    });
    expect(winner.body.data.details.restaurant).toMatchObject({
      name: `Lead Bistro ${tag}`,
      defaultLocale: 'en',
    });
    expect(winner.body.data.details.acquisition).toBeNull();
    expect(winner.body.data.lead).toMatchObject({ id: lead.id, kind: 'TRIAL' });

    const missingLead = await send('post', '/onboarding-cases', cookie, {
      leadId: randomUUID(),
    });
    expect(missingLead.status).toBe(404);
    expect(missingLead.body.error.code).toBe('LEAD_NOT_FOUND');

    // After cancelling, the lead can be onboarded again.
    const cancelled = await send(
      'post',
      `/onboarding-cases/${winner.body.data.id}/cancel`,
      cookie,
      { revision: winner.body.data.revision },
    );
    expect(cancelled.status).toBe(200);
    const again = await send('post', '/onboarding-cases', cookie, {
      leadId: lead.id,
    });
    expect(again.status).toBe(201);
  });

  it('returns duplicate warnings without attaching anything', async () => {
    const cookie = await platformLogin(await addAdmin());
    const ownerEmail = `taken.${tag}@example.test`;
    const restaurantName = `Duplicate Grill ${tag}`;
    const existing = await addOwnedRestaurant(restaurantName, ownerEmail);
    const lead = await addLead(ownerEmail.toUpperCase());

    const created = await send('post', '/onboarding-cases', cookie, {});
    const id = created.body.data.id as string;
    await send('patch', `/onboarding-cases/${id}`, cookie, {
      revision: 1,
      details: step1(`duplicate grill ${tag}`, ownerEmail),
    });
    const twin = await send('post', '/onboarding-cases', cookie, {});
    await send('patch', `/onboarding-cases/${twin.body.data.id}`, cookie, {
      revision: 1,
      details: { owner: { email: ownerEmail.toUpperCase() } },
    });

    const res = await get(`/onboarding-cases/${id}/duplicates`, cookie);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.ownerEmailInUse).toBe(true);
    expect(data.ownerRestaurants).toEqual([
      { id: existing.id, name: restaurantName, status: 'ACTIVE' },
    ]);
    expect(data.similarRestaurants).toEqual(
      expect.arrayContaining([
        { id: existing.id, name: restaurantName, status: 'ACTIVE' },
      ]),
    );
    expect((data.otherOpenCases as { id: string }[]).map((c) => c.id)).toEqual([
      twin.body.data.id,
    ]);
    expect((data.matchingLeads as { id: string }[]).map((l) => l.id)).toContain(
      lead.id,
    );
    // Warnings only: no user data beyond the console's own, nothing attached.
    expect(JSON.stringify(data)).not.toMatch(/passwordHash|emailNormalized/);
    const row = await prisma.onboardingCase.findUniqueOrThrow({
      where: { id },
    });
    expect(row.restaurantId).toBeNull();

    const unknown = await get(
      `/onboarding-cases/${randomUUID()}/duplicates`,
      cookie,
    );
    expect(unknown.status).toBe(404);
  });

  it('gates submit-for-review on steps 1 + 2; an edit sends it back to DRAFT; cancel ends it', async () => {
    const cookie = await platformLogin(await addAdmin());
    const pkg = await addPackage();
    const archived = await addPackage('ARCHIVED');
    const created = await send('post', '/onboarding-cases', cookie, {});
    const id = created.body.data.id as string;

    const early = await send(
      'post',
      `/onboarding-cases/${id}/submit-for-review`,
      cookie,
      {
        revision: 1,
      },
    );
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe('ONBOARDING_INCOMPLETE');
    expect(early.body.error.problems).toEqual(
      expect.arrayContaining(['RESTAURANT_NAME_INVALID', 'MODE_REQUIRED']),
    );

    let res = await send('patch', `/onboarding-cases/${id}`, cookie, {
      revision: 1,
      details: step1(`Review Cafe ${tag}`, `review.${tag}@example.test`),
      mode: 'REAL',
    });
    expect(res.body.data.problems.mode).toEqual(['PACKAGE_REQUIRED']);
    res = await send('patch', `/onboarding-cases/${id}`, cookie, {
      revision: 2,
      modeConfig: { packageId: archived.id },
    });
    expect(res.body.data.problems.mode).toEqual(['PACKAGE_NOT_AVAILABLE']);
    res = await send('patch', `/onboarding-cases/${id}`, cookie, {
      revision: 3,
      modeConfig: { packageId: pkg.id },
    });
    expect(res.body.data.completedSteps).toEqual(['customer', 'mode']);
    expect(res.body.data.package).toMatchObject({
      id: pkg.id,
      status: 'ACTIVE',
    });

    // Demo bounds come from the demo service limits.
    res = await send('patch', `/onboarding-cases/${id}`, cookie, {
      revision: 4,
      mode: 'DEMO',
      modeConfig: { demoKind: 'sweets', demoHours: 337 },
    });
    expect(res.body.data.problems.mode).toEqual(['DEMO_HOURS_INVALID']);
    // A mode change clears the package unless the same PATCH supplies it (PO decision 2026-11-22).
    res = await send('patch', `/onboarding-cases/${id}`, cookie, {
      revision: 5,
      mode: 'REAL',
      modeConfig: { packageId: pkg.id },
    });
    expect(res.body.data.completedSteps).toEqual(['customer', 'mode']);

    const submitted = await send(
      'post',
      `/onboarding-cases/${id}/submit-for-review`,
      cookie,
      {
        revision: 6,
      },
    );
    expect(submitted.status).toBe(200);
    expect(submitted.body.data).toMatchObject({
      status: 'READY_FOR_REVIEW',
      revision: 7,
    });
    // Nothing was created: no restaurant, no user for that owner.
    expect(submitted.body.data).not.toHaveProperty('restaurantId');
    expect(
      await prisma.user.count({
        where: { emailNormalized: `review.${tag}@example.test` },
      }),
    ).toBe(0);
    const again = await send(
      'post',
      `/onboarding-cases/${id}/submit-for-review`,
      cookie,
      {
        revision: 7,
      },
    );
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ONBOARDING_INVALID_TRANSITION');

    const edited = await send('patch', `/onboarding-cases/${id}`, cookie, {
      revision: 7,
      details: { restaurant: { branchName: 'Downtown' } },
    });
    expect(edited.body.data.status).toBe('DRAFT');

    const staleCancel = await send(
      'post',
      `/onboarding-cases/${id}/cancel`,
      cookie,
      {
        revision: 7,
      },
    );
    expect(staleCancel.status).toBe(409);
    expect(staleCancel.body.error.code).toBe('ONBOARDING_REVISION_CONFLICT');
    const cancelled = await send(
      'post',
      `/onboarding-cases/${id}/cancel`,
      cookie,
      {
        revision: 8,
      },
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(cancelled.body.data.cancelledAt).toEqual(expect.any(String));

    const afterCancel = await send('patch', `/onboarding-cases/${id}`, cookie, {
      revision: 9,
      details: { restaurant: { name: 'Too late' } },
    });
    expect(afterCancel.status).toBe(409);
    expect(afterCancel.body.error.code).toBe('ONBOARDING_NOT_EDITABLE');
    const cancelTwice = await send(
      'post',
      `/onboarding-cases/${id}/cancel`,
      cookie,
      {
        revision: 9,
      },
    );
    expect(cancelTwice.status).toBe(409);
    expect(cancelTwice.body.error.code).toBe('ONBOARDING_INVALID_TRANSITION');

    const audit = await prisma.platformAuditLog.findMany({
      where: { details: { path: ['caseId'], equals: id } },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((entry) => entry.action)).toEqual([
      'onboarding.created',
      'onboarding.submitted_for_review',
      'onboarding.cancelled',
    ]);
    // Autosave edits are not audited individually; no secret or owner phone in any entry.
    const text = JSON.stringify(audit);
    expect(text).not.toContain('+201000000001');
    expect(text).not.toMatch(/password/i);
  });

  it('never stores a password: any password key refuses the whole write', async () => {
    const cookie = await platformLogin(await addAdmin());
    const created = await send('post', '/onboarding-cases', cookie, {});
    const id = created.body.data.id as string;

    for (const details of [
      { owner: { email: `pw.${tag}@example.test`, password: SECRET } },
      { password: SECRET },
      { restaurant: { name: 'X Cafe', ownerPassword: SECRET } },
      {
        acquisition: {
          sourceType: 'DIRECT',
          sourceDetail: 'x',
          password: SECRET,
        },
      },
    ]) {
      const res = await send('patch', `/onboarding-cases/${id}`, cookie, {
        revision: 1,
        details,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ONBOARDING_INPUT_INVALID');
      expect(JSON.stringify(res.body)).not.toContain(SECRET);
    }
    const topLevel = await send('patch', `/onboarding-cases/${id}`, cookie, {
      revision: 1,
      ownerPassword: SECRET,
      details: { owner: { fullName: 'Owner Example' } },
    });
    // Unknown top-level body keys are stripped by the global whitelist; the allowed part is saved.
    expect(topLevel.status).toBe(200);

    const raw = await prisma.$queryRaw<{ row: string }[]>`
      SELECT row_to_json(c)::text AS row FROM onboarding_cases c WHERE c.id = ${id}::uuid`;
    expect(raw[0].row).not.toContain(SECRET);
    expect(raw[0].row).not.toMatch(/password/i);
    const audit = await prisma.platformAuditLog.findMany({
      where: { details: { path: ['caseId'], equals: id } },
    });
    expect(JSON.stringify(audit)).not.toContain(SECRET);
  });

  // ------------------------------------------------------------------ PO recheck 2026-11-21

  describe('recheck after the Product Owner decisions (2026-11-21)', () => {
    const counts = async () => ({
      restaurants: await prisma.restaurant.count(),
      users: await prisma.user.count(),
      // A-D5 / A-D7 (2026-11-21): A1 + A2 write no menu and no QR code.
      menus: await prisma.menu.count(),
      qrCodes: await prisma.qrCode.count(),
    });

    async function completeCase(cookie: string, label: string) {
      const pkg = await addPackage();
      const created = await send('post', '/onboarding-cases', cookie, {});
      const res = await send(
        'patch',
        `/onboarding-cases/${created.body.data.id}`,
        cookie,
        {
          revision: 1,
          details: step1(
            `${label} ${tag}`,
            `${label.toLowerCase()}.${tag}@example.test`,
          ),
          mode: 'REAL',
          modeConfig: { packageId: pkg.id },
        },
      );
      expect(res.body.data.completedSteps).toEqual(['customer', 'mode']);
      return {
        id: res.body.data.id as string,
        revision: res.body.data.revision as number,
        pkg,
      };
    }

    it('(1) two operators PATCH concurrently with the same revision: one 200, one 409, revision + 1', async () => {
      const a = await platformLogin(await addAdmin());
      const b = await platformLogin(await addAdmin());
      const created = await send('post', '/onboarding-cases', a, {});
      const id = created.body.data.id as string;
      const [x, y] = await Promise.all([
        send('patch', `/onboarding-cases/${id}`, a, {
          revision: 1,
          details: { restaurant: { name: 'Race A' } },
        }),
        send('patch', `/onboarding-cases/${id}`, b, {
          revision: 1,
          details: { restaurant: { name: 'Race B' } },
        }),
      ]);
      expect([x.status, y.status].sort()).toEqual([200, 409]);
      const loser = x.status === 409 ? x : y;
      const winner = x.status === 200 ? x : y;
      expect(loser.body.error.code).toBe('ONBOARDING_REVISION_CONFLICT');
      const row = await prisma.onboardingCase.findUniqueOrThrow({
        where: { id },
      });
      expect(row.revision).toBe(2);
      expect(row.restaurantName).toBe(winner.body.data.details.restaurant.name);
    });

    it('(2) two concurrent POSTs for one lead: one 201, one 409 with the winner id, one open row', async () => {
      const a = await platformLogin(await addAdmin());
      const b = await platformLogin(await addAdmin());
      const lead = await addLead(`race.${tag}@example.test`);
      const [x, y] = await Promise.all([
        send('post', '/onboarding-cases', a, { leadId: lead.id }),
        send('post', '/onboarding-cases', b, { leadId: lead.id }),
      ]);
      expect([x.status, y.status].sort()).toEqual([201, 409]);
      const winner = x.status === 201 ? x : y;
      const loser = x.status === 201 ? y : x;
      expect(loser.body.error).toMatchObject({
        code: 'ONBOARDING_LEAD_IN_PROGRESS',
        details: { caseId: winner.body.data.id },
      });
      expect(
        await prisma.onboardingCase.count({
          where: {
            leadId: lead.id,
            status: { notIn: ['CANCELLED', 'DELIVERED'] },
          },
        }),
      ).toBe(1);
    });

    it('(3) a revision read before submit-for-review or cancel is stale afterwards', async () => {
      const cookie = await platformLogin(await addAdmin());
      const c = await completeCase(cookie, 'Stale');
      const submitted = await send(
        'post',
        `/onboarding-cases/${c.id}/submit-for-review`,
        cookie,
        {
          revision: c.revision,
        },
      );
      expect(submitted.status).toBe(200);
      const stalePatch = await send(
        'patch',
        `/onboarding-cases/${c.id}`,
        cookie,
        {
          revision: c.revision,
          details: { restaurant: { branchName: 'Stale edit' } },
        },
      );
      expect(stalePatch.status).toBe(409);
      expect(stalePatch.body.error).toMatchObject({
        code: 'ONBOARDING_REVISION_CONFLICT',
        details: { currentRevision: c.revision + 1 },
      });
      const staleCancel = await send(
        'post',
        `/onboarding-cases/${c.id}/cancel`,
        cookie,
        { revision: c.revision },
      );
      expect(staleCancel.body.error.code).toBe('ONBOARDING_REVISION_CONFLICT');
      const cancelled = await send(
        'post',
        `/onboarding-cases/${c.id}/cancel`,
        cookie,
        { revision: c.revision + 1 },
      );
      expect(cancelled.status).toBe(200);
      const afterCancel = await send(
        'post',
        `/onboarding-cases/${c.id}/submit-for-review`,
        cookie,
        {
          revision: c.revision + 1,
        },
      );
      expect(afterCancel.body.error.code).toBe('ONBOARDING_REVISION_CONFLICT');
    });

    it('(4) cancelling frees the lead: a new case can be opened for it', async () => {
      const cookie = await platformLogin(await addAdmin());
      const lead = await addLead(`free.${tag}@example.test`);
      const first = await send('post', '/onboarding-cases', cookie, {
        leadId: lead.id,
      });
      expect(
        (await send('post', '/onboarding-cases', cookie, { leadId: lead.id }))
          .status,
      ).toBe(409);
      await send(
        'post',
        `/onboarding-cases/${first.body.data.id}/cancel`,
        cookie,
        { revision: 1 },
      );
      const second = await send('post', '/onboarding-cases', cookie, {
        leadId: lead.id,
      });
      expect(second.status).toBe(201);
      expect(second.body.data.id).not.toBe(first.body.data.id);
    });

    it('(5) duplicates: owner e-mail is case-insensitive and only documented fields are returned', async () => {
      const cookie = await platformLogin(await addAdmin());
      const email = `upper.${tag}@example.test`;
      await addOwnedRestaurant(`Upper Case Grill ${tag}`, email);
      const created = await send('post', '/onboarding-cases', cookie, {});
      const id = created.body.data.id as string;
      await send('patch', `/onboarding-cases/${id}`, cookie, {
        revision: 1,
        details: { owner: { email: `Upper.${tag}@Example.TEST` } },
      });
      const row = await prisma.onboardingCase.findUniqueOrThrow({
        where: { id },
      });
      expect(row.ownerEmail).toBe(email);
      const res = await get(`/onboarding-cases/${id}/duplicates`, cookie);
      const data = res.body.data as Record<string, unknown>;
      expect(Object.keys(data).sort()).toEqual(
        [
          'matchingLeads',
          'otherOpenCases',
          'ownerEmailInUse',
          'ownerRestaurants',
          'similarRestaurants',
        ].sort(),
      );
      expect(data.ownerEmailInUse).toBe(true);
      const keysOf = (list: unknown) =>
        (list as Record<string, unknown>[]).map((e) =>
          Object.keys(e).sort().join(','),
        );
      for (const k of keysOf(data.ownerRestaurants))
        expect(k).toBe('id,name,status');
      for (const k of keysOf(data.similarRestaurants))
        expect(k).toBe('id,name,status');
      for (const k of keysOf(data.otherOpenCases))
        expect(k).toBe('id,restaurantName,status,updatedAt');
      for (const k of keysOf(data.matchingLeads))
        expect(k).toBe('createdAt,id,name,status');
      expect(JSON.stringify(data)).not.toMatch(/@|passwordHash|phone|\+20/);
    });

    it('(6) submit-for-review twice concurrently: exactly one success', async () => {
      const cookie = await platformLogin(await addAdmin());
      const c = await completeCase(cookie, 'Double');
      const [x, y] = await Promise.all([
        send('post', `/onboarding-cases/${c.id}/submit-for-review`, cookie, {
          revision: c.revision,
        }),
        send('post', `/onboarding-cases/${c.id}/submit-for-review`, cookie, {
          revision: c.revision,
        }),
      ]);
      expect([x.status, y.status].sort()).toEqual([200, 409]);
      const loser = x.status === 409 ? x : y;
      expect([
        'ONBOARDING_REVISION_CONFLICT',
        'ONBOARDING_INVALID_TRANSITION',
      ]).toContain(loser.body.error.code);
      const audit = await prisma.platformAuditLog.count({
        where: {
          action: 'onboarding.submitted_for_review',
          details: { path: ['caseId'], equals: c.id },
        },
      });
      expect(audit).toBe(1);
    });

    it('package decision: REAL / TRIAL need an ACTIVE package; archiving it later reopens step 2 and blocks submit', async () => {
      const cookie = await platformLogin(await addAdmin());
      const c = await completeCase(cookie, 'Archived');
      const trial = await send('patch', `/onboarding-cases/${c.id}`, cookie, {
        revision: c.revision,
        mode: 'TRIAL',
        modeConfig: { packageId: null, trialDays: 15 },
      });
      expect(trial.body.data.problems.mode).toContain('PACKAGE_REQUIRED');
      const back = await send('patch', `/onboarding-cases/${c.id}`, cookie, {
        revision: c.revision + 1,
        mode: 'REAL',
        modeConfig: { packageId: c.pkg.id },
      });
      expect(back.body.data.completedSteps).toEqual(['customer', 'mode']);
      await prisma.package.update({
        where: { id: c.pkg.id },
        data: { status: 'ARCHIVED' },
      });
      const read = await get(`/onboarding-cases/${c.id}`, cookie);
      expect(read.body.data.problems.mode).toEqual(['PACKAGE_NOT_AVAILABLE']);
      expect(read.body.data.completedSteps).toEqual(['customer']);
      const submit = await send(
        'post',
        `/onboarding-cases/${c.id}/submit-for-review`,
        cookie,
        {
          revision: back.body.data.revision,
        },
      );
      expect(submit.status).toBe(422);
      expect(submit.body.error.problems).toEqual(['PACKAGE_NOT_AVAILABLE']);
    });

    it('(7) no wizard endpoint creates a restaurant or a user', async () => {
      const cookie = await platformLogin(await addAdmin());
      const lead = await addLead(`nocreate.${tag}@example.test`);
      const before = await counts();
      const c = await completeCase(cookie, 'NoCreate');
      await get('/onboarding-cases', cookie);
      await get(`/onboarding-cases/${c.id}`, cookie);
      await get(`/onboarding-cases/${c.id}/duplicates`, cookie);
      await send('patch', `/onboarding-cases/${c.id}`, cookie, {
        revision: c.revision,
        mode: 'TRIAL',
        modeConfig: { trialDays: 30 },
      });
      const demo = await send('patch', `/onboarding-cases/${c.id}`, cookie, {
        revision: c.revision + 1,
        mode: 'DEMO',
        modeConfig: { demoKind: 'cafe', demoHours: 24 },
      });
      await send(
        'post',
        `/onboarding-cases/${c.id}/submit-for-review`,
        cookie,
        { revision: demo.body.data.revision },
      );
      const fromLead = await send('post', '/onboarding-cases', cookie, {
        leadId: lead.id,
      });
      await send(
        'post',
        `/onboarding-cases/${fromLead.body.data.id}/cancel`,
        cookie,
        { revision: 1 },
      );
      expect(await counts()).toEqual(before);
      // A-D4 (2026-11-21): the lead's status is never written by A1 + A2 (lead → DONE only after DELIVERED, A4).
      expect(
        await prisma.signupLead.findUniqueOrThrow({
          where: { id: lead.id },
          select: { status: true, handledByEmail: true, handledAt: true },
        }),
      ).toEqual({ status: 'NEW', handledByEmail: null, handledAt: null });
      const row = await prisma.onboardingCase.findUniqueOrThrow({
        where: { id: c.id },
      });
      expect(row).toMatchObject({
        restaurantId: null,
        demoId: null,
        provisioningKey: null,
      });
    });
  });

  // ------------------------------------------------------------------ PO decision 2026-11-22

  describe('explicit trial package confirmation (PO decision 2026-11-22)', () => {
    let previousSettings: {
      enabled: boolean;
      defaultDays: number;
      defaultPackageId: string | null;
    } | null = null;
    let recommended: { id: string };

    // The trial settings are one global row: set a recommended package for this block, restore it after.
    beforeAll(async () => {
      previousSettings = await prisma.platformTrialSettings.findUnique({
        where: { id: 'trial' },
        select: { enabled: true, defaultDays: true, defaultPackageId: true },
      });
      recommended = await addPackage();
      const settings = {
        enabled: true,
        defaultDays: 21,
        defaultPackageId: recommended.id,
      };
      await prisma.platformTrialSettings.upsert({
        where: { id: 'trial' },
        create: { id: 'trial', ...settings },
        update: settings,
      });
    });

    afterAll(async () => {
      if (previousSettings) {
        await prisma.platformTrialSettings.update({
          where: { id: 'trial' },
          data: previousSettings,
        });
      } else {
        await prisma.platformTrialSettings.deleteMany({
          where: { id: 'trial' },
        });
      }
    });

    /** A case with a complete step 1 whose operator has just chosen TRIAL (and no package). */
    async function startTrial(cookie: string, label: string) {
      const created = await send('post', '/onboarding-cases', cookie, {});
      const res = await send(
        'patch',
        `/onboarding-cases/${created.body.data.id}`,
        cookie,
        {
          revision: 1,
          details: step1(
            `${label} ${tag}`,
            `${label.toLowerCase()}.${tag}@example.test`,
          ),
          mode: 'TRIAL',
        },
      );
      expect(res.status).toBe(200);
      return {
        id: res.body.data.id as string,
        revision: res.body.data.revision as number,
        view: res.body.data,
      };
    }

    const stored = (id: string) =>
      prisma.onboardingCase.findUniqueOrThrow({
        where: { id },
        select: {
          packageId: true,
          modeConfig: true,
          revision: true,
          status: true,
        },
      });
    const patchCase = (
      cookie: string,
      id: string,
      body: Record<string, unknown>,
    ) => send('patch', `/onboarding-cases/${id}`, cookie, body);
    // `revision` is usually read from a supertest body (typed `any`).
    const submit = (cookie: string, id: string, revision: unknown) =>
      send('post', `/onboarding-cases/${id}/submit-for-review`, cookie, {
        revision,
      });

    it('TRIAL with a recommendation but no operator selection: no package stored, PACKAGE_REQUIRED, submit refused', async () => {
      const cookie = await platformLogin(await addAdmin());
      const c = await startTrial(cookie, 'Recommend');
      expect(c.view.modeConfig).toEqual({
        packageId: null,
        trialDays: 21, // the DEC-056 default length is still prefilled
        demoKind: null,
        demoHours: null,
      });
      expect(c.view.package).toBeNull();
      expect(c.view.trialSettings).toEqual({
        enabled: true,
        defaultDays: 21,
        defaultPackageId: recommended.id,
      });
      expect(c.view.problems.mode).toEqual(['PACKAGE_REQUIRED']);
      expect(c.view.completedSteps).toEqual(['customer']);
      const row = await stored(c.id);
      expect(row.packageId).toBeNull();
      expect((row.modeConfig as { packageId: unknown }).packageId).toBeNull();

      const refused = await submit(cookie, c.id, c.revision);
      expect(refused.status).toBe(422);
      expect(refused.body.error.code).toBe('ONBOARDING_INCOMPLETE');
      expect(refused.body.error.problems).toEqual(['PACKAGE_REQUIRED']);
      expect(await stored(c.id)).toMatchObject({
        status: 'DRAFT',
        revision: c.revision,
        packageId: null,
      });

      // Resuming later: still only a recommendation.
      const resumed = await get(`/onboarding-cases/${c.id}`, cookie);
      expect(resumed.body.data.modeConfig.packageId).toBeNull();
      expect(resumed.body.data.trialSettings.defaultPackageId).toBe(
        recommended.id,
      );
      expect(resumed.body.data.problems.mode).toEqual(['PACKAGE_REQUIRED']);
    });

    it('explicitly accepting the recommended package completes step 2; resume shows it; submit succeeds', async () => {
      const cookie = await platformLogin(await addAdmin());
      const c = await startTrial(cookie, 'Accept');
      const chosen = await patchCase(cookie, c.id, {
        revision: c.revision,
        modeConfig: { packageId: recommended.id },
      });
      expect(chosen.status).toBe(200);
      expect(chosen.body.data.completedSteps).toEqual(['customer', 'mode']);
      expect(chosen.body.data.package).toMatchObject({
        id: recommended.id,
        status: 'ACTIVE',
      });
      expect((await stored(c.id)).packageId).toBe(recommended.id);

      const resumed = await get(`/onboarding-cases/${c.id}`, cookie);
      expect(resumed.body.data).toMatchObject({
        revision: chosen.body.data.revision,
        modeConfig: { packageId: recommended.id, trialDays: 21 },
        completedSteps: ['customer', 'mode'],
      });
      const submitted = await submit(cookie, c.id, chosen.body.data.revision);
      expect(submitted.status).toBe(200);
      expect(submitted.body.data.status).toBe('READY_FOR_REVIEW');
    });

    it('explicitly selecting another ACTIVE package instead of the recommendation', async () => {
      const cookie = await platformLogin(await addAdmin());
      const other = await addPackage();
      const c = await startTrial(cookie, 'Other');
      const chosen = await patchCase(cookie, c.id, {
        revision: c.revision,
        modeConfig: { packageId: other.id, trialDays: 30 },
      });
      expect(chosen.body.data.completedSteps).toEqual(['customer', 'mode']);
      expect(chosen.body.data.package.id).toBe(other.id);
      expect(chosen.body.data.trialSettings.defaultPackageId).toBe(
        recommended.id,
      );
      expect(await stored(c.id)).toMatchObject({
        packageId: other.id,
        modeConfig: { packageId: other.id, trialDays: 30 },
      });
      const submitted = await submit(cookie, c.id, chosen.body.data.revision);
      expect(submitted.status).toBe(200);
    });

    it('a non-ACTIVE package is refused on edit and on submit, also when archived after it was selected', async () => {
      const cookie = await platformLogin(await addAdmin());
      const archived = await addPackage('ARCHIVED');
      const c = await startTrial(cookie, 'Archive');
      let res = await patchCase(cookie, c.id, {
        revision: c.revision,
        modeConfig: { packageId: archived.id },
      });
      expect(res.body.data.problems.mode).toEqual(['PACKAGE_NOT_AVAILABLE']);
      expect(res.body.data.completedSteps).toEqual(['customer']);
      let refused = await submit(cookie, c.id, res.body.data.revision);
      expect(refused.status).toBe(422);
      expect(refused.body.error.problems).toEqual(['PACKAGE_NOT_AVAILABLE']);

      const later = await addPackage();
      res = await patchCase(cookie, c.id, {
        revision: res.body.data.revision,
        modeConfig: { packageId: later.id },
      });
      expect(res.body.data.completedSteps).toEqual(['customer', 'mode']);
      await prisma.package.update({
        where: { id: later.id },
        data: { status: 'ARCHIVED' },
      });
      const read = await get(`/onboarding-cases/${c.id}`, cookie);
      expect(read.body.data.problems.mode).toEqual(['PACKAGE_NOT_AVAILABLE']);
      refused = await submit(cookie, c.id, res.body.data.revision);
      expect(refused.status).toBe(422);
      expect(refused.body.error.problems).toEqual(['PACKAGE_NOT_AVAILABLE']);
      expect(await stored(c.id)).toMatchObject({
        status: 'DRAFT',
        revision: res.body.data.revision,
      });
    });

    it('a package archived between the submit evaluation and the guarded write is refused (no race)', async () => {
      const cookie = await platformLogin(await addAdmin());
      const racing = await addPackage();
      const c = await startTrial(cookie, 'Race');
      const chosen = await patchCase(cookie, c.id, {
        revision: c.revision,
        modeConfig: { packageId: racing.id },
      });
      expect(chosen.body.data.completedSteps).toEqual(['customer', 'mode']);

      // Archive the package right after submit-for-review has evaluated it as ACTIVE.
      const service = app.get(OnboardingCasesService);
      const target = service as unknown as {
        evaluate: (...args: unknown[]) => Promise<unknown>;
      };
      const original = target.evaluate.bind(service);
      const spy = jest
        .spyOn(target, 'evaluate')
        .mockImplementationOnce(async (...args: unknown[]) => {
          const result = await original(...args);
          await prisma.package.update({
            where: { id: racing.id },
            data: { status: 'ARCHIVED' },
          });
          return result;
        });
      let refused: Awaited<ReturnType<typeof submit>>;
      try {
        refused = await submit(cookie, c.id, chosen.body.data.revision);
      } finally {
        spy.mockRestore();
      }
      expect(refused.status).toBe(422);
      expect(refused.body.error.code).toBe('ONBOARDING_INCOMPLETE');
      expect(refused.body.error.problems).toEqual(['PACKAGE_NOT_AVAILABLE']);
      expect(await stored(c.id)).toMatchObject({
        status: 'DRAFT',
        revision: chosen.body.data.revision,
      });
      expect(
        await prisma.platformAuditLog.count({
          where: {
            action: 'onboarding.submitted_for_review',
            details: { path: ['caseId'], equals: c.id },
          },
        }),
      ).toBe(0);
    });

    it('switching modes never keeps a package unless the same PATCH supplies it', async () => {
      const cookie = await platformLogin(await addAdmin());
      const pkg = await addPackage();
      const c = await startTrial(cookie, 'Switch');
      const choose = async (revision: unknown) => {
        const r = await patchCase(cookie, c.id, {
          revision,
          modeConfig: { packageId: pkg.id },
        });
        expect(r.body.data.modeConfig.packageId).toBe(pkg.id);
        return r.body.data.revision as number;
      };
      const expectCleared = async (
        r: Awaited<ReturnType<typeof patchCase>>,
      ) => {
        expect(r.status).toBe(200);
        expect(r.body.data.modeConfig.packageId).toBeNull();
        expect(r.body.data.package).toBeNull();
        expect((await stored(c.id)).packageId).toBeNull();
      };

      // TRIAL -> REAL
      let revision = await choose(c.revision);
      let res = await patchCase(cookie, c.id, { revision, mode: 'REAL' });
      await expectCleared(res);
      expect(res.body.data.problems.mode).toEqual(['PACKAGE_REQUIRED']);

      // REAL -> TRIAL: cleared and NOT replaced by the recommended package; the length is kept.
      revision = await choose(res.body.data.revision);
      res = await patchCase(cookie, c.id, { revision, mode: 'TRIAL' });
      await expectCleared(res);
      expect(res.body.data.modeConfig.trialDays).toBe(21);
      expect(res.body.data.problems.mode).toEqual(['PACKAGE_REQUIRED']);

      // TRIAL -> DEMO: cleared; a demo without a package is the documented demo default (every feature).
      revision = await choose(res.body.data.revision);
      res = await patchCase(cookie, c.id, {
        revision,
        mode: 'DEMO',
        modeConfig: { demoKind: 'cafe', demoHours: 24 },
      });
      await expectCleared(res);
      // Mode first (PO 2026-11-23): the customer step is not part of a DEMO's path, so it is never reported.
      expect(res.body.data.completedSteps).toEqual(['mode']);
      // The customer details typed for TRIAL are kept (compatible draft data), only hidden for the DEMO.
      expect(res.body.data.details.owner.email).toEqual(expect.any(String));

      // DEMO (with a package) -> TRIAL
      revision = await choose(res.body.data.revision);
      res = await patchCase(cookie, c.id, { revision, mode: 'TRIAL' });
      await expectCleared(res);
      expect(res.body.data.problems.mode).toEqual(['PACKAGE_REQUIRED']);

      // A mode change that carries the package explicitly keeps it.
      res = await patchCase(cookie, c.id, {
        revision: res.body.data.revision,
        mode: 'REAL',
        modeConfig: { packageId: pkg.id },
      });
      expect(res.body.data.completedSteps).toEqual(['customer', 'mode']);
      expect((await stored(c.id)).packageId).toBe(pkg.id);
    });

    it('concurrent package selections with one revision: one wins, the stale one writes nothing', async () => {
      const a = await platformLogin(await addAdmin());
      const b = await platformLogin(await addAdmin());
      const pkgA = await addPackage();
      const pkgB = await addPackage();
      const c = await startTrial(a, 'Concurrent');
      const [x, y] = await Promise.all([
        patchCase(a, c.id, {
          revision: c.revision,
          modeConfig: { packageId: pkgA.id },
        }),
        patchCase(b, c.id, {
          revision: c.revision,
          modeConfig: { packageId: pkgB.id },
        }),
      ]);
      expect([x.status, y.status].sort()).toEqual([200, 409]);
      const winner = x.status === 200 ? x : y;
      const loser = x.status === 200 ? y : x;
      expect(loser.body.error).toMatchObject({
        code: 'ONBOARDING_REVISION_CONFLICT',
        details: { currentRevision: c.revision + 1 },
      });
      const winnerPkg = winner.body.data.modeConfig.packageId as string;
      expect([pkgA.id, pkgB.id]).toContain(winnerPkg);
      expect(await stored(c.id)).toMatchObject({
        revision: c.revision + 1,
        packageId: winnerPkg,
      });

      // A stale PATCH and a stale submit write nothing.
      const stale = await patchCase(b, c.id, {
        revision: c.revision,
        modeConfig: { packageId: winnerPkg === pkgA.id ? pkgB.id : pkgA.id },
      });
      expect(stale.status).toBe(409);
      const staleSubmit = await submit(a, c.id, c.revision);
      expect(staleSubmit.status).toBe(409);
      expect(staleSubmit.body.error.code).toBe('ONBOARDING_REVISION_CONFLICT');
      expect(await stored(c.id)).toMatchObject({
        status: 'DRAFT',
        revision: c.revision + 1,
        packageId: winnerPkg,
      });
    });
  });

  describe('final provisioning, staging and handoff', () => {
    const translation = (name: string) => [{ locale: 'ar', name }];
    const menu = {
      menus: [
        {
          translations: translation('Menu'),
          categories: [
            {
              translations: translation('Category'),
              products: [
                {
                  translations: translation('Coffee'),
                  price: '10.00',
                  variants: [
                    { translations: translation('Large'), price: '12.00' },
                  ],
                  modifierGroups: [
                    {
                      translations: translation('Extras'),
                      minSelections: 0,
                      maxSelections: 1,
                      options: [
                        { translations: translation('Shot'), price: '1.50' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    async function start(
      mode: 'REAL' | 'TRIAL' | 'DEMO' = 'REAL',
      withMenu = mode !== 'DEMO',
      allowImport = false,
      leadId?: string,
      loginCookie?: string,
    ) {
      const cookie = loginCookie ?? (await platformLogin(await addAdmin()));
      const pkg = await addPackage();
      if (allowImport)
        await prisma.packageFeature.create({
          data: { packageId: pkg.id, feature: 'MENU_IMPORT' },
        });
      const ownerEmail = `a3-${randomUUID()}@example.test`;
      const name = `IT Onboarding ${randomUUID()}`;
      const created = await send('post', '/onboarding-cases', cookie, {
        ...(leadId ? { leadId } : {}),
      });
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      const path = `/onboarding-cases/${id}`;
      const saved = await send('patch', path, cookie, {
        revision: 1,
        details: step1(name, ownerEmail),
        mode,
        modeConfig: {
          packageId: pkg.id,
          ...(mode === 'DEMO'
            ? { demoKind: 'cafe', demoHours: 24 }
            : { trialDays: 14 }),
        },
        ...(withMenu ? { menuDraft: menu } : {}),
      });
      expect(saved.status).toBe(200);
      return {
        cookie,
        pkg,
        id,
        path,
        ownerEmail,
        name,
        revision: saved.body.data.revision as number,
        key: randomUUID(),
      };
    }
    async function review(context: Awaited<ReturnType<typeof start>>) {
      const res = await send(
        'post',
        `${context.path}/submit-for-review`,
        context.cookie,
        { revision: context.revision },
      );
      expect(res.status).toBe(200);
      context.revision = res.body.data.revision as number;
    }
    function final(
      context: Awaited<ReturnType<typeof start>>,
      retry = false,
      password: string | null = SECRET,
      key = context.key,
    ) {
      return send(
        'post',
        `${context.path}/${retry ? 'retry' : 'provision'}`,
        context.cookie,
        {
          revision: context.revision,
          provisioningKey: key,
          ...(password !== null ? { ownerPassword: password } : {}),
        },
      );
    }
    async function remember(context: Awaited<ReturnType<typeof start>>) {
      const row = await prisma.onboardingCase.findUniqueOrThrow({
        where: { id: context.id },
      });
      if (
        row.restaurantId &&
        !fixtures.restaurantIds.includes(row.restaurantId)
      )
        fixtures.restaurantIds.push(row.restaurantId);
      if (row.demoId && !fixtures.demoIds.includes(row.demoId))
        fixtures.demoIds.push(row.demoId);
      const user = await prisma.user.findUnique({
        where: { emailNormalized: context.ownerEmail },
        select: { id: true },
      });
      if (user && !fixtures.userIds.includes(user.id))
        fixtures.userIds.push(user.id);
      return row;
    }

    it('requires Platform auth, CSRF, a reviewed valid menu, and explicit ACTIVE package', async () => {
      const c = await start('TRIAL', false);
      await review(c);
      const body = {
        revision: c.revision,
        provisioningKey: c.key,
        ownerPassword: SECRET,
      };
      expect(
        (await send('post', `${c.path}/provision`, null, body)).status,
      ).toBe(401);
      expect(
        (
          await send(
            'post',
            `${c.path}/provision`,
            c.cookie,
            body,
            'https://foreign.example.test',
          )
        ).status,
      ).toBe(403);
      const missing = await final(c);
      expect(missing.status).toBe(422);
      expect(missing.body.error.problems).toContain(
        'ONBOARDING_MENU_INCOMPLETE',
      );
      await prisma.package.update({
        where: { id: c.pkg.id },
        data: { status: 'ARCHIVED' },
      });
      const archived = await final(c);
      expect(archived.status).toBe(422);
      expect(archived.body.error.details.mode).toContain(
        'PACKAGE_NOT_AVAILABLE',
      );
      expect(await remember(c)).toMatchObject({
        provisioningKey: null,
        restaurantId: null,
        status: 'READY_FOR_REVIEW',
      });
      expect(
        await prisma.user.count({ where: { emailNormalized: c.ownerEmail } }),
      ).toBe(0);
    });

    it('creates one tenant, owner, menu graph and trial across parallel requests and replays', async () => {
      const c = await start('TRIAL');
      await review(c);
      const missingPassword = await final(c, false, null);
      expect(missingPassword.status).toBe(422);
      expect(missingPassword.body.error.code).toBe('OWNER_PASSWORD_REQUIRED');
      const [a, b] = await Promise.all([final(c), final(c)]);
      const row = await remember(c);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(row.status).toBe('READY');
      const restaurantId = row.restaurantId!;
      expect(
        await prisma.restaurant.count({
          where: { name: c.name, packageId: c.pkg.id },
        }),
      ).toBe(1);
      expect(
        await prisma.user.count({ where: { emailNormalized: c.ownerEmail } }),
      ).toBe(1);
      expect(await prisma.menu.count({ where: { restaurantId } })).toBe(1);
      expect(await prisma.product.count({ where: { restaurantId } })).toBe(1);
      expect(
        await prisma.subscription.count({
          where: { restaurantId, packageId: c.pkg.id, kind: 'TRIAL' },
        }),
      ).toBe(1);
      expect(
        await prisma.platformAuditLog.count({
          where: { restaurantId, action: 'onboarding.menu_published' },
        }),
      ).toBe(1);
      const slug = await prisma.restaurantSlug.findFirstOrThrow({
        where: { restaurantId, isCurrent: true },
      });
      const publicMenu = await request(app.getHttpServer()).get(
        `/api/v1/public/qr/${slug.slug}/menu`,
      );
      expect(publicMenu.status).toBe(200);
      expect(publicMenu.body.data.menu.categories[0].products[0]).toMatchObject(
        { name: 'Coffee', basePrice: '12.00', availability: 'AVAILABLE' },
      );
      const replay = await final(c, false, null);
      expect(replay.body.data).toMatchObject({
        status: 'READY',
        restaurantId,
        provisioningKey: c.key,
      });
      expect((await final(c, false, null, randomUUID())).status).toBe(409);
      const audit = await prisma.platformAuditLog.findMany({
        where: { restaurantId },
      });
      expect(
        JSON.stringify({ row, a: a.body, b: b.body, audit }),
      ).not.toContain(SECRET);
    });

    it('rolls back a failure before the tenant checkpoint and requires password re-entry', async () => {
      const c = await start();
      await review(c);
      const audit = app.get(PlatformAuditService);
      const original = audit.record.bind(audit);
      const checkpoint = jest
        .spyOn(audit, 'record')
        .mockImplementation(async (event, db) => {
          if (event.action === 'onboarding.restaurant_provisioned')
            throw new Error('Simulated checkpoint failure');
          await original(event, db);
        });
      try {
        const refused = await final(c);
        expect(refused.body.data).toMatchObject({
          status: 'FAILED',
          lastErrorCode: 'ONBOARDING_PROVISIONING_FAILED',
          ownerPasswordRequired: true,
        });
        expect(await prisma.restaurant.count({ where: { name: c.name } })).toBe(
          0,
        );
        expect(
          await prisma.user.count({ where: { emailNormalized: c.ownerEmail } }),
        ).toBe(0);
        c.revision = refused.body.data.revision as number;
        expect((await final(c, true, null)).body.error.code).toBe(
          'OWNER_PASSWORD_REQUIRED',
        );
      } finally {
        checkpoint.mockRestore();
      }
      const completed = await final(c, true);
      expect((await remember(c)).status).toBe('READY');
      expect(completed.status).toBe(200);
    });

    it('resumes a menu failure without password or a second restaurant', async () => {
      const c = await start();
      await review(c);
      jest
        .spyOn(app.get(OnboardingMenuWriterService), 'publish')
        .mockRejectedValueOnce(new Error('Simulated interruption'));
      const failed = await final(c);
      const saved = await remember(c);
      expect(failed.body.data).toMatchObject({
        status: 'FAILED',
        lastErrorCode: 'ONBOARDING_MENU_PUBLISH_FAILED',
        ownerPasswordRequired: false,
      });
      expect(saved.restaurantId).toEqual(expect.any(String));
      expect(
        await prisma.menu.count({
          where: { restaurantId: saved.restaurantId! },
        }),
      ).toBe(0);
      c.revision = saved.revision;
      const finished = await final(c, true, null);
      expect(finished.body.data).toMatchObject({
        status: 'READY',
        restaurantId: saved.restaurantId,
      });
      expect(await prisma.restaurant.count({ where: { name: c.name } })).toBe(
        1,
      );
    });

    it('reuses a committed trial after sync failure and verifies the actual public menu', async () => {
      const c = await start('TRIAL');
      await review(c);
      jest
        .spyOn(app.get(SubscriptionSyncService), 'syncRestaurant')
        .mockRejectedValueOnce(new Error('Simulated sync failure'));
      const failed = await final(c);
      const row = await remember(c);
      expect(failed.body.data).toMatchObject({
        status: 'FAILED',
        lastErrorCode: 'ONBOARDING_TRIAL_FAILED',
      });
      expect(row.trialSubscriptionId).toEqual(expect.any(String));
      const restaurantId = row.restaurantId!;
      await prisma.product.updateMany({
        where: { restaurantId },
        data: { availability: 'SOLD_OUT' },
      });
      expect(
        await prisma.qrCode.count({
          where: { restaurantId, status: 'ACTIVE' },
        }),
      ).toBe(1);
      c.revision = row.revision;
      const unavailable = await final(c, true, null);
      expect(unavailable.body.data).toMatchObject({
        status: 'FAILED',
        lastErrorCode: 'ONBOARDING_GUEST_MENU_NOT_READY',
      });
      await prisma.product.updateMany({
        where: { restaurantId },
        data: { availability: 'AVAILABLE' },
      });
      c.revision = unavailable.body.data.revision as number;
      const resumed = await final(c, true, null);
      expect(resumed.body.data).toMatchObject({
        status: 'READY',
        restaurantId,
      });
      expect(
        await prisma.subscription.count({
          where: { restaurantId, kind: 'TRIAL' },
        }),
      ).toBe(1);
    });

    it('stages, gates, reviews, and expires extracted drafts without writing tenant menu rows', async () => {
      const c = await start('REAL', false, true);
      const png = await sharp({
        create: { width: 1, height: 1, channels: 3, background: 'white' },
      })
        .png()
        .toBuffer();
      const extract = jest
        .spyOn(app.get(MenuImportExtractor), 'extract')
        .mockResolvedValue({
          status: 'EXTRACTED',
          schemaVersion: 1,
          languages: ['ar'],
          categories: [
            {
              translations: { ar: { name: 'Drinks' } },
              products: [
                { translations: { ar: { name: 'Tea' } }, price: '4.20' },
              ],
            },
          ],
        });
      const upload = (bytes = png, cookie = c.cookie) =>
        request(app.getHttpServer())
          .post(`/api/v1/platform${c.path}/menu-import`)
          .set('Origin', platformOrigin)
          .set('Cookie', cookie)
          .field('revision', c.revision)
          .attach('file', bytes, 'menu.png');
      try {
        expect((await upload(png, '')).status).toBe(401);
        expect(
          (await upload(Buffer.from('not an image'))).body.error.code,
        ).toBe('IMPORT_FILE_INVALID');
        const staged = await upload();
        expect(staged.status).toBe(200);
        expect(staged.body.data).toMatchObject({
          importAttempts: 1,
          importReviewed: false,
        });
        expect(staged.body.data).not.toHaveProperty('restaurantId');
        expect(
          staged.body.data.menuDraft.menus[0].categories[0].products[0].price,
        ).toBe('4.20');
        c.revision = staged.body.data.revision as number;
        await review(c);
        const unreviewed = await final(c);
        expect(unreviewed.body.error.problems).toContain(
          'ONBOARDING_IMPORT_REVIEW_REQUIRED',
        );
        const approved = await send(
          'post',
          `${c.path}/menu-import/review`,
          c.cookie,
          { revision: c.revision },
        );
        expect(approved.body.data.importReviewed).toBe(true);
        c.revision = approved.body.data.revision as number;
        await prisma.packageFeature.deleteMany({
          where: { packageId: c.pkg.id },
        });
        expect((await final(c)).body.error.problems).toContain(
          'FEATURE_NOT_AVAILABLE',
        );
        expect(await prisma.restaurant.count({ where: { name: c.name } })).toBe(
          0,
        );
        await prisma.onboardingCase.update({
          where: { id: c.id },
          data: { importExpiresAt: new Date('2020-01-01T00:00:00Z') },
        });
        await app.get(OnboardingMenuImportService).cleanupExpired();
        expect(await remember(c)).toMatchObject({
          menuDraft: null,
          importReviewed: false,
        });
        expect(extract).toHaveBeenCalledTimes(1);
      } finally {
        extract.mockRestore();
      }
    });

    describe('menu import entitlement (A1 regression)', () => {
      type Context = Awaited<ReturnType<typeof start>>;
      const extraction = {
        status: 'EXTRACTED',
        schemaVersion: 1,
        languages: ['ar'],
        categories: [
          {
            translations: { ar: { name: 'Drinks' } },
            products: [
              { translations: { ar: { name: 'Tea' } }, price: '4.20' },
            ],
          },
        ],
      };
      const png = () =>
        sharp({
          create: { width: 1, height: 1, channels: 3, background: 'white' },
        })
          .png()
          .toBuffer();
      async function uploadTo(
        c: Context,
        cookie: string | null = c.cookie,
        origin: string | null = platformOrigin,
      ) {
        let req = request(app.getHttpServer()).post(
          `/api/v1/platform${c.path}/menu-import`,
        );
        if (origin) req = req.set('Origin', origin);
        if (cookie) req = req.set('Cookie', cookie);
        return req
          .field('revision', c.revision)
          .attach('file', await png(), 'menu.png');
      }
      const importAudits = (c: Context) =>
        prisma.platformAuditLog.count({
          where: {
            action: { startsWith: 'onboarding.import_' },
            details: { path: ['caseId'], equals: c.id },
          },
        });
      const caseRow = (c: Context) =>
        prisma.onboardingCase.findUniqueOrThrow({ where: { id: c.id } });

      it('refuses unauthorized uploads and a package without MENU_IMPORT before extraction or attempt counting', async () => {
        const c = await start('REAL', false, false);
        const extract = jest
          .spyOn(app.get(MenuImportExtractor), 'extract')
          .mockResolvedValue(extraction);
        try {
          expect((await uploadTo(c, null)).status).toBe(401);
          const foreign = await uploadTo(
            c,
            c.cookie,
            'https://foreign.example.test',
          );
          expect(foreign.status).toBe(403);
          expect(foreign.body.error.code).toBe('CSRF_VALIDATION_FAILED');

          // The package is the entitlement: a missing feature is 403 FEATURE_NOT_AVAILABLE, never a case-access error.
          const refused = await uploadTo(c);
          expect(refused.status).toBe(403);
          expect(refused.body.error.code).toBe('FEATURE_NOT_AVAILABLE');
          const row = await caseRow(c);
          expect(row).toMatchObject({
            revision: c.revision,
            importAttempts: 0,
            importExpiresAt: null,
            importLeaseUntil: null,
            menuDraft: null,
          });
          expect(await importAudits(c)).toBe(0);
          expect(extract).not.toHaveBeenCalled();
          // The case itself stays readable and editable by the same operator.
          expect((await get(c.path, c.cookie)).status).toBe(200);

          // Authorized: the same operator, after the package gains MENU_IMPORT, stages a draft.
          await prisma.packageFeature.create({
            data: { packageId: c.pkg.id, feature: 'MENU_IMPORT' },
          });
          const staged = await uploadTo(c);
          expect(staged.status).toBe(200);
          expect(staged.body.data).toMatchObject({
            importAttempts: 1,
            importReviewed: false,
          });
          expect(extract).toHaveBeenCalledTimes(1);
          expect(await importAudits(c)).toBe(1);
        } finally {
          extract.mockRestore();
        }
      });

      it('keeps an existing staged draft intact when the package loses MENU_IMPORT; discard stays available', async () => {
        const c = await start('REAL', false, true);
        const extract = jest
          .spyOn(app.get(MenuImportExtractor), 'extract')
          .mockResolvedValue(extraction);
        try {
          const staged = await uploadTo(c);
          expect(staged.status).toBe(200);
          c.revision = staged.body.data.revision as number;
          const before = await caseRow(c);
          expect(before.importAttempts).toBe(1);

          await prisma.packageFeature.deleteMany({
            where: { packageId: c.pkg.id },
          });
          const reupload = await uploadTo(c);
          expect(reupload.status).toBe(403);
          expect(reupload.body.error.code).toBe('FEATURE_NOT_AVAILABLE');
          const reviewed = await send(
            'post',
            `${c.path}/menu-import/review`,
            c.cookie,
            { revision: c.revision },
          );
          expect(reviewed.status).toBe(403);
          expect(reviewed.body.error.code).toBe('FEATURE_NOT_AVAILABLE');

          const after = await caseRow(c);
          expect(after).toMatchObject({
            revision: before.revision,
            importAttempts: 1,
            importReviewed: false,
            importLeaseUntil: null,
          });
          expect(after.menuDraft).toEqual(before.menuDraft);
          expect(after.importExpiresAt).toEqual(before.importExpiresAt);
          expect(await importAudits(c)).toBe(1);
          expect(extract).toHaveBeenCalledTimes(1);
          expect((await get(c.path, c.cookie)).status).toBe(200);

          // Discarding needs no entitlement, so the operator can always fall back to a manual menu.
          const discarded = await request(app.getHttpServer())
            .delete(`/api/v1/platform${c.path}/menu-import`)
            .set('Origin', platformOrigin)
            .set('Cookie', c.cookie)
            .send({ revision: c.revision });
          expect(discarded.status).toBe(200);
          expect(discarded.body.data).toMatchObject({
            menuDraft: null,
            importExpiresAt: null,
            importAttempts: 1,
          });
        } finally {
          extract.mockRestore();
        }
      });
    });

    describe('A4 explicit handoff', () => {
      type Context = Awaited<ReturnType<typeof start>>;
      type LeadStatus = 'NEW' | 'CONTACTED' | 'DONE' | 'DISMISSED';
      const deliver = (c: Context, revision = c.revision) =>
        send('post', `${c.path}/deliver`, c.cookie, { revision });
      const leadState = (id: string) =>
        prisma.signupLead.findUniqueOrThrow({
          where: { id },
          select: { status: true, statusVersion: true, note: true },
        });
      const editLead = (
        cookie: string,
        leadId: string,
        status: LeadStatus,
        note?: string,
      ) =>
        send('patch', `/leads/${leadId}`, cookie, { status, note }).expect(200);
      const caseAudit = (caseId: string, action: string) =>
        prisma.platformAuditLog.findMany({
          where: { action, details: { path: ['caseId'], equals: caseId } },
        });
      const webOrigin = () =>
        app
          .get<ConfigService<EnvConfig, true>>(ConfigService)
          .get('CORS_ORIGIN', {
            infer: true,
          });

      async function provisionReady(
        c: Context,
        password: string | null = SECRET,
      ) {
        await review(c);
        const response = await final(c, false, password);
        const row = await remember(c);
        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('READY');
        expect(row.status).toBe('READY');
        c.revision = row.revision;
        return { row, response };
      }

      async function publicMenuFor(restaurantId: string) {
        const { slug } = await prisma.restaurantSlug.findFirstOrThrow({
          where: { restaurantId, isCurrent: true },
          select: { slug: true },
        });
        return request(app.getHttpServer())
          .get(`/api/v1/public/qr/${encodeURIComponent(slug)}/menu`)
          .expect(200);
      }

      it('delivers READY exactly once, clears only staging and keeps the published guest menu and URLs', async () => {
        const lead = await addLead(`a4-real-${randomUUID()}@example.test`);
        const c = await start('REAL', true, false, lead.id);
        expect((await get(c.path, c.cookie)).body.data).toMatchObject({
          handoff: null,
          deliveredAt: null,
          demoHistory: null,
        });
        const premature = await deliver(c);
        expect(premature.status).toBe(409);
        expect(premature.body.error.code).toBe('ONBOARDING_INVALID_TRANSITION');

        const { row } = await provisionReady(c);
        const restaurantId = row.restaurantId!;
        expect(await leadState(lead.id)).toEqual({
          status: 'NEW',
          statusVersion: 0,
          note: null,
        });
        expect(row.leadStatusVersion).toBe(0);
        const body = { revision: c.revision };
        await send('post', `${c.path}/deliver`, null, body).expect(401);
        for (const origin of ['https://foreign.example.test', null]) {
          const refused = await send(
            'post',
            `${c.path}/deliver`,
            c.cookie,
            body,
            origin,
          );
          expect(refused.status).toBe(403);
          expect(refused.body.error.code).toBe('CSRF_VALIDATION_FAILED');
        }
        const stale = await deliver(c, c.revision - 1);
        expect(stale.status).toBe(409);
        expect(stale.body.error.code).toBe('ONBOARDING_REVISION_CONFLICT');

        // A live Generic QR cannot make an unavailable menu ready for handoff.
        const product = await prisma.product.findFirstOrThrow({
          where: { restaurantId },
        });
        const setAvailability = (availability: 'AVAILABLE' | 'SOLD_OUT') =>
          prisma.product.update({
            where: { id: product.id },
            data: { availability },
          });
        await setAvailability('SOLD_OUT');
        expect(
          await prisma.qrCode.count({
            where: { restaurantId, type: 'GENERIC', status: 'ACTIVE' },
          }),
        ).toBe(1);
        expect((await get(c.path, c.cookie)).body.data.handoff).toBeNull();
        const unavailable = await deliver(c);
        expect(unavailable.status).toBe(422);
        expect(unavailable.body.error.code).toBe(
          'ONBOARDING_HANDOFF_UNAVAILABLE',
        );
        expect(await caseAudit(c.id, 'onboarding.delivered')).toHaveLength(0);
        await setAvailability('AVAILABLE');

        // The ordinary publish path retains the draft; seed populated import metadata,
        // including a lease (normally cleared by the importer), to verify delivery scrubs it.
        const lease = new Date(Date.now() + 60_000);
        await prisma.onboardingCase.update({
          where: { id: c.id },
          data: {
            importExpiresAt: lease,
            importLeaseUntil: lease,
            importReviewed: true,
          },
        });
        const ready = await get(c.path, c.cookie).expect(200);
        expect(ready.body.data).toMatchObject({
          status: 'READY',
          menuDraft: row.menuDraft,
          importReviewed: true,
          importExpiresAt: lease.toISOString(),
          deliveredAt: null,
        });
        expect(ready.body.data.menuDraft).not.toBeNull();
        const detail = await get(
          `/restaurants/${restaurantId}`,
          c.cookie,
        ).expect(200);
        expect(detail.body.data.menuLink.url).toEqual(expect.any(String));
        const handoff = {
          guestMenuUrl: detail.body.data.menuLink.url,
          staffLoginUrl: new URL('/login', webOrigin()).href,
        };
        expect(ready.body.data.handoff).toEqual(handoff);
        const before = await publicMenuFor(restaurantId);
        expect(before.body.data.menu.categories[0].products[0]).toMatchObject({
          name: 'Coffee',
          availability: 'AVAILABLE',
        });

        const other = await platformLogin(await addAdmin());
        const [first, concurrent] = await Promise.all([
          deliver(c),
          send('post', `${c.path}/deliver`, other, body),
        ]);
        expect(first.status).toBe(200);
        expect(concurrent.status).toBe(200);
        const delivered = first.body.data;
        expect(delivered).toMatchObject({
          status: 'DELIVERED',
          revision: c.revision + 1,
          handoff,
          menuDraft: null,
          importExpiresAt: null,
          importReviewed: false,
          deliveredAt: expect.any(String),
          demoHistory: null,
        });
        expect(concurrent.body.data).toEqual(delivered);
        expect((await deliver(c).expect(200)).body.data).toEqual(delivered);
        expect((await get(c.path, c.cookie).expect(200)).body.data).toEqual(
          delivered,
        );
        expect(await remember(c)).toMatchObject({
          menuDraft: null,
          importExpiresAt: null,
          importLeaseUntil: null,
          importReviewed: false,
          menuPublishedAt: row.menuPublishedAt,
          deliveredAt: new Date(delivered.deliveredAt as string),
        });
        expect((await publicMenuFor(restaurantId)).body.data.menu).toEqual(
          before.body.data.menu,
        );
        expect(await leadState(lead.id)).toMatchObject({
          status: 'DONE',
          statusVersion: 1,
        });
        expect(await caseAudit(c.id, 'onboarding.delivered')).toHaveLength(1);
        expect(
          await caseAudit(c.id, 'onboarding.lead_transitioned'),
        ).toMatchObject([
          {
            details: { caseId: c.id, leadId: lead.id, from: 'NEW', to: 'DONE' },
          },
        ]);
      });

      it.each([
        ['CONTACTED', 'DONE', 2],
        ['DONE', 'DONE', 1],
        ['DISMISSED', 'DISMISSED', 1],
      ] as const)(
        'captures a nonzero lead version and delivers TRIAL from %s without overwriting terminal leads',
        async (initial, expected, version) => {
          const cookie = await platformLogin(await addAdmin());
          const lead = await addLead(`a4-trial-${randomUUID()}@example.test`);
          await editLead(cookie, lead.id, initial);
          const c = await start('TRIAL', true, false, lead.id, cookie);
          expect((await remember(c)).leadStatusVersion).toBe(1);
          const { response } = await provisionReady(c);
          expect(response.body.data.handoff).toMatchObject({
            guestMenuUrl: expect.any(String),
            staffLoginUrl: new URL('/login', webOrigin()).href,
          });
          expect(await leadState(lead.id)).toMatchObject({
            status: initial,
            statusVersion: 1,
          });
          expect((await deliver(c).expect(200)).body.data.status).toBe(
            'DELIVERED',
          );
          expect(await leadState(lead.id)).toMatchObject({
            status: expected,
            statusVersion: version,
          });
          expect(
            await caseAudit(c.id, 'onboarding.lead_transitioned'),
          ).toHaveLength(version - 1);
        },
      );

      it('respects intervening manual ABA edits and a note-only update', async () => {
        const lead = await addLead(`a4-aba-${randomUUID()}@example.test`);
        const c = await start('REAL', true, false, lead.id);
        const operator = await platformLogin(await addAdmin());
        await editLead(operator, lead.id, 'CONTACTED');
        expect(await leadState(lead.id)).toMatchObject({
          status: 'CONTACTED',
          statusVersion: 1,
        });
        await editLead(operator, lead.id, 'NEW');
        expect(await leadState(lead.id)).toMatchObject({
          status: 'NEW',
          statusVersion: 2,
        });
        await editLead(operator, lead.id, 'NEW', 'Operator follow-up pending');
        const manual = {
          status: 'NEW',
          statusVersion: 3,
          note: 'Operator follow-up pending',
        };
        expect(await leadState(lead.id)).toEqual(manual);
        expect((await provisionReady(c)).row.leadStatusVersion).toBe(0);
        expect((await deliver(c).expect(200)).body.data.status).toBe(
          'DELIVERED',
        );
        expect(await leadState(lead.id)).toEqual(manual);
        expect(
          await caseAudit(c.id, 'onboarding.lead_transitioned'),
        ).toHaveLength(0);
      });

      it('does not overwrite an operator note committed while delivery waits on the lead row', async () => {
        const lead = await addLead(`a4-race-${randomUUID()}@example.test`);
        const c = await start('REAL', true, false, lead.id);
        await provisionReady(c);
        let delivery: Promise<request.Response> | undefined;
        try {
          await prisma.$transaction(
            async (tx) => {
              // Hold the lock from a same-status operator edit before either write commits.
              const [{ pid }] = await tx.$queryRaw<
                { pid: number }[]
              >`SELECT pg_backend_pid() AS pid`;
              await tx.signupLead.update({
                where: { id: lead.id },
                data: {
                  note: 'Concurrent operator note',
                  statusVersion: { increment: 1 },
                },
              });
              delivery = deliver(c).then((response) => response);
              const deadline = Date.now() + 3_000;
              do {
                const [{ blocked }] = await prisma.$queryRaw<
                  { blocked: boolean }[]
                >`
                SELECT EXISTS (
                  SELECT FROM pg_stat_activity
                  WHERE ${pid}::int = ANY(pg_blocking_pids(pid))
                    AND query LIKE '%signup_leads%'
                ) AS blocked
              `;
                if (blocked) return;
                await sleep(20);
              } while (Date.now() < deadline);
              throw new Error(
                'Delivery did not block on the uncommitted lead update',
              );
            },
            { timeout: 5_000 },
          );
        } finally {
          // Always drain the request after the blocking transaction has committed or rolled back.
          const response = await delivery;
          if (response) {
            expect(response.status).toBe(200);
            expect(response.body.data.status).toBe('DELIVERED');
          }
        }
        expect(await leadState(lead.id)).toEqual({
          status: 'NEW',
          statusVersion: 1,
          note: 'Concurrent operator note',
        });
        expect(await caseAudit(c.id, 'onboarding.delivered')).toHaveLength(1);
        expect(
          await caseAudit(c.id, 'onboarding.lead_transitioned'),
        ).toHaveLength(0);
      }, 10_000);

      it('returns the private demo link once across concurrent creation, then preserves only history after purge', async () => {
        const lead = await addLead(`a4-demo-${randomUUID()}@example.test`);
        const c = await start('DEMO', false, false, lead.id);
        await review(c);
        const initial = await get(c.path, c.cookie).expect(200);
        expect(initial.body.data).toMatchObject({
          handoff: null,
          demoHistory: null,
          deliveredAt: null,
        });
        expect(initial.body.data).not.toHaveProperty('demoLink');
        const responses = await Promise.all([
          final(c, false, null),
          final(c, false, null),
        ]);
        const row = await remember(c);
        expect(responses.map((result) => result.status)).toEqual([200, 200]);
        const created = responses.filter(
          (result) => 'demoLink' in result.body.data,
        );
        expect(created).toHaveLength(1);
        const link = created[0].body.data.demoLink as string;
        expect(link).toMatch(/^https?:\/\/.*\/demo\/[A-Za-z0-9_-]{43}$/);
        const token = new URL(link).pathname.split('/').at(-1)!;
        expect(row.status).toBe('READY');
        const demoId = row.demoId!;
        const demos = await prisma.restaurant.findMany({
          where: { isDemo: true, demoLabel: c.name },
          select: {
            id: true,
            status: true,
            createdAt: true,
            demoExpiresAt: true,
            package: { select: { name: true } },
          },
        });
        expect(demos).toHaveLength(1);
        expect(demos[0]).toMatchObject({ id: demoId, status: 'ACTIVE' });
        expect(
          await caseAudit(c.id, 'onboarding.demo_provisioned'),
        ).toHaveLength(1);
        const history = {
          kind: 'cafe',
          label: c.name,
          packageName: demos[0].package!.name,
          createdAt: demos[0].createdAt.toISOString(),
          expiresAt: demos[0].demoExpiresAt!.toISOString(),
          removedAt: null,
          purged: false,
        };
        expect(created[0].body.data.demoHistory).toEqual(history);
        expect(created[0].body.data.handoff).toBeNull();
        expect(await leadState(lead.id)).toMatchObject({
          status: 'NEW',
          statusVersion: 0,
        });
        expect(
          await caseAudit(c.id, 'onboarding.lead_transitioned'),
        ).toHaveLength(0);
        const guest = await publicMenuFor(demoId);
        expect(guest.body.data.menu.categories).not.toHaveLength(0);
        expect(JSON.stringify(guest.body)).not.toContain(`a4-demo-`);
        await request(app.getHttpServer())
          .post('/api/v1/demo/enter')
          .set('Origin', new URL(webOrigin()).origin)
          .send({ token })
          .expect(200);

        const fetched = await get(c.path, c.cookie).expect(200);
        expect(fetched.body.data.demoHistory).toEqual(history);
        const replay = await final(c, false, null).expect(200);
        c.revision = row.revision;
        const retried = await final(c, true, null).expect(200);
        for (const response of [fetched, replay, retried]) {
          expect(response.body.data).not.toHaveProperty('demoLink');
        }
        const rawCase = await prisma.$queryRaw<{ row: string }[]>`
          SELECT row_to_json(c)::text AS row FROM onboarding_cases c WHERE c.id = ${c.id}::uuid
        `;
        const access = await prisma.demoAccessLink.findMany({
          where: { restaurantId: demoId },
        });
        expect(access).toMatchObject([
          { tokenHash: createHash('sha256').update(token).digest('hex') },
        ]);
        const audits = await prisma.platformAuditLog.findMany({
          where: { details: { path: ['caseId'], equals: c.id } },
        });
        const nonSecret = JSON.stringify({
          rawCase,
          access,
          audits,
          replay: replay.body,
          fetched: fetched.body,
          retried: retried.body,
        });
        expect(nonSecret).not.toContain(token);
        expect(nonSecret).not.toContain(link);

        const delivered = await deliver(c).expect(200);
        expect(delivered.body.data).toMatchObject({
          status: 'DELIVERED',
          handoff: null,
          deliveredAt: expect.any(String),
        });
        expect(delivered.body.data).not.toHaveProperty('demoLink');
        expect(await leadState(lead.id)).toMatchObject({
          status: 'CONTACTED',
          statusVersion: 1,
        });
        expect(
          await caseAudit(c.id, 'onboarding.lead_transitioned'),
        ).toMatchObject([
          {
            details: {
              caseId: c.id,
              leadId: lead.id,
              from: 'NEW',
              to: 'CONTACTED',
            },
          },
        ]);
        await app.get(DemoService).purge(demoId);
        expect(
          await prisma.restaurant.findUnique({ where: { id: demoId } }),
        ).toBeNull();
        expect(
          await prisma.demoAccessLink.count({
            where: { restaurantId: demoId },
          }),
        ).toBe(0);
        const purgedRow = await remember(c);
        expect(purgedRow.demoId).toBeNull();
        expect(purgedRow.leadId).toBe(lead.id);
        const purged = await get(c.path, c.cookie).expect(200);
        expect(purged.body.data.demoHistory).toEqual({
          ...history,
          removedAt: expect.any(String),
          purged: true,
        });
        expect(purged.body.data).not.toHaveProperty('demoLink');
        expect(JSON.stringify(purged.body)).not.toContain(token);
        expect((await deliver(c).expect(200)).body.data).toEqual(
          purged.body.data,
        );
        expect(await caseAudit(c.id, 'onboarding.delivered')).toHaveLength(1);
        expect(
          await caseAudit(c.id, 'onboarding.lead_transitioned'),
        ).toHaveLength(1);
      }, 15_000);

      it('rejects handoff of an expired, locked or removed demo without contacting its lead', async () => {
        const lead = await addLead(`a4-expired-${randomUUID()}@example.test`);
        const c = await start('DEMO', false, false, lead.id);
        const { row } = await provisionReady(c, null);
        const demoId = row.demoId!;
        const demos = app.get(DemoService);
        const refused = async () => {
          const result = await deliver(c).expect(422);
          expect(result.body.error.code).toBe('ONBOARDING_DEMO_EXPIRED');
          expect(result.body.data).toBeUndefined();
        };
        await prisma.restaurant.update({
          where: { id: demoId },
          data: { demoExpiresAt: new Date(Date.now() - 1_000) },
        });
        await refused();
        // Check each guard independently: a locked demo's expiry is now in the future.
        expect((await demos.extend(demoId, 24)).outcome).toBe('ok');
        await demos.lock(demoId);
        await refused();
        // Expired/locked is not proof of purge: even explicit operator confirmation cannot cancel yet.
        const beforePurge = await send('post', `${c.path}/cancel`, c.cookie, {
          revision: c.revision,
          confirmNotDelivered: true,
        }).expect(409);
        expect(beforePurge.body.error.code).toBe(
          'ONBOARDING_INVALID_TRANSITION',
        );
        await demos.purge(demoId);
        expect((await remember(c)).demoId).toBeNull();
        await refused();
        expect(await leadState(lead.id)).toMatchObject({
          status: 'NEW',
          statusVersion: 0,
        });
        expect(
          (await get(c.path, c.cookie).expect(200)).body.data,
        ).toMatchObject({
          status: 'READY',
          revision: c.revision,
          deliveredAt: null,
          handoff: null,
        });
        expect(await caseAudit(c.id, 'onboarding.delivered')).toHaveLength(0);
        expect(
          await caseAudit(c.id, 'onboarding.lead_transitioned'),
        ).toHaveLength(0);

        const anonymous = await send('post', `${c.path}/cancel`, null, {
          revision: c.revision,
          confirmNotDelivered: true,
        }).expect(401);
        expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');
        const noConfirmation = await send(
          'post',
          `${c.path}/cancel`,
          c.cookie,
          {
            revision: c.revision,
          },
        ).expect(409);
        expect(noConfirmation.body.error.code).toBe(
          'ONBOARDING_INVALID_TRANSITION',
        );
        await send('post', `${c.path}/cancel`, c.cookie, {
          revision: c.revision,
          confirmNotDelivered: 'yes',
        }).expect(400);

        const results = await Promise.all([
          send('post', `${c.path}/cancel`, c.cookie, {
            revision: c.revision,
            confirmNotDelivered: true,
          }),
          send('post', `${c.path}/cancel`, c.cookie, {
            revision: c.revision,
            confirmNotDelivered: true,
          }),
        ]);
        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        const cancelled = results.find((r) => r.status === 200)!;
        expect(cancelled.body.data).toMatchObject({
          status: 'CANCELLED',
          deliveredAt: null,
          demoHistory: { purged: true, removedAt: expect.any(String) },
        });
        expect(await caseAudit(c.id, 'onboarding.cancelled')).toHaveLength(1);
        expect(await caseAudit(c.id, 'onboarding.delivered')).toHaveLength(0);
        expect(await leadState(lead.id)).toMatchObject({
          status: 'NEW',
          statusVersion: 0,
        });
        // Terminal CANCELLED releases the one-open-case-per-lead slot; no demo token is reused.
        const replacementCase = await send(
          'post',
          '/onboarding-cases',
          c.cookie,
          {
            leadId: lead.id,
          },
        ).expect(201);
        expect(replacementCase.body.data).toMatchObject({
          status: 'DRAFT',
          lead: { id: lead.id },
        });
      }, 15_000);
    });

    describe('mode first: DEMO short path, mode switching and list removal (PO 2026-11-23)', () => {
      const unique = (prefix: string) =>
        `${prefix} ${tag} ${randomUUID().slice(0, 8)}`;
      const casePath = (id: string) => `/onboarding-cases/${id}`;
      const auditOf = (caseId: string) =>
        prisma.platformAuditLog.findMany({
          where: { details: { path: ['caseId'], equals: caseId } },
          orderBy: { createdAt: 'asc' },
          select: { action: true, details: true },
        });
      const listed = async (cookie: string, search: string, archived = false) =>
        (
          await get(
            `/onboarding-cases?search=${encodeURIComponent(search)}${archived ? '&archived=true' : ''}`,
            cookie,
          ).expect(200)
        ).body as {
          data: {
            id: string;
            revision: number;
            removal: Record<string, unknown>;
          }[];
          meta: { total: number };
        };
      const remove = (
        cookie: string | null,
        id: string,
        body: Record<string, unknown>,
        origin: string | null = platformOrigin,
      ) => send('post', `${casePath(id)}/remove`, cookie, body, origin);

      /** A DEMO with nothing but its label, kind and duration: no customer, contact, branch or menu data. */
      async function demoOnly(cookie: string, label: string, leadId?: string) {
        const created = await send(
          'post',
          '/onboarding-cases',
          cookie,
          leadId ? { leadId } : {},
        ).expect(201);
        const id = created.body.data.id as string;
        const saved = await send('patch', casePath(id), cookie, {
          revision: created.body.data.revision,
          mode: 'DEMO',
          details: { restaurant: { name: label } },
          modeConfig: { demoKind: 'sweets', demoHours: 4 },
        }).expect(200);
        return {
          id,
          view: saved.body.data,
          revision: saved.body.data.revision as number,
        };
      }

      it('submits and provisions a DEMO without any customer details (no fake data)', async () => {
        const cookie = await platformLogin(await addAdmin());
        const label = unique('Demo only');
        const c = await demoOnly(cookie, label);
        expect(c.view.problems).toEqual({ customer: [], mode: [], menu: [] });
        expect(c.view.completedSteps).toEqual(['mode']);
        expect(c.view.details.owner).toEqual({
          fullName: null,
          phone: null,
          email: null,
          facebookUrl: null,
          additionalContact: null,
        });
        expect(c.view.details.acquisition).toBeNull();
        expect(c.view.details.restaurant.branchName).toBeNull();

        const submitted = await send(
          'post',
          `${casePath(c.id)}/submit-for-review`,
          cookie,
          { revision: c.revision },
        ).expect(200);
        expect(submitted.body.data.status).toBe('READY_FOR_REVIEW');
        const provisioned = await send(
          'post',
          `${casePath(c.id)}/provision`,
          cookie,
          {
            revision: submitted.body.data.revision,
            provisioningKey: randomUUID(),
          },
        ).expect(200);
        const row = await prisma.onboardingCase.findUniqueOrThrow({
          where: { id: c.id },
        });
        if (row.demoId) fixtures.demoIds.push(row.demoId);
        expect(provisioned.body.data).toMatchObject({
          status: 'READY',
          mode: 'DEMO',
          demoState: 'ACTIVE',
          demoHistory: { kind: 'sweets', label, packageName: null },
          ownerPasswordRequired: false,
        });
        expect(provisioned.body.data.demoLink).toEqual(expect.any(String));
        // Only the demo exists: no real restaurant for that label, no owner account invented.
        expect(
          await prisma.restaurant.count({
            where: { name: label, isDemo: false },
          }),
        ).toBe(0);
        expect(row.restaurantId).toBeNull();
      }, 15_000);

      it('refuses a DEMO without a label on edit, submit and provisioning', async () => {
        const cookie = await platformLogin(await addAdmin());
        const created = await send(
          'post',
          '/onboarding-cases',
          cookie,
          {},
        ).expect(201);
        const id = created.body.data.id as string;
        const saved = await send('patch', casePath(id), cookie, {
          revision: 1,
          mode: 'DEMO',
          details: { restaurant: { name: '   ' } },
          modeConfig: { demoKind: 'cafe', demoHours: 24 },
        }).expect(200);
        expect(saved.body.data.problems.mode).toEqual(['DEMO_LABEL_INVALID']);
        expect(saved.body.data.completedSteps).toEqual([]);
        const submit = await send(
          'post',
          `${casePath(id)}/submit-for-review`,
          cookie,
          { revision: saved.body.data.revision },
        ).expect(422);
        expect(submit.body.error.problems).toEqual(['DEMO_LABEL_INVALID']);
        // Even a case forced past review cannot create a demo without its label.
        await prisma.onboardingCase.update({
          where: { id },
          data: { status: 'READY_FOR_REVIEW' },
        });
        const current = await prisma.onboardingCase.findUniqueOrThrow({
          where: { id },
        });
        const final = await send('post', `${casePath(id)}/provision`, cookie, {
          revision: current.revision,
          provisioningKey: randomUUID(),
        }).expect(422);
        expect(final.body.error.problems).toEqual(['DEMO_LABEL_INVALID']);
        expect(
          (await prisma.onboardingCase.findUniqueOrThrow({ where: { id } }))
            .demoId,
        ).toBeNull();
      });

      it('keeps the lead association of a DEMO without requiring the lead contact details', async () => {
        const cookie = await platformLogin(await addAdmin());
        const lead = await addLead(`demo-lead-${randomUUID()}@example.test`);
        const created = await send('post', '/onboarding-cases', cookie, {
          leadId: lead.id,
        }).expect(201);
        const id = created.body.data.id as string;
        const saved = await send('patch', casePath(id), cookie, {
          revision: 1,
          mode: 'DEMO',
          details: { owner: { fullName: null, email: null, phone: null } },
          modeConfig: { demoKind: 'restaurant', demoHours: 24 },
        }).expect(200);
        // The label is the lead's restaurant name, prefilled; nothing else is needed.
        expect(saved.body.data.details.restaurant.name).toBe(
          `Lead Bistro ${tag}`,
        );
        expect(saved.body.data.completedSteps).toEqual(['mode']);
        expect(saved.body.data.lead).toMatchObject({ id: lead.id });
        await send('post', `${casePath(id)}/submit-for-review`, cookie, {
          revision: saved.body.data.revision,
        }).expect(200);
        expect(
          await prisma.signupLead.findUniqueOrThrow({
            where: { id: lead.id },
            select: { status: true, statusVersion: true },
          }),
        ).toEqual({ status: 'NEW', statusVersion: 0 });
      });

      it('switching modes keeps compatible draft data, clears the package and re-applies the right rules', async () => {
        const cookie = await platformLogin(await addAdmin());
        const pkg = await addPackage();
        const created = await send(
          'post',
          '/onboarding-cases',
          cookie,
          {},
        ).expect(201);
        const id = created.body.data.id as string;
        const email = `switch-${randomUUID()}@example.test`;
        let res = await send('patch', casePath(id), cookie, {
          revision: 1,
          mode: 'REAL',
          details: step1(unique('Switch Bistro'), email),
          modeConfig: { packageId: pkg.id },
        }).expect(200);
        expect(res.body.data.completedSteps).toEqual(['customer', 'mode']);

        res = await send('patch', casePath(id), cookie, {
          revision: res.body.data.revision,
          mode: 'DEMO',
          modeConfig: { demoKind: 'cafe', demoHours: 72 },
        }).expect(200);
        expect(res.body.data.modeConfig.packageId).toBeNull();
        expect(res.body.data.details.owner.email).toBe(email);
        expect(res.body.data.completedSteps).toEqual(['mode']);
        expect(res.body.data.problems.customer).toEqual([]);

        // Back to REAL: the kept customer details count again; the package must be chosen again.
        res = await send('patch', casePath(id), cookie, {
          revision: res.body.data.revision,
          mode: 'REAL',
        }).expect(200);
        expect(res.body.data.completedSteps).toEqual(['customer']);
        expect(res.body.data.problems.mode).toEqual(['PACKAGE_REQUIRED']);
        expect(res.body.data.modeConfig.demoKind).toBe('cafe');

        // A REAL case with broken customer data is refused, the same data is irrelevant for a DEMO.
        res = await send('patch', casePath(id), cookie, {
          revision: res.body.data.revision,
          details: { owner: { email: null } },
          modeConfig: { packageId: pkg.id },
        }).expect(200);
        const realSubmit = await send(
          'post',
          `${casePath(id)}/submit-for-review`,
          cookie,
          { revision: res.body.data.revision },
        ).expect(422);
        expect(realSubmit.body.error.problems).toContain('OWNER_EMAIL_INVALID');
        res = await send('patch', casePath(id), cookie, {
          revision: res.body.data.revision,
          mode: 'DEMO',
        }).expect(200);
        await send('post', `${casePath(id)}/submit-for-review`, cookie, {
          revision: res.body.data.revision,
        }).expect(200);
      });

      it('removes a routine draft from the active list without deleting it, and restores it', async () => {
        const cookie = await platformLogin(await addAdmin());
        const name = unique('Routine Remove');
        const created = await send(
          'post',
          '/onboarding-cases',
          cookie,
          {},
        ).expect(201);
        const id = created.body.data.id as string;
        const saved = await send('patch', casePath(id), cookie, {
          revision: 1,
          details: { restaurant: { name } },
        }).expect(200);
        const before = await listed(cookie, name);
        expect(before.data).toHaveLength(1);
        expect(before.data[0].removal).toEqual({
          allowed: true,
          action: 'CANCEL_AND_ARCHIVE',
          impacts: [],
          confirmNotDelivered: false,
        });

        // Platform authorization and CSRF apply.
        expect(
          (await remove(null, id, { revision: 2, acknowledgedImpacts: [] }))
            .status,
        ).toBe(401);
        expect(
          (
            await remove(
              cookie,
              id,
              { revision: 2, acknowledgedImpacts: [] },
              'http://evil.example.test',
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await remove(cookie, id, {
              revision: 2,
              acknowledgedImpacts: ['NOT_AN_IMPACT'],
            })
          ).status,
        ).toBe(400);
        // A stale revision changes nothing.
        const stale = await remove(cookie, id, {
          revision: 1,
          acknowledgedImpacts: [],
        }).expect(409);
        expect(stale.body.error.code).toBe('ONBOARDING_REVISION_CONFLICT');

        const removed = await remove(cookie, id, {
          revision: saved.body.data.revision,
          acknowledgedImpacts: [],
        }).expect(200);
        expect(removed.body.data).toMatchObject({
          id,
          status: 'CANCELLED',
          archivedAt: expect.any(String),
        });
        expect((await listed(cookie, name)).data).toHaveLength(0);
        const archived = await listed(cookie, name, true);
        expect(archived.data.map((item) => item.id)).toEqual([id]);
        expect(archived.data[0].removal).toEqual({
          allowed: false,
          refusal: 'ALREADY_ARCHIVED',
        });
        const row = await prisma.onboardingCase.findUniqueOrThrow({
          where: { id },
        });
        expect(row).toMatchObject({
          status: 'CANCELLED',
          restaurantName: name,
        });
        expect(row.cancelledAt).not.toBeNull();
        expect(row.archivedByAdminId).not.toBeNull();

        // A retried request whose answer was lost is answered idempotently, without a second audit entry.
        await remove(cookie, id, {
          revision: saved.body.data.revision,
          acknowledgedImpacts: [],
        }).expect(200);
        expect((await auditOf(id)).map((entry) => entry.action)).toEqual([
          'onboarding.created',
          'onboarding.cancelled',
          'onboarding.archived',
        ]);
        expect((await auditOf(id))[1].details).toMatchObject({
          reason: 'REMOVED_FROM_LIST',
          from: 'DRAFT',
        });

        const staleRestore = await send(
          'post',
          `${casePath(id)}/restore`,
          cookie,
          {
            revision: saved.body.data.revision,
          },
        ).expect(409);
        expect(staleRestore.body.error.code).toBe(
          'ONBOARDING_REVISION_CONFLICT',
        );
        const restored = await send('post', `${casePath(id)}/restore`, cookie, {
          revision: row.revision,
        }).expect(200);
        expect(restored.body.data).toMatchObject({
          status: 'CANCELLED',
          archivedAt: null,
        });
        expect(
          (await listed(cookie, name)).data.map((item) => item.id),
        ).toEqual([id]);
        const again = await send('post', `${casePath(id)}/restore`, cookie, {
          revision: restored.body.data.revision,
        }).expect(409);
        expect(again.body.error.code).toBe('ONBOARDING_INVALID_TRANSITION');
        expect((await auditOf(id)).at(-1)?.action).toBe('onboarding.restored');
      });

      it('requires explicit acknowledgement of a linked lead and a submitted review; the lead is untouched and freed', async () => {
        const cookie = await platformLogin(await addAdmin());
        const pkg = await addPackage();
        const lead = await addLead(`remove-lead-${randomUUID()}@example.test`);
        const created = await send('post', '/onboarding-cases', cookie, {
          leadId: lead.id,
        }).expect(201);
        const id = created.body.data.id as string;
        const name = unique('Lead Remove');
        const saved = await send('patch', casePath(id), cookie, {
          revision: 1,
          mode: 'REAL',
          details: step1(name, `remove-${randomUUID()}@example.test`),
          modeConfig: { packageId: pkg.id },
        }).expect(200);
        const submitted = await send(
          'post',
          `${casePath(id)}/submit-for-review`,
          cookie,
          { revision: saved.body.data.revision },
        ).expect(200);
        const revision = submitted.body.data.revision as number;
        expect((await listed(cookie, name)).data[0].removal).toMatchObject({
          allowed: true,
          impacts: ['LINKED_LEAD', 'SUBMITTED'],
        });

        for (const acknowledgedImpacts of [[], ['LINKED_LEAD']]) {
          const refused = await remove(cookie, id, {
            revision,
            acknowledgedImpacts,
          }).expect(409);
          expect(refused.body.error).toMatchObject({
            code: 'ONBOARDING_REMOVE_CONFIRMATION_REQUIRED',
            details: { impacts: ['LINKED_LEAD', 'SUBMITTED'] },
          });
        }
        expect(
          await prisma.onboardingCase.findUniqueOrThrow({ where: { id } }),
        ).toMatchObject({
          status: 'READY_FOR_REVIEW',
          revision,
          archivedAt: null,
        });

        await remove(cookie, id, {
          revision,
          acknowledgedImpacts: ['LINKED_LEAD', 'SUBMITTED'],
        }).expect(200);
        expect(
          await prisma.signupLead.findUniqueOrThrow({
            where: { id: lead.id },
            select: { status: true, statusVersion: true },
          }),
        ).toEqual({ status: 'NEW', statusVersion: 0 });
        await send('post', '/onboarding-cases', cookie, {
          leadId: lead.id,
        }).expect(201);
      });

      it('lets exactly one of two concurrent removals or a removal and an edit win', async () => {
        const cookie = await platformLogin(await addAdmin());
        const twice = await send(
          'post',
          '/onboarding-cases',
          cookie,
          {},
        ).expect(201);
        const twiceId = twice.body.data.id as string;
        const results = await Promise.all([
          remove(cookie, twiceId, {
            revision: 1,
            acknowledgedImpacts: [],
          }),
          remove(cookie, twiceId, {
            revision: 1,
            acknowledgedImpacts: [],
          }),
        ]);
        expect(results.map((r) => r.status)).toEqual([200, 200]);
        expect(
          (await auditOf(twiceId)).filter(
            (e) => e.action === 'onboarding.archived',
          ),
        ).toHaveLength(1);

        const raced = await send(
          'post',
          '/onboarding-cases',
          cookie,
          {},
        ).expect(201);
        const racedId = raced.body.data.id as string;
        const [removal, edit] = await Promise.all([
          remove(cookie, racedId, {
            revision: 1,
            acknowledgedImpacts: [],
          }),
          send('patch', casePath(racedId), cookie, {
            revision: 1,
            details: { restaurant: { name: 'Edited meanwhile' } },
          }),
        ]);
        expect([removal.status, edit.status].sort()).toEqual([200, 409]);
        const row = await prisma.onboardingCase.findUniqueOrThrow({
          where: { id: racedId },
        });
        if (removal.status === 200) expect(row.status).toBe('CANCELLED');
        else expect(row).toMatchObject({ status: 'DRAFT', archivedAt: null });
      });

      it('refuses active provisioning and pending handoff, archives delivered history only, and keeps the purged-demo rule', async () => {
        const cookie = await platformLogin(await addAdmin());
        const fresh = async () =>
          (await send('post', '/onboarding-cases', cookie, {}).expect(201)).body
            .data.id as string;
        const revisionOf = async (id: string) =>
          (await prisma.onboardingCase.findUniqueOrThrow({ where: { id } }))
            .revision;

        const provisioning = await fresh();
        await prisma.onboardingCase.update({
          where: { id: provisioning },
          data: { status: 'PROVISIONING', mode: 'REAL' },
        });
        const busy = await remove(cookie, provisioning, {
          revision: await revisionOf(provisioning),
          acknowledgedImpacts: [...['LINKED_LEAD', 'SUBMITTED']],
        }).expect(409);
        expect(busy.body.error).toMatchObject({
          code: 'ONBOARDING_REMOVE_REFUSED',
          details: { reason: 'PROVISIONING_ACTIVE' },
        });

        const restaurant = await addOwnedRestaurant(
          unique('Delivered Bistro'),
          `delivered-${randomUUID()}@example.test`,
        );
        const pending = await fresh();
        await prisma.onboardingCase.update({
          where: { id: pending },
          data: {
            status: 'READY',
            mode: 'REAL',
            restaurantId: restaurant.id,
            restaurantProvisionedAt: new Date(),
          },
        });
        expect(
          (
            await remove(cookie, pending, {
              revision: await revisionOf(pending),
              acknowledgedImpacts: [],
            }).expect(409)
          ).body.error.details,
        ).toEqual({ reason: 'HANDOFF_PENDING' });

        const delivered = await fresh();
        await prisma.onboardingCase.update({
          where: { id: delivered },
          data: {
            status: 'DELIVERED',
            deliveredAt: new Date(),
            mode: 'REAL',
            restaurantId: restaurant.id,
            restaurantProvisionedAt: new Date(),
          },
        });
        const needAck = await remove(cookie, delivered, {
          revision: await revisionOf(delivered),
          acknowledgedImpacts: [],
        }).expect(409);
        expect(needAck.body.error.details).toEqual({
          impacts: ['DELIVERED', 'RESTAURANT_KEPT'],
        });
        const archivedDelivered = await remove(cookie, delivered, {
          revision: await revisionOf(delivered),
          acknowledgedImpacts: ['DELIVERED', 'RESTAURANT_KEPT'],
        }).expect(200);
        expect(archivedDelivered.body.data).toMatchObject({
          status: 'DELIVERED',
          archivedAt: expect.any(String),
        });
        // The delivered restaurant, its owner membership and the case history all stay.
        expect(
          await prisma.restaurant.findUniqueOrThrow({
            where: { id: restaurant.id },
          }),
        ).toMatchObject({ status: 'ACTIVE' });
        expect(
          await prisma.restaurantMembership.count({
            where: { restaurantId: restaurant.id, role: 'OWNER' },
          }),
        ).toBe(1);
        expect(
          await prisma.onboardingCase.findUniqueOrThrow({
            where: { id: delivered },
          }),
        ).toMatchObject({
          restaurantId: restaurant.id,
          deliveredAt: expect.any(Date),
        });

        const purged = await fresh();
        await prisma.onboardingCase.update({
          where: { id: purged },
          data: {
            status: 'READY',
            mode: 'DEMO',
            demoHistory: {
              kind: 'cafe',
              label: 'Gone demo',
              packageName: null,
              createdAt: new Date().toISOString(),
              expiresAt: new Date().toISOString(),
            },
            demoRemovedAt: new Date(),
          },
        });
        const noAssertion = await remove(cookie, purged, {
          revision: await revisionOf(purged),
          acknowledgedImpacts: ['DEMO_PURGED'],
        }).expect(409);
        expect(noAssertion.body.error.code).toBe(
          'ONBOARDING_REMOVE_CONFIRMATION_REQUIRED',
        );
        await remove(cookie, purged, {
          revision: await revisionOf(purged),
          acknowledgedImpacts: ['DEMO_PURGED'],
          confirmNotDelivered: true,
        }).expect(200);
        const purgedAudit = await auditOf(purged);
        expect(
          purgedAudit.find((entry) => entry.action === 'onboarding.cancelled')
            ?.details,
        ).toMatchObject({
          reason: 'DEMO_PURGED_UNDELIVERED',
          confirmedNoHandoff: true,
        });

        // The database itself refuses to hide an open case.
        const open = await fresh();
        await expect(
          prisma.onboardingCase.update({
            where: { id: open },
            data: { archivedAt: new Date() },
          }),
        ).rejects.toThrow();
      }, 15_000);

      it('keeps pagination consistent after a removal (no stale rows)', async () => {
        const cookie = await platformLogin(await addAdmin());
        const marker = unique('Paged');
        const ids: string[] = [];
        for (let n = 0; n < 3; n += 1) {
          const created = await send(
            'post',
            '/onboarding-cases',
            cookie,
            {},
          ).expect(201);
          await send(
            'patch',
            casePath(created.body.data.id as string),
            cookie,
            {
              revision: 1,
              details: { restaurant: { name: `${marker} ${n}` } },
            },
          ).expect(200);
          ids.push(created.body.data.id as string);
        }
        const page = (n: number) =>
          get(
            `/onboarding-cases?search=${encodeURIComponent(marker)}&pageSize=2&page=${n}`,
            cookie,
          ).expect(200);
        expect((await page(1)).body.meta.total).toBe(3);
        const target = (await page(2)).body.data[0] as {
          id: string;
          revision: number;
        };
        await remove(cookie, target.id, {
          revision: target.revision,
          acknowledgedImpacts: [],
        }).expect(200);
        const first = await page(1);
        const second = await page(2);
        expect(first.body.meta.total).toBe(2);
        expect(second.body.data).toHaveLength(0);
        expect(
          (first.body.data as { id: string }[]).map((item) => item.id),
        ).not.toContain(target.id);
      });
    });
  });
});
