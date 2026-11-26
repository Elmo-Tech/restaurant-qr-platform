import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PasswordHasherService } from '../src/auth/password/password-hasher.service';
import { validationExceptionFactory } from '../src/common/http/validation-exception.factory';
import { PrismaService } from '../src/database/prisma.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/**
 * DEC-077 B1 (fixed AND percentage MENU / CATEGORY promotions) against REAL PostgreSQL through the real Nest app:
 * the Staff write gate, the discount-type confirmation, and the financial chain the plan's matrix (section 4.1)
 * requires -- Guest menu, quote, checkout (PRICE_CHANGED, idempotency), historical snapshots, Staff order detail,
 * table-session bill, dashboard and the WhatsApp message. Local, identity-checked sandbox only
 * (TABLE_SESSION_IT_DATABASE_URL); fixtures use fresh tenant ids and stay in the disposable database.
 */
const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const GATE = 'PROMOTIONS_FIXED_ITEM_WRITES_ENABLED';
const password = 'correct horse battery staple';
const customer = { customerName: 'Sara', customerPhone: '+20 100 000 0000' };

interface World {
  restaurantId: string;
  branchId: string;
  genericQr: string;
  tableQr: string;
  categories: { pizza: string; cuts: string; drinks: string; burgers: string };
  menuId: string;
  pizza: { id: string; small: string; large: string };
  cut: { id: string; g500: string; kg1: string };
  cola: { id: string; cheese: string };
  burger: { id: string };
}

type Body = Record<string, unknown>;
interface Cart {
  items: Body[];
  fulfillment?: 'PICKUP';
  branchId?: string;
}

describeSandbox('DEC-077 B1 fixed item promotions (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let origin: string;
  let passwordHash: string;
  let gate = false;

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
    const config = app.get(ConfigService);
    origin = config.getOrThrow<string>('CORS_ORIGIN');
    passwordHash = await app.get(PasswordHasherService).hashPassword(password);
    // The write gate is read through the application's ConfigService on every write; flip it per test.
    const realGet = config.get.bind(config) as (...args: unknown[]) => unknown;
    jest
      .spyOn(config, 'get')
      .mockImplementation((key: string, ...rest: unknown[]) =>
        key === GATE ? gate : realGet(key, ...rest),
      );
  }, 30_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  // ---------------------------------------------------------------- fixtures

  async function seedWorld(label: string): Promise<World> {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `it-b1-${randomUUID()}`,
        name: `IT B1 ${label}`,
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
        countryCode: 'EG',
        locales: { create: { locale: 'en', isActive: true } },
        features: { create: { feature: 'PROMOTIONS', enabled: true } },
      },
    });
    const restaurantId = restaurant.id;
    const branch = await prisma.branch.create({
      data: {
        restaurantId,
        publicId: `it-b1-br-${randomUUID()}`,
        name: 'Main',
        status: 'ACTIVE',
        timezone: 'Africa/Cairo',
      },
    });
    const table = await prisma.table.create({
      data: {
        restaurantId,
        branchId: branch.id,
        tableNumber: '1',
        status: 'ACTIVE',
      },
    });
    const generic = await prisma.qrCode.create({
      data: {
        restaurantId,
        publicCode: `it-b1-qr-${randomUUID()}`,
        type: 'GENERIC',
        status: 'ACTIVE',
      },
    });
    const tableQr = await prisma.qrCode.create({
      data: {
        restaurantId,
        branchId: branch.id,
        tableId: table.id,
        publicCode: `it-b1-qr-${randomUUID()}`,
        type: 'TABLE',
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
    const category = async (name: string, displayOrder: number) =>
      (
        await prisma.category.create({
          data: {
            restaurantId,
            menuId: menu.id,
            status: 'ACTIVE',
            displayOrder,
            translations: { create: { locale: 'en', name } },
          },
        })
      ).id;
    const categories = {
      pizza: await category('Pizza', 0),
      cuts: await category('Cuts', 1),
      drinks: await category('Drinks', 2),
      burgers: await category('Burgers', 3),
    };
    const product = (
      categoryId: string,
      name: string,
      basePrice: string,
      displayOrder: number,
      legacy = false,
    ) =>
      prisma.product.create({
        data: {
          publicId: `it-b1-p-${randomUUID()}`,
          restaurantId,
          categoryId,
          status: 'ACTIVE',
          availability: 'AVAILABLE',
          basePrice,
          displayOrder,
          allowCustomerNotes: false,
          featured: false,
          ...(legacy
            ? {
                discountType: 'PERCENTAGE' as const,
                discountValue: '10.00',
                discountEnabled: true,
              }
            : {}),
          translations: { create: { locale: 'en', name } },
        },
      });
    const size = async (
      productId: string,
      name: string,
      price: string,
      displayOrder: number,
      isDefault: boolean,
    ) =>
      (
        await prisma.productVariant.create({
          data: {
            restaurantId,
            productId,
            status: 'ACTIVE',
            price,
            displayOrder,
            isDefault,
            translations: { create: { locale: 'en', name } },
          },
        })
      ).id;
    const pizza = await product(categories.pizza, 'Pizza', '100.00', 0);
    const cut = await product(categories.cuts, 'Beef cut', '170.00', 0);
    const cola = await product(categories.drinks, 'Cola', '40.00', 0);
    const burger = await product(
      categories.burgers,
      'Burger',
      '100.00',
      0,
      true,
    );
    const pizzaSmall = await size(pizza.id, 'Small', '60.00', 0, true);
    const pizzaLarge = await size(pizza.id, 'Large', '120.00', 1, false);
    const g500 = await size(cut.id, '500 g', '90.00', 0, true);
    const kg1 = await size(cut.id, '1 kg', '170.00', 1, false);
    const extras = await prisma.modifierGroup.create({
      data: {
        restaurantId,
        productId: cola.id,
        status: 'ACTIVE',
        minimumSelections: 0,
        maximumSelections: 1,
        displayOrder: 0,
        translations: { create: { locale: 'en', name: 'Extras' } },
        options: {
          create: {
            restaurantId,
            status: 'ACTIVE',
            priceAdjustment: '20.00',
            priceIsOverridden: false,
            displayOrder: 0,
            translations: { create: { locale: 'en', name: 'Cheese' } },
          },
        },
      },
      include: { options: true },
    });
    return {
      restaurantId,
      branchId: branch.id,
      genericQr: generic.publicCode,
      tableQr: tableQr.publicCode,
      categories,
      menuId: menu.id,
      pizza: { id: pizza.id, small: pizzaSmall, large: pizzaLarge },
      cut: { id: cut.id, g500, kg1 },
      cola: { id: cola.id, cheese: extras.options[0].id },
      burger: { id: burger.id },
    };
  }

  async function staff(w: World, kind: 'OWNER' | 'MANAGER' = 'MANAGER') {
    const email = `it-b1-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: { email, emailNormalized: email, passwordHash, status: 'ACTIVE' },
    });
    const role = await ensureStarterRole(prisma, w.restaurantId, kind);
    await prisma.restaurantMembership.create({
      data: {
        restaurantId: w.restaurantId,
        userId: user.id,
        role: kind,
        roleId: role.id,
        status: 'ACTIVE',
        allBranches: true,
      },
    });
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const session = cookies.find((value) =>
      value.startsWith('restaurant_session='),
    );
    if (!session) throw new Error('Login did not set the Staff session cookie');
    return session.split(';')[0];
  }

  const staffPath = (w: World, suffix: string) =>
    `/api/v1/restaurants/${w.restaurantId}${suffix}`;
  const get = (cookie: string, url: string) =>
    request(app.getHttpServer()).get(url).set('Cookie', cookie);
  const send = (
    method: 'post' | 'patch',
    cookie: string,
    url: string,
    body?: Body,
  ) => {
    const req = request(app.getHttpServer())
      [method](url)
      .set('Cookie', cookie)
      .set('Origin', origin);
    return body ? req.send(body) : req;
  };

  const promotionDraft = (
    w: World,
    overrides: Body = {},
    title = 'Pizza 70 off',
  ): Body => ({
    internalName: title,
    scope: 'CATEGORY',
    discountType: 'FIXED_AMOUNT',
    value: '70.00',
    categoryIds: [w.categories.pizza],
    translations: [{ locale: 'en', title }],
    ...overrides,
  });

  interface StaffPromotion {
    id: string;
    status: string;
    updatedAt: string;
    discountType: string;
    value: string;
  }
  const promo = (response: request.Response) =>
    (response.body as { data: StaffPromotion }).data;

  async function createActive(
    w: World,
    cookie: string,
    overrides: Body = {},
    title?: string,
  ) {
    const created = promo(
      await send(
        'post',
        cookie,
        staffPath(w, '/promotions'),
        promotionDraft(w, overrides, title),
      ).expect(201),
    );
    return promo(
      await send(
        'post',
        cookie,
        staffPath(w, `/promotions/${created.id}/activate`),
        {},
      ).expect(200),
    );
  }

  /** A promotion row written directly (pre-B1 shaped data: legacy CART without a minimum, percentage item, ...). */
  async function addRow(
    w: World,
    scope: 'CATEGORY' | 'MENU' | 'CART',
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT',
    value: string,
    options: {
      categoryId?: string;
      menuId?: string;
      status?: 'ACTIVE' | 'INACTIVE';
      minimumSubtotal?: string;
      title?: string;
    } = {},
  ) {
    const title = options.title ?? `${scope} ${value}`;
    const row = await prisma.promotion.create({
      data: {
        restaurantId: w.restaurantId,
        scope,
        discountType,
        value,
        status: options.status ?? 'ACTIVE',
        internalName: `Internal ${title}`,
        minimumSubtotal: options.minimumSubtotal,
        translations: { create: { locale: 'en', title } },
      },
    });
    if (scope === 'CATEGORY' && options.categoryId) {
      await prisma.promotionCategory.create({
        data: {
          promotionId: row.id,
          restaurantId: w.restaurantId,
          categoryId: options.categoryId,
        },
      });
    }
    if (scope === 'MENU') {
      await prisma.promotionMenu.create({
        data: {
          promotionId: row.id,
          restaurantId: w.restaurantId,
          menuId: options.menuId ?? w.menuId,
        },
      });
    }
    return row;
  }

  const pickup = (w: World, items: Body[]): Cart => ({
    items,
    fulfillment: 'PICKUP',
    branchId: w.branchId,
  });
  const quote = (qr: string, cart: Cart) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/quote`)
      .send(cart);
  const place = (
    qr: string,
    cart: Cart,
    expectedTotal: string,
    clientRequestId: string = randomUUID(),
  ) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/orders`)
      .send({ ...cart, ...customer, clientRequestId, expectedTotal });
  const menuOf = (qr: string) =>
    request(app.getHttpServer()).get(`/api/v1/public/qr/${qr}/menu`);

  const orderId = (response: request.Response) =>
    (response.body as { data: { id: string } }).data.id;
  const total = (response: request.Response) =>
    (response.body as { data: { total: string } }).data.total;
  const orderCount = (w: World) =>
    prisma.order.count({ where: { restaurantId: w.restaurantId } });
  const storedFor = (id: string) =>
    prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        items: { orderBy: { unitPrice: 'asc' } },
        promotions: { include: { allocations: true } },
      },
    });

  function expectProblem(response: request.Response, code: string) {
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      error: {
        code: 'PROMOTION_INVALID',
        details: {
          problems: expect.arrayContaining([
            { code, field: 'discountType' },
          ]) as unknown,
        },
      },
    });
  }

  const sizeLines = (w: World, large = 2): Body[] => [
    { productId: w.pizza.id, variantId: w.pizza.small, quantity: 1 },
    { productId: w.pizza.id, variantId: w.pizza.large, quantity: large },
  ];

  // ------------------------------------------------------------ the write gate

  it('gate OFF refuses to create or change to a fixed item promotion; gate ON accepts; evaluation is never gated', async () => {
    const w = await seedWorld('gate');
    const manager = await staff(w);

    gate = false;
    const targetsOff = await get(
      manager,
      staffPath(w, '/promotions/targets'),
    ).expect(200);
    expect(targetsOff.body).toMatchObject({
      data: { fixedItemScopeEnabled: false },
    });
    expectProblem(
      await send(
        'post',
        manager,
        staffPath(w, '/promotions'),
        promotionDraft(w),
      ),
      'FIXED_ITEM_SCOPE_NOT_ENABLED',
    );
    expectProblem(
      await send(
        'post',
        manager,
        staffPath(w, '/promotions'),
        promotionDraft(
          w,
          { scope: 'MENU', categoryIds: [], menuIds: [w.menuId] },
          'Menu fixed',
        ),
      ),
      'FIXED_ITEM_SCOPE_NOT_ENABLED',
    );
    // percentage item promotions and fixed CART promotions are unaffected by the gate
    await send(
      'post',
      manager,
      staffPath(w, '/promotions'),
      promotionDraft(
        w,
        { discountType: 'PERCENTAGE', value: '15.00' },
        'Pizza 15 %',
      ),
    ).expect(201);
    await send('post', manager, staffPath(w, '/promotions'), {
      internalName: 'Cart fixed',
      scope: 'CART',
      discountType: 'FIXED_AMOUNT',
      value: '10.00',
      minimumSubtotal: '100.00',
      translations: [{ locale: 'en', title: 'Cart fixed' }],
    }).expect(201);

    gate = true;
    expect(
      (await get(manager, staffPath(w, '/promotions/targets')).expect(200))
        .body,
    ).toMatchObject({ data: { fixedItemScopeEnabled: true } });
    const active = await createActive(w, manager);
    expect(active).toMatchObject({
      status: 'ACTIVE',
      discountType: 'FIXED_AMOUNT',
      value: '70.00',
    });

    // gate OFF again: the active fixed promotion KEEPS APPLYING (evaluation never reads the gate)
    gate = false;
    const large = pickup(w, [
      { productId: w.pizza.id, variantId: w.pizza.large, quantity: 1 },
    ]);
    expect(total(await quote(w.genericQr, large).expect(200))).toBe('50.00');

    const url = staffPath(w, `/promotions/${active.id}`);
    // metadata-only edits and a whole-form re-send of the stored values are allowed
    await send('patch', manager, url, { internalName: 'Renamed' }).expect(200);
    const resent = promo(
      await send('patch', manager, url, {
        ...promotionDraft(w, {}, 'Renamed again'),
        expectedUpdatedAt: undefined,
      }).expect(200),
    );
    expect(resent).toMatchObject({
      discountType: 'FIXED_AMOUNT',
      value: '70.00',
      status: 'ACTIVE',
    });
    // anything that changes pricing or eligibility of a fixed item promotion is refused while off
    expectProblem(
      await send('patch', manager, url, { value: '60.00' }),
      'FIXED_ITEM_SCOPE_NOT_ENABLED',
    );
    expectProblem(
      await send('patch', manager, url, { endsOn: '2099-12-31' }),
      'FIXED_ITEM_SCOPE_NOT_ENABLED',
    );
    expect(total(await quote(w.genericQr, large).expect(200))).toBe('50.00');

    // preview: an unchanged stored fixed promotion stays previewable; a changed fixed draft is gated
    const previewBody = (draft: Body, promotionId?: string) => ({
      draft,
      promotionId,
      branchId: w.branchId,
      orderType: 'PICKUP',
      items: [{ productId: w.pizza.id, quantity: 1 }],
    });
    await send(
      'post',
      manager,
      staffPath(w, '/promotions/preview'),
      previewBody(promotionDraft(w, {}, 'Renamed again'), active.id),
    ).expect(200);
    expectProblem(
      await send(
        'post',
        manager,
        staffPath(w, '/promotions/preview'),
        previewBody(
          promotionDraft(w, { value: '60.00' }, 'Renamed again'),
          active.id,
        ),
      ),
      'FIXED_ITEM_SCOPE_NOT_ENABLED',
    );

    // deactivate and archive stay allowed; activating a fixed item promotion is gated
    await send('post', manager, `${url}/deactivate`, {}).expect(200);
    expectProblem(
      await send('post', manager, `${url}/activate`, {}),
      'FIXED_ITEM_SCOPE_NOT_ENABLED',
    );
    gate = true;
    await send('post', manager, `${url}/activate`, {}).expect(200);
    gate = false;
    await send('post', manager, `${url}/archive`, {}).expect(200);
  });

  // ------------------------------------------------- discount-type confirmation

  it('an older client cannot silently turn a fixed item promotion into a percentage one (409 without confirmation)', async () => {
    const w = await seedWorld('type-change');
    const manager = await staff(w);
    gate = true;
    const stored = await createActive(w, manager);
    gate = false;
    const url = staffPath(w, `/promotions/${stored.id}`);
    const large = pickup(w, [
      { productId: w.pizza.id, variantId: w.pizza.large, quantity: 1 },
    ]);
    expect(total(await quote(w.genericQr, large).expect(200))).toBe('50.00');

    // exactly what the pre-B1 editor sends: the whole form with discountType forced to PERCENTAGE
    const stale = await send('patch', manager, url, {
      ...promotionDraft(w, { discountType: 'PERCENTAGE' }),
      expectedUpdatedAt: stored.updatedAt,
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      error: {
        code: 'PROMOTION_DISCOUNT_TYPE_CHANGE_CONFIRMATION_REQUIRED',
        details: {
          fields: ['discountType'],
          from: 'FIXED_AMOUNT',
          to: 'PERCENTAGE',
          value: '70.00',
        },
      },
    });
    const unchanged = await prisma.promotion.findUniqueOrThrow({
      where: { id: stored.id },
    });
    expect(unchanged).toMatchObject({
      discountType: 'FIXED_AMOUNT',
      status: 'ACTIVE',
    });
    expect(unchanged.value.toFixed(2)).toBe('70.00');
    expect(unchanged.updatedAt.toISOString()).toBe(stored.updatedAt);
    expect(total(await quote(w.genericQr, large).expect(200))).toBe('50.00'); // customer price untouched

    // an explicit false is not a confirmation
    const falseFlag = await send('patch', manager, url, {
      discountType: 'PERCENTAGE',
      confirmDiscountTypeChange: false,
    });
    expect(falseFlag.status).toBe(409);
    // an invalid change reports its validation problems first and still writes nothing
    expect(
      (
        await send('patch', manager, url, {
          discountType: 'PERCENTAGE',
          value: '150.00',
        })
      ).status,
    ).toBe(422);
    // omitting the type, or sending the stored one, needs no confirmation
    await send('patch', manager, url, { internalName: 'Still fixed' }).expect(
      200,
    );

    // explicit confirmation converts it (gate off is fine: the result is not fixed)
    const converted = promo(
      await send('patch', manager, url, {
        discountType: 'PERCENTAGE',
        value: '25.00',
        confirmDiscountTypeChange: true,
      }).expect(200),
    );
    expect(converted).toMatchObject({
      discountType: 'PERCENTAGE',
      value: '25.00',
    });
    expect(total(await quote(w.genericQr, large).expect(200))).toBe('90.00'); // 120 - 25 %

    // converting back to FIXED needs the enabled gate AND the confirmation (the gate problem is reported first)
    expectProblem(
      await send('patch', manager, url, {
        discountType: 'FIXED_AMOUNT',
        value: '10.00',
        confirmDiscountTypeChange: true,
      }),
      'FIXED_ITEM_SCOPE_NOT_ENABLED',
    );
    gate = true;
    expect(
      (
        await send('patch', manager, url, {
          discountType: 'FIXED_AMOUNT',
          value: '10.00',
        })
      ).status,
    ).toBe(409);
    await send('patch', manager, url, {
      discountType: 'FIXED_AMOUNT',
      value: '10.00',
      confirmDiscountTypeChange: true,
    }).expect(200);
    gate = false;
  });

  it('the confirmation applies to every scope, not only MENU / CATEGORY', async () => {
    const w = await seedWorld('type-change-cart');
    const manager = await staff(w);
    const cart = promo(
      await send('post', manager, staffPath(w, '/promotions'), {
        internalName: 'Cart 10 %',
        scope: 'CART',
        discountType: 'PERCENTAGE',
        value: '10.00',
        minimumSubtotal: '100.00',
        translations: [{ locale: 'en', title: 'Cart 10 %' }],
      }).expect(201),
    );
    const url = staffPath(w, `/promotions/${cart.id}`);
    const refused = await send('patch', manager, url, {
      discountType: 'FIXED_AMOUNT',
      value: '10.00',
    });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      error: {
        code: 'PROMOTION_DISCOUNT_TYPE_CHANGE_CONFIRMATION_REQUIRED',
        details: { from: 'PERCENTAGE', to: 'FIXED_AMOUNT' },
      },
    });
    expect(promo(await get(manager, url).expect(200)).discountType).toBe(
      'PERCENTAGE',
    );
    await send('patch', manager, url, {
      discountType: 'FIXED_AMOUNT',
      value: '10.00',
      confirmDiscountTypeChange: true,
    }).expect(200);
  });

  // ------------------------------------------------- the financial chain (4.1)

  it('Guest menu, quote, checkout, idempotency, PRICE_CHANGED, snapshots, Staff detail and dashboard agree for a fixed CATEGORY promotion', async () => {
    const w = await seedWorld('chain');
    const manager = await staff(w);
    gate = true;
    const active = await createActive(w, manager);
    const qr = w.genericQr;

    // Guest menu: per-size capped saving, value is the configured per-unit amount
    const menu = await menuOf(qr).expect(200);
    const pizzaCard = (
      menu.body as {
        data: {
          menu: {
            categories: {
              products: {
                id?: string;
                variants: { name: string; itemPromotion?: unknown }[];
              }[];
            }[];
          };
        };
      }
    ).data.menu.categories
      .flatMap((category) => category.products)
      .find((p) => p.variants.some((v) => v.name === 'Small'));
    const byName = (name: string) =>
      pizzaCard?.variants.find((variant) => variant.name === name)
        ?.itemPromotion;
    expect(byName('Small')).toEqual({
      scope: 'CATEGORY',
      type: 'FIXED_AMOUNT',
      value: '70.00',
      amountOff: '60.00', // capped at the 60.00 size price
      previewPrice: null,
    });
    expect(byName('Large')).toEqual({
      scope: 'CATEGORY',
      type: 'FIXED_AMOUNT',
      value: '70.00',
      amountOff: '70.00',
      previewPrice: null,
    });

    // Quote: Small x1 + Large x2 -> 60 + 140 off a 300.00 basket
    const cart = pickup(w, sizeLines(w));
    const quoted = await quote(qr, cart).expect(200);
    expect(quoted.body).toMatchObject({
      data: {
        subtotal: '100.00',
        discountTotal: '200.00',
        total: '100.00',
        promotions: [
          { scope: 'CATEGORY', title: 'Pizza 70 off', amount: '200.00' },
        ],
        items: [
          {
            unitPrice: '60.00',
            quantity: 1,
            discountAmount: '0.00',
            lineTotal: '60.00',
            promotionDiscount: '60.00',
          },
          {
            unitPrice: '120.00',
            quantity: 2,
            discountAmount: '0.00',
            lineTotal: '240.00',
            promotionDiscount: '140.00',
          },
        ],
      },
    });

    // Checkout with the quoted total, then an idempotent replay and a refused reuse
    const key = randomUUID();
    const placed = await place(qr, cart, '100.00', key).expect(201);
    const firstId = orderId(placed);
    expect(total(placed)).toBe('100.00');
    const replay = await place(qr, cart, '100.00', key);
    expect([200, 201]).toContain(replay.status);
    expect(orderId(replay)).toBe(firstId);
    const reused = await place(qr, pickup(w, sizeLines(w, 3)), '100.00', key);
    expect(reused.status).toBe(409);
    expect(reused.body).toMatchObject({
      error: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
    expect(await orderCount(w)).toBe(1);

    // Historical snapshot: one FIXED row (configured value, amount actually saved) + per-line allocations
    const stored = await storedFor(firstId);
    expect(stored.promotions).toHaveLength(1);
    const row = stored.promotions[0];
    expect(row).toMatchObject({
      scope: 'CATEGORY',
      discountType: 'FIXED_AMOUNT',
      promotionId: active.id,
    });
    expect(row.value.toFixed(2)).toBe('70.00');
    expect(row.amount.toFixed(2)).toBe('200.00');
    const shareByUnitPrice: Record<string, string> = {};
    for (const allocation of row.allocations) {
      const line = stored.items.find(
        (item) => item.id === allocation.orderItemId,
      );
      shareByUnitPrice[line?.unitPrice.toFixed(2) ?? 'missing'] =
        allocation.amount.toFixed(2);
    }
    expect(shareByUnitPrice).toEqual({ '60.00': '60.00', '120.00': '140.00' });
    expect(
      stored.items.map((item) => [
        item.discountAmount.toFixed(2),
        item.lineTotal.toFixed(2),
      ]),
    ).toEqual([
      ['0.00', '60.00'],
      ['0.00', '240.00'],
    ]);
    expect(stored.subtotalAmount.toFixed(2)).toBe('100.00'); // 300 - 200
    expect(stored.promotionDiscountAmount.toFixed(2)).toBe('200.00');
    expect(stored.discountTotalAmount.toFixed(2)).toBe('200.00');
    expect(stored.totalAmount.toFixed(2)).toBe('100.00');

    // PRICE_CHANGED: Staff change the value between quote and submit -> nothing created, same key reconfirms
    gate = true;
    await send('patch', manager, staffPath(w, `/promotions/${active.id}`), {
      value: '50.00',
    }).expect(200);
    const staleKey = randomUUID();
    const stale = await place(qr, cart, '100.00', staleKey);
    expect(stale.status).toBe(422);
    expect(stale.body).toMatchObject({
      error: {
        code: 'PRICE_CHANGED',
        details: {
          pricing: {
            subtotal: '150.00',
            discountTotal: '150.00',
            total: '150.00',
          },
        },
      },
    });
    expect(await orderCount(w)).toBe(1);
    const refreshed = await quote(qr, cart).expect(200);
    expect(total(refreshed)).toBe('150.00');
    const reconfirmed = await place(qr, cart, '150.00', staleKey).expect(201);
    expect(total(reconfirmed)).toBe('150.00');
    expect(await orderCount(w)).toBe(2);

    // History never follows the live promotion: edit + archive, the first order is unchanged
    await send(
      'post',
      manager,
      staffPath(w, `/promotions/${active.id}/archive`),
      {},
    ).expect(200);
    const after = await storedFor(firstId);
    expect(after.promotions[0].amount.toFixed(2)).toBe('200.00');
    expect(after.promotions[0].value.toFixed(2)).toBe('70.00');
    expect(after.totalAmount.toFixed(2)).toBe('100.00');

    // Staff order detail / receipt reader: title + amount snapshot, never a recomputation
    const detail = await get(
      manager,
      staffPath(w, `/orders/${firstId}`),
    ).expect(200);
    expect(detail.body).toMatchObject({
      data: {
        subtotalAmount: '100.00',
        discountTotal: '200.00',
        totalAmount: '100.00',
        promotions: [
          { scope: 'CATEGORY', title: 'Pizza 70 off', amount: '200.00' },
        ],
        items: [
          { promotionDiscount: '60.00' },
          { promotionDiscount: '140.00' },
        ],
      },
    });

    // Dashboard: net sold amount per product = line total - allocations
    const dashboard = await get(
      manager,
      staffPath(w, '/dashboard?range=today'),
    ).expect(200);
    const top = (
      dashboard.body as {
        data: {
          topProducts: { name: string; quantity: number; amount: string }[];
        };
      }
    ).data.topProducts;
    // order 1: 300 - 200 = 100.00 net; the reconfirmed order (value 50.00): 300 - 150 = 150.00 net
    expect(top.find((entry) => entry.name === 'Pizza')).toMatchObject({
      quantity: 6,
      amount: '250.00',
    });
    gate = false;
  }, 60_000);

  it('Dine-in: the table-session bill and the order read the same fixed saving', async () => {
    const w = await seedWorld('dine-in');
    const manager = await staff(w);
    gate = true;
    await createActive(w, manager);
    const cart: Cart = {
      items: [{ productId: w.pizza.id, variantId: w.pizza.large, quantity: 2 }],
    };
    const quoted = await quote(w.tableQr, cart).expect(200);
    expect(total(quoted)).toBe('100.00'); // 240 - 140
    const placed = await place(w.tableQr, cart, '100.00').expect(201);
    const stored = await storedFor(orderId(placed));
    expect(stored.tableSessionId).not.toBeNull();
    const session = await prisma.tableSession.findUniqueOrThrow({
      where: { id: stored.tableSessionId as string },
      select: { publicId: true },
    });
    const bill = await get(
      manager,
      staffPath(w, `/table-sessions/${session.publicId}/bill`),
    ).expect(200);
    const text = JSON.stringify(bill.body);
    expect(text).toContain('"140.00"');
    expect(text).toContain('Pizza 70 off');
    gate = false;
  }, 60_000);

  it('WhatsApp message is built from the same server pricing (fixed amount shows its saving)', async () => {
    const w = await seedWorld('whatsapp');
    const manager = await staff(w);
    gate = true;
    await createActive(w, manager);
    await prisma.restaurant.update({
      where: { id: w.restaurantId },
      data: { whatsappNumber: '+201012345678', whatsappOrderingEnabled: true },
    });
    const response = await request(app.getHttpServer())
      .post(`/api/v1/public/qr/${w.genericQr}/whatsapp-order`)
      .send({
        items: [
          { productId: w.pizza.id, variantId: w.pizza.large, quantity: 2 },
        ],
        fulfillment: 'PICKUP',
        branchId: w.branchId,
        clientRequestId: randomUUID(),
        customerName: 'Mona Hassan',
        customerPhone: '01012345678',
      })
      .expect(200);
    const data = (response.body as { data: { total: string; message: string } })
      .data;
    expect(data.total).toBe('100.00');
    expect(data.message).toContain('Pizza 70 off');
    expect(data.message).toContain('140');
    expect(data.message).toContain('*Total: 100 EGP*');
    expect(await orderCount(w)).toBe(0); // a dry run stores nothing
    gate = false;
  }, 60_000);

  // ------------------------------------- size, weight, extras, competition, cart

  it('weighted sizes, paid extras and competition price correctly end to end', async () => {
    const w = await seedWorld('sizes-weights');
    const manager = await staff(w);
    gate = true;
    await createActive(
      w,
      manager,
      { categoryIds: [w.categories.cuts], value: '100.00' },
      'Cuts 100 off',
    );
    // 2 x 500 g (90.00 each, capped) + 1 x 1 kg (170.00): 180 + 100 = 280 off a 350.00 basket
    const cuts = pickup(w, [
      { productId: w.cut.id, variantId: w.cut.g500, quantity: 2 },
      { productId: w.cut.id, variantId: w.cut.kg1, quantity: 1 },
    ]);
    const cutQuote = await quote(w.genericQr, cuts).expect(200);
    expect(cutQuote.body).toMatchObject({
      data: { subtotal: '70.00', discountTotal: '280.00', total: '70.00' },
    });
    const cutOrder = await place(w.genericQr, cuts, '70.00').expect(201);
    const cutStored = await storedFor(orderId(cutOrder));
    expect(cutStored.promotions[0].amount.toFixed(2)).toBe('280.00');
    expect(cutStored.promotions[0].value.toFixed(2)).toBe('100.00');

    // Paid extras are never discounted: (40 - 10 + 20) x 2 = 100
    await createActive(
      w,
      manager,
      { categoryIds: [w.categories.drinks], value: '10.00' },
      'Drinks 10 off',
    );
    const cola = pickup(w, [
      { productId: w.cola.id, quantity: 2, modifierOptionIds: [w.cola.cheese] },
    ]);
    const colaQuote = await quote(w.genericQr, cola).expect(200);
    expect(colaQuote.body).toMatchObject({
      data: { subtotal: '100.00', discountTotal: '20.00', total: '100.00' },
    });

    // Competition: the fixed category promotion beats the beaten legacy 10 % discount, which is not stored
    await createActive(
      w,
      manager,
      { categoryIds: [w.categories.burgers], value: '25.00' },
      'Burgers 25 off',
    );
    const burger = pickup(w, [{ productId: w.burger.id, quantity: 1 }]);
    const burgerOrder = await place(w.genericQr, burger, '75.00').expect(201);
    const burgerStored = await storedFor(orderId(burgerOrder));
    expect(burgerStored.items[0].discountAmount.toFixed(2)).toBe('0.00'); // legacy 10.00 lost, not stored
    expect(burgerStored.promotions[0].amount.toFixed(2)).toBe('25.00');

    // A cart promotion that saves strictly more wins, removes the item discounts and is never combined
    await addRow(w, 'CART', 'FIXED_AMOUNT', '50.00', {
      minimumSubtotal: '150.00',
      title: 'Cart 50',
    });
    const two = pickup(w, [{ productId: w.burger.id, quantity: 2 }]);
    const cartWin = await quote(w.genericQr, two).expect(200);
    // item path: 2 x 25 = 50.00; cart 50.00 does not win a tie
    expect(cartWin.body).toMatchObject({
      data: { discountTotal: '50.00', total: '150.00' },
    });
    await addRow(w, 'CART', 'FIXED_AMOUNT', '60.00', {
      minimumSubtotal: '150.00',
      title: 'Cart 60',
    });
    const cartWins = await quote(w.genericQr, two).expect(200);
    expect(cartWins.body).toMatchObject({
      data: {
        discountTotal: '60.00',
        total: '140.00',
        promotions: [{ scope: 'CART', amount: '60.00' }],
      },
    });
    gate = false;
  }, 90_000);

  it('percentage item promotions and legacy CART promotions without a minimum keep pricing exactly as before', async () => {
    const w = await seedWorld('regression');
    gate = false;
    await addRow(w, 'CATEGORY', 'PERCENTAGE', '15.00', {
      categoryId: w.categories.pizza,
      title: 'Pizza 15 %',
    });
    const large = pickup(w, [
      { productId: w.pizza.id, variantId: w.pizza.large, quantity: 1 },
    ]);
    const quoted = await quote(w.genericQr, large).expect(200);
    expect(quoted.body).toMatchObject({
      data: {
        subtotal: '102.00',
        discountTotal: '18.00',
        promotions: [{ scope: 'CATEGORY', amount: '18.00' }],
      },
    });
    const placed = await place(w.genericQr, large, '102.00').expect(201);
    const row = (await storedFor(orderId(placed))).promotions[0];
    expect(row).toMatchObject({
      scope: 'CATEGORY',
      discountType: 'PERCENTAGE',
    });
    expect(row.value.toFixed(2)).toBe('15.00');
    expect(row.amount.toFixed(2)).toBe('18.00');

    // a pre-existing CART promotion with a NULL minimum (legacy) still applies to any basket
    const legacy = await seedWorld('regression-legacy');
    await addRow(legacy, 'CART', 'PERCENTAGE', '10.00', {
      title: 'Legacy cart 10 %',
    });
    const cola = pickup(legacy, [{ productId: legacy.cola.id, quantity: 1 }]);
    expect(
      (await quote(legacy.genericQr, cola).expect(200)).body,
    ).toMatchObject({ data: { discountTotal: '4.00', total: '36.00' } });
  });

  it('is tenant-isolated: another restaurant promotion never applies and cannot be edited or targeted', async () => {
    const a = await seedWorld('tenant-a');
    const b = await seedWorld('tenant-b');
    const managerA = await staff(a);
    gate = true;
    const mine = await createActive(a, managerA);
    // B's menu is untouched by A's promotion
    const bQuote = await quote(
      b.genericQr,
      pickup(b, [
        { productId: b.pizza.id, variantId: b.pizza.large, quantity: 1 },
      ]),
    ).expect(200);
    expect(total(bQuote)).toBe('120.00');
    // A's staff cannot target B's category or touch B's data through A's path
    const foreignTarget = await send(
      'post',
      managerA,
      staffPath(a, '/promotions'),
      promotionDraft(
        a,
        { categoryIds: [b.categories.pizza] },
        'Foreign target',
      ),
    );
    expect(foreignTarget.status).toBe(422);
    expect(foreignTarget.body).toMatchObject({
      error: { code: 'INVALID_PROMOTION_TARGET' },
    });
    const managerB = await staff(b);
    const foreignPatch = await send(
      'patch',
      managerB,
      staffPath(b, `/promotions/${mine.id}`),
      {
        internalName: 'Hijack',
      },
    );
    expect(foreignPatch.status).toBe(404);
    gate = false;
  }, 60_000);
});
