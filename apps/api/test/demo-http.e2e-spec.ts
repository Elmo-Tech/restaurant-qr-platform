/* eslint-disable @typescript-eslint/no-unsafe-member-access -- loosely typed JSON response bodies */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import type { EnvConfig } from './../src/config/env.schema';
import { PrismaService } from './../src/database/prisma.service';
import { DemoService } from './../src/demo/demo.service';
import { NotADemoError, purgeDemoRestaurant } from './../src/demo/demo-purge';
import { resolveUploadDir } from './../src/storage/upload-dir';

/**
 * Temporary demo restaurants (DEC-060), end to end: the Platform console creates one from the template, the prospect
 * enters by the secret link, the Backend restricts what a demo may do, and after the end the demo is locked and then
 * removed COMPLETELY (every table that has a restaurant_id) without touching any other restaurant.
 */
const PASSWORD = 'Platform-Admin-Pw-1';

describe('Temporary demo restaurants (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let demos: DemoService;
  let platformOrigin: string;
  let webOrigin: string;
  let platformCookie: string;
  const adminEmails: string[] = [];
  const created: string[] = [];

  type Obj = Record<string, any>;
  const body = (res: request.Response): Obj => res.body as Obj;

  beforeAll(async () => {
    process.env.PLATFORM_ORIGIN ??= 'http://localhost:3001';
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
    demos = app.get(DemoService);
    const config = app.get<ConfigService<EnvConfig, true>>(ConfigService);
    platformOrigin = new URL(
      config.get('PLATFORM_ORIGIN', { infer: true }) ?? '',
    ).origin;
    webOrigin = new URL(config.get('CORS_ORIGIN', { infer: true })).origin;
    platformCookie = await platformLogin(
      config.get('PLATFORM_SESSION_COOKIE_NAME', { infer: true }),
    );
  });

  afterAll(async () => {
    for (const id of created) {
      await demos.purge(id).catch(() => undefined);
    }
    for (const email of adminEmails) {
      await prisma.platformAuditLog.deleteMany({
        where: { adminEmail: email },
      });
      await prisma.platformSession.deleteMany({
        where: { admin: { emailNormalized: email } },
      });
      await prisma.platformAdmin.deleteMany({
        where: { emailNormalized: email },
      });
    }
    await app.close();
  });

  async function platformLogin(cookieName: string): Promise<string> {
    const email = `demo-admin-${randomUUID()}@example.test`;
    adminEmails.push(email);
    await prisma.platformAdmin.create({
      data: {
        email,
        emailNormalized: email,
        passwordHash: await app
          .get(PasswordHasherService)
          .hashPassword(PASSWORD),
        displayName: 'Demo Admin',
        status: 'ACTIVE',
      },
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform/auth/login')
      .set('Origin', platformOrigin)
      .send({ email, password: PASSWORD })
      .expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const pair = cookies.find((c) => c.startsWith(`${cookieName}=`));
    if (!pair) throw new Error('no platform session cookie');
    return pair.split(';')[0];
  }

  const platform = (
    method: 'get' | 'post' | 'delete',
    path: string,
    payload?: Record<string, unknown>,
  ) =>
    request(app.getHttpServer())
      [method](`/api/v1/platform${path}`)
      .set('Cookie', platformCookie)
      .set('Origin', platformOrigin)
      .send(payload ?? {});

  async function createDemo(
    label = 'e2e prospect',
    hours = 2,
  ): Promise<{ id: string; token: string; link: string }> {
    const res = await platform('post', '/demos', { label, hours }).expect(201);
    const { demo, link } = body(res).data as { demo: Obj; link: string };
    created.push(demo.id as string);
    return { id: demo.id as string, link, token: link.split('/demo/')[1] };
  }

  const enter = (token: string) =>
    request(app.getHttpServer())
      .post('/api/v1/demo/enter')
      .set('Origin', webOrigin)
      .send({ token });

  async function sessionCookieOf(token: string): Promise<string> {
    const res = await enter(token).expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    return cookies[0].split(';')[0];
  }

  /** Row counts of every table that has a restaurant_id, for every restaurant EXCEPT `excluding`. */
  async function otherRestaurantsSnapshot(
    excluding: string,
  ): Promise<Record<string, number>> {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name::text FROM information_schema.columns WHERE column_name = 'restaurant_id' AND table_schema = 'public' ORDER BY 1`,
    );
    const out: Record<string, number> = {};
    for (const { table_name } of tables) {
      const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "${table_name}" WHERE restaurant_id <> $1::uuid`,
        excluding,
      );
      out[table_name] = rows[0].n;
    }
    return out;
  }

  async function rowsLeftFor(
    restaurantId: string,
  ): Promise<Record<string, number>> {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name::text FROM information_schema.columns WHERE column_name = 'restaurant_id' AND table_schema = 'public' ORDER BY 1`,
    );
    const left: Record<string, number> = {};
    for (const { table_name } of tables) {
      const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "${table_name}" WHERE restaurant_id = $1::uuid`,
        restaurantId,
      );
      if (rows[0].n > 0) left[table_name] = rows[0].n;
    }
    return left;
  }

  it('creates a complete bilingual demo from the template and keeps it out of the platform numbers', async () => {
    const { id } = await createDemo();
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id },
      include: { locales: true },
    });
    expect(restaurant).toMatchObject({
      isDemo: true,
      status: 'ACTIVE',
      defaultLocale: 'ar',
      currencyCode: 'EGP',
      whatsappOrderingEnabled: false,
      whatsappNumber: null,
    });
    expect(restaurant.demoExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(restaurant.locales.map((l) => l.locale).sort()).toEqual([
      'ar',
      'en',
    ]);
    expect(restaurant.logoAssetPath).toMatch(/^\/media\/demo-template-/);

    const [
      categories,
      products,
      variants,
      groups,
      zones,
      tables,
      qrs,
      branches,
      announcements,
      suggestions,
      setup,
    ] = await Promise.all([
      prisma.category.count({ where: { restaurantId: id } }),
      prisma.product.count({ where: { restaurantId: id } }),
      prisma.productVariant.count({ where: { restaurantId: id } }),
      prisma.modifierGroup.count({ where: { restaurantId: id } }),
      prisma.deliveryZone.count({ where: { restaurantId: id } }),
      prisma.table.count({ where: { restaurantId: id } }),
      prisma.qrCode.count({ where: { restaurantId: id } }),
      prisma.branch.count({ where: { restaurantId: id } }),
      prisma.restaurantAnnouncement.count({ where: { restaurantId: id } }),
      prisma.productSuggestion.count({ where: { restaurantId: id } }),
      prisma.restaurantSetup.count({ where: { restaurantId: id } }),
    ]);
    expect({
      categories,
      products,
      branches,
      zones,
      tables,
      announcements,
    }).toEqual({
      categories: 7,
      products: 24,
      branches: 2,
      zones: 4,
      tables: 12,
      announcements: 2,
    });
    expect(variants).toBeGreaterThan(10);
    expect(groups).toBeGreaterThan(8);
    expect(qrs).toBe(tables + 1); // one per table and the restaurant's generic QR
    expect(suggestions).toBeGreaterThan(5);
    expect(setup).toBe(0);

    // every product is bilingual and has a photo that exists on disk
    const rows = await prisma.product.findMany({
      where: { restaurantId: id },
      include: { translations: true },
    });
    const uploadDir = resolveUploadDir(
      app
        .get<ConfigService<EnvConfig, true>>(ConfigService)
        .get('UPLOAD_LOCAL_DIR', { infer: true }),
    );
    for (const product of rows) {
      expect(product.translations.map((t) => t.locale).sort()).toEqual([
        'ar',
        'en',
      ]);
      expect(
        existsSync(
          join(
            uploadDir,
            product.primaryImageAssetPath!.replace('/media/', ''),
          ),
        ),
      ).toBe(true);
    }

    // the platform's own list and numbers do not see it
    const list = await platform('get', '/restaurants?pageSize=100').expect(200);
    expect((body(list).data.items as Obj[]).some((r) => r.id === id)).toBe(
      false,
    );
    const demoList = await platform('get', '/demos').expect(200);
    expect((body(demoList).data as Obj[]).some((d) => d.id === id)).toBe(true);
    await demos.purge(id);
  });

  it('enters by the secret link, only while the demo is open, and shows the countdown in the sign-in context', async () => {
    const { id, token } = await createDemo();
    await enter('x'.repeat(43)).expect(404);
    await enter('short').expect(400);

    const entered = await enter(token).expect(200);
    expect(body(entered).data.redirectTo).toBe(`/staff/restaurants/${id}`);
    const cookie = await sessionCookieOf(token);
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    const restaurant = body(me).data.memberships[0].restaurant as Obj;
    expect(restaurant).toMatchObject({
      id,
      name: 'Wayta Bistro',
      status: 'ACTIVE',
    });
    expect(
      new Date(restaurant.demoExpiresAt as string).getTime(),
    ).toBeGreaterThan(Date.now());
    expect(body(me).data.memberships[0].role).toBe('OWNER');
    expect(restaurant.features.MENU_IMPORT).toBe(false);

    // the session never outlives the demo
    const session = await prisma.authSession.findFirstOrThrow({
      where: { user: { memberships: { some: { restaurantId: id } } } },
    });
    const demoRow = await prisma.restaurant.findUniqueOrThrow({
      where: { id },
    });
    expect(session.expiresAt.getTime()).toBeLessThanOrEqual(
      demoRow.demoExpiresAt!.getTime(),
    );
    const link = await prisma.demoAccessLink.findFirstOrThrow({
      where: { restaurantId: id },
    });
    expect(link.useCount).toBeGreaterThan(0);
    // the secret itself is not stored
    expect(JSON.stringify(link)).not.toContain(token);
    await demos.purge(id);
  });

  it('blocks in the Backend what a demo must not do, and leaves the rest working', async () => {
    const { id, token } = await createDemo();
    const cookie = await sessionCookieOf(token);
    const call = (
      method: 'post' | 'patch' | 'put' | 'delete',
      path: string,
      payload: Record<string, unknown> = {},
    ) =>
      request(app.getHttpServer())
        [method](`/api/v1${path}`)
        .set('Cookie', cookie)
        .set('Origin', webOrigin)
        .send(payload);

    for (const [method, path] of [
      ['post', '/auth/change-password'],
      ['post', `/restaurants/${id}/invitations`],
      ['post', `/restaurants/${id}/logo`],
      ['post', `/restaurants/${id}/cover`],
      ['post', `/restaurants/${id}/menu-imports`],
      ['post', `/restaurants/${id}/subscription/requests`],
    ] as const) {
      const res = await call(method, path).expect(403);
      expect(body(res).error.code).toBe('DEMO_RESTRICTED');
    }
    const product = await prisma.product.findFirstOrThrow({
      where: { restaurantId: id },
    });
    const image = await call(
      'post',
      `/restaurants/${id}/products/${product.id}/image`,
    ).expect(403);
    expect(body(image).error.code).toBe('DEMO_RESTRICTED');

    // ... while the dashboard works: edit the contact (this is where the visitor enters a WhatsApp number)
    const contact = await call('patch', `/restaurants/${id}/contact`, {
      whatsapp: '+201012345678',
    }).expect(200);
    expect(JSON.stringify(body(contact))).toContain('201012345678');
    // and a restricted route of a NORMAL restaurant is not touched by the demo rules
    const normal = await prisma.restaurant.findFirstOrThrow({
      where: { isDemo: false },
    });
    const res = await call('post', `/restaurants/${normal.id}/logo`);
    expect(body(res).error?.code).not.toBe('DEMO_RESTRICTED');
    await demos.purge(id);
  });

  it('serves the guest menu of a demo, and stops serving it when it is locked', async () => {
    const { id } = await createDemo();
    const qr = await prisma.qrCode.findFirstOrThrow({
      where: { restaurantId: id, type: 'GENERIC' },
    });
    const open = await request(app.getHttpServer())
      .get(`/api/v1/public/qr/${qr.publicCode}/menu`)
      .expect(200);
    expect(JSON.stringify(body(open).data)).toContain('Wayta Bistro');
    await demos.lock(id);
    await request(app.getHttpServer())
      .get(`/api/v1/public/qr/${qr.publicCode}/menu`)
      .expect(404);
    await demos.purge(id);
  });

  it('extends a demo, issues a new link that replaces the old one, and refuses bad input', async () => {
    const { id, token } = await createDemo('extend me', 1);
    const before = await prisma.restaurant.findUniqueOrThrow({ where: { id } });
    const extended = await platform('post', `/demos/${id}/extend`, {
      hours: 24,
    }).expect(200);
    expect(
      new Date(body(extended).data.expiresAt as string).getTime() -
        before.demoExpiresAt!.getTime(),
    ).toBe(24 * 3600 * 1000);

    const fresh = await platform('post', `/demos/${id}/link`).expect(200);
    const newToken = (body(fresh).data.link as string).split('/demo/')[1];
    expect(newToken).not.toBe(token);
    await enter(token).expect(404);
    await enter(newToken).expect(200);

    await platform('post', `/demos/${id}/extend`, { hours: 0 }).expect(400);
    await platform('post', `/demos/${randomUUID()}/extend`, {
      hours: 1,
    }).expect(404);
    await platform('post', '/demos', { label: '', hours: 2 }).expect(422);
    await platform('post', '/demos', { label: 'x', hours: 100000 }).expect(400);
    // the console is protected
    await request(app.getHttpServer())
      .get('/api/v1/platform/demos')
      .expect(401);
    await demos.purge(id);
  });

  it('locks a demo when it ends, lets it be extended in the grace period, and removes it after', async () => {
    const { id, token } = await createDemo();
    const cookie = await sessionCookieOf(token);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200);

    // it ends now
    await prisma.restaurant.update({
      where: { id },
      data: { demoExpiresAt: new Date(Date.now() - 1000) },
    });
    const swept = await demos.sweep();
    expect(swept.locked).toBeGreaterThanOrEqual(1);
    expect(
      (await prisma.restaurant.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('SUSPENDED');
    await enter(token).expect(404); // the link is dead
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(401); // and the session

    // still in the grace period: extending opens it again
    const back = await demos.extend(id, 2);
    expect(back.outcome).toBe('ok');
    expect(
      (await prisma.restaurant.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('ACTIVE');
    await enter(token).expect(200);

    // past the grace period: removed
    await prisma.restaurant.update({
      where: { id },
      data: { demoExpiresAt: new Date(Date.now() - 3 * 3600 * 1000) },
    });
    const final = await demos.sweep();
    expect(final.removed).toBeGreaterThanOrEqual(1);
    expect(await prisma.restaurant.findUnique({ where: { id } })).toBeNull();
  });

  it('removes a demo completely and touches nothing else', async () => {
    const { id, token } = await createDemo('to remove', 3);
    await sessionCookieOf(token);
    const owners = await prisma.user.findMany({
      where: { memberships: { some: { restaurantId: id } } },
      select: { id: true },
    });
    expect(owners.length).toBe(1);
    const filesBefore = existsSync(
      join(
        resolveUploadDir(
          app
            .get<ConfigService<EnvConfig, true>>(ConfigService)
            .get('UPLOAD_LOCAL_DIR', { infer: true }),
        ),
        'demo-template-cover.jpg',
      ),
    );
    const others = await otherRestaurantsSnapshot(id);
    const usersBefore = await prisma.user.count({
      where: { id: { notIn: owners.map((o) => o.id) } },
    });
    const auditBefore = await prisma.platformAuditLog.count();

    await platform('delete', `/demos/${id}`).expect(204);

    expect(await prisma.restaurant.findUnique({ where: { id } })).toBeNull();
    // EVERY table that has a restaurant_id is empty for it: a table added later and forgotten would fail here
    expect(await rowsLeftFor(id)).toEqual({});
    expect(
      await prisma.user.count({
        where: { id: { in: owners.map((o) => o.id) } },
      }),
    ).toBe(0);
    expect(
      await prisma.authSession.count({
        where: { userId: { in: owners.map((o) => o.id) } },
      }),
    ).toBe(0);
    expect(
      await prisma.demoAccessLink.count({ where: { restaurantId: id } }),
    ).toBe(0);
    // nothing else changed: every other restaurant's rows, every other user, the template photos
    expect(await otherRestaurantsSnapshot(id)).toEqual(others);
    expect(
      await prisma.user.count({
        where: { id: { notIn: owners.map((o) => o.id) } },
      }),
    ).toBe(usersBefore);
    expect(filesBefore).toBe(true);
    // the audit trail of the removal stays, detached from the deleted restaurant
    expect(await prisma.platformAuditLog.count()).toBeGreaterThan(auditBefore);
    expect(
      await prisma.platformAuditLog.count({
        where: { action: 'platform.demo_removed', restaurantId: null },
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it('refuses to purge a restaurant that is not a demo, before deleting anything', async () => {
    const normal = await prisma.restaurant.findFirstOrThrow({
      where: { isDemo: false },
      select: { id: true },
    });
    const before = await rowsLeftFor(normal.id);
    await expect(
      prisma.$transaction((tx) => purgeDemoRestaurant(tx, normal.id)),
    ).rejects.toBeInstanceOf(NotADemoError);
    expect(await rowsLeftFor(normal.id)).toEqual(before);
    // and the console cannot reach it either: it is not listed as a demo
    await platform('delete', `/demos/${normal.id}`).expect(404);
    expect(
      await prisma.restaurant.findUnique({ where: { id: normal.id } }),
    ).not.toBeNull();
  });

  it('does not let the database constraint be bypassed: a restaurant is a demo with an expiry, or it is not', async () => {
    const normal = await prisma.restaurant.findFirstOrThrow({
      where: { isDemo: false },
      select: { id: true },
    });
    await expect(
      prisma.restaurant.update({
        where: { id: normal.id },
        data: { isDemo: true },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.restaurant.update({
        where: { id: normal.id },
        data: { demoLabel: 'x' },
      }),
    ).rejects.toThrow();
  });
});
