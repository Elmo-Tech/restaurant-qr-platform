import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permission';

export const REQUIRED_PERMISSION_KEY = 'requiredPermission';

/**
 * Declares the single canonical Permission a route requires. V1 supports
 * exactly ONE required Permission per declaration (approved decision) --
 * do not invent ALL/ANY multi-permission semantics. Enforced by
 * `PermissionGuard`, which must run after AuthGuard and RestaurantAccessGuard
 * (and BranchAccessGuard where applicable) in the same guard chain.
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
