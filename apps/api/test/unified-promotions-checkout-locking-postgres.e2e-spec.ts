import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { validationExceptionFactory } from '../src/common/http/validation-exception.factory';
import { PrismaService } from '../src/database/prisma.service';

const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const englishTitle = 'Lunch discount';
const arabicTitle = 'خصم الغداء';
const discountedTotal = '90.00';

// Fresh tenants in the identity-checked disposable sandbox, like the B2 pricing suite.
describeSandbox('Unified Promotions checkout locking (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
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
    await assertSandboxIdentity(prisma);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function seedWorld(whatsappOrderingEnabled = false) {
    const { id: restaurantId } = await prisma.restaurant.create({
      data: {
        publicId: `it-checkout-${randomUUID()}`,
        name: 'IT Checkout Restaurant',
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
        countryCode: 'EG',
        whatsappOrderingEnabled,
        whatsappNumber: whatsappOrderingEnabled ? '+201012345678' : null,
        locales: {
          create: [
            { locale: 'en', isActive: true },
            { locale: 'ar', isActive: true },
          ],
        },
        features: { create: { feature: 'PROMOTIONS', enabled: true } },
      },
    });
    const branch = await prisma.branch.create({
      data: {
        restaurantId,
        publicId: `it-checkout-branch-${randomUUID()}`,
        name: 'IT Checkout Branch',
        status: 'ACTIVE',
        timezone: 'Africa/Cairo',
      },
    });
    const qr = await prisma.qrCode.create({
      data: {
        restaurantId,
        publicCode: `it-checkout-qr-${randomUUID()}`,
        type: 'GENERIC',
        status: 'ACTIVE',
      },
    });
    const menu = await prisma.menu.create({
      data: {
        restaurantId,
        nameInternal: 'IT Menu',
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
        translations: { create: { locale: 'en', name: 'IT Menu' } },
      },
    });
    const category = await prisma.category.create({
      data: {
        restaurantId,
        menuId: menu.id,
        status: 'ACTIVE',
        displayOrder: 0,
        translations: { create: { locale: 'en', name: 'Mains' } },
      },
    });
    const product = await prisma.product.create({
      data: {
        restaurantId,
        categoryId: category.id,
        publicId: `it-checkout-product-${randomUUID()}`,
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        basePrice: '100.00',
        displayOrder: 0,
        allowCustomerNotes: false,
        featured: false,
        translations: {
          create: [
            { locale: 'en', name: 'Lunch' },
            { locale: 'ar', name: 'الغداء' },
          ],
        },
      },
    });
    const promotion = await prisma.promotion.create({
      data: {
        restaurantId,
        scope: 'CART',
        discountType: 'PERCENTAGE',
        value: '10.00',
        status: 'ACTIVE',
        internalName: 'Private campaign label',
        translations: {
          create: [
            { locale: 'en', title: englishTitle },
            { locale: 'ar', title: arabicTitle },
          ],
        },
      },
    });
    return {
      restaurantId,
      productId: product.id,
      promotionId: promotion.id,
      path: `/api/v1/public/qr/${qr.publicCode}`,
      cart: {
        fulfillment: 'PICKUP',
        branchId: branch.id,
        items: [{ productId: product.id, quantity: 1 }],
      },
    };
  }

  type World = Awaited<ReturnType<typeof seedWorld>>;

  const post = (
    w: World,
    endpoint: 'quote' | 'orders' | 'whatsapp-order',
    extra: Record<string, unknown> = {},
  ) =>
    request(app.getHttpServer())
      .post(`${w.path}/${endpoint}`)
      .send({ ...w.cart, ...extra });

  const checkout = (clientRequestId: string = randomUUID(), locale = 'en') => ({
    customerName: 'Sara',
    customerPhone: '+20 100 000 0000',
    clientRequestId,
    expectedTotal: discountedTotal,
    locale,
  });

  const applied = (title: string | null) => ({
    total: discountedTotal,
    promotions: [{ scope: 'CART', amount: '10.00', title }],
  });

  async function waitForOrderItemInsert(blockerPid: number): Promise<void> {
    const deadline = Date.now() + 4_000;
    do {
      // Poll outside the blocking transaction to see a fresh activity snapshot.
      const [{ blocked }] = await prisma.$queryRaw<{ blocked: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database()
            AND ${blockerPid} = ANY(pg_blocking_pids(pid))
            AND query ILIKE '%insert into%order_items%'
        ) AS blocked`;
      if (blocked) return;
      await delay(20);
    } while (Date.now() < deadline);
    throw new Error('Checkout never reached the blocked Order Item insert');
  }

  it('holds Promotion KEY SHARE before the Order snapshot foreign key can take its own lock', async () => {
    const w = await seedWorld();
    const race: { submission?: Promise<request.Response> } = {};
    try {
      await prisma.$transaction(
        async (blocker) => {
          const [{ pid }] = await blocker.$queryRaw<{ pid: number }[]>`
            SELECT pg_backend_pid() AS pid`;
          // Pricing can read this Product, but the Order Item FK must wait on it.
          // That pauses checkout after pricing and before it writes any promotion history.
          await blocker.$queryRaw`
            SELECT id FROM products WHERE id = ${w.productId}::uuid FOR UPDATE`;
          race.submission = post(w, 'orders', checkout())
            .timeout({ deadline: 8_000 })
            .then((response) => response);
          // Handle a transport failure even if it arrives before the lock probe finishes.
          void race.submission.catch(() => undefined);
          await waitForOrderItemInsert(pid);

          // A non-key edit can commit during checkout; a delete must wait.
          await prisma.$transaction(async (edit) => {
            await edit.$queryRaw`
              SELECT id FROM promotions WHERE id = ${w.promotionId}::uuid
              FOR NO KEY UPDATE NOWAIT`;
            await edit.promotion.update({
              where: { id: w.promotionId },
              data: { value: '20.00' },
            });
          });
          await expect(prisma.$queryRaw`
            SELECT id FROM promotions WHERE id = ${w.promotionId}::uuid
            FOR UPDATE NOWAIT`).rejects.toMatchObject({
            code: 'P2010',
            meta: { driverAdapterError: { cause: { originalCode: '55P03' } } },
          });
        },
        { timeout: 7_000 },
      );
    } finally {
      // Wait for the HTTP request only once the blocker has been released, even on probe failure.
      await race.submission?.catch(() => undefined);
    }
    if (!race.submission) throw new Error('Checkout was not started');
    const response = await race.submission;
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ data: applied(englishTitle) });
    const snapshots = await prisma.orderPromotion.findMany({
      where: { restaurantId: w.restaurantId, promotionId: w.promotionId },
      select: { amount: true },
    });
    expect(snapshots.map(({ amount }) => amount.toFixed(2))).toEqual(['10.00']);
    expect((await post(w, 'quote').expect(200)).body).toMatchObject({
      data: { total: '80.00' },
    });
  }, 12_000);

  it.each(['quote', 'whatsapp-order'] as const)(
    '%s prices the winning Promotion without taking its row lock',
    async (endpoint) => {
      const whatsapp = endpoint === 'whatsapp-order';
      const w = await seedWorld(whatsapp);
      await prisma.$transaction(
        async (blocker) => {
          await blocker.$queryRaw`
            SELECT id FROM promotions WHERE id = ${w.promotionId}::uuid FOR UPDATE`;
          // Finish inside this transaction: any Promotion row lock in pricing would wait.
          const response = await post(
            w,
            endpoint,
            whatsapp ? checkout(randomUUID(), 'ar') : { locale: 'ar' },
          )
            .timeout({ deadline: 4_000 })
            .expect(200);
          if (whatsapp) {
            const { data } = response.body as {
              data: { total: string; message: string };
            };
            expect(data.total).toBe(discountedTotal);
            expect(data.message).toContain(arabicTitle);
          } else {
            expect(response.body).toMatchObject({ data: applied(arabicTitle) });
          }
        },
        { timeout: 7_000 },
      );
      expect(
        await prisma.order.count({ where: { restaurantId: w.restaurantId } }),
      ).toBe(0);
    },
    10_000,
  );

  it('prefers the requested title, falls back safely, and never relocalizes a persisted title', async () => {
    const w = await seedWorld();
    const submission = checkout(randomUUID(), 'ar');
    const original = await post(w, 'orders', submission).expect(201);
    const { id } = (original.body as { data: { id: string } }).data;
    expect(original.body).toMatchObject({ data: applied(arabicTitle) });

    await prisma.promotionTranslation.delete({
      where: {
        promotionId_locale: { promotionId: w.promotionId, locale: 'ar' },
      },
    });
    const defaultTitle = await post(w, 'quote', { locale: 'ar' }).expect(200);
    expect(defaultTitle.body).toMatchObject({ data: applied(englishTitle) });

    await prisma.restaurant.update({
      where: { id: w.restaurantId },
      data: { defaultLocale: 'ar' },
    });
    const noTitle = await post(w, 'quote', { locale: 'ar' }).expect(200);
    expect(noTitle.body).toMatchObject({ data: applied(null) });

    const replay = await post(w, 'orders', {
      ...submission,
      locale: 'en',
    }).expect(201);
    expect(replay.body).toMatchObject({
      data: { id, ...applied(arabicTitle) },
    });
    expect(
      await prisma.orderPromotion.findFirstOrThrow({
        where: { restaurantId: w.restaurantId, orderId: id },
        select: { titleSnapshot: true },
      }),
    ).toEqual({ titleSnapshot: arabicTitle });
  });
});
