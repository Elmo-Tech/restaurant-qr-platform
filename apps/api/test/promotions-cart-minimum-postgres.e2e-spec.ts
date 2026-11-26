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
 * DEC-077 B2 (mandatory CART minimum, legacy compatibility) against REAL PostgreSQL through the real Nest app:
 * the create matrix, the server-side legacy comparison on PATCH / activate / deactivate / archive, the unchanged
 * preview contract, and the financial chain the plan's matrix (section 4.1, B2 column) requires -- Guest quote
 * (threshold boundaries, remaining to qualify), checkout (PRICE_CHANGED, idempotency), historical snapshots,
 * Staff order detail, the table-session bill, the dashboard and the WhatsApp message -- plus proof that a legacy
 * CART promotion prices identically before and after Staff touch it. Local, identity-checked sandbox only
 * (TABLE_SESSION_IT_DATABASE_URL); fixtures use fresh tenant ids and stay in the disposable database.
 */
const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const password = 'correct horse battery staple';
const customer = { customerName: 'Sara', customerPhone: '+20 100 000 0000' };

interface World {
  restaurantId: string;
  branchId: string;
  zoneId: string;
  genericQr: string;
  tableQr: string;
  below: string; // 199.99
  at: string; // 200.00
  above: string; // 200.01
  cola: { id: string; cheese: string };
}

type Body = Record<string, unknown>;
interface Cart {
  items: Body[];
  fulfillment?: 'PICKUP' | 'DELIVERY';
  branchId?: string;
  deliveryZoneId?: string;
}
interface StaffPromotion {
  id: string;
  status: string;
  updatedAt: string;
  priority: number;
  value: string;
  minimumSubtotal: string | null;
  needsMinimumSubtotal: boolean;
  internalName: string;
}

describeSandbox('DEC-077 B2 CART minimum (real PostgreSQL)', () => {
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
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  // ---------------------------------------------------------------- fixtures

  async function seedWorld(label: string): Promise<World> {
    const { id: restaurantId } = await prisma.restaurant.create({
      data: {
        publicId: `it-b2-${randomUUID()}`,
        name: `IT B2 ${label}`,
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
        countryCode: 'EG',
        locales: { create: { locale: 'en', isActive: true } },
        features: { create: { feature: 'PROMOTIONS', enabled: true } },
      },
    });
    const branch = await prisma.branch.create({
      data: {
        restaurantId,
        publicId: `it-b2-br-${randomUUID()}`,
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
        publicCode: `it-b2-qr-${randomUUID()}`,
        type: 'GENERIC',
        status: 'ACTIVE',
      },
    });
    const tableQr = await prisma.qrCode.create({
      data: {
        restaurantId,
        branchId: branch.id,
        tableId: table.id,
        publicCode: `it-b2-qr-${randomUUID()}`,
        type: 'TABLE',
        status: 'ACTIVE',
      },
    });
    const zone = await prisma.deliveryZone.create({
      data: {
        restaurantId,
        branchId: branch.id,
        name: 'IT Zone',
        status: 'ACTIVE',
        displayOrder: 0,
        deliveryFee: '30.00',
        minimumOrder: '0.00',
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
    const boundary = await category('Boundary', 0);
    const drinks = await category('Drinks', 1);
    const product = (
      categoryId: string,
      name: string,
      basePrice: string,
      displayOrder: number,
    ) =>
      prisma.product.create({
        data: {
          publicId: `it-b2-p-${randomUUID()}`,
          restaurantId,
          categoryId,
          status: 'ACTIVE',
          availability: 'AVAILABLE',
          basePrice,
          displayOrder,
          allowCustomerNotes: false,
          featured: false,
          translations: { create: { locale: 'en', name } },
        },
      });
    const below = await product(boundary, 'Feast 199.99', '199.99', 0);
    const at = await product(boundary, 'Feast 200.00', '200.00', 1);
    const above = await product(boundary, 'Feast 200.01', '200.01', 2);
    const cola = await product(drinks, 'Cola', '40.00', 0);
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
      zoneId: zone.id,
      genericQr: generic.publicCode,
      tableQr: tableQr.publicCode,
      below: below.id,
      at: at.id,
      above: above.id,
      cola: { id: cola.id, cheese: extras.options[0].id },
    };
  }

  async function staff(w: World, kind: 'OWNER' | 'MANAGER' = 'MANAGER') {
    const email = `it-b2-${randomUUID()}@example.test`;
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
  const promo = (response: request.Response) =>
    (response.body as { data: StaffPromotion }).data;

  const cartDraft = (internalName: string, overrides: Body = {}): Body => ({
    internalName,
    scope: 'CART',
    discountType: 'PERCENTAGE',
    value: '10.00',
    minimumSubtotal: '200.00',
    translations: [{ locale: 'en', title: internalName }],
    ...overrides,
  });

  /** A promotion row written DIRECTLY: legacy shaped data that predates B2 (NULL or 0.00 minimum). */
  async function legacyRow(
    w: World,
    options: {
      minimumSubtotal: string | null;
      status?: 'ACTIVE' | 'INACTIVE';
      title?: string;
      value?: string;
    },
  ) {
    const title = options.title ?? 'Legacy cart 10 %';
    return prisma.promotion.create({
      data: {
        restaurantId: w.restaurantId,
        scope: 'CART',
        discountType: 'PERCENTAGE',
        value: options.value ?? '10.00',
        status: options.status ?? 'ACTIVE',
        internalName: `Internal ${title}`,
        minimumSubtotal: options.minimumSubtotal,
        translations: { create: { locale: 'en', title } },
      },
    });
  }

  /** md5 over the whole stored row + its translations: proves nothing rewrote it. */
  async function fingerprint(id: string) {
    const [row] = await prisma.$queryRaw<{ fp: string }[]>`
      SELECT md5(p::text || coalesce((
        SELECT string_agg(t::text, '|' ORDER BY t.locale)
        FROM promotion_translations t WHERE t.promotion_id = p.id), '')) AS fp
      FROM promotions p WHERE p.id = ${id}::uuid`;
    return row.fp;
  }

  const pickup = (w: World, items: Body[]): Cart => ({
    items,
    fulfillment: 'PICKUP',
    branchId: w.branchId,
  });
  const one = (productId: string, extra: Body = {}): Body => ({
    productId,
    quantity: 1,
    ...extra,
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
  const orderId = (response: request.Response) =>
    (response.body as { data: { id: string } }).data.id;
  const total = (response: request.Response) =>
    (response.body as { data: { total: string } }).data.total;
  const orderCount = (w: World) =>
    prisma.order.count({ where: { restaurantId: w.restaurantId } });
  const promotionCount = (w: World) =>
    prisma.promotion.count({ where: { restaurantId: w.restaurantId } });
  const storedFor = (id: string) =>
    prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        items: { orderBy: { unitPrice: 'asc' } },
        promotions: { include: { allocations: true } },
      },
    });

  function expectProblem(
    response: request.Response,
    code: string,
    field = 'minimumSubtotal',
  ) {
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      error: {
        code: 'PROMOTION_INVALID',
        details: {
          problems: expect.arrayContaining([{ code, field }]) as unknown,
        },
      },
    });
  }

  // ------------------------------------------------------------ create matrix

  it('a new CART promotion needs a minimum above 0 with at most 2 decimals; nothing is written on refusal', async () => {
    const w = await seedWorld('create');
    const manager = await staff(w);
    const path = staffPath(w, '/promotions');
    const missing = cartDraft('No minimum');
    delete missing.minimumSubtotal;
    expectProblem(
      await send('post', manager, path, missing),
      'MINIMUM_SUBTOTAL_REQUIRED',
    );
    expectProblem(
      await send(
        'post',
        manager,
        path,
        cartDraft('Null', { minimumSubtotal: null }),
      ),
      'MINIMUM_SUBTOTAL_REQUIRED',
    );
    for (const zero of ['0.00', '0', '0.0']) {
      expectProblem(
        await send(
          'post',
          manager,
          path,
          cartDraft('Zero', { minimumSubtotal: zero }),
        ),
        'MINIMUM_SUBTOTAL_NOT_POSITIVE',
      );
    }
    // Malformed wire values (negative, 3 decimals, text, non-string) never reach the domain validator: the DTO
    // refuses them first with the global 400, and nothing is written either.
    for (const bad of ['-5.00', '100.005', 'abc', '1e3', ' 100', 200, true]) {
      const response = await send(
        'post',
        manager,
        path,
        cartDraft('Bad', { minimumSubtotal: bad }),
      );
      expect(response.status).toBe(400);
    }
    expect(await promotionCount(w)).toBe(0);

    for (const accepted of ['0.01', '200.00', '1']) {
      const row = promo(
        await send(
          'post',
          manager,
          path,
          cartDraft(`Min ${accepted}`, { minimumSubtotal: accepted }),
        ).expect(201),
      );
      expect(row).toMatchObject({
        status: 'INACTIVE',
        needsMinimumSubtotal: false,
      });
      expect(Number(row.minimumSubtotal)).toBe(Number(accepted));
    }
    // other scopes keep their optional minimum (>= 0) and are untouched by B2
    const delivery = {
      internalName: 'Free delivery',
      scope: 'DELIVERY',
      discountType: 'PERCENTAGE',
      value: '100.00',
      translations: [{ locale: 'en', title: 'Free delivery' }],
    };
    expect(
      promo(await send('post', manager, path, delivery).expect(201))
        .needsMinimumSubtotal,
    ).toBe(false);
    await send('post', manager, path, {
      ...delivery,
      internalName: 'Free delivery 0',
      minimumSubtotal: '0.00',
    }).expect(201);
  });

  it('a stored CART promotion with a valid minimum can never lose it', async () => {
    const w = await seedWorld('non-legacy');
    const manager = await staff(w);
    const created = promo(
      await send(
        'post',
        manager,
        staffPath(w, '/promotions'),
        cartDraft('Valid'),
      ).expect(201),
    );
    const url = staffPath(w, `/promotions/${created.id}`);
    expectProblem(
      await send('patch', manager, url, { minimumSubtotal: null }),
      'MINIMUM_SUBTOTAL_REQUIRED',
    );
    expectProblem(
      await send('patch', manager, url, {
        minimumSubtotal: '0.00',
        internalName: 'Renamed too',
      }),
      'MINIMUM_SUBTOTAL_NOT_POSITIVE',
    );
    // moving it to another scope is governed by that scope's rules
    await send('patch', manager, url, {
      scope: 'DELIVERY',
      minimumSubtotal: null,
      confirmTargetWidening: true, // a scope change can widen eligibility; unrelated to the minimum rule
    }).expect(200);
    // and moving it back to CART is a new CART promotion again
    expectProblem(
      await send('patch', manager, url, { scope: 'CART' }),
      'MINIMUM_SUBTOTAL_REQUIRED',
    );
    await send('patch', manager, url, {
      scope: 'CART',
      minimumSubtotal: '75.00',
      confirmTargetWidening: true,
    }).expect(200);
  });

  // ------------------------------------------------------- legacy operations

  it.each([
    ['NULL', null],
    ['0.00', '0.00'],
  ])(
    'legacy CART promotion (minimum %s): the server compares normalized values, never a client flag',
    async (_label, stored) => {
      const w = await seedWorld(`legacy-${_label}`);
      const manager = await staff(w);
      const row = await legacyRow(w, { minimumSubtotal: stored });
      const untouched = await legacyRow(w, {
        minimumSubtotal: stored,
        title: 'Never touched',
      });
      const untouchedBefore = await fingerprint(untouched.id);
      const url = staffPath(w, `/promotions/${row.id}`);
      const read = () =>
        get(manager, url)
          .expect(200)
          .then((response) => promo(response));
      const stored$ = () =>
        prisma.promotion.findUniqueOrThrow({ where: { id: row.id } });

      // read model: informational flag, existing fields unchanged
      const initial = await read();
      expect(initial).toMatchObject({
        status: 'ACTIVE',
        needsMinimumSubtotal: true,
        priority: 100,
        value: '10.00',
      });
      const list = await get(manager, staffPath(w, '/promotions')).expect(200);
      expect(
        (list.body as { data: StaffPromotion[] }).data.every(
          (item) => item.needsMinimumSubtotal,
        ),
      ).toBe(true);

      // allowed without a minimum: metadata, whole-form re-send, deactivate (checked last), archive (other row)
      let current = promo(
        await send('patch', manager, url, {
          internalName: 'Renamed legacy',
          translations: [{ locale: 'en', title: 'New customer title' }],
        }).expect(200),
      );
      expect(current).toMatchObject({
        internalName: 'Renamed legacy',
        needsMinimumSubtotal: true,
      });
      current = promo(
        await send('patch', manager, url, {
          internalName: 'Whole form re-sent',
          scope: 'CART',
          discountType: 'PERCENTAGE',
          value: '10',
          priority: 100,
          startsOn: null,
          endsOn: null,
          minimumSubtotal: stored === null ? null : '0',
          minimumQuantity: null,
          quantityBasis: null,
          branchIds: [],
          menuIds: [],
          categoryIds: [],
          productIds: [],
          deliveryZoneIds: [],
          translations: [{ locale: 'en', title: 'Re-sent title' }],
        }).expect(200),
      );
      expect(current.needsMinimumSubtotal).toBe(true);
      // never backfilled or defaulted
      const afterMetadata = await stored$();
      expect(afterMetadata.minimumSubtotal === null).toBe(stored === null);
      expect(afterMetadata.status).toBe('ACTIVE');
      expect(afterMetadata.value.toFixed(2)).toBe('10.00');
      expect(afterMetadata.priority).toBe(100);

      // refused without a valid minimum: pricing, eligibility, winner order
      const changes: Body[] = [
        { value: '12.00' },
        { discountType: 'FIXED_AMOUNT' },
        { startsOn: '2026-12-01' },
        { endsOn: '2026-12-31' },
        { branchIds: [w.branchId] },
        { priority: 50 },
        { productIds: [w.cola.id] },
        { minimumSubtotal: '0.00', value: '12.00' },
      ];
      for (const change of changes) {
        const refused = await send('patch', manager, url, change);
        expectProblem(
          refused,
          'minimumSubtotal' in change
            ? 'MINIMUM_SUBTOTAL_NOT_POSITIVE'
            : 'MINIMUM_SUBTOTAL_REQUIRED',
        );
      }
      expect((await stored$()).updatedAt.getTime()).toBe(
        afterMetadata.updatedAt.getTime(),
      ); // none of the refused writes left a trace

      // the same changes ARE accepted together with a valid minimum, and the promotion stops being legacy
      current = promo(
        await send('patch', manager, url, {
          value: '12.00',
          minimumSubtotal: '100.00',
        }).expect(200),
      );
      expect(current).toMatchObject({
        value: '12.00',
        minimumSubtotal: '100.00',
        needsMinimumSubtotal: false,
      });

      // a legacy promotion can be deactivated and archived; reactivation needs the minimum
      const second = await legacyRow(w, {
        minimumSubtotal: stored,
        title: 'Second legacy',
      });
      const secondPath = staffPath(w, `/promotions/${second.id}`);
      const deactivated = promo(
        await send('post', manager, `${secondPath}/deactivate`, {}).expect(200),
      );
      expect(deactivated).toMatchObject({
        status: 'INACTIVE',
        needsMinimumSubtotal: true,
      });
      expectProblem(
        await send('post', manager, `${secondPath}/activate`, {}),
        'MINIMUM_SUBTOTAL_REQUIRED',
      );
      expect(
        (await prisma.promotion.findUniqueOrThrow({ where: { id: second.id } }))
          .status,
      ).toBe('INACTIVE');
      // saving only a minimum is a (legal) change; activation then succeeds
      await send('patch', manager, secondPath, {
        minimumSubtotal: '50.00',
      }).expect(200);
      expect(
        promo(
          await send('post', manager, `${secondPath}/activate`, {}).expect(200),
        ),
      ).toMatchObject({ status: 'ACTIVE', needsMinimumSubtotal: false });

      const third = await legacyRow(w, {
        minimumSubtotal: stored,
        title: 'Third legacy',
      });
      const archived = promo(
        await send(
          'post',
          manager,
          staffPath(w, `/promotions/${third.id}/archive`),
          {},
        ).expect(200),
      );
      expect(archived).toMatchObject({
        status: 'ARCHIVED',
        needsMinimumSubtotal: false,
      });

      // an inactive legacy promotion keeps being editable as metadata
      const inactive = await legacyRow(w, {
        minimumSubtotal: stored,
        status: 'INACTIVE',
        title: 'Inactive legacy',
      });
      await send('patch', manager, staffPath(w, `/promotions/${inactive.id}`), {
        internalName: 'Inactive renamed',
      }).expect(200);

      // nothing ever rewrote the legacy row nobody edited
      expect(await fingerprint(untouched.id)).toBe(untouchedBefore);
    },
    60_000,
  );

  it('the existing preview contract is unchanged: a CART draft without a minimum is still previewable, and saving it is what is refused', async () => {
    const w = await seedWorld('preview');
    const manager = await staff(w);
    const draft = cartDraft('Preview 10');
    delete draft.minimumSubtotal;
    const previewBody = (minimum?: string) => ({
      draft:
        minimum === undefined ? draft : { ...draft, minimumSubtotal: minimum },
      branchId: w.branchId,
      orderType: 'PICKUP',
      items: [{ productId: w.cola.id, quantity: 3 }],
    });
    const before = await promotionCount(w);
    for (const minimum of [undefined, '0.00', '50.00']) {
      const response = await send(
        'post',
        manager,
        staffPath(w, '/promotions/preview'),
        previewBody(minimum),
      ).expect(200);
      expect(response.body).toMatchObject({
        data: { merchandiseOriginal: '120.00' },
      });
    }
    // the same draft saved is refused, and the preview wrote nothing
    expectProblem(
      await send('post', manager, staffPath(w, '/promotions'), draft),
      'MINIMUM_SUBTOTAL_REQUIRED',
    );
    expect(await promotionCount(w)).toBe(before);
    expect(await orderCount(w)).toBe(0);
  });

  // ------------------------------------------------------- financial chain

  it('Guest quote, thresholds, checkout, idempotency, PRICE_CHANGED, snapshots, readers and WhatsApp agree for a new CART promotion', async () => {
    const w = await seedWorld('chain');
    const manager = await staff(w);
    const created = promo(
      await send(
        'post',
        manager,
        staffPath(w, '/promotions'),
        cartDraft('Cart 10 over 200'),
      ).expect(201),
    );
    const activate = (id: string) =>
      send('post', manager, staffPath(w, `/promotions/${id}/activate`), {});
    const active = promo(await activate(created.id).expect(200));
    const qr = w.genericQr;

    // 199.99 / 200.00 / 200.01 around the 200.00 minimum
    const below = (await quote(qr, pickup(w, [one(w.below)])).expect(200))
      .body as {
      data: {
        total: string;
        discountTotal: string;
        promotions: unknown[];
        promotionProgress: unknown[];
      };
    };
    expect(below.data).toMatchObject({
      total: '199.99',
      discountTotal: '0.00',
      promotions: [],
      promotionProgress: [
        {
          scope: 'CART',
          status: 'BELOW_MINIMUM_SUBTOTAL',
          title: 'Cart 10 over 200',
          subtotal: {
            current: '199.99',
            required: '200.00',
            remaining: '0.01',
          },
        },
      ],
    });
    const equal = await quote(qr, pickup(w, [one(w.at)])).expect(200);
    expect(equal.body).toMatchObject({
      data: {
        total: '180.00',
        discountTotal: '20.00',
        promotions: [{ scope: 'CART', amount: '20.00' }],
        promotionProgress: [],
      },
    });
    const over = await quote(qr, pickup(w, [one(w.above)])).expect(200);
    expect(over.body).toMatchObject({
      data: {
        total: '180.01', // 10 % of 200.01 = 20.001 -> 20.00
        discountTotal: '20.00',
      },
    });

    // paid extras count toward eligibility: 2 x 40.00 + 2 x (40.00 + 20.00 cheese) = 200.00; without the cheese 160.00
    const withExtras = await quote(
      qr,
      pickup(w, [
        one(w.cola.id, { quantity: 2 }),
        one(w.cola.id, {
          quantity: 2,
          modifierOptionIds: [w.cola.cheese],
        }),
      ]),
    ).expect(200);
    expect(withExtras.body).toMatchObject({
      data: { discountTotal: '20.00', total: '180.00', promotionProgress: [] },
    });
    const withoutExtras = await quote(
      qr,
      pickup(w, [one(w.cola.id, { quantity: 4 })]),
    ).expect(200);
    expect(withoutExtras.body).toMatchObject({
      data: {
        discountTotal: '0.00',
        total: '160.00',
        promotionProgress: [
          { subtotal: { current: '160.00', remaining: '40.00' } },
        ],
      },
    });
    // a 30.00 delivery fee never counts toward the minimum: 199.99 + fee = 229.99, still below
    const delivery = await quote(qr, {
      fulfillment: 'DELIVERY',
      branchId: w.branchId,
      deliveryZoneId: w.zoneId,
      items: [one(w.below)],
    }).expect(200);
    expect(delivery.body).toMatchObject({
      data: {
        discountTotal: '0.00',
        deliveryFee: '30.00',
        total: '229.99',
        promotionProgress: [
          { scope: 'CART', subtotal: { current: '199.99', remaining: '0.01' } },
        ],
      },
    });

    // Checkout at the quoted total, then an idempotent replay and a refused reuse
    const cart = pickup(w, [one(w.at)]);
    const key = randomUUID();
    const placed = await place(qr, cart, '180.00', key).expect(201);
    const firstId = orderId(placed);
    expect(total(placed)).toBe('180.00');
    const replay = await place(qr, cart, '180.00', key);
    expect([200, 201]).toContain(replay.status);
    expect(orderId(replay)).toBe(firstId);
    const reused = await place(qr, pickup(w, [one(w.above)]), '180.00', key);
    expect(reused.status).toBe(409);
    expect(reused.body).toMatchObject({
      error: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
    expect(await orderCount(w)).toBe(1);

    // Historical snapshot
    const stored = await storedFor(firstId);
    expect(stored.promotions).toHaveLength(1);
    const snapshot = stored.promotions[0];
    expect(snapshot).toMatchObject({
      scope: 'CART',
      discountType: 'PERCENTAGE',
      promotionId: active.id,
    });
    expect(snapshot.value.toFixed(2)).toBe('10.00');
    expect(snapshot.amount.toFixed(2)).toBe('20.00');
    expect(snapshot.allocations.map((a) => a.amount.toFixed(2))).toEqual([
      '20.00',
    ]);
    expect(stored.promotionDiscountAmount.toFixed(2)).toBe('20.00');
    expect(stored.totalAmount.toFixed(2)).toBe('180.00');

    // PRICE_CHANGED: Staff raise the minimum between quote and submit -> nothing created, same key reconfirms
    await send('patch', manager, staffPath(w, `/promotions/${active.id}`), {
      minimumSubtotal: '250.00',
    }).expect(200);
    const staleKey = randomUUID();
    const stale = await place(qr, cart, '180.00', staleKey);
    expect(stale.status).toBe(422);
    expect(stale.body).toMatchObject({
      error: {
        code: 'PRICE_CHANGED',
        details: { pricing: { discountTotal: '0.00', total: '200.00' } },
      },
    });
    expect(await orderCount(w)).toBe(1);
    expect(total(await quote(qr, cart).expect(200))).toBe('200.00');
    expect(total(await place(qr, cart, '200.00', staleKey).expect(201))).toBe(
      '200.00',
    );
    expect(await orderCount(w)).toBe(2);

    // History never follows the live promotion
    await send(
      'post',
      manager,
      staffPath(w, `/promotions/${active.id}/archive`),
      {},
    ).expect(200);
    const after = await storedFor(firstId);
    expect(after.promotions[0].amount.toFixed(2)).toBe('20.00');
    expect(after.totalAmount.toFixed(2)).toBe('180.00');

    // Staff order detail / receipt reader
    const detail = await get(
      manager,
      staffPath(w, `/orders/${firstId}`),
    ).expect(200);
    expect(detail.body).toMatchObject({
      data: {
        discountTotal: '20.00',
        totalAmount: '180.00',
        promotions: [
          { scope: 'CART', title: 'Cart 10 over 200', amount: '20.00' },
        ],
      },
    });

    // Dashboard: net sold amount = line total - allocations (180.00 + 200.00)
    const dashboard = await get(
      manager,
      staffPath(w, '/dashboard?range=today'),
    ).expect(200);
    const top = (
      dashboard.body as {
        data: { topProducts: { name: string; amount: string }[] };
      }
    ).data.topProducts;
    expect(top.find((entry) => entry.name === 'Feast 200.00')).toMatchObject({
      amount: '380.00',
    });
  }, 90_000);

  it('Dine-in bill and WhatsApp message read the same CART saving', async () => {
    const w = await seedWorld('bill');
    const manager = await staff(w);
    const created = promo(
      await send(
        'post',
        manager,
        staffPath(w, '/promotions'),
        cartDraft('Cart 10 over 200'),
      ).expect(201),
    );
    await send(
      'post',
      manager,
      staffPath(w, `/promotions/${created.id}/activate`),
      {},
    ).expect(200);

    const cart: Cart = { items: [one(w.at)] };
    const placed = await place(w.tableQr, cart, '180.00').expect(201);
    const stored = await storedFor(orderId(placed));
    const session = await prisma.tableSession.findUniqueOrThrow({
      where: { id: stored.tableSessionId as string },
      select: { publicId: true },
    });
    const bill = await get(
      manager,
      staffPath(w, `/table-sessions/${session.publicId}/bill`),
    ).expect(200);
    const text = JSON.stringify(bill.body);
    expect(text).toContain('"20.00"');
    expect(text).toContain('Cart 10 over 200');

    await prisma.restaurant.update({
      where: { id: w.restaurantId },
      data: { whatsappNumber: '+201012345678', whatsappOrderingEnabled: true },
    });
    const before = await orderCount(w);
    const response = await request(app.getHttpServer())
      .post(`/api/v1/public/qr/${w.genericQr}/whatsapp-order`)
      .send({
        items: [one(w.at)],
        fulfillment: 'PICKUP',
        branchId: w.branchId,
        clientRequestId: randomUUID(),
        customerName: 'Mona Hassan',
        customerPhone: '01012345678',
      })
      .expect(200);
    const data = (response.body as { data: { total: string; message: string } })
      .data;
    expect(data.total).toBe('180.00');
    expect(data.message).toContain('Cart 10 over 200');
    expect(data.message).toContain('*Total: 180 EGP*');
    expect(await orderCount(w)).toBe(before); // a dry run stores nothing
  }, 60_000);

  it.each([
    ['NULL', null],
    ['0.00', '0.00'],
  ])(
    'a legacy CART promotion (minimum %s) prices, snapshots and reads identically before and after Staff edit its metadata',
    async (_label, stored) => {
      const w = await seedWorld(`legacy-chain-${_label}`);
      const manager = await staff(w);
      const legacy = await legacyRow(w, { minimumSubtotal: stored });
      const cart = pickup(w, [one(w.cola.id)]); // a 40.00 basket: far below any B2 minimum
      const qr = w.genericQr;

      const quoteBefore = await quote(qr, cart).expect(200);
      expect(quoteBefore.body).toMatchObject({
        data: {
          discountTotal: '4.00',
          total: '36.00',
          promotions: [
            { scope: 'CART', title: 'Legacy cart 10 %', amount: '4.00' },
          ],
          promotionProgress: [],
        },
      });
      const firstId = orderId(await place(qr, cart, '36.00').expect(201));
      const firstSnapshot = await storedFor(firstId);

      // Staff rename it (metadata only) and re-send the whole stored form
      await send('patch', manager, staffPath(w, `/promotions/${legacy.id}`), {
        internalName: 'Renamed',
        translations: [{ locale: 'en', title: 'Legacy cart renamed' }],
      }).expect(200);

      const quoteAfter = await quote(qr, cart).expect(200);
      expect(quoteAfter.body).toMatchObject({
        data: {
          discountTotal: '4.00',
          total: '36.00',
          promotions: [
            { scope: 'CART', title: 'Legacy cart renamed', amount: '4.00' },
          ],
        },
      });
      const secondId = orderId(await place(qr, cart, '36.00').expect(201));
      const secondSnapshot = await storedFor(secondId);
      for (const snap of [firstSnapshot, secondSnapshot]) {
        expect(snap.promotions).toHaveLength(1);
        expect(snap.promotions[0]).toMatchObject({
          scope: 'CART',
          discountType: 'PERCENTAGE',
          promotionId: legacy.id,
        });
        expect(snap.promotions[0].value.toFixed(2)).toBe('10.00');
        expect(snap.promotions[0].amount.toFixed(2)).toBe('4.00');
        expect(snap.totalAmount.toFixed(2)).toBe('36.00');
      }
      // the earlier order keeps the title it was sold under
      const firstDetail = await get(
        manager,
        staffPath(w, `/orders/${firstId}`),
      ).expect(200);
      expect(firstDetail.body).toMatchObject({
        data: {
          discountTotal: '4.00',
          promotions: [{ title: 'Legacy cart 10 %', amount: '4.00' }],
        },
      });
      // pre-existing row: still no minimum, still active
      const row = await prisma.promotion.findUniqueOrThrow({
        where: { id: legacy.id },
      });
      expect(row.status).toBe('ACTIVE');
      expect(row.minimumSubtotal === null).toBe(stored === null);
      // a legacy promotion is not wrongly reported as new
      expect(
        (
          await get(manager, staffPath(w, `/promotions/${legacy.id}`)).expect(
            200,
          )
        ).body,
      ).toMatchObject({ data: { needsMinimumSubtotal: true } });
    },
    60_000,
  );

  it('is tenant-isolated: another restaurant cannot read, edit or activate a legacy CART promotion', async () => {
    const a = await seedWorld('tenant-a');
    const b = await seedWorld('tenant-b');
    const legacy = await legacyRow(a, {
      minimumSubtotal: null,
      status: 'INACTIVE',
    });
    const managerB = await staff(b);
    const foreignUrl = staffPath(b, `/promotions/${legacy.id}`);
    expect((await get(managerB, foreignUrl)).status).toBe(404);
    expect(
      (await send('patch', managerB, foreignUrl, { internalName: 'x' })).status,
    ).toBe(404);
    expect(
      (await send('post', managerB, `${foreignUrl}/activate`, {})).status,
    ).toBe(404);
    // A's legacy promotion never prices B's cart
    expect(
      total(await quote(b.genericQr, pickup(b, [one(b.cola.id)])).expect(200)),
    ).toBe('40.00');
  });
});
