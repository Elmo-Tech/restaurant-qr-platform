import type { Response } from 'express';
import { LogoutController } from './logout.controller';
import type { AuthenticatedRequest } from '../guard/authenticated-request';

function buildResponseMock() {
  return { clearCookie: jest.fn() };
}

function asResponse(mock: { clearCookie: jest.Mock }): Response {
  return mock as unknown as Response;
}

function buildRequest(sessionId: string): AuthenticatedRequest {
  return {
    auth: {
      sessionId,
      userId: 'user-id',
      expiresAt: new Date(),
      lastSeenAt: new Date(),
      userState: 'ACTIVE',
    },
  } as unknown as AuthenticatedRequest;
}

describe('LogoutController', () => {
  let authSessionService: { revokeSessionById: jest.Mock };
  let configService: { get: jest.Mock };
  let controller: LogoutController;

  beforeEach(() => {
    authSessionService = {
      revokeSessionById: jest.fn().mockResolvedValue(undefined),
    };
    configService = { get: jest.fn() };
    configService.get.mockImplementation((key: string) => {
      if (key === 'AUTH_SESSION_COOKIE_NAME') return 'restaurant_session';
      if (key === 'AUTH_COOKIE_SECURE') return false;
      if (key === 'AUTH_COOKIE_SAME_SITE') return 'lax';
      throw new Error(`unexpected config key ${key}`);
    });

    controller = new LogoutController(
      authSessionService as never,
      configService as never,
    );
  });

  it('revokes the session using request.auth.sessionId -- the safe resolved identity, not a raw token', async () => {
    const request = buildRequest('session-abc');
    const res = buildResponseMock();

    await controller.logout(request, asResponse(res));

    expect(authSessionService.revokeSessionById).toHaveBeenCalledWith(
      'session-abc',
    );
    expect(authSessionService.revokeSessionById).toHaveBeenCalledTimes(1);
  });

  it('revokes the session before clearing the cookie', async () => {
    const callOrder: string[] = [];
    authSessionService.revokeSessionById.mockImplementation(() => {
      callOrder.push('revoke');
      return Promise.resolve();
    });
    const res = buildResponseMock();
    res.clearCookie.mockImplementation(() => callOrder.push('clearCookie'));

    await controller.logout(buildRequest('session-abc'), asResponse(res));

    expect(callOrder).toEqual(['revoke', 'clearCookie']);
  });

  it('clears the cookie using the name from ConfigService, not a hardcoded literal', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'AUTH_SESSION_COOKIE_NAME') return 'custom_session_cookie';
      if (key === 'AUTH_COOKIE_SECURE') return false;
      if (key === 'AUTH_COOKIE_SAME_SITE') return 'lax';
      throw new Error(`unexpected config key ${key}`);
    });
    const res = buildResponseMock();

    await controller.logout(buildRequest('session-abc'), asResponse(res));

    expect(res.clearCookie).toHaveBeenCalledWith(
      'custom_session_cookie',
      expect.any(Object),
    );
  });

  it('clears the cookie with the same Secure setting as configured', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'AUTH_SESSION_COOKIE_NAME') return 'restaurant_session';
      if (key === 'AUTH_COOKIE_SECURE') return true;
      if (key === 'AUTH_COOKIE_SAME_SITE') return 'lax';
      throw new Error(`unexpected config key ${key}`);
    });
    const res = buildResponseMock();

    await controller.logout(buildRequest('session-abc'), asResponse(res));

    expect(res.clearCookie).toHaveBeenCalledWith(
      'restaurant_session',
      expect.objectContaining({ secure: true }),
    );
  });

  it('clears the cookie with the same SameSite setting as configured', async () => {
    const res = buildResponseMock();

    await controller.logout(buildRequest('session-abc'), asResponse(res));

    expect(res.clearCookie).toHaveBeenCalledWith(
      'restaurant_session',
      expect.objectContaining({ sameSite: 'lax' }),
    );
  });

  it('clears the cookie with Path=/', async () => {
    const res = buildResponseMock();

    await controller.logout(buildRequest('session-abc'), asResponse(res));

    expect(res.clearCookie).toHaveBeenCalledWith(
      'restaurant_session',
      expect.objectContaining({ path: '/' }),
    );
  });

  it('clears the cookie without a Domain attribute', async () => {
    const res = buildResponseMock();

    await controller.logout(buildRequest('session-abc'), asResponse(res));

    const [, options] = res.clearCookie.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(options).not.toHaveProperty('domain');
  });

  it('returns no response body -- no raw token, no tokenHash', async () => {
    const res = buildResponseMock();

    const body = await controller.logout(
      buildRequest('session-abc'),
      asResponse(res),
    );

    expect(body).toBeUndefined();
  });
});
