/* eslint-disable @typescript-eslint/no-unsafe-member-access -- loosely typed JSON response bodies */
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';
import {
  ExtractorUnavailableError,
  MenuImportExtractor,
} from './../src/menu-import/menu-import-extractor';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/**
 * Menu Import (DEC-040) end to end with a FAKE extraction service: the n8n answer
 * is whatever the test hands over, and goes through the real validation, Draft
 * storage, review edits and approval.
 */
class FakeExtractor extends MenuImportExtractor {
  configured = true;
  next: () => Promise<unknown> = () => Promise.resolve(null);
  isConfigured(): boolean {
    return this.configured;
  }
  extract(): Promise<unknown> {
    return this.next();
  }
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

const extraction = {
  schemaVersion: 1,
  status: 'EXTRACTED',
  model: 'fake-model',
  languages: ['en', 'ar'],
  categories: [
    {
      translations: { en: { name: 'Pizza' }, ar: { name: 'بيتزا' } },
      products: [
        {
          translations: {
            en: { name: 'Margherita' },
            ar: { name: 'مارجريتا' },
          },
          price: '90',
          confidence: 'HIGH',
        },
        {
          translations: { en: { name: 'Pepperoni' }, ar: { name: 'بيبروني' } },
          price: null,
          confidence: 'LOW',
          priceOptions: [
            {
              translations: { en: { label: 'Large' }, ar: { label: 'كبير' } },
              price: '150',
            },
            {
              translations: { en: { label: 'Small' }, ar: { label: 'صغير' } },
              price: '100',
            },
          ],
        },
        {
          translations: { en: { name: 'Mystery' } },
          price: null,
          confidence: 'LOW',
        },
      ],
    },
  ],
};

describe('Menu import (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hasher: PasswordHasherService;
  const fake = new FakeExtractor();
  const restaurantIds: string[] = [];
  const userIds: string[] = [];
  const PASSWORD = 'correct horse battery staple';
  const ORIGIN = 'http://localhost:3000';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MenuImportExtractor)
      .useValue(fake)
      .compile();
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
    hasher = app.get(PasswordHasherService);
  });

  beforeEach(() => {
    fake.configured = true;
    fake.next = () => Promise.resolve(extraction);
  });

  afterEach(async () => {
    for (const restaurantId of restaurantIds.splice(0)) {
      await prisma.menuImportJob.deleteMany({ where: { restaurantId } });
      await prisma.productVariantTranslation.deleteMany({
        where: { productVariant: { restaurantId } },
      });
      await prisma.productVariant.deleteMany({ where: { restaurantId } });
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
      await prisma.menuImportJob.deleteMany({
        where: { createdByUserId: userId },
      });
      await prisma.user.delete({ where: { id: userId } });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function seed() {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `rest-${randomUUID()}`,
        name: 'Import Test',
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
      },
    });
    restaurantIds.push(restaurant.id);
    for (const locale of ['en', 'ar']) {
      await prisma.restaurantLocale.create({
        data: { restaurantId: restaurant.id, locale, isActive: true },
      });
    }
    const menu = await prisma.menu.create({
      data: {
        restaurantId: restaurant.id,
        nameInternal: 'Main',
        displayOrder: 0,
        status: 'ACTIVE',
        isPrimary: true,
        translations: { create: [{ locale: 'en', name: 'Main' }] },
      },
    });
    // An existing "Pizza" category holding an existing "Margherita".
    const category = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        menuId: menu.id,
        status: 'ACTIVE',
        displayOrder: 0,
        translations: { create: [{ locale: 'en', name: 'pizza' }] },
      },
    });
    await prisma.product.create({
      data: {
        publicId: `product-${randomUUID()}`,
        restaurantId: restaurant.id,
        categoryId: category.id,
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        basePrice: '80.00',
        allowCustomerNotes: true,
        featured: false,
        displayOrder: 0,
        translations: { create: [{ locale: 'en', name: 'MARGHERITA' }] },
      },
    });
    return { restaurant, menu, category };
  }

  async function login(restaurantId: string, role: 'OWNER' | 'CASHIER') {
    const email = `import-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email.toLowerCase(),
        passwordHash: await hasher.hashPassword(PASSWORD),
        status: 'ACTIVE',
      },
    });
    userIds.push(user.id);
    await prisma.restaurantMembership.create({
      data: {
        restaurantId,
        userId: user.id,
        role,
        roleId: (await ensureStarterRole(prisma, restaurantId, role)).id,
        status: 'ACTIVE',
        allBranches: true,
      },
    });
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const setCookie = response.headers['set-cookie'] as unknown as string[];
    const cookie = setCookie.find((c) => c.startsWith('restaurant_session='));
    if (!cookie) throw new Error('no session cookie');
    return cookie.split(';')[0];
  }

  const url = (restaurantId: string, rest = '') =>
    `/api/v1/restaurants/${restaurantId}/menu-imports${rest}`;

  const upload = (
    restaurantId: string,
    cookie: string,
    menuId: string,
    file: Buffer = PNG,
    name = 'menu.png',
  ) =>
    request(app.getHttpServer())
      .post(url(restaurantId))
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .field('targetMenuId', menuId)
      .attach('file', file, name);

  const post = (
    path: string,
    cookie: string,
    body: Record<string, unknown> = {},
  ) =>
    request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send(body);
  const patch = (path: string, cookie: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send(body);
  const get = (path: string, cookie: string) =>
    request(app.getHttpServer()).get(path).set('Cookie', cookie);

  type Obj = Record<string, any>;
  const data = (res: request.Response): Obj => (res.body as { data: Obj }).data;
  const errorCode = (res: request.Response): string =>
    (res.body as { error: { code: string } }).error.code;

  async function waitFor(
    restaurantId: string,
    cookie: string,
    publicId: string,
    status: string,
  ) {
    for (let i = 0; i < 50; i += 1) {
      const res = await get(url(restaurantId, `/${publicId}`), cookie).expect(
        200,
      );
      if (data(res).status === status) return data(res);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`job never reached ${status}`);
  }

  async function readyDraft() {
    const { restaurant, menu } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');
    const started = await upload(restaurant.id, cookie, menu.id).expect(202);
    const publicId = data(started).publicId as string;
    await waitFor(restaurant.id, cookie, publicId, 'READY_FOR_REVIEW');
    const draft = data(
      await get(url(restaurant.id, `/${publicId}/draft`), cookie).expect(200),
    );
    return { restaurant, menu, cookie, publicId, draft };
  }

  it('turns an upload into a Draft, flagging blockers and excluding what already exists', async () => {
    const { draft } = await readyDraft();
    expect(draft.defaultLocale).toBe('en');
    expect(draft.job.detectedLocales).toEqual(
      expect.arrayContaining(['en', 'ar']),
    );
    const category = draft.categories[0] as Obj;
    expect(category.useExisting).toBe(true);
    const byName = (name: string) =>
      (category.products as Obj[]).find((p) => p.names.en === name) as Obj;
    expect(byName('Margherita').included).toBe(false);
    expect(byName('Margherita').flags).toContain('ALREADY_EXISTS');
    expect(byName('Pepperoni').sizes).toHaveLength(2);
    expect(byName('Pepperoni').flags).not.toContain('MISSING_PRICE');
    expect(byName('Mystery').flags).toEqual(
      expect.arrayContaining(['MISSING_PRICE', 'LOW_CONFIDENCE']),
    );
    expect(draft.blockerCount).toBe(1);
  });

  it('refuses approval while a price is missing, then creates everything once fixed', async () => {
    const { restaurant, menu, cookie, publicId, draft } = await readyDraft();
    const approve = url(restaurant.id, `/${publicId}/approve`);

    const blocked = await post(approve, cookie, {
      productStatus: 'ACTIVE',
    }).expect(422);
    expect(errorCode(blocked)).toBe('IMPORT_DRAFT_INCOMPLETE');

    const mystery = (draft.categories[0].products as Obj[]).find(
      (p) => p.names.en === 'Mystery',
    ) as Obj;
    await patch(
      url(restaurant.id, `/${publicId}/products/${mystery.id as string}`),
      cookie,
      {
        price: '35.5',
      },
    ).expect(204);

    const done = await post(approve, cookie, {
      productStatus: 'INACTIVE',
    }).expect(200);
    expect(data(done)).toEqual({ categoriesCreated: 0, productsCreated: 2 });

    const products = await prisma.product.findMany({
      where: { restaurantId: restaurant.id },
      include: {
        variants: {
          include: { translations: true },
          orderBy: { displayOrder: 'asc' },
        },
        translations: true,
      },
    });
    expect(products).toHaveLength(3); // the existing Margherita + 2 imported
    const pepperoni = products.find((p) =>
      p.translations.some((t) => t.name === 'Pepperoni'),
    ) as (typeof products)[number];
    expect(pepperoni.status).toBe('INACTIVE');
    expect(pepperoni.basePrice.toFixed(2)).toBe('100.00');
    expect(pepperoni.variants.map((v) => v.price.toFixed(2))).toEqual([
      '100.00',
      '150.00',
    ]);
    expect(pepperoni.variants.map((v) => v.isDefault)).toEqual([true, false]);
    expect(
      pepperoni.variants[0].translations.map((t) => t.name).sort(),
    ).toEqual(['Small', 'صغير'].sort());
    const mysteryProduct = products.find((p) =>
      p.translations.some((t) => t.name === 'Mystery'),
    ) as (typeof products)[number];
    expect(mysteryProduct.basePrice.toFixed(2)).toBe('35.50');
    expect(mysteryProduct.variants).toHaveLength(0);
    // Added to the matched category, not a duplicate one.
    expect(await prisma.category.count({ where: { menuId: menu.id } })).toBe(1);

    const again = await post(approve, cookie, {
      productStatus: 'ACTIVE',
    }).expect(409);
    expect(errorCode(again)).toBe('IMPORT_ALREADY_APPROVED');
    expect(
      await prisma.product.count({ where: { restaurantId: restaurant.id } }),
    ).toBe(3);
  });

  it('creates a new category when the match is switched off', async () => {
    const { restaurant, menu, cookie, publicId, draft } = await readyDraft();
    const category = draft.categories[0] as Obj;
    await patch(
      url(restaurant.id, `/${publicId}/categories/${category.id as string}`),
      cookie,
      {
        useExisting: false,
      },
    ).expect(204);
    const mystery = (category.products as Obj[]).find(
      (p) => p.names.en === 'Mystery',
    ) as Obj;
    await patch(
      url(restaurant.id, `/${publicId}/products/${mystery.id as string}`),
      cookie,
      {
        price: '10',
      },
    ).expect(204);
    const done = await post(
      url(restaurant.id, `/${publicId}/approve`),
      cookie,
      {
        productStatus: 'ACTIVE',
      },
    ).expect(200);
    expect(data(done).categoriesCreated).toBe(1);
    expect(await prisma.category.count({ where: { menuId: menu.id } })).toBe(2);
  });

  it('discarding clears the Draft and frees the restaurant for a new import', async () => {
    const { restaurant, menu, cookie, publicId } = await readyDraft();
    await post(url(restaurant.id, `/${publicId}/discard`), cookie).expect(204);
    const job = await get(url(restaurant.id, `/${publicId}`), cookie).expect(
      200,
    );
    expect(data(job).status).toBe('DISCARDED');
    await get(url(restaurant.id, `/${publicId}/draft`), cookie).expect(409);
    await upload(restaurant.id, cookie, menu.id).expect(202);
  });

  it('allows only one running import per restaurant', async () => {
    const { restaurant, menu } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');
    let release: (value: unknown) => void = () => undefined;
    fake.next = () => new Promise((resolve) => (release = resolve));
    const first = await upload(restaurant.id, cookie, menu.id).expect(202);
    const second = await upload(restaurant.id, cookie, menu.id).expect(409);
    expect(errorCode(second)).toBe('IMPORT_ALREADY_RUNNING');
    release(extraction);
    await waitFor(
      restaurant.id,
      cookie,
      data(first).publicId as string,
      'READY_FOR_REVIEW',
    );
  });

  it('fails the job with stable codes when the model answer is unusable or the service is down', async () => {
    const { restaurant, menu } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');

    fake.next = () =>
      Promise.resolve({
        schemaVersion: 1,
        status: 'EXTRACTED',
        categories: [],
      });
    const empty = await upload(restaurant.id, cookie, menu.id).expect(202);
    const failedEmpty = await waitFor(
      restaurant.id,
      cookie,
      data(empty).publicId as string,
      'FAILED',
    );
    expect(failedEmpty.errorCode).toBe('EMPTY_RESULT');

    fake.next = () => Promise.reject(new ExtractorUnavailableError('down'));
    const down = await upload(restaurant.id, cookie, menu.id).expect(202);
    const failedDown = await waitFor(
      restaurant.id,
      cookie,
      data(down).publicId as string,
      'FAILED',
    );
    expect(failedDown.errorCode).toBe('AI_UNAVAILABLE');
  });

  it('turns a stuck job into EXTRACTION_TIMEOUT when read', async () => {
    const { restaurant, menu } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');
    const membership = await prisma.restaurantMembership.findFirstOrThrow({
      where: { restaurantId: restaurant.id },
    });
    const stuck = await prisma.menuImportJob.create({
      data: {
        publicId: `import-${randomUUID()}`,
        restaurantId: restaurant.id,
        targetMenuId: menu.id,
        createdByUserId: membership.userId,
        status: 'PROCESSING',
        sourceType: 'IMAGE',
        sourceFileName: 'old.png',
        sourceMimeType: 'image/png',
        sourceSizeBytes: 10,
        languageHint: 'auto',
        startedAt: new Date(Date.now() - 11 * 60 * 1000),
      },
    });
    const res = await get(
      url(restaurant.id, `/${stuck.publicId}`),
      cookie,
    ).expect(200);
    expect(data(res).status).toBe('FAILED');
    expect(data(res).errorCode).toBe('EXTRACTION_TIMEOUT');
  });

  it('rejects bad files, a foreign menu, an unconfigured service and missing authority', async () => {
    const { restaurant, menu } = await seed();
    const other = await seed();
    const cookie = await login(restaurant.id, 'OWNER');

    const bad = await upload(
      restaurant.id,
      cookie,
      menu.id,
      Buffer.from('not a menu'),
      'menu.png',
    ).expect(422);
    expect(errorCode(bad)).toBe('IMPORT_FILE_INVALID');
    const big = Buffer.concat([
      Buffer.from('%PDF-1.7'),
      Buffer.alloc(10 * 1024 * 1024),
    ]);
    const huge = await upload(restaurant.id, cookie, menu.id, big, 'big.pdf');
    expect(huge.status).toBe(413);
    await upload(restaurant.id, cookie, other.menu.id).expect(404);

    fake.configured = false;
    const off = await upload(restaurant.id, cookie, menu.id).expect(503);
    expect(errorCode(off)).toBe('AI_UNAVAILABLE');
    fake.configured = true;

    await request(app.getHttpServer())
      .post(url(restaurant.id))
      .set('Cookie', cookie)
      .field('targetMenuId', menu.id)
      .attach('file', PNG, 'menu.png')
      .expect(403); // no Origin: CSRF
    const cashier = await login(restaurant.id, 'CASHIER');
    await upload(restaurant.id, cashier, menu.id).expect(403);
    await get(url(restaurant.id), cashier).expect(403);
  });

  it('never exposes a job of another restaurant', async () => {
    const a = await seed();
    const b = await seed();
    const cookieA = await login(a.restaurant.id, 'OWNER');
    const cookieB = await login(b.restaurant.id, 'OWNER');
    const started = await upload(a.restaurant.id, cookieA, a.menu.id).expect(
      202,
    );
    const publicId = data(started).publicId as string;
    await waitFor(a.restaurant.id, cookieA, publicId, 'READY_FOR_REVIEW');
    await get(url(b.restaurant.id, `/${publicId}`), cookieB).expect(404);
    await get(url(b.restaurant.id, `/${publicId}/draft`), cookieB).expect(404);
    await post(url(b.restaurant.id, `/${publicId}/approve`), cookieB, {
      productStatus: 'ACTIVE',
    }).expect(404);
    const list = await get(url(b.restaurant.id), cookieB).expect(200);
    expect(data(list) as unknown as Obj[]).toHaveLength(0);
  });

  it('accepts a menu written in only one language: no blocker, the default language reuses the name', async () => {
    const { restaurant, menu } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');
    fake.next = () =>
      Promise.resolve({
        schemaVersion: 1,
        status: 'EXTRACTED',
        languages: ['ar'],
        categories: [
          {
            translations: { ar: { name: 'باسطة' } },
            products: [
              {
                translations: { ar: { name: 'باسطة كريمة' } },
                price: '20',
                confidence: 'high',
                priceOptions: [
                  { translations: { ar: { label: 'صغير' } }, price: '20' },
                  { translations: { ar: { label: 'كبير' } }, price: '30' },
                ],
              },
            ],
          },
        ],
      });
    const started = await upload(restaurant.id, cookie, menu.id).expect(202);
    const publicId = data(started).publicId as string;
    await waitFor(restaurant.id, cookie, publicId, 'READY_FOR_REVIEW');
    const draft = data(
      await get(url(restaurant.id, `/${publicId}/draft`), cookie).expect(200),
    );
    expect(draft.blockerCount).toBe(0);
    const product = draft.categories[0].products[0] as Obj;
    expect(product.flags).toEqual([]);

    await post(url(restaurant.id, `/${publicId}/approve`), cookie, {
      productStatus: 'ACTIVE',
    }).expect(200);
    const created = await prisma.product.findFirstOrThrow({
      where: {
        restaurantId: restaurant.id,
        translations: { some: { name: 'باسطة كريمة' } },
      },
      include: {
        translations: true,
        variants: { include: { translations: true } },
      },
    });
    expect(created.translations.map((t) => t.locale).sort()).toEqual([
      'ar',
      'en',
    ]);
    expect(created.variants).toHaveLength(2);
    for (const variant of created.variants) {
      expect(variant.translations.map((t) => t.locale).sort()).toEqual([
        'ar',
        'en',
      ]);
    }
  });
});
