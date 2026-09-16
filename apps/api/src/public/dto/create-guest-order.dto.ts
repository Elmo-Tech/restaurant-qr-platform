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
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * FT-5, Section 4/7: exactly `productId` + `quantity` -- no unit price, no
 * totals, no Order status, ever accepted from the Guest browser (Section
 * 4). `quantity` is a whole number 1..99 (Section 7); anything outside
 * that range or non-integer fails DTO validation before the service ever
 * runs.
 */
export class CreateGuestOrderItemDto {
  @IsUUID('all', { message: 'productId must be a well-formed UUID' })
  productId!: string;

  @IsInt({ message: 'quantity must be a whole number' })
  @Min(1, { message: 'quantity must be at least 1' })
  @Max(99, { message: 'quantity must be at most 99' })
  quantity!: number;
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
