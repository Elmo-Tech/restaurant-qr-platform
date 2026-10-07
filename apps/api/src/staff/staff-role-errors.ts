/**
 * FT-12C: stable Domain error bodies for Restaurant Roles, shared by the Staff
 * (assign a Role) and Roles (manage Roles) controllers. Messages are English
 * fallbacks only -- the Staff UI maps each `code` to localized text.
 */

export const ROLE_NOT_FOUND_RESPONSE = {
  error: { code: 'ROLE_NOT_FOUND', message: 'Role not found.' },
};

/** The protected Owner Role cannot be given to a user through ordinary Staff management. */
export const ROLE_NOT_ASSIGNABLE_RESPONSE = {
  error: {
    code: 'ROLE_NOT_ASSIGNABLE',
    message: 'This role cannot be assigned from here.',
  },
};

/** No privilege escalation: a Role may only grant Permissions its grantor holds. */
export const ROLE_EXCEEDS_AUTHORITY_RESPONSE = {
  error: {
    code: 'ROLE_EXCEEDS_AUTHORITY',
    message: 'You cannot grant permissions that you do not have yourself.',
  },
};

/** The protected Owner Role cannot be edited or deleted. */
export const ROLE_PROTECTED_RESPONSE = {
  error: {
    code: 'ROLE_PROTECTED',
    message: 'The Owner role is protected and cannot be changed or deleted.',
  },
};

export const ROLE_NAME_TAKEN_RESPONSE = {
  error: {
    code: 'ROLE_NAME_TAKEN',
    message: 'A role with this name already exists in this restaurant.',
  },
};

/** A Role still held by Memberships is never deleted, and those Memberships are never touched. */
export function roleInUseResponse(memberCount: number) {
  return {
    error: {
      code: 'ROLE_IN_USE',
      message: 'This role is assigned to users. Reassign them before deleting it.',
      details: { memberCount },
    },
  };
}
