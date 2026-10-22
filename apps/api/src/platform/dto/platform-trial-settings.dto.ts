import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  NotEquals,
} from 'class-validator';

export class UpdatePlatformTrialSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  defaultDays!: number;

  @IsOptional()
  @IsUUID()
  defaultPackageId?: string | null;
}

export class AdjustActiveTrialsDto {
  @Type(() => Number)
  @IsInt()
  @Min(-365)
  @Max(365)
  @NotEquals(0)
  days!: number;
}
