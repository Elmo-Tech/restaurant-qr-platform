import { IsNotEmpty, IsString, Length } from 'class-validator';

/**
 * Business Foundation T, settled contract: exactly `token` and `password`,
 * both required. No `email`/`restaurantId`/`userId`/`membershipId`/`role`/
 * `allBranches`/`branchIds`/`status`/`preferredLocale`/`invitedByUserId` --
 * unknown fields are silently stripped by the existing global
 * `ValidationPipe({ whitelist: true })` (main.ts), but none of those would
 * ever be trusted as authority regardless.
 *
 * `token` is intentionally validated only as "a non-empty string" here --
 * NOT its specific 43-character base64url shape. That deeper format check
 * belongs to `InvitationAcceptanceService` (via the existing
 * `SessionTokenService.isWellFormedRawToken`), so a malformed token shares
 * the exact same generic `404 INVITATION_NOT_FOUND` business outcome as an
 * unknown/expired/revoked/accepted one -- rejecting it here as a distinct
 * `400 VALIDATION_ERROR` would let a client distinguish "malformed" from
 * "well-formed but unusable," which is exactly the enumeration this
 * Foundation's generic error is designed to prevent.
 *
 * `password` reuses the exact existing V1 password policy unchanged
 * (`LoginDto`, `PasswordHasherService`: 10-128 characters, no composition
 * rules) -- for both a brand-new account password and an existing account's
 * current password proof; which case applies is a business decision made
 * only inside the service, never in this DTO.
 */
export class AcceptStaffInvitationDto {
  @IsString()
  @IsNotEmpty({ message: 'token should not be empty' })
  token!: string;

  @IsString()
  @IsNotEmpty({ message: 'password should not be empty' })
  @Length(10, 128, {
    message: 'password must be between 10 and 128 characters',
  })
  password!: string;
}
