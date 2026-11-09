import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { LoginController } from '../../auth/login/login.controller';
import { HealthController } from '../../health/health.controller';
import { PublicMenuController } from '../../public/public-menu.controller';
import { PublicOrdersController } from '../../public/public-orders.controller';
import { PublicMenuService } from '../../public/public-menu.service';
import { PublicOrdersService } from '../../public/public-orders.service';
import { WhatsappTrackingService } from '../../whatsapp-tracking/whatsapp-tracking.service';
import { LoginService } from '../../auth/login/login.service';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AppThrottlerGuard } from './app-throttler.guard';
import { buildThrottlerOptions, type RateLimitSettings } from './rate-limit.module';

const BASE: RateLimitSettings = {
  enabled: true,
  windowSeconds: 60,
  defaultLimit: 1000,
  loginLimit: 3,
  publicOrderLimit: 2,
};

const ORDER_BODY = {
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  items: [{ productId: '11111111-1111-4111-8111-111111111112', quantity: 1 }],
};

async function buildApp(settings: RateLimitSettings): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot(buildThrottlerOptions(settings))],
    controllers: [LoginController, PublicOrdersController, PublicMenuController, HealthController],
    providers: [
      { provide: APP_GUARD, useClass: AppThrottlerGuard },
      {
        provide: LoginService,
        useValue: { login: jest.fn().mockResolvedValue({ outcome: 'invalidCredentials' }) },
      },
      { provide: ConfigService, useValue: { get: jest.fn() } },
      { provide: WhatsappTrackingService, useValue: {} },
      {
        provide: PublicOrdersService,
        useValue: { createOrder: jest.fn().mockResolvedValue({ outcome: 'qrNotFound' }) },
      },
      {
        provide: PublicMenuService,
        useValue: { getPublicMenu: jest.fn().mockResolvedValue({ outcome: 'qrNotFound' }) },
      },
      { provide: PrismaService, useValue: { $queryRaw: jest.fn().mockResolvedValue([]) } },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

async function post(app: INestApplication, path: string, body: object, times: number) {
  const statuses: number[] = [];
  for (let i = 0; i < times; i += 1) {
    const res = await request(app.getHttpServer()).post(path).send(body);
    statuses.push(res.status);
  }
  return statuses;
}

describe('rate limiting (FT-9)', () => {
  let app: INestApplication;
  afterEach(async () => {
    await app?.close();
  });

  it('throttles login attempts past the login limit with the standard 429 envelope and Retry-After', async () => {
    app = await buildApp(BASE);
    const body = { email: 'a@b.com', password: 'wrong-password-1' };

    const statuses = await post(app, '/auth/login', body, 4);

    expect(statuses).toEqual([401, 401, 401, 429]);
    const blocked = await request(app.getHttpServer()).post('/auth/login').send(body);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait a moment and try again.',
      },
    });
    // Named throttlers suffix the header with their name (e.g. retry-after-login).
    expect(Object.keys(blocked.headers).some((name) => name.startsWith('retry-after'))).toBe(true);
  });

  it('throttles public Guest order creation past the publicOrder limit', async () => {
    app = await buildApp(BASE);

    const statuses = await post(app, '/public/qr/some-code/orders', ORDER_BODY, 3);

    // 404 = the (mocked) qrNotFound outcome reached the handler; the third never does.
    expect(statuses).toEqual([404, 404, 429]);
  });

  it('the stricter groups do NOT leak onto unrelated routes (public menu read is unaffected)', async () => {
    app = await buildApp(BASE);

    // Exhaust both strict limits first.
    await post(app, '/public/qr/x/orders', ORDER_BODY, 3);
    await post(app, '/auth/login', { email: 'a@b.com', password: 'wrong-password-1' }, 4);

    const menu = await request(app.getHttpServer()).get('/public/qr/some-code/menu');
    expect(menu.status).toBe(404); // reached the handler, not throttled
  });

  it('the default limit still protects every route', async () => {
    app = await buildApp({ ...BASE, defaultLimit: 2 });

    const statuses: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      statuses.push((await request(app.getHttpServer()).get('/public/qr/x/menu')).status);
    }

    expect(statuses).toEqual([404, 404, 429]);
  });

  it('health and readiness probes are never throttled', async () => {
    app = await buildApp({ ...BASE, defaultLimit: 1 });

    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await request(app.getHttpServer()).get('/health')).status);
    }
    const ready = await request(app.getHttpServer()).get('/ready');

    expect(statuses).toEqual([200, 200, 200, 200, 200]);
    expect(ready.status).toBe(200);
  });

  it('can be switched off (local/e2e only): no request is ever throttled', async () => {
    app = await buildApp({ ...BASE, enabled: false });

    const statuses = await post(app, '/auth/login', { email: 'a@b.com', password: 'wrong-password-1' }, 6);

    expect(statuses.every((status) => status === 401)).toBe(true);
  });
});
