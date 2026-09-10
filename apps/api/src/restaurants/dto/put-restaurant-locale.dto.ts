import { IsBoolean } from 'class-validator';

/**
 * LOC-2A, approved LOC-1 contract (Section 9): the ONLY writable field for
 * `PUT .../restaurants/{restaurantId}/locales/{locale}`. `locale` itself is
 * a route param (validated separately by `LocaleParamPipe`, never a body
 * field); `restaurantId` is never accepted from the body (stripped by the
 * existing global whitelist `ValidationPipe` regardless, but never trusted
 * either way, matching every other Menu/Category/Product/Branch DTO's
 * established convention).
 */
export class PutRestaurantLocaleDto {
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive!: boolean;
}
