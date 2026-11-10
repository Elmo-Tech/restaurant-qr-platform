/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call --
 * supertest exposes `response.body` as `any`; the assertions below read the JSON envelope directly, like the other HTTP e2e specs. */
import { SCRATCH_URL } from './support/scratch-guard';
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
import { weekdayOf } from './../src/offers/offer-rules';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/**
 * Offers / Bundles (DEC-069) against REAL PostgreSQL through the real Nest app: the Staff CRUD (tenant isolation, permissions, CSRF,
 * the OFFERS package feature), what the Guest menu returns, and order creation: exact pricing, every validation, the stable error
 * codes, idempotency, the kitchen / Staff views, history snapshots and the WhatsApp message.
 *
 * Isolation: see `support/scratch-guard.ts`; without OFFERS_E2E_DATABASE_URL (a local database whose name contains "scratch") the
 * whole suite is skipped.
 */

const describeScratch = SCRATCH_URL ? describe : describe.skip;
const PASSWORD = 'correct horse battery staple';
const TZ = 'Africa/Cairo';

interface Staff {
  email: string;
  cookie?: string;
}

interface World {
  restaurantId: string;
  branchId: string;
  genericQr: string;
  tableQr: string;
  productId: string;
}

describeScratch('Offers (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hasher: PasswordHasherService;
  const origin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';

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
    hasher = app.get(PasswordHasherService);
  });

  afterAll(async () => {
    await app?.close();
  });

  // ---------------------------------------------------------------- fixtures

  const today = () => weekdayOf(localDateIn(TZ, new Date()));
  const otherDay = () => (today() + 3) % 7;

  async function seedWorld(label: string): Promise<World> {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `it-rest-${randomUUID()}`,
        name: `IT ${label}`,
        status: 'ACTIVE',
        defaultLocale: 'ar',
        currencyCode: 'EGP',
        countryCode: 'EG',
        locales: {
          create: [
            { locale: 'ar', isActive: true },
            { locale: 'en', isActive: true },
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
        timezone: TZ,
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
        translations: { create: { locale: 'ar', name: 'المنيو' } },
      },
    });
    const category = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        menuId: menu.id,
        status: 'ACTIVE',
        displayOrder: 0,
        translations: { create: { locale: 'ar', name: 'السندوتشات' } },
      },
    });
    const product = await prisma.product.create({
      data: {
        publicId: `product-${randomUUID()}`,
        restaurantId: restaurant.id,
        categoryId: category.id,
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        basePrice: '45.00',
        displayOrder: 0,
        allowCustomerNotes: false,
        featured: false,
        translations: { create: { locale: 'ar', name: 'كبدة إسكندراني' } },
      },
    });
    return {
      restaurantId: restaurant.id,
      branchId: branch.id,
      genericQr: generic.publicCode,
      tableQr: tableQr.publicCode,
      productId: product.id,
    };
  }

  async function addStaff(restaurantId: string, kind: StarterRoleKind): Promise<Staff> {
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
    await prisma.restaurantMembership.create({
      data: {
        restaurantId,
        userId: user.id,
        role: kind,
        roleId: role.id,
        status: 'ACTIVE',
        allBranches: true,
      },
    });
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

  const offersPath = (restaurantId: string) => `/api/v1/restaurants/${restaurantId}/offers`;

  async function send(
    method: 'post' | 'patch' | 'put' | 'delete',
    staff: Staff,
    path: string,
    body?: Record<string, unknown>,
    withOrigin = true,
  ) {
    const req = request(app.getHttpServer())[method](path).set('Cookie', await login(staff));
    if (withOrigin) req.set('Origin', origin);
    return body ? req.send(body) : req;
  }

  async function get(staff: Staff, path: string) {
    return request(app.getHttpServer()).get(path).set('Cookie', await login(staff));
  }

  const publicMenu = (qr: string) => request(app.getHttpServer()).get(`/api/v1/public/qr/${qr}/menu`);
  const placeOrder = (qr: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/orders`)
      .send({ clientRequestId: randomUUID(), ...body });
  const whatsappOrder = (qr: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/whatsapp-order`)
      .send({ clientRequestId: randomUUID(), ...body });

  const customer = {
    fulfillment: 'PICKUP',
    customerName: 'Ahmed Mohamed',
    customerPhone: '01012345678',
  };

  /** "Breakfast meal": ful / taameya / liver (+10), plus free fries. 35 EGP. */
  const breakfastBody = (days: number[] = []) => ({
    status: 'ACTIVE',
    badge: 'GIFT',
    price: '35.00',
    daysOfWeek: days,
    names: { ar: 'وجبة الفطار', en: 'Breakfast meal' },
    descriptions: { ar: 'ساندويتش فول أو طعمية + بطاطس هدية' },
    slots: [
      {
        kind: 'SINGLE',
        titles: { ar: 'اختار الساندويتش', en: 'Pick your sandwich' },
        options: [
          { names: { ar: 'فول', en: 'Ful' } },
          { names: { ar: 'طعمية', en: 'Taameya' } },
          { names: { ar: 'كبدة', en: 'Liver' }, priceAdjustment: '10.00' },
        ],
      },
      {
        kind: 'FIXED',
        titles: { ar: 'هدية العرض', en: 'Gift' },
        options: [{ names: { ar: 'بطاطس هدية', en: 'Free fries' } }],
      },
    ],
  });

  /** "Family box": 3 sandwiches out of 4 (cheese +5, liver +10) and a drink (juice +5). 120 EGP. */
  const boxBody = {
    status: 'ACTIVE',
    price: '120.00',
    names: { ar: 'بوكس العيلة' },
    slots: [
      {
        kind: 'MULTI',
        requiredCount: 3,
        titles: { ar: 'اختار ٣ ساندويتشات' },
        options: [
          { names: { ar: 'فول' } },
          { names: { ar: 'طعمية' } },
          { names: { ar: 'جبنة رومي' }, priceAdjustment: '5.00' },
          { names: { ar: 'كبدة' }, priceAdjustment: '10.00' },
        ],
      },
      {
        kind: 'SINGLE',
        titles: { ar: 'اختار المشروب' },
        options: [{ names: { ar: 'بيبسي' } }, { names: { ar: 'عصير' }, priceAdjustment: '5.00' }],
      },
    ],
  };

  interface OfferView {
    id: string;
    slots: { id: string; kind: string; options: { id: string; names: Record<string, string> }[] }[];
  }

  async function createOffer(world: World, owner: Staff, body: Record<string, unknown>): Promise<OfferView> {
    const res = await send('post', owner, offersPath(world.restaurantId), body);
    expect(res.status).toBe(201);
    return res.body.data as OfferView;
  }

  const optionId = (offer: OfferView, slot: number, ar: string) =>
    offer.slots[slot].options.find((o) => o.names.ar === ar)!.id;

  // =============================================================== Staff API

  it('creates, lists, edits, reorders and deletes offers (money as exact strings)', async () => {
    const world = await seedWorld('crud');
    const owner = await addStaff(world.restaurantId, 'OWNER');

    const breakfast = await createOffer(world, owner, breakfastBody([1, 3, 5]));
    const created = (await get(owner, `${offersPath(world.restaurantId)}/${breakfast.id}`)).body.data;
    expect(created).toMatchObject({
      status: 'ACTIVE',
      badge: 'GIFT',
      price: '35.00',
      daysOfWeek: [1, 3, 5],
      names: { ar: 'وجبة الفطار', en: 'Breakfast meal' },
      descriptions: { ar: 'ساندويتش فول أو طعمية + بطاطس هدية' },
    });
    expect(created.slots).toHaveLength(2);
    expect(created.slots[0].options.map((o: { priceAdjustment: string }) => o.priceAdjustment)).toEqual([
      '0.00',
      '0.00',
      '10.00',
    ]);
    expect(created.slots[1]).toMatchObject({ kind: 'FIXED', requiredCount: 0 });

    const box = await createOffer(world, owner, boxBody);
    let list = (await get(owner, offersPath(world.restaurantId))).body.data;
    expect(list.map((o: { id: string }) => o.id)).toEqual([breakfast.id, box.id]);

    // edit: rename + change the price + remove "Liver"; existing slot / option ids are kept
    const slot0 = breakfast.slots[0];
    const patched = await send('patch', owner, `${offersPath(world.restaurantId)}/${breakfast.id}`, {
      price: '36.50',
      names: { en: null, ar: 'وجبة الفطار الجديدة' },
      slots: [
        {
          id: slot0.id,
          kind: 'SINGLE',
          titles: { ar: 'اختار الساندويتش' },
          options: slot0.options.slice(0, 2).map((o) => ({ id: o.id, names: { ar: o.names.ar } })),
        },
        breakfast.slots[1].id
          ? {
              id: breakfast.slots[1].id,
              kind: 'FIXED',
              titles: { ar: 'هدية العرض' },
              options: [{ id: breakfast.slots[1].options[0].id, names: { ar: 'بطاطس هدية' } }],
            }
          : {},
      ],
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ price: '36.50', names: { ar: 'وجبة الفطار الجديدة' } });
    expect(patched.body.data.names.en).toBeUndefined();
    expect(patched.body.data.slots[0].id).toBe(slot0.id);
    expect(patched.body.data.slots[0].options.map((o: { id: string }) => o.id)).toEqual(
      slot0.options.slice(0, 2).map((o) => o.id),
    );

    // reorder (the full list) and a wrong list
    const reorder = await send('put', owner, `${offersPath(world.restaurantId)}/order`, {
      offerIds: [box.id, breakfast.id],
    });
    expect(reorder.status).toBe(204);
    list = (await get(owner, offersPath(world.restaurantId))).body.data;
    expect(list.map((o: { id: string }) => o.id)).toEqual([box.id, breakfast.id]);
    const badOrder = await send('put', owner, `${offersPath(world.restaurantId)}/order`, { offerIds: [box.id] });
    expect(badOrder.status).toBe(422);
    expect(badOrder.body.error.code).toBe('OFFER_ORDER_INVALID');

    // disable then delete (archive): gone from the list, rows kept
    const off = await send('patch', owner, `${offersPath(world.restaurantId)}/${box.id}`, { status: 'INACTIVE' });
    expect(off.body.data.status).toBe('INACTIVE');
    expect(off.body.data.state).toBe('OFF');
    const del = await send('delete', owner, `${offersPath(world.restaurantId)}/${box.id}`);
    expect(del.status).toBe(204);
    list = (await get(owner, offersPath(world.restaurantId))).body.data;
    expect(list.map((o: { id: string }) => o.id)).toEqual([breakfast.id]);
    expect((await get(owner, `${offersPath(world.restaurantId)}/${box.id}`)).status).toBe(404);
    const archived = await prisma.offer.findUniqueOrThrow({ where: { id: box.id } });
    expect(archived.status).toBe('ARCHIVED');
    expect(archived.archivedAt).not.toBeNull();
  });

  it('refuses invalid offers with stable codes', async () => {
    const world = await seedWorld('invalid');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const path = offersPath(world.restaurantId);
    const code = async (body: Record<string, unknown>) => {
      const res = await send('post', owner, path, body);
      return [res.status, res.body.error?.code, res.body.error?.details?.reason] as const;
    };
    const ok = breakfastBody();

    expect(await code({ ...ok, names: { en: 'English only' } })).toEqual([422, 'DEFAULT_TRANSLATION_REQUIRED', undefined]);
    expect(await code({ ...ok, names: { ar: 'س', fr: 'x' } })).toEqual([422, 'LOCALE_NOT_ACTIVE', undefined]);
    expect(await code({ ...ok, price: undefined })).toEqual([422, 'OFFER_PRICE_REQUIRED', undefined]);
    expect((await send('post', owner, path, { ...ok, price: '-5' })).status).toBe(400);
    expect((await send('post', owner, path, { ...ok, price: '12.345' })).status).toBe(400);
    expect(await code({ ...ok, startsOn: '2026-12-10', endsOn: '2026-12-01' })).toEqual([422, 'OFFER_DATES_INVALID', undefined]);
    expect(await code({ ...ok, startsOn: '2026-02-30' })).toEqual([422, 'OFFER_DATES_INVALID', undefined]);
    expect((await send('post', owner, path, { ...ok, daysOfWeek: [7] })).status).toBe(400);
    expect(await code({ ...ok, slots: [] })).toEqual([422, 'OFFER_SLOTS_INVALID', 'NO_SLOTS']);
    expect(
      await code({ ...ok, slots: [{ kind: 'SINGLE', titles: { ar: 'س' }, options: [{ names: { ar: 'واحد' } }] }] }),
    ).toEqual([422, 'OFFER_SLOTS_INVALID', 'SINGLE_NEEDS_TWO']);
    expect(
      await code({
        ...ok,
        slots: [{ kind: 'FIXED', titles: { ar: 'هدية' }, options: [{ names: { ar: 'س' }, priceAdjustment: '3.00' }] }],
      }),
    ).toEqual([422, 'OFFER_SLOTS_INVALID', 'FIXED_ADJUSTMENT']);
    expect(
      await code({ ...ok, slots: [{ kind: 'MULTI', requiredCount: 0, titles: { ar: 'س' }, options: [{ names: { ar: 'ص' } }] }] }),
    ).toEqual([422, 'OFFER_SLOTS_INVALID', 'MULTI_COUNT_INVALID']);
    const tooMany = Array.from({ length: 7 }, (_, i) => ({
      kind: 'FIXED',
      titles: { ar: `س${i}` },
      options: [{ names: { ar: 'ص' } }],
    }));
    // seven slots never reach the service: the request shape already caps them at six
    expect((await code({ ...ok, slots: tooMany }))[0]).toBe(400);
    const manyOptions = Array.from({ length: 3 }, (_, i) => ({
      kind: 'MULTI',
      requiredCount: 1,
      titles: { ar: `س${i}` },
      options: Array.from({ length: 8 }, (_, j) => ({ names: { ar: `ص${j}` } })),
    }));
    expect(await code({ ...ok, slots: manyOptions })).toEqual([422, 'OFFER_SLOTS_INVALID', 'TOO_MANY_OPTIONS']);
    // an id that does not belong to the offer
    const created = await createOffer(world, owner, ok);
    const foreignId = (
      await prisma.offerSlot.create({
        data: {
          restaurantId: world.restaurantId,
          offerId: (await createOffer(world, owner, boxBody)).id,
          kind: 'FIXED',
          requiredCount: 0,
        },
      })
    ).id;
    const unknown = await send('patch', owner, `${path}/${created.id}`, {
      slots: [{ id: foreignId, kind: 'FIXED', titles: { ar: 'س' }, options: [{ names: { ar: 'ص' } }] }],
    });
    expect(unknown.body.error).toMatchObject({ code: 'OFFER_SLOTS_INVALID', details: { reason: 'UNKNOWN_ID' } });
  });

  it('enforces permissions, CSRF and tenant isolation', async () => {
    const a = await seedWorld('tenant-a');
    const b = await seedWorld('tenant-b');
    const ownerA = await addStaff(a.restaurantId, 'OWNER');
    const ownerB = await addStaff(b.restaurantId, 'OWNER');
    const cashierA = await addStaff(a.restaurantId, 'CASHIER');
    const managerA = await addStaff(a.restaurantId, 'MANAGER');
    const offerA = await createOffer(a, ownerA, breakfastBody());

    // the other restaurant's owner cannot read or change it through either URL
    expect((await get(ownerB, offersPath(a.restaurantId))).status).toBeGreaterThanOrEqual(403);
    expect((await get(ownerB, `${offersPath(b.restaurantId)}/${offerA.id}`)).status).toBe(404);
    expect((await send('patch', ownerB, `${offersPath(b.restaurantId)}/${offerA.id}`, { price: '1.00' })).status).toBe(404);
    expect((await send('delete', ownerB, `${offersPath(b.restaurantId)}/${offerA.id}`)).status).toBe(404);
    expect((await get(ownerB, offersPath(b.restaurantId))).body.data).toEqual([]);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: offerA.id } })).status).toBe('ACTIVE');

    // a cashier can read (menu.view) but not change; a manager (menu.manage) can
    expect((await get(cashierA, offersPath(a.restaurantId))).status).toBe(200);
    expect((await send('post', cashierA, offersPath(a.restaurantId), breakfastBody())).status).toBe(403);
    expect((await send('patch', managerA, `${offersPath(a.restaurantId)}/${offerA.id}`, { badge: 'MOST_ORDERED' })).status).toBe(200);
    // no Origin header = no CSRF protection satisfied
    expect((await send('post', ownerA, offersPath(a.restaurantId), breakfastBody(), false)).status).toBe(403);
    // unauthenticated
    expect((await request(app.getHttpServer()).get(offersPath(a.restaurantId))).status).toBe(401);
  });

  it('needs the OFFERS package feature: Staff routes, the Guest menu and orders all refuse without it', async () => {
    const world = await seedWorld('feature');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const offer = await createOffer(world, owner, breakfastBody());
    const sandwichOption = optionId(offer, 0, 'فول');
    const orderBody = {
      ...customer,
      items: [{ offerId: offer.id, quantity: 1, offerChoices: [{ slotId: offer.slots[0].id, optionId: sandwichOption, quantity: 1 }] }],
    };
    expect((await publicMenu(world.genericQr)).body.data.context.offers).toHaveLength(1);

    await prisma.restaurantFeature.create({
      data: { restaurantId: world.restaurantId, feature: 'OFFERS', enabled: false },
    });
    const denied = await get(owner, offersPath(world.restaurantId));
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE', feature: 'OFFERS' });
    expect((await send('post', owner, offersPath(world.restaurantId), breakfastBody())).status).toBe(403);
    expect((await publicMenu(world.genericQr)).body.data.context.offers).toEqual([]);
    const refused = await placeOrder(world.genericQr, orderBody);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('OFFER_UNAVAILABLE');
    expect(await prisma.order.count({ where: { restaurantId: world.restaurantId } })).toBe(0);

    await prisma.restaurantFeature.deleteMany({ where: { restaurantId: world.restaurantId } });
    expect((await placeOrder(world.genericQr, orderBody)).status).toBe(201);
  });

  // ============================================================== Guest menu

  it('shows the Guest the active offers, dimmed on the wrong weekday, hidden outside dates / when off, in the menu language', async () => {
    const world = await seedWorld('menu');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const everyday = await createOffer(world, owner, breakfastBody());
    const wrongDay = await createOffer(world, owner, { ...boxBody, daysOfWeek: [otherDay()] });
    await createOffer(world, owner, { ...boxBody, status: 'INACTIVE', names: { ar: 'متوقف' } });
    await createOffer(world, owner, { ...boxBody, names: { ar: 'منتهي' }, endsOn: '2020-01-01' });
    await createOffer(world, owner, { ...boxBody, names: { ar: 'لم يبدأ' }, startsOn: '2999-01-01' });

    const ar = (await publicMenu(world.genericQr)).body.data.context.offers;
    expect(ar.map((o: { id: string }) => o.id)).toEqual([everyday.id, wrongDay.id]);
    expect(ar[0]).toMatchObject({
      name: 'وجبة الفطار',
      description: 'ساندويتش فول أو طعمية + بطاطس هدية',
      price: '35.00',
      badge: 'GIFT',
      availableToday: true,
    });
    expect(ar[1].availableToday).toBe(false);
    expect(ar[0].slots[0]).toMatchObject({ kind: 'SINGLE', title: 'اختار الساندويتش' });
    expect(ar[0].slots[0].options.map((o: { name: string; priceAdjustment: string }) => [o.name, o.priceAdjustment])).toEqual([
      ['فول', '0.00'],
      ['طعمية', '0.00'],
      ['كبدة', '10.00'],
    ]);
    expect(ar[0].slots[1]).toMatchObject({ kind: 'FIXED', requiredCount: 0 });

    const en = (await request(app.getHttpServer()).get(`/api/v1/public/qr/${world.genericQr}/menu?lang=en`)).body.data.context.offers;
    expect(en[0].name).toBe('Breakfast meal');
    expect(en[0].description).toBe('ساندويتش فول أو طعمية + بطاطس هدية'); // falls back to the default language
    // another restaurant never sees these offers
    const other = await seedWorld('menu-other');
    expect((await publicMenu(other.genericQr)).body.data.context.offers).toEqual([]);
  });

  // ================================================================== Orders

  it('prices an offer line exactly, stores history snapshots, and shows the choices to the kitchen and Staff', async () => {
    const world = await seedWorld('order');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const kitchen = await addStaff(world.restaurantId, 'KITCHEN');
    const breakfast = await createOffer(world, owner, breakfastBody());
    const box = await createOffer(world, owner, boxBody);

    const clientRequestId = randomUUID();
    const body = {
      ...customer,
      clientRequestId,
      expectedTotal: '110.00',
      items: [
        {
          offerId: breakfast.id,
          quantity: 2,
          offerChoices: [{ slotId: breakfast.slots[0].id, optionId: optionId(breakfast, 0, 'كبدة'), quantity: 1 }],
        },
        {
          offerId: box.id,
          quantity: 1,
          offerChoices: [
            { slotId: box.slots[0].id, optionId: optionId(box, 0, 'طعمية'), quantity: 2 },
            { slotId: box.slots[0].id, optionId: optionId(box, 0, 'جبنة رومي'), quantity: 1 },
            { slotId: box.slots[1].id, optionId: optionId(box, 1, 'عصير'), quantity: 1 },
          ],
        },
        { productId: world.productId, quantity: 1 },
      ],
    };
    // 2 x (35 + 10) = 90, box 120 + 5 + 5 = 130, product 45 -> 265. The Guest was shown a wrong total.
    const stale = await request(app.getHttpServer()).post(`/api/v1/public/qr/${world.genericQr}/orders`).send(body);
    expect(stale.status).toBe(422);
    expect(stale.body.error.code).toBe('PRICE_CHANGED');
    expect(stale.body.error.details.pricing.total).toBe('265.00');
    expect(await prisma.order.count({ where: { restaurantId: world.restaurantId } })).toBe(0);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/public/qr/${world.genericQr}/orders`)
      .send({ ...body, expectedTotal: '265.00' });
    expect(created.status).toBe(201);
    const view = created.body.data;
    expect(view.total).toBe('265.00');
    expect(view.items[0]).toMatchObject({ productId: null, offerId: breakfast.id, name: 'وجبة الفطار', quantity: 2, unitPrice: '35.00', lineTotal: '90.00' });
    expect(view.items[0].modifiers).toEqual([
      { groupName: 'اختار الساندويتش', optionName: 'كبدة', priceAdjustment: '10.00' },
      { groupName: 'هدية العرض', optionName: 'بطاطس هدية', priceAdjustment: '0.00' },
    ]);
    expect(view.items[1].modifiers.map((m: { optionName: string; priceAdjustment: string }) => [m.optionName, m.priceAdjustment])).toEqual([
      ['2× طعمية', '0.00'],
      ['جبنة رومي', '5.00'],
      ['عصير', '5.00'],
    ]);
    expect(view.items[2]).toMatchObject({ productId: world.productId, offerId: null, lineTotal: '45.00' });

    // idempotent: the same client request id returns the same order, never a second one
    const replay = await request(app.getHttpServer())
      .post(`/api/v1/public/qr/${world.genericQr}/orders`)
      .send({ ...body, expectedTotal: '265.00' });
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(view.id);
    expect(await prisma.order.count({ where: { restaurantId: world.restaurantId } })).toBe(1);

    // the database stores snapshots, not references to the live text
    const items = await prisma.orderItem.findMany({
      where: { orderId: view.id },
      include: { offerChoices: { orderBy: { displayOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    expect(items[0].offerChoices.map((c) => [c.slotTitleSnapshot, c.optionNameSnapshot, c.included])).toEqual([
      ['اختار الساندويتش', 'كبدة', false],
      ['هدية العرض', 'بطاطس هدية', true],
    ]);

    // editing / deleting the offers afterwards never rewrites history
    await send('patch', owner, `${offersPath(world.restaurantId)}/${breakfast.id}`, {
      price: '99.00',
      names: { ar: 'اسم جديد' },
      slots: [
        {
          kind: 'FIXED',
          titles: { ar: 'عنوان جديد' },
          options: [{ names: { ar: 'شيء آخر' } }],
        },
      ],
    });
    await send('delete', owner, `${offersPath(world.restaurantId)}/${box.id}`);

    // Staff order detail + the kitchen board show the same lines
    await prisma.order.update({ where: { id: view.id }, data: { status: 'ACCEPTED' } });
    const detail = await get(owner, `/api/v1/restaurants/${world.restaurantId}/orders/${view.id}`);
    expect(detail.status).toBe(200);
    const staffItem = detail.body.data.items[0];
    expect(staffItem).toMatchObject({ productNameSnapshot: 'وجبة الفطار', offerId: breakfast.id, productId: null, lineTotal: '90.00' });
    expect(staffItem.modifiers.map((m: { optionName: string }) => m.optionName)).toEqual(['كبدة', 'بطاطس هدية']);
    const board = await get(kitchen, `/api/v1/restaurants/${world.restaurantId}/kitchen/orders`);
    expect(board.status).toBe(200);
    const ticket = board.body.data.find((t: { id: string }) => t.id === view.id);
    expect(ticket.items[0]).toMatchObject({ name: 'وجبة الفطار', quantity: 2 });
    expect(ticket.items[0].modifiers).toEqual([
      { groupName: 'اختار الساندويتش', optionName: 'كبدة' },
      { groupName: 'هدية العرض', optionName: 'بطاطس هدية' },
    ]);
  });

  it('rejects an offer that is incomplete, changed, foreign, off, archived or not valid today - nothing is created', async () => {
    const world = await seedWorld('reject');
    const other = await seedWorld('reject-other');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const otherOwner = await addStaff(other.restaurantId, 'OWNER');
    const breakfast = await createOffer(world, owner, breakfastBody());
    const foreign = await createOffer(other, otherOwner, breakfastBody());
    const friday = await createOffer(world, owner, { ...breakfastBody([otherDay()]), names: { ar: 'يوم آخر' } });
    const off = await createOffer(world, owner, { ...breakfastBody(), status: 'INACTIVE', names: { ar: 'مطفأ' } });
    const dead = await createOffer(world, owner, { ...breakfastBody(), names: { ar: 'محذوف' } });
    await send('delete', owner, `${offersPath(world.restaurantId)}/${dead.id}`);

    const line = (offer: OfferView, choices: { slot: number; option: string; quantity?: number }[]) => ({
      offerId: offer.id,
      quantity: 1,
      offerChoices: choices.map((c) => ({
        slotId: offer.slots[c.slot].id,
        optionId: optionId(offer, c.slot, c.option),
        quantity: c.quantity ?? 1,
      })),
    });
    const refuse = async (items: unknown[], expectedStatus: number, expectedCode: string) => {
      const res = await placeOrder(world.genericQr, { ...customer, items });
      expect([res.status, res.body.error.code]).toEqual([expectedStatus, expectedCode]);
      return res;
    };

    // choices
    await refuse([line(breakfast, [])], 409, 'OFFER_CHANGED');
    await refuse([line(breakfast, [{ slot: 0, option: 'فول' }, { slot: 0, option: 'طعمية' }])], 409, 'OFFER_CHANGED');
    await refuse([{ offerId: breakfast.id, quantity: 1, offerChoices: [{ slotId: breakfast.slots[0].id, optionId: breakfast.slots[1].options[0].id, quantity: 1 }] }], 409, 'OFFER_CHANGED');
    await refuse([{ offerId: breakfast.id, quantity: 1, offerChoices: [{ slotId: randomUUID(), optionId: randomUUID(), quantity: 1 }] }], 409, 'OFFER_CHANGED');
    // the gift slot takes no choice
    await refuse(
      [{ offerId: breakfast.id, quantity: 1, offerChoices: [
        { slotId: breakfast.slots[0].id, optionId: optionId(breakfast, 0, 'فول'), quantity: 1 },
        { slotId: breakfast.slots[1].id, optionId: breakfast.slots[1].options[0].id, quantity: 1 },
      ] }],
      409,
      'OFFER_CHANGED',
    );
    // an option of ANOTHER restaurant's offer is just as foreign
    const res = await refuse([line(foreign, [{ slot: 0, option: 'فول' }])], 409, 'OFFER_UNAVAILABLE');
    expect(res.body.error.details.offerIds).toEqual([foreign.id]);
    // availability
    await refuse([line(friday, [{ slot: 0, option: 'فول' }])], 409, 'OFFER_UNAVAILABLE');
    await refuse([line(off, [{ slot: 0, option: 'فول' }])], 409, 'OFFER_UNAVAILABLE');
    await refuse([line(dead, [{ slot: 0, option: 'فول' }])], 409, 'OFFER_UNAVAILABLE');
    await refuse([{ offerId: randomUUID(), quantity: 1 }], 409, 'OFFER_UNAVAILABLE');
    // shape
    await refuse([{ quantity: 1 }], 400, 'VALIDATION_ERROR');
    await refuse([{ offerId: breakfast.id, productId: world.productId, quantity: 1 }], 409, 'ORDER_ITEM_UNAVAILABLE');
    await refuse([line(breakfast, [{ slot: 0, option: 'فول' }]), line(breakfast, [{ slot: 0, option: 'فول' }])], 400, 'VALIDATION_ERROR');
    expect(await prisma.order.count({ where: { restaurantId: world.restaurantId } })).toBe(0);

    // the same offer with DIFFERENT choices is two distinct lines and is fine
    const fine = await placeOrder(world.genericQr, {
      ...customer,
      items: [line(breakfast, [{ slot: 0, option: 'فول' }]), line(breakfast, [{ slot: 0, option: 'طعمية' }])],
    });
    expect(fine.status).toBe(201);
    expect(fine.body.data.total).toBe('70.00');
  });

  it('also works for a dine-in order from a Table QR (a round on a Table Session)', async () => {
    const world = await seedWorld('dinein');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const breakfast = await createOffer(world, owner, breakfastBody());
    const res = await placeOrder(world.tableQr, {
      items: [{ offerId: breakfast.id, quantity: 1, offerChoices: [{ slotId: breakfast.slots[0].id, optionId: optionId(breakfast, 0, 'طعمية'), quantity: 1 }] }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ type: 'DINE_IN', total: '35.00' });
  });

  it('the WhatsApp order prices an offer like a real one, lists it first in the message and stores nothing', async () => {
    const world = await seedWorld('whatsapp');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const breakfast = await createOffer(world, owner, breakfastBody());
    await prisma.restaurant.update({
      where: { id: world.restaurantId },
      data: { whatsappOrderingEnabled: true, whatsappNumber: '+201012345678' },
    });
    const res = await whatsappOrder(world.genericQr, {
      ...customer,
      expectedTotal: '90.00',
      items: [
        { offerId: breakfast.id, quantity: 1, offerChoices: [{ slotId: breakfast.slots[0].id, optionId: optionId(breakfast, 0, 'كبدة'), quantity: 1 }] },
        { productId: world.productId, quantity: 1 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe('90.00');
    const message: string = res.body.data.message;
    const lines = message.split('\n');
    // Keep the PostgreSQL HTTP coverage aligned with the compact, priced
    // item/extras WhatsApp layout (the quote is still server-authoritative).
    expect(lines.indexOf('*العروض*')).toBeGreaterThan(-1);
    expect(lines.indexOf('*العروض*')).toBeLessThan(lines.indexOf('*السندوتشات*'));
    expect(message).toContain('\u200F* 1 × *وجبة الفطار* = 35 ج.م');
    expect(message).toContain('↳ اختار الساندويتش: كبدة (+10 ج.م)');
    expect(message).toContain('↳ 🎁 هدية العرض: بطاطس هدية');
    expect(message).toContain('\u200F* 1 × *كبدة إسكندراني* = 45 ج.م');
    expect(await prisma.order.count({ where: { restaurantId: world.restaurantId } })).toBe(0);
    // an unavailable offer is refused by the WhatsApp route too
    const bad = await whatsappOrder(world.genericQr, { ...customer, items: [{ offerId: randomUUID(), quantity: 1 }] });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe('OFFER_UNAVAILABLE');
  });

  it('menu-linked items: picked from the menu with a quantity, names follow the menu, sold out makes the offer unavailable', async () => {
    const world = await seedWorld('linked');
    const other = await seedWorld('linked-other');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const sized = await prisma.product.create({
      data: {
        publicId: `product-${randomUUID()}`,
        restaurantId: world.restaurantId,
        categoryId: (await prisma.product.findUniqueOrThrow({ where: { id: world.productId } })).categoryId,
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        basePrice: '60.00',
        displayOrder: 1,
        allowCustomerNotes: false,
        featured: false,
        translations: { create: { locale: 'ar', name: 'بيتزا' } },
        variants: {
          create: [
            { restaurantId: world.restaurantId, status: 'ACTIVE', price: '60.00', displayOrder: 0, isDefault: true, translations: { create: { locale: 'ar', name: 'صغير' } } },
            { restaurantId: world.restaurantId, status: 'ACTIVE', price: '90.00', displayOrder: 1, isDefault: false, translations: { create: { locale: 'ar', name: 'كبير' } } },
          ],
        },
      },
      include: { variants: true },
    });
    const large = sized.variants.find((v) => v.displayOrder === 1)!;
    const path = offersPath(world.restaurantId);

    // the editor's picker: this restaurant's menu only, with sizes
    const items = (await get(owner, `${path}/menu-items`)).body.data;
    expect(items.map((i: { id: string }) => i.id).sort()).toEqual([world.productId, sized.id].sort());
    expect(items.find((i: { id: string }) => i.id === sized.id).variants).toHaveLength(2);

    // a product of ANOTHER restaurant, a missing size and a size of another product are refused
    const base = (option: Record<string, unknown>) => ({
      status: 'ACTIVE',
      price: '100.00',
      names: { ar: 'باكدج' },
      slots: [{ kind: 'FIXED', titles: { ar: 'مضمّن' }, options: [option] }],
    });
    const code = async (option: Record<string, unknown>) => {
      const res = await send('post', owner, path, base(option));
      return [res.status, res.body.error?.code, res.body.error?.details?.reason];
    };
    expect(await code({ productId: other.productId })).toEqual([422, 'OFFER_ITEM_INVALID', 'UNKNOWN_PRODUCT']);
    expect(await code({ productId: sized.id })).toEqual([422, 'OFFER_ITEM_INVALID', 'VARIANT_REQUIRED']);
    expect(await code({ productId: world.productId, variantId: large.id })).toEqual([422, 'OFFER_ITEM_INVALID', 'UNKNOWN_VARIANT']);
    expect((await send('post', owner, path, base({ productId: world.productId, quantity: 0 }))).status).toBe(400);

    // a package with no choice at all: 2 x the burger + a large pizza, fixed price, nothing for the guest to choose
    const pack = await createOffer(world, owner, {
      ...base({ productId: world.productId, quantity: 2 }),
      slots: [
        {
          kind: 'FIXED',
          titles: { ar: 'مضمّن' },
          options: [
            { productId: world.productId, quantity: 2 },
            { productId: sized.id, variantId: large.id },
            { names: { ar: 'بطاطس' } },
          ],
        },
      ],
    });
    const shown = (await publicMenu(world.genericQr)).body.data.context.offers[0];
    expect(shown.soldOut).toBe(false);
    expect(shown.slots[0].options.map((o: { name: string; quantity: number }) => [o.name, o.quantity])).toEqual([
      ['كبدة إسكندراني', 2],
      ['بيتزا (كبير)', 1],
      ['بطاطس', 1],
    ]);
    const ordered = await placeOrder(world.genericQr, { ...customer, items: [{ offerId: pack.id, quantity: 1 }] });
    expect(ordered.status).toBe(201);
    expect(ordered.body.data.total).toBe('100.00');
    expect(ordered.body.data.items[0].modifiers.map((m: { optionName: string }) => m.optionName)).toEqual([
      '2× كبدة إسكندراني',
      'بيتزا (كبير)',
      'بطاطس',
    ]);

    // a rename follows the menu; the stored order keeps what it was
    await prisma.productTranslation.updateMany({ where: { productId: world.productId, locale: 'ar' }, data: { name: 'كبدة جديدة' } });
    expect((await publicMenu(world.genericQr)).body.data.context.offers[0].slots[0].options[0].name).toBe('كبدة جديدة');
    expect(ordered.body.data.items[0].modifiers[0].optionName).toBe('2× كبدة إسكندراني');

    // sold out included item: the offer shows as sold out and the order is refused
    await prisma.product.update({ where: { id: sized.id }, data: { availability: 'SOLD_OUT' } });
    expect((await publicMenu(world.genericQr)).body.data.context.offers[0].soldOut).toBe(true);
    const refused = await placeOrder(world.genericQr, { ...customer, items: [{ offerId: pack.id, quantity: 1 }] });
    expect([refused.status, refused.body.error.code]).toEqual([409, 'OFFER_UNAVAILABLE']);
  });

  it('keeps the database invariant: an order line is a product XOR an offer', async () => {
    const world = await seedWorld('xor');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const offer = await createOffer(world, owner, breakfastBody());
    const order = await prisma.order.create({
      data: {
        restaurantId: world.restaurantId,
        branchId: world.branchId,
        qrCodeId: (await prisma.qrCode.findUniqueOrThrow({ where: { publicCode: world.genericQr } })).id,
        clientRequestId: randomUUID(),
        status: 'PENDING',
        type: 'PICKUP',
        currencyCode: 'EGP',
        totalAmount: '1.00',
        subtotalAmount: '1.00',
        deliveryFeeAmount: '0.00',
      },
    });
    const line = { orderId: order.id, productNameSnapshot: 'x', unitPrice: '1.00', quantity: 1, lineTotal: '1.00' };
    await expect(prisma.orderItem.create({ data: line })).rejects.toThrow();
    await expect(
      prisma.orderItem.create({ data: { ...line, productId: world.productId, offerId: offer.id } }),
    ).rejects.toThrow();
    await expect(prisma.orderItem.create({ data: { ...line, offerId: offer.id } })).resolves.toBeDefined();
    // a historical order keeps its offer: it cannot be hard-deleted from under it
    await expect(prisma.offer.delete({ where: { id: offer.id } })).rejects.toThrow();
  });
});
