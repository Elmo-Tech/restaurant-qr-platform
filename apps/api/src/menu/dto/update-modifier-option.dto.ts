import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Min, ValidateIf } from 'class-validator';
import { IsMoneyDecimalString } from '../money-decimal';
import {
  MODIFIER_OPTION_STATUSES,
  type ModifierOptionStatusInput,
} from './create-modifier-option.dto';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * FT-6A: partial Modifier Option update, mirroring `UpdateProductDto`'s
 * settled convention exactly -- every field is genuinely optional.
 */
export class UpdateModifierOptionDto {
  @ValidateIf((o: UpdateModifierOptionDto) => o.name !== undefined)
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name?: string;

  @ValidateIf((o: UpdateModifierOptionDto) => o.status !== undefined)
  @IsIn(MODIFIER_OPTION_STATUSES, {
    message: `status must be one of: ${MODIFIER_OPTION_STATUSES.join(', ')}`,
  })
  status?: ModifierOptionStatusInput;

  @ValidateIf((o: UpdateModifierOptionDto) => o.priceAdjustment !== undefined)
  @IsMoneyDecimalString()
  priceAdjustment?: string;

  @ValidateIf((o: UpdateModifierOptionDto) => o.displayOrder !== undefined)
  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder?: number;
}
