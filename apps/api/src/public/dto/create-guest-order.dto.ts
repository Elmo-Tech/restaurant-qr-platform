// `@Type(() => ...)` below reads TypeScript's `design:type` metadata via
// `Reflect.getMetadata`, which only exists once this polyfill has run --
// `main.ts`/`@nestjs/core` already load it for the real app, but a Jest
// spec that imports this DTO module directly (e.g. `create-guest-order.dto
// .spec.ts`) has no guarantee anything else in its module graph did so
// first. This is the first DTO in the repo to use nested (`@ValidateNested`
// + `@Type`) validation, so no earlier DTO ever needed this import -- it
// belongs here, at the actual point of need, rather than as a global Jest
// `setupFiles` change affecting every test in the repo.
import 'reflect-metadata';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * FT-5, Section 4/7 (extended FT-6A): exactly `productId` + `quantity` +
 * `modifierOptionIds` -- no unit price, no totals, no Order status, no
 * modifier name/priceAdjustment, ever accepted from the Guest browser
 * (CRITICAL MONEY RULE: the Guest submits option IDENTITY only; the Backend
 * re-resolves every selection's authoritative price -- see
 * `PublicOrdersService.createOrder`). `quantity` is a whole number 1..99
 * (Section 7); anything outside that range or non-integer fails DTO
 * validation before the service ever runs. `modifierOptionIds` is optional
 * (a Product with no Modifier Groups omits it entirely) -- the service
 * normalizes an omitted array to empty.
 */
export class CreateGuestOrderItemDto {
  @IsUUID('all', { message: 'productId must be a well-formed UUID' })
  productId!: string;

  @IsInt({ message: 'quantity must be a whole number' })
  @Min(1, { message: 'quantity must be at least 1' })
  @Max(99, { message: 'quantity must be at most 99' })
  quantity!: number;

  // No `@ArrayMaxSize` here, deliberately: there is no documented global cap
  // on how many Modifier Options one line item may select (DATABASE_SPEC.md
  // #74 only constrains minimumSelections/maximumSelections PER Group, with
  // no repo-wide ceiling on total Groups or Options per Product). The
  // authoritative bound is the Product's actual active Modifier
  // configuration, enforced by `PublicOrdersService` at submission time --
  // an invented DTO-wide limit here could reject a completely valid
  // selection before that domain validation ever runs.
  @IsOptional()
  @IsArray()
  @IsUUID('all', {
    each: true,
    message: 'modifierOptionIds must contain only well-formed UUIDs',
  })
  modifierOptionIds?: string[];
}

/**
 * FT-5, Section 4/11: `clientRequestId` is the Guest browser's own
 * idempotency key -- one UUID generated once per genuine submission
 * attempt, never regenerated on retry. No `restaurantId`/`branchId`/
 * `tableId` field exists here at all -- `publicCode` (the route param) is
 * the sole Tenant/Table authority (Section 5).
 */
export class CreateGuestOrderDto {
  @IsUUID('all', { message: 'clientRequestId must be a well-formed UUID' })
  clientRequestId!: string;

  @ValidateNested({ each: true })
  @Type(() => CreateGuestOrderItemDto)
  @ArrayMinSize(1, { message: 'items must not be empty' })
  @ArrayMaxSize(50, { message: 'items must contain at most 50 line items' })
  items!: CreateGuestOrderItemDto[];
}
