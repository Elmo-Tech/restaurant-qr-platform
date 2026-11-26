import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PasswordHasherService } from '../src/auth/password/password-hasher.service';
import { requestContextMiddleware } from '../src/common/http/request-context.middleware';
import { validationExceptionFactory } from '../src/common/http/validation-exception.factory';
import { PrismaService } from '../src/database/prisma.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/**
 * DEC-077 B3 (backend-authoritative contextual preview) against REAL PostgreSQL through the real Nest app.
 *
 * 1. The pre-B3 `POST /preview` contract is recorded in `fixtures/promotions-preview-legacy-v1.json` (recorded on the
 *    unchanged B2 build, `RECORD_PREVIEW_FIXTURE=1`) and must stay byte-identical for requests without `contract`.
 * 2. The opt-in `CONTEXTUAL_V1` contract: REAL / ILLUSTRATIVE / INCOMPLETE, deterministic examples, competition,
 *    boundaries, fixed per-unit discounts, sizes, eligibility, tenant / Branch / permission rules and no writes.
 * 3. Preview == Guest quote: every contextual example is re-priced through the real `POST /public/qr/:code/quote`
 *    with identical inputs and must match to the cent.
 *
 * Local, identity-checked sandbox only (TABLE_SESSION_IT_DATABASE_URL); fixtures use fresh tenant ids.
 */
const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const password = 'correct horse battery staple';
const FIXTURE = join(
  __dirname,
  'fixtures',
  'promotions-preview-legacy-v1.json',
);

type Body = Record<string, unknown>;

interface World {
  restaurantId: string;
  branchId: string;
  otherBranchId: string;
  zoneId: string;
  zoneFreeMinId: string;
  zoneCId: string; // fee 25.00, zone minimum 0.00 (Guest quotes of delivery examples)
  genericQr: string;
  menuId: string;
  burgersCategory: string;
  drinksCategory: string;
  dessertsCategory: string;
  emptyCategory: string;
  secondMenuId: string;
  secondMenuCategory: string;
  burger: string; // 120.00, Burgers
  burgerBig: string; // 200.00, Burgers
  pizza: string; // sizes: Small 80.00 (first), Large 140.00
  pizzaSmall: string;
  pizzaLarge: string;
  cola: string; // 40.00, Drinks
  latte: string; // 50.00, Drinks, 20 % legacy product discount
  mint: string; // 0.50, Drinks
  cake: string; // 30.00, Desserts
  soldOut: string; // SOLD_OUT dessert
  secondMenuProduct: string; // not in the primary menu
}

interface Run {
  world: World;
}

const GATE = 'PROMOTIONS_FIXED_ITEM_WRITES_ENABLED';

describeSandbox('DEC-077 B3 contextual preview (real PostgreSQL)', () => {
  // The B1 write gate (default off) is read through the ConfigService on every write / check; flipped per test.
  let gate = false;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let origin: string;
  let passwordHash: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // As main.ts does: the X-Request-Id correlation the contextual answer falls back to.
    app.use(requestContextMiddleware);
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
    origin = app.get(ConfigService).getOrThrow<string>('CORS_ORIGIN');
    passwordHash = await app.get(PasswordHasherService).hashPassword(password);
    const config = app.get(ConfigService);
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
    const { id: restaurantId } = await prisma.restaurant.create({
      data: {
        publicId: `it-b3-${randomUUID()}`,
        name: `IT B3 ${label}`,
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
        countryCode: 'EG',
        locales: { create: { locale: 'en', isActive: true } },
        features: { create: { feature: 'PROMOTIONS', enabled: true } },
      },
    });
    const branch = (name: string) =>
      prisma.branch.create({
        data: {
          restaurantId,
          publicId: `it-b3-br-${randomUUID()}`,
          name,
          status: 'ACTIVE',
          timezone: 'Africa/Cairo',
        },
      });
    const main = await branch('Main');
    const other = await branch('Other');
    const generic = await prisma.qrCode.create({
      data: {
        restaurantId,
        publicCode: `it-b3-qr-${randomUUID()}`,
        type: 'GENERIC',
        status: 'ACTIVE',
      },
    });
    const zone = (name: string, fee: string, min: string, order: number) =>
      prisma.deliveryZone.create({
        data: {
          restaurantId,
          branchId: main.id,
          name,
          status: 'ACTIVE',
          displayOrder: order,
          deliveryFee: fee,
          minimumOrder: min,
        },
      });
    const zoneA = await zone('Zone A', '25.00', '150.00', 0);
    const zoneB = await zone('Zone B', '0.00', '0.00', 1);
    const zoneC = await zone('Zone C', '25.00', '0.00', 2);
    const menu = (name: string, primary: boolean, order: number) =>
      prisma.menu.create({
        data: {
          restaurantId,
          nameInternal: name,
          status: 'ACTIVE',
          displayOrder: order,
          isPrimary: primary,
          translations: { create: { locale: 'en', name } },
        },
      });
    const primary = await menu('Primary', true, 0);
    const second = await menu('Second', false, 1);
    const category = async (menuId: string, name: string, order: number) =>
      (
        await prisma.category.create({
          data: {
            restaurantId,
            menuId,
            status: 'ACTIVE',
            displayOrder: order,
            translations: { create: { locale: 'en', name } },
          },
        })
      ).id;
    const burgers = await category(primary.id, 'Burgers', 0);
    const drinks = await category(primary.id, 'Drinks', 1);
    const desserts = await category(primary.id, 'Desserts', 2);
    const empty = await category(primary.id, 'Empty', 3);
    const secondCategory = await category(second.id, 'Second menu', 0);
    const product = (
      categoryId: string,
      name: string,
      basePrice: string,
      displayOrder: number,
      extra: Body = {},
    ) =>
      prisma.product.create({
        data: {
          publicId: `it-b3-p-${randomUUID()}`,
          restaurantId,
          categoryId,
          status: 'ACTIVE',
          availability: 'AVAILABLE',
          basePrice,
          displayOrder,
          allowCustomerNotes: false,
          featured: false,
          translations: { create: { locale: 'en', name } },
          ...extra,
        },
      });
    const burger = await product(burgers, 'Burger', '120.00', 0);
    const burgerBig = await product(burgers, 'Big Burger', '200.00', 1);
    const pizza = await product(burgers, 'Pizza', '100.00', 2);
    const small = await prisma.productVariant.create({
      data: {
        restaurantId,
        productId: pizza.id,
        status: 'ACTIVE',
        price: '80.00',
        displayOrder: 0,
        isDefault: true,
        translations: { create: { locale: 'en', name: 'Small' } },
      },
    });
    const large = await prisma.productVariant.create({
      data: {
        restaurantId,
        productId: pizza.id,
        status: 'ACTIVE',
        price: '140.00',
        displayOrder: 1,
        isDefault: false,
        translations: { create: { locale: 'en', name: 'Large' } },
      },
    });
    const cola = await product(drinks, 'Cola', '40.00', 0);
    const latte = await product(drinks, 'Latte', '50.00', 1, {
      discountType: 'PERCENTAGE',
      discountValue: '20.00',
      discountEnabled: true,
    });
    const mint = await product(drinks, 'Mint', '0.50', 2);
    const cake = await product(desserts, 'Cake', '30.00', 0);
    const soldOut = await product(desserts, 'Soldout pie', '35.00', 1, {
      availability: 'SOLD_OUT',
    });
    const secondProduct = await product(
      secondCategory,
      'Second dish',
      '60.00',
      0,
    );
    return {
      restaurantId,
      branchId: main.id,
      otherBranchId: other.id,
      zoneId: zoneA.id,
      zoneFreeMinId: zoneB.id,
      zoneCId: zoneC.id,
      genericQr: generic.publicCode,
      menuId: primary.id,
      burgersCategory: burgers,
      drinksCategory: drinks,
      dessertsCategory: desserts,
      emptyCategory: empty,
      secondMenuId: second.id,
      secondMenuCategory: secondCategory,
      burger: burger.id,
      burgerBig: burgerBig.id,
      pizza: pizza.id,
      pizzaSmall: small.id,
      pizzaLarge: large.id,
      cola: cola.id,
      latte: latte.id,
      mint: mint.id,
      cake: cake.id,
      soldOut: soldOut.id,
      secondMenuProduct: secondProduct.id,
    };
  }

  async function staff(
    w: World,
    kind: 'OWNER' | 'MANAGER' | 'CASHIER' | 'WAITER' = 'MANAGER',
    branchIds?: string[],
  ) {
    const email = `it-b3-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: { email, emailNormalized: email, passwordHash, status: 'ACTIVE' },
    });
    const role = await ensureStarterRole(prisma, w.restaurantId, kind);
    const membership = await prisma.restaurantMembership.create({
      data: {
        restaurantId: w.restaurantId,
        userId: user.id,
        role: kind,
        roleId: role.id,
        status: 'ACTIVE',
        allBranches: branchIds === undefined,
      },
    });
    for (const branchId of branchIds ?? []) {
      await prisma.restaurantMembershipBranch.create({
        data: { restaurantMembershipId: membership.id, branchId },
      });
    }
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

  const draft = (
    internalName: string,
    scope: string,
    overrides: Body = {},
  ): Body => ({
    internalName,
    scope,
    discountType: 'PERCENTAGE',
    value: '10.00',
    translations: [{ locale: 'en', title: internalName }],
    ...overrides,
  });

  /** Creates and activates a promotion through the Staff API (what Guest quotes load). */
  async function activate(w: World, cookie: string, body: Body) {
    const created = await send(
      'post',
      cookie,
      staffPath(w, '/promotions'),
      body,
    ).expect(201);
    const id = (created.body as { data: { id: string } }).data.id;
    await send(
      'post',
      cookie,
      staffPath(w, `/promotions/${id}/activate`),
      {},
    ).expect(200);
    return id;
  }

  const previewUrl = (w: World) => staffPath(w, '/promotions/preview');
  const legacyPreview = (w: World, cookie: string, body: Body) =>
    send('post', cookie, previewUrl(w), body);

  describe('legacy contract (no `contract` field) is unchanged', () => {
    let run: Run;
    let cookie: string;

    beforeAll(async () => {
      run = { world: await seedWorld('legacy') };
      cookie = await staff(run.world);
    }, 60_000);

    it('matches the contract recorded before B3, byte for byte', async () => {
      const w = run.world;
      const base = { branchId: w.branchId, orderType: 'PICKUP' };
      const cases: Record<string, Body> = {
        cartApplied: {
          ...base,
          draft: draft('Cart 10', 'CART', { minimumSubtotal: '200.00' }),
          items: [{ productId: w.burger, quantity: 2 }],
        },
        cartBelow: {
          ...base,
          draft: draft('Cart 10', 'CART', { minimumSubtotal: '200.00' }),
          items: [{ productId: w.burger, quantity: 1 }],
        },
        // The unchanged preview contract: a CART draft without a minimum stays previewable (B2 rule is for saving).
        cartNoMinimum: {
          ...base,
          draft: draft('Cart 10 no minimum', 'CART'),
          items: [{ productId: w.cola, quantity: 1 }],
        },
        quantityFixed: {
          ...base,
          draft: draft('Qty fixed', 'QUANTITY', {
            discountType: 'FIXED_AMOUNT',
            value: '30.00',
            minimumQuantity: 3,
            quantityBasis: 'UNITS',
          }),
          items: [{ productId: w.burger, quantity: 3 }],
        },
        categoryPercent: {
          ...base,
          draft: draft('Burgers 15', 'CATEGORY', {
            value: '15.00',
            categoryIds: [w.burgersCategory],
          }),
          items: [
            { productId: w.burger, quantity: 2 },
            { productId: w.pizza, quantity: 1 },
          ],
        },
        menuLosesToLegacyDiscount: {
          ...base,
          draft: draft('Menu 10', 'MENU', { menuIds: [w.menuId] }),
          items: [{ productId: w.latte, quantity: 1 }],
        },
        delivery: {
          branchId: w.branchId,
          orderType: 'DELIVERY',
          deliveryZoneId: w.zoneId,
          draft: draft('Free delivery', 'DELIVERY', {
            value: '100.00',
            minimumSubtotal: '150.00',
          }),
          items: [{ productId: w.burger, quantity: 1 }],
        },
        emptyItems: {
          ...base,
          draft: draft('Cart 10', 'CART', { minimumSubtotal: '50.00' }),
          items: [],
        },
      };
      const recorded: Record<string, unknown> = {};
      for (const [name, body] of Object.entries(cases)) {
        const response = await legacyPreview(w, cookie, body);
        recorded[name] = {
          status: response.status,
          body: response.body as unknown,
        };
      }
      // Invalid drafts and selections keep their documented 422 / 404 errors (code and details only).
      const errorCases: Record<string, Body> = {
        invalidDraft: {
          ...base,
          draft: draft('Bad', 'CATEGORY', { value: '10.00', categoryIds: [] }),
          items: [{ productId: w.burger, quantity: 1 }],
        },
        wrongBranch: {
          branchId: randomUUID(),
          orderType: 'PICKUP',
          draft: draft('Cart 10', 'CART', { minimumSubtotal: '50.00' }),
          items: [],
        },
        zoneWithoutDelivery: {
          ...base,
          deliveryZoneId: w.zoneId,
          draft: draft('Cart 10', 'CART', { minimumSubtotal: '50.00' }),
          items: [],
        },
        deliveryWithoutZone: {
          branchId: w.branchId,
          orderType: 'DELIVERY',
          draft: draft('Cart 10', 'CART', { minimumSubtotal: '50.00' }),
          items: [],
        },
        unknownProduct: {
          ...base,
          draft: draft('Cart 10', 'CART', { minimumSubtotal: '50.00' }),
          items: [{ productId: randomUUID(), quantity: 1 }],
        },
        missingItems: {
          ...base,
          draft: draft('Cart 10', 'CART', { minimumSubtotal: '50.00' }),
        },
        unknownPromotion: {
          ...base,
          promotionId: randomUUID(),
          draft: draft('Cart 10', 'CART', { minimumSubtotal: '50.00' }),
          items: [],
        },
      };
      for (const [name, body] of Object.entries(errorCases)) {
        const response = await legacyPreview(w, cookie, body);
        const error = (
          response.body as { error?: { code?: string; details?: unknown } }
        ).error;
        recorded[name] = {
          status: response.status,
          code: error?.code ?? null,
          details: error?.details ?? null,
        };
      }
      if (process.env.RECORD_PREVIEW_FIXTURE === '1') {
        writeFileSync(FIXTURE, `${JSON.stringify(recorded, null, 2)}\n`);
      }
      expect(existsSync(FIXTURE)).toBe(true);
      expect(JSON.parse(JSON.stringify(recorded))).toStrictEqual(
        JSON.parse(readFileSync(FIXTURE, 'utf8')),
      );
    });
  });

  // ------------------------------------------------- contextual contract helpers

  interface Example {
    kind: string;
    lines: {
      productId: string | null;
      label: string;
      unitPrice: string;
      quantity: number;
    }[];
    strategy: string;
    merchandiseOriginal: string;
    merchandisePayable: string;
    deliveryFeeOriginal: string;
    deliveryFeePayable: string;
    grandTotal: string;
    appliedSaving: string;
    diagnostic: {
      status: string;
      potentialSaving: string;
      remainingAmount: string | null;
      remainingQuantity: number | null;
    };
    zoneMinimumShortfall: string | null;
    competingWinner?: {
      source: string;
      promotionId: string | null;
      scope: string;
      name: string | null;
      saving: string;
    };
  }
  interface Preview {
    state: 'REAL' | 'ILLUSTRATIVE' | 'INCOMPLETE';
    requestId: string;
    evaluatedAt: string;
    problems?: { code: string; field: string }[];
    branchLocalDate?: string;
    assumptions?: Record<string, unknown>;
    applicableProducts?: {
      total: number;
      items: {
        productId: string;
        name: string;
        unitPrice: string;
        unitSaving?: string;
        unitPriceAfter?: string;
      }[];
    };
    examples?: Example[];
    omittedExamples?: { kind: string; reason: string }[];
    [key: string]: unknown;
  }

  const contextual = (
    w: World,
    cookie: string,
    draftBody: Body,
    extra: Body = {},
  ) =>
    send('post', cookie, previewUrl(w), {
      contract: 'CONTEXTUAL_V1',
      requestId: `req-${randomUUID()}`,
      branchId: w.branchId,
      orderType: 'PICKUP',
      draft: draftBody,
      ...extra,
    });
  const data = (response: request.Response) =>
    (response.body as { data: Preview }).data;
  const preview = async (
    w: World,
    cookie: string,
    draftBody: Body,
    extra: Body = {},
  ): Promise<Preview> => {
    const response = await contextual(w, cookie, draftBody, extra);
    expect(response.status).toBe(200);
    return data(response);
  };
  const example = (result: Preview, kind: string): Example => {
    const found = result.examples?.find((entry) => entry.kind === kind);
    if (!found)
      throw new Error(`no ${kind} example in ${JSON.stringify(result)}`);
    return found;
  };
  const qty = (entry: Example) =>
    entry.lines.map(({ label, quantity }) => `${quantity}x${label}`);

  /** Cairo's calendar date for an instant (the Branch timezone of the fixtures), independent of the PG / Node TZ. */
  const cairoDate = (instant: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(instant));
  const addDays = (date: string, days: number) => {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };

  /** Every key an INCOMPLETE answer must never carry (PROMOTIONS_DEC077_IMPLEMENTATION_PLAN section 7). */
  const FINANCIAL_KEYS = [
    'examples',
    'omittedExamples',
    'applicableProducts',
    'assumptions',
    'branchLocalDate',
    'strategy',
    'merchandiseOriginal',
    'merchandisePayable',
    'deliveryFeeOriginal',
    'deliveryFeePayable',
    'grandTotal',
    'appliedSaving',
    'zoneMinimumShortfall',
    'diagnostic',
    'unitPrice',
    'unitSaving',
    'potentialSaving',
    'remainingAmount',
    'remainingQuantity',
    'saving',
  ];

  describe('contextual examples (REAL, ILLUSTRATIVE)', () => {
    let w: World;
    let cookie: string;

    beforeAll(async () => {
      w = await seedWorld('examples');
      cookie = await staff(w);
    }, 60_000);

    it('CART minimum: a below-threshold and a qualifying example from the real engine', async () => {
      const requestId = `req-${randomUUID()}`;
      const response = await contextual(
        w,
        cookie,
        draft('Cart 10 over 200', 'CART', { minimumSubtotal: '200.00' }),
        { requestId },
      );
      expect(response.status).toBe(200);
      // A bound-to-the-draft answer must never be reused by a cache.
      expect(response.headers['cache-control']).toBe('no-store');
      const result = data(response);
      expect(result.state).toBe('REAL');
      expect(result.requestId).toBe(requestId);
      expect(new Date(result.evaluatedAt).toISOString()).toBe(
        result.evaluatedAt,
      );
      expect(result.branchLocalDate).toBe(cairoDate(result.evaluatedAt));
      expect(result.assumptions).toMatchObject({
        simulatedAsActive: true,
        size: 'FIRST_ACTIVE_SIZE',
        paidExtrasIncluded: false,
        branchId: w.branchId,
        orderType: 'PICKUP',
        schedule: 'CURRENT',
        basket: 'BUILT_BY_BACKEND',
        sampleProductId: w.burger,
      });
      expect(result.examples?.map(({ kind }) => kind)).toEqual([
        'BELOW_THRESHOLD',
        'QUALIFYING',
      ]);
      expect(result.omittedExamples).toEqual([]);

      const below = example(result, 'BELOW_THRESHOLD');
      expect(qty(below)).toEqual(['1xBurger']);
      expect(below.lines[0]).toMatchObject({
        productId: w.burger,
        unitPrice: '120.00',
      });
      expect(below).toMatchObject({
        strategy: 'NONE',
        merchandiseOriginal: '120.00',
        merchandisePayable: '120.00',
        grandTotal: '120.00',
        appliedSaving: '0.00',
        diagnostic: {
          status: 'BELOW_MINIMUM_SUBTOTAL',
          potentialSaving: '0.00',
          remainingAmount: '80.00',
          remainingQuantity: null,
        },
      });
      const qualifying = example(result, 'QUALIFYING');
      expect(qty(qualifying)).toEqual(['2xBurger']);
      expect(qualifying).toMatchObject({
        strategy: 'CART',
        merchandiseOriginal: '240.00',
        merchandisePayable: '216.00',
        grandTotal: '216.00',
        appliedSaving: '24.00',
        diagnostic: {
          status: 'APPLIED',
          potentialSaving: '24.00',
          remainingAmount: null,
        },
      });
      // The pre-B3 top-level fields are kept, mirroring the qualifying example.
      expect(result).toMatchObject({
        strategy: 'CART',
        merchandiseOriginal: '240.00',
        merchandisePayable: '216.00',
        grandTotal: '216.00',
        appliedSaving: '24.00',
      });
      // every Guest-orderable product (primary Menu, ACTIVE, AVAILABLE); the sold-out and second-menu ones are not
      expect(result.applicableProducts?.total).toBe(7);
    });

    it('QUANTITY (units, fixed per unit) and DELIVERY (free fee over a spend) pairs', async () => {
      const quantity = await preview(
        w,
        cookie,
        draft('Qty fixed', 'QUANTITY', {
          discountType: 'FIXED_AMOUNT',
          value: '30.00',
          minimumQuantity: 3,
          quantityBasis: 'UNITS',
        }),
      );
      gate = false;
      expect(quantity.state).toBe('REAL');
      expect(qty(example(quantity, 'BELOW_THRESHOLD'))).toEqual(['2xBurger']);
      expect(example(quantity, 'BELOW_THRESHOLD')).toMatchObject({
        appliedSaving: '0.00',
        diagnostic: { status: 'BELOW_MINIMUM_QUANTITY', remainingQuantity: 1 },
      });
      expect(qty(example(quantity, 'QUALIFYING'))).toEqual(['3xBurger']);
      expect(example(quantity, 'QUALIFYING')).toMatchObject({
        merchandiseOriginal: '360.00',
        merchandisePayable: '330.00',
        appliedSaving: '30.00',
      });

      // A delivery fee promotion on a real zone (Zone C: fee 25.00); the zone minimum is 0.00.
      const delivery = await preview(
        w,
        cookie,
        draft('Free delivery', 'DELIVERY', {
          value: '100.00',
          minimumSubtotal: '150.00',
        }),
        { orderType: 'DELIVERY', deliveryZoneId: w.zoneCId },
      );
      expect(delivery.state).toBe('REAL');
      expect(delivery.assumptions).toMatchObject({
        orderType: 'DELIVERY',
        deliveryZoneId: w.zoneCId,
      });
      expect(example(delivery, 'BELOW_THRESHOLD')).toMatchObject({
        merchandiseOriginal: '120.00',
        deliveryFeeOriginal: '25.00',
        deliveryFeePayable: '25.00',
        grandTotal: '145.00',
        appliedSaving: '0.00',
        diagnostic: {
          status: 'BELOW_MINIMUM_SUBTOTAL',
          remainingAmount: '30.00',
        },
      });
      expect(example(delivery, 'QUALIFYING')).toMatchObject({
        merchandiseOriginal: '240.00',
        deliveryFeePayable: '0.00',
        grandTotal: '240.00',
        appliedSaving: '25.00',
      });
    });

    it('a delivery fee draft forces a delivery context and resolves the zone itself (zone minimum is information)', async () => {
      // The request says PICKUP; a delivery fee promotion can only be shown on a delivery order, and says so.
      const auto = await preview(
        w,
        cookie,
        draft('Free delivery', 'DELIVERY', {
          value: '100.00',
          minimumSubtotal: '150.00',
        }),
      );
      expect(auto.state).toBe('REAL');
      expect(auto.assumptions).toMatchObject({
        orderType: 'DELIVERY',
        deliveryZoneId: w.zoneId, // first active zone of the Branch in display order (Zone A: fee 25.00, minimum 150.00)
      });
      expect(example(auto, 'BELOW_THRESHOLD')).toMatchObject({
        merchandisePayable: '120.00',
        zoneMinimumShortfall: '30.00', // information, not a promotion failure
      });
      expect(example(auto, 'QUALIFYING')).toMatchObject({
        deliveryFeePayable: '0.00',
        zoneMinimumShortfall: null,
      });
      // Restricted to the free-fee zone the draft has nothing to discount: stated, with no threshold pair.
      const noFee = await preview(
        w,
        cookie,
        draft('Free delivery B', 'DELIVERY', {
          value: '100.00',
          minimumSubtotal: '150.00',
          deliveryZoneIds: [w.zoneFreeMinId],
        }),
      );
      expect(noFee.examples).toHaveLength(1);
      expect(noFee.examples?.[0]).toMatchObject({
        kind: 'SINGLE',
        diagnostic: { status: 'NO_DELIVERY_FEE' },
      });
      expect(noFee.omittedExamples).toEqual([
        { kind: 'BELOW_THRESHOLD', reason: 'DRAFT_NOT_APPLICABLE_IN_CONTEXT' },
        { kind: 'QUALIFYING', reason: 'DRAFT_NOT_APPLICABLE_IN_CONTEXT' },
      ]);
    });

    it('a Branch without any zone is ILLUSTRATIVE: Backend sample prices through the same engine, never restaurant data', async () => {
      const result = await preview(
        w,
        cookie,
        draft('Free delivery', 'DELIVERY', {
          value: '100.00',
          minimumSubtotal: '150.00',
        }),
        { branchId: w.otherBranchId },
      );
      expect(result.state).toBe('ILLUSTRATIVE');
      expect(result.applicableProducts).toEqual({ total: 0, items: [] });
      expect(result.assumptions).toMatchObject({
        deliveryZoneId: null,
        sampleProductId: null,
      });
      const below = example(result, 'BELOW_THRESHOLD');
      expect(below.lines).toEqual([
        {
          productId: null,
          label: 'Sample item 1',
          unitPrice: '100.00',
          quantity: 1,
        },
      ]);
      expect(below).toMatchObject({
        deliveryFeeOriginal: '30.00',
        deliveryFeePayable: '30.00',
        diagnostic: {
          status: 'BELOW_MINIMUM_SUBTOTAL',
          remainingAmount: '50.00',
        },
      });
      expect(example(result, 'QUALIFYING')).toMatchObject({
        deliveryFeePayable: '0.00',
        grandTotal: '200.00',
        appliedSaving: '30.00',
      });
    });

    it('a CATEGORY with no orderable product is ILLUSTRATIVE and still prices through the engine', async () => {
      const result = await preview(
        w,
        cookie,
        draft('Empty 10', 'CATEGORY', { categoryIds: [w.emptyCategory] }),
      );
      expect(result.state).toBe('ILLUSTRATIVE');
      expect(result.applicableProducts).toEqual({ total: 0, items: [] });
      expect(result.examples).toHaveLength(1);
      expect(result.examples?.[0]).toMatchObject({
        kind: 'SINGLE',
        lines: [{ productId: null, unitPrice: '100.00', quantity: 1 }],
        merchandiseOriginal: '100.00',
        merchandisePayable: '90.00',
        appliedSaving: '10.00',
        diagnostic: { status: 'APPLIED' },
      });
      // A MENU that is not the primary Menu has nothing a Guest can order either.
      const second = await preview(
        w,
        cookie,
        draft('Second menu 10', 'MENU', { menuIds: [w.secondMenuId] }),
      );
      expect(second.state).toBe('ILLUSTRATIVE');
      expect(second.examples?.[0]).toMatchObject({ appliedSaving: '10.00' });
    });

    it('item scopes: one example plus each applicable product with its own per-unit saving (fixed is per unit and capped)', async () => {
      gate = true;
      try {
        const fixed = await preview(
          w,
          cookie,
          draft('Burgers 15 off', 'CATEGORY', {
            discountType: 'FIXED_AMOUNT',
            value: '15.00',
            categoryIds: [w.burgersCategory],
          }),
        );
        expect(fixed.state).toBe('REAL');
        expect(fixed.applicableProducts?.total).toBe(3);
        expect(fixed.applicableProducts?.items.map(({ name }) => name)).toEqual(
          ['Burger', 'Big Burger', 'Pizza'],
        );
        expect(fixed.applicableProducts?.items).toEqual([
          {
            productId: w.burger,
            name: 'Burger',
            unitPrice: '120.00',
            unitSaving: '15.00',
            unitPriceAfter: '105.00',
          },
          {
            productId: w.burgerBig,
            name: 'Big Burger',
            unitPrice: '200.00',
            unitSaving: '15.00',
            unitPriceAfter: '185.00',
          },
          // sizes: the FIRST active size (Small 80.00), not the base price 100.00 or Large 140.00
          {
            productId: w.pizza,
            name: 'Pizza',
            unitPrice: '80.00',
            unitSaving: '15.00',
            unitPriceAfter: '65.00',
          },
        ]);
        expect(fixed.examples).toHaveLength(1);
        expect(fixed.examples?.[0]).toMatchObject({
          kind: 'SINGLE',
          strategy: 'ITEM',
          merchandiseOriginal: '120.00',
          merchandisePayable: '105.00',
          appliedSaving: '15.00',
        });
        // Capped at the unit price: 200.00 off a 120.00 Burger saves 120.00, never more, and the unit costs 0.00.
        const capped = await preview(
          w,
          cookie,
          draft('Burgers 200 off', 'CATEGORY', {
            discountType: 'FIXED_AMOUNT',
            value: '200.00',
            categoryIds: [w.burgersCategory],
          }),
        );
        expect(capped.applicableProducts?.items).toEqual([
          {
            productId: w.burger,
            name: 'Burger',
            unitPrice: '120.00',
            unitSaving: '120.00',
            unitPriceAfter: '0.00',
          },
          {
            productId: w.burgerBig,
            name: 'Big Burger',
            unitPrice: '200.00',
            unitSaving: '200.00',
            unitPriceAfter: '0.00',
          },
          {
            productId: w.pizza,
            name: 'Pizza',
            unitPrice: '80.00',
            unitSaving: '80.00',
            unitPriceAfter: '0.00',
          },
        ]);
        expect(capped.examples?.[0]).toMatchObject({
          appliedSaving: '120.00',
          merchandisePayable: '0.00',
        });
        // A percentage MENU promotion over the primary Menu: half-up cents (10 % of 0.50 = 0.05).
        const menu = await preview(
          w,
          cookie,
          draft('Menu 10', 'MENU', { menuIds: [w.menuId] }),
          { sampleProductId: w.mint },
        );
        expect(menu.assumptions).toMatchObject({ sampleProductId: w.mint });
        expect(menu.examples?.[0]).toMatchObject({
          lines: [{ productId: w.mint, unitPrice: '0.50', quantity: 1 }],
          appliedSaving: '0.05',
          merchandisePayable: '0.45',
        });
      } finally {
        gate = false;
      }
    });
  });

  describe('thresholds, boundaries and omitted examples', () => {
    let w: World;
    let cookie: string;

    beforeAll(async () => {
      w = await seedWorld('thresholds');
      cookie = await staff(w);
    }, 60_000);

    const cart = (minimum: string) =>
      draft(`Cart ${minimum}`, 'CART', { minimumSubtotal: minimum });

    it('monetary boundary: equality qualifies, one cent short does not (Burger 120.00)', async () => {
      // exactly the unit price: one unit already reaches it, so no real basket can fall below
      const equal = await preview(w, cookie, cart('120.00'));
      expect(equal.examples?.map(({ kind }) => kind)).toEqual(['QUALIFYING']);
      expect(qty(example(equal, 'QUALIFYING'))).toEqual(['1xBurger']);
      expect(example(equal, 'QUALIFYING')).toMatchObject({
        appliedSaving: '12.00',
      });
      expect(equal.omittedExamples).toEqual([
        { kind: 'BELOW_THRESHOLD', reason: 'SINGLE_UNIT_REACHES_THRESHOLD' },
      ]);
      // one cent above: 1 unit is short by 0.01, 2 units qualify
      const short = await preview(w, cookie, cart('120.01'));
      expect(example(short, 'BELOW_THRESHOLD')).toMatchObject({
        diagnostic: {
          status: 'BELOW_MINIMUM_SUBTOTAL',
          remainingAmount: '0.01',
        },
        appliedSaving: '0.00',
      });
      expect(qty(example(short, 'QUALIFYING'))).toEqual(['2xBurger']);
      // the second unit lands exactly on the minimum
      const exact = await preview(w, cookie, cart('240.00'));
      expect(qty(example(exact, 'BELOW_THRESHOLD'))).toEqual(['1xBurger']);
      expect(qty(example(exact, 'QUALIFYING'))).toEqual(['2xBurger']);
      expect(example(exact, 'QUALIFYING')).toMatchObject({
        appliedSaving: '24.00',
      });
      // 10 % of 240.01-class amounts rounds half-up through the engine: 0.01 min with a 0.50 Mint
      const mint = await preview(w, cookie, cart('1.00'), {
        sampleProductId: w.mint,
      });
      expect(qty(example(mint, 'BELOW_THRESHOLD'))).toEqual(['1xMint']);
      expect(example(mint, 'BELOW_THRESHOLD').diagnostic.remainingAmount).toBe(
        '0.50',
      );
      expect(qty(example(mint, 'QUALIFYING'))).toEqual(['2xMint']);
      expect(example(mint, 'QUALIFYING')).toMatchObject({
        appliedSaving: '0.10',
      });
    });

    it('a threshold no basket of the sample can reach is explained, not faked', async () => {
      const result = await preview(w, cookie, cart('100000.00'));
      expect(result.omittedExamples).toEqual([
        { kind: 'QUALIFYING', reason: 'THRESHOLD_NOT_REACHABLE_WITH_SAMPLE' },
      ]);
      // the largest basket a Guest line allows (99 units), still short
      expect(example(result, 'BELOW_THRESHOLD').lines).toMatchObject([
        { quantity: 99 },
      ]);
      expect(example(result, 'BELOW_THRESHOLD')).toMatchObject({
        merchandiseOriginal: '11880.00',
        diagnostic: { remainingAmount: '88120.00' },
      });
    });

    it('distinct-products quantity builds a basket of different applicable products', async () => {
      const result = await preview(
        w,
        cookie,
        draft('Three different', 'QUANTITY', {
          discountType: 'FIXED_AMOUNT',
          value: '30.00',
          minimumQuantity: 3,
          quantityBasis: 'DISTINCT_PRODUCTS',
        }),
      );
      // the chosen sample first, then the other applicable products in Menu order
      expect(qty(example(result, 'BELOW_THRESHOLD'))).toEqual([
        '1xBurger',
        '1xBig Burger',
      ]);
      expect(example(result, 'BELOW_THRESHOLD')).toMatchObject({
        diagnostic: { status: 'BELOW_MINIMUM_QUANTITY', remainingQuantity: 1 },
      });
      expect(qty(example(result, 'QUALIFYING'))).toEqual([
        '1xBurger',
        '1xBig Burger',
        '1xPizza',
      ]);
      expect(example(result, 'QUALIFYING')).toMatchObject({
        merchandiseOriginal: '400.00', // 120.00 + 200.00 + the Pizza's first size 80.00
        appliedSaving: '30.00',
      });
      // restricted to the 3 Burgers-category products, five different ones are impossible
      const notEnough = await preview(
        w,
        cookie,
        draft('Five different', 'QUANTITY', {
          discountType: 'FIXED_AMOUNT',
          value: '30.00',
          minimumQuantity: 5,
          quantityBasis: 'DISTINCT_PRODUCTS',
          categoryIds: [w.burgersCategory],
        }),
      );
      expect(notEnough.omittedExamples).toEqual([
        { kind: 'QUALIFYING', reason: 'NOT_ENOUGH_DISTINCT_PRODUCTS' },
      ]);
      expect(notEnough.applicableProducts?.total).toBe(3);
      expect(example(notEnough, 'BELOW_THRESHOLD').diagnostic).toMatchObject({
        remainingQuantity: 2,
      });
    });

    it('a CART / QUANTITY restriction limits the sample to products the promotion applies to', async () => {
      const result = await preview(
        w,
        cookie,
        draft('Drinks only', 'CART', {
          minimumSubtotal: '100.00',
          categoryIds: [w.drinksCategory],
        }),
      );
      expect(result.applicableProducts?.items.map(({ name }) => name)).toEqual([
        'Cola',
        'Latte',
        'Mint',
      ]);
      // Cola 40.00: 2 units are short (80.00), 3 reach 120.00
      expect(qty(example(result, 'BELOW_THRESHOLD'))).toEqual(['2xCola']);
      expect(qty(example(result, 'QUALIFYING'))).toEqual(['3xCola']);
      // by product: a Burger-only restriction, sample = that product
      const byProduct = await preview(
        w,
        cookie,
        draft('Cake only', 'CART', {
          minimumSubtotal: '50.00',
          productIds: [w.cake],
        }),
      );
      expect(qty(example(byProduct, 'QUALIFYING'))).toEqual(['2xCake']);
    });

    it('a draft that does not apply here is shown honestly, with no invented threshold pair', async () => {
      const other = await preview(
        w,
        cookie,
        draft('Other branch only', 'CART', {
          minimumSubtotal: '200.00',
          branchIds: [w.otherBranchId],
        }),
      );
      expect(other.examples).toHaveLength(1);
      expect(other.examples?.[0]).toMatchObject({
        kind: 'SINGLE',
        appliedSaving: '0.00',
        diagnostic: { status: 'WRONG_BRANCH' },
      });
      expect(other.omittedExamples).toEqual([
        { kind: 'BELOW_THRESHOLD', reason: 'DRAFT_NOT_APPLICABLE_IN_CONTEXT' },
        { kind: 'QUALIFYING', reason: 'DRAFT_NOT_APPLICABLE_IN_CONTEXT' },
      ]);
      // scheduled for the future: the Branch-local schedule is applied exactly as a quote would, and stated
      const today = cairoDate(new Date().toISOString());
      const future = await preview(
        w,
        cookie,
        draft('Next week', 'CART', {
          minimumSubtotal: '200.00',
          startsOn: addDays(today, 7),
        }),
      );
      expect(future.assumptions).toMatchObject({
        simulatedAsActive: true,
        schedule: 'NOT_STARTED',
      });
      expect(example(future, 'SINGLE').diagnostic.status).toBe('NOT_STARTED');
      const expired = await preview(
        w,
        cookie,
        draft('Last week', 'CART', {
          minimumSubtotal: '200.00',
          endsOn: addDays(today, -1),
        }),
      );
      expect(expired.assumptions).toMatchObject({ schedule: 'EXPIRED' });
      // ending today (Branch-local) is still current
      const endsToday = await preview(
        w,
        cookie,
        draft('Ends today', 'CART', {
          minimumSubtotal: '200.00',
          endsOn: today,
        }),
      );
      expect(endsToday.assumptions).toMatchObject({ schedule: 'CURRENT' });
      expect(qty(example(endsToday, 'QUALIFYING'))).toEqual(['2xBurger']);
    });

    it('is deterministic: the same request answers the same examples every time', async () => {
      const body = draft('Cart 10 over 200', 'CART', {
        minimumSubtotal: '200.00',
      });
      const first = await preview(w, cookie, body, {
        requestId: 'req-determinism-1',
      });
      const second = await preview(w, cookie, body, {
        requestId: 'req-determinism-1',
      });
      const strip = ({ evaluatedAt, ...rest }: Preview) => (
        void evaluatedAt,
        rest
      );
      expect(strip(second)).toStrictEqual(strip(first));
      // a new product order of insertion changes nothing: the sample follows Menu order, then id
      const third = await preview(w, cookie, body, {
        requestId: 'req-determinism-2',
      });
      expect(strip({ ...third, requestId: first.requestId })).toStrictEqual(
        strip(first),
      );
    });
  });

  describe('competition', () => {
    let w: World;
    let cookie: string;

    beforeAll(async () => {
      w = await seedWorld('competition');
      cookie = await staff(w);
    }, 60_000);

    it('reports which active promotion wins and the draft potential saving (LOST_TO_BETTER_OFFER)', async () => {
      const menuId = await activate(
        w,
        cookie,
        draft('Menu 40', 'MENU', { value: '40.00', menuIds: [w.menuId] }),
      );
      const result = await preview(
        w,
        cookie,
        draft('Burgers 30', 'CATEGORY', {
          value: '30.00',
          categoryIds: [w.burgersCategory],
        }),
      );
      const single = example(result, 'SINGLE');
      expect(single).toMatchObject({
        appliedSaving: '0.00',
        merchandisePayable: '72.00', // the MENU 40 % wins: 120.00 - 48.00
        // the draft's own saving, 30 % of 120.00, is reported although the MENU 40 % wins
        diagnostic: {
          status: 'LOST_TO_BETTER_OFFER',
          potentialSaving: '36.00',
        },
      });
      expect(single.competingWinner).toEqual({
        source: 'PROMOTION',
        promotionId: menuId,
        scope: 'MENU',
        name: 'Menu 40',
        discountType: 'PERCENTAGE',
        value: '40.00',
        saving: '48.00',
      });
    });

    it('a CART draft that saves less than an item promotion loses to it, with the winner named', async () => {
      const result = await preview(
        w,
        cookie,
        draft('Cart 10', 'CART', { minimumSubtotal: '100.00' }),
      );
      const qualifying = example(result, 'QUALIFYING');
      expect(qualifying.diagnostic.status).toBe('LOST_TO_BETTER_OFFER');
      expect(qualifying.diagnostic.potentialSaving).toBe('12.00'); // the draft's own saving, 10 % of 120.00
      expect(qualifying.appliedSaving).toBe('0.00');
      expect(qualifying.competingWinner).toMatchObject({
        source: 'PROMOTION',
        scope: 'MENU',
        name: 'Menu 40',
        saving: '48.00',
      });
    });

    it('a legacy Product discount can be the winner too', async () => {
      const result = await preview(
        w,
        cookie,
        draft('Drinks 5', 'CATEGORY', {
          value: '5.00',
          categoryIds: [w.drinksCategory],
        }),
        { sampleProductId: w.latte },
      );
      // Latte 50.00 has a 20 % legacy discount (10.00) and the active MENU 40 % promotion (20.00) beats it
      expect(example(result, 'SINGLE').competingWinner).toMatchObject({
        source: 'PROMOTION',
        scope: 'MENU',
        saving: '20.00',
      });
      await prisma.promotion.updateMany({
        where: { restaurantId: w.restaurantId },
        data: { status: 'INACTIVE' },
      });
      const legacy = await preview(
        w,
        cookie,
        draft('Drinks 5', 'CATEGORY', {
          value: '5.00',
          categoryIds: [w.drinksCategory],
        }),
        { sampleProductId: w.latte },
      );
      expect(example(legacy, 'SINGLE')).toMatchObject({
        appliedSaving: '0.00',
        // 5 % of 50.00, the draft's own saving, although the legacy 20 % (10.00) wins
        diagnostic: { status: 'LOST_TO_BETTER_OFFER', potentialSaving: '2.50' },
        competingWinner: {
          source: 'PRODUCT_DISCOUNT',
          promotionId: null,
          scope: 'PRODUCT',
          saving: '10.00',
        },
      });
      // the same draft on a product without a legacy discount wins
      const wins = await preview(
        w,
        cookie,
        draft('Drinks 5', 'CATEGORY', {
          value: '5.00',
          categoryIds: [w.drinksCategory],
        }),
        { sampleProductId: w.cola },
      );
      expect(example(wins, 'SINGLE')).toMatchObject({
        appliedSaving: '2.00',
        diagnostic: { status: 'APPLIED' },
      });
      expect(example(wins, 'SINGLE').competingWinner).toBeUndefined();
    });

    it('editing a stored promotion replaces it (promotionId) instead of competing with itself', async () => {
      const id = await activate(
        w,
        cookie,
        draft('Burgers 10', 'CATEGORY', { categoryIds: [w.burgersCategory] }),
      );
      const result = await preview(
        w,
        cookie,
        draft('Burgers 25', 'CATEGORY', {
          value: '25.00',
          categoryIds: [w.burgersCategory],
        }),
        { promotionId: id },
      );
      expect(example(result, 'SINGLE')).toMatchObject({
        appliedSaving: '30.00',
        diagnostic: { status: 'APPLIED' },
      });
      expect(example(result, 'SINGLE').competingWinner).toBeUndefined();
    });
  });

  describe('INCOMPLETE drafts carry no financial figure', () => {
    let w: World;
    let cookie: string;

    beforeAll(async () => {
      w = await seedWorld('incomplete');
      cookie = await staff(w);
    }, 60_000);

    const keysDeep = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.flatMap(keysDeep)
        : value && typeof value === 'object'
          ? Object.entries(value).flatMap(([key, inner]) => [
              key,
              ...keysDeep(inner),
            ])
          : [];

    async function expectIncomplete(
      body: Body,
      codes: { code: string; field: string }[],
      extra: Body = {},
    ) {
      const requestId = `req-${randomUUID()}`;
      const response = await contextual(w, cookie, body, {
        ...extra,
        requestId,
      });
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const result = data(response);
      expect(result.state).toBe('INCOMPLETE');
      expect(result.problems).toEqual(expect.arrayContaining(codes));
      // schema test: exactly these four keys, and none of the financial keys anywhere in the answer
      expect(Object.keys(result).sort()).toEqual([
        'evaluatedAt',
        'problems',
        'requestId',
        'state',
      ]);
      expect(result.requestId).toBe(requestId);
      expect(
        keysDeep(result).filter((key) => FINANCIAL_KEYS.includes(key)),
      ).toEqual([]);
      // no monetary-looking value anywhere (the timestamp and the echoed request id are not figures)
      expect(
        JSON.stringify({ ...result, evaluatedAt: '', requestId: '' }),
      ).not.toMatch(/\d+\.\d{2}/);
    }

    it('applies the B2 CART minimum rule: absent, null and zero', async () => {
      await expectIncomplete(draft('Cart', 'CART'), [
        { code: 'MINIMUM_SUBTOTAL_REQUIRED', field: 'minimumSubtotal' },
      ]);
      await expectIncomplete(draft('Cart', 'CART', { minimumSubtotal: null }), [
        { code: 'MINIMUM_SUBTOTAL_REQUIRED', field: 'minimumSubtotal' },
      ]);
      await expectIncomplete(
        draft('Cart', 'CART', { minimumSubtotal: '0.00' }),
        [{ code: 'MINIMUM_SUBTOTAL_NOT_POSITIVE', field: 'minimumSubtotal' }],
      );
      // The strict request DTO is unchanged: malformed, negative and over-precision strings are a 400, not INCOMPLETE.
      for (const bad of ['-5.00', '100.005', 'abc']) {
        const response = await contextual(
          w,
          cookie,
          draft('Cart', 'CART', { minimumSubtotal: bad }),
        );
        expect(response.status).toBe(400);
      }
    });

    it('applies the B1 write gate: a fixed item draft is INCOMPLETE until writes are enabled, then REAL', async () => {
      const fixed = draft('Fixed', 'CATEGORY', {
        discountType: 'FIXED_AMOUNT',
        value: '15.00',
        categoryIds: [w.burgersCategory],
      });
      gate = false;
      await expectIncomplete(fixed, [
        { code: 'FIXED_ITEM_SCOPE_NOT_ENABLED', field: 'discountType' },
      ]);
      gate = true;
      try {
        expect((await preview(w, cookie, fixed)).state).toBe('REAL');
      } finally {
        gate = false;
      }
    });

    it('reports the other save-time problems: targets, value, translations, foreign targets', async () => {
      await expectIncomplete(
        draft('No target', 'CATEGORY', { categoryIds: [] }),
        [{ code: 'TARGETS_REQUIRED', field: 'categoryIds' }],
      );
      await expectIncomplete(
        draft('Zero', 'CART', { value: '0.00', minimumSubtotal: '100.00' }),
        [{ code: 'VALUE_INVALID', field: 'value' }],
      );
      const french = await contextual(w, cookie, {
        ...draft('Untitled', 'CART', { minimumSubtotal: '100.00' }),
        translations: [{ locale: 'fr', title: 'Sans titre' }],
      });
      expect(data(french).state).toBe('INCOMPLETE');
      // A target of ANOTHER Restaurant is reported as invalid; nothing about it (or its prices) is revealed.
      const stranger = await seedWorld('stranger');
      await expectIncomplete(
        draft('Foreign', 'CATEGORY', {
          categoryIds: [stranger.burgersCategory],
        }),
        [{ code: 'INVALID_PROMOTION_TARGET', field: 'categoryIds' }],
      );
    });

    it('legacy compatibility: an unchanged legacy CART promotion previews, a pricing change needs a minimum', async () => {
      const legacy = await prisma.promotion.create({
        data: {
          restaurantId: w.restaurantId,
          scope: 'CART',
          discountType: 'PERCENTAGE',
          value: '10.00',
          priority: 100,
          status: 'ACTIVE',
          internalName: 'Internal legacy',
          minimumSubtotal: null,
          translations: { create: { locale: 'en', title: 'Legacy 10' } },
        },
      });
      const same = { promotionId: legacy.id };
      // a rename (metadata only) and a whole-form re-send of the stored values: REAL, priced like today (no minimum)
      const renamed = await preview(
        w,
        cookie,
        draft('Renamed legacy', 'CART'),
        same,
      );
      expect(renamed.state).toBe('REAL');
      expect(renamed.examples).toHaveLength(1);
      expect(renamed.examples?.[0]).toMatchObject({
        kind: 'SINGLE',
        appliedSaving: '12.00',
        diagnostic: { status: 'APPLIED' },
      });
      // a changed value without a minimum would be refused on save: INCOMPLETE
      await expectIncomplete(
        draft('Renamed legacy', 'CART', { value: '15.00' }),
        [{ code: 'MINIMUM_SUBTOTAL_REQUIRED', field: 'minimumSubtotal' }],
        same,
      );
      // ... and with a valid minimum it previews with the threshold pair
      const fixedUp = await preview(
        w,
        cookie,
        draft('Renamed legacy', 'CART', {
          value: '15.00',
          minimumSubtotal: '100.00',
        }),
        same,
      );
      expect(fixedUp.state).toBe('REAL');
      expect(example(fixedUp, 'QUALIFYING')).toMatchObject({
        appliedSaving: '18.00',
      });
      // a legacy promotion that is not the stored one (no promotionId) is a NEW CART draft again
      await expectIncomplete(draft('Legacy 10 again', 'CART'), [
        { code: 'MINIMUM_SUBTOTAL_REQUIRED', field: 'minimumSubtotal' },
      ]);
    });
  });

  describe('request validation, scope and permissions', () => {
    let w: World;
    let stranger: World;
    let cookie: string;

    beforeAll(async () => {
      w = await seedWorld('scope');
      stranger = await seedWorld('scope-stranger');
      cookie = await staff(w);
    }, 60_000);

    const cart = draft('Cart 10', 'CART', { minimumSubtotal: '200.00' });

    it('the contract is opt-in and strict; the request id is echoed or taken from X-Request-Id', async () => {
      for (const body of [
        { contract: 'CONTEXTUAL_V2' },
        { contract: null },
        { requestId: 'short' },
        { requestId: 'has spaces in it' },
        { requestId: 'x'.repeat(65) },
        { sampleProductId: 'not-a-uuid' },
        { items: [{ productId: w.burger, quantity: 0 }] },
        { items: [{ productId: 'nope', quantity: 1 }] },
      ]) {
        const response = await contextual(w, cookie, cart, body);
        expect(response.status).toBe(400);
      }
      // without a request id the answer carries the X-Request-Id of the HTTP request
      const response = await send('post', cookie, previewUrl(w), {
        contract: 'CONTEXTUAL_V1',
        branchId: w.branchId,
        orderType: 'PICKUP',
        draft: cart,
      }).set('X-Request-Id', 'client-header-12345');
      expect(response.status).toBe(200);
      expect(data(response).requestId).toBe('client-header-12345');
      expect(response.headers['x-request-id']).toBe('client-header-12345');
    });

    it('stray contextual fields without `contract` are ignored: the pre-B3 response, unchanged', async () => {
      const body = {
        branchId: w.branchId,
        orderType: 'PICKUP',
        draft: cart,
        items: [{ productId: w.burger, quantity: 2 }],
      };
      const plain = await legacyPreview(w, cookie, body);
      const stray = await legacyPreview(w, cookie, {
        ...body,
        requestId: 'x',
        sampleProductId: 'nope',
      });
      expect(plain.status).toBe(200);
      expect(stray.status).toBe(200);
      expect(stray.body).toStrictEqual(plain.body);
      expect(stray.headers['cache-control']).toBeUndefined();
      expect(Object.keys((plain.body as { data: object }).data).sort()).toEqual(
        [
          'appliedSaving',
          'deliveryFeeOriginal',
          'deliveryFeePayable',
          'diagnostic',
          'grandTotal',
          'merchandiseOriginal',
          'merchandisePayable',
          'strategy',
          'zoneMinimumShortfall',
        ],
      );
    });

    it('Staff items give one SINGLE example equal to the pre-B3 preview of the same basket', async () => {
      const items = [
        { productId: w.burger, quantity: 2 },
        { productId: w.pizza, quantity: 1 },
        { productId: w.cola, quantity: 3 },
      ];
      const legacy = (
        (
          await legacyPreview(w, cookie, {
            branchId: w.branchId,
            orderType: 'PICKUP',
            draft: cart,
            items,
          })
        ).body as { data: Record<string, unknown> }
      ).data;
      const result = await preview(w, cookie, cart, { items });
      expect(result.assumptions).toMatchObject({ basket: 'STAFF_ITEMS' });
      expect(result.examples).toHaveLength(1);
      const single = example(result, 'SINGLE');
      expect(qty(single)).toEqual(['2xBurger', '1xPizza', '3xCola']);
      for (const key of [
        'strategy',
        'merchandiseOriginal',
        'merchandisePayable',
        'deliveryFeeOriginal',
        'deliveryFeePayable',
        'grandTotal',
        'appliedSaving',
        'diagnostic',
        'zoneMinimumShortfall',
      ]) {
        expect(
          (single as unknown as Record<string, unknown>)[key],
        ).toStrictEqual(legacy[key]);
      }
      expect(single.merchandiseOriginal).toBe('440.00'); // 240.00 + the first size 80.00 + 120.00
    });

    it('foreign and unavailable selections are refused exactly as the pre-B3 preview refuses them', async () => {
      const refuse = async (extra: Body, status: number, code: string) => {
        const response = await contextual(w, cookie, cart, extra);
        expect(response.status).toBe(status);
        expect((response.body as { error: { code: string } }).error.code).toBe(
          code,
        );
      };
      await refuse(
        { branchId: stranger.branchId },
        422,
        'PROMOTION_PREVIEW_BRANCH_INVALID',
      );
      await refuse(
        { branchId: randomUUID() },
        422,
        'PROMOTION_PREVIEW_BRANCH_INVALID',
      );
      await refuse(
        { orderType: 'DELIVERY', deliveryZoneId: stranger.zoneId },
        422,
        'PROMOTION_PREVIEW_ZONE_INVALID',
      );
      await refuse(
        { deliveryZoneId: w.zoneId },
        422,
        'PROMOTION_PREVIEW_ZONE_INVALID',
      );
      await refuse(
        { items: [{ productId: stranger.burger, quantity: 1 }] },
        422,
        'PROMOTION_PREVIEW_PRODUCT_INVALID',
      );
      await refuse(
        { sampleProductId: stranger.burger },
        422,
        'PROMOTION_PREVIEW_PRODUCT_INVALID',
      );
      await refuse(
        { sampleProductId: w.soldOut },
        422,
        'PROMOTION_PREVIEW_PRODUCT_INVALID',
      );
      await refuse(
        { sampleProductId: w.secondMenuProduct },
        422,
        'PROMOTION_PREVIEW_PRODUCT_INVALID',
      );
      await refuse({ promotionId: randomUUID() }, 404, 'PROMOTION_NOT_FOUND');
      // a promotion of another Restaurant is the same not-found (existence is not revealed)
      const foreign = await prisma.promotion.create({
        data: {
          restaurantId: stranger.restaurantId,
          scope: 'CART',
          discountType: 'PERCENTAGE',
          value: '10.00',
          status: 'ACTIVE',
          internalName: 'Foreign',
          minimumSubtotal: '10.00',
          translations: { create: { locale: 'en', title: 'Foreign' } },
        },
      });
      await refuse({ promotionId: foreign.id }, 404, 'PROMOTION_NOT_FOUND');
      // a sample must be a product THIS promotion applies to
      const burgersOnly = draft('Burgers', 'CATEGORY', {
        categoryIds: [w.burgersCategory],
      });
      const wrongSample = await contextual(w, cookie, burgersOnly, {
        sampleProductId: w.cola,
      });
      expect(wrongSample.status).toBe(422);
      const rightSample = await preview(w, cookie, burgersOnly, {
        sampleProductId: w.pizza,
      });
      expect(rightSample.assumptions).toMatchObject({
        sampleProductId: w.pizza,
      });
      expect(example(rightSample, 'SINGLE').lines[0]).toMatchObject({
        productId: w.pizza,
        unitPrice: '80.00',
      });
    });

    it('permissions, CSRF, feature gate and Branch grants are unchanged', async () => {
      const body = {
        contract: 'CONTEXTUAL_V1',
        branchId: w.branchId,
        orderType: 'PICKUP',
        draft: cart,
      };
      // unauthenticated, no Origin (CSRF), and a Role without promotions.view
      expect(
        (
          await request(app.getHttpServer())
            .post(previewUrl(w))
            .set('Origin', origin)
            .send(body)
        ).status,
      ).toBe(401);
      expect(
        (
          await request(app.getHttpServer())
            .post(previewUrl(w))
            .set('Cookie', cookie)
            .send(body)
        ).status,
      ).toBe(403);
      const waiter = await staff(w, 'WAITER');
      expect((await send('post', waiter, previewUrl(w), body)).status).toBe(
        403,
      );
      // another Restaurant's Staff cannot preview here
      const intruder = await staff(stranger);
      // (Tenant access collapses to the safe not-found, it does not reveal that the Restaurant exists)
      expect((await send('post', intruder, previewUrl(w), body)).status).toBe(
        404,
      );
      // CASHIER holds promotions.view, but limited to ONE Branch they may preview only that Branch
      const limited = await staff(w, 'CASHIER', [w.otherBranchId]);
      const own = await send('post', limited, previewUrl(w), {
        ...body,
        branchId: w.otherBranchId,
      });
      expect(own.status).toBe(200);
      expect(data(own).state).not.toBe('INCOMPLETE');
      const denied = await send('post', limited, previewUrl(w), body);
      expect(denied.status).toBe(422);
      expect((denied.body as { error: { code: string } }).error.code).toBe(
        'PROMOTION_PREVIEW_BRANCH_INVALID',
      );
      // a stored promotion limited to the Main Branch is not found for a caller restricted to the Other Branch
      const mainOnly = await prisma.promotion.create({
        data: {
          restaurantId: w.restaurantId,
          scope: 'CART',
          discountType: 'PERCENTAGE',
          value: '10.00',
          status: 'ACTIVE',
          internalName: 'Main only',
          minimumSubtotal: '10.00',
          translations: { create: { locale: 'en', title: 'Main only' } },
          branches: {
            create: { branchId: w.branchId },
          },
        },
      });
      const hidden = await send('post', limited, previewUrl(w), {
        ...body,
        branchId: w.otherBranchId,
        promotionId: mainOnly.id,
      });
      expect(hidden.status).toBe(404);
      // the PROMOTIONS feature off: unchanged 403 FEATURE_NOT_AVAILABLE
      await prisma.restaurantFeature.updateMany({
        where: { restaurantId: w.restaurantId, feature: 'PROMOTIONS' },
        data: { enabled: false },
      });
      const off = await send('post', cookie, previewUrl(w), body);
      expect(off.status).toBe(403);
      expect((off.body as { error: { code: string } }).error.code).toBe(
        'FEATURE_NOT_AVAILABLE',
      );
      await prisma.restaurantFeature.updateMany({
        where: { restaurantId: w.restaurantId, feature: 'PROMOTIONS' },
        data: { enabled: true },
      });
    });

    it('never writes: no promotion, order, product, translation or row changes', async () => {
      const fingerprint = async () => {
        const [row] = await prisma.$queryRaw<{ fp: string }[]>`
          SELECT md5(
            coalesce((SELECT string_agg(p::text, '|' ORDER BY p.id) FROM promotions p WHERE restaurant_id = ${w.restaurantId}::uuid), '') ||
            coalesce((SELECT string_agg(t::text, '|' ORDER BY t.id) FROM promotion_translations t JOIN promotions p ON p.id = t.promotion_id WHERE p.restaurant_id = ${w.restaurantId}::uuid), '') ||
            coalesce((SELECT string_agg(x::text, '|' ORDER BY x.id) FROM products x WHERE restaurant_id = ${w.restaurantId}::uuid), '') ||
            coalesce((SELECT string_agg(z::text, '|' ORDER BY z.id) FROM delivery_zones z WHERE restaurant_id = ${w.restaurantId}::uuid), '') ||
            (SELECT count(*)::text FROM orders WHERE restaurant_id = ${w.restaurantId}::uuid)
          ) AS fp`;
        return row.fp;
      };
      const before = await fingerprint();
      for (const body of [
        cart,
        draft('Burgers 10', 'CATEGORY', { categoryIds: [w.burgersCategory] }),
        draft('Free delivery', 'DELIVERY', {
          value: '100.00',
          minimumSubtotal: '150.00',
        }),
        draft('Broken', 'CART'),
      ]) {
        await contextual(w, cookie, body);
        await contextual(w, cookie, body, {
          items: [{ productId: w.cola, quantity: 2 }],
        });
      }
      expect(await fingerprint()).toBe(before);
    });
  });

  describe('contextual preview equals the Guest quote for identical inputs', () => {
    let w: World;
    let cookie: string;

    beforeAll(async () => {
      w = await seedWorld('parity');
      cookie = await staff(w);
    }, 60_000);

    interface Quote {
      subtotal: string;
      discountTotal: string;
      deliveryFee: string;
      deliveryFeeOriginal: string | null;
      total: string;
      promotions: { scope: string; amount: string }[];
      promotionProgress: {
        scope: string;
        status: string;
        subtotal?: { remaining: string } | null;
        quantity?: { remaining: number } | null;
      }[];
    }
    const cents = (value: string) => BigInt(value.replace('.', ''));
    const money = (value: bigint) =>
      `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

    /** The Guest cart a contextual example stands for: same products, quantities, first active size, no extras. */
    const cartFor = (entry: Example, delivery: boolean) => ({
      fulfillment: delivery ? 'DELIVERY' : 'PICKUP',
      branchId: w.branchId,
      ...(delivery ? { deliveryZoneId: w.zoneCId } : {}),
      items: entry.lines.map(({ productId, quantity }) => ({
        productId,
        quantity,
        ...(productId === w.pizza ? { variantId: w.pizzaSmall } : {}),
      })),
    });
    const guestQuote = async (entry: Example, delivery: boolean) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/public/qr/${w.genericQr}/quote`)
        .send(cartFor(entry, delivery));
      expect(response.status).toBe(200);
      return (response.body as { data: Quote }).data;
    };

    /** Every figure of the example must equal what the real quote answers for the same basket. */
    async function expectQuoteParity(
      result: Preview,
      scope: string,
      delivery = false,
    ) {
      expect(result.state).toBe('REAL');
      expect(result.examples?.length).toBeGreaterThan(0);
      for (const entry of result.examples ?? []) {
        const quote = await guestQuote(entry, delivery);
        expect(quote.subtotal).toBe(entry.merchandisePayable);
        expect(quote.deliveryFee).toBe(entry.deliveryFeePayable);
        expect(quote.total).toBe(entry.grandTotal);
        expect(quote.discountTotal).toBe(
          money(
            cents(entry.merchandiseOriginal) - cents(entry.merchandisePayable),
          ),
        );
        if (delivery) {
          expect(quote.deliveryFeeOriginal).toBe(entry.deliveryFeeOriginal);
        }
        const applied = quote.promotions.filter((item) => item.scope === scope);
        if (entry.diagnostic.status === 'APPLIED') {
          // the saving of the promotion itself, as the quote reports it (delivery savings are on the fee)
          if (scope === 'DELIVERY') {
            expect(
              money(
                cents(entry.deliveryFeeOriginal) -
                  cents(entry.deliveryFeePayable),
              ),
            ).toBe(entry.appliedSaving);
          } else {
            expect(applied.map(({ amount }) => amount)).toContain(
              entry.appliedSaving,
            );
          }
        } else {
          expect(entry.appliedSaving).toBe('0.00');
          expect(applied).toEqual([]);
        }
        const progress = quote.promotionProgress.find(
          (item) => item.scope === scope,
        );
        if (entry.diagnostic.remainingAmount !== null) {
          expect(progress?.subtotal?.remaining).toBe(
            entry.diagnostic.remainingAmount,
          );
        }
        if (entry.diagnostic.remainingQuantity !== null) {
          expect(progress?.quantity?.remaining).toBe(
            entry.diagnostic.remainingQuantity,
          );
        }
        if (entry.diagnostic.status.startsWith('BELOW_')) {
          expect(progress?.status).toBe(entry.diagnostic.status);
        }
      }
    }

    /** Preview the draft FIRST (nothing saved), then save and activate the same configuration and quote. */
    async function previewThenQuote(
      body: Body,
      options: { scope: string; delivery?: boolean; extra?: Body } = {
        scope: 'CART',
      },
    ) {
      const extra = options.delivery
        ? { orderType: 'DELIVERY', deliveryZoneId: w.zoneCId, ...options.extra }
        : (options.extra ?? {});
      const result = await preview(w, cookie, body, extra);
      const id = await activate(w, cookie, body);
      await expectQuoteParity(result, options.scope, options.delivery);
      // and the stored promotion replaces itself when previewed by id: identical answer
      const stored = await preview(w, cookie, body, {
        ...extra,
        promotionId: id,
      });
      const strip = ({ evaluatedAt, requestId, ...rest }: Preview) => (
        void evaluatedAt,
        void requestId,
        rest
      );
      expect(strip(stored)).toStrictEqual(strip(result));
      await prisma.promotion.update({
        where: { id },
        data: { status: 'INACTIVE' },
      });
      return result;
    }

    it('CART minimum: below, at and above (every example re-priced by the Guest quote)', async () => {
      const result = await previewThenQuote(
        draft('Cart 10 over 200', 'CART', { minimumSubtotal: '200.00' }),
        { scope: 'CART' },
      );
      expect(result.examples).toHaveLength(2);
    });

    it('QUANTITY: fixed per unit (units) and a distinct-products threshold', async () => {
      await previewThenQuote(
        draft('Qty fixed 30', 'QUANTITY', {
          discountType: 'FIXED_AMOUNT',
          value: '30.00',
          minimumQuantity: 3,
          quantityBasis: 'UNITS',
        }),
        { scope: 'QUANTITY' },
      );
      await previewThenQuote(
        draft('Three different', 'QUANTITY', {
          value: '20.00',
          minimumQuantity: 3,
          quantityBasis: 'DISTINCT_PRODUCTS',
        }),
        { scope: 'QUANTITY' },
      );
    });

    it('DELIVERY: the fee saving and the remaining spend', async () => {
      await previewThenQuote(
        draft('Free delivery', 'DELIVERY', {
          value: '100.00',
          minimumSubtotal: '150.00',
        }),
        { scope: 'DELIVERY', delivery: true },
      );
      await previewThenQuote(
        draft('Half delivery', 'DELIVERY', { value: '50.00' }),
        { scope: 'DELIVERY', delivery: true },
      );
    });

    it('CATEGORY and MENU: percentage and fixed per-unit discounts, sizes and capped units', async () => {
      gate = true;
      try {
        await previewThenQuote(
          draft('Burgers 15 %', 'CATEGORY', {
            value: '15.00',
            categoryIds: [w.burgersCategory],
          }),
          { scope: 'CATEGORY' },
        );
        // the Pizza's FIRST size (Small 80.00) with a 100.00 fixed discount: capped at the unit price
        await previewThenQuote(
          draft('Pizza fixed 100', 'CATEGORY', {
            discountType: 'FIXED_AMOUNT',
            value: '100.00',
            categoryIds: [w.burgersCategory],
          }),
          { scope: 'CATEGORY', extra: { sampleProductId: w.pizza } },
        );
        await previewThenQuote(
          draft('Menu fixed 7.50', 'MENU', {
            discountType: 'FIXED_AMOUNT',
            value: '7.50',
            menuIds: [w.menuId],
          }),
          { scope: 'MENU', extra: { sampleProductId: w.cake } },
        );
      } finally {
        gate = false;
      }
    });

    it('competition: a draft that loses in the preview loses in the quote, and the winner is the one applied', async () => {
      const winnerId = await activate(
        w,
        cookie,
        draft('Menu 40', 'MENU', { value: '40.00', menuIds: [w.menuId] }),
      );
      const result = await preview(
        w,
        cookie,
        draft('Cart 10 over 100', 'CART', { minimumSubtotal: '100.00' }),
      );
      const qualifying = example(result, 'QUALIFYING');
      expect(qualifying.diagnostic.status).toBe('LOST_TO_BETTER_OFFER');
      const quote = await guestQuote(qualifying, false);
      expect(quote.subtotal).toBe(qualifying.merchandisePayable);
      expect(quote.total).toBe(qualifying.grandTotal);
      expect(qualifying.competingWinner).toMatchObject({
        promotionId: winnerId,
        scope: 'MENU',
      });
      expect(quote.promotions.map(({ scope }) => scope)).toEqual(['MENU']);
      expect(quote.promotions[0].amount).toBe(
        qualifying.competingWinner?.saving,
      );
      await prisma.promotion.update({
        where: { id: winnerId },
        data: { status: 'INACTIVE' },
      });
    });

    it('Staff items with a legacy Product discount, sizes and a quantity match the quote', async () => {
      const items = [
        { productId: w.latte, quantity: 2 },
        { productId: w.pizza, quantity: 3 },
        { productId: w.mint, quantity: 5 },
      ];
      const result = await preview(
        w,
        cookie,
        draft('Drinks 10', 'CATEGORY', { categoryIds: [w.drinksCategory] }),
        { items },
      );
      const id = await activate(
        w,
        cookie,
        draft('Drinks 10', 'CATEGORY', { categoryIds: [w.drinksCategory] }),
      );
      await expectQuoteParity(result, 'CATEGORY');
      expect(example(result, 'SINGLE').lines).toHaveLength(3);
      await prisma.promotion.update({
        where: { id },
        data: { status: 'INACTIVE' },
      });
    });
  });
});
