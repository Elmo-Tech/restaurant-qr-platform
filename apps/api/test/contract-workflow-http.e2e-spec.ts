import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import type { Prisma } from '../src/generated/prisma/client';
import { PasswordHasherService } from '../src/auth/password/password-hasher.service';
import { validationExceptionFactory } from '../src/common/http/validation-exception.factory';

const disposable = process.env.CONTRACT_E2E_DISPOSABLE === '1';
const suite = disposable ? describe : describe.skip;
jest.setTimeout(60000);
type ContractResponse = {
  data: {
    isDraft: boolean;
    revision: number;
    documentText: string | null;
    terms: { restaurant: { ownerContact: { fullName: string } } };
    assets: { seal: string | null; signature: string | null };
  };
};

suite('contract editing and signing (real HTTP and PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let subscriptionId: string;
  let cookie: string;
  const origin = 'http://localhost:3001';
  const email = `contract-${randomUUID()}@example.test`;
  const password = 'local-test-password-only';
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZ8AAAAASUVORK5CYII=',
    'base64',
  );

  beforeAll(async () => {
    const db = new URL(process.env.DATABASE_URL ?? '');
    if (db.hostname !== 'localhost' || !db.pathname.includes('contracts_local'))
      throw new Error('Use the disposable local contracts database only');
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
    const hasher = app.get(PasswordHasherService);
    const admin = await prisma.platformAdmin.create({
      data: {
        email,
        emailNormalized: email,
        displayName: 'Local tester',
        status: 'ACTIVE',
        passwordHash: await hasher.hashPassword(password),
      },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `local-${randomUUID()}`,
        name: 'Makhboz local test',
        status: 'ACTIVE',
        defaultLocale: 'ar',
        currencyCode: 'EGP',
        locales: { create: { locale: 'ar', isActive: true } },
        ownerContact: {
          create: { fullName: 'Test contact', phone: '+201000000000' },
        },
        slugs: {
          create: {
            slug: `makhboz-${randomUUID().slice(0, 8)}`,
            isCurrent: true,
          },
        },
      },
    });
    const pkg = await prisma.package.create({
      data: {
        name: email,
        nameNormalized: email,
        nameEn: email,
        nameEnNormalized: email,
      },
    });
    const sub = await prisma.subscription.create({
      data: {
        restaurantId: restaurant.id,
        packageId: pkg.id,
        packageName: 'Pro',
        period: 'YEARLY',
        startsAt: new Date('2026-11-10'),
        endsAt: new Date('2027-11-10'),
        currencyCode: 'EGP',
        listPrice: '4000',
        finalPrice: '4000',
        createdByAdminId: admin.id,
        createdByEmail: email,
        contract: {
          create: {
            number: `LOCAL-${randomUUID()}`,
            terms: {
              number: 'LOCAL',
              restaurant: {
                name: 'Makhboz local test',
                countryCode: 'EG',
                ownerEmails: [],
              },
              package: { name: 'Pro', features: [] },
              period: 'YEARLY',
              startsAt: '2026-11-10',
              endsAt: '2027-11-10',
              pricing: {
                currencyCode: 'EGP',
                listPrice: '4000.00',
                finalPrice: '4000.00',
                offer: null,
                discount: null,
              },
              graceDays: 7,
              notes: null,
              issuedBy: email,
            },
          },
        },
      },
    });
    subscriptionId = sub.id;
    const login = await request(app.getHttpServer())
      .post('/api/v1/platform/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires a platform session and trusted origin', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/platform/subscriptions/${subscriptionId}/contract`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${subscriptionId}/contract/reopen`)
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .expect(403);
  });

  it('reopens the existing snapshot, saves an edit, and freezes signing images on issue', async () => {
    const base = `/api/v1/platform/subscriptions/${subscriptionId}/contract`;
    await request(app.getHttpServer())
      .post(`${base}/reopen`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .expect(204);
    const first = await request(app.getHttpServer())
      .get(base)
      .set('Cookie', cookie)
      .expect(200);
    const firstData = (first.body as ContractResponse).data;
    expect(firstData.isDraft).toBe(true);
    expect(firstData.terms.restaurant.ownerContact.fullName).toBe(
      'Test contact',
    );
    expect(firstData.assets).toEqual({ seal: null, signature: null });
    await request(app.getHttpServer())
      .put(`${base}/images/seal`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .field('revision', String(firstData.revision))
      .attach('image', png, { filename: 'seal.png', contentType: 'image/png' })
      .expect(204);
    await request(app.getHttpServer())
      .put(`${base}/images/signature`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .field('revision', String(firstData.revision + 1))
      .attach('image', png, {
        filename: 'signature.png',
        contentType: 'image/png',
      })
      .expect(204);
    const text = 'عقد مخبوز التجريبي\nنص قابل للتعديل';
    await request(app.getHttpServer())
      .put(`${base}/draft`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ revision: firstData.revision + 2, locale: 'ar', text })
      .expect(204);
    await request(app.getHttpServer())
      .post(`${base}/issue`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ revision: firstData.revision, locale: 'ar', text })
      .expect(409);
    const saved = await request(app.getHttpServer())
      .get(base)
      .set('Cookie', cookie)
      .expect(200);
    const savedData = (saved.body as ContractResponse).data;
    expect(savedData.documentText).toBe(text);
    await request(app.getHttpServer())
      .post(`${base}/issue`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ revision: savedData.revision, locale: 'ar', text })
      .expect(204);
    const issued = await request(app.getHttpServer())
      .get(base)
      .set('Cookie', cookie)
      .expect(200);
    const issuedData = (issued.body as ContractResponse).data;
    expect(issuedData.isDraft).toBe(false);
    await request(app.getHttpServer())
      .post(`${base}/reopen`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .expect(409);
    expect(issuedData.assets.seal).toMatch(/^data:image\/png;base64,/);
    expect(issuedData.assets.signature).toMatch(/^data:image\/png;base64,/);
    await request(app.getHttpServer())
      .put(`${base}/draft`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({
        revision: issuedData.revision,
        locale: 'ar',
        text: 'tampered',
      })
      .expect(409);
    await request(app.getHttpServer())
      .put(`${base}/images/seal`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .field('revision', String(issuedData.revision))
      .attach('image', Buffer.from('not an image'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
    await request(app.getHttpServer())
      .put(`${base}/images/seal`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .field('revision', String(issuedData.revision))
      .attach('image', Buffer.concat([png, Buffer.from([0])]), {
        filename: 'new-seal.png',
        contentType: 'image/png',
      })
      .expect(409);
    const original = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      include: { contract: true },
    });
    if (!original.contract) throw new Error('Expected test contract');
    const next = await prisma.subscription.create({
      data: {
        restaurantId: original.restaurantId,
        packageId: original.packageId,
        packageName: original.packageName,
        period: 'YEARLY',
        startsAt: new Date('2028-01-01'),
        endsAt: new Date('2029-01-01'),
        currencyCode: original.currencyCode,
        listPrice: original.listPrice,
        finalPrice: original.finalPrice,
        createdByEmail: email,
        contract: {
          create: {
            number: `LOCAL-${randomUUID()}`,
            isDraft: true,
            terms: original.contract.terms as Prisma.InputJsonObject,
          },
        },
      },
    });
    const nextBase = `/api/v1/platform/subscriptions/${next.id}/contract`;
    const empty = await request(app.getHttpServer())
      .get(nextBase)
      .set('Cookie', cookie)
      .expect(200);
    expect((empty.body as ContractResponse).data.assets).toEqual({
      seal: null,
      signature: null,
    });
    await request(app.getHttpServer())
      .put(`${nextBase}/images/seal`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .field('revision', '0')
      .attach('image', Buffer.concat([png, Buffer.from([0])]), {
        filename: 'other.png',
        contentType: 'image/png',
      })
      .expect(204);
    await request(app.getHttpServer())
      .put(`${nextBase}/images/signature`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .field('revision', '0')
      .attach('image', png, {
        filename: 'signature.png',
        contentType: 'image/png',
      })
      .expect(409);
    const nextDraft = await request(app.getHttpServer())
      .get(nextBase)
      .set('Cookie', cookie)
      .expect(200);
    expect(
      (nextDraft.body as ContractResponse).data.assets.signature,
    ).toBeNull();
    const again = await request(app.getHttpServer())
      .get(base)
      .set('Cookie', cookie)
      .expect(200);
    expect((again.body as ContractResponse).data.assets).toEqual(
      issuedData.assets,
    );
    expect(
      (
        await prisma.subscription.findUniqueOrThrow({
          where: { id: subscriptionId },
        })
      ).finalPrice.toFixed(2),
    ).toBe('4000.00');
  });
});
