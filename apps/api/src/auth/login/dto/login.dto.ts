import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

/**
 * Transport-level shape validation only (API_CONVENTIONS.md #167: required
 * fields, types, length). Business normalization (trim/lowercase) and
 * credential verification belong to LoginService, not this DTO — the
 * password is intentionally left untouched. The length bounds mirror the
 * already-approved password policy (AUTH_TENANCY_SPEC.md #14,
 * PasswordHasherService) purely as a request-size guard: rejecting a
 * password that can never be valid before it reaches Argon2id verification.
 */
export class LoginDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'password should not be empty' })
  @Length(10, 128, {
    message: 'password must be between 10 and 128 characters',
  })
  password!: string;
}
