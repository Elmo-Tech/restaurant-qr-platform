import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * A void is an AUDITED ACCOUNTING CORRECTION of a payment record. It is not a
 * refund and is never named, stored or displayed as one (decision P5). A reason
 * is mandatory.
 */
export class VoidPaymentDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'reason is required' })
  @IsNotEmpty({ message: 'reason is required' })
  @MaxLength(500)
  reason!: string;
}
