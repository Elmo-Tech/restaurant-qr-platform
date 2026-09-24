import { Controller, INestApplication, Logger, Post, Body } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  REQUEST_ID_HEADER,
  requestContextMiddleware,
  resolveRequestId,
} from './request-context.middleware';

@Controller('public/qr')
class SampleController {
  @Post(':publicCode/orders')
  create(@Body() _body: unknown) {
    return { ok: true };
  }
}

describe('resolveRequestId', () => {
  it('accepts a safe incoming id', () => {
    expect(resolveRequestId('abc-123_DEF.456')).toBe('abc-123_DEF.456');
  });

  it.each([
    ['too short', 'abc'],
    ['too long', 'a'.repeat(65)],
    ['whitespace', 'abc def 12345'],
    ['newline injection', 'abcdefgh\nX-Evil: 1'],
    ['unsafe characters', 'abc<script>12'],
    ['not a string', undefined],
    ['an array', ['abcdefgh', 'ijklmnop']],
  ])('discards an unsafe incoming id (%s) and generates a UUID', (_label, value) => {
    expect(resolveRequestId(value)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('requestContextMiddleware', () => {
  let app: INestApplication;
  let logSpy: jest.SpyInstance;
  /** Only the access-log lines -- Nest's own bootstrap logging also goes through Logger.log. */
  const accessLines = () =>
    logSpy.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('requestId='));

  beforeEach(async () => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({ controllers: [SampleController] }).compile();
    app = moduleRef.createNestApplication();
    app.use(requestContextMiddleware);
    await app.init();
  });

  afterEach(async () => {
    logSpy.mockRestore();
    await app.close();
  });

  it('returns a generated X-Request-Id when none is supplied', async () => {
    const res = await request(app.getHttpServer()).post('/public/qr/CODE12345/orders').send({});

    expect(res.headers[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a safe incoming X-Request-Id and ignores an unsafe one', async () => {
    const safe = await request(app.getHttpServer())
      .post('/public/qr/CODE12345/orders')
      .set('X-Request-Id', 'trace-abc-12345')
      .send({});
    const unsafe = await request(app.getHttpServer())
      .post('/public/qr/CODE12345/orders')
      .set('X-Request-Id', 'bad id with spaces')
      .send({});

    expect(safe.headers[REQUEST_ID_HEADER]).toBe('trace-abc-12345');
    expect(unsafe.headers[REQUEST_ID_HEADER]).not.toBe('bad id with spaces');
  });

  it('logs one line with method, route pattern, status, duration and request id', async () => {
    await request(app.getHttpServer())
      .post('/public/qr/CODE12345/orders')
      .set('X-Request-Id', 'trace-abc-12345')
      .send({});

    expect(accessLines()).toHaveLength(1);
    const line = accessLines()[0];
    expect(line).toMatch(
      /^POST \/public\/qr\/:publicCode\/orders 201 \d+ms requestId=trace-abc-12345$/,
    );
  });

  it('never logs cookies, Authorization, request bodies, concrete path parameters or query strings', async () => {
    await request(app.getHttpServer())
      .post('/public/qr/CODE12345/orders?token=QUERYSECRET')
      .set('Cookie', 'restaurant_session=COOKIESECRET')
      .set('Authorization', 'Bearer AUTHSECRET')
      .send({ customerAddress: '12 Secret Street', password: 'PASSWORDSECRET' });

    const everything = JSON.stringify(accessLines());
    for (const secret of [
      'COOKIESECRET',
      'AUTHSECRET',
      'Secret Street',
      'PASSWORDSECRET',
      'CODE12345',
      'QUERYSECRET',
    ]) {
      expect(everything).not.toContain(secret);
    }
  });

  it('labels an unmatched request with a fixed label, never its URL', async () => {
    await request(app.getHttpServer()).get('/no/such/route/SECRETPATH');

    const line = accessLines()[0];
    expect(line).toContain('unmatched');
    expect(line).not.toContain('SECRETPATH');
  });
});
