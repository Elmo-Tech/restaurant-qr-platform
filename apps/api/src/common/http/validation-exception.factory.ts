import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/**
 * Maps the first failed class-validator constraint of a field to the stable
 * per-field error code shape documented in API_CONVENTIONS.md #34 (e.g. the
 * `email` / `INVALID_EMAIL` example). Unrecognized constraints fall back to
 * a generic code rather than leaking the raw class-validator constraint key.
 */
export function toFieldErrorCode(
  constraints: Record<string, string> = {},
): string {
  const constraintKey = Object.keys(constraints)[0];

  switch (constraintKey) {
    case 'isEmail':
      return 'INVALID_EMAIL';
    case 'isNotEmpty':
      return 'REQUIRED';
    case 'isString':
      return 'INVALID_TYPE';
    case 'isLength':
      return 'INVALID_LENGTH';
    case 'maxLength':
      return 'TOO_LONG';
    case 'minLength':
      return 'TOO_SHORT';
    case 'isTimeZone':
      return 'INVALID_TIMEZONE';
    default:
      return 'INVALID_VALUE';
  }
}

/**
 * Produces the documented validation-error envelope (API_CONVENTIONS.md
 * #29/#34) instead of Nest's default raw `{statusCode, message, error}`
 * shape (CLAUDE.md #49: do not return raw framework exceptions). Used as
 * the global `ValidationPipe`'s `exceptionFactory`.
 */
export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const fields = errors.map((error) => ({
    field: error.property,
    code: toFieldErrorCode(error.constraints),
  }));

  return new BadRequestException({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'The request contains invalid data.',
      details: { fields },
    },
  });
}
