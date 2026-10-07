import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsUUID,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

function branchIdUniquenessKey(branchId: unknown): unknown {
  return typeof branchId === 'string' ? branchId.toLowerCase() : branchId;
}

/** Identical cross-field rule to `CreateStaffInvitationDto`'s own `IsValidBranchScope` (kept local: the two DTOs are otherwise unrelated shapes, and `class-validator` decorators are not easily shared across classes). */
function IsValidBranchScope(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isValidBranchScope',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (!Array.isArray(value)) return true;
          const dto = args.object as UpdateStaffMembershipDto;
          if (dto.allBranches === true) return value.length === 0;
          if (dto.allBranches === false) return value.length > 0;
          return true;
        },
        defaultMessage(args: ValidationArguments): string {
          const dto = args.object as UpdateStaffMembershipDto;
          return dto.allBranches
            ? 'branchIds must be empty when allBranches is true'
            : 'branchIds must contain at least one Branch id when allBranches is false';
        },
      },
    });
  };
}

/**
 * FT-12: Staff Membership role + Branch-scope edit. All three fields are
 * required together (mirrors `CreateStaffInvitationDto`'s exact "all four
 * fields, one call, no partial-field ambiguity" convention) -- there is no
 * `undefined`-means-unchanged semantics here, unlike `UpdateBranchDto`.
 * `role` reuses the exact same `INVITABLE_ROLES` as Invitation creation:
 * `OWNER` is never a valid value on this ordinary endpoint (AUTH_TENANCY_SPEC.md
 * #55/#57) -- a Membership currently holding OWNER can only ever be moved
 * OFF of it here, never assigned TO it, and `StaffService` separately
 * enforces that this can never happen to a Restaurant's last active OWNER.
 */
export class UpdateStaffMembershipDto {
  /** FT-12C: the Restaurant Role to give the Membership (never the protected Owner Role -- checked by the service). */
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
}
