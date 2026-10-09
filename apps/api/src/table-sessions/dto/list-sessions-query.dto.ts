import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { SESSION_PAYMENT_STATUSES } from '../session-billing';

/**
 * The payment filter accepts every derived payment status plus the convenience
 * value `OUTSTANDING` (UNPAID or PARTIALLY_PAID): the "unpaid sessions" list
 * that must stay visible after a session is closed.
 */
export const SESSION_PAYMENT_FILTERS = [
  ...SESSION_PAYMENT_STATUSES,
  'OUTSTANDING',
] as const;
export type SessionPaymentFilter = (typeof SESSION_PAYMENT_FILTERS)[number];

export const SESSION_LIST_MAX_LIMIT = 200;
export const SESSION_LIST_DEFAULT_LIMIT = 50;

/**
 * Staff Table Session list filters. `branchId` can only NARROW within the
 * Membership's own authorized Branch scope; a foreign/unauthorized value is
 * dropped (never widens access, never a distinct error), exactly like the
 * Orders list.
 */
export class ListSessionsQueryDto {
  @IsOptional()
  @IsUUID('all', { message: 'branchId must be a well-formed UUID' })
  branchId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'tableId must be a well-formed UUID' })
  tableId?: string;

  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'], { message: 'status must be one of: OPEN, CLOSED' })
  status?: 'OPEN' | 'CLOSED';

  @IsOptional()
  @IsIn(SESSION_PAYMENT_FILTERS, {
    message: `payment must be one of: ${SESSION_PAYMENT_FILTERS.join(', ')}`,
  })
  payment?: SessionPaymentFilter;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  )
  @IsInt({ message: 'limit must be an integer' })
  @Min(1)
  @Max(SESSION_LIST_MAX_LIMIT)
  limit?: number;
}
