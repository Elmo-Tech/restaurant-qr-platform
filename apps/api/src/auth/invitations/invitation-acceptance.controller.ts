import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { AcceptStaffInvitationDto } from './accept-staff-invitation.dto';
import { InvitationAcceptanceService } from './invitation-acceptance.service';

/**
 * Settled contract #10: the single generic public outcome for every
 * unusable-Invitation/unusable-grant-state reason -- never distinguishes
 * malformed/unknown/expired/revoked/accepted tokens, corrupt Branch grant
 * data, a no-longer-authorized inviter, an ineligible global User, or an
 * already-existing target-Restaurant Membership.
 */
const INVITATION_NOT_FOUND_RESPONSE = {
  error: {
    code: 'INVITATION_NOT_FOUND',
    message: 'Invitation not found.',
  },
};

/**
 * Reused verbatim from RestaurantAccessGuard (AUTH_TENANCY_SPEC.md #65A) --
 * not a new contract.
 */
const RESTAURANT_NOT_OPERATIONAL_RESPONSE = {
  error: {
    code: 'RESTAURANT_NOT_OPERATIONAL',
    message: 'Restaurant is not currently operational.',
  },
};

/**
 * Reused verbatim from LoginController (AUTH_TENANCY_SPEC.md #35/#154) --
 * not a new contract. Used only for an existing ACTIVE User's wrong current
 * password; every other unusable state is the generic 404 above.
 */
const INVALID_CREDENTIALS_RESPONSE = {
  error: {
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password.',
  },
};

/**
 * Business Foundation T: Staff Invitation Acceptance.
 * `POST /api/v1/auth/invitations/accept` (API_CONVENTIONS.md, settled
 * contract).
 *
 * Deliberately carries NO guards at all -- no `AuthGuard`, no `CsrfGuard`,
 * no Restaurant/Branch/Permission guard. This is a public, token-authorized
 * endpoint: possession of a valid Invitation token plus the settled password
 * proof is the request's entire authority (settled contract #5). An ambient
 * `restaurant_session` cookie, if present, is never read, compared, or
 * mutated -- it has zero effect on which User the Invitation resolves to
 * (settled contract #6). No `CsrfGuard` because this endpoint does not
 * consume ambient session-cookie authority, exactly mirroring the existing
 * Login precedent (`CsrfGuard`'s own docstring: "Login is outside this
 * boundary: it does not consume an existing Staff session cookie as
 * authority, so it carries no CsrfGuard").
 *
 * Success is `204 No Content` with no response body (settled contract #27)
 * -- no auto-login, no `Set-Cookie`, no Membership/User data returned
 * (settled contract #29).
 */
@Controller('auth/invitations')
export class InvitationAcceptanceController {
  constructor(
    private readonly invitationAcceptanceService: InvitationAcceptanceService,
  ) {}

  @Post('accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  async accept(@Body() dto: AcceptStaffInvitationDto): Promise<void> {
    const result = await this.invitationAcceptanceService.acceptInvitation({
      token: dto.token,
      password: dto.password,
    });

    if (result.outcome === 'invitationNotFound') {
      throw new NotFoundException(INVITATION_NOT_FOUND_RESPONSE);
    }

    if (result.outcome === 'restaurantNotOperational') {
      throw new HttpException(
        RESTAURANT_NOT_OPERATIONAL_RESPONSE,
        HttpStatus.CONFLICT,
      );
    }

    if (result.outcome === 'invalidCredentials') {
      throw new HttpException(
        INVALID_CREDENTIALS_RESPONSE,
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
