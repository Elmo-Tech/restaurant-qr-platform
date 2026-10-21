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
 * Guest menu template (DEC-044) against REAL PostgreSQL through the real Nest app: the Staff
 * switch (Restaurant-wide authority) and what the public menu and /auth/me report.
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
}

describeSandbox('Guest menu template (real PostgreSQL)', () => {
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

  // ================================================================== tests

  const base = (restaurantId: string) => `/api/v1/restaurants/${restaurantId}`;

  async function patch(
    staff: Staff,
    path: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .patch(path)
      .set('Cookie', await login(staff))
      .set('Origin', origin)
      .send(body);
  }

  it('is CLASSIC by default and the Owner can change it; the menu and /auth/me report it', async () => {
    const world = await seedWorld('tpl-set');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = base(world.restaurantId);

    expect(
      (await publicMenu(world.genericQr)).body.data.context.restaurant
        .menuTemplate,
    ).toBe('CLASSIC');

    for (const template of [
      'GALLERY',
      'LIST',
      'MENU',
      'FLOATING',
      'CENTERED',
      'COMPACT',
      'EDITORIAL',
      'CLASSIC',
    ]) {
      const res = await patch(owner, `${r}/menu-template`, {
        menuTemplate: template,
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ menuTemplate: template });
      expect(
        (await publicMenu(world.genericQr)).body.data.context.restaurant
          .menuTemplate,
      ).toBe(template);
      // the Table QR menu uses the same template
      expect(
        (await publicMenu(world.tableQr)).body.data.context.restaurant
          .menuTemplate,
      ).toBe(template);
    }

    await patch(owner, `${r}/menu-template`, { menuTemplate: 'LIST' });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', await login(owner));
    expect(me.body.data.memberships[0].restaurant.menuTemplate).toBe('LIST');
  });

  it('rejects an unknown template and anyone without Restaurant management', async () => {
    const world = await seedWorld('tpl-guard');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const waiter = await addStaff(world.restaurantId, 'WAITER');
    const r = base(world.restaurantId);

    const bad = await patch(owner, `${r}/menu-template`, {
      menuTemplate: 'FANCY',
    });
    expect(bad.status).toBe(400);
    expect((await patch(owner, `${r}/menu-template`, {})).status).toBe(400);

    const denied = await patch(waiter, `${r}/menu-template`, {
      menuTemplate: 'GALLERY',
    });
    expect(denied.status).toBe(403);

    const row = await prisma.restaurant.findUniqueOrThrow({
      where: { id: world.restaurantId },
    });
    expect(row.menuTemplate).toBe('CLASSIC');
  });
});
