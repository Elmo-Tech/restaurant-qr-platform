import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DEMO_MAX_HOURS, DEMO_MIN_HOURS } from '../../demo/demo-constants';

/** A new temporary demo restaurant: who it is for (a label for the team) and how long it lives. */
export class CreatePlatformDemoDto {
  @IsString()
  @MaxLength(200)
  label!: string;

  @IsInt()
  @Min(DEMO_MIN_HOURS)
  @Max(DEMO_MAX_HOURS)
  hours!: number;

  /** The Package the demo shows the features of. Left out = every feature, as a restaurant without a Package. */
  @IsOptional()
  @IsUUID()
  packageId?: string;
}

export class ExtendPlatformDemoDto {
  @IsInt()
  @Min(DEMO_MIN_HOURS)
  @Max(DEMO_MAX_HOURS)
  hours!: number;
}
