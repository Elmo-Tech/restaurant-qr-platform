import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ALL_PERMISSIONS } from '../../auth/permission/permission';

/** Role names are short display labels. */
export const ROLE_NAME_MAX_LENGTH = 60;

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * FT-12C: client-writable fields for creating a Restaurant Role are exactly
 * `name` and `permissions`. Every permission must be a canonical registry key
 * (`PERMISSIONS`) -- an unknown key is a validation error, so a typo can never
 * silently create an unenforceable grant. `kind`, `restaurantId` and every
 * other field are stripped by the global whitelist `ValidationPipe`.
 */
export class CreateRoleDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  @MaxLength(ROLE_NAME_MAX_LENGTH)
  name!: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_PERMISSIONS, {
    each: true,
    message: 'each permission must be a known permission key',
  })
  permissions!: string[];
}

/** Partial update: an omitted field is left unchanged; an explicit `null`/empty name is invalid. */
export class UpdateRoleDto {
  @ValidateIf((o: UpdateRoleDto) => o.name !== undefined)
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  @MaxLength(ROLE_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_PERMISSIONS, {
    each: true,
    message: 'each permission must be a known permission key',
  })
  permissions?: string[];
}
