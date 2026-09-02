import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import {
  toFieldErrorCode,
  validationExceptionFactory,
} from './validation-exception.factory';

function buildError(
  property: string,
  constraints: Record<string, string>,
  value?: unknown,
): ValidationError {
  return { property, constraints, value };
}

describe('toFieldErrorCode', () => {
  it.each([
    ['isEmail', 'INVALID_EMAIL'],
    ['isNotEmpty', 'REQUIRED'],
    ['isString', 'INVALID_TYPE'],
    ['isLength', 'INVALID_LENGTH'],
    ['isTimeZone', 'INVALID_TIMEZONE'],
    ['isSomethingUnmapped', 'INVALID_VALUE'],
  ])('maps the %s constraint to %s', (constraintKey, expectedCode) => {
    expect(toFieldErrorCode({ [constraintKey]: 'message' })).toBe(expectedCode);
  });

  it('falls back to INVALID_VALUE when constraints are missing', () => {
    expect(toFieldErrorCode(undefined)).toBe('INVALID_VALUE');
  });
});

describe('validationExceptionFactory', () => {
  it('produces the documented VALIDATION_ERROR envelope', () => {
    const exception = validationExceptionFactory([
      buildError('email', { isEmail: 'email must be a valid email address' }),
    ]);

    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request contains invalid data.',
        details: {
          fields: [{ field: 'email', code: 'INVALID_EMAIL' }],
        },
      },
    });
  });

  it('includes one entry per failed field', () => {
    const exception = validationExceptionFactory([
      buildError('email', { isEmail: 'message' }),
      buildError('password', { isLength: 'message' }),
    ]);

    const response = exception.getResponse() as {
      error: { details: { fields: { field: string; code: string }[] } };
    };

    expect(response.error.details.fields).toEqual([
      { field: 'email', code: 'INVALID_EMAIL' },
      { field: 'password', code: 'INVALID_LENGTH' },
    ]);
  });

  it('never includes the raw submitted value in the response', () => {
    const exception = validationExceptionFactory([
      buildError(
        'password',
        { isLength: 'message' },
        'this-is-the-actual-submitted-password',
      ),
    ]);

    expect(JSON.stringify(exception.getResponse())).not.toContain(
      'this-is-the-actual-submitted-password',
    );
  });
});
