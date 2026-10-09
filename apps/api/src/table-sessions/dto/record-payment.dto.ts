import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export const PAYMENT_METHODS = ['CASH', 'CARD', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Full-balance settlement of a CLOSED session (V1, decision P4). The amount is
 * NOT chosen by the client: `expectedAmount` is the balance the staff member
 * SAW, and the Backend rejects the call unless it equals the live balance
 * (PAYMENT_AMOUNT_MISMATCH). A decimal STRING, never a JSON number.
 * `clientRequestId` makes the call idempotent (a double click records once).
 */
export class RecordPaymentDto {
  @IsUUID('all', { message: 'clientRequestId must be a well-formed UUID' })
  clientRequestId!: string;

  @IsIn(PAYMENT_METHODS, {
    message: `method must be one of: ${PAYMENT_METHODS.join(', ')}`,
  })
  method!: PaymentMethod;

  @IsString({ message: 'expectedAmount must be a decimal string' })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/, {
    message:
      'expectedAmount must be a non-negative decimal string with at most 2 fraction digits',
  })
  expectedAmount!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  note?: string;
}
