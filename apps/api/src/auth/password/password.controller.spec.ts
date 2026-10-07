import { GUARDS_METADATA } from '@nestjs/common/constants';
import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../guard/auth.guard';
import { CsrfGuard } from '../csrf/csrf.guard';
import { RATE_LIMIT_GROUP_KEY, RATE_LIMIT_GROUPS } from '../../common/rate-limit/rate-limit-group';
import { PasswordController } from './password.controller';
import type { AuthenticatedRequest } from '../guard/authenticated-request';

const USER_ID = 'user-1';
const SESSION_ID = 'session-1';

function buildRequest(): AuthenticatedRequest {
  return {
    auth: {
      userId: USER_ID,
      sessionId: SESSION_ID,
      expiresAt: new Date(),
      lastSeenAt: new Date(),
      userState: 'ACTIVE',
    },
  } as unknown as AuthenticatedRequest;
}

function buildResponseMock() {
  return { status: jest.fn() };
}

function asResponse(mock: { status: jest.Mock }): Response {
  return mock as unknown as Response;
}

describe('PasswordController.changePassword', () => {
  let changePasswordService: { changePassword: jest.Mock };
  let controller: PasswordController;
  /* eslint-disable @typescript-eslint/unbound-method */
  const handler = PasswordController.prototype.changePassword;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    changePasswordService = {
      changePassword: jest.fn().mockResolvedValue({ outcome: 'changed' }),
    };
    controller = new PasswordController(
      changePasswordService as never,
      {} as never,
      { get: jest.fn() } as never,
    );
  });

  it('declares AuthGuard -> CsrfGuard, no Restaurant/Branch/Permission guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
    expect(guards).toEqual([AuthGuard, CsrfGuard]);
  });

  it('passes the authenticated userId/sessionId, never a client-supplied value', async () => {
    const request = buildRequest();

    await controller.changePassword(
      { currentPassword: 'old-password-123', newPassword: 'new-password-456' },
      request,
    );

    expect(changePasswordService.changePassword).toHaveBeenCalledWith({
      userId: USER_ID,
      currentSessionId: SESSION_ID,
      currentPassword: 'old-password-123',
      newPassword: 'new-password-456',
    });
  });

  it('maps invalidCurrentPassword to a 401 INVALID_CURRENT_PASSWORD', async () => {
    changePasswordService.changePassword.mockResolvedValue({
      outcome: 'invalidCurrentPassword',
    });

    let caught: UnauthorizedException | undefined;
    try {
      await controller.changePassword(
        { currentPassword: 'wrong', newPassword: 'new-password-456' },
        buildRequest(),
      );
    } catch (error) {
      caught = error as UnauthorizedException;
    }

    expect(caught).toBeInstanceOf(UnauthorizedException);
    expect(caught?.getResponse()).toEqual({
      error: {
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect.',
      },
    });
  });

  it('returns undefined (204, no body) on success', async () => {
    const body = await controller.changePassword(
      { currentPassword: 'old-password-123', newPassword: 'new-password-456' },
      buildRequest(),
    );

    expect(body).toBeUndefined();
  });
});

describe('PasswordController.forgotPassword', () => {
  let passwordResetService: { requestPasswordReset: jest.Mock };
  let configService: { get: jest.Mock };
  let controller: PasswordController;
  /* eslint-disable @typescript-eslint/unbound-method */
  const handler = PasswordController.prototype.forgotPassword;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    passwordResetService = {
      requestPasswordReset: jest.fn().mockResolvedValue({ rawToken: null }),
    };
    configService = { get: jest.fn().mockReturnValue('production') };
    controller = new PasswordController(
      {} as never,
      passwordResetService as never,
      configService as never,
    );
  });

  it('declares no guards (public, anonymous, token-establishing flow)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as
      | unknown[]
      | undefined;
    expect(guards ?? []).toEqual([]);
  });

  it('is counted by the login rate-limit group', () => {
    expect(Reflect.getMetadata(RATE_LIMIT_GROUP_KEY, handler)).toBe(
      RATE_LIMIT_GROUPS.LOGIN,
    );
  });

  it('responds 204 with no body in Production, even when a token was issued', async () => {
    configService.get.mockReturnValue('production');
    passwordResetService.requestPasswordReset.mockResolvedValue({
      rawToken: 'A'.repeat(43),
    });
    const res = buildResponseMock();

    const body = await controller.forgotPassword(
      { email: 'owner@example.test' },
      asResponse(res),
    );

    expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
    expect(body).toBeUndefined();
  });

  it('responds 204 with no body outside Production for an unknown email (no enumeration)', async () => {
    configService.get.mockReturnValue('development');
    passwordResetService.requestPasswordReset.mockResolvedValue({ rawToken: null });
    const res = buildResponseMock();

    const body = await controller.forgotPassword(
      { email: 'unknown@example.test' },
      asResponse(res),
    );

    expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
    expect(body).toBeUndefined();
  });

  it('surfaces the raw token outside Production, only when one was issued', async () => {
    configService.get.mockReturnValue('development');
    passwordResetService.requestPasswordReset.mockResolvedValue({
      rawToken: 'A'.repeat(43),
    });
    const res = buildResponseMock();

    const body = await controller.forgotPassword(
      { email: 'owner@example.test' },
      asResponse(res),
    );

    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(body).toEqual({ data: { resetToken: 'A'.repeat(43) } });
  });
});

describe('PasswordController.resetPassword', () => {
  let passwordResetService: { resetPassword: jest.Mock };
  let controller: PasswordController;
  /* eslint-disable @typescript-eslint/unbound-method */
  const handler = PasswordController.prototype.resetPassword;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    passwordResetService = {
      resetPassword: jest.fn().mockResolvedValue({ outcome: 'reset' }),
    };
    controller = new PasswordController(
      {} as never,
      passwordResetService as never,
      {} as never,
    );
  });

  it('declares no guards (public, token-authorized flow)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as
      | unknown[]
      | undefined;
    expect(guards ?? []).toEqual([]);
  });

  it('is counted by the login rate-limit group', () => {
    expect(Reflect.getMetadata(RATE_LIMIT_GROUP_KEY, handler)).toBe(
      RATE_LIMIT_GROUPS.LOGIN,
    );
  });

  it('passes the token and new password through', async () => {
    await controller.resetPassword({
      token: 'A'.repeat(43),
      newPassword: 'new-password-456',
    });

    expect(passwordResetService.resetPassword).toHaveBeenCalledWith(
      'A'.repeat(43),
      'new-password-456',
    );
  });

  it('maps invalidToken to a 401 PASSWORD_RESET_TOKEN_INVALID', async () => {
    passwordResetService.resetPassword.mockResolvedValue({
      outcome: 'invalidToken',
    });

    let caught: UnauthorizedException | undefined;
    try {
      await controller.resetPassword({
        token: 'A'.repeat(43),
        newPassword: 'new-password-456',
      });
    } catch (error) {
      caught = error as UnauthorizedException;
    }

    expect(caught).toBeInstanceOf(UnauthorizedException);
    expect(caught?.getResponse()).toEqual({
      error: {
        code: 'PASSWORD_RESET_TOKEN_INVALID',
        message: 'This password reset link is invalid or has expired.',
      },
    });
  });
});
