/* HTTP-level tenant-boundary tests for two independent restaurants.
 * Prisma and business services are mocked; Nest's actual routing, guards and
 * JSON response status codes are exercised without touching a live database.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access -- Supertest response.body is any, as in existing HTTP e2e specs. */
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma.service';
import { PublicRestaurantHostGuard } from '../src/public/public-restaurant-host.guard';
import { PublicMenuController } from '../src/public/public-menu.controller';
import { PublicOrdersController } from '../src/public/public-orders.controller';
import { PublicOrderTrackingController } from '../src/public/public-order-tracking.controller';
import { PublicSuggestionsController } from '../src/public/public-suggestions.controller';
import { PublicMenuService } from '../src/public/public-menu.service';
import { PublicOrdersService } from '../src/public/public-orders.service';
import { PublicOrderTrackingService } from '../src/public/public-order-tracking.service';
import { PublicSuggestionsService } from '../src/public/public-suggestions.service';
import { WhatsappTrackingService } from '../src/whatsapp-tracking/whatsapp-tracking.service';

const CODE_A = 'a'.repeat(43);
const CODE_B = 'b'.repeat(43);
const HOST_A = 'pizza-house.waytaapp.com';
const HOST_B = 'burger-studio.waytaapp.com';

const CURRENT_BY_RESTAURANT: Record<string, string> = {
  'restaurant-a': 'pizza-house',
  'restaurant-b': 'burger-studio',
};
const SLUG_OWNER: Record<string, string> = {
  'pizza-house': 'restaurant-a',
  'burger-studio': 'restaurant-b',
  'old-pizza-house': 'restaurant-a',
};
const QR_OWNER: Record<string, string> = {
  [CODE_A]: 'restaurant-a',
  [CODE_B]: 'restaurant-b',
};

describe('Guest restaurant hostname isolation (HTTP, two test restaurants)', () => {
  let app: INestApplication<App>;
  const db = {
    restaurantSlug: {
      findUnique: jest.fn(async ({ where }: { where: { slug: string } }) => {
        const restaurantId = SLUG_OWNER[where.slug];
        return restaurantId ? { restaurantId } : null;
      }),
      findFirst: jest.fn(async ({ where }: { where: { restaurantId: string } }) => {
        const slug = CURRENT_BY_RESTAURANT[where.restaurantId];
        return slug ? { slug } : null;
      }),
    },
    qrCode: {
      findUnique: jest.fn(async ({ where }: { where: { publicCode: string } }) => {
        const restaurantId = QR_OWNER[where.publicCode];
        return restaurantId ? { restaurantId } : null;
      }),
    },
  };
  const menu = {
    getPublicMenu: jest.fn(async () => ({ outcome: 'found' as const, data: { restaurant: 'menu-a' } })),
    getTableOrdering: jest.fn(async () => ({ outcome: 'found' as const, tableOrdering: 'AVAILABLE' as const })),
  };
  const orders = {
    createOrder: jest.fn(async () => ({ outcome: 'created' as const, data: { id: 'test-order-a' } })),
  };
  const tracking = {
    getTracking: jest.fn(async () => ({ outcome: 'notFound' as const })),
    lookup: jest.fn(async () => ({ outcome: 'notFound' as const })),
  };
  const suggestions = { suggest: jest.fn(async () => []) };
  const whatsapp = { prepare: jest.fn(async () => null) };
  const businessFns = [
    menu.getPublicMenu, menu.getTableOrdering, orders.createOrder,
    tracking.getTracking, tracking.lookup, suggestions.suggest, whatsapp.prepare,
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        PublicMenuController, PublicOrdersController,
        PublicOrderTrackingController, PublicSuggestionsController,
      ],
      providers: [
        PublicRestaurantHostGuard,
        { provide: ConfigService, useValue: { get: (key: string) => key === 'RESTAURANT_BASE_DOMAIN' ? 'waytaapp.com' : undefined } },
        { provide: PrismaService, useValue: db },
        { provide: PublicMenuService, useValue: menu },
        { provide: PublicOrdersService, useValue: orders },
        { provide: PublicOrderTrackingService, useValue: tracking },
        { provide: PublicSuggestionsService, useValue: suggestions },
        { provide: WhatsappTrackingService, useValue: whatsapp },
      ],
    }).compile();
    app = moduleRef.createNestApplication<App>();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serves an existing restaurant menu only on its own canonical hostname', async () => {
    const reply = await request(app.getHttpServer())
      .get('/api/v1/public/qr/pizza-house/menu')
      .set('Host', HOST_A);
    expect(reply.status).toBe(200);
    expect(reply.body.data).toEqual({ restaurant: 'menu-a' });
    expect(menu.getPublicMenu).toHaveBeenCalledTimes(1);
  });

  it('accepts an opaque QR of the same restaurant (table QR identity unchanged)', async () => {
    const reply = await request(app.getHttpServer())
      .get(`/api/v1/public/qr/${CODE_A}/table-ordering`)
      .set('Host', HOST_A);
    expect(reply.status).toBe(200);
    expect(reply.body.data).toEqual({ tableOrdering: 'AVAILABLE' });
    expect(menu.getTableOrdering).toHaveBeenCalledTimes(1);
  });

  it('allows an authenticated-neutral legacy apex QR URL to remain accessible', async () => {
    const reply = await request(app.getHttpServer())
      .get(`/api/v1/public/qr/${CODE_A}/menu`)
      .set('Host', 'waytaapp.com');
    expect(reply.status).toBe(200);
    expect(menu.getPublicMenu).toHaveBeenCalledTimes(1);
  });

  const blockedRoutes: Array<{ method: 'get' | 'post'; path: string }> = [
    { method: 'get', path: 'menu' },
    { method: 'get', path: 'table-ordering' },
    { method: 'post', path: 'orders' },
    { method: 'post', path: 'whatsapp-order' },
    { method: 'get', path: 'orders/test-order/tracking' },
    { method: 'post', path: 'orders/lookup' },
    { method: 'post', path: 'suggestions' },
  ];

  it.each(blockedRoutes)(
    'rejects a foreign restaurant QR on %s %s before any business service runs',
    async ({ method, path }) => {
      const url = `/api/v1/public/qr/${CODE_B}/${path}`;
      const reply = method === 'get'
        ? await request(app.getHttpServer()).get(url).set('Host', HOST_A)
        : await request(app.getHttpServer()).post(url).set('Host', HOST_A)
            .send({ clientRequestId: 'test-id', items: [], productIds: [], phone: '01000000000' });

      expect(reply.status).toBe(404);
      expect(reply.body.error.code).toBe('QR_NOT_FOUND');
      for (const fn of businessFns) expect(fn).not.toHaveBeenCalled();
    },
  );

  it('rejects a foreign readable slug and a former hostname', async () => {
    for (const [host, code] of [
      [HOST_A, 'burger-studio'],
      ['old-pizza-house.waytaapp.com', 'old-pizza-house'],
    ] as const) {
      const reply = await request(app.getHttpServer())
        .get(`/api/v1/public/qr/${code}/menu`)
        .set('Host', host);
      expect(reply.status).toBe(404);
      expect(reply.body.error.code).toBe('QR_NOT_FOUND');
    }
    expect(menu.getPublicMenu).not.toHaveBeenCalled();
  });

  it('rejects invalid, nested and reserved subdomains if the gateway ever misroutes them', async () => {
    for (const host of [
      'control.waytaapp.com', 'a.b.waytaapp.com', 'www.waytaapp.com',
      'invalid--label.waytaapp.com',
    ]) {
      const reply = await request(app.getHttpServer())
        .get(`/api/v1/public/qr/${CODE_A}/menu`)
        .set('Host', host);
      expect(reply.status).toBe(404);
      expect(reply.body.error.code).toBe('QR_NOT_FOUND');
    }
    expect(menu.getPublicMenu).not.toHaveBeenCalled();
  });

  it('supports the second restaurant on its own hostname', async () => {
    const reply = await request(app.getHttpServer())
      .get(`/api/v1/public/qr/${CODE_B}/menu`)
      .set('Host', HOST_B);
    expect(reply.status).toBe(200);
    expect(menu.getPublicMenu).toHaveBeenCalledTimes(1);
  });
});
