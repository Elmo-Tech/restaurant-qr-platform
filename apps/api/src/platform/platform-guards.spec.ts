import type { ExecutionContext } from '@nestjs/common';
import { PlatformCsrfGuard } from './platform-guards';

const PLATFORM = 'http://localhost:3001';

function guardFor(platformOrigin: string | undefined): PlatformCsrfGuard {
  const config = { get: () => platformOrigin };
  return new PlatformCsrfGuard(config as never);
}

function contextFor(request: {
  method: string;
  origin?: string;
  referer?: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: request.method,
        headers: { origin: request.origin, referer: request.referer },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('PlatformCsrfGuard', () => {
  it('refuses everything when no platform origin is configured (fail closed)', () => {
    expect(() =>
      guardFor(undefined).canActivate(
        contextFor({ method: 'GET', origin: PLATFORM }),
      ),
    ).toThrow();
    expect(() =>
      guardFor(undefined).canActivate(contextFor({ method: 'GET' })),
    ).toThrow();
  });

  it('accepts the platform origin for reads and writes', () => {
    const guard = guardFor(PLATFORM);
    expect(
      guard.canActivate(contextFor({ method: 'GET', origin: PLATFORM })),
    ).toBe(true);
    expect(
      guard.canActivate(contextFor({ method: 'PATCH', origin: PLATFORM })),
    ).toBe(true);
  });

  it('refuses any other origin, reads included', () => {
    const guard = guardFor(PLATFORM);
    for (const origin of [
      'http://localhost:3000',
      'https://evil.example',
      'null',
    ]) {
      expect(() =>
        guard.canActivate(contextFor({ method: 'GET', origin })),
      ).toThrow();
      expect(() =>
        guard.canActivate(contextFor({ method: 'POST', origin })),
      ).toThrow();
    }
  });

  it('lets a read without an Origin through but refuses a write without Origin or Referer', () => {
    const guard = guardFor(PLATFORM);
    expect(guard.canActivate(contextFor({ method: 'GET' }))).toBe(true);
    expect(() => guard.canActivate(contextFor({ method: 'PUT' }))).toThrow();
    expect(
      guard.canActivate(
        contextFor({ method: 'PUT', referer: `${PLATFORM}/restaurants` }),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        contextFor({ method: 'PUT', referer: 'http://localhost:3000/x' }),
      ),
    ).toThrow();
  });
});
