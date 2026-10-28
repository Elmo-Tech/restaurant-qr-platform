/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- loosely typed JSON response bodies */
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import type { EnvConfig } from './../src/config/env.schema';
import { PrismaService } from './../src/database/prisma.service';

/**
 * The AI section of the platform console API (DEC-059): engine, model, fallback and the pool of model keys, with
 * the platform audit log. A FAKE Gemini server on this machine answers the key test, so no real provider is called.
 */
const PASSWORD = 'Platform-Admin-Pw-1';
const SECRET_A = 'AIzaSyE2eKeyAAAAAAAAAAAAAAAAAAAAAAAA1';
const SECRET_B = 'AIzaSyE2eKeyBBBBBBBBBBBBBBBBBBBBBBBB2';

describe('Platform AI settings API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let server: Server;
  let origin: string;
  let cookieName: string;
  let cookie: string;
  const adminEmails: string[] = [];

  // What the fake provider does next, and what it was asked.
  let respond: { status: number; body: unknown } = { status: 200, body: null };
  let asked: { key: string; model: string }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          model: string;
        };
        asked.push({
          key: (req.headers.authorization ?? '').replace('Bearer ', ''),
          model: parsed.model,
        });
        res.writeHead(respond.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(respond.body));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as AddressInfo;
    process.env.AI_KEYS_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.AI_CHAT_COMPLETIONS_URL = `http://127.0.0.1:${port}/chat`;
    process.env.PLATFORM_ORIGIN ??= 'http://localhost:3001';

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
    const config = app.get<ConfigService<EnvConfig, true>>(ConfigService);
    origin = new URL(config.get('PLATFORM_ORIGIN', { infer: true }) ?? '')
      .origin;
    cookieName = config.get('PLATFORM_SESSION_COOKIE_NAME', { infer: true });
    cookie = await platformLogin();
  });

  beforeEach(async () => {
    asked = [];
    respond = { status: 200, body: completion('ok') };
    await prisma.platformAuditLog.deleteMany({
      where: { adminEmail: { in: adminEmails } },
    });
    await prisma.platformAiKey.deleteMany({});
    await prisma.platformAiSettings.upsert({
      where: { id: 'ai' },
      create: { id: 'ai', engine: 'N8N', model: 'e2e-model' },
      update: { engine: 'N8N', model: 'e2e-model', fallbackModel: null },
    });
  });

  afterAll(async () => {
    await prisma.platformAiKey.deleteMany({});
    await prisma.platformAiSettings.update({
      where: { id: 'ai' },
      data: { engine: 'N8N' },
    });
    for (const email of adminEmails) {
      await prisma.platformAuditLog.deleteMany({
        where: { adminEmail: email },
      });
      await prisma.platformSession.deleteMany({
        where: { admin: { emailNormalized: email } },
      });
      await prisma.platformAdmin.deleteMany({
        where: { emailNormalized: email },
      });
    }
    await app.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const completion = (text: string) => ({
    choices: [{ message: { content: text }, finish_reason: 'stop' }],
  });

  async function platformLogin(): Promise<string> {
    const email = `ai-admin-${randomUUID()}@example.test`;
    adminEmails.push(email);
    await prisma.platformAdmin.create({
      data: {
        email,
        emailNormalized: email,
        passwordHash: await app
          .get(PasswordHasherService)
          .hashPassword(PASSWORD),
        displayName: 'AI Admin',
        status: 'ACTIVE',
      },
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform/auth/login')
      .set('Origin', origin)
      .send({ email, password: PASSWORD })
      .expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const pair = cookies.find((c) => c.startsWith(`${cookieName}=`));
    if (!pair) throw new Error('no platform session cookie');
    return pair.split(';')[0];
  }

  type Obj = Record<string, any>;
  const body = (res: request.Response): Obj => res.body as Obj;
  const url = (rest = '') => `/api/v1/platform/settings/ai${rest}`;
  const read = (rest = '', withCookie: string | null = cookie) => {
    const req = request(app.getHttpServer())
      .get(url(rest))
      .set('Origin', origin);
    return withCookie ? req.set('Cookie', withCookie) : req;
  };
  const write = (
    method: 'put' | 'post' | 'patch' | 'delete',
    rest: string,
    payload: Record<string, unknown> = {},
    from: string = origin,
  ) =>
    request(app.getHttpServer())
      [method](url(rest))
      .set('Cookie', cookie)
      .set('Origin', from)
      .send(payload);

  async function addKey(label: string, secret: string): Promise<Obj> {
    const res = await write('post', '/keys', { label, secret }).expect(201);
    return body(res).data as Obj;
  }

  const auditRows = (action: string) =>
    prisma.platformAuditLog.findMany({
      where: { action, adminEmail: { in: adminEmails } },
      orderBy: { createdAt: 'asc' },
    });

  it('needs a platform session, and a restaurant-facing origin is refused', async () => {
    await read('', null).expect(401);
    await write('put', '', { engine: 'N8N' }, 'https://evil.example').expect(
      403,
    );
    await request(app.getHttpServer())
      .get(url())
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .expect(403);
  });

  it('shows the settings and an empty key list to start with', async () => {
    const res = await read().expect(200);
    expect(body(res).data.settings).toMatchObject({
      engine: 'N8N',
      model: 'e2e-model',
      fallbackModel: null,
      encryptionConfigured: true,
      activeKeyCount: 0,
    });
    expect(body(res).data.keys).toEqual([]);
  });

  it('saves a key encrypted, shows only a label and the last four characters, and audits it without the key', async () => {
    const key = await addKey('  Main key ', SECRET_A);
    expect(key).toMatchObject({
      label: 'Main key',
      last4: SECRET_A.slice(-4),
      status: 'ACTIVE',
    });
    expect(Object.keys(key).sort()).toEqual(
      ['createdAt', 'id', 'label', 'last4', 'status', 'updatedAt'].sort(),
    );

    const row = await prisma.platformAiKey.findFirstOrThrow({});
    expect(row.secretEncrypted).not.toContain(SECRET_A);
    expect(row.secretEncrypted.startsWith('v1:')).toBe(true);

    const overview = await read().expect(200);
    expect(overview.text).not.toContain(SECRET_A);
    expect(overview.body.data.settings.activeKeyCount).toBe(1);

    const [entry] = await auditRows('platform.ai_key_added');
    expect(entry.details).toMatchObject({
      keyId: key.id,
      label: 'Main key',
      last4: SECRET_A.slice(-4),
    });
    expect(JSON.stringify(entry.details)).not.toContain(SECRET_A);
  });

  it('refuses a duplicate key, a malformed key, a bad label and bad shapes with stable codes', async () => {
    await addKey('A', SECRET_A);
    const duplicate = await write('post', '/keys', {
      label: 'Again',
      secret: SECRET_A,
    });
    expect(duplicate.status).toBe(409);
    expect(body(duplicate).error.code).toBe('KEY_DUPLICATE');
    expect(duplicate.text).not.toContain(SECRET_A);

    const bad = await write('post', '/keys', { label: 'B', secret: 'short' });
    expect(bad.status).toBe(422);
    expect(body(bad).error.code).toBe('KEY_INVALID');

    const noLabel = await write('post', '/keys', {
      label: '   ',
      secret: SECRET_B,
    });
    expect(noLabel.status).toBe(422);
    expect(body(noLabel).error.code).toBe('LABEL_INVALID');

    const shape = await write('post', '/keys', { label: 'B' });
    expect(shape.status).toBe(400);
    expect(body(shape).error.code).toBe('VALIDATION_ERROR');
    expect(shape.text).not.toContain(SECRET_A);
  });

  it('only switches to the direct engine when it can work, audits the change, and keeps its last key', async () => {
    const noKeys = await write('put', '', { engine: 'DIRECT' });
    expect(noKeys.status).toBe(409);
    expect(body(noKeys).error.code).toBe('KEYS_MISSING');

    const key = await addKey('A', SECRET_A);
    const switched = await write('put', '', { engine: 'DIRECT' }).expect(200);
    expect(body(switched).data).toMatchObject({
      engine: 'DIRECT',
      activeKeyCount: 1,
    });
    const [entry] = await auditRows('platform.ai_settings_updated');
    expect(entry.details).toEqual({
      changed: { engine: { from: 'N8N', to: 'DIRECT' } },
    });

    // the last active key stays while the direct engine is on
    const disable = await write('patch', `/keys/${key.id as string}`, {
      status: 'DISABLED',
    });
    expect(disable.status).toBe(409);
    expect(body(disable).error.code).toBe('KEYS_MISSING');
    const remove = await write('delete', `/keys/${key.id as string}`);
    expect(remove.status).toBe(409);

    // going back to n8n is always allowed, and then the key can go
    await write('put', '', { engine: 'N8N' }).expect(200);
    await write('patch', `/keys/${key.id as string}`, {
      status: 'DISABLED',
    }).expect(200);
    await write('delete', `/keys/${key.id as string}`).expect(204);
    expect(body(await read().expect(200)).data.keys).toEqual([]);
  });

  it('changes the model and the fallback model, validates them, and writes only real changes to the audit log', async () => {
    const changed = await write('put', '', {
      model: ' gemini-x-flash ',
      fallbackModel: 'gemini-y-flash',
    }).expect(200);
    expect(body(changed).data).toMatchObject({
      model: 'gemini-x-flash',
      fallbackModel: 'gemini-y-flash',
    });

    const invalid = await write('put', '', { model: 'bad model!' });
    expect(invalid.status).toBe(422);
    expect(body(invalid).error.code).toBe('MODEL_INVALID');

    await write('put', '', { fallbackModel: '' }).expect(200);
    expect(
      body(await read().expect(200)).data.settings.fallbackModel,
    ).toBeNull();

    const before = (await auditRows('platform.ai_settings_updated')).length;
    await write('put', '', { model: 'gemini-x-flash' }).expect(200); // nothing changed
    expect((await auditRows('platform.ai_settings_updated')).length).toBe(
      before,
    );
    const [first] = await auditRows('platform.ai_settings_updated');
    expect(first.details).toEqual({
      changed: {
        model: { from: 'e2e-model', to: 'gemini-x-flash' },
        fallbackModel: { from: null, to: 'gemini-y-flash' },
      },
    });
  });

  it('renames, disables and enables a key and deletes it, with audit entries and 404 for a key that is gone', async () => {
    const key = await addKey('Old', SECRET_A);
    const id = key.id as string;
    const renamed = await write('patch', `/keys/${id}`, {
      label: 'New',
      status: 'DISABLED',
    }).expect(200);
    expect(body(renamed).data).toMatchObject({
      label: 'New',
      status: 'DISABLED',
    });
    expect(body(await read().expect(200)).data.settings.activeKeyCount).toBe(0);
    await write('patch', `/keys/${id}`, { status: 'ACTIVE' }).expect(200);

    const [update] = await auditRows('platform.ai_key_updated');
    expect(update.details).toMatchObject({
      keyId: id,
      changed: {
        label: { from: 'Old', to: 'New' },
        status: { from: 'ACTIVE', to: 'DISABLED' },
      },
    });

    await write('delete', `/keys/${id}`).expect(204);
    const [removed] = await auditRows('platform.ai_key_deleted');
    expect(removed.details).toEqual({
      keyId: id,
      label: 'New',
      last4: SECRET_A.slice(-4),
    });
    for (const attempt of [
      () => write('delete', `/keys/${id}`),
      () => write('patch', `/keys/${id}`, { label: 'x' }),
      () => write('post', `/keys/${id}/test`),
      () => write('delete', '/keys/not-a-uuid'),
    ]) {
      const res = await attempt();
      expect(res.status).toBe(404);
      expect(body(res).error.code).toBe('KEY_NOT_FOUND');
    }
  });

  it('tests a key against the provider and reports a word, never the key or the provider text', async () => {
    const key = await addKey('A', SECRET_A);
    const id = key.id as string;
    const test = () => write('post', `/keys/${id}/test`).expect(200);

    expect(body(await test()).data).toEqual({
      result: 'OK',
      model: 'e2e-model',
      httpStatus: 200,
    });
    expect(asked).toEqual([{ key: SECRET_A, model: 'e2e-model' }]);

    const cases: [number, unknown, string][] = [
      [429, [{ error: { code: 429, message: 'quota detail' } }], 'LIMITED'],
      [403, { error: { message: 'provider says no' } }, 'REJECTED'],
      [503, { error: { message: 'high demand' } }, 'UNAVAILABLE'],
      [404, { error: { message: 'model not found' } }, 'REQUEST_REFUSED'],
    ];
    for (const [status, payload, result] of cases) {
      respond = { status, body: payload };
      const res = await test();
      expect(body(res).data).toMatchObject({ result, httpStatus: status });
      expect(res.text).not.toContain(SECRET_A);
      expect(res.text).not.toMatch(
        /quota detail|provider says no|high demand|model not found/,
      );
    }
  });

  it('says a key cannot be tested when it cannot be read with the current encryption key', async () => {
    const key = await addKey('A', SECRET_A);
    await prisma.platformAiKey.update({
      where: { id: key.id as string },
      data: { secretEncrypted: 'v1:AAAA:AAAA:AAAA' },
    });
    const res = await write('post', `/keys/${key.id as string}/test`);
    expect(res.status).toBe(409);
    expect(body(res).error.code).toBe('KEY_UNREADABLE');
    expect(asked).toEqual([]);
  });

  it('validates the engine value', async () => {
    const res = await write('put', '', { engine: 'SOMETHING' });
    expect(res.status).toBe(400);
    expect(body(res).error.code).toBe('VALIDATION_ERROR');
  });
});
