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
 * Branch opening hours (DEC-042) against REAL PostgreSQL through the real Nest app: the
 * Staff write rules, the Guest menu badge, and that a closed Branch refuses Pickup and
 * Delivery orders while Dine-in is never blocked.
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

describeSandbox('Branch opening hours (real PostgreSQL)', () => {
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

  const publicMenu = (qr: string) =>
    request(app.getHttpServer()).get(`/api/v1/public/qr/${qr}/menu`);

  const placeOrder = (qr: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/orders`)
      .send({ clientRequestId: randomUUID(), ...body });

  // ================================================================== tests

  /** Weekday (0 = Sunday) in the branch timezone (UTC+2, fixed). */
  const localDay = (offset = 0): number =>
    (new Date(Date.now() + 2 * 3600 * 1000).getUTCDay() + offset + 7) % 7;
  const allDays = (opens: string, closes: string) =>
    Array.from({ length: 7 }, (_, day) => ({
      day,
      intervals: [{ opens, closes }],
    }));
  const onlyOn = (day: number) =>
    Array.from({ length: 7 }, (_, d) => ({
      day: d,
      intervals: d === day ? [{ opens: '12:00', closes: '23:00' }] : [],
    }));

  const hoursUrl = (restaurantId: string, branchId: string) =>
    `/api/v1/restaurants/${restaurantId}/branches/${branchId}/hours`;

  async function putHours(
    staff: Staff,
    world: World,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .put(hoursUrl(world.restaurantId, world.branchId))
      .set('Cookie', await login(staff))
      .set('Origin', origin)
      .send(body);
  }

  it('saves, validates and reads back a weekly schedule', async () => {
    const world = await seedWorld('hours-staff');
    const owner = await addStaff(world.restaurantId, 'OWNER');

    const initial = await request(app.getHttpServer())
      .get(hoursUrl(world.restaurantId, world.branchId))
      .set('Cookie', await login(owner))
      .expect(200);
    expect(initial.body.data).toMatchObject({
      mode: 'ALWAYS_OPEN',
      temporarilyClosed: false,
      status: null,
    });
    expect(initial.body.data.days).toHaveLength(7);

    const bad = await putHours(owner, world, {
      mode: 'SCHEDULE',
      temporarilyClosed: false,
      days: [
        {
          day: 0,
          intervals: [
            { opens: '10:00', closes: '14:00' },
            { opens: '13:00', closes: '16:00' },
          ],
        },
      ],
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('INVALID_HOURS');
    const empty = await putHours(owner, world, {
      mode: 'SCHEDULE',
      temporarilyClosed: false,
      days: [],
    });
    expect(empty.status).toBe(422);
    expect(empty.body.error.code).toBe('HOURS_SCHEDULE_EMPTY');
    const malformed = await putHours(owner, world, {
      mode: 'SCHEDULE',
      temporarilyClosed: false,
      days: [{ day: 0, intervals: [{ opens: '9am', closes: '5pm' }] }],
    });
    expect(malformed.status).toBe(400);

    const saved = await putHours(owner, world, {
      mode: 'SCHEDULE',
      temporarilyClosed: false,
      days: [
        {
          day: 5,
          intervals: [
            { opens: '12:00', closes: '23:30' },
            { opens: '00:00', closes: '00:30' },
          ],
        },
        { day: 6, intervals: [{ opens: '22:00', closes: '02:00' }] },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.days[5].intervals).toEqual([
      { opens: '00:00', closes: '00:30' },
      { opens: '12:00', closes: '23:30' },
    ]);
    expect(saved.body.data.days[6].intervals).toEqual([
      { opens: '22:00', closes: '02:00' },
    ]);
    expect(
      await prisma.branchOpeningHour.count({
        where: { branchId: world.branchId },
      }),
    ).toBe(3);

    // A later save replaces, never appends; ALWAYS_OPEN clears the schedule.
    await putHours(owner, world, {
      mode: 'ALWAYS_OPEN',
      temporarilyClosed: false,
    }).then((r) => expect(r.status).toBe(200));
    expect(
      await prisma.branchOpeningHour.count({
        where: { branchId: world.branchId },
      }),
    ).toBe(0);
  });

  it('needs branches.manage and the right restaurant', async () => {
    const world = await seedWorld('hours-auth');
    const other = await seedWorld('hours-auth-other');
    const cashier = await addStaff(world.restaurantId, 'CASHIER');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const denied = await putHours(cashier, world, {
      mode: 'ALWAYS_OPEN',
      temporarilyClosed: true,
    });
    expect(denied.status).toBe(403);
    const noCsrf = await request(app.getHttpServer())
      .put(hoursUrl(world.restaurantId, world.branchId))
      .set('Cookie', await login(owner))
      .send({ mode: 'ALWAYS_OPEN', temporarilyClosed: true });
    expect(noCsrf.status).toBe(403);
    // another restaurant's branch is never reachable
    const foreign = await request(app.getHttpServer())
      .put(hoursUrl(world.restaurantId, other.branchId))
      .set('Cookie', await login(owner))
      .set('Origin', origin)
      .send({ mode: 'ALWAYS_OPEN', temporarilyClosed: true });
    expect(foreign.status).toBe(404);
    expect(
      (await prisma.branch.findUniqueOrThrow({ where: { id: world.branchId } }))
        .temporarilyClosed,
    ).toBe(false);
  });

  it('shows the badge on the Guest menu and a closed Branch refuses Pickup and Delivery but not Dine-in', async () => {
    const world = await seedWorld('hours-guest');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const items = [{ productId: world.productId, quantity: 1 }];
    const pickup = {
      items,
      fulfillment: 'PICKUP',
      customerName: 'Mona',
      customerPhone: '01000000000',
    };
    const delivery = {
      items,
      fulfillment: 'DELIVERY',
      customerName: 'Mona',
      customerPhone: '01000000000',
      deliveryAddress: '1 Nile St',
      deliveryZoneId: world.zoneId,
    };

    // Always open: no badge, orders accepted.
    const plain = await publicMenu(world.genericQr);
    expect(plain.body.data.context.restaurant.hours).toBeNull();
    expect((await placeOrder(world.genericQr, pickup)).status).toBe(201);

    // Open all day today: badge says open, orders accepted.
    await putHours(owner, world, {
      mode: 'SCHEDULE',
      temporarilyClosed: false,
      days: allDays('00:00', '23:59'),
    }).then((r) => expect(r.status).toBe(200));
    const open = await publicMenu(world.genericQr);
    expect(open.body.data.context.restaurant.hours).toMatchObject({
      open: true,
      temporarilyClosed: false,
    });
    expect(open.body.data.context.pickupBranches[0].hours).toMatchObject({
      open: true,
    });
    expect((await placeOrder(world.genericQr, delivery)).status).toBe(201);

    // Open only on another weekday: closed now, with the next opening, on both QR kinds.
    await putHours(owner, world, {
      mode: 'SCHEDULE',
      temporarilyClosed: false,
      days: onlyOn(localDay(1)),
    }).then((r) => expect(r.status).toBe(200));
    const closed = await publicMenu(world.genericQr);
    expect(closed.body.data.context.restaurant.hours).toMatchObject({
      open: false,
      temporarilyClosed: false,
      opensAt: { dayOffset: 1, time: '12:00' },
    });
    const tableMenu = await publicMenu(world.tableQr);
    expect(tableMenu.body.data.context.restaurant.hours).toMatchObject({
      open: false,
    });

    const refusedPickup = await placeOrder(world.genericQr, pickup);
    expect(refusedPickup.status).toBe(409);
    expect(refusedPickup.body.error.code).toBe('BRANCH_CLOSED');
    expect((await placeOrder(world.genericQr, delivery)).body.error.code).toBe(
      'BRANCH_CLOSED',
    );
    // Dine-in is never blocked by opening hours.
    expect((await placeOrder(world.tableQr, { items })).status).toBe(201);

    // Manual closure beats an open schedule.
    await putHours(owner, world, {
      mode: 'SCHEDULE',
      temporarilyClosed: true,
      days: allDays('00:00', '23:59'),
    }).then((r) => expect(r.status).toBe(200));
    const manual = await publicMenu(world.genericQr);
    expect(manual.body.data.context.restaurant.hours).toMatchObject({
      open: false,
      temporarilyClosed: true,
    });
    expect((await placeOrder(world.genericQr, pickup)).body.error.code).toBe(
      'BRANCH_CLOSED',
    );

    // Reopening makes orders work again.
    await putHours(owner, world, {
      mode: 'ALWAYS_OPEN',
      temporarilyClosed: false,
    }).then((r) => expect(r.status).toBe(200));
    expect((await placeOrder(world.genericQr, pickup)).status).toBe(201);
  });
});
