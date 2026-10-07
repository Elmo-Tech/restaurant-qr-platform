import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import {
  ROLE_EXCEEDS_AUTHORITY_RESPONSE,
  ROLE_NAME_TAKEN_RESPONSE,
  ROLE_NOT_FOUND_RESPONSE,
  ROLE_PROTECTED_RESPONSE,
  roleInUseResponse,
} from './staff-role-errors';
import { StaffRolesService } from './staff-roles.service';
import type { RoleGranterScope, RoleMutationResult, StaffRoleItem } from './staff-roles.service';

interface StaffRoleListResponseBody {
  data: StaffRoleItem[];
}

interface StaffRoleResponseBody {
  data: StaffRoleItem;
}

/**
 * FT-12C: Restaurant Roles.
 * `/api/v1/restaurants/{restaurantId}/roles`
 *
 * - `GET` requires `users.view` (the same read authority as the Staff list).
 * - `POST` / `PATCH` / `DELETE` require `roles.manage` (held by the Owner by
 *   default) and are CSRF-protected.
 *
 * Restaurant-scoped only (no Branch guard): a Role says what a Membership may
 * do, never where. The Restaurant and the caller's own Permissions come only
 * from `request.restaurantAccess`, never the raw route parameter or the body.
 */
@Controller('restaurants/:restaurantId/roles')
export class StaffRolesController {
  constructor(private readonly staffRolesService: StaffRolesService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS_VIEW)
  async listRoles(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<StaffRoleListResponseBody> {
    const data = await this.staffRolesService.listRoles(
      request.restaurantAccess.restaurantId,
    );
    return { data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.ROLES_MANAGE)
  async createRole(
    @Body() dto: CreateRoleDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<StaffRoleResponseBody> {
    const result = await this.staffRolesService.createRole(this.scopeOf(request), {
      name: dto.name,
      permissions: dto.permissions,
    });
    return this.unwrap(result);
  }

  @Patch(':roleId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.ROLES_MANAGE)
  async updateRole(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<StaffRoleResponseBody> {
    const result = await this.staffRolesService.updateRole(this.scopeOf(request), roleId, {
      name: dto.name,
      permissions: dto.permissions,
    });
    return this.unwrap(result);
  }

  @Delete(':roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.ROLES_MANAGE)
  async deleteRole(
    @Param('roleId') roleId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.staffRolesService.deleteRole(
      request.restaurantAccess.restaurantId,
      roleId,
    );

    if (result.outcome === 'notFound') {
      throw new NotFoundException(ROLE_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'protected') {
      throw new ForbiddenException(ROLE_PROTECTED_RESPONSE);
    }
    if (result.outcome === 'inUse') {
      throw new ConflictException(roleInUseResponse(result.memberCount));
    }
  }

  private scopeOf(request: RestaurantAuthorizedRequest): RoleGranterScope {
    return {
      restaurantId: request.restaurantAccess.restaurantId,
      granterPermissions: request.restaurantAccess.permissions,
    };
  }

  private unwrap(result: RoleMutationResult): StaffRoleResponseBody {
    if (result.outcome === 'notFound') {
      throw new NotFoundException(ROLE_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'protected') {
      throw new ForbiddenException(ROLE_PROTECTED_RESPONSE);
    }
    if (result.outcome === 'nameTaken') {
      throw new ConflictException(ROLE_NAME_TAKEN_RESPONSE);
    }
    if (result.outcome === 'exceedsAuthority') {
      throw new ForbiddenException(ROLE_EXCEEDS_AUTHORITY_RESPONSE);
    }
    return { data: result.data };
  }
}
