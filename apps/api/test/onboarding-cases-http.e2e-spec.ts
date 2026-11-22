/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
 * supertest exposes `response.body` as `any`; the assertions below read the JSON
 * envelope directly, exactly like the other HTTP e2e specs in this folder. */
import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PrismaService } from './../src/database/prisma.service';
import { OnboardingCasesService } from './../src/platform/onboarding/onboarding-cases.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/**
 * Owner onboarding cases (PROPOSED, milestones A1 + A2) against REAL PostgreSQL through the real Nest app:
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
    const { adminEmails, packageIds, leadIds, restaurantIds, userIds } =
      fixtures;
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
    await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
    for (const restaurantId of restaurantIds) {
      await prisma.restaurantLocale.deleteMany({ where: { restaurantId } });
      await prisma.restaurantMembershipBranch.deleteMany({
        where: { membership: { restaurantId } },
      });
      await prisma.restaurantMembership.deleteMany({ where: { restaurantId } });
      await prisma.restaurantRole.deleteMany({ where: { restaurantId } });
      await prisma.branch.deleteMany({ where: { restaurantId } });
      await prisma.restaurant.delete({ where: { id: restaurantId } });
    }
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
      expect(res.body.data.completedSteps).toEqual(['customer', 'mode']);

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
});
