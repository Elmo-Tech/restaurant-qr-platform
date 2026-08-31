import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import type { AuthenticatedRequest } from './authenticated-request';
import type { ResolvedAuthSession } from '../session/auth-session.service';

const COOKIE_NAME = 'restaurant_session';
const TOKEN = 'A'.repeat(43);

const RESOLVED: ResolvedAuthSession = {
  sessionId: 'session-id',
  userId: 'user-id',
  expiresAt: new Date(Date.now() + 60_000),
  lastSeenAt: new Date(),
  userState: 'ACTIVE',
};

function buildContext(cookieHeader: string | undefined): {
  context: ExecutionContext;
  request: Partial<AuthenticatedRequest>;
} {
  const request: Partial<AuthenticatedRequest> = {
    headers: cookieHeader === undefined ? {} : { cookie: cookieHeader },
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('AuthGuard', () => {
  let authSessionService: { resolveSession: jest.Mock };
  let configService: { get: jest.Mock };
  let guard: AuthGuard;

  beforeEach(() => {
    authSessionService = { resolveSession: jest.fn() };
    configService = { get: jest.fn() };
    configService.get.mockImplementation((key: string) => {
      if (key === 'AUTH_SESSION_COOKIE_NAME') return COOKIE_NAME;
      throw new Error(`unexpected config key ${key}`);
    });

    guard = new AuthGuard(authSessionService as never, configService as never);
  });

  it('reads the cookie name from ConfigService, not a hardcoded literal', async () => {
    authSessionService.resolveSession.mockResolvedValue(RESOLVED);
    const { context } = buildContext(`${COOKIE_NAME}=${TOKEN}`);

    await guard.canActivate(context);

    expect(configService.get).toHaveBeenCalledWith('AUTH_SESSION_COOKIE_NAME', {
      infer: true,
    });
  });

  describe('missing authentication', () => {
    it('rejects with 401 when there is no Cookie header at all', async () => {
      const { context } = buildContext(undefined);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
      });
      expect(authSessionService.resolveSession).not.toHaveBeenCalled();
    });

    it('rejects with 401 when only unrelated cookies are present', async () => {
      const { context } = buildContext('theme=dark; lang=en');

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
      });
      expect(authSessionService.resolveSession).not.toHaveBeenCalled();
    });

    it('does not call resolveSession when the required cookie is absent', async () => {
      const { context } = buildContext(undefined);

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
      expect(authSessionService.resolveSession).not.toHaveBeenCalled();
    });
  });

  describe('duplicate session cookies fail closed', () => {
    it('rejects with the exact generic 401 when the configured cookie name repeats', async () => {
      const header = `${COOKIE_NAME}=${TOKEN}; ${COOKIE_NAME}=${'B'.repeat(43)}`;
      const { context } = buildContext(header);

      let caught: HttpException | undefined;
      try {
        await guard.canActivate(context);
      } catch (error) {
        caught = error as HttpException;
      }

      expect(caught).toBeInstanceOf(HttpException);
      expect(caught?.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(caught?.getResponse()).toEqual({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication is required.',
        },
      });
    });

    it('never calls resolveSession with either duplicate candidate value', async () => {
      const header = `${COOKIE_NAME}=${TOKEN}; ${COOKIE_NAME}=${'B'.repeat(43)}`;
      const { context } = buildContext(header);

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
      expect(authSessionService.resolveSession).not.toHaveBeenCalled();
    });

    it('does not authenticate even when both duplicates carry the identical valid token', async () => {
      authSessionService.resolveSession.mockResolvedValue(RESOLVED);
      const header = `${COOKIE_NAME}=${TOKEN}; ${COOKIE_NAME}=${TOKEN}`;
      const { context } = buildContext(header);

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
      expect(authSessionService.resolveSession).not.toHaveBeenCalled();
    });

    it('unrelated duplicate cookies do not interfere with a single valid session cookie', async () => {
      authSessionService.resolveSession.mockResolvedValue(RESOLVED);
      const header = `theme=dark; theme=light; ${COOKIE_NAME}=${TOKEN}`;
      const { context } = buildContext(header);

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(authSessionService.resolveSession).toHaveBeenCalledWith(TOKEN);
    });
  });

  describe('invalid session', () => {
    it('passes the exact extracted token to AuthSessionService.resolveSession', async () => {
      authSessionService.resolveSession.mockResolvedValue(RESOLVED);
      const { context } = buildContext(`theme=dark; ${COOKIE_NAME}=${TOKEN}`);

      await guard.canActivate(context);

      expect(authSessionService.resolveSession).toHaveBeenCalledWith(TOKEN);
      expect(authSessionService.resolveSession).toHaveBeenCalledTimes(1);
    });

    it('rejects with 401 when resolveSession returns null (malformed/unknown/revoked/expired/non-ACTIVE)', async () => {
      authSessionService.resolveSession.mockResolvedValue(null);
      const { context } = buildContext(`${COOKIE_NAME}=${TOKEN}`);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
      });
    });

    it('produces the identical failure body for every rejection reason', async () => {
      const { context: missingContext } = buildContext(undefined);
      let missingBody: unknown;
      try {
        await guard.canActivate(missingContext);
      } catch (error) {
        missingBody = (error as HttpException).getResponse();
      }

      authSessionService.resolveSession.mockResolvedValue(null);
      const { context: invalidContext } = buildContext(
        `${COOKIE_NAME}=${TOKEN}`,
      );
      let invalidBody: unknown;
      try {
        await guard.canActivate(invalidContext);
      } catch (error) {
        invalidBody = (error as HttpException).getResponse();
      }

      expect(missingBody).toEqual(invalidBody);
      expect(missingBody).toEqual({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication is required.',
        },
      });
    });
  });

  describe('valid session', () => {
    it('allows the request and returns true', async () => {
      authSessionService.resolveSession.mockResolvedValue(RESOLVED);
      const { context } = buildContext(`${COOKIE_NAME}=${TOKEN}`);

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('attaches exactly the safe resolved principal to request.auth', async () => {
      authSessionService.resolveSession.mockResolvedValue(RESOLVED);
      const { context, request } = buildContext(`${COOKIE_NAME}=${TOKEN}`);

      await guard.canActivate(context);

      expect(request.auth).toEqual(RESOLVED);
    });

    it('never attaches the raw token to the request principal', async () => {
      authSessionService.resolveSession.mockResolvedValue(RESOLVED);
      const { context, request } = buildContext(`${COOKIE_NAME}=${TOKEN}`);

      await guard.canActivate(context);

      expect(JSON.stringify(request.auth)).not.toContain(TOKEN);
    });

    it('never attaches tokenHash or passwordHash', async () => {
      authSessionService.resolveSession.mockResolvedValue(RESOLVED);
      const { context, request } = buildContext(`${COOKIE_NAME}=${TOKEN}`);

      await guard.canActivate(context);

      expect(request.auth).not.toHaveProperty('tokenHash');
      expect(request.auth).not.toHaveProperty('passwordHash');
    });
  });
});
