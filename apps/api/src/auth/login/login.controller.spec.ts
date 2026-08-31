import { HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { LoginController } from './login.controller';
import type { LoginDto } from './dto/login.dto';
import type { LoginResult } from './login.service';

const CREDENTIALS: LoginDto = { email: 'a@b.com', password: 'x' };

function buildResponseMock() {
  return { cookie: jest.fn() };
}

function asResponse(mock: { cookie: jest.Mock }): Response {
  return mock as unknown as Response;
}

describe('LoginController', () => {
  let loginService: { login: jest.Mock };
  let configService: { get: jest.Mock };
  let controller: LoginController;

  beforeEach(() => {
    loginService = { login: jest.fn() };
    configService = { get: jest.fn() };
    configService.get.mockImplementation((key: string) => {
      if (key === 'AUTH_SESSION_COOKIE_NAME') return 'restaurant_session';
      if (key === 'AUTH_COOKIE_SECURE') return false;
      if (key === 'AUTH_COOKIE_SAME_SITE') return 'lax';
      throw new Error(`unexpected config key ${key}`);
    });

    controller = new LoginController(
      loginService as never,
      configService as never,
    );
  });

  it('delegates credentials to LoginService without re-deriving them', async () => {
    const successResult: LoginResult = {
      outcome: 'success',
      token: 'A'.repeat(43),
      sessionId: 'session-id',
      userId: 'user-id',
      expiresAt: new Date(Date.now() + 1000),
    };
    loginService.login.mockResolvedValue(successResult);
    const res = buildResponseMock();

    await controller.login(CREDENTIALS, asResponse(res));

    expect(loginService.login).toHaveBeenCalledWith(CREDENTIALS);
  });

  describe('successful login', () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const successResult: LoginResult = {
      outcome: 'success',
      token: 'A'.repeat(43),
      sessionId: 'session-id',
      userId: 'user-id',
      expiresAt,
    };

    it('sets an HttpOnly, path=/ cookie carrying the raw token', async () => {
      loginService.login.mockResolvedValue(successResult);
      const res = buildResponseMock();

      await controller.login(CREDENTIALS, asResponse(res));

      expect(res.cookie).toHaveBeenCalledWith(
        'restaurant_session',
        successResult.token,
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        }),
      );
    });

    it('derives cookie maxAge from the AuthSession expiresAt, not a second TTL', async () => {
      loginService.login.mockResolvedValue(successResult);
      const res = buildResponseMock();

      await controller.login(CREDENTIALS, asResponse(res));

      const [, , options] = res.cookie.mock.calls[0] as [
        string,
        string,
        { maxAge: number },
      ];
      expect(options.maxAge).toBeGreaterThan(0);
      expect(options.maxAge).toBeLessThanOrEqual(60_000);
    });

    it('passes AUTH_COOKIE_SECURE through from configuration', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'AUTH_SESSION_COOKIE_NAME') return 'restaurant_session';
        if (key === 'AUTH_COOKIE_SECURE') return true;
        if (key === 'AUTH_COOKIE_SAME_SITE') return 'lax';
        throw new Error(`unexpected config key ${key}`);
      });
      loginService.login.mockResolvedValue(successResult);
      const res = buildResponseMock();

      await controller.login(CREDENTIALS, asResponse(res));

      expect(res.cookie).toHaveBeenCalledWith(
        'restaurant_session',
        successResult.token,
        expect.objectContaining({ secure: true }),
      );
    });

    it('reads SameSite from AUTH_COOKIE_SAME_SITE configuration rather than a hardcoded literal', async () => {
      loginService.login.mockResolvedValue(successResult);
      const res = buildResponseMock();

      await controller.login(CREDENTIALS, asResponse(res));

      expect(configService.get).toHaveBeenCalledWith('AUTH_COOKIE_SAME_SITE', {
        infer: true,
      });
      expect(res.cookie).toHaveBeenCalledWith(
        'restaurant_session',
        successResult.token,
        expect.objectContaining({ sameSite: 'lax' }),
      );
    });

    it('returns only the userId in the JSON body -- no token, hash, or password fields', async () => {
      loginService.login.mockResolvedValue(successResult);
      const res = buildResponseMock();

      const body = await controller.login(CREDENTIALS, asResponse(res));

      expect(body).toEqual({ data: { userId: 'user-id' } });
      expect(JSON.stringify(body)).not.toContain(successResult.token);
    });
  });

  describe.each([
    ['invalidCredentials', { outcome: 'invalidCredentials' }],
    ['accountUnavailable', { outcome: 'accountUnavailable' }],
  ])('%s outcome', (_label, result) => {
    it('throws a 401 with the generic indistinguishable error body', async () => {
      loginService.login.mockResolvedValue(result);
      const res = buildResponseMock();

      let caught: HttpException | undefined;
      try {
        await controller.login(CREDENTIALS, asResponse(res));
      } catch (error) {
        caught = error as HttpException;
      }

      expect(caught).toBeInstanceOf(HttpException);
      expect(caught?.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(caught?.getResponse()).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        },
      });
    });

    it('does not set a cookie', async () => {
      loginService.login.mockResolvedValue(result);
      const res = buildResponseMock();

      await expect(
        controller.login(CREDENTIALS, asResponse(res)),
      ).rejects.toThrow(HttpException);
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  it('produces an identical failure response for invalidCredentials and accountUnavailable', async () => {
    const res1 = buildResponseMock();
    const res2 = buildResponseMock();

    loginService.login.mockResolvedValueOnce({
      outcome: 'invalidCredentials',
    });
    let first: unknown;
    try {
      await controller.login(CREDENTIALS, asResponse(res1));
    } catch (error) {
      first = (error as HttpException).getResponse();
    }

    loginService.login.mockResolvedValueOnce({
      outcome: 'accountUnavailable',
    });
    let second: unknown;
    try {
      await controller.login(CREDENTIALS, asResponse(res2));
    } catch (error) {
      second = (error as HttpException).getResponse();
    }

    expect(first).toEqual(second);
  });
});
