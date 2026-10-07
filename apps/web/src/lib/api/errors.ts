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
 * The per-field code of a `VALIDATION_ERROR` (e.g. `INVALID_TIMEZONE` for `timezone`), or `null` -- lets a form
 * show the problem next to the field instead of one generic message.
 */
export function validationFieldCode(error: unknown, field: string): string | null {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return null;
  const fields = (error.details as { fields?: { field?: unknown; code?: unknown }[] } | undefined)?.fields;
  const match = Array.isArray(fields) ? fields.find((entry) => entry.field === field) : undefined;
  return typeof match?.code === 'string' ? match.code : null;
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
