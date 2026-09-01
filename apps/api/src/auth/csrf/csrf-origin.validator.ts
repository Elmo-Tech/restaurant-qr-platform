/**
 * AUTH_TENANCY_SPEC.md #105/#106, SECURITY_SPEC.md #64-65/#70: strict
 * Origin/Referer CSRF validation for unsafe cookie-authenticated Staff
 * requests. Pure and framework-free -- no NestJS, no Express, no PostgreSQL
 * -- so every branch is directly unit-testable without mocking a request.
 */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** SECURITY_SPEC.md #65-66: only these methods require CSRF validation; GET/HEAD/OPTIONS never mutate. */
export function isUnsafeMethod(method: string): boolean {
  return UNSAFE_METHODS.has(method.toUpperCase());
}

type OriginParseResult = 'absent' | 'invalid' | { readonly origin: string };

/**
 * Parses a header value (bare Origin, or a full Referer URL) into its
 * `scheme://host:port` origin using URL semantics -- never string
 * prefix/suffix comparison (SECURITY_SPEC.md #70). Distinguishes "absent"
 * from "invalid" so a present-but-malformed header (including the literal
 * string `"null"`, which is not a parseable absolute URL) is never silently
 * treated the same as a missing header.
 */
function parseOriginHeader(value: string | undefined): OriginParseResult {
  if (value === undefined || value === '') {
    return 'absent';
  }

  try {
    return { origin: new URL(value).origin };
  } catch {
    return 'invalid';
  }
}

export interface CsrfValidationInput {
  method: string;
  originHeader: string | undefined;
  refererHeader: string | undefined;
  /** The single validated trusted origin (env.schema.ts `CORS_ORIGIN`). */
  allowedOrigin: string;
}

/**
 * Returns whether the request is safe to proceed (a safe HTTP method, or an
 * unsafe method whose Origin/Referer matches the approved origin exactly).
 *
 * Precedence (AUTH_TENANCY_SPEC.md #105, this Foundation's approved
 * algorithm): Origin, when present, is authoritative -- a malformed or
 * mismatched Origin is rejected immediately and never falls back to Referer.
 * Referer is consulted only when Origin is genuinely absent. Every ambiguous
 * or unparseable case (a configuration origin that fails to parse, both
 * headers absent, a malformed Referer) fails closed.
 */
export function isCsrfSafeRequest(input: CsrfValidationInput): boolean {
  if (!isUnsafeMethod(input.method)) {
    return true;
  }

  const allowed = parseOriginHeader(input.allowedOrigin);
  if (typeof allowed !== 'object') {
    // Misconfigured trusted origin must never silently become "no check".
    return false;
  }

  const origin = parseOriginHeader(input.originHeader);
  if (origin === 'invalid') {
    return false;
  }
  if (typeof origin === 'object') {
    return origin.origin === allowed.origin;
  }

  // Origin is 'absent' here -- only now is Referer consulted.
  const referer = parseOriginHeader(input.refererHeader);
  if (typeof referer !== 'object') {
    return false;
  }
  return referer.origin === allowed.origin;
}
