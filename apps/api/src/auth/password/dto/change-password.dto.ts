import { IsNotEmpty, IsString, Length } from 'class-validator';

/**
 * FT-12: Change Password (authenticated, self-service). `currentPassword`
 * is validated only as "non-empty" here -- its correctness is a business
 * check (`PasswordHasherService.verifyPassword`), not a DTO shape concern.
 * `newPassword` reuses the exact existing V1 password policy unchanged
 * (`LoginDto`/`AcceptStaffInvitationDto`: 8-128 characters, no composition
 * rules).
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'currentPassword should not be empty' })
  currentPassword!: string;

  @IsString()
  @IsNotEmpty({ message: 'newPassword should not be empty' })
  @Length(8, 128, { message: 'newPassword must be between 8 and 128 characters' })
  newPassword!: string;
}
