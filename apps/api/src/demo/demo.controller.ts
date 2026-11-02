import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import {
  RATE_LIMIT_GROUPS,
  RateLimitGroup,
} from '../common/rate-limit/rate-limit-group';
import type { EnvConfig } from '../config/env.schema';
import { DemoService } from './demo.service';

class EnterDemoDto {
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  token!: string;
}

/**
 * The public side of a demo (DEC-060): the secret link opens a session. Everything else about demos lives in the
 * Platform console. Rate limited like a sign-in, and a wrong or expired link always answers the same way.
 */
@Controller('demo')
export class DemoController {
  constructor(
    private readonly demos: DemoService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Post('enter')
  @RateLimitGroup(RATE_LIMIT_GROUPS.LOGIN)
  @HttpCode(HttpStatus.OK)
  async enter(
    @Body() dto: EnterDemoDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: { redirectTo: string } }> {
    const result = await this.demos.enter(dto.token);
    if (result.outcome !== 'entered') {
      throw new HttpException(
        {
          error: {
            code: 'DEMO_LINK_INVALID',
            message: 'This demo link is not valid or has ended.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }
    // Same cookie as a normal sign-in: host-only, HttpOnly, never readable by the page.
    response.cookie(
      this.config.get('AUTH_SESSION_COOKIE_NAME', { infer: true }),
      result.sessionToken,
      {
        httpOnly: true,
        secure: this.config.get('AUTH_COOKIE_SECURE', { infer: true }),
        sameSite: this.config.get('AUTH_COOKIE_SAME_SITE', { infer: true }),
        path: '/',
        maxAge: result.sessionExpiresAt.getTime() - Date.now(),
      },
    );
    return {
      // The restaurant's own landing page (its dashboard).
      data: { redirectTo: `/staff/restaurants/${result.restaurantId}` },
    };
  }
}
