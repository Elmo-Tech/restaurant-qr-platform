/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment --
 * supertest exposes `response.body` as `any`; the assertions below read the JSON
 * envelope directly, exactly like the other HTTP e2e specs in this folder. */
import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import type { StarterRoleKind } from './../src/auth/permission/role-permissions';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PrismaService } from './../src/database/prisma.service';
import { ImageStorageService } from './../src/storage/image-storage.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/**
 * V1 Final Features Batch 1 against REAL PostgreSQL through the real Nest app:
 * Restaurant cover image (upload / replace / remove, validation, permissions,
 * tenant isolation, Guest context) and bilingual Branch / Delivery zone names
 * (Staff writes, Guest resolution EN/AR, legacy fallback, immutable order
 * snapshots, tenant and Branch isolation, migration backfill).
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
  genericQr: string;
  productId: string;
}

/** Header-only PNG: a real signature plus IHDR, enough for the sniff and dimension reader. */
function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'latin1');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describeSandbox('Restaurant cover image and bilingual names (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hasher: PasswordHasherService;
  let storage: ImageStorageService;
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
    storage = app.get(ImageStorageService, { strict: false });
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
        timezone: 'Africa/Cairo',
      },
    });
    const qr = await prisma.qrCode.create({
      data: {
        publicCode: `it-qr-${randomUUID()}`,
        restaurantId: restaurant.id,
        type: 'GENERIC',
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
      genericQr: qr.publicCode,
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

  async function uploadCover(staff: Staff, restaurantId: string, buffer: Buffer, mimetype = 'image/png') {
    return request(app.getHttpServer())
      .post(`/api/v1/restaurants/${restaurantId}/cover`)
      .set('Cookie', await login(staff))
      .set('Origin', origin)
      .attach('image', buffer, { filename: 'cover.png', contentType: mimetype });
  }

  function assetFileExists(assetPath: string): boolean {
    return existsSync(join(storage.getUploadDir(), assetPath.replace(/^\/media\//, '')));
  }

  const publicMenu = (qr: string, lang: string) =>
    request(app.getHttpServer()).get(`/api/v1/public/qr/${qr}/menu?lang=${lang}`);

  // ============================================================== cover image

  describe('Restaurant cover image', () => {
    it('uploads, shows in /auth/me and the Guest context, replaces (old file removed) and removes', async () => {
      const world = await seedWorld('cover-flow');
      const manager = await addStaff(world.restaurantId, 'OWNER');
      const r = world.restaurantId;

      const first = await uploadCover(manager, r, png(1600, 900));
      expect(first.status).toBe(200);
      const firstPath = first.body.data.coverAssetPath as string;
      expect(firstPath).toMatch(/^\/media\/[0-9a-f-]+\.png$/);
      expect(first.body.data.logoAssetPath).toBeNull();
      expect(assetFileExists(firstPath)).toBe(true);

      const me = await call(manager, 'get', '/auth/me');
      expect(me.body.data.memberships[0].restaurant.coverAssetPath).toBe(firstPath);
      const guest = await publicMenu(world.genericQr, 'en');
      expect(guest.body.data.context.restaurant.coverAssetPath).toBe(firstPath);

      const second = await uploadCover(manager, r, png(1920, 800));
      expect(second.status).toBe(200);
      const secondPath = second.body.data.coverAssetPath as string;
      expect(secondPath).not.toBe(firstPath);
      expect(assetFileExists(secondPath)).toBe(true);
      expect(assetFileExists(firstPath)).toBe(false);

      const removed = await call(manager, 'delete', `/restaurants/${r}/cover`);
      expect(removed.status).toBe(204);
      expect(assetFileExists(secondPath)).toBe(false);
      const again = await call(manager, 'delete', `/restaurants/${r}/cover`);
      expect(again.status).toBe(204);
      const after = await publicMenu(world.genericQr, 'en');
      expect(after.body.data.context.restaurant.coverAssetPath).toBeNull();
      expect(
        (await prisma.restaurant.findUniqueOrThrow({ where: { id: r } })).coverAssetPath,
      ).toBeNull();
    });

    it('rejects invalid images with stable codes and stores nothing', async () => {
      const world = await seedWorld('cover-invalid');
      const manager = await addStaff(world.restaurantId, 'OWNER');
      const r = world.restaurantId;

      const tooSmall = await uploadCover(manager, r, png(640, 360));
      const portrait = await uploadCover(manager, r, png(900, 1600));
      const notAnImage = await uploadCover(manager, r, Buffer.from('plain text, not a picture'));
      const wrongType = await uploadCover(manager, r, png(1600, 900), 'image/gif');
      const missing = await request(app.getHttpServer())
        .post(`/api/v1/restaurants/${r}/cover`)
        .set('Cookie', await login(manager))
        .set('Origin', origin);

      expect(tooSmall.status).toBe(400);
      expect(tooSmall.body.error.code).toBe('COVER_IMAGE_TOO_SMALL');
      expect(portrait.status).toBe(400);
      expect(portrait.body.error.code).toBe('COVER_IMAGE_INVALID_ASPECT_RATIO');
      expect(notAnImage.body.error.code).toBe('INVALID_IMAGE_TYPE');
      expect(wrongType.body.error.code).toBe('INVALID_IMAGE_TYPE');
      expect(missing.body.error.code).toBe('IMAGE_REQUIRED');
      expect(
        (await prisma.restaurant.findUniqueOrThrow({ where: { id: r } })).coverAssetPath,
      ).toBeNull();
    });

    it('requires restaurant.manage with Restaurant-wide scope, a session, and CSRF; never crosses tenants', async () => {
      const a = await seedWorld('cover-a');
      const b = await seedWorld('cover-b');
      const manager = await addStaff(a.restaurantId, 'OWNER');
      const waiter = await addStaff(a.restaurantId, 'WAITER');
      const scoped = await addStaff(a.restaurantId, 'OWNER', {
        allBranches: false,
        branchIds: [a.branchId],
      });
      const foreignManager = await addStaff(b.restaurantId, 'OWNER');

      expect((await uploadCover(waiter, a.restaurantId, png(1600, 900))).status).toBe(403);
      expect((await uploadCover(scoped, a.restaurantId, png(1600, 900))).status).toBe(403);
      const foreign = await uploadCover(foreignManager, a.restaurantId, png(1600, 900));
      expect([403, 404]).toContain(foreign.status);
      const anonymous = await request(app.getHttpServer())
        .post(`/api/v1/restaurants/${a.restaurantId}/cover`)
        .set('Origin', origin)
        .attach('image', png(1600, 900), { filename: 'c.png', contentType: 'image/png' });
      expect(anonymous.status).toBe(401);
      const noOrigin = await request(app.getHttpServer())
        .post(`/api/v1/restaurants/${a.restaurantId}/cover`)
        .set('Cookie', await login(manager))
        .attach('image', png(1600, 900), { filename: 'c.png', contentType: 'image/png' });
      expect(noOrigin.status).toBe(403);
      expect((await call(waiter, 'delete', `/restaurants/${a.restaurantId}/cover`)).status).toBe(403);

      for (const id of [a.restaurantId, b.restaurantId]) {
        expect(
          (await prisma.restaurant.findUniqueOrThrow({ where: { id } })).coverAssetPath,
        ).toBeNull();
      }
    });

    it('does not touch the logo and a logo upload does not touch the cover', async () => {
      const world = await seedWorld('cover-logo');
      const manager = await addStaff(world.restaurantId, 'OWNER');
      const r = world.restaurantId;

      const cover = await uploadCover(manager, r, png(1600, 900));
      const logo = await request(app.getHttpServer())
        .post(`/api/v1/restaurants/${r}/logo`)
        .set('Cookie', await login(manager))
        .set('Origin', origin)
        .attach('image', png(300, 300), { filename: 'logo.png', contentType: 'image/png' });

      expect(logo.status).toBe(200);
      expect(logo.body.data.coverAssetPath).toBe(cover.body.data.coverAssetPath);
      expect(logo.body.data.logoAssetPath).not.toBeNull();

      await call(manager, 'delete', `/restaurants/${r}/cover`);
      const row = await prisma.restaurant.findUniqueOrThrow({ where: { id: r } });
      expect(row.coverAssetPath).toBeNull();
      expect(row.logoAssetPath).toBe(logo.body.data.logoAssetPath);
      await call(manager, 'delete', `/restaurants/${r}/logo`);
    });
  });

  // =============================================================== translations

  describe('Bilingual Branch names', () => {
    it('create and update write translation rows; the default locale keeps the legacy name in step', async () => {
      const world = await seedWorld('branch-tr');
      const manager = await addStaff(world.restaurantId, 'OWNER');
      const r = world.restaurantId;

      const created = await call(manager, 'post', `/restaurants/${r}/branches`, {
        name: 'Maadi',
        timezone: 'Africa/Cairo',
        translations: [{ locale: 'ar', name: 'المعادي' }],
      });
      expect(created.status).toBe(201);
      expect(created.body.data.name).toBe('Maadi');
      expect(created.body.data.translations).toEqual([
        { locale: 'ar', name: 'المعادي' },
        { locale: 'en', name: 'Maadi' },
      ]);
      const branchId = created.body.data.id as string;

      const renamed = await call(manager, 'patch', `/restaurants/${r}/branches/${branchId}`, {
        translations: [{ locale: 'en', name: 'Maadi Branch' }],
      });
      expect(renamed.status).toBe(200);
      expect(renamed.body.data.name).toBe('Maadi Branch');

      const list = await call(manager, 'get', `/restaurants/${r}/branches`);
      const row = list.body.data.find((b: { id: string }) => b.id === branchId);
      expect(row.translations).toEqual([
        { locale: 'ar', name: 'المعادي' },
        { locale: 'en', name: 'Maadi Branch' },
      ]);

      const cleared = await call(manager, 'patch', `/restaurants/${r}/branches/${branchId}`, {
        translations: [{ locale: 'ar', name: '' }],
      });
      expect(cleared.body.data.translations).toEqual([{ locale: 'en', name: 'Maadi Branch' }]);

      const blocked = await call(manager, 'patch', `/restaurants/${r}/branches/${branchId}`, {
        translations: [{ locale: 'en', name: '' }],
      });
      expect(blocked.status).toBe(400);
      expect(blocked.body.error.code).toBe('DEFAULT_TRANSLATION_REQUIRED');
      const bad = await call(manager, 'patch', `/restaurants/${r}/branches/${branchId}`, {
        translations: [{ locale: 'fr', name: 'Maadi' }],
      });
      expect(bad.status).toBe(400);
    });

    it('a legacy client sending only `name` keeps working and keeps the default row in step', async () => {
      const world = await seedWorld('branch-legacy');
      const manager = await addStaff(world.restaurantId, 'OWNER');
      const r = world.restaurantId;

      const renamed = await call(manager, 'patch', `/restaurants/${r}/branches/${world.branchId}`, {
        name: 'Renamed By Old Client',
      });

      expect(renamed.status).toBe(200);
      expect(renamed.body.data.name).toBe('Renamed By Old Client');
      expect(renamed.body.data.translations).toEqual([
        { locale: 'en', name: 'Renamed By Old Client' },
      ]);
    });

    it('is Restaurant- and Branch-scoped: no cross-tenant write and no write to a Branch outside the Membership scope', async () => {
      const a = await seedWorld('branch-iso-a');
      const b = await seedWorld('branch-iso-b');
      const otherBranch = await prisma.branch.create({
        data: {
          publicId: `branch-${randomUUID()}`,
          restaurantId: a.restaurantId,
          name: 'Other Branch',
          status: 'ACTIVE',
          timezone: 'Africa/Cairo',
        },
      });
      const foreign = await addStaff(b.restaurantId, 'OWNER');
      const scoped = await addStaff(a.restaurantId, 'OWNER', {
        allBranches: false,
        branchIds: [a.branchId],
      });

      const crossTenant = await call(
        foreign,
        'patch',
        `/restaurants/${a.restaurantId}/branches/${a.branchId}`,
        { translations: [{ locale: 'ar', name: 'اختراق' }] },
      );
      const outsideScope = await call(
        scoped,
        'patch',
        `/restaurants/${a.restaurantId}/branches/${otherBranch.id}`,
        { translations: [{ locale: 'ar', name: 'خارج النطاق' }] },
      );
      // the foreign manager's own Restaurant route with the other tenant's Branch id
      const wrongRestaurant = await call(
        foreign,
        'patch',
        `/restaurants/${b.restaurantId}/branches/${a.branchId}`,
        { translations: [{ locale: 'ar', name: 'اختراق' }] },
      );

      expect([403, 404]).toContain(crossTenant.status);
      expect([403, 404]).toContain(outsideScope.status);
      expect([403, 404]).toContain(wrongRestaurant.status);
      expect(
        await prisma.branchTranslation.count({
          where: { branchId: { in: [a.branchId, otherBranch.id] }, locale: 'ar' },
        }),
      ).toBe(0);
    });
  });

  describe('Bilingual Delivery zone names', () => {
    async function createZone(
      staff: Staff,
      world: World,
      body: Record<string, unknown>,
    ) {
      return call(staff, 'post', `/restaurants/${world.restaurantId}/branches/${world.branchId}/delivery-zones`, {
        deliveryFee: '25.00',
        minimumOrder: '0.00',
        ...body,
      });
    }

    it('create / update / clear, with the default locale authoritative for the legacy name', async () => {
      const world = await seedWorld('zone-tr');
      const manager = await addStaff(world.restaurantId, 'OWNER');
      const r = world.restaurantId;

      const created = await createZone(manager, world, {
        name: 'University',
        translations: [{ locale: 'ar', name: 'الجامعة' }],
      });
      expect(created.status).toBe(201);
      expect(created.body.data.translations).toEqual([
        { locale: 'ar', name: 'الجامعة' },
        { locale: 'en', name: 'University' },
      ]);
      const zoneId = created.body.data.id as string;

      const renamed = await call(manager, 'patch', `/restaurants/${r}/delivery-zones/${zoneId}`, {
        translations: [
          { locale: 'en', name: 'University District' },
          { locale: 'ar', name: 'حي الجامعة' },
        ],
      });
      expect(renamed.body.data.name).toBe('University District');

      const overview = await call(manager, 'get', `/restaurants/${r}/delivery`);
      const zone = overview.body.data[0].zones.find((z: { id: string }) => z.id === zoneId);
      expect(zone.translations).toEqual([
        { locale: 'ar', name: 'حي الجامعة' },
        { locale: 'en', name: 'University District' },
      ]);
      expect(Array.isArray(overview.body.data[0].translations)).toBe(true);

      const cleared = await call(manager, 'patch', `/restaurants/${r}/delivery-zones/${zoneId}`, {
        translations: [{ locale: 'ar', name: '' }],
      });
      expect(cleared.body.data.translations).toEqual([
        { locale: 'en', name: 'University District' },
      ]);
      const blocked = await call(manager, 'patch', `/restaurants/${r}/delivery-zones/${zoneId}`, {
        translations: [{ locale: 'en', name: '' }],
      });
      expect(blocked.status).toBe(400);
      expect(blocked.body.error.code).toBe('DEFAULT_TRANSLATION_REQUIRED');
    });

    it('never crosses tenants and requires restaurant.manage', async () => {
      const a = await seedWorld('zone-iso-a');
      const b = await seedWorld('zone-iso-b');
      const manager = await addStaff(a.restaurantId, 'OWNER');
      const waiter = await addStaff(a.restaurantId, 'WAITER');
      const foreign = await addStaff(b.restaurantId, 'OWNER');
      const created = await createZone(manager, a, { name: 'Zone A' });
      const zoneId = created.body.data.id as string;

      const crossTenant = await call(foreign, 'patch', `/restaurants/${b.restaurantId}/delivery-zones/${zoneId}`, {
        translations: [{ locale: 'ar', name: 'اختراق' }],
      });
      const denied = await call(waiter, 'patch', `/restaurants/${a.restaurantId}/delivery-zones/${zoneId}`, {
        translations: [{ locale: 'ar', name: 'ممنوع' }],
      });

      expect(crossTenant.status).toBe(404);
      expect(denied.status).toBe(403);
      expect(await prisma.deliveryZoneTranslation.count({ where: { deliveryZoneId: zoneId, locale: 'ar' } })).toBe(0);
    });
  });

  // =================================================================== Guest

  describe('Guest menu and Delivery checkout', () => {
    it('shows Arabic names to an Arabic Guest, English to an English Guest, and falls back for legacy data', async () => {
      const world = await seedWorld('guest-names');
      const manager = await addStaff(world.restaurantId, 'OWNER');
      const r = world.restaurantId;
      const zone = await createZone(manager, world, {
        name: 'University',
        translations: [{ locale: 'ar', name: 'الجامعة' }],
      });
      expect(zone.status).toBe(201);
      await call(manager, 'patch', `/restaurants/${r}/branches/${world.branchId}`, {
        name: 'Downtown',
        translations: [{ locale: 'ar', name: 'وسط البلد' }],
      });
      // a legacy Branch: a single-language name and NO translation rows at all
      const legacy = await prisma.branch.create({
        data: {
          publicId: `branch-${randomUUID()}`,
          restaurantId: r,
          name: 'Legacy Branch',
          status: 'ACTIVE',
          timezone: 'Africa/Cairo',
        },
      });

      const arabic = await publicMenu(world.genericQr, 'ar');
      const english = await publicMenu(world.genericQr, 'en');

      const arContext = arabic.body.data.context;
      const names = (ctx: { pickupBranches: { name: string }[] }) =>
        ctx.pickupBranches.map((b) => b.name).sort();
      expect(names(arContext as { pickupBranches: { name: string }[] })).toEqual(
        ['Legacy Branch', 'وسط البلد'].sort(),
      );
      const arDelivery = arContext.deliveryBranches.find((b: { name: string }) => b.name === 'وسط البلد');
      expect(arDelivery.zones[0].name).toBe('الجامعة');
      expect(
        names(english.body.data.context as { pickupBranches: { name: string }[] }),
      ).toEqual(['Downtown', 'Legacy Branch']);
      expect(english.body.data.context.deliveryBranches[0].zones[0].name).toBe('University');
      expect(legacy.id).toBeTruthy();
    });

    it('a Delivery order confirms with localized names while the stored snapshot stays the default-locale name and never changes', async () => {
      const world = await seedWorld('guest-order');
      const manager = await addStaff(world.restaurantId, 'OWNER');
      const r = world.restaurantId;
      await call(manager, 'patch', `/restaurants/${r}/branches/${world.branchId}`, {
        name: 'Downtown',
        translations: [{ locale: 'ar', name: 'وسط البلد' }],
      });
      const zone = await createZone(manager, world, {
        name: 'University',
        translations: [{ locale: 'ar', name: 'الجامعة' }],
      });
      const zoneId = zone.body.data.id as string;

      const placed = await request(app.getHttpServer())
        .post(`/api/v1/public/qr/${world.genericQr}/orders`)
        .send({
          clientRequestId: randomUUID(),
          locale: 'ar',
          fulfillment: 'DELIVERY',
          branchId: world.branchId,
          deliveryZoneId: zoneId,
          deliveryAddress: '12 Nile Street',
          customerName: 'Sara',
          customerPhone: '+20 100 000 0000',
          items: [{ productId: world.productId, quantity: 1 }],
        });
      expect(placed.status).toBe(201);
      expect(placed.body.data.delivery).toEqual({
        branchName: 'وسط البلد',
        zoneName: 'الجامعة',
      });

      const stored = await prisma.order.findUniqueOrThrow({ where: { id: placed.body.data.id } });
      expect(stored.deliveryZoneNameSnapshot).toBe('University');

      // renaming and re-translating the zone afterwards never rewrites history
      await call(manager, 'patch', `/restaurants/${r}/delivery-zones/${zoneId}`, {
        translations: [
          { locale: 'en', name: 'Campus' },
          { locale: 'ar', name: 'الحرم الجامعي' },
        ],
      });
      const after = await prisma.order.findUniqueOrThrow({ where: { id: placed.body.data.id } });
      expect(after.deliveryZoneNameSnapshot).toBe('University');
    });

    it('an English or locale-less order confirms with the default-locale names (existing clients unaffected)', async () => {
      const world = await seedWorld('guest-order-en');
      const manager = await addStaff(world.restaurantId, 'OWNER');
      const zone = await createZone(manager, world, { name: 'University' });
      const placed = await request(app.getHttpServer())
        .post(`/api/v1/public/qr/${world.genericQr}/orders`)
        .send({
          clientRequestId: randomUUID(),
          fulfillment: 'DELIVERY',
          branchId: world.branchId,
          deliveryZoneId: zone.body.data.id,
          deliveryAddress: '12 Nile Street',
          customerName: 'Sara',
          customerPhone: '+20 100 000 0000',
          items: [{ productId: world.productId, quantity: 1 }],
        });

      expect(placed.status).toBe(201);
      expect(placed.body.data.delivery.zoneName).toBe('University');
      const badLocale = await request(app.getHttpServer())
        .post(`/api/v1/public/qr/${world.genericQr}/orders`)
        .send({ clientRequestId: randomUUID(), locale: 'fr', items: [] });
      expect(badLocale.status).toBe(400);
    });

    async function createZone(staff: Staff, world: World, body: Record<string, unknown>) {
      return call(
        staff,
        'post',
        `/restaurants/${world.restaurantId}/branches/${world.branchId}/delivery-zones`,
        { deliveryFee: '25.00', minimumOrder: '0.00', ...body },
      );
    }
  });

  // ================================================================ migration

  describe('migration backfill', () => {
    it('every Branch and Delivery zone that existed when the migration ran has a default-locale translation equal to its name', async () => {
      const branchesMissing = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count
          FROM "branches" b
          JOIN "restaurants" r ON r."id" = b."restaurant_id"
         WHERE b."created_at" < (
                 SELECT "finished_at" FROM "_prisma_migrations"
                  WHERE "migration_name" = '20261010120000_add_cover_image_and_name_translations')
           AND NOT EXISTS (
             SELECT 1 FROM "branch_translations" t
              WHERE t."branch_id" = b."id" AND t."locale" = r."default_locale"
                AND t."name" = b."name")`;
      const zonesMissing = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count
          FROM "delivery_zones" z
          JOIN "restaurants" r ON r."id" = z."restaurant_id"
         WHERE z."created_at" < (
                 SELECT "finished_at" FROM "_prisma_migrations"
                  WHERE "migration_name" = '20261010120000_add_cover_image_and_name_translations')
           AND NOT EXISTS (
             SELECT 1 FROM "delivery_zone_translations" t
              WHERE t."delivery_zone_id" = z."id" AND t."locale" = r."default_locale"
                AND t."name" = z."name")`;

      expect(Number(branchesMissing[0].count)).toBe(0);
      expect(Number(zonesMissing[0].count)).toBe(0);
    });
  });
});
