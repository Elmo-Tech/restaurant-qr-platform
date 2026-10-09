import { IsIn, IsOptional } from 'class-validator';

export const PENDING_ORDER_POLICIES = ['KEEP', 'REJECT'] as const;
export type PendingOrderPolicy = (typeof PENDING_ORDER_POLICIES)[number];

/** `NORMAL` is the default; FIRST_ORDER_REJECTED is reserved for the system auto-close. */
export const STAFF_CLOSURE_REASONS = [
  'NORMAL',
  'STAFF_CORRECTION',
  'OTHER',
] as const;
export type StaffClosureReason = (typeof STAFF_CLOSURE_REASONS)[number];

/**
 * Closing never touches payment. When PENDING orders exist, staff MUST choose
 * what happens to them (product decision P3): KEEP leaves them in the normal
 * order lifecycle, REJECT rejects them through the existing reject rules.
 */
export class CloseSessionDto {
  @IsOptional()
  @IsIn(PENDING_ORDER_POLICIES, {
    message: `pendingOrders must be one of: ${PENDING_ORDER_POLICIES.join(', ')}`,
  })
  pendingOrders?: PendingOrderPolicy;

  @IsOptional()
  @IsIn(STAFF_CLOSURE_REASONS, {
    message: `reason must be one of: ${STAFF_CLOSURE_REASONS.join(', ')}`,
  })
  reason?: StaffClosureReason;
}
