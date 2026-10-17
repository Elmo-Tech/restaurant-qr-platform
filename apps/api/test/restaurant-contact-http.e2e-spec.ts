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
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/** Restaurant contact details (DEC-042): `PATCH /restaurants/{id}/contact`, read back through `/auth/me`. */
describe('Restaurant contact (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hasher: PasswordHasherService;
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
    hasher = app.get(PasswordHasherService);
  });

  afterEach(async () => {
    for (const restaurantId of restaurantIds.splice(0)) {
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

  async function setup(role: 'OWNER' | 'CASHIER') {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `rest-${randomUUID()}`,
        name: 'Contact Test',
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
      },
    });
    restaurantIds.push(restaurant.id);
    await prisma.restaurantLocale.create({
      data: { restaurantId: restaurant.id, locale: 'en', isActive: true },
    });
    const email = `contact-${randomUUID()}@example.test`;
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
        restaurantId: restaurant.id,
        userId: user.id,
        role,
        roleId: (await ensureStarterRole(prisma, restaurant.id, role)).id,
        status: 'ACTIVE',
        allBranches: true,
      },
    });
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const cookie = (
      cookies.find((c) => c.startsWith('restaurant_session=')) as string
    ).split(';')[0];
    return { restaurant, cookie };
  }

  const patch = (
    restaurantId: string,
    cookie: string,
    body: Record<string, unknown>,
  ) =>
    request(app.getHttpServer())
      .patch(`/api/v1/restaurants/${restaurantId}/contact`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send(body);

  it('saves, normalizes, merges and clears contact details, and /auth/me returns them', async () => {
    const { restaurant, cookie } = await setup('OWNER');

    const first = await patch(restaurant.id, cookie, {
      phone: '+20 (10) 1234-5678',
      whatsapp: '+20 100 000 0000',
      hotline: '16 512',
      instagramUrl: 'instagram.com/elmo.cafe',
      mapsUrl: 'https://maps.app.goo.gl/abc',
    }).expect(200);
    expect(first.body.data).toMatchObject({
      phone: '+201012345678',
      whatsapp: '+201000000000',
      hotline: '16512',
      instagramUrl: 'https://instagram.com/elmo.cafe',
      mapsUrl: 'https://maps.app.goo.gl/abc',
      facebookUrl: null,
    });

    // A second patch changes only what it sends.
    const second = await patch(restaurant.id, cookie, {
      facebookUrl: 'https://facebook.com/elmo',
      phone: '',
    }).expect(200);
    expect(second.body.data).toMatchObject({
      phone: null,
      whatsapp: '+201000000000',
      facebookUrl: 'https://facebook.com/elmo',
      instagramUrl: 'https://instagram.com/elmo.cafe',
    });

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    const found = (
      me.body.data.memberships as Array<{
        restaurant: { id: string; contact: Record<string, string | null> };
      }>
    ).find((m) => m.restaurant.id === restaurant.id);
    expect(found?.restaurant.contact.whatsapp).toBe('+201000000000');
    expect(found?.restaurant.contact.phone).toBeNull();
  });

  it('rejects invalid values with a stable code and writes nothing', async () => {
    const { restaurant, cookie } = await setup('OWNER');
    const badPhone = await patch(restaurant.id, cookie, {
      phone: '12ab',
      facebookUrl: 'https://facebook.com/ok',
    }).expect(422);
    expect(badPhone.body.error).toMatchObject({
      code: 'INVALID_PHONE',
      details: { field: 'phone' },
    });
    const badLink = await patch(restaurant.id, cookie, {
      instagramUrl: 'https://evil.example/instagram.com',
    }).expect(422);
    expect(badLink.body.error).toMatchObject({
      code: 'INVALID_URL',
      details: { field: 'instagramUrl' },
    });
    await patch(restaurant.id, cookie, {
      websiteUrl: 'http://insecure.example',
    }).expect(422);
    const row = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurant.id },
    });
    expect(row.facebookUrl).toBeNull();
    expect(row.contactPhone).toBeNull();
  });

  it('needs restaurant.manage, CSRF and the right restaurant', async () => {
    const { restaurant, cookie } = await setup('CASHIER');
    await patch(restaurant.id, cookie, { phone: '+201000000000' }).expect(403);
    const owner = await setup('OWNER');
    await request(app.getHttpServer())
      .patch(`/api/v1/restaurants/${owner.restaurant.id}/contact`)
      .set('Cookie', owner.cookie)
      .send({ phone: '+201000000000' })
      .expect(403); // no Origin
    await patch(owner.restaurant.id, cookie, { phone: '+201000000000' }).expect(
      (res) => {
        if (res.status < 400)
          throw new Error('foreign restaurant must be refused');
      },
    );
  });
});
