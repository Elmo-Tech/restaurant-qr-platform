/* eslint-disable @typescript-eslint/no-unsafe-member-access -- Supertest response.body is untyped. */
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SCRATCH_URL } from './support/scratch-guard';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { PublicMenuService } from '../src/public/public-menu.service';
import { createQrPublicCode } from '../src/qr/qr-public-code';

/**
 * Real-Postgres tenant boundary regression:
 * - independent Restaurant + current/previous RestaurantSlug rows
 * - opaque QR IDs looked up in actual Prisma queries
 * - real Nest HTTP route + real PublicRestaurantHostGuard
 *
 * The Menu aggregate itself is stubbed; no published menus/orders or customer
 * data are needed to prove that the guard blocks foreign tenant QRs before
 * the underlying public service is invoked.
 *
 * SCRATCH_URL is required and validated by support/scratch-guard: a LOCAL
 * database with "scratch" in its name. Never run against production.
 */
const describeScratch = SCRATCH_URL ? describe : describe.skip;

describeScratch('Restaurant subdomain isolation (real disposable PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaService;
  const createdRestaurantIds: string[] = [];
  const slugSuffix = randomUUID().replace(/-/g, '').slice(0, 10);
  const slugA = `wayta-a-${slugSuffix}`;
  const slugB = `wayta-b-${slugSuffix}`;
  const formerSlugA = `wayta-old-${slugSuffix}`;
  const qrA = createQrPublicCode();
  const qrB = createQrPublicCode();
  const menu = {
    getPublicMenu: jest.fn(async () => ({
      outcome: 'found' as const,
      data: { fixture: true },
    })),
    getTableOrdering: jest.fn(async () => ({
      outcome: 'qrNotFound' as const,
    })),
  };

  beforeAll(async () => {
    // ConfigModule is evaluated when the AppModule is created. This setting
    // only affects the isolated Jest process/database and is cleared below.
    process.env.RESTAURANT_BASE_DOMAIN = 'waytaapp.com';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PublicMenuService)
      .useValue(menu)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    db = app.get(PrismaService);

    for (const [slug, label] of [[slugA, 'A'], [slugB, 'B']] as const) {
      const restaurant = await db.restaurant.create({
        data: {
          publicId: `subdomain-e2e-${randomUUID()}`,
          name: `HTTP Subdomain ${label} ${slugSuffix}`,
          status: 'ACTIVE',
          defaultLocale: 'ar',
          currencyCode: 'EGP',
          countryCode: 'EG',
        },
      });
      createdRestaurantIds.push(restaurant.id);
      await db.restaurantSlug.create({
        data: { restaurantId: restaurant.id, slug, isCurrent: true },
      });
      await db.qrCode.create({
        data: {
          restaurantId: restaurant.id,
          publicCode: label === 'A' ? qrA : qrB,
          type: 'GENERIC',
          status: 'ACTIVE',
        },
      });
    }
    await db.restaurantSlug.create({
      data: {
        restaurantId: createdRestaurantIds[0],
        slug: formerSlugA,
        isCurrent: false,
      },
    });
  });

  afterAll(async () => {
    try {
      if (db && createdRestaurantIds.length > 0) {
        await db.qrCode.deleteMany({
          where: { restaurantId: { in: createdRestaurantIds } },
        });
        await db.restaurantSlug.deleteMany({
          where: { restaurantId: { in: createdRestaurantIds } },
        });
        await db.restaurant.deleteMany({
          where: { id: { in: createdRestaurantIds } },
        });
      }
    } finally {
      await app?.close();
      delete process.env.RESTAURANT_BASE_DOMAIN;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves restaurant A by current slug only on its own hostname', async () => {
    const reply = await request(app.getHttpServer())
      .get(`/api/v1/public/qr/${slugA}/menu`)
      .set('Host', `${slugA}.waytaapp.com`);
    expect(reply.status).toBe(200);
    expect(menu.getPublicMenu).toHaveBeenCalledTimes(1);
  });

  it('resolves restaurant B by its opaque QR only on its own hostname', async () => {
    const reply = await request(app.getHttpServer())
      .get(`/api/v1/public/qr/${qrB}/menu`)
      .set('Host', `${slugB}.waytaapp.com`);
    expect(reply.status).toBe(200);
    expect(menu.getPublicMenu).toHaveBeenCalledTimes(1);
  });

  it('blocks both foreign QR and foreign slug without invoking menu logic', async () => {
    for (const code of [qrB, slugB]) {
      const reply = await request(app.getHttpServer())
        .get(`/api/v1/public/qr/${code}/menu`)
        .set('Host', `${slugA}.waytaapp.com`);
      expect(reply.status).toBe(404);
      expect(reply.body.error?.code).toBe('QR_NOT_FOUND');
    }
    expect(menu.getPublicMenu).not.toHaveBeenCalled();
  });

  it('does not authorize a formerly valid slug as a hostname', async () => {
    const reply = await request(app.getHttpServer())
      .get(`/api/v1/public/qr/${qrA}/menu`)
      .set('Host', `${formerSlugA}.waytaapp.com`);
    expect(reply.status).toBe(404);
    expect(reply.body.error?.code).toBe('QR_NOT_FOUND');
    expect(menu.getPublicMenu).not.toHaveBeenCalled();
  });

  it('preserves legacy apex QR access independently of restaurant subdomains', async () => {
    const reply = await request(app.getHttpServer())
      .get(`/api/v1/public/qr/${qrB}/menu`)
      .set('Host', 'waytaapp.com');
    expect(reply.status).toBe(200);
    expect(menu.getPublicMenu).toHaveBeenCalledTimes(1);
  });
});
