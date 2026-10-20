import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  RateLimitGroup,
  RATE_LIMIT_GROUPS,
} from '../common/rate-limit/rate-limit-group';
import {
  PublicLandingService,
  TRIAL_DAYS,
  type LandingPlan,
} from './public-landing.service';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const blankToNull = ({ value }: { value: unknown }): unknown => {
  const next = typeof value === 'string' ? value.trim() : value;
  return next === '' ? null : next;
};

class CreateLeadDto {
  @IsIn(['SUBSCRIBE', 'TRIAL'])
  kind!: 'SUBSCRIBE' | 'TRIAL';

  @IsOptional()
  @Transform(blankToNull)
  @IsUUID()
  packageId?: string | null;

  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name!: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** Digits with an optional leading +, spaces and dashes: 7 to 20 characters. */
  @Transform(trim)
  @Matches(/^\+?[0-9][0-9 -]{5,18}[0-9]$/, { message: 'phone is not valid' })
  phone!: string;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(100)
  restaurantName?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(500)
  message?: string | null;

  @IsOptional()
  @IsIn(['ar', 'en'])
  locale?: 'ar' | 'en';
}

/**
 * The public landing page's backend (DEC-053), unauthenticated: the packages with their prices, and a
 * request to subscribe or to try the platform. The request route shares the strict public rate limit and
 * always answers the same way, whether or not it created a new row.
 */
@Controller('public/landing')
export class PublicLandingController {
  constructor(private readonly landing: PublicLandingService) {}

  @Get('plans')
  async plans(): Promise<{
    data: { trialDays: number; plans: LandingPlan[] };
  }> {
    return {
      data: { trialDays: TRIAL_DAYS, plans: await this.landing.plans() },
    };
  }

  @Post('leads')
  @HttpCode(HttpStatus.CREATED)
  @RateLimitGroup(RATE_LIMIT_GROUPS.PUBLIC_LOOKUP)
  async createLead(
    @Body() dto: CreateLeadDto,
  ): Promise<{ data: { received: true } }> {
    await this.landing.createLead({
      kind: dto.kind,
      packageId: dto.packageId ?? null,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      restaurantName: dto.restaurantName ?? null,
      message: dto.message ?? null,
      locale: dto.locale ?? 'ar',
    });
    return { data: { received: true } };
  }
}
