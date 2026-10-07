import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsUUID,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { normalizeLoginEmail } from '../../auth/login/login.service';

/** Normalizes a string email (trim + lowercase, reusing Login's exact behavior); leaves a non-string value untouched for `@IsEmail()` to reject. */
export function normalizeEmailValue(value: unknown): unknown {
  return typeof value === 'string' ? normalizeLoginEmail(value) : value;
}

/**
 * Case-insensitive uniqueness identifier for `@ArrayUnique` (a malformed
 * UUID with different letter casing must still be caught as a duplicate).
 * Request input is untrusted -- a non-string array element must never throw
 * here; it is passed through unchanged so `@IsUUID('all', { each: true })`
 * reports the normal `VALIDATION_ERROR` for it instead of this identifier
 * crashing before validation completes.
 */
export function branchIdUniquenessKey(branchId: unknown): unknown {
  return typeof branchId === 'string' ? branchId.toLowerCase() : branchId;
}

/**
 * Business Foundation S, settled contract: OWNER is deliberately not a valid
 * DTO value for this ordinary endpoint. Ownership assignment belongs
 * exclusively to a future, explicit ownership-transfer/OWNER-assignment
 * workflow (AUTH_TENANCY_SPEC.md #55/#57, SECURITY_SPEC.md #32).
 */
export const INVITABLE_ROLES = [
  'MANAGER',
  'CASHIER',
  'KITCHEN',
  'WAITER',
] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/**
 * Cross-field invariant (Business Foundation S, settled contract #8):
 * `allBranches=true` requires `branchIds` to be exactly `[]`; `allBranches=false`
 * requires at least one distinct Branch id. Implemented as a custom
 * class-validator decorator (no existing precedent for cross-field DTO
 * validation in this repository) rather than in the service, so a malformed
 * request never reaches business logic at all.
 */
export function IsValidBranchScope(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isValidBranchScope',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (!Array.isArray(value)) {
            return true; // @IsArray reports this failure on its own.
          }
          const dto = args.object as CreateStaffInvitationDto;
          if (dto.allBranches === true) {
            return value.length === 0;
          }
          if (dto.allBranches === false) {
            return value.length > 0;
          }
          return true; // @IsBoolean reports a non-boolean allBranches on its own.
        },
        defaultMessage(args: ValidationArguments): string {
          const dto = args.object as CreateStaffInvitationDto;
          return dto.allBranches
            ? 'branchIds must be empty when allBranches is true'
            : 'branchIds must contain at least one Branch id when allBranches is false';
        },
      },
    });
  };
}

/**
 * Business Foundation S: client-writable fields for Staff Invitation
 * creation are exactly `email`, `role`, `allBranches`, `branchIds` -- all
 * four required. Unknown fields (including `restaurantId`, `invitedByUserId`,
 * `membershipId`, `tokenHash`, `expiresAt`) are silently stripped by the
 * existing global `ValidationPipe({ whitelist: true })` (main.ts).
 *
 * `email` is normalized (`trim().toLowerCase()`, reusing the exact existing
 * `normalizeLoginEmail` behavior from Login) directly in the DTO transform,
 * so every downstream consumer (service persistence, response) already sees
 * the normalized value -- there is no separate raw-email field anywhere in
 * this contract.
 */
export class CreateStaffInvitationDto {
  @Transform(({ value }) => normalizeEmailValue(value))
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @IsIn(INVITABLE_ROLES, {
    message: `role must be one of: ${INVITABLE_ROLES.join(', ')}`,
  })
  role!: InvitableRole;

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
}
