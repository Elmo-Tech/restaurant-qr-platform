import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';
import { AiSettingsService } from './../src/ai-settings/ai-settings.service';
import {
  ExtractorUnavailableError,
  N8nMenuImportExtractor,
} from './../src/menu-import/menu-import-extractor';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

jest.setTimeout(30000);

/**
 * Menu Import with the DIRECT engine (DEC-059) end to end: the real Backend extractor talks to a FAKE Gemini
 * server on this machine (`AI_CHAT_COMPLETIONS_URL`), with keys saved through the real AI settings service. The
 * answer goes through the real validation, Draft storage and review. No real model is ever called.
 */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

const KEY_A = 'e2e-key-aaaaaaaaaaaaaaaaaaaaaaaa';
const KEY_B = 'e2e-key-bbbbbbbbbbbbbbbbbbbbbbbb';

const modelAnswer = (productName: string) =>
  JSON.stringify({
    languages: ['en'],
    categories: [
      {
        translations: { en: { name: 'Wraps' } },
        products: [
          {
            translations: { en: { name: productName } },
            price: '45',
            priceOptions: [],
            confidence: 'high',
          },
        ],
      },
    ],
  });

interface Seen {
  key: string;
  model: string;
  text: string;
}

describe('Menu import, DIRECT engine (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hasher: PasswordHasherService;
  let ai: AiSettingsService;
  let server: Server;
  const restaurantIds: string[] = [];
  const userIds: string[] = [];
  const PASSWORD = 'correct horse battery staple';
  const ORIGIN = 'http://localhost:3000';

  let n8nCalls = 0;
  // What the fake Gemini server does next, and what it was asked.
  let seen: Seen[] = [];
  let respond: (
    seen: Seen,
    number: number,
  ) => { status: number; body: unknown } = () => ({
    status: 200,
    body: null,
  });

  const completion = (text: string) => ({
    status: 200,
    body: { choices: [{ message: { content: text }, finish_reason: 'stop' }] },
  });

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  }

  beforeAll(async () => {
    server = createServer((req, res) => {
      void readBody(req).then((raw) => {
        const parsed = JSON.parse(raw) as {
          model: string;
          messages: { content: unknown }[];
        };
        const entry: Seen = {
          key: (req.headers.authorization ?? '').replace('Bearer ', ''),
          model: parsed.model,
          text: JSON.stringify(parsed.messages[1].content),
        };
        seen.push(entry);
        const answer = respond(entry, seen.length);
        res.writeHead(answer.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(answer.body));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as AddressInfo;

    // Set before the app starts: the configuration is read at boot.
    process.env.AI_KEYS_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.AI_CHAT_COMPLETIONS_URL = `http://127.0.0.1:${port}/chat`;

    // The n8n engine is faked, so this test can never reach a real n8n (the .env of a developer may point at one).
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(N8nMenuImportExtractor)
      .useValue({
        isConfigured: () => true,
        extract: () => {
          n8nCalls += 1;
          return Promise.reject(
            new ExtractorUnavailableError('fake n8n is down'),
          );
        },
      })
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
    ai = app.get(AiSettingsService);
  });

  beforeEach(async () => {
    seen = [];
    n8nCalls = 0;
    respond = () => completion(modelAnswer('Falafel Wrap'));
    await prisma.platformAiKey.deleteMany({});
    await ai.updateSettings({
      engine: 'N8N',
      model: 'e2e-model',
      fallbackModel: 'e2e-fallback',
    });
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
      await prisma.restaurantFeature.deleteMany({ where: { restaurantId } });
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
    await prisma.platformAiKey.deleteMany({});
    await ai.updateSettings({ engine: 'N8N' });
    await app.close();
    await new Promise((resolve) => server.close(resolve));
  });

  async function seed() {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `rest-${randomUUID()}`,
        name: 'Direct Import Test',
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
        features: { create: [{ feature: 'MENU_IMPORT', enabled: true }] },
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
    return { restaurant, menu };
  }

  async function login(restaurantId: string) {
    const email = `direct-${randomUUID()}@example.test`;
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
        role: 'OWNER',
        roleId: (await ensureStarterRole(prisma, restaurantId, 'OWNER')).id,
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

  const uploadImages = (
    restaurantId: string,
    cookie: string,
    menuId: string,
    count: number,
  ) => {
    const req = request(app.getHttpServer())
      .post(url(restaurantId))
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .field('targetMenuId', menuId);
    for (let i = 0; i < count; i += 1) req.attach('file', PNG, `page-${i}.png`);
    return req;
  };
  const get = (path: string, cookie: string) =>
    request(app.getHttpServer()).get(path).set('Cookie', cookie);

  type Obj = Record<string, any>;
  const data = (res: request.Response): Obj => (res.body as { data: Obj }).data;
  const errorCode = (res: request.Response): string =>
    (res.body as { error: { code: string } }).error.code;

  async function waitForEnd(
    restaurantId: string,
    cookie: string,
    publicId: string,
  ) {
    for (let i = 0; i < 150; i += 1) {
      const res = await get(url(restaurantId, `/${publicId}`), cookie).expect(
        200,
      );
      if (['READY_FOR_REVIEW', 'FAILED'].includes(data(res).status as string)) {
        return data(res);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('the job never ended');
  }

  async function useDirect(...secrets: string[]) {
    for (const [index, secret] of secrets.entries()) {
      await ai.addKey({ label: `e2e ${index}`, secret });
    }
    await ai.updateSettings({ engine: 'DIRECT' });
  }

  async function runImport(pages: number) {
    const { restaurant, menu } = await seed();
    const cookie = await login(restaurant.id);
    const started = await uploadImages(
      restaurant.id,
      cookie,
      menu.id,
      pages,
    ).expect(202);
    const job = await waitForEnd(
      restaurant.id,
      cookie,
      data(started).publicId as string,
    );
    return { restaurant, cookie, job, response: started };
  }

  it('reads several images with the Backend itself, spread over the saved keys', async () => {
    await useDirect(KEY_A, KEY_B);
    respond = (_entry, number) =>
      completion(modelAnswer(number === 1 ? 'Falafel Wrap' : 'Shawarma'));

    const { restaurant, cookie, job } = await runImport(2);

    expect(job.status).toBe('READY_FOR_REVIEW');
    expect(seen).toHaveLength(2);
    expect(new Set(seen.map((s) => s.key))).toEqual(new Set([KEY_A, KEY_B]));
    expect(seen.every((s) => s.model === 'e2e-model')).toBe(true);
    expect(seen.every((s) => s.text.includes('data:image/png;base64,'))).toBe(
      true,
    );

    const draft = data(
      await get(
        url(restaurant.id, `/${job.publicId as string}/draft`),
        cookie,
      ).expect(200),
    );
    const names = JSON.stringify(draft);
    expect(names).toContain('Falafel Wrap');
    expect(names).toContain('Shawarma');
    // A key value is never sent back to a restaurant user.
    expect(JSON.stringify([job, draft])).not.toContain(KEY_A);
    expect(JSON.stringify([job, draft])).not.toContain(KEY_B);
  });

  it('keeps going on the other key when one key is at its limit', async () => {
    await useDirect(KEY_A, KEY_B);
    respond = (entry) =>
      entry.key === KEY_A
        ? {
            status: 429,
            body: [{ error: { code: 429, details: [{ retryDelay: '40s' }] } }],
          }
        : completion(modelAnswer('Falafel Wrap'));

    const { job } = await runImport(2);

    expect(job.status).toBe('READY_FOR_REVIEW');
    expect(seen.filter((s) => s.key === KEY_A).length).toBeLessThanOrEqual(1);
    expect(seen.filter((s) => s.key === KEY_B).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('retries a busy model with the fallback model and still finishes', async () => {
    await useDirect(KEY_A);
    respond = (_entry, number) =>
      number === 1
        ? {
            status: 503,
            body: {
              error: {
                message: 'This model is currently experiencing high demand.',
              },
            },
          }
        : completion(modelAnswer('Falafel Wrap'));

    const { job } = await runImport(1);

    expect(job.status).toBe('READY_FOR_REVIEW');
    expect(seen.map((s) => s.model)).toEqual(['e2e-model', 'e2e-fallback']);
  });

  it('finishes with a warning when one of the images cannot be read', async () => {
    await useDirect(KEY_A, KEY_B);
    respond = (_entry, number) =>
      number === 1
        ? {
            status: 400,
            body: { error: { message: 'Unable to process input image' } },
          }
        : completion(modelAnswer('Falafel Wrap'));

    const { job } = await runImport(2);

    expect(job.status).toBe('READY_FOR_REVIEW');
    expect(JSON.stringify(job)).toContain('SOME_FILES_FAILED');
  });

  it('fails the job with a stable code when the model refuses everything', async () => {
    await useDirect(KEY_A);
    respond = () => ({
      status: 400,
      body: { error: { message: 'bad request' } },
    });

    const { job } = await runImport(1);

    expect(job.status).toBe('FAILED');
    expect(job.errorCode).toBe('MODEL_ERROR');
  });

  it('fails the job with MODEL_BUSY when every key is at its limit for long', async () => {
    await useDirect(KEY_A);
    respond = () => ({
      status: 429,
      body: [{ error: { details: [{ retryDelay: '300s' }] } }],
    });

    const { job } = await runImport(1);

    expect(job.status).toBe('FAILED');
    expect(job.errorCode).toBe('MODEL_BUSY');
  });

  it('fails the job when the model answers text that is not a menu', async () => {
    await useDirect(KEY_A);
    respond = () => completion('Sorry, I cannot read this image.');

    const { job } = await runImport(1);

    expect(job.status).toBe('FAILED');
    expect(job.errorCode).toBe('INVALID_MODEL_OUTPUT');
  });

  it('refuses an upload with AI_UNAVAILABLE when the engine is DIRECT but no key is active', async () => {
    await ai.addKey({ label: 'only', secret: KEY_A });
    await ai.updateSettings({ engine: 'DIRECT' });
    // The service refuses to disable the last key while DIRECT is on, so the table is changed directly here.
    await prisma.platformAiKey.updateMany({ data: { status: 'DISABLED' } });

    const { restaurant, menu } = await seed();
    const cookie = await login(restaurant.id);
    const response = await uploadImages(
      restaurant.id,
      cookie,
      menu.id,
      1,
    ).expect(503);

    expect(errorCode(response)).toBe('AI_UNAVAILABLE');
    expect(seen).toHaveLength(0);
  });

  it('does not use a disabled key, and uses the key again once it is active', async () => {
    await ai.addKey({ label: 'one', secret: KEY_A });
    await ai.addKey({ label: 'two', secret: KEY_B });
    const keys = await ai.listKeys();
    await ai.updateKey(keys[0].id, { status: 'DISABLED' });
    await ai.updateSettings({ engine: 'DIRECT' });

    await runImport(1);
    expect(seen.map((s) => s.key)).toEqual([KEY_B]);

    await ai.updateKey(keys[0].id, { status: 'ACTIVE' });
    seen = [];
    await runImport(2);
    expect(new Set(seen.map((s) => s.key))).toEqual(new Set([KEY_A, KEY_B]));
  });

  it('goes back to n8n at once when the engine is switched back', async () => {
    await useDirect(KEY_A);
    await ai.updateSettings({ engine: 'N8N' });

    const { job } = await runImport(1);

    expect(n8nCalls).toBe(1);
    expect(job.status).toBe('FAILED');
    expect(job.errorCode).toBe('AI_UNAVAILABLE');
    expect(seen).toHaveLength(0);
  });
});
