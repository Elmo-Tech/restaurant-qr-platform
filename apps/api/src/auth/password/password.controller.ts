import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { EnvConfig } from '../../config/env.schema';
import { RATE_LIMIT_GROUPS, RateLimitGroup } from '../../common/rate-limit/rate-limit-group';
import { CsrfGuard } from '../csrf/csrf.guard';
import { AuthGuard } from '../guard/auth.guard';
import type { AuthenticatedRequest } from '../guard/authenticated-request';
import { ChangePasswordService } from './change-password.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordResetService } from './password-reset.service';

const INVALID_CURRENT_PASSWORD_RESPONSE = {
  error: {
    code: 'INVALID_CURRENT_PASSWORD',
    message: 'Current password is incorrect.',
  },
};

/**
 * AUTH_TENANCY_SPEC.md #34, SECURITY_SPEC.md #15: one generic outcome for
 * every reset-token failure reason (unknown, malformed, expired, already
 * consumed, or belonging to a non-ACTIVE User) -- never distinguished
 * externally.
 */
const PASSWORD_RESET_TOKEN_INVALID_RESPONSE = {
  error: {
    code: 'PASSWORD_RESET_TOKEN_INVALID',
    message: 'This password reset link is invalid or has expired.',
  },
};


/**
 * FT-12 Account (#9) and Password Recovery (#10). Transport-only HTTP
 * boundary over `ChangePasswordService`/`PasswordResetService` -- no Prisma
 * query, no Argon2/token logic here.
 *
 * Change Password is account-level (AuthGuard + CsrfGuard only, no
 * Restaurant/Branch/Permission guard -- identical reasoning to Logout).
 * Forgot/Reset Password are public, anonymous, token-authorized flows
 * (no guard at all, matching Staff Invitation Acceptance's precedent) and
 * share Login's tighter rate-limit group as an unauthenticated
 * credential-setting endpoint (API_CONVENTIONS.md #128, SECURITY_SPEC.md
 * #16).
 */
@Controller('auth')
export class PasswordController {
  constructor(
    private readonly changePasswordService: ChangePasswordService,
    private readonly passwordResetService: PasswordResetService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const result = await this.changePasswordService.changePassword({
      userId: request.auth.userId,
      currentSessionId: request.auth.sessionId,
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
    });

    if (result.outcome === 'invalidCurrentPassword') {
      throw new UnauthorizedException(INVALID_CURRENT_PASSWORD_RESPONSE);
    }

  }

  @Post('forgot-password')
  @RateLimitGroup(RATE_LIMIT_GROUPS.LOGIN)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: { resetToken: string } } | void> {
    const result = await this.passwordResetService.requestPasswordReset(
      dto.email,
    );

    // AUTH_TENANCY_SPEC.md #34: the response must not reveal whether the
    // email exists, so this is 204 No Content for every outcome in
    // Production. Outside Production, and only when a token was actually
    // issued, the raw token is additionally surfaced as a safe development
    // mechanism (no mail provider exists yet -- FT-13) -- mirroring the
    // already-shipped Staff Invitation token-in-response precedent. A 204
    // response must carry no body, so the status is set explicitly per
    // outcome rather than via a fixed @HttpCode.
    const isProduction =
      this.configService.get('NODE_ENV', { infer: true }) === 'production';

    if (!isProduction && result.rawToken) {
      response.status(HttpStatus.OK);
      return { data: { resetToken: result.rawToken } };
    }

    response.status(HttpStatus.NO_CONTENT);
  }

  @Post('reset-password')
  @RateLimitGroup(RATE_LIMIT_GROUPS.LOGIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    const result = await this.passwordResetService.resetPassword(
      dto.token,
      dto.newPassword,
    );

    if (result.outcome === 'invalidToken') {
      throw new UnauthorizedException(PASSWORD_RESET_TOKEN_INVALID_RESPONSE);
    }
  }
}
