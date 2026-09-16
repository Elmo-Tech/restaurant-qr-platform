import { IsIn } from 'class-validator';
import { ORDER_STATUSES } from '../order-transitions';
import type { OrderStatus } from '../../generated/prisma/client';

/**
 * FT-5, Section 14: a conditional/optimistic status transition -- `status`
 * is the requested new value, `expectedStatus` is the status the Staff
 * member's UI currently believes the Order is in. Both are required: there
 * is no "just set the status" shape, so a stale UI can never blindly
 * overwrite a status it never actually observed.
 */
export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES, {
    message: `expectedStatus must be one of: ${ORDER_STATUSES.join(', ')}`,
  })
  expectedStatus!: OrderStatus;

  @IsIn(ORDER_STATUSES, {
    message: `status must be one of: ${ORDER_STATUSES.join(', ')}`,
  })
  status!: OrderStatus;
}
