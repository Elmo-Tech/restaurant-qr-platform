import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ORDER_STATUSES } from '../order-transitions';
import type { OrderStatus } from '../../generated/prisma/client';

/**
 * FT-5, Section 16/17: the Staff Order List's only supported filters.
 * `branchId` narrows within the Membership's own already-authorized Branch
 * scope -- it can only ever narrow, never widen, what `OrdersService`
 * resolves server-side (a foreign/unauthorized `branchId` simply yields an
 * empty list, never a distinct error).
 */
export class ListOrdersQueryDto {
  @IsOptional()
  @IsUUID('all', { message: 'branchId must be a well-formed UUID' })
  branchId?: string;

  @IsOptional()
  @IsIn(ORDER_STATUSES, {
    message: `status must be one of: ${ORDER_STATUSES.join(', ')}`,
  })
  status?: OrderStatus;
}
