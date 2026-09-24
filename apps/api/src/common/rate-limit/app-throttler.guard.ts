import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * FT-9: the standard API error envelope (`{ error: { code, message } }`,
 * API_CONVENTIONS.md) for a rate-limited request, instead of the library's
 * default body. `Retry-After` is already set by `ThrottlerGuard` itself
 * before this is thrown. The message deliberately says nothing about which
 * limit fired or the configured numbers.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(
    _context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new HttpException(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please wait a moment and try again.',
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
