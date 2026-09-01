import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';

const CSRF_VALIDATION_FAILED_BODY = {
  error: {
    code: 'CSRF_VALIDATION_FAILED',
    message: 'Cross-origin request rejected.',
  },
};

function buildContext(params: {
  method: string;
  origin?: string;
  referer?: string;
}): ExecutionContext {
  const request = {
    method: params.method,
    headers: { origin: params.origin, referer: params.referer },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildConfigService(corsOrigin: string) {
  return {
    get: (key: string) => (key === 'CORS_ORIGIN' ? corsOrigin : undefined),
  };
}

describe('CsrfGuard', () => {
  it('allows a safe GET request with no Origin/Referer at all', () => {
    const guard = new CsrfGuard(
      buildConfigService('https://app.example.com') as never,
    );
    const context = buildContext({ method: 'GET' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows an unsafe POST from the exact approved Origin', () => {
    const guard = new CsrfGuard(
      buildConfigService('https://app.example.com') as never,
    );
    const context = buildContext({
      method: 'POST',
      origin: 'https://app.example.com',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('reads the allowed origin from ConfigService CORS_ORIGIN, not a hardcoded value', () => {
    const configService = {
      get: jest.fn().mockReturnValue('https://app.example.com'),
    };
    const guard = new CsrfGuard(configService as never);
    const context = buildContext({
      method: 'POST',
      origin: 'https://app.example.com',
    });

    guard.canActivate(context);

    expect(configService.get).toHaveBeenCalledWith('CORS_ORIGIN', {
      infer: true,
    });
  });

  it('rejects a cross-origin unsafe POST with 403 CSRF_VALIDATION_FAILED', () => {
    const guard = new CsrfGuard(
      buildConfigService('https://app.example.com') as never,
    );
    const context = buildContext({
      method: 'POST',
      origin: 'https://evil.com',
    });

    let caught: HttpException | undefined;
    try {
      guard.canActivate(context);
    } catch (error) {
      caught = error as HttpException;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect(caught?.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(caught?.getResponse()).toEqual(CSRF_VALIDATION_FAILED_BODY);
  });

  it('rejects an unsafe POST with no Origin and no Referer', () => {
    const guard = new CsrfGuard(
      buildConfigService('https://app.example.com') as never,
    );
    const context = buildContext({ method: 'POST' });

    expect(() => guard.canActivate(context)).toThrow(HttpException);
  });

  it('every rejection reason produces the exact same generic body', () => {
    const guard = new CsrfGuard(
      buildConfigService('https://app.example.com') as never,
    );
    const cases = [
      buildContext({ method: 'POST' }),
      buildContext({ method: 'POST', origin: 'null' }),
      buildContext({ method: 'POST', origin: 'https://evil.com' }),
      buildContext({
        method: 'POST',
        referer: 'https://evil.com/',
      }),
    ];

    const bodies = cases.map((context) => {
      try {
        guard.canActivate(context);
        return undefined;
      } catch (error) {
        return (error as HttpException).getResponse();
      }
    });

    for (const body of bodies) {
      expect(body).toEqual(CSRF_VALIDATION_FAILED_BODY);
    }
  });
});
