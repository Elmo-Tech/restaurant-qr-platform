import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/**
 * Kitchen View V1, end to end: `GET /restaurants/{id}/kitchen/orders`
 * (kitchen.view, Branch scoped) lists only accepted orders still in the
 * kitchen with exactly what is needed to prepare them (items, sizes, options,
 * note), oldest first; the existing status route moves a ticket forward with
 * `kitchen.update` and refuses the front-of-house steps.
 */
describe('Kitchen board (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHasher: PasswordHasherService;
  const restaurantIds: string[] = [];
  const userIds: string[] = [];

  const PASSWORD = 'correct horse battery staple';
  const ORIGIN = 'http://localhost:3000';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
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
    passwordHasher = app.get(PasswordHasherService);
  });

  afterEach(async () => {
    for (const restaurantId of restaurantIds.splice(0)) {
      await prisma.orderStatusEvent.deleteMany({ where: { restaurantId } });
      await prisma.orderItemModifier.deleteMany({
        where: { orderItem: { order: { restaurantId } } },
      });
      await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
      await prisma.order.deleteMany({ where: { restaurantId } });
      await prisma.qrCode.deleteMany({ where: { restaurantId } });
      await prisma.table.deleteMany({ where: { restaurantId } });
      await prisma.modifierOption.deleteMany({ where: { restaurantId } });
      await prisma.modifierGroup.deleteMany({ where: { restaurantId } });
      await prisma.productTranslation.deleteMany({
        where: { product: { restaurantId } },
      });
      await prisma.product.deleteMany({ where: { restaurantId } });
      await prisma.categoryTranslation.deleteMany({
        where: { category: { restaurantId } },
      });
      await prisma.category.deleteMany({ where: { restaurantId } });
      await prisma.menuTranslation.deleteMany({
        where: { menu: { restaurantId } },
      });
      await prisma.menu.deleteMany({ where: { restaurantId } });
      await prisma.restaurantLocale.deleteMany({ where: { restaurantId } });
      await prisma.restaurantMembershipBranch.deleteMany({
        where: { membership: { restaurantId } },
      });
      await prisma.restaurantMembership.deleteMany({ where: { restaurantId } });
      await prisma.restaurantRole.deleteMany({ where: { restaurantId } });
      await prisma.branch.deleteMany({ where: { restaurantId } });
      await prisma.restaurant.delete({ where: { id: restaurantId } });
    }
    for (const userId of userIds.splice(0)) {
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  /** One Restaurant with two Branches (A, B), each with a Table and a QR. */
  async function seed() {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `rest-${randomUUID()}`,
        name: 'Kitchen Test',
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
      },
    });
    restaurantIds.push(restaurant.id);
    const branches: { id: string; tableId: string; qrId: string }[] = [];
    for (const name of ['A', 'B']) {
      const branch = await prisma.branch.create({
        data: {
          publicId: `branch-${randomUUID()}`,
          restaurantId: restaurant.id,
          name: `Branch ${name}`,
          status: 'ACTIVE',
          timezone: 'Africa/Cairo',
        },
      });
      const table = await prisma.table.create({
        data: {
          restaurantId: restaurant.id,
          branchId: branch.id,
          tableNumber: `T-${name}`,
          status: 'ACTIVE',
        },
      });
      const qr = await prisma.qrCode.create({
        data: {
          publicCode: `qr-${randomUUID()}`,
          restaurantId: restaurant.id,
          branchId: branch.id,
          tableId: table.id,
          type: 'TABLE',
          status: 'ACTIVE',
        },
      });
      branches.push({ id: branch.id, tableId: table.id, qrId: qr.id });
    }
    const menu = await prisma.menu.create({
      data: {
        restaurantId: restaurant.id,
        nameInternal: 'Main',
        displayOrder: 0,
        status: 'ACTIVE',
        isPrimary: true,
      },
    });
    const category = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        menuId: menu.id,
        status: 'ACTIVE',
        displayOrder: 0,
      },
    });
    const product = await prisma.product.create({
      data: {
        publicId: `product-${randomUUID()}`,
        restaurantId: restaurant.id,
        categoryId: category.id,
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        basePrice: '80.00',
        displayOrder: 0,
        allowCustomerNotes: false,
        featured: false,
      },
    });
    const group = await prisma.modifierGroup.create({
      data: {
        restaurantId: restaurant.id,
        productId: product.id,
        status: 'ACTIVE',
        minimumSelections: 0,
        maximumSelections: 1,
        displayOrder: 0,
      },
    });
    const option = await prisma.modifierOption.create({
      data: {
        restaurantId: restaurant.id,
        modifierGroupId: group.id,
        status: 'ACTIVE',
        priceAdjustment: '0.00',
        displayOrder: 0,
        priceIsOverridden: false,
      },
    });
    return { restaurant, branches, product, group, option };
  }

  async function placeOrder(
    s: Awaited<ReturnType<typeof seed>>,
    branchIndex: number,
    status: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED',
    createdAt: Date,
    options: { notes?: string } = {},
  ) {
    const branch = s.branches[branchIndex];
    const order = await prisma.order.create({
      data: {
        restaurantId: s.restaurant.id,
        branchId: branch.id,
        tableId: branch.tableId,
        qrCodeId: branch.qrId,
        clientRequestId: randomUUID(),
        status,
        type: 'DINE_IN',
        currencyCode: 'EGP',
        totalAmount: '80.00',
        subtotalAmount: '80.00',
        deliveryFeeAmount: '0.00',
        customerNotesSnapshot: options.notes ?? null,
        createdAt,
      },
    });
    await prisma.orderStatusEvent.create({
      data: {
        restaurantId: s.restaurant.id,
        branchId: branch.id,
        orderId: order.id,
        previousStatus: null,
        newStatus: status,
        transitionedAt: new Date(createdAt.getTime() + 60_000),
      },
    });
    const item = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: s.product.id,
        productNameSnapshot: 'Pizza',
        unitPrice: '80.00',
        quantity: 2,
        lineTotal: '160.00',
      },
    });
    await prisma.orderItemModifier.create({
      data: {
        orderItemId: item.id,
        modifierGroupId: s.group.id,
        modifierOptionId: s.option.id,
        modifierGroupNameSnapshot: 'Dough',
        modifierOptionNameSnapshot: 'Thin',
        priceAdjustmentSnapshot: '0.00',
        displayOrder: 0,
      },
    });
    return order;
  }

  async function login(
    restaurantId: string,
    role: 'OWNER' | 'KITCHEN' | 'CASHIER',
    branchIds: string[] | 'all',
  ) {
    const email = `kitchen-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email.toLowerCase(),
        passwordHash: await passwordHasher.hashPassword(PASSWORD),
        status: 'ACTIVE',
      },
    });
    userIds.push(user.id);
    const membership = await prisma.restaurantMembership.create({
      data: {
        restaurantId,
        userId: user.id,
        role,
        roleId: (await ensureStarterRole(prisma, restaurantId, role)).id,
        status: 'ACTIVE',
        allBranches: branchIds === 'all',
      },
    });
    if (branchIds !== 'all') {
      for (const branchId of branchIds) {
        await prisma.restaurantMembershipBranch.create({
          data: { restaurantMembershipId: membership.id, branchId },
        });
      }
    }
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const setCookie = response.headers['set-cookie'] as unknown as string[];
    const cookie = setCookie.find((c) => c.startsWith('restaurant_session='));
    if (!cookie) throw new Error('no session cookie');
    return cookie.split(';')[0];
  }

  const board = (restaurantId: string, cookie: string, branchId?: string) =>
    request(app.getHttpServer())
      .get(
        `/api/v1/restaurants/${restaurantId}/kitchen/orders${branchId ? `?branchId=${branchId}` : ''}`,
      )
      .set('Cookie', cookie);

  interface Ticket {
    id: string;
    status: string;
    branch: { name: string };
    notes: string | null;
    statusSince: string;
    items: {
      name: string;
      quantity: number;
      modifiers: { optionName: string }[];
    }[];
  }
  const tickets = (res: request.Response) =>
    (res.body as { data: Ticket[] }).data;

  it('lists only accepted, preparing and ready orders, oldest first, with what the kitchen needs', async () => {
    const s = await seed();
    const cookie = await login(s.restaurant.id, 'KITCHEN', 'all');
    const base = Date.now() - 3_600_000;
    const old = await placeOrder(s, 0, 'ACCEPTED', new Date(base), {
      notes: 'No onions',
    });
    const mid = await placeOrder(s, 0, 'PREPARING', new Date(base + 600_000));
    const ready = await placeOrder(s, 1, 'READY', new Date(base + 1_200_000));
    await placeOrder(s, 0, 'PENDING', new Date(base + 1_800_000));
    await placeOrder(s, 0, 'SERVED', new Date(base + 2_400_000));

    const res = await board(s.restaurant.id, cookie).expect(200);
    const list = tickets(res);

    expect(list.map((t) => t.id)).toEqual([old.id, mid.id, ready.id]);
    expect(list.map((t) => t.status)).toEqual([
      'ACCEPTED',
      'PREPARING',
      'READY',
    ]);
    expect(list[0].notes).toBe('No onions');
    expect(list[0].items[0]).toMatchObject({
      name: 'Pizza',
      quantity: 2,
      modifiers: [{ optionName: 'Thin' }],
    });
    // the ticket's own timer starts when it entered its status (one minute after creation)
    expect(new Date(list[0].statusSince).getTime()).toBe(base + 60_000);
    // never prices or phone numbers
    expect(JSON.stringify(list[0])).not.toMatch(
      /Amount|unitPrice|lineTotal|phone/i,
    );
  });

  it('is scoped to the Membership Branches and narrows with ?branchId', async () => {
    const s = await seed();
    await placeOrder(s, 0, 'ACCEPTED', new Date(Date.now() - 60_000));
    await placeOrder(s, 1, 'ACCEPTED', new Date(Date.now() - 30_000));

    const onlyA = await login(s.restaurant.id, 'KITCHEN', [s.branches[0].id]);
    expect(
      tickets(await board(s.restaurant.id, onlyA).expect(200)).map(
        (t) => t.branch.name,
      ),
    ).toEqual(['Branch A']);
    // asking for a Branch outside the scope never widens it: the answer stays inside the Membership scope
    expect(
      tickets(
        await board(s.restaurant.id, onlyA, s.branches[1].id).expect(200),
      ).map((t) => t.branch.name),
    ).toEqual(['Branch A']);

    const everything = await login(s.restaurant.id, 'OWNER', 'all');
    expect(
      tickets(await board(s.restaurant.id, everything).expect(200)),
    ).toHaveLength(2);
    expect(
      tickets(
        await board(s.restaurant.id, everything, s.branches[1].id).expect(200),
      ).map((t) => t.branch.name),
    ).toEqual(['Branch B']);
  });

  it('needs kitchen.view and never leaks another Restaurant', async () => {
    const own = await seed();
    const foreign = await seed();
    await placeOrder(foreign, 0, 'ACCEPTED', new Date());

    const cashier = await login(own.restaurant.id, 'CASHIER', 'all');
    await board(own.restaurant.id, cashier).expect(403);

    const kitchen = await login(own.restaurant.id, 'KITCHEN', 'all');
    await request(app.getHttpServer())
      .get(`/api/v1/restaurants/${own.restaurant.id}/kitchen/orders`)
      .expect(401);
    expect(
      tickets(await board(own.restaurant.id, kitchen).expect(200)),
    ).toEqual([]);
    const res = await board(foreign.restaurant.id, kitchen);
    expect([403, 404]).toContain(res.status);
  });

  it('lets the kitchen start and finish preparing, but not accept or serve', async () => {
    const s = await seed();
    const kitchen = await login(s.restaurant.id, 'KITCHEN', 'all');
    const accepted = await placeOrder(
      s,
      0,
      'ACCEPTED',
      new Date(Date.now() - 120_000),
    );
    const patch = (to: string, expectedStatus: string) =>
      request(app.getHttpServer())
        .patch(
          `/api/v1/restaurants/${s.restaurant.id}/orders/${accepted.id}/status`,
        )
        .set('Cookie', kitchen)
        .set('Origin', ORIGIN)
        .send({ expectedStatus, status: to });

    await patch('PREPARING', 'ACCEPTED').expect(200);
    let list = tickets(await board(s.restaurant.id, kitchen).expect(200));
    expect(list[0].status).toBe('PREPARING');

    // a second Start on an already-started ticket is a clean conflict, not a double move
    await patch('PREPARING', 'ACCEPTED').expect(409);

    await patch('READY', 'PREPARING').expect(200);
    list = tickets(await board(s.restaurant.id, kitchen).expect(200));
    expect(list[0].status).toBe('READY');

    // serving is front of house, not the kitchen
    await patch('SERVED', 'READY').expect(403);
  });
});
