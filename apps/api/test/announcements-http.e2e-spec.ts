/* eslint-disable @typescript-eslint/no-unsafe-member-access --
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
import type { StarterRoleKind } from './../src/auth/permission/role-permissions';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PrismaService } from './../src/database/prisma.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/**
 * Restaurant announcements (DEC-042) against REAL PostgreSQL through the real Nest app: the
 * Staff write rules (languages, dates, the three-active limit, permissions, Tenant scope) and
 * what the Guest menu shows (live, in the Guest's language, only today's).
 *
 * Isolation: see `support/sandbox-guard.ts`; without TABLE_SESSION_IT_DATABASE_URL the
 * whole suite is skipped.
 */

const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const PASSWORD = 'correct horse battery staple';

interface Staff {
  email: string;
  cookie?: string;
}

interface World {
  restaurantId: string;
  branchId: string;
  zoneId: string;
  genericQr: string;
  tableQr: string;
  productId: string;
}

describeSandbox('Restaurant announcements (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hasher: PasswordHasherService;
  let origin = 'http://localhost:3000';

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
    origin = process.env.CORS_ORIGIN ?? origin;
  });

  afterAll(async () => {
    await app?.close();
  });

  // ---------------------------------------------------------------- fixtures

  async function seedWorld(label: string): Promise<World> {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `it-rest-${randomUUID()}`,
        name: `IT ${label}`,
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
        locales: {
          create: [
            { locale: 'en', isActive: true },
            { locale: 'ar', isActive: true },
          ],
        },
      },
    });
    const branch = await prisma.branch.create({
      data: {
        publicId: `branch-${randomUUID()}`,
        restaurantId: restaurant.id,
        name: `IT Branch ${label}`,
        status: 'ACTIVE',
        timezone: 'Etc/GMT-2',
      },
    });
    const zone = await prisma.deliveryZone.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        name: 'Zone A',
        deliveryFee: '10.00',
        minimumOrder: '0.00',
        status: 'ACTIVE',
        displayOrder: 0,
      },
    });
    const table = await prisma.table.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableNumber: `T-${randomUUID().slice(0, 6)}`,
        status: 'ACTIVE',
      },
    });
    const generic = await prisma.qrCode.create({
      data: {
        publicCode: `it-gqr-${randomUUID()}`,
        restaurantId: restaurant.id,
        type: 'GENERIC',
        status: 'ACTIVE',
      },
    });
    const tableQr = await prisma.qrCode.create({
      data: {
        publicCode: `it-tqr-${randomUUID()}`,
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        type: 'TABLE',
        status: 'ACTIVE',
      },
    });
    const menu = await prisma.menu.create({
      data: {
        restaurantId: restaurant.id,
        nameInternal: 'IT menu',
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
        translations: { create: { locale: 'en', name: 'IT Menu' } },
      },
    });
    const category = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        menuId: menu.id,
        status: 'ACTIVE',
        displayOrder: 0,
        translations: { create: { locale: 'en', name: 'IT Mains' } },
      },
    });
    const product = await prisma.product.create({
      data: {
        publicId: `product-${randomUUID()}`,
        restaurantId: restaurant.id,
        categoryId: category.id,
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        basePrice: '50.00',
        displayOrder: 0,
        allowCustomerNotes: false,
        featured: false,
        translations: { create: { locale: 'en', name: 'IT Burger' } },
      },
    });
    return {
      restaurantId: restaurant.id,
      branchId: branch.id,
      zoneId: zone.id,
      genericQr: generic.publicCode,
      tableQr: tableQr.publicCode,
      productId: product.id,
    };
  }

  async function addStaff(
    restaurantId: string,
    kind: StarterRoleKind,
    options: { allBranches?: boolean; branchIds?: string[] } = {},
  ): Promise<Staff> {
    const email = `it-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email,
        passwordHash: await hasher.hashPassword(PASSWORD),
        status: 'ACTIVE',
      },
    });
    const role = await ensureStarterRole(prisma, restaurantId, kind);
    const membership = await prisma.restaurantMembership.create({
      data: {
        restaurantId,
        userId: user.id,
        role: kind,
        roleId: role.id,
        status: 'ACTIVE',
        allBranches: options.allBranches ?? true,
      },
    });
    for (const branchId of options.branchIds ?? []) {
      await prisma.restaurantMembershipBranch.create({
        data: { restaurantMembershipId: membership.id, branchId },
      });
    }
    return { email };
  }

  async function login(staff: Staff): Promise<string> {
    if (staff.cookie) return staff.cookie;
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: staff.email, password: PASSWORD })
      .expect(200);
    const setCookie = response.headers['set-cookie'] as unknown as string[];
    const pair = setCookie.find((c) => c.startsWith('restaurant_session='));
    if (!pair) throw new Error('missing session cookie');
    staff.cookie = pair.split(';')[0];
    return staff.cookie;
  }

  // ================================================================== tests

  const url = (restaurantId: string, rest = '') =>
    `/api/v1/restaurants/${restaurantId}/announcements${rest}`;
  const today = (): string => new Date().toISOString().slice(0, 10);
  const daysFrom = (n: number): string =>
    new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  async function send(
    staff: Staff,
    method: 'post' | 'patch' | 'delete',
    path: string,
    body?: Record<string, unknown>,
  ) {
    const req = request(app.getHttpServer())
      [method](path)
      .set('Cookie', await login(staff))
      .set('Origin', origin);
    return body === undefined ? req : req.send(body);
  }

  it('creates, merges languages, validates and deletes', async () => {
    const world = await seedWorld('ann-staff');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = world.restaurantId;

    const created = await send(owner, 'post', url(r), {
      style: 'PROMO',
      texts: {
        en: '  🎉 Free   delivery today over 300 EGP ',
        ar: 'توصيل مجاني اليوم',
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      status: 'ACTIVE',
      style: 'PROMO',
      state: 'LIVE',
      startsOn: null,
      texts: {
        en: '🎉 Free delivery today over 300 EGP',
        ar: 'توصيل مجاني اليوم',
      },
    });
    const id = created.body.data.id as string;

    // default language is required; an inactive language is refused; dates must be ordered.
    expect(
      (await send(owner, 'post', url(r), { texts: { ar: 'مرحبا' } })).body.error
        .code,
    ).toBe('DEFAULT_TRANSLATION_REQUIRED');
    expect(
      (await send(owner, 'post', url(r), { texts: { en: 'x', fr: 'y' } })).body
        .error.code,
    ).toBe('LOCALE_NOT_ACTIVE');
    const badDates = await send(owner, 'post', url(r), {
      texts: { en: 'x' },
      startsOn: daysFrom(3),
      endsOn: daysFrom(1),
    });
    expect(badDates.status).toBe(422);
    expect(badDates.body.error.code).toBe('ANNOUNCEMENT_DATES_INVALID');
    expect(
      (
        await send(owner, 'post', url(r), {
          texts: { en: 'x' },
          startsOn: '2026-02-30',
        })
      ).status,
    ).toBe(422);
    expect(
      (await send(owner, 'post', url(r), { style: 'LOUD', texts: { en: 'x' } }))
        .status,
    ).toBe(400);

    // update merges: change one language, keep the other; removing the default is refused.
    const updated = await send(owner, 'patch', url(r, `/${id}`), {
      texts: { ar: null, en: 'Free delivery' },
      style: 'INFO',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.texts).toEqual({ en: 'Free delivery' });
    expect(updated.body.data.style).toBe('INFO');
    expect(
      (await send(owner, 'patch', url(r, `/${id}`), { texts: { en: '' } })).body
        .error.code,
    ).toBe('DEFAULT_TRANSLATION_REQUIRED');

    const list = await request(app.getHttpServer())
      .get(url(r))
      .set('Cookie', await login(owner))
      .expect(200);
    expect(list.body.data).toHaveLength(1);

    expect((await send(owner, 'delete', url(r, `/${id}`))).status).toBe(204);
    expect((await send(owner, 'delete', url(r, `/${id}`))).status).toBe(404);
    expect(
      (await send(owner, 'patch', url(r, '/not-a-uuid'), { style: 'INFO' }))
        .status,
    ).toBe(404);
  });

  it('allows three ACTIVE announcements at once', async () => {
    const world = await seedWorld('ann-limit');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = world.restaurantId;
    const ids: string[] = [];
    for (let i = 1; i <= 3; i += 1) {
      const res = await send(owner, 'post', url(r), {
        texts: { en: `Message ${i}` },
      });
      expect(res.status).toBe(201);
      ids.push(res.body.data.id as string);
    }
    const fourth = await send(owner, 'post', url(r), {
      texts: { en: 'Message 4' },
    });
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.code).toBe('ANNOUNCEMENT_LIMIT_REACHED');
    // An inactive one is fine, but switching it on is refused while three are active.
    const off = await send(owner, 'post', url(r), {
      texts: { en: 'Draft' },
      status: 'INACTIVE',
    });
    expect(off.status).toBe(201);
    expect(off.body.data.state).toBe('OFF');
    const on = await send(
      owner,
      'patch',
      url(r, `/${off.body.data.id as string}`),
      { status: 'ACTIVE' },
    );
    expect(on.status).toBe(409);
    // Switching one off frees a slot.
    await send(owner, 'patch', url(r, `/${ids[0]}`), {
      status: 'INACTIVE',
    }).then((res) => expect(res.status).toBe(200));
    expect(
      (
        await send(owner, 'patch', url(r, `/${off.body.data.id as string}`), {
          status: 'ACTIVE',
        })
      ).status,
    ).toBe(200);
  });

  it('needs restaurant.manage, CSRF and the right restaurant', async () => {
    const world = await seedWorld('ann-auth');
    const other = await seedWorld('ann-auth-other');
    const cashier = await addStaff(world.restaurantId, 'CASHIER');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    expect(
      (
        await send(cashier, 'post', url(world.restaurantId), {
          texts: { en: 'x' },
        })
      ).status,
    ).toBe(403);
    const noCsrf = await request(app.getHttpServer())
      .post(url(world.restaurantId))
      .set('Cookie', await login(owner))
      .send({ texts: { en: 'x' } });
    expect(noCsrf.status).toBe(403);
    // another restaurant's announcement is invisible and untouchable
    const theirs = await prisma.restaurantAnnouncement.create({
      data: {
        restaurantId: other.restaurantId,
        status: 'ACTIVE',
        style: 'INFO',
        translations: { create: { locale: 'en', text: 'Theirs' } },
      },
    });
    expect(
      (
        await send(owner, 'patch', url(world.restaurantId, `/${theirs.id}`), {
          style: 'WARNING',
        })
      ).status,
    ).toBe(404);
    expect(
      (await send(owner, 'delete', url(world.restaurantId, `/${theirs.id}`)))
        .status,
    ).toBe(404);
    expect(
      await prisma.restaurantAnnouncement.count({ where: { id: theirs.id } }),
    ).toBe(1);
  });

  it('the Guest menu shows only live announcements, in the Guest language, with fallback', async () => {
    const world = await seedWorld('ann-guest');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = world.restaurantId;
    await send(owner, 'post', url(r), {
      style: 'PROMO',
      texts: { en: 'Free delivery', ar: 'توصيل مجاني' },
    }).then((res) => expect(res.status).toBe(201));
    await send(owner, 'post', url(r), { texts: { en: 'English only' } }).then(
      (res) => expect(res.status).toBe(201),
    );
    await send(owner, 'post', url(r), {
      texts: { en: 'Switched off' },
      status: 'INACTIVE',
    }).then((res) => expect(res.status).toBe(201));
    // The limit counts ACTIVE ones only, so a third live one plus scheduled / expired ones cannot all be active:
    await prisma.restaurantAnnouncement.create({
      data: {
        restaurantId: r,
        status: 'ACTIVE',
        style: 'INFO',
        endsOn: new Date(`${daysFrom(-2)}T00:00:00.000Z`),
        translations: { create: { locale: 'en', text: 'Expired' } },
      },
    });

    const en = await request(app.getHttpServer())
      .get(`/api/v1/public/qr/${world.genericQr}/menu`)
      .expect(200);
    const english = en.body.data.context.announcements as {
      style: string;
      text: string;
    }[];
    expect(english.map((a) => a.text)).toEqual([
      'Free delivery',
      'English only',
    ]);
    expect(english[0].style).toBe('PROMO');

    const ar = await request(app.getHttpServer())
      .get(`/api/v1/public/qr/${world.genericQr}/menu?lang=ar`)
      .expect(200);
    expect(
      (ar.body.data.context.announcements as { text: string }[]).map(
        (a) => a.text,
      ),
    ).toEqual(['توصيل مجاني', 'English only']);

    // A scheduled one (starts in the future) is not shown yet; today's range is.
    await prisma.restaurantAnnouncement.updateMany({
      where: {
        restaurantId: r,
        status: 'ACTIVE',
        translations: { some: { text: 'Expired' } },
      },
      data: { status: 'INACTIVE' },
    });
    await send(owner, 'post', url(r), {
      texts: { en: 'Later' },
      startsOn: daysFrom(5),
    }).then((res) => expect(res.status).toBe(201));
    await send(owner, 'post', url(r), {
      texts: { en: 'Today only' },
      startsOn: today(),
      endsOn: today(),
      status: 'INACTIVE',
    }).then((res) => expect(res.status).toBe(201));
    const again = await request(app.getHttpServer())
      .get(`/api/v1/public/qr/${world.tableQr}/menu`)
      .expect(200);
    expect(
      (again.body.data.context.announcements as { text: string }[]).map(
        (a) => a.text,
      ),
    ).toEqual(['Free delivery', 'English only']);

    const staffList = await request(app.getHttpServer())
      .get(url(r))
      .set('Cookie', await login(owner))
      .expect(200);
    const states = Object.fromEntries(
      (staffList.body.data as { texts: { en: string }; state: string }[]).map(
        (a) => [a.texts.en, a.state],
      ),
    );
    expect(states).toMatchObject({
      'Free delivery': 'LIVE',
      'Switched off': 'OFF',
      Expired: 'OFF',
      Later: 'SCHEDULED',
    });
  });
});
