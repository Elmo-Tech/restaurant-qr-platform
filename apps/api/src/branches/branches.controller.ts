import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { BranchManagementAccessGuard } from '../auth/guard/branch-management-access.guard';
import type { BranchAuthorizedRequest } from '../auth/guard/branch-authorized-request';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { BranchesService } from './branches.service';
import type {
  ActivatedBranch,
  BranchListItem,
  CreatedBranch,
  UpdatedBranch,
} from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

const DEFAULT_NAME_REQUIRED_RESPONSE = {
  error: {
    code: 'DEFAULT_TRANSLATION_REQUIRED',
    message: 'The name in the Restaurant default language is required and cannot be removed.',
  },
};

interface BranchListResponseBody {
  data: BranchListItem[];
}

interface CreateBranchResponseBody {
  data: CreatedBranch;
}

interface ActivateBranchResponseBody {
  data: ActivatedBranch;
}

interface UpdateBranchResponseBody {
  data: UpdatedBranch;
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
    const result = await this.branchesService.createBranch({
      restaurantId: request.restaurantAccess.restaurantId,
      name: dto.name,
      translations: dto.translations,
      timezone: dto.timezone,
      phone: dto.phone ?? null,
      address: dto.address ?? null,
    });
    if (result.outcome === 'defaultNameRequired') {
      throw new BadRequestException(DEFAULT_NAME_REQUIRED_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * Business Foundation M, settled contract: activation targets an
   * already-existing Branch, so ordinary authorized Membership Branch scope
   * is sufficient authority -- unlike Create Branch, this is not a
   * Restaurant-structural mutation, so `AllBranchesRequiredGuard` is never
   * used here. The target Branch will normally be `INACTIVE` before
   * activation, so this route uses `BranchManagementAccessGuard` (not
   * `BranchAccessGuard`, which would incorrectly reject an `INACTIVE`
   * Branch as non-operational). `RestaurantAccessGuard` still applies
   * unchanged -- an authorized but non-operational Restaurant still fails
   * with `409 RESTAURANT_NOT_OPERATIONAL` before Branch resolution.
   * `INACTIVE -> ACTIVE` and `ACTIVE -> ACTIVE` both succeed identically
   * (idempotent) -- there is no activation-specific conflict.
   *
   * Settled guard order for this route specifically: `AuthGuard` ->
   * `CsrfGuard` -> `RestaurantAccessGuard` -> `BranchManagementAccessGuard`
   * -> `PermissionGuard` (AUTH_TENANCY_SPEC.md #65F). The Branch id
   * authority comes only from `request.branchAccess.branchId` -- never the
   * raw `:branchId` route parameter. The request body has no writable
   * field at all.
   */
  @Post(':branchId/activate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    BranchManagementAccessGuard,
    PermissionGuard,
  )
  @RequirePermission(PERMISSIONS.BRANCHES_MANAGE)
  async activateBranch(
    @Req() request: BranchAuthorizedRequest,
  ): Promise<ActivateBranchResponseBody> {
    const data = await this.branchesService.activateBranch({
      branchId: request.branchAccess.branchId,
    });

    return { data };
  }

  /**
   * FT-12: the mirror of `activateBranch` above -- identical guard chain,
   * identical rationale (management access, not operational access, since
   * deactivating a currently-ACTIVE Branch is exactly the case
   * `BranchAccessGuard` would incorrectly reject). `ACTIVE -> INACTIVE` and
   * `INACTIVE -> INACTIVE` both succeed identically (idempotent).
   */
  @Post(':branchId/deactivate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    BranchManagementAccessGuard,
    PermissionGuard,
  )
  @RequirePermission(PERMISSIONS.BRANCHES_MANAGE)
  async deactivateBranch(
    @Req() request: BranchAuthorizedRequest,
  ): Promise<ActivateBranchResponseBody> {
    const data = await this.branchesService.deactivateBranch({
      branchId: request.branchAccess.branchId,
    });

    return { data };
  }

  /**
   * Business Foundation N, settled contract: partial update of an
   * already-existing Branch's basic info (`name`, `timezone`, `phone`,
   * `address`). `status` is deliberately not part of this route at all --
   * Branch lifecycle remains Foundation M's dedicated `/activate` action;
   * `status` here is read-only response information. Like Activate, this
   * targets an already-existing Branch, so ordinary authorized Membership
   * Branch scope is sufficient authority and `AllBranchesRequiredGuard` is
   * never used. Basic-info editing remains available whether the target
   * Branch is `ACTIVE` or `INACTIVE`, so this route uses
   * `BranchManagementAccessGuard` (not `BranchAccessGuard`, which would
   * incorrectly reject an `INACTIVE` Branch). `RestaurantAccessGuard`
   * still applies unchanged -- an authorized but non-operational Restaurant
   * still fails with `409 RESTAURANT_NOT_OPERATIONAL` before Branch
   * resolution.
   *
   * Settled guard order for this route specifically: `AuthGuard` ->
   * `CsrfGuard` -> `RestaurantAccessGuard` -> `BranchManagementAccessGuard`
   * -> `PermissionGuard` (AUTH_TENANCY_SPEC.md #65G). The Branch id
   * authority comes only from `request.branchAccess.branchId` -- never the
   * raw `:branchId` route parameter, and never a body-supplied `branchId`/
   * `restaurantId` (the DTO declares no such fields, and the global
   * whitelist `ValidationPipe` strips them regardless).
   */
  @Patch(':branchId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    BranchManagementAccessGuard,
    PermissionGuard,
  )
  @RequirePermission(PERMISSIONS.BRANCHES_MANAGE)
  async updateBranch(
    @Body() dto: UpdateBranchDto,
    @Req() request: BranchAuthorizedRequest,
  ): Promise<UpdateBranchResponseBody> {
    const result = await this.branchesService.updateBranch({
      restaurantId: request.restaurantAccess.restaurantId,
      branchId: request.branchAccess.branchId,
      name: dto.name,
      translations: dto.translations,
      timezone: dto.timezone,
      phone: dto.phone,
      address: dto.address,
    });
    if (result.outcome === 'defaultNameRequired') {
      throw new BadRequestException(DEFAULT_NAME_REQUIRED_RESPONSE);
    }

    return { data: result.data };
  }
}
