import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PasswordHasherService } from '../src/auth/password/password-hasher.service';
import { validationExceptionFactory } from '../src/common/http/validation-exception.factory';
import { PrismaService } from '../src/database/prisma.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const customer = { customerName: 'Sara', customerPhone: '+20 100 000 0000' };
const deliveryAddress = '12 Nile Street';

type Item =
  | { productId: string; quantity: number }
  | { offerId: string; quantity: number };
interface Cart {
  items: Item[];
  fulfillment?: 'PICKUP' | 'DELIVERY';
  branchId?: string;
  deliveryZoneId?: string;
}
interface World {
  restaurantId: string;
  branchId: string;
  genericQr: { id: string; publicCode: string };
  tableQr: { publicCode: string };
  zoneId: string;
  products: [string, string];
  categoryId: string;
}

/**
 * Local, identity-checked PostgreSQL only; opt in with TABLE_SESSION_IT_DATABASE_URL.
 * Fixtures use fresh tenant IDs and remain in the disposable sandbox; closing the
 * app does not delete historical rows or bypass their RESTRICT foreign keys.
 */
describeSandbox('Unified Promotions B2 order pricing (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await app?.close();
  });

  async function seedWorld({
    secondPrice = '100.00',
    minimumOrder = '0.00',
  } = {}): Promise<World> {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `it-b2-${randomUUID()}`,
        name: 'IT B2 Restaurant',
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
        publicId: `it-b2-branch-${randomUUID()}`,
        name: 'IT B2 Branch',
        status: 'ACTIVE',
        timezone: 'Africa/Cairo',
      },
    });
    const branchId = branch.id;
    const table = await prisma.table.create({
      data: { restaurantId, branchId, tableNumber: '1', status: 'ACTIVE' },
    });
    const genericQr = await prisma.qrCode.create({
      data: {
        restaurantId,
        publicCode: `it-b2-qr-${randomUUID()}`,
        type: 'GENERIC',
        status: 'ACTIVE',
      },
    });
    const tableQr = await prisma.qrCode.create({
      data: {
        restaurantId,
        branchId,
        tableId: table.id,
        publicCode: `it-b2-qr-${randomUUID()}`,
        type: 'TABLE',
        status: 'ACTIVE',
      },
    });
    const zone = await prisma.deliveryZone.create({
      data: {
        restaurantId,
        branchId,
        name: 'IT Zone',
        status: 'ACTIVE',
        displayOrder: 0,
        deliveryFee: '30.00',
        minimumOrder,
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
    const addProduct = async (
      name: string,
      basePrice: string,
      displayOrder: number,
    ) => {
      const category = await prisma.category.create({
        data: {
          restaurantId,
          menuId: menu.id,
          status: 'ACTIVE',
          displayOrder,
          translations: { create: { locale: 'en', name } },
        },
      });
      return prisma.product.create({
        data: {
          publicId: `it-b2-product-${randomUUID()}`,
          restaurantId,
          categoryId: category.id,
          status: 'ACTIVE',
          availability: 'AVAILABLE',
          basePrice,
          displayOrder,
          allowCustomerNotes: false,
          featured: false,
          discountType: 'PERCENTAGE',
          discountValue: '20.00',
          discountEnabled: true,
          translations: { create: { locale: 'en', name } },
        },
      });
    };
    const first = await addProduct('IT Main', '100.00', 0);
    const second = await addProduct('IT Side', secondPrice, 1);
    return {
      restaurantId,
      branchId,
      genericQr,
      tableQr,
      zoneId: zone.id,
      products: [first.id, second.id],
      categoryId: first.categoryId,
    };
  }

  async function addPromotion(
    w: World,
    scope: 'CART' | 'CATEGORY' | 'DELIVERY',
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT',
    value: string,
    options: { minimumSubtotal?: string } = {},
  ) {
    const title = `${scope} ${value} off`;
    const row = await prisma.promotion.create({
      data: {
        restaurantId: w.restaurantId,
        scope,
        discountType,
        value,
        status: 'ACTIVE',
        internalName: `Internal ${title}`,
        minimumSubtotal: options.minimumSubtotal,
        translations: { create: { locale: 'en', title } },
      },
    });
    if (scope === 'CATEGORY') {
      await prisma.promotionCategory.create({
        data: {
          promotionId: row.id,
          restaurantId: w.restaurantId,
          categoryId: w.categoryId,
        },
      });
    }
    if (scope === 'DELIVERY') {
      await prisma.promotionDeliveryZone.create({
        data: {
          promotionId: row.id,
          restaurantId: w.restaurantId,
          deliveryZoneId: w.zoneId,
        },
      });
    }
    return { ...row, title };
  }

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
      .send({
        ...cart,
        ...customer,
        ...(cart.fulfillment === 'DELIVERY' ? { deliveryAddress } : {}),
        clientRequestId,
        expectedTotal,
      });

  const deliveryCart = (w: World): Cart => ({
    fulfillment: 'DELIVERY',
    branchId: w.branchId,
    deliveryZoneId: w.zoneId,
    items: w.products.map((productId) => ({ productId, quantity: 1 })),
  });

  const orderCount = (w: World) =>
    prisma.order.count({ where: { restaurantId: w.restaurantId } });
  const sessionCount = (w: World) =>
    prisma.tableSession.count({ where: { restaurantId: w.restaurantId } });

  function data(response: request.Response): { total: string } {
    return (response.body as { data: { total: string } }).data;
  }

  function orderId(response: request.Response): string {
    return (response.body as { data: { id: string } }).data.id;
  }

  const storedFor = (id: string) =>
    prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        items: { orderBy: { id: 'asc' } },
        promotions: {
          orderBy: { id: 'asc' },
          include: { allocations: { orderBy: { orderItemId: 'asc' } } },
        },
      },
    });

  type Stored = Awaited<ReturnType<typeof storedFor>>;

  // Compare decimal strings and the actual allocated product rather than depending on DB row order.
  function money(order: Stored) {
    return {
      subtotal: order.subtotalAmount.toFixed(2),
      discountTotal: order.discountTotalAmount.toFixed(2),
      promotionDiscount: order.promotionDiscountAmount.toFixed(2),
      deliveryFeeOriginal: order.deliveryFeeOriginalAmount?.toFixed(2) ?? null,
      deliveryDiscount: order.deliveryDiscountAmount.toFixed(2),
      deliveryFee: order.deliveryFeeAmount.toFixed(2),
      total: order.totalAmount.toFixed(2),
    };
  }

  function lines(order: Stored, w: World) {
    return w.products.map((id) => {
      const item = order.items.find((row) => row.productId === id);
      if (!item) throw new Error(`Missing stored product ${id}`);
      return [
        item.unitPrice.toFixed(2),
        item.quantity,
        item.discountAmount.toFixed(2),
        item.discountTypeSnapshot,
        item.discountValueSnapshot?.toFixed(2) ?? null,
        item.lineTotal.toFixed(2),
      ];
    });
  }

  function shares(order: Stored, promotion: Stored['promotions'][number]) {
    return Object.fromEntries(
      promotion.allocations.map((row) => {
        expect(row.orderId).toBe(order.id);
        const line = order.items.find((item) => item.id === row.orderItemId);
        if (!line?.productId)
          throw new Error(`Expected product allocation for ${row.orderItemId}`);
        return [line.productId, row.amount.toFixed(2)];
      }),
    );
  }

  async function staffDetail(w: World, id: string): Promise<unknown> {
    const password = 'correct horse battery staple';
    const email = `it-b2-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email,
        status: 'ACTIVE',
        passwordHash: await app
          .get(PasswordHasherService)
          .hashPassword(password),
      },
    });
    const role = await ensureStarterRole(prisma, w.restaurantId, 'OWNER');
    await prisma.restaurantMembership.create({
      data: {
        restaurantId: w.restaurantId,
        userId: user.id,
        role: 'OWNER',
        roleId: role.id,
        status: 'ACTIVE',
        allBranches: true,
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const session = cookies.find((cookie) =>
      cookie.startsWith('restaurant_session='),
    );
    if (!session) throw new Error('Missing Staff session cookie');
    const response = await request(app.getHttpServer())
      .get(`/api/v1/restaurants/${w.restaurantId}/orders/${id}`)
      .set('Cookie', session.split(';')[0])
      .expect(200);
    return response.body;
  }

  const fullLine = ['100.00', 1, '0.00', null, null, '100.00'];
  const legacyLine = ['100.00', 1, '20.00', 'PERCENTAGE', '20.00', '80.00'];

  it.each([
    {
      cartType: 'FIXED_AMOUNT',
      cartValue: '50.00',
      total: '170.00',
      subtotal: '150.00',
      discount: '50.00',
      cartWins: true,
    },
    {
      cartType: 'PERCENTAGE',
      cartValue: '15.00',
      total: '180.00',
      subtotal: '160.00',
      discount: '40.00',
      cartWins: false,
    },
  ] as const)(
    'quotes and persists $total EGP for Delivery without stacking merchandise strategies',
    async (scenario) => {
      const w = await seedWorld();
      const cartPromo = await addPromotion(
        w,
        'CART',
        scenario.cartType,
        scenario.cartValue,
      );
      const feePromo = await addPromotion(
        w,
        'DELIVERY',
        'FIXED_AMOUNT',
        '10.00',
      );
      const cart = deliveryCart(w);
      const publicPromotions = [
        ...(scenario.cartWins
          ? [{ title: cartPromo.title, scope: 'CART', amount: '50.00' }]
          : []),
        { title: feePromo.title, scope: 'DELIVERY', amount: '10.00' },
      ];
      const expected = {
        type: 'DELIVERY',
        currencyCode: 'EGP',
        subtotal: scenario.subtotal,
        discountTotal: scenario.discount,
        deliveryFeeOriginal: '30.00',
        deliveryDiscount: '10.00',
        deliveryFee: '20.00',
        total: scenario.total,
      };
      const publicLine = {
        unitPrice: '100.00',
        quantity: 1,
        discountAmount: scenario.cartWins ? '0.00' : '20.00',
        lineTotal: scenario.cartWins ? '100.00' : '80.00',
        promotionDiscount: scenario.cartWins ? '25.00' : '0.00',
      };

      const quoted = await quote(w.genericQr.publicCode, cart).expect(200);
      expect(quoted.body).toMatchObject({
        data: { ...expected, items: [publicLine, publicLine] },
      });
      expect(data(quoted)).toHaveProperty(
        'promotions',
        expect.arrayContaining(publicPromotions),
      );
      expect(data(quoted)).toHaveProperty(
        'promotions.length',
        publicPromotions.length,
      );
      for (const field of [
        'id',
        'clientRequestId',
        'customer',
        'delivery',
        'customerName',
        'customerPhone',
        'deliveryAddress',
        'whatsappNumber',
      ]) {
        expect(data(quoted)).not.toHaveProperty(field);
      }
      expect(quoted.headers['set-cookie']).toBeUndefined();
      expect(await orderCount(w)).toBe(0);

      const placed = await place(
        w.genericQr.publicCode,
        cart,
        data(quoted).total,
      ).expect(201);
      expect(placed.body).toMatchObject({ data: expected });
      expect(data(placed)).toHaveProperty(
        'promotions',
        expect.arrayContaining(publicPromotions),
      );
      expect(data(placed)).toHaveProperty(
        'promotions.length',
        publicPromotions.length,
      );
      expect(placed.body).toMatchObject({
        data: { items: [publicLine, publicLine] },
      });
      const stored = await storedFor(orderId(placed));
      expect(money(stored)).toEqual({
        subtotal: scenario.subtotal,
        discountTotal: scenario.discount,
        promotionDiscount: scenario.cartWins ? '50.00' : '0.00',
        deliveryFeeOriginal: '30.00',
        deliveryDiscount: '10.00',
        deliveryFee: '20.00',
        total: scenario.total,
      });
      const line = scenario.cartWins ? fullLine : legacyLine;
      expect(stored.items).toHaveLength(2);
      expect(lines(stored, w)).toEqual([line, line]);
      expect(stored.promotions.map((row) => row.promotionId).sort()).toEqual(
        (scenario.cartWins
          ? [cartPromo.id, feePromo.id]
          : [feePromo.id]
        ).sort(),
      );
      const feeRow = stored.promotions.find(
        (row) => row.promotionId === feePromo.id,
      )!;
      expect(feeRow).toMatchObject({
        scope: 'DELIVERY',
        restaurantId: w.restaurantId,
        orderId: stored.id,
        allocations: [],
      });
      expect(feeRow.amount.toFixed(2)).toBe('10.00');
      expect(feeRow.configSnapshot).toMatchObject({
        deliveryZoneIds: [w.zoneId],
      });
      if (scenario.cartWins) {
        const cartRow = stored.promotions.find(
          (row) => row.promotionId === cartPromo.id,
        )!;
        expect(cartRow).toMatchObject({
          scope: 'CART',
          discountType: 'FIXED_AMOUNT',
          titleSnapshot: cartPromo.title,
          internalNameSnapshot: cartPromo.internalName,
          configSnapshot: { value: '50.00' },
        });
        expect(cartRow.amount.toFixed(2)).toBe('50.00');
        expect(shares(stored, cartRow)).toEqual({
          [w.products[0]]: '25.00',
          [w.products[1]]: '25.00',
        });
      }

      // WhatsApp-only checkout keeps the same public quote and never writes an Order.
      await prisma.restaurant.update({
        where: { id: w.restaurantId },
        data: {
          whatsappOrderingEnabled: true,
          whatsappNumber: '+201012345678',
        },
      });
      const whatsappQuote = await quote(w.genericQr.publicCode, cart).expect(
        200,
      );
      expect(data(whatsappQuote).total).toBe(scenario.total);
      const whatsapp = await request(app.getHttpServer())
        .post(`/api/v1/public/qr/${w.genericQr.publicCode}/whatsapp-order`)
        .send({
          ...cart,
          ...customer,
          deliveryAddress,
          clientRequestId: randomUUID(),
          expectedTotal: data(whatsappQuote).total,
        })
        .expect(200);
      expect(whatsapp.body).toMatchObject({
        data: {
          total: scenario.total,
          currencyCode: 'EGP',
        },
      });
      expect(data(whatsapp)).toHaveProperty(
        'message',
        expect.stringContaining(
          `Delivery fee: 30 EGP - 10 EGP (${feePromo.title}) = 20 EGP`,
        ),
      );
      expect(data(whatsapp)).toHaveProperty(
        'message',
        expect.stringContaining(
          `*Total: ${scenario.total.replace('.00', '')} EGP*`,
        ),
      );
      expect(await orderCount(w)).toBe(1);
    },
  );

  it('keeps CATEGORY and untargeted legacy savings when CART only ties; quoting opens no Table Session', async () => {
    const w = await seedWorld({ secondPrice: '50.00' });
    const category = await addPromotion(w, 'CATEGORY', 'PERCENTAGE', '30.00');
    await addPromotion(w, 'CART', 'FIXED_AMOUNT', '50.00');
    const cart = {
      items: [
        { productId: w.products[0], quantity: 1 },
        { productId: w.products[1], quantity: 2 },
      ],
    };
    const expected = {
      type: 'DINE_IN',
      subtotal: '150.00',
      discountTotal: '50.00',
      total: '150.00',
      deliveryFeeOriginal: null,
      deliveryDiscount: '0.00',
      deliveryFee: '0.00',
      promotions: [
        { scope: 'CATEGORY', title: category.title, amount: '30.00' },
      ],
    };
    const quoted = await quote(w.tableQr.publicCode, cart).expect(200);
    expect(quoted.body).toMatchObject({
      data: {
        ...expected,
        items: [
          {
            lineTotal: '100.00',
            discountAmount: '0.00',
            promotionDiscount: '30.00',
          },
          {
            lineTotal: '80.00',
            discountAmount: '20.00',
            promotionDiscount: '0.00',
          },
        ],
      },
    });
    expect(await orderCount(w)).toBe(0);
    expect(await sessionCount(w)).toBe(0);

    const placed = await place(
      w.tableQr.publicCode,
      cart,
      data(quoted).total,
    ).expect(201);
    expect(placed.body).toMatchObject({ data: expected });
    const stored = await storedFor(orderId(placed));
    expect(stored.tableSessionId).not.toBeNull();
    expect(stored.roundNumber).toBe(1);
    expect(await sessionCount(w)).toBe(1);
    expect(lines(stored, w)).toEqual([
      fullLine,
      ['50.00', 2, '20.00', 'PERCENTAGE', '20.00', '80.00'],
    ]);
    expect(money(stored)).toMatchObject({
      subtotal: '150.00',
      promotionDiscount: '30.00',
      discountTotal: '50.00',
      total: '150.00',
    });
    expect(stored.promotions).toHaveLength(1);
    expect(stored.promotions[0]).toMatchObject({
      promotionId: category.id,
      configSnapshot: { categoryIds: [w.categoryId] },
    });
    expect(stored.promotions[0].amount.toFixed(2)).toBe('30.00');
    expect(shares(stored, stored.promotions[0])).toEqual({
      [w.products[0]]: '30.00',
    });
  });

  it('rejects the winning net merchandise subtotal below the Delivery Zone minimum without fallback', async () => {
    const w = await seedWorld({ minimumOrder: '155.00' });
    await addPromotion(w, 'CART', 'FIXED_AMOUNT', '50.00');
    await addPromotion(w, 'DELIVERY', 'FIXED_AMOUNT', '10.00');
    const pending = await addPromotion(w, 'DELIVERY', 'FIXED_AMOUNT', '30.00', {
      minimumSubtotal: '220.00',
    });
    // Gross 200, legacy-only net 160 and final total 170 all pass; the winning merchandise net 150 does not.
    const cart = deliveryCart(w);
    const quoted = await quote(w.genericQr.publicCode, cart).expect(400);
    const placed = await place(w.genericQr.publicCode, cart, '170.00').expect(
      400,
    );
    await prisma.restaurant.update({
      where: { id: w.restaurantId },
      data: { whatsappOrderingEnabled: true, whatsappNumber: '+201012345678' },
    });
    const whatsapp = await request(app.getHttpServer())
      .post(`/api/v1/public/qr/${w.genericQr.publicCode}/whatsapp-order`)
      .send({
        ...cart,
        ...customer,
        deliveryAddress,
        clientRequestId: randomUUID(),
        expectedTotal: '170.00',
      })
      .expect(400);
    for (const response of [quoted, placed, whatsapp]) {
      expect(response.body).toMatchObject({
        error: {
          code: 'DELIVERY_MINIMUM_NOT_MET',
          details: {
            zoneName: 'IT Zone',
            minimumOrder: '155.00',
            remainingAmount: '5.00',
          },
        },
      });
    }
    expect(quoted.body).toMatchObject({
      error: {
        details: {
          subtotal: '150.00',
          quote: {
            total: '170.00',
            subtotal: '150.00',
            deliveryFeeOriginal: '30.00',
            deliveryDiscount: '10.00',
            deliveryFee: '20.00',
            promotionProgress: [
              {
                title: pending.title,
                scope: 'DELIVERY',
                status: 'BELOW_MINIMUM_SUBTOTAL',
                subtotal: {
                  basis: 'MERCHANDISE_SUBTOTAL',
                  current: '200.00',
                  required: '220.00',
                  remaining: '20.00',
                },
                quantity: null,
              },
            ],
          },
        },
      },
    });
    for (const response of [placed, whatsapp]) {
      expect(response.body).not.toHaveProperty('error.details.subtotal');
      expect(response.body).not.toHaveProperty('error.details.quote');
    }
    expect(await orderCount(w)).toBe(0);
    expect(
      await prisma.orderPromotion.count({
        where: { restaurantId: w.restaurantId },
      }),
    ).toBe(0);
  });

  it('excludes Offers from merchandise discounts and qualification while keeping the OFFERS gate independent', async () => {
    const w = await seedWorld();
    const { restaurantId } = w;
    const offer = await prisma.offer.create({
      data: {
        restaurantId,
        status: 'ACTIVE',
        price: '120.00',
        translations: { create: { locale: 'en', name: 'IT Bundle' } },
        slots: {
          create: {
            restaurantId,
            kind: 'FIXED',
            requiredCount: 0,
            translations: { create: { locale: 'en', title: 'Included' } },
            options: { create: { restaurantId, productId: w.products[1] } },
          },
        },
      },
    });
    const discount = await addPromotion(w, 'CART', 'PERCENTAGE', '50.00');
    const pending = await addPromotion(w, 'CART', 'PERCENTAGE', '100.00', {
      minimumSubtotal: '200.00',
    });
    await addPromotion(w, 'DELIVERY', 'PERCENTAGE', '50.00', {
      minimumSubtotal: '250.00',
    });
    const cart: Cart = {
      fulfillment: 'PICKUP',
      branchId: w.branchId,
      items: [
        { offerId: offer.id, quantity: 1 },
        { productId: w.products[0], quantity: 1 },
      ],
    };
    const expected = {
      type: 'PICKUP',
      subtotal: '170.00',
      discountTotal: '50.00',
      total: '170.00',
      promotions: [{ scope: 'CART', title: discount.title, amount: '50.00' }],
    };
    const quoted = await quote(w.genericQr.publicCode, cart).expect(200);
    expect(quoted.body).toMatchObject({
      data: {
        ...expected,
        items: [{ offerId: offer.id }, { productId: w.products[0] }],
        promotionProgress: [
          {
            title: pending.title,
            scope: 'CART',
            status: 'BELOW_MINIMUM_SUBTOTAL',
            subtotal: {
              basis: 'ELIGIBLE_PRODUCT_SUBTOTAL',
              current: '100.00',
              required: '200.00',
              remaining: '100.00',
            },
            quantity: null,
          },
        ],
      },
    });
    const placed = await place(
      w.genericQr.publicCode,
      cart,
      data(quoted).total,
    ).expect(201);
    expect(placed.body).toMatchObject({ data: expected });
    const stored = await storedFor(orderId(placed));
    const offerItem = stored.items.find((item) => item.offerId === offer.id)!;
    expect(offerItem.lineTotal.toFixed(2)).toBe('120.00');
    expect(offerItem.discountAmount.toFixed(2)).toBe('0.00');
    expect(stored.promotions).toHaveLength(1);
    expect(shares(stored, stored.promotions[0])).toEqual({
      [w.products[0]]: '50.00',
    });

    await prisma.restaurantFeature.create({
      data: { restaurantId, feature: 'OFFERS', enabled: false },
    });
    const unavailable = await quote(w.genericQr.publicCode, cart).expect(409);
    expect(unavailable.body).toMatchObject({
      error: { code: 'OFFER_UNAVAILABLE', details: { offerIds: [offer.id] } },
    });
    expect(await orderCount(w)).toBe(1);
  });

  it('returns PRICE_CHANGED when PROMOTIONS is switched off mid-checkout and lets the same key reconfirm', async () => {
    const w = await seedWorld();
    await addPromotion(w, 'CART', 'FIXED_AMOUNT', '50.00');
    await addPromotion(w, 'DELIVERY', 'FIXED_AMOUNT', '10.00');
    const cart = deliveryCart(w);
    const qr = w.genericQr.publicCode;
    const quoted = await quote(qr, cart).expect(200);
    expect(data(quoted).total).toBe('170.00');

    await prisma.restaurantFeature.update({
      where: {
        restaurantId_feature: {
          restaurantId: w.restaurantId,
          feature: 'PROMOTIONS',
        },
      },
      data: { enabled: false },
    });
    const key = randomUUID();
    const stale = await place(qr, cart, data(quoted).total, key).expect(422);
    expect(stale.body).toMatchObject({
      error: {
        code: 'PRICE_CHANGED',
        details: {
          pricing: {
            subtotal: '160.00',
            discountTotal: '40.00',
            total: '190.00',
            currencyCode: 'EGP',
          },
        },
      },
    });
    expect(await orderCount(w)).toBe(0);
    const refreshed = await quote(qr, cart).expect(200);
    expect(refreshed.body).toMatchObject({
      data: {
        subtotal: '160.00',
        discountTotal: '40.00',
        deliveryFee: '30.00',
        deliveryDiscount: '0.00',
        total: '190.00',
        promotions: [],
      },
    });
    const confirmed = await place(qr, cart, data(refreshed).total, key).expect(
      201,
    );
    const stored = await storedFor(orderId(confirmed));
    expect(stored.clientRequestId).toBe(key);
    expect(stored.promotions).toEqual([]);
    expect(lines(stored, w)).toEqual([legacyLine, legacyLine]);
    expect(money(stored)).toMatchObject({
      promotionDiscount: '0.00',
      deliveryFee: '30.00',
      total: '190.00',
    });
    expect(await orderCount(w)).toBe(1);
  });

  it('commits one Order, round and allocation set for concurrent retries and replays history after edits', async () => {
    const w = await seedWorld();
    const applied = await addPromotion(w, 'CART', 'FIXED_AMOUNT', '50.00');
    const qr = w.tableQr.publicCode;
    const cart = { items: deliveryCart(w).items };
    const key = randomUUID();
    const [first, second] = await Promise.all([
      place(qr, cart, '150.00', key).expect(201),
      place(qr, cart, '150.00', key).expect(201),
    ]);
    expect(data(first).total).toBe('150.00');
    expect(data(second)).toEqual(data(first));
    const id = orderId(first);
    expect(await orderCount(w)).toBe(1);
    expect(await sessionCount(w)).toBe(1);
    const before = await storedFor(id);
    expect(before.roundNumber).toBe(1);
    expect(before.items).toHaveLength(2);
    expect(before.promotions).toHaveLength(1);
    expect(shares(before, before.promotions[0])).toEqual({
      [w.products[0]]: '25.00',
      [w.products[1]]: '25.00',
    });

    await prisma.promotion.update({
      where: { id: applied.id },
      data: {
        value: '90.00',
        internalName: 'Edited internal name',
        status: 'ARCHIVED',
        archivedAt: new Date(),
        translations: {
          update: {
            where: {
              promotionId_locale: { promotionId: applied.id, locale: 'en' },
            },
            data: { title: 'Edited public title' },
          },
        },
      },
    });
    await prisma.product.update({
      where: { id: w.products[0] },
      data: { basePrice: '200.00' },
    });
    const current = await quote(qr, cart).expect(200);
    expect(data(current).total).toBe('240.00');
    const replay = await place(qr, cart, data(current).total, key).expect(201);
    expect(data(replay)).toEqual(data(first));
    expect(await storedFor(id)).toEqual(before);
    expect(await orderCount(w)).toBe(1);
    expect(await sessionCount(w)).toBe(1);

    const conflict = await place(
      qr,
      { items: [{ productId: w.products[0], quantity: 2 }] },
      '320.00',
      key,
    ).expect(409);
    expect(conflict.body).toMatchObject({
      error: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
    expect(await orderCount(w)).toBe(1);
    expect(await staffDetail(w, id)).toMatchObject({
      data: {
        subtotalAmount: '150.00',
        discountTotal: '50.00',
        totalAmount: '150.00',
        promotions: [{ scope: 'CART', title: applied.title, amount: '50.00' }],
      },
    });
  });

  it('reads a pre-B2 Delivery Order with the original net fee and no fabricated promotions', async () => {
    const w = await seedWorld();
    const cart = {
      ...deliveryCart(w),
      items: [{ productId: w.products[0], quantity: 1 }],
    };
    const legacy = await prisma.order.create({
      data: {
        restaurantId: w.restaurantId,
        branchId: w.branchId,
        qrCodeId: w.genericQr.id,
        clientRequestId: randomUUID(),
        status: 'PENDING',
        type: 'DELIVERY',
        currencyCode: 'EGP',
        customerNameSnapshot: customer.customerName,
        customerPhoneSnapshot: '+201000000000',
        deliveryZoneId: w.zoneId,
        deliveryZoneNameSnapshot: 'Old Zone',
        deliveryAddressSnapshot: deliveryAddress,
        subtotalAmount: '80.00',
        discountTotalAmount: '20.00',
        deliveryFeeAmount: '25.00',
        totalAmount: '105.00',
        items: {
          create: {
            productId: w.products[0],
            productNameSnapshot: 'Old Main',
            unitPrice: '100.00',
            quantity: 1,
            discountAmount: '20.00',
            discountTypeSnapshot: 'PERCENTAGE',
            discountValueSnapshot: '20.00',
            lineTotal: '80.00',
          },
        },
      },
    });
    await addPromotion(w, 'CART', 'FIXED_AMOUNT', '50.00');
    await addPromotion(w, 'DELIVERY', 'FIXED_AMOUNT', '10.00');
    const current = await quote(w.genericQr.publicCode, cart).expect(200);
    expect(data(current).total).toBe('70.00');

    const replay = await place(
      w.genericQr.publicCode,
      cart,
      data(current).total,
      legacy.clientRequestId,
    ).expect(201);
    expect(replay.body).toMatchObject({
      data: {
        id: legacy.id,
        subtotal: '80.00',
        discountTotal: '20.00',
        deliveryFee: '25.00',
        total: '105.00',
        deliveryFeeOriginal: null,
        deliveryDiscount: '0.00',
        promotions: [],
        items: [
          {
            name: 'Old Main',
            lineTotal: '80.00',
            discountAmount: '20.00',
            promotionDiscount: '0.00',
          },
        ],
      },
    });
    expect(await staffDetail(w, legacy.id)).toMatchObject({
      data: {
        subtotalAmount: '80.00',
        discountTotal: '20.00',
        deliveryFee: '25.00',
        totalAmount: '105.00',
        deliveryFeeOriginal: null,
        deliveryDiscount: '0.00',
        promotions: [],
      },
    });
    const stored = await storedFor(legacy.id);
    expect(stored.promotions).toEqual([]);
    expect(money(stored)).toMatchObject({
      promotionDiscount: '0.00',
      deliveryFeeOriginal: null,
      deliveryDiscount: '0.00',
    });
    expect(await orderCount(w)).toBe(1);
  });
});
