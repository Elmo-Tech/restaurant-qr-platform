import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import {
  IsValidBranchScope,
  branchIdUniquenessKey,
  normalizeEmailValue,
} from './create-staff-invitation.dto';

/**
 * FT-12B: direct Staff User provisioning. Client-writable fields are exactly
 * `email`, `roleId`, `allBranches`, `branchIds`, and the optional `active` and
 * `temporaryPassword`. Unknown fields (`restaurantId`, `status`,
 * `passwordHash`, ...) are stripped by the global
 * whitelist `ValidationPipe`. OWNER is never assignable here (same rule as
 * invitations -- ownership assignment is a separate future workflow). The role
 * must be one of THIS Restaurant's Roles whose permissions the creator holds.
 *
 * `password` is the password the admin sets for a NEW account (same 8-128
 * character policy as everywhere else). It is only used when the email has no
 * account yet; for an existing account it is ignored and that account's
 * credentials are never touched. Whether it is required is decided by the
 * service, which is the only place that knows if the account exists.
 */
export class CreateStaffUserDto {
  @Transform(({ value }) => normalizeEmailValue(value))
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  /** The Restaurant Role to give the new user (never the protected Owner Role -- checked by the service). */
  @IsUUID('all', { message: 'roleId must be a well-formed UUID' })
  roleId!: string;

  @IsBoolean()
  allBranches!: boolean;

  @IsArray()
  @ArrayUnique(branchIdUniquenessKey, {
    message: 'branchIds must not contain duplicates',
  })
  @IsUUID('all', {
    each: true,
    message: 'each branchId must be a well-formed UUID',
  })
  @IsValidBranchScope()
  branchIds!: string[];

  /** Whether the new Membership starts ACTIVE (default) or DISABLED. */
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @Length(8, 128, { message: 'password must be between 8 and 128 characters' })
  password?: string;
}
