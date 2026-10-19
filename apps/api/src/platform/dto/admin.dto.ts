import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Length, MaxLength } from 'class-validator';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** A new Platform Administrator. The password policy is enforced by the shared hasher. */
export class CreateAdminDto {
  @Transform(trimmed)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trimmed)
  @IsString()
  @Length(1, 100)
  displayName!: string;

  @IsString()
  @MaxLength(256)
  password!: string;
}

export class SetAdminStatusDto {
  @IsIn(['ACTIVE', 'DISABLED'])
  status!: 'ACTIVE' | 'DISABLED';
}

export class ResetAdminPasswordDto {
  @IsString()
  @MaxLength(256)
  password!: string;
}

export class ChangeOwnPasswordDto {
  @IsString()
  @MaxLength(256)
  currentPassword!: string;

  @IsString()
  @MaxLength(256)
  newPassword!: string;
}
