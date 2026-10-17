/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call --
 * supertest exposes `response.body` as `any`; the assertions below read the JSON
 * envelope directly, exactly like the other HTTP e2e specs in this folder. */
import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PrismaService } from './../src/database/prisma.service';

/**
 * Guest order tracking (DEC-042) against REAL PostgreSQL through the real Nest app: tracking
 * by the id the Guest was given, the "find my order by phone" lookup, and that neither leaks
 * personal data or another Restaurant's orders.
 *
 * Isolation: see `support/sandbox-guard.ts`; without TABLE_SESSION_IT_DATABASE_URL the
 * whole suite is skipped.
 */

const describeSandbox = SANDBOX_URL ? describe : describe.skip;

interface World {
  restaurantId: string;
  branchId: string;
  zoneId: string;
  genericQr: string;
  tableQr: string;
  productId: string;
}

describeSandbox('Guest order tracking (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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

  // ================================================================== tests

  const placeOrder = (qr: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/orders`)
      .send({ clientRequestId: randomUUID(), ...body });

  const track = (qr: string, orderId: string, lang?: string) =>
    request(app.getHttpServer()).get(
      `/api/v1/public/qr/${qr}/orders/${orderId}/tracking${lang ? `?lang=${lang}` : ''}`,
    );

  const lookup = (qr: string, phone: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/orders/lookup`)
      .send({ phone });

  const pickupBody = (world: World, phone = '01012345678') => ({
    items: [{ productId: world.productId, quantity: 2 }],
    fulfillment: 'PICKUP',
    customerName: 'Mona Hassan',
    customerPhone: phone,
    customerNotes: 'No onions please',
  });

  it('tracks an order by its id: progress and a summary, nothing personal', async () => {
    const world = await seedWorld('track-id');
    const created = await placeOrder(world.genericQr, pickupBody(world));
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const first = await track(world.genericQr, id);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      type: 'PICKUP',
      status: 'PENDING',
      itemCount: 2,
      total: '100.00',
      currencyCode: 'EGP',
      flow: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'],
      tableNumber: null,
    });
    expect(first.body.data.ref).toBe(
      id.replace(/-/g, '').slice(0, 8).toUpperCase(),
    );
    // Never personal data or ids.
    const text = JSON.stringify(first.body);
    expect(text).not.toContain('Mona');
    expect(text).not.toContain('01012345678');
    expect(text).not.toContain('onions');
    expect(text).not.toContain(world.restaurantId);
    expect(text).not.toContain(world.branchId);
    expect(
      first.body.data.events.map((e: { status: string }) => e.status),
    ).toContain('PENDING');

    // The kitchen moves it: the Guest sees the new status and its time.
    await prisma.order.update({ where: { id }, data: { status: 'PREPARING' } });
    await prisma.orderStatusEvent.create({
      data: {
        restaurantId: world.restaurantId,
        branchId: world.branchId,
        orderId: id,
        previousStatus: 'PENDING',
        newStatus: 'PREPARING',
      },
    });
    const second = await track(world.genericQr, id);
    expect(second.body.data.status).toBe('PREPARING');
    expect(
      second.body.data.events.map((e: { status: string }) => e.status),
    ).toContain('PREPARING');

    // Dine-in tracks too, with the table; delivery has the extra step.
    const dineIn = await placeOrder(world.tableQr, {
      items: [{ productId: world.productId, quantity: 1 }],
    });
    expect(dineIn.status).toBe(201);
    const dine = await track(world.tableQr, dineIn.body.data.id as string);
    expect(dine.body.data.type).toBe('DINE_IN');
    expect(dine.body.data.tableNumber).toEqual(expect.any(String));
    const delivery = await placeOrder(world.genericQr, {
      items: [{ productId: world.productId, quantity: 1 }],
      fulfillment: 'DELIVERY',
      customerName: 'Mona',
      customerPhone: '01012345678',
      deliveryAddress: '1 Nile St',
      deliveryZoneId: world.zoneId,
    });
    expect(delivery.status).toBe(201);
    const del = await track(world.genericQr, delivery.body.data.id as string);
    expect(del.body.data.flow).toContain('OUT_FOR_DELIVERY');
  });

  it('answers the same 404 for an unknown, malformed or foreign order', async () => {
    const world = await seedWorld('track-scope');
    const other = await seedWorld('track-scope-other');
    const created = await placeOrder(other.genericQr, pickupBody(other));
    const id = created.body.data.id as string;

    expect((await track(world.genericQr, id)).status).toBe(404); // another restaurant's order
    expect((await track(world.genericQr, randomUUID())).status).toBe(404);
    expect((await track(world.genericQr, 'not-a-uuid')).status).toBe(404);
    expect((await track('no-such-qr', id)).status).toBe(404);
    expect((await track(other.genericQr, id)).status).toBe(200);
  });

  it('finds recent orders by phone in any format, only this restaurant, only Pickup and Delivery, only 24 h', async () => {
    const world = await seedWorld('track-phone');
    const other = await seedWorld('track-phone-other');
    const mine = await placeOrder(
      world.genericQr,
      pickupBody(world, '01012345678'),
    );
    expect(mine.status).toBe(201);
    await placeOrder(world.genericQr, pickupBody(world, '01199999999'));
    await placeOrder(other.genericQr, pickupBody(other, '01012345678'));
    await placeOrder(world.tableQr, {
      items: [{ productId: world.productId, quantity: 1 }],
    });

    for (const phone of [
      '01012345678',
      '+20 10 1234 5678',
      '(010) 1234-5678',
      '201012345678',
    ]) {
      const found = await lookup(world.genericQr, phone);
      expect(found.status).toBe(200);
      expect(found.body.data).toHaveLength(1);
      expect(found.body.data[0].type).toBe('PICKUP');
      expect(found.body.data[0].id).toBeUndefined();
      expect(JSON.stringify(found.body)).not.toContain('Mona');
    }
    expect((await lookup(world.genericQr, '01055555555')).body.data).toEqual(
      [],
    );

    // Older than 24 hours: gone.
    await prisma.order.update({
      where: { id: mine.body.data.id as string },
      data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) },
    });
    expect((await lookup(world.genericQr, '01012345678')).body.data).toEqual(
      [],
    );

    // A number that is too short is refused, not searched.
    const bad = await lookup(world.genericQr, '12345');
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('PHONE_INVALID');
    expect((await lookup('no-such-qr', '01012345678')).body.data).toEqual([]);
  });
});
