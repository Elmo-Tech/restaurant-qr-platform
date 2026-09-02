import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { BranchesService } from './branches.service';
import type { BranchListItem, CreatedBranch } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';

interface BranchListResponseBody {
  data: BranchListItem[];
}

interface CreateBranchResponseBody {
  data: CreatedBranch;
}

/**
 * Business Foundation J: the first production Staff business vertical.
 * `GET /api/v1/restaurants/{restaurantId}/branches` (API_CONVENTIONS.md #6
 * worked example). Read-only, so no CsrfGuard (AUTH_TENANCY_SPEC.md #106A:
 * CSRF validation applies only to unsafe POST/PUT/PATCH/DELETE requests).
 * No BranchAccessGuard either -- this is a Branch collection route with no
 * single `:branchId` target; Branch scope is instead honored inside
 * `BranchesService` from the Membership's own `allBranches`/assignment
 * scope (AUTH_TENANCY_SPEC.md #63A).
 *
 * Guard order matches the already-settled Authorization Foundation G/H
 * chain: AuthGuard -> RestaurantAccessGuard -> PermissionGuard
 * (AUTH_TENANCY_SPEC.md #65, #65A, #65B). All authorization fields --
 * `restaurantId`, `membershipId`, `allBranches` -- come only from
 * `request.restaurantAccess`, produced by RestaurantAccessGuard's own
 * current database lookup this request -- never re-read from the raw route
 * param, body, query, or headers here.
 */
@Controller('restaurants/:restaurantId/branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.BRANCHES_VIEW)
  async listBranches(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<BranchListResponseBody> {
    const data = await this.branchesService.listBranches({
      restaurantId: request.restaurantAccess.restaurantId,
      membershipId: request.restaurantAccess.membershipId,
      allBranches: request.restaurantAccess.allBranches,
    });

    return { data };
  }

  /**
   * Business Foundation K, settled contract: creating a Branch is a
   * Restaurant-structural mutation. Guard order is deliberately settled
   * for this route specifically (not a global precedent):
   * AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard ->
   * AllBranchesRequiredGuard. CsrfGuard runs immediately after
   * authentication so a cross-origin unsafe request is rejected before any
   * Tenant/authorization database work where possible; `branches.manage`
   * alone is not sufficient authority -- `AllBranchesRequiredGuard` (after
   * PermissionGuard) additionally requires the Membership to have
   * Restaurant-wide Branch scope, so a Branch-scoped MANAGER can never
   * create a new Branch merely because their Role holds the Permission.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.BRANCHES_MANAGE)
  async createBranch(
    @Body() dto: CreateBranchDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<CreateBranchResponseBody> {
    const data = await this.branchesService.createBranch({
      restaurantId: request.restaurantAccess.restaurantId,
      name: dto.name,
      timezone: dto.timezone,
      phone: dto.phone ?? null,
      address: dto.address ?? null,
    });

    return { data };
  }
}
