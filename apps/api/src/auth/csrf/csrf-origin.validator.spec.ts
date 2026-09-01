import { isCsrfSafeRequest, isUnsafeMethod } from './csrf-origin.validator';

const ALLOWED_ORIGIN = 'https://app.example.com';

function safeRequest(overrides: {
  method?: string;
  originHeader?: string;
  refererHeader?: string;
  allowedOrigin?: string;
}) {
  return isCsrfSafeRequest({
    method: overrides.method ?? 'POST',
    originHeader: overrides.originHeader,
    refererHeader: overrides.refererHeader,
    allowedOrigin: overrides.allowedOrigin ?? ALLOWED_ORIGIN,
  });
}

describe('isUnsafeMethod', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s is unsafe', (method) => {
    expect(isUnsafeMethod(method)).toBe(true);
  });

  it.each(['post', 'put', 'delete'])('is case-insensitive: %s', (method) => {
    expect(isUnsafeMethod(method)).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('%s is safe', (method) => {
    expect(isUnsafeMethod(method)).toBe(false);
  });
});

describe('isCsrfSafeRequest', () => {
  describe('safe methods bypass CSRF entirely', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])(
      '%s is always safe, even with no Origin/Referer at all',
      (method) => {
        expect(safeRequest({ method })).toBe(true);
      },
    );
  });

  describe('approved exact Origin', () => {
    it('allows an exact scheme+host+port match', () => {
      expect(safeRequest({ originHeader: 'https://app.example.com' })).toBe(
        true,
      );
    });
  });

  describe('Origin mismatch cases -- all rejected, all scheme/host/port exact', () => {
    it('rejects wrong scheme (http instead of https)', () => {
      expect(safeRequest({ originHeader: 'http://app.example.com' })).toBe(
        false,
      );
    });

    it('rejects wrong host entirely', () => {
      expect(safeRequest({ originHeader: 'https://evil.com' })).toBe(false);
    });

    it('rejects a spoofed subdomain', () => {
      expect(
        safeRequest({ originHeader: 'https://evil-app.example.com' }),
      ).toBe(false);
    });

    it('rejects a spoofed suffix domain (never suffix-matched)', () => {
      expect(
        safeRequest({ originHeader: 'https://app.example.com.evil.com' }),
      ).toBe(false);
    });

    it('rejects wrong port', () => {
      expect(safeRequest({ originHeader: 'https://app.example.com:444' })).toBe(
        false,
      );
    });
  });

  describe('Origin with a path is handled safely (path never part of identity)', () => {
    it('an Origin header carrying a path still compares by origin only', () => {
      expect(
        safeRequest({ originHeader: 'https://app.example.com/some/path' }),
      ).toBe(true);
    });

    it('a foreign Origin with a path is still rejected', () => {
      expect(safeRequest({ originHeader: 'https://evil.com/some/path' })).toBe(
        false,
      );
    });
  });

  describe('malformed Origin', () => {
    it('rejects a syntactically invalid Origin, never falling back to Referer', () => {
      expect(
        safeRequest({
          originHeader: 'not-a-url',
          refererHeader: 'https://app.example.com/',
        }),
      ).toBe(false);
    });

    it('rejects a duplicate-header comma-joined Origin value', () => {
      expect(
        safeRequest({
          originHeader: 'https://app.example.com, https://evil.com',
        }),
      ).toBe(false);
    });
  });

  describe('Origin: null', () => {
    it('rejects the literal "null" Origin value, never falling back to Referer', () => {
      expect(
        safeRequest({
          originHeader: 'null',
          refererHeader: 'https://app.example.com/',
        }),
      ).toBe(false);
    });
  });

  describe('missing Origin + Referer fallback', () => {
    it('missing Origin + approved Referer -> allowed', () => {
      expect(
        safeRequest({ refererHeader: 'https://app.example.com/some/page' }),
      ).toBe(true);
    });

    it('missing Origin + foreign Referer -> rejected', () => {
      expect(safeRequest({ refererHeader: 'https://evil.com/' })).toBe(false);
    });

    it('missing Origin + malformed Referer -> rejected', () => {
      expect(safeRequest({ refererHeader: 'not-a-url' })).toBe(false);
    });

    it('missing Origin + Referer wrong port -> rejected', () => {
      expect(
        safeRequest({ refererHeader: 'https://app.example.com:444/' }),
      ).toBe(false);
    });
  });

  describe('both Origin and Referer missing -> fail closed', () => {
    it('rejects when neither header is present', () => {
      expect(safeRequest({})).toBe(false);
    });
  });

  describe('mismatched/invalid Origin + a valid Referer -- Origin precedence, no rescue', () => {
    it('mismatched Origin is rejected even though Referer would have matched', () => {
      expect(
        safeRequest({
          originHeader: 'https://evil.com',
          refererHeader: 'https://app.example.com/',
        }),
      ).toBe(false);
    });

    it('malformed Origin is rejected even though Referer would have matched', () => {
      expect(
        safeRequest({
          originHeader: 'https://app.example.com.evil.com',
          refererHeader: 'https://app.example.com/',
        }),
      ).toBe(false);
    });
  });

  describe('configuration origin comes from validated configuration', () => {
    it('uses allowedOrigin, not a hardcoded value', () => {
      expect(
        safeRequest({
          originHeader: 'https://staging.example.com',
          allowedOrigin: 'https://staging.example.com',
        }),
      ).toBe(true);
    });

    it('a misconfigured/unparseable allowedOrigin fails closed rather than skipping the check', () => {
      expect(
        safeRequest({
          originHeader: 'https://app.example.com',
          allowedOrigin: 'not-a-url',
        }),
      ).toBe(false);
    });
  });

  describe('no wildcard, no prefix matching', () => {
    it('an Origin that is merely prefixed by the allowed origin is rejected', () => {
      expect(
        safeRequest({ originHeader: 'https://app.example.com.attacker.io' }),
      ).toBe(false);
    });

    it('an Origin containing the allowed origin as a substring is rejected', () => {
      expect(
        safeRequest({
          originHeader: 'https://attacker.io/https://app.example.com',
        }),
      ).toBe(false);
    });
  });
});
