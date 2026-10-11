/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment --
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
import { localDateIn } from './../src/menu/product-discount';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/**
 * Product Discounts V1 against REAL PostgreSQL through the real Nest app:
 * Staff configuration (validation, permissions, tenant isolation), the Guest
 * menu read model, order creation for Dine-In / Pickup / Delivery, immutable
 * snapshots, Branch-timezone date boundaries, the stale-total guard and
 * idempotency.
 *
 * Isolation: see `support/sandbox-guard.ts`; without
 * TABLE_SESSION_IT_DATABASE_URL the whole suite is skipped.
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
  tableQr: string;
  genericQr: string;
  zoneId: string;
  categoryId: string;
  productId: string;
}

describeSandbox('Product discounts (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hasher: PasswordHasherService;
  let origin = 'http://localhost:3000';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  async function seedWorld(
    label: string,
    options: { price?: string; timezone?: string; minimumOrder?: string } = {},
  ): Promise<World> {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `it-rest-${randomUUID()}`,
        name: `IT ${label}`,
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
        locales: { create: { locale: 'en', isActive: true } },
      },
    });
    const branch = await prisma.branch.create({
      data: {
        publicId: `branch-${randomUUID()}`,
        restaurantId: restaurant.id,
        name: `IT Branch ${label}`,
        status: 'ACTIVE',
        timezone: options.timezone ?? 'UTC',
      },
    });
    const table = await prisma.table.create({
      data: { restaurantId: restaurant.id, branchId: branch.id, tableNumber: '1', status: 'ACTIVE' },
    });
    const tableQr = await prisma.qrCode.create({
      data: {
        publicCode: `it-qr-${randomUUID()}`,
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        type: 'TABLE',
        status: 'ACTIVE',
      },
    });
    const genericQr = await prisma.qrCode.create({
      data: {
        publicCode: `it-qr-${randomUUID()}`,
        restaurantId: restaurant.id,
        type: 'GENERIC',
        status: 'ACTIVE',
      },
    });
    const zone = await prisma.deliveryZone.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        name: 'IT Zone',
        deliveryFee: '10.00',
        minimumOrder: options.minimumOrder ?? '0.00',
        status: 'ACTIVE',
        displayOrder: 0,
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
        basePrice: options.price ?? '100.00',
        displayOrder: 0,
        allowCustomerNotes: false,
        featured: false,
        translations: { create: { locale: 'en', name: 'IT Burger' } },
      },
    });
    return {
      restaurantId: restaurant.id,
      branchId: branch.id,
      tableQr: tableQr.publicCode,
      genericQr: genericQr.publicCode,
      zoneId: zone.id,
      categoryId: category.id,
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

  async function call(
    staff: Staff,
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    body?: Record<string, unknown>,
  ) {
    let req = request(app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', await login(staff));
    if (method !== 'get') req = req.set('Origin', origin);
    return body ? req.send(body) : req;
  }

  const setDiscount = (world: World, data: Record<string, unknown>) =>
    prisma.product.update({ where: { id: world.productId }, data });

  const publicMenu = (qr: string) => request(app.getHttpServer()).get(`/api/v1/public/qr/${qr}/menu`);

  const order = (qr: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/orders`)
      .send({ clientRequestId: randomUUID(), ...body });

  const todayUtc = () => localDateIn('UTC', new Date());
  const shiftDays = (date: string, days: number) => {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // ========================================================= Staff management

  describe('Staff configuration', () => {
    it('creates, updates and removes a discount; the list reports state and the charged price', async () => {
      const world = await seedWorld('staff-config');
      const owner = await addStaff(world.restaurantId, 'OWNER');
      const r = world.restaurantId;

      const created = await call(owner, 'post', `/restaurants/${r}/products`, {
        categoryId: world.categoryId,
        name: 'Discounted Pasta',
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        basePrice: '250.00',
        displayOrder: 1,
        allowCustomerNotes: false,
        featured: false,
        discount: { enabled: true, type: 'PERCENTAGE', value: '20' },
      });
      expect(created.status).toBe(201);
      expect(created.body.data.discount).toEqual({
        enabled: true,
        type: 'PERCENTAGE',
        value: '20.00',
        startsOn: null,
        endsOn: null,
        state: 'ACTIVE',
        discountedPrice: '200.00',
      });
      const id = created.body.data.id as string;

      const updated = await call(owner, 'patch', `/restaurants/${r}/products/${id}`, {
        discount: {
          enabled: true,
          type: 'FIXED_AMOUNT',
          value: '30.00',
          startsOn: shiftDays(todayUtc(), 2),
          endsOn: shiftDays(todayUtc(), 9),
        },
      });
      expect(updated.status).toBe(200);
      expect(updated.body.data.discount).toMatchObject({
        type: 'FIXED_AMOUNT',
        value: '30.00',
        state: 'SCHEDULED',
        discountedPrice: null,
      });

      const disabled = await call(owner, 'patch', `/restaurants/${r}/products/${id}`, {
        discount: { enabled: false, type: 'FIXED_AMOUNT', value: '30.00' },
      });
      expect(disabled.body.data.discount.state).toBe('DISABLED');

      const list = await call(owner, 'get', `/restaurants/${r}/products?categoryId=${world.categoryId}`);
      const row = list.body.data.find((p: { id: string }) => p.id === id);
      expect(row.discount.state).toBe('DISABLED');

      const removed = await call(owner, 'patch', `/restaurants/${r}/products/${id}`, { discount: null });
      expect(removed.body.data.discount).toBeNull();
      const stored = await prisma.product.findUniqueOrThrow({ where: { id } });
      expect(stored).toMatchObject({
        discountType: null,
        discountValue: null,
        discountEnabled: false,
        discountStartsOn: null,
        discountEndsOn: null,
      });
    });

    it('rejects invalid values with stable codes and never changes the product', async () => {
      const world = await seedWorld('staff-invalid', { price: '100.00' });
      const owner = await addStaff(world.restaurantId, 'OWNER');
      const url = `/restaurants/${world.restaurantId}/products/${world.productId}`;

      const over = await call(owner, 'patch', url, {
        discount: { enabled: true, type: 'PERCENTAGE', value: '120' },
      });
      const zero = await call(owner, 'patch', url, {
        discount: { enabled: true, type: 'FIXED_AMOUNT', value: '0' },
      });
      const exceeds = await call(owner, 'patch', url, {
        discount: { enabled: true, type: 'FIXED_AMOUNT', value: '150.00' },
      });
      const dates = await call(owner, 'patch', url, {
        discount: { enabled: true, type: 'PERCENTAGE', value: '10', startsOn: '2026-12-31', endsOn: '2026-12-01' },
      });
      const negative = await call(owner, 'patch', url, {
        discount: { enabled: true, type: 'FIXED_AMOUNT', value: '-5.00' },
      });
      const numeric = await call(owner, 'patch', url, {
        discount: { enabled: true, type: 'PERCENTAGE', value: 20 },
      });

      expect(over.status).toBe(400);
      expect(over.body.error.code).toBe('DISCOUNT_VALUE_INVALID');
      expect(zero.body.error.code).toBe('DISCOUNT_VALUE_INVALID');
      expect(exceeds.body.error.code).toBe('DISCOUNT_EXCEEDS_PRICE');
      expect(dates.body.error.code).toBe('DISCOUNT_DATES_INVALID');
      expect(negative.status).toBe(400);
      expect(numeric.status).toBe(400);
      const stored = await prisma.product.findUniqueOrThrow({ where: { id: world.productId } });
      expect(stored.discountType).toBeNull();
    });

    it('cannot lower the price below a fixed discount, and a price change keeps a valid discount', async () => {
      const world = await seedWorld('staff-price', { price: '100.00' });
      const owner = await addStaff(world.restaurantId, 'OWNER');
      const url = `/restaurants/${world.restaurantId}/products/${world.productId}`;
      await call(owner, 'patch', url, {
        discount: { enabled: true, type: 'FIXED_AMOUNT', value: '60.00' },
      });

      const tooLow = await call(owner, 'patch', url, { basePrice: '50.00' });
      const fine = await call(owner, 'patch', url, { basePrice: '120.00' });

      expect(tooLow.status).toBe(400);
      expect(tooLow.body.error.code).toBe('DISCOUNT_EXCEEDS_PRICE');
      expect(fine.status).toBe(200);
      expect(fine.body.data.discount.discountedPrice).toBe('60.00');
    });

    it('requires menu.manage with Restaurant-wide scope and never crosses tenants', async () => {
      const a = await seedWorld('perm-a');
      const b = await seedWorld('perm-b');
      const waiter = await addStaff(a.restaurantId, 'WAITER');
      const scoped = await addStaff(a.restaurantId, 'OWNER', {
        allBranches: false,
        branchIds: [a.branchId],
      });
      const foreign = await addStaff(b.restaurantId, 'OWNER');
      const body = { discount: { enabled: true, type: 'PERCENTAGE', value: '10' } };
      const url = `/restaurants/${a.restaurantId}/products/${a.productId}`;

      const waiterRes = await call(waiter, 'patch', url, body);
      const scopedRes = await call(scoped, 'patch', url, body);
      const foreignRes = await call(foreign, 'patch', url, body);
      const wrongRestaurant = await call(
        foreign,
        'patch',
        `/restaurants/${b.restaurantId}/products/${a.productId}`,
        body,
      );

      expect(waiterRes.status).toBe(403);
      expect(scopedRes.status).toBe(403);
      expect([403, 404]).toContain(foreignRes.status);
      expect(wrongRestaurant.status).toBe(404);
      const stored = await prisma.product.findUniqueOrThrow({ where: { id: a.productId } });
      expect(stored.discountType).toBeNull();
    });
  });

  // =============================================================== Guest menu

  describe('Guest menu', () => {
    it('shows the original price, the discounted price and the discount only while it applies', async () => {
      const world = await seedWorld('menu');

      const plain = await publicMenu(world.tableQr);
      expect(plain.body.data.menu.categories[0].products[0].discount).toBeNull();

      await setDiscount(world, {
        discountType: 'PERCENTAGE',
        discountValue: '20',
        discountEnabled: true,
      });
      const active = await publicMenu(world.tableQr);
      const product = active.body.data.menu.categories[0].products[0];
      expect(product.basePrice).toBe('100.00');
      expect(product.discount).toEqual({
        type: 'PERCENTAGE',
        value: '20.00',
        amountOff: '20.00',
        discountedPrice: '80.00',
        endsOn: null,
      });

      for (const inactive of [
        { discountEnabled: false },
        { discountStartsOn: new Date(`${shiftDays(todayUtc(), 3)}T00:00:00Z`) },
        { discountEndsOn: new Date(`${shiftDays(todayUtc(), -3)}T00:00:00Z`) },
      ]) {
        await setDiscount(world, {
          discountEnabled: true,
          discountStartsOn: null,
          discountEndsOn: null,
          ...inactive,
        });
        const res = await publicMenu(world.tableQr);
        expect(res.body.data.menu.categories[0].products[0].discount).toBeNull();
        expect(res.body.data.menu.categories[0].products[0].basePrice).toBe('100.00');
      }
    });

    it('is evaluated in the Branch timezone: the same product, different Branches, different answers', async () => {
      // Pago Pago (UTC-11) and Kiritimati (UTC+14) are 25 hours apart, so their calendar
      // dates always differ: a discount whose last day is "today in Pago Pago" is already
      // over in Kiritimati.
      const behind = 'Pacific/Pago_Pago';
      const ahead = 'Pacific/Kiritimati';
      const world = await seedWorld('tz', { timezone: behind });
      const aheadBranch = await prisma.branch.create({
        data: {
          publicId: `branch-${randomUUID()}`,
          restaurantId: world.restaurantId,
          name: 'Ahead Branch',
          status: 'ACTIVE',
          timezone: ahead,
        },
      });
      const aheadTable = await prisma.table.create({
        data: {
          restaurantId: world.restaurantId,
          branchId: aheadBranch.id,
          tableNumber: '1',
          status: 'ACTIVE',
        },
      });
      const aheadQr = await prisma.qrCode.create({
        data: {
          publicCode: `it-qr-${randomUUID()}`,
          restaurantId: world.restaurantId,
          branchId: aheadBranch.id,
          tableId: aheadTable.id,
          type: 'TABLE',
          status: 'ACTIVE',
        },
      });
      const lastDay = localDateIn(behind, new Date());
      await setDiscount(world, {
        discountType: 'PERCENTAGE',
        discountValue: '20',
        discountEnabled: true,
        discountEndsOn: new Date(`${lastDay}T00:00:00Z`),
      });

      const behindMenu = await publicMenu(world.tableQr);
      const aheadMenu = await publicMenu(aheadQr.publicCode);
      const behindOrder = await order(world.tableQr, {
        items: [{ productId: world.productId, quantity: 1 }],
      });
      const aheadOrder = await order(aheadQr.publicCode, {
        items: [{ productId: world.productId, quantity: 1 }],
      });

      expect(behindMenu.body.data.menu.categories[0].products[0].discount.discountedPrice).toBe('80.00');
      expect(aheadMenu.body.data.menu.categories[0].products[0].discount).toBeNull();
      expect(behindOrder.status).toBe(201);
      expect(behindOrder.body.data.total).toBe('80.00');
      expect(aheadOrder.status).toBe(201);
      expect(aheadOrder.body.data.total).toBe('100.00');
    });
  });

  // ========================================================= order creation

  describe('Order pricing', () => {
    it('Dine-In: net totals, original unit price, discount snapshot, session round intact', async () => {
      const world = await seedWorld('dinein');
      await setDiscount(world, {
        discountType: 'PERCENTAGE',
        discountValue: '20',
        discountEnabled: true,
      });

      const placed = await order(world.tableQr, {
        items: [{ productId: world.productId, quantity: 3 }],
      });

      expect(placed.status).toBe(201);
      expect(placed.body.data).toMatchObject({
        type: 'DINE_IN',
        subtotal: '240.00',
        deliveryFee: '0.00',
        discountTotal: '60.00',
        total: '240.00',
      });
      expect(placed.body.data.items[0]).toMatchObject({
        unitPrice: '100.00',
        quantity: 3,
        discountAmount: '60.00',
        lineTotal: '240.00',
      });
      const stored = await prisma.order.findUniqueOrThrow({
        where: { id: placed.body.data.id },
        include: { items: true },
      });
      expect(stored.tableSessionId).not.toBeNull();
      expect(stored.roundNumber).toBe(1);
      expect(stored.discountTotalAmount.toFixed(2)).toBe('60.00');
      expect(stored.items[0].discountTypeSnapshot).toBe('PERCENTAGE');
      expect(stored.items[0].discountValueSnapshot?.toFixed(2)).toBe('20.00');
    });

    it('Pickup and Delivery: the same discount, delivery fee added after, minimum order on the net subtotal', async () => {
      const world = await seedWorld('pickup-delivery', { minimumOrder: '90.00' });
      await setDiscount(world, {
        discountType: 'FIXED_AMOUNT',
        discountValue: '25',
        discountEnabled: true,
      });
      const customer = { customerName: 'Sara', customerPhone: '+20 100 000 0000' };

      const pickup = await order(world.genericQr, {
        ...customer,
        branchId: world.branchId,
        items: [{ productId: world.productId, quantity: 1 }],
      });
      // net 75.00 is below the 90.00 minimum even though the undiscounted 100.00 is not
      const belowMinimum = await order(world.genericQr, {
        ...customer,
        fulfillment: 'DELIVERY',
        branchId: world.branchId,
        deliveryZoneId: world.zoneId,
        deliveryAddress: '12 Nile Street',
        items: [{ productId: world.productId, quantity: 1 }],
      });
      const delivery = await order(world.genericQr, {
        ...customer,
        fulfillment: 'DELIVERY',
        branchId: world.branchId,
        deliveryZoneId: world.zoneId,
        deliveryAddress: '12 Nile Street',
        items: [{ productId: world.productId, quantity: 2 }],
      });

      expect(pickup.status).toBe(201);
      expect(pickup.body.data).toMatchObject({ type: 'PICKUP', subtotal: '75.00', total: '75.00' });
      expect(belowMinimum.status).toBe(400);
      expect(belowMinimum.body.error.code).toBe('DELIVERY_MINIMUM_NOT_MET');
      expect(delivery.status).toBe(201);
      expect(delivery.body.data).toMatchObject({
        type: 'DELIVERY',
        subtotal: '150.00',
        deliveryFee: '10.00',
        discountTotal: '50.00',
        total: '160.00',
      });
    });

    it('never trusts client prices: forged price fields are ignored', async () => {
      const world = await seedWorld('forged');
      await setDiscount(world, {
        discountType: 'PERCENTAGE',
        discountValue: '20',
        discountEnabled: true,
      });

      const placed = await order(world.tableQr, {
        total: '1.00',
        discountTotal: '99.00',
        items: [
          {
            productId: world.productId,
            quantity: 1,
            unitPrice: '1.00',
            discountAmount: '99.00',
            lineTotal: '1.00',
          },
        ],
      });

      expect(placed.status).toBe(201);
      expect(placed.body.data.total).toBe('80.00');
    });

    it('a stale expectedTotal creates nothing; a current one is accepted; an idempotent retry returns the original', async () => {
      const world = await seedWorld('stale');
      await setDiscount(world, {
        discountType: 'PERCENTAGE',
        discountValue: '20',
        discountEnabled: true,
      });
      const items = [{ productId: world.productId, quantity: 1 }];

      // the Guest saw 80.00; the discount ended before submission
      await setDiscount(world, { discountEnabled: false });
      const stale = await order(world.tableQr, { items, expectedTotal: '80.00' });
      expect(stale.status).toBe(422);
      expect(stale.body.error.code).toBe('PRICE_CHANGED');
      expect(stale.body.error.details.pricing).toMatchObject({
        subtotal: '100.00',
        discountTotal: '0.00',
        total: '100.00',
      });
      expect(
        await prisma.order.count({ where: { restaurantId: world.restaurantId } }),
      ).toBe(0);

      // the Guest confirms the new total and the order goes through
      const clientRequestId = randomUUID();
      const confirmed = await order(world.tableQr, { clientRequestId, items, expectedTotal: '100.00' });
      expect(confirmed.status).toBe(201);
      expect(confirmed.body.data.total).toBe('100.00');

      // a retry of the same request is idempotent even with a now-different expectation
      await setDiscount(world, { discountEnabled: true });
      const retry = await order(world.tableQr, { clientRequestId, items, expectedTotal: '80.00' });
      expect(retry.status).toBe(201);
      expect(retry.body.data.id).toBe(confirmed.body.data.id);
      expect(
        await prisma.order.count({ where: { restaurantId: world.restaurantId } }),
      ).toBe(1);
    });

    it('history never changes: editing, disabling or deleting the discount leaves past orders as they were', async () => {
      const world = await seedWorld('history');
      const owner = await addStaff(world.restaurantId, 'OWNER');
      const r = world.restaurantId;
      await setDiscount(world, {
        discountType: 'PERCENTAGE',
        discountValue: '20',
        discountEnabled: true,
      });
      const placed = await order(world.tableQr, {
        items: [{ productId: world.productId, quantity: 2 }],
      });
      const id = placed.body.data.id as string;
      const before = await prisma.order.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });

      await call(owner, 'patch', `/restaurants/${r}/products/${world.productId}`, {
        basePrice: '500.00',
        discount: { enabled: true, type: 'PERCENTAGE', value: '50' },
      });
      await call(owner, 'patch', `/restaurants/${r}/products/${world.productId}`, { discount: null });
      const after = await prisma.order.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });
      const detail = await call(owner, 'get', `/restaurants/${r}/orders/${id}`);

      expect(after.totalAmount.toFixed(2)).toBe(before.totalAmount.toFixed(2));
      expect(after.discountTotalAmount.toFixed(2)).toBe('40.00');
      expect(after.items[0].unitPrice.toFixed(2)).toBe('100.00');
      expect(after.items[0].lineTotal.toFixed(2)).toBe('160.00');
      expect(after.items[0].discountValueSnapshot?.toFixed(2)).toBe('20.00');
      expect(detail.body.data.items[0]).toMatchObject({
        unitPrice: '100.00',
        discountAmount: '40.00',
        lineTotal: '160.00',
      });
      expect(detail.body.data.discountTotal).toBe('40.00');
    });

    it('legacy orders (no discount columns set) read as zero discount', async () => {
      const world = await seedWorld('legacy');
      const owner = await addStaff(world.restaurantId, 'OWNER');
      const placed = await order(world.tableQr, {
        items: [{ productId: world.productId, quantity: 1 }],
      });

      const detail = await call(
        owner,
        'get',
        `/restaurants/${world.restaurantId}/orders/${placed.body.data.id}`,
      );

      expect(placed.body.data.discountTotal).toBe('0.00');
      expect(detail.body.data.discountTotal).toBe('0.00');
      expect(detail.body.data.items[0].discountAmount).toBe('0.00');
    });
  });

  // ================================================================ database

  describe('database invariants', () => {
    it('refuses an invalid discount written directly (defense in depth)', async () => {
      const world = await seedWorld('db-check');

      await expect(
        setDiscount(world, { discountType: 'PERCENTAGE', discountValue: '150' }),
      ).rejects.toThrow();
      await expect(
        setDiscount(world, { discountType: 'FIXED_AMOUNT', discountValue: '-1' }),
      ).rejects.toThrow();
      await expect(
        setDiscount(world, {
          discountType: 'PERCENTAGE',
          discountValue: '10',
          discountStartsOn: new Date('2026-12-31T00:00:00Z'),
          discountEndsOn: new Date('2026-12-01T00:00:00Z'),
        }),
      ).rejects.toThrow();
      await expect(setDiscount(world, { discountEnabled: true })).rejects.toThrow();
    });
  });
});
