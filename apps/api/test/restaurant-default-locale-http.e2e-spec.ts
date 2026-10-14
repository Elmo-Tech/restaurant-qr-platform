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
 * DEC-037: the Restaurant admin chooses the default language. Proves, through
 * the real HTTP chain down to PostgreSQL, that `POST .../locales/{locale}/default`
 * and `GET .../locales/{locale}/default-readiness`:
 *  - change `restaurants.defaultLocale` and re-point branch names atomically;
 *  - refuse (writing nothing) while an entity has no name in the language;
 *  - refuse a language that is not enabled;
 *  - are Restaurant-structural (CSRF, `restaurant.manage`, all-branches scope);
 *  - never act on a foreign Restaurant.
 *
 * Temporary rows are removed in `afterEach` regardless of outcome.
 */
describe('Restaurant default locale (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHasherService: PasswordHasherService;
  const createdRestaurantIds: string[] = [];
  const createdUserIds: string[] = [];

  const PASSWORD = 'correct horse battery staple';
  const APPROVED_ORIGIN = 'http://localhost:3000';

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
    passwordHasherService = app.get(PasswordHasherService);
  });

  afterEach(async () => {
    for (const restaurantId of createdRestaurantIds.splice(0)) {
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
    for (const userId of createdUserIds.splice(0)) {
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function createTestUser(): Promise<{ id: string; email: string }> {
    const email = `default-locale-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email.toLowerCase(),
        passwordHash: await passwordHasherService.hashPassword(PASSWORD),
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(user.id);
    return { id: user.id, email };
  }

  /** A Restaurant (default `en`, `en` + `ar` enabled) with one Branch and one Menu, each named in English only. */
  async function createRestaurant(options: { arabicEnabled?: boolean } = {}) {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `rest-${randomUUID()}`,
        name: 'Cairo Bites',
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
      },
    });
    createdRestaurantIds.push(restaurant.id);
    await prisma.restaurantLocale.create({
      data: { restaurantId: restaurant.id, locale: 'en', isActive: true },
    });
    if (options.arabicEnabled !== false) {
      await prisma.restaurantLocale.create({
        data: { restaurantId: restaurant.id, locale: 'ar', isActive: true },
      });
    }

    const branch = await prisma.branch.create({
      data: {
        publicId: `branch-${randomUUID()}`,
        restaurantId: restaurant.id,
        name: 'Maadi',
        status: 'ACTIVE',
        timezone: 'Africa/Cairo',
        translations: { create: [{ locale: 'en', name: 'Maadi' }] },
      },
    });
    const menu = await prisma.menu.create({
      data: {
        restaurantId: restaurant.id,
        nameInternal: 'Main Menu',
        displayOrder: 0,
        status: 'ACTIVE',
        isPrimary: true,
        translations: { create: [{ locale: 'en', name: 'Main Menu' }] },
      },
    });
    return { restaurant, branch, menu };
  }

  async function createMembership(params: {
    restaurantId: string;
    userId: string;
    role?: 'OWNER' | 'MANAGER' | 'CASHIER';
    allBranches?: boolean;
    branchIds?: string[];
  }) {
    const role = params.role ?? 'OWNER';
    const membership = await prisma.restaurantMembership.create({
      data: {
        restaurantId: params.restaurantId,
        userId: params.userId,
        role,
        roleId: (await ensureStarterRole(prisma, params.restaurantId, role)).id,
        status: 'ACTIVE',
        allBranches: params.allBranches ?? true,
      },
    });
    for (const branchId of params.branchIds ?? []) {
      await prisma.restaurantMembershipBranch.create({
        data: { restaurantMembershipId: membership.id, branchId },
      });
    }
    return membership;
  }

  async function loginAndGetCookie(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const setCookie = response.headers['set-cookie'] as unknown as string[];
    const sessionCookie = setCookie.find((cookie) =>
      cookie.startsWith('restaurant_session='),
    );
    if (!sessionCookie) throw new Error('expected a restaurant_session cookie');
    return sessionCookie.split(';')[0];
  }

  function makeDefault(params: {
    restaurantId: string;
    locale: string;
    cookiePair: string;
    origin?: string | null;
  }) {
    let req = request(app.getHttpServer())
      .post(
        `/api/v1/restaurants/${params.restaurantId}/locales/${params.locale}/default`,
      )
      .set('Cookie', params.cookiePair);
    if (params.origin !== null) {
      req = req.set('Origin', params.origin ?? APPROVED_ORIGIN);
    }
    return req.send();
  }

  async function nameArabic(branchId: string, menuId: string) {
    await prisma.branchTranslation.create({
      data: { branchId, locale: 'ar', name: 'المعادي' },
    });
    await prisma.menuTranslation.create({
      data: { menuId, locale: 'ar', name: 'القائمة الرئيسية' },
    });
  }

  it('changes the default and re-points branch names once every entity is named', async () => {
    const { id: userId, email } = await createTestUser();
    const { restaurant, branch, menu } = await createRestaurant();
    await createMembership({ restaurantId: restaurant.id, userId });
    await nameArabic(branch.id, menu.id);
    const cookiePair = await loginAndGetCookie(email);

    const response = await makeDefault({
      restaurantId: restaurant.id,
      locale: 'ar',
      cookiePair,
    }).expect(200);

    expect(response.body).toEqual({
      data: {
        defaultLocale: 'ar',
        locales: [
          { locale: 'en', isDefault: false, isActive: true },
          { locale: 'ar', isDefault: true, isActive: true },
        ],
      },
    });
    const stored = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurant.id },
      select: { defaultLocale: true },
    });
    expect(stored.defaultLocale).toBe('ar');
    const storedBranch = await prisma.branch.findUniqueOrThrow({
      where: { id: branch.id },
      select: { name: true },
    });
    expect(storedBranch.name).toBe('المعادي');
    // Nothing is deleted: the English names remain.
    expect(
      await prisma.branchTranslation.count({
        where: { branchId: branch.id, locale: 'en' },
      }),
    ).toBe(1);
  });

  it('refuses with the counts while a name is missing, writing nothing', async () => {
    const { id: userId, email } = await createTestUser();
    const { restaurant, branch } = await createRestaurant();
    await createMembership({ restaurantId: restaurant.id, userId });
    // Only the branch is named in Arabic; the menu is not.
    await prisma.branchTranslation.create({
      data: { branchId: branch.id, locale: 'ar', name: 'المعادي' },
    });
    const cookiePair = await loginAndGetCookie(email);

    const response = await makeDefault({
      restaurantId: restaurant.id,
      locale: 'ar',
      cookiePair,
    }).expect(409);

    expect(response.body).toMatchObject({
      error: {
        code: 'DEFAULT_LOCALE_INCOMPLETE',
        totalMissing: 1,
        missing: { menus: 1, branches: 0, products: 0 },
      },
    });
    const stored = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurant.id },
      select: { defaultLocale: true },
    });
    expect(stored.defaultLocale).toBe('en');
    const storedBranch = await prisma.branch.findUniqueOrThrow({
      where: { id: branch.id },
      select: { name: true },
    });
    expect(storedBranch.name).toBe('Maadi');
  });

  it('readiness reports the same counts without writing', async () => {
    const { id: userId, email } = await createTestUser();
    const { restaurant } = await createRestaurant();
    await createMembership({ restaurantId: restaurant.id, userId });
    const cookiePair = await loginAndGetCookie(email);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/restaurants/${restaurant.id}/locales/ar/default-readiness`)
      .set('Cookie', cookiePair)
      .expect(200);

    expect(response.body).toMatchObject({
      data: {
        locale: 'ar',
        ready: false,
        totalMissing: 2,
        missing: { menus: 1, branches: 1 },
      },
    });
  });

  it('refuses a language that is not enabled for the Restaurant', async () => {
    const { id: userId, email } = await createTestUser();
    const { restaurant, branch, menu } = await createRestaurant({
      arabicEnabled: false,
    });
    await createMembership({ restaurantId: restaurant.id, userId });
    await nameArabic(branch.id, menu.id);
    const cookiePair = await loginAndGetCookie(email);

    const response = await makeDefault({
      restaurantId: restaurant.id,
      locale: 'ar',
      cookiePair,
    }).expect(409);

    expect(response.body).toMatchObject({ error: { code: 'LOCALE_NOT_ACTIVE' } });
  });

  it('rejects a cross-origin request (CSRF) before doing anything', async () => {
    const { id: userId, email } = await createTestUser();
    const { restaurant, branch, menu } = await createRestaurant();
    await createMembership({ restaurantId: restaurant.id, userId });
    await nameArabic(branch.id, menu.id);
    const cookiePair = await loginAndGetCookie(email);

    await makeDefault({
      restaurantId: restaurant.id,
      locale: 'ar',
      cookiePair,
      origin: 'https://evil.example',
    }).expect(403);

    const stored = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurant.id },
      select: { defaultLocale: true },
    });
    expect(stored.defaultLocale).toBe('en');
  });

  it('a Branch-scoped manager cannot change the Restaurant default', async () => {
    const { id: userId, email } = await createTestUser();
    const { restaurant, branch, menu } = await createRestaurant();
    await createMembership({
      restaurantId: restaurant.id,
      userId,
      role: 'MANAGER',
      allBranches: false,
      branchIds: [branch.id],
    });
    await nameArabic(branch.id, menu.id);
    const cookiePair = await loginAndGetCookie(email);

    await makeDefault({
      restaurantId: restaurant.id,
      locale: 'ar',
      cookiePair,
    }).expect(403);

    const stored = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurant.id },
      select: { defaultLocale: true },
    });
    expect(stored.defaultLocale).toBe('en');
  });

  it('a CASHIER lacks restaurant.manage', async () => {
    const { id: userId, email } = await createTestUser();
    const { restaurant, branch, menu } = await createRestaurant();
    await createMembership({ restaurantId: restaurant.id, userId, role: 'CASHIER' });
    await nameArabic(branch.id, menu.id);
    const cookiePair = await loginAndGetCookie(email);

    await makeDefault({
      restaurantId: restaurant.id,
      locale: 'ar',
      cookiePair,
    }).expect(403);
  });

  it("cannot change another Restaurant's default through a foreign route id", async () => {
    const { id: userId, email } = await createTestUser();
    const own = await createRestaurant();
    const foreign = await createRestaurant();
    await createMembership({ restaurantId: own.restaurant.id, userId });
    await nameArabic(foreign.branch.id, foreign.menu.id);
    const cookiePair = await loginAndGetCookie(email);

    await makeDefault({
      restaurantId: foreign.restaurant.id,
      locale: 'ar',
      cookiePair,
    }).expect(404);

    const stored = await prisma.restaurant.findUniqueOrThrow({
      where: { id: foreign.restaurant.id },
      select: { defaultLocale: true },
    });
    expect(stored.defaultLocale).toBe('en');
  });
});
