/** Mirrors the Backend's error envelope (API_CONVENTIONS.md): `{ error: { code, message, details? } }`. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'object' &&
    (value as { error: { code?: unknown } }).error !== null &&
    typeof (value as { error: { code?: unknown } }).error.code === 'string'
  );
}

/**
 * A Backend error response, typed so callers can branch on the stable
 * `code` (e.g. `RESTAURANT_NOT_FOUND`, `PERMISSION_DENIED`) rather than
 * parsing English `message` text (CLAUDE.md #92).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, body: unknown) {
    const parsed = isApiErrorBody(body) ? body.error : undefined;
    super(parsed?.message ?? 'The request failed.');
    this.status = status;
    this.code = parsed?.code ?? 'UNKNOWN_ERROR';
    this.details = parsed?.details;
  }
}
