import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission } from '../permission/has-permission';
import type { Permission } from '../permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../permission/require-permission.decorator';
import type { RestaurantAuthorizedRequest } from './restaurant-authorized-request';

/**
 * AUTHORIZATION FOUNDATION H, decision 1: exactly one generic response for
 * every Permission-denial reason (missing metadata, missing Restaurant
 * context, or a Role that genuinely lacks the capability). Never exposes
 * the required Permission, the current Role, the Membership id, other
 * granted Permissions, or why the Role lacks access.
 */
const PERMISSION_DENIED_RESPONSE = {
  error: {
    code: 'PERMISSION_DENIED',
    message: 'You do not have permission to perform this action.',
  },
};

/**
 * Role-capability enforcement. Must run after AuthGuard, RestaurantAccessGuard,
 * and (where applicable) BranchAccessGuard in the same guard chain -- it
 * never re-authenticates and never re-derives Tenant/Branch authorization
 * itself. The only Role authority it uses is `request.restaurantAccess.role`,
 * already produced by RestaurantAccessGuard's current database lookup this
 * same request; PermissionGuard performs no database query of its own, so
 * there is nothing to cache and nothing that can go stale within a request.
 *
 * Fails closed in both documented edge cases (decisions 6-7): a route
 * decorated with `PermissionGuard` but no `@RequirePermission(...)` denies
 * access rather than treating missing metadata as an implicit allow, and a
 * request missing `request.restaurantAccess` (PermissionGuard used without
 * RestaurantAccessGuard ahead of it) is denied rather than trusting
 * `request.auth` alone or inferring a Role.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<
      Permission | undefined
    >(REQUIRED_PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermission) {
      throw new HttpException(PERMISSION_DENIED_RESPONSE, HttpStatus.FORBIDDEN);
    }

    const request = context
      .switchToHttp()
      .getRequest<Partial<RestaurantAuthorizedRequest>>();

    if (!request.restaurantAccess) {
      throw new HttpException(PERMISSION_DENIED_RESPONSE, HttpStatus.FORBIDDEN);
    }

    if (!hasPermission(request.restaurantAccess.role, requiredPermission)) {
      throw new HttpException(PERMISSION_DENIED_RESPONSE, HttpStatus.FORBIDDEN);
    }

    return true;
  }
}
