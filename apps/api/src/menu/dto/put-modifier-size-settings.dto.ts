import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { IsMoneyDecimalString } from '../money-decimal';

/** A complete size-specific snapshot for this Product's Modifier Group. */
export class ModifierSizeOptionDto {
  @IsUUID('4')
  optionId!: string;

  @IsBoolean()
  enabled!: boolean;

  /** null clears the override and inherits the current Product / Preset price. */
  @IsOptional()
  @IsMoneyDecimalString()
  priceAdjustment?: string | null;
}

export class PutModifierSizeSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ModifierSizeOptionDto)
  options!: ModifierSizeOptionDto[];
}
