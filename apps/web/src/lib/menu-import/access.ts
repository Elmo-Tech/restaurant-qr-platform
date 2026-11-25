import { ApiError } from '../api/errors.ts';
import type { AuthContextMembership } from '../auth/types';
import type { MessageKey } from '../i18n/messages';

/**
 * Why Staff cannot import a menu from a file (UX only: every `/menu-imports` route re-checks on the Backend).
 * Checked in the Backend's own order, so the page names the reason the Backend would give:
 *  1. DEMO_RESTRICTED: a demo restaurant (DEC-060), refused by middleware before any guard. Intentional.
 *  2. PERMISSION_DENIED: the Role lacks `menu.manage`.
 *  3. BRANCH_SCOPE: `menu.manage` without all-branches scope (`AllBranchesRequiredGuard`; the Backend answers
 *     the same 403 PERMISSION_DENIED on purpose, the page can tell the two apart from `/auth/me`).
 *  4. FEATURE_NOT_AVAILABLE: the platform has not turned Menu import on for this restaurant (DEC-057).
 */
export type MenuImportBlock =
  | 'DEMO_RESTRICTED'
  | 'PERMISSION_DENIED'
  | 'BRANCH_SCOPE'
  | 'FEATURE_NOT_AVAILABLE';

export function menuImportBlock(membership: AuthContextMembership): MenuImportBlock | null {
  if (membership.restaurant.demoExpiresAt) return 'DEMO_RESTRICTED';
  if (!membership.permissions.includes('menu.manage')) return 'PERMISSION_DENIED';
  if (membership.allBranches !== true) return 'BRANCH_SCOPE';
  if (membership.restaurant.features?.MENU_IMPORT !== true) return 'FEATURE_NOT_AVAILABLE';
  return null;
}

export const MENU_IMPORT_BLOCK_MESSAGE: Record<MenuImportBlock, MessageKey> = {
  DEMO_RESTRICTED: 'import.blocked.demo',
  PERMISSION_DENIED: 'import.blocked.permission',
  BRANCH_SCOPE: 'import.blocked.branchScope',
  FEATURE_NOT_AVAILABLE: 'features.page.menuImport',
};

/**
 * Import-specific text for a refused request after the page loaded (the Role, scope, feature or demo state can change
 * meanwhile). `null`: use the generic error text. A 401 is not handled here: the workspace sends the user to sign in.
 */
export function menuImportErrorKey(caught: unknown): MessageKey | null {
  if (!(caught instanceof ApiError)) return null;
  switch (caught.code) {
    case 'DEMO_RESTRICTED':
      return 'import.blocked.demo';
    case 'FEATURE_NOT_AVAILABLE':
      return 'import.error.featureOff';
    case 'PERMISSION_DENIED':
      return 'import.error.permission';
    default:
      return null;
  }
}
