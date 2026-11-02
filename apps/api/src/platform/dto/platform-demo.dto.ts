import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
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
}

export class ExtendPlatformDemoDto {
  @IsInt()
  @Min(DEMO_MIN_HOURS)
  @Max(DEMO_MAX_HOURS)
  hours!: number;
}
