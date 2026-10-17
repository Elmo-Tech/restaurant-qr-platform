import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class HoursIntervalDto {
  /** "HH:MM", 24-hour clock, in the Branch's own timezone. */
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  opens!: string;

  /** "HH:MM"; at or before `opens` means after midnight (22:00 to 02:00). */
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  closes!: string;
}

class HoursDayDto {
  /** 0 = Sunday ... 6 = Saturday. */
  @IsInt()
  @Min(0)
  @Max(6)
  day!: number;

  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => HoursIntervalDto)
  intervals!: HoursIntervalDto[];
}

/** Replaces a Branch's opening hours. `days` is required for SCHEDULE and ignored for ALWAYS_OPEN. */
export class UpdateBranchHoursDto {
  @IsIn(['ALWAYS_OPEN', 'SCHEDULE'])
  mode!: 'ALWAYS_OPEN' | 'SCHEDULE';

  @IsBoolean()
  temporarilyClosed!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => HoursDayDto)
  days?: HoursDayDto[];
}
