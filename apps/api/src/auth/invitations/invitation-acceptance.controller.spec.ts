import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { InvitationAcceptanceController } from './invitation-acceptance.controller';
import type { AcceptStaffInvitationDto } from './accept-staff-invitation.dto';

const DTO: AcceptStaffInvitationDto = {
  token: 'some-raw-token',
  password: 'correct horse battery staple',
};

describe('InvitationAcceptanceController', () => {
  let invitationAcceptanceService: { acceptInvitation: jest.Mock };
  let controller: InvitationAcceptanceController;

  // Nest metadata reflection targets a class method reference without ever
  // invoking it -- not the unintended-`this`-scoping pattern
  // @typescript-eslint/unbound-method guards against.
  /* eslint-disable @typescript-eslint/unbound-method */
  const handler = InvitationAcceptanceController.prototype.accept;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    invitationAcceptanceService = {
      acceptInvitation: jest.fn().mockResolvedValue({ outcome: 'accepted' }),
    };
    controller = new InvitationAcceptanceController(
      invitationAcceptanceService as never,
    );
  });

  it('A. declares no guards at all -- public, token-authorized endpoint', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as
      unknown[] | undefined;

    expect(guards).toBeUndefined();
  });

  it('B. forwards exactly token and password from the DTO, nothing else', async () => {
    await controller.accept(DTO);

    expect(invitationAcceptanceService.acceptInvitation).toHaveBeenCalledWith({
      token: DTO.token,
      password: DTO.password,
    });
  });

  it('C. never forwards an unrelated field even if present on the DTO object at runtime', async () => {
    const dtoWithExtra = {
      ...DTO,
      email: 'attacker@example.test',
      role: 'OWNER',
    } as AcceptStaffInvitationDto & Record<string, unknown>;

    await controller.accept(dtoWithExtra);

    expect(invitationAcceptanceService.acceptInvitation).toHaveBeenCalledWith({
      token: DTO.token,
      password: DTO.password,
    });
  });

  it('D. success returns undefined -- no response body', async () => {
    const body = await controller.accept(DTO);

    expect(body).toBeUndefined();
  });

  it('E. invitationNotFound -> 404 INVITATION_NOT_FOUND', async () => {
    invitationAcceptanceService.acceptInvitation.mockResolvedValue({
      outcome: 'invitationNotFound',
    });

    let caught: NotFoundException | undefined;
    try {
      await controller.accept(DTO);
    } catch (error) {
      caught = error as NotFoundException;
    }

    expect(caught).toBeInstanceOf(NotFoundException);
    expect(caught?.getResponse()).toEqual({
      error: { code: 'INVITATION_NOT_FOUND', message: 'Invitation not found.' },
    });
  });

  it('F. restaurantNotOperational -> 409 RESTAURANT_NOT_OPERATIONAL', async () => {
    invitationAcceptanceService.acceptInvitation.mockResolvedValue({
      outcome: 'restaurantNotOperational',
    });

    let caught: HttpException | undefined;
    try {
      await controller.accept(DTO);
    } catch (error) {
      caught = error as HttpException;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect(caught?.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(caught?.getResponse()).toEqual({
      error: {
        code: 'RESTAURANT_NOT_OPERATIONAL',
        message: 'Restaurant is not currently operational.',
      },
    });
    expect(caught).not.toBeInstanceOf(ConflictException); // exact HttpException, not a distinct class
  });

  it('G. invalidCredentials -> 401 INVALID_CREDENTIALS', async () => {
    invitationAcceptanceService.acceptInvitation.mockResolvedValue({
      outcome: 'invalidCredentials',
    });

    let caught: HttpException | undefined;
    try {
      await controller.accept(DTO);
    } catch (error) {
      caught = error as HttpException;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect(caught?.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(caught?.getResponse()).toEqual({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      },
    });
  });
});
