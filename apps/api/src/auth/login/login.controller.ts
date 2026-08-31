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
import type { Response } from 'express';
import type { EnvConfig } from '../../config/env.schema';
import { LoginDto } from './dto/login.dto';
import { LoginService } from './login.service';

/**
 * AUTH_TENANCY_SPEC.md #35/#154, SECURITY_SPEC.md #14: unknown email, wrong
 * password, INVITED, and DISABLED must all be externally indistinguishable
 * -- identical status, identical body, identical message. LoginService's
 * internal `invalidCredentials` / `accountUnavailable` distinction is
 * collapsed into this single response here, at the HTTP boundary.
 */
const INVALID_CREDENTIALS_RESPONSE = {
  error: {
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password.',
  },
};

interface LoginResponseBody {
  data: { userId: string };
}

/**
 * Transport-only HTTP boundary for the already-approved LoginService
 * (Auth Foundation C). No AuthGuard, no CurrentUser, no Restaurant/Branch
 * authorization, no /auth/me -- those belong to a later slice. This
 * controller does not re-implement email normalization, User lookup,
 * Argon2 verification, the timing-equalization dummy hash, or session
 * creation; it only translates LoginService's result into a safe HTTP
 * response and an HttpOnly session cookie.
 */
@Controller('auth')
export class LoginController {
  constructor(
    private readonly loginService: LoginService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseBody> {
    const result = await this.loginService.login(dto);

    if (result.outcome !== 'success') {
      throw new HttpException(
        INVALID_CREDENTIALS_RESPONSE,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const cookieName = this.configService.get('AUTH_SESSION_COOKIE_NAME', {
      infer: true,
    });
    const secure = this.configService.get('AUTH_COOKIE_SECURE', {
      infer: true,
    });
    const sameSite = this.configService.get('AUTH_COOKIE_SAME_SITE', {
      infer: true,
    });

    // AUTH_TENANCY_SPEC.md #22/#25: cookie lifetime is derived from the
    // AuthSession this LoginService call already created -- never a second,
    // independently computed lifetime (avoids drift from
    // AUTH_SESSION_TTL_DAYS / the database `expiresAt`).
    response.cookie(cookieName, result.token, {
      httpOnly: true,
      secure,
      // env.schema.ts's `AUTH_COOKIE_SAME_SITE` refine narrows this to the
      // literal type 'lax' (the only V1-approved policy,
      // AUTH_TENANCY_SPEC.md #22) -- read from configuration, not
      // hardcoded, but not operator-configurable to anything else either.
      sameSite,
      // Host-only cookie: no `domain` attribute is set.
      path: '/',
      maxAge: result.expiresAt.getTime() - Date.now(),
    });

    // AUTH_TENANCY_SPEC.md #149: the raw token is never returned in JSON.
    // Full "safe User context" (#148, Membership/Role/Branch/Locale)
    // belongs to the future /auth/me endpoint, which requires Restaurant
    // Membership resolution explicitly out of scope for this slice; this
    // response returns only the minimal identity already proven by login.
    return { data: { userId: result.userId } };
  }
}
