import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import {
  normalizePlatformLocale,
  type PlatformSupportedLocale,
} from './platform-locales';

/**
 * LOC-2A, approved LOC-1 contract (Section 5): the `:locale` route
 * parameter is normalized (`trim` + lowercase) and validated against the
 * Platform allowlist here, at the transport boundary -- an unsupported
 * value never reaches `RestaurantLocalesService` at all, so it is
 * impossible for it to result in any database write (LOC-1 Section 14:
 * "malformed/unsupported locale never writes anything").
 *
 * Reuses the exact `VALIDATION_ERROR` envelope shape
 * `validationExceptionFactory` already produces for `@Body()` DTO
 * failures (API_CONVENTIONS.md #29/#34) -- a route param cannot go through
 * the global `ValidationPipe`/class-validator pipeline the way a DTO body
 * can, so this small custom Pipe (task-approved, Section 5: "A small
 * custom Pipe/helper is acceptable") produces the identical response
 * shape by hand rather than inventing a new error contract for what is,
 * from the client's point of view, the same kind of failure ("the request
 * contains invalid data").
 */
@Injectable()
export class LocaleParamPipe implements PipeTransform<
  string,
  PlatformSupportedLocale
> {
  transform(value: string): PlatformSupportedLocale {
    const normalized = normalizePlatformLocale(value);
    if (normalized === null) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request contains invalid data.',
          details: { fields: [{ field: 'locale', code: 'INVALID_VALUE' }] },
        },
      });
    }
    return normalized;
  }
}
