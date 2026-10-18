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
 * Smart suggestions (DEC-042) against REAL PostgreSQL through the real Nest app: the Staff mode and
 * manual rules (authority, validation, tenant scope) and what the Guest cart is told to suggest
 * (manual rules, the automatic "bought together" source and its minimum-data rule).
 *
 * Isolation: see `support/sandbox-guard.ts`; without TABLE_SESSION_IT_DATABASE_URL the whole
 * suite is skipped.
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
  categoryId: string;
}

describeSandbox('Smart suggestions (real PostgreSQL)', () => {
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
        locales: { create: [{ locale: 'en', isActive: true }] },
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
      categoryId: category.id,
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

  const base = (restaurantId: string) => `/api/v1/restaurants/${restaurantId}`;

  async function send(
    method: 'patch' | 'put',
    staff: Staff,
    path: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      [method](path)
      .set('Cookie', await login(staff))
      .set('Origin', origin)
      .send(body);
  }

  async function get(staff: Staff, path: string) {
    return request(app.getHttpServer())
      .get(path)
      .set('Cookie', await login(staff));
  }

  const suggest = (qr: string, productIds: string[]) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/suggestions`)
      .send({ productIds });

  async function addProduct(
    world: World,
    name: string,
    extra: Record<string, unknown> = {},
  ) {
    return prisma.product.create({
      data: {
        publicId: `product-${randomUUID()}`,
        restaurantId: world.restaurantId,
        categoryId: world.categoryId,
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        basePrice: '20.00',
        displayOrder: 1,
        allowCustomerNotes: false,
        featured: false,
        translations: { create: { locale: 'en', name } },
        ...extra,
      },
    });
  }

  it('lets the Owner choose the mode and manual rules; others and other Restaurants cannot', async () => {
    const world = await seedWorld('sugg-staff');
    const other = await seedWorld('sugg-other');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const waiter = await addStaff(world.restaurantId, 'WAITER');
    const r = base(world.restaurantId);
    const fries = await addProduct(world, 'Fries');
    const drink = await addProduct(world, 'Drink');

    const settings = await get(owner, `${r}/suggestions`);
    expect(settings.status).toBe(200);
    expect(settings.body.data.mode).toBe('OFF');
    expect(settings.body.data.automatic).toMatchObject({
      servedOrders: 0,
      ready: false,
    });

    expect(
      (await send('patch', owner, `${r}/suggestions`, { mode: 'FANCY' }))
        .status,
    ).toBe(400);
    expect(
      (await send('patch', waiter, `${r}/suggestions`, { mode: 'BOTH' }))
        .status,
    ).toBe(403);
    const set = await send('patch', owner, `${r}/suggestions`, {
      mode: 'BOTH',
    });
    expect(set.status).toBe(200);
    expect(set.body.data.mode).toBe('BOTH');

    const path = `${r}/products/${world.productId}/suggestions`;
    const saved = await send('put', owner, path, {
      productIds: [drink.id, fries.id],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.productIds).toEqual([drink.id, fries.id]);
    expect((await get(owner, path)).body.data.productIds).toEqual([
      drink.id,
      fries.id,
    ]);
    // viewing is allowed for a waiter's menu.view, changing is not
    expect((await send('put', waiter, path, { productIds: [] })).status).toBe(
      403,
    );

    // invalid: itself, a repeat, another Restaurant's product (422); too many or not a UUID (400)
    expect(
      (await send('put', owner, path, { productIds: [world.productId] }))
        .status,
    ).toBe(422);
    expect(
      (await send('put', owner, path, { productIds: [fries.id, fries.id] }))
        .status,
    ).toBe(422);
    const many = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => addProduct(world, `Extra ${n}`)),
    );
    expect(
      (
        await send('put', owner, path, {
          productIds: [fries.id, drink.id, ...many.map((p) => p.id)],
        })
      ).status,
    ).toBe(400);
    expect(
      (await send('put', owner, path, { productIds: [other.productId] }))
        .status,
    ).toBe(422);
    expect(
      (await send('put', owner, path, { productIds: ['nope'] })).status,
    ).toBe(400);
    // nothing changed by the refused calls
    expect((await get(owner, path)).body.data.productIds).toEqual([
      drink.id,
      fries.id,
    ]);

    // another Restaurant's product is "not found" for this Owner
    expect(
      (await get(owner, `${r}/products/${other.productId}/suggestions`)).status,
    ).toBe(404);
    expect(
      (
        await send(
          'put',
          owner,
          `${r}/products/${other.productId}/suggestions`,
          { productIds: [] },
        )
      ).status,
    ).toBe(404);

    // clearing works
    expect(
      (await send('put', owner, path, { productIds: [] })).body.data.productIds,
    ).toEqual([]);
  });

  it('suggests the manual rules to the Guest, only what can be ordered, never what is in the cart', async () => {
    const world = await seedWorld('sugg-manual');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = base(world.restaurantId);
    const fries = await addProduct(world, 'Fries');
    const drink = await addProduct(world, 'Drink');
    const soldOut = await addProduct(world, 'Sold out', {
      availability: 'SOLD_OUT',
    });
    const hidden = await addProduct(world, 'Hidden', { status: 'INACTIVE' });
    const path = `${r}/products/${world.productId}/suggestions`;
    await send('put', owner, path, {
      productIds: [fries.id, soldOut.id, hidden.id, drink.id],
    });

    // off by default: the menu says so and the endpoint answers nothing
    expect(
      (
        await request(app.getHttpServer()).get(
          `/api/v1/public/qr/${world.genericQr}/menu`,
        )
      ).body.data.context.suggestions,
    ).toBe(false);
    expect(
      (await suggest(world.genericQr, [world.productId])).body.data.productIds,
    ).toEqual([]);

    await send('patch', owner, `${r}/suggestions`, { mode: 'MANUAL' });
    expect(
      (
        await request(app.getHttpServer()).get(
          `/api/v1/public/qr/${world.genericQr}/menu`,
        )
      ).body.data.context.suggestions,
    ).toBe(true);
    const res = await suggest(world.genericQr, [world.productId]);
    expect(res.status).toBe(200);
    expect(res.body.data.productIds).toEqual([fries.id, drink.id]);
    // a Table QR works the same, and what is already in the cart is left out
    expect(
      (await suggest(world.tableQr, [world.productId, fries.id])).body.data
        .productIds,
    ).toEqual([drink.id]);

    // malformed input is refused; an unknown code is just "nothing"
    expect((await suggest(world.genericQr, ['nope'])).status).toBe(400);
    expect((await suggest(world.genericQr, [])).status).toBe(400);
    expect(
      (await suggest('does-not-exist', [world.productId])).body.data.productIds,
    ).toEqual([]);

    // another Restaurant's rules never reach this cart
    const other = await seedWorld('sugg-manual-other');
    const otherOwner = await addStaff(other.restaurantId, 'OWNER');
    await send('patch', otherOwner, `${base(other.restaurantId)}/suggestions`, {
      mode: 'MANUAL',
    });
    expect(
      (await suggest(other.genericQr, [world.productId])).body.data.productIds,
    ).toEqual([]);
  });

  it('learns "bought together" from served orders, but only once there is enough data', async () => {
    const world = await seedWorld('sugg-auto');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = base(world.restaurantId);
    const fries = await addProduct(world, 'Fries');
    const drink = await addProduct(world, 'Drink');
    const rare = await addProduct(world, 'Rare');
    await send('patch', owner, `${r}/suggestions`, { mode: 'AUTO' });

    const place = async (productIds: string[]) => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/public/qr/${world.genericQr}/orders`)
        .send({
          clientRequestId: randomUUID(),
          fulfillment: 'PICKUP',
          customerName: 'Mona',
          customerPhone: '01012345678',
          items: productIds.map((productId) => ({ productId, quantity: 1 })),
        });
      expect(res.status).toBe(201);
    };

    // 29 served orders: below the minimum, so the automatic source stays silent
    for (let i = 0; i < 29; i += 1) {
      await place(
        i < 5
          ? [world.productId, fries.id, drink.id]
          : i < 7
            ? [world.productId, rare.id]
            : [world.productId, fries.id],
      );
    }
    await prisma.order.updateMany({
      where: { restaurantId: world.restaurantId },
      data: { status: 'SERVED' },
    });
    expect(
      (await get(owner, `${r}/suggestions`)).body.data.automatic,
    ).toMatchObject({ servedOrders: 29, ready: false });
    expect(
      (await suggest(world.genericQr, [world.productId])).body.data.productIds,
    ).toEqual([]);

    // the 30th order: now fries (together 23 times) then drink (5); rare (2) is below the pair minimum
    await place([world.productId, fries.id]);
    await prisma.order.updateMany({
      where: { restaurantId: world.restaurantId },
      data: { status: 'SERVED' },
    });
    expect(
      (await get(owner, `${r}/suggestions`)).body.data.automatic,
    ).toMatchObject({ servedOrders: 30, ready: true });
    expect(
      (await suggest(world.genericQr, [world.productId])).body.data.productIds,
    ).toEqual([fries.id, drink.id]);
    // what is in the cart is not suggested again
    expect(
      (await suggest(world.genericQr, [world.productId, fries.id])).body.data
        .productIds,
    ).toEqual([drink.id]);

    // only SERVED orders count: pending ones do not
    await place([world.productId, rare.id]);
    await place([world.productId, rare.id]);
    await place([world.productId, rare.id]);
    expect(
      (await suggest(world.genericQr, [world.productId])).body.data.productIds,
    ).toEqual([fries.id, drink.id]);

    // BOTH: the manual rule comes first, then the automatic ones
    await send('patch', owner, `${r}/suggestions`, { mode: 'BOTH' });
    await send('put', owner, `${r}/products/${world.productId}/suggestions`, {
      productIds: [drink.id],
    });
    expect(
      (await suggest(world.genericQr, [world.productId])).body.data.productIds,
    ).toEqual([drink.id, fries.id]);

    // MANUAL ignores the automatic source
    await send('patch', owner, `${r}/suggestions`, { mode: 'MANUAL' });
    expect(
      (await suggest(world.genericQr, [world.productId])).body.data.productIds,
    ).toEqual([drink.id]);
  });
});
