import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type { Request, Response } from 'express';
import { LoginDto } from '../auth/login/dto/login.dto';
import { extractSessionCookie } from '../auth/guard/session-cookie.extractor';
import {
  RATE_LIMIT_GROUPS,
  RateLimitGroup,
} from '../common/rate-limit/rate-limit-group';
import type { EnvConfig } from '../config/env.schema';
import { FEATURE_KEYS, type FeatureKey } from '../entitlements/features';
import {
  PlatformAuditService,
  type AuditEntryView,
} from './platform-audit.service';
import { PlatformAuthService } from './platform-auth.service';
import {
  PlatformAuthGuard,
  PlatformCsrfGuard,
  type PlatformRequest,
} from './platform-guards';
import {
  PlatformOverviewService,
  type PlatformOverview,
} from './platform-overview.service';
import {
  PlatformPackagesService,
  type PackageDetail,
  type PackageInput,
  type PackageOutcome,
  type PackageRefusal,
  type PackageView,
} from './platform-packages.service';
import {
  AssignPackageDto,
  CreatePackageDto,
  UpdatePackageDto,
  normalizeMoney,
} from './dto/package.dto';
import {
  PlatformRestaurantsService,
  type FeatureState,
  type RestaurantDetail,
  type RestaurantPage,
} from './platform-restaurants.service';

const INVALID_CREDENTIALS = {
  error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
};
const RESTAURANT_NOT_FOUND = {
  error: { code: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' },
};

const REFUSAL_STATUS: Record<PackageRefusal, HttpStatus> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  RESTAURANT_NOT_FOUND: HttpStatus.NOT_FOUND,
  NAME_TAKEN: HttpStatus.CONFLICT,
  IN_USE: HttpStatus.CONFLICT,
  CURRENCY_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  ARCHIVED: HttpStatus.UNPROCESSABLE_ENTITY,
};

const REFUSAL_MESSAGES: Record<
  PackageRefusal,
  { code: string; message: string }
> = {
  NOT_FOUND: { code: 'PACKAGE_NOT_FOUND', message: 'Package not found.' },
  RESTAURANT_NOT_FOUND: RESTAURANT_NOT_FOUND.error,
  NAME_TAKEN: {
    code: 'PACKAGE_NAME_TAKEN',
    message: 'A package with this name already exists.',
  },
  IN_USE: {
    code: 'PACKAGE_IN_USE',
    message: 'Restaurants use this package; archive it instead.',
  },
  CURRENCY_REQUIRED: {
    code: 'PACKAGE_CURRENCY_REQUIRED',
    message: 'A package with a price needs a currency.',
  },
  ARCHIVED: {
    code: 'PACKAGE_ARCHIVED',
    message: 'An archived package cannot be assigned.',
  },
};

/** The data of an accepted package change, or the HTTP error for a refused one. */
function unwrapPackage<T>(result: PackageOutcome<T>): T {
  if (result.outcome === 'ok') return result.data;
  const body = { error: REFUSAL_MESSAGES[result.outcome] };
  throw new HttpException(body, REFUSAL_STATUS[result.outcome]);
}

class ListRestaurantsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

class SetStatusBody {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED';
}

class SetFeatureBody {
  /** true = allow, false = remove, null = back to the default. */
  @ValidateIf((_, value) => value !== null)
  @IsBoolean()
  enabled!: boolean | null;
}

class AuditQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/**
 * The platform control dashboard's API (DEC-045), `/api/v1/platform/...`. Every route passes the
 * platform Origin check; every route except login also needs a Platform Administrator session.
 * Restaurant Staff sessions are never accepted here.
 */
@Controller('platform')
@UseGuards(PlatformCsrfGuard)
export class PlatformController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly restaurants: PlatformRestaurantsService,
    private readonly packages: PlatformPackagesService,
    private readonly overview: PlatformOverviewService,
    private readonly audit: PlatformAuditService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  // ------------------------------------------------------------------ session

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @RateLimitGroup(RATE_LIMIT_GROUPS.LOGIN)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: { id: string; email: string; displayName: string } }> {
    const result = await this.auth.login(dto.email, dto.password);
    if (result.outcome !== 'success') {
      throw new HttpException(INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }
    response.cookie(
      this.configService.get('PLATFORM_SESSION_COOKIE_NAME', { infer: true }),
      result.token,
      {
        httpOnly: true,
        secure: this.configService.get('AUTH_COOKIE_SECURE', { infer: true }),
        sameSite: this.configService.get('AUTH_COOKIE_SAME_SITE', {
          infer: true,
        }),
        path: '/',
        maxAge: result.expiresAt.getTime() - Date.now(),
      },
    );
    await this.audit.record({
      admin: { adminId: result.admin.id, email: result.admin.email },
      action: 'admin.login',
    });
    return { data: result.admin };
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const cookieName = this.configService.get('PLATFORM_SESSION_COOKIE_NAME', {
      infer: true,
    });
    const rawToken = extractSessionCookie(request.headers.cookie, cookieName);
    if (rawToken) await this.auth.revokeSession(rawToken);
    response.clearCookie(cookieName, { path: '/' });
  }

  @Get('auth/me')
  @UseGuards(PlatformAuthGuard)
  me(@Req() request: PlatformRequest): {
    data: { id: string; email: string; displayName: string };
  } {
    const { adminId, email, displayName } = request.platformAdmin;
    return { data: { id: adminId, email, displayName } };
  }

  // ------------------------------------------------------------------ data

  @Get('overview')
  @UseGuards(PlatformAuthGuard)
  async getOverview(): Promise<{ data: PlatformOverview }> {
    return { data: await this.overview.get() };
  }

  @Get('restaurants')
  @UseGuards(PlatformAuthGuard)
  async listRestaurants(
    @Query() query: ListRestaurantsQuery,
  ): Promise<{ data: RestaurantPage }> {
    return {
      data: await this.restaurants.list({
        search: query.search,
        status: query.status,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 25,
      }),
    };
  }

  @Get('restaurants/:restaurantId')
  @UseGuards(PlatformAuthGuard)
  async getRestaurant(
    @Param('restaurantId') restaurantId: string,
  ): Promise<{ data: RestaurantDetail }> {
    const result = await this.restaurants.detail(restaurantId);
    if (result.outcome !== 'ok')
      throw new NotFoundException(RESTAURANT_NOT_FOUND);
    return { data: result.data };
  }

  @Patch('restaurants/:restaurantId/status')
  @UseGuards(PlatformAuthGuard)
  async setStatus(
    @Param('restaurantId') restaurantId: string,
    @Body() body: SetStatusBody,
    @Req() request: PlatformRequest,
  ): Promise<{ data: { status: string } }> {
    const result = await this.restaurants.setStatus(
      request.platformAdmin,
      restaurantId,
      body.status,
    );
    if (result.outcome !== 'ok')
      throw new NotFoundException(RESTAURANT_NOT_FOUND);
    return { data: result.data };
  }

  @Put('restaurants/:restaurantId/features/:feature')
  @UseGuards(PlatformAuthGuard)
  async setFeature(
    @Param('restaurantId') restaurantId: string,
    @Param('feature') feature: string,
    @Body() body: SetFeatureBody,
    @Req() request: PlatformRequest,
  ): Promise<{ data: FeatureState }> {
    if (!(FEATURE_KEYS as readonly string[]).includes(feature)) {
      throw new NotFoundException({
        error: { code: 'FEATURE_NOT_FOUND', message: 'Unknown feature.' },
      });
    }
    const result = await this.restaurants.setFeature(
      request.platformAdmin,
      restaurantId,
      feature as FeatureKey,
      body.enabled,
    );
    if (result.outcome !== 'ok')
      throw new NotFoundException(RESTAURANT_NOT_FOUND);
    return { data: result.data };
  }

  @Put('restaurants/:restaurantId/package')
  @UseGuards(PlatformAuthGuard)
  async assignPackage(
    @Param('restaurantId') restaurantId: string,
    @Body() body: AssignPackageDto,
    @Req() request: PlatformRequest,
  ): Promise<{ data: { packageId: string | null } }> {
    return {
      data: unwrapPackage(
        await this.packages.assign(
          request.platformAdmin,
          restaurantId,
          body.packageId,
        ),
      ),
    };
  }

  // ------------------------------------------------------------------ packages (DEC-046)

  @Get('packages')
  @UseGuards(PlatformAuthGuard)
  async listPackages(): Promise<{ data: PackageView[] }> {
    return { data: await this.packages.list() };
  }

  @Get('packages/:packageId')
  @UseGuards(PlatformAuthGuard)
  async getPackage(
    @Param('packageId') packageId: string,
  ): Promise<{ data: PackageDetail }> {
    return { data: unwrapPackage(await this.packages.detail(packageId)) };
  }

  @Post('packages')
  @UseGuards(PlatformAuthGuard)
  async createPackage(
    @Body() body: CreatePackageDto,
    @Req() request: PlatformRequest,
  ): Promise<{ data: PackageView }> {
    const input: PackageInput = {
      name: body.name,
      description: body.description ?? null,
      monthlyPrice: normalizeMoney(body.monthlyPrice) ?? null,
      yearlyPrice: normalizeMoney(body.yearlyPrice) ?? null,
      currencyCode: body.currencyCode ?? null,
      features: body.features,
      status: body.status ?? 'ACTIVE',
    };
    return {
      data: unwrapPackage(
        await this.packages.create(request.platformAdmin, input),
      ),
    };
  }

  @Patch('packages/:packageId')
  @UseGuards(PlatformAuthGuard)
  async updatePackage(
    @Param('packageId') packageId: string,
    @Body() body: UpdatePackageDto,
    @Req() request: PlatformRequest,
  ): Promise<{ data: PackageView }> {
    return {
      data: unwrapPackage(
        await this.packages.update(request.platformAdmin, packageId, {
          ...body,
          monthlyPrice: normalizeMoney(body.monthlyPrice),
          yearlyPrice: normalizeMoney(body.yearlyPrice),
        }),
      ),
    };
  }

  @Delete('packages/:packageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PlatformAuthGuard)
  async deletePackage(
    @Param('packageId') packageId: string,
    @Req() request: PlatformRequest,
  ): Promise<void> {
    unwrapPackage(await this.packages.remove(request.platformAdmin, packageId));
  }

  @Get('audit')
  @UseGuards(PlatformAuthGuard)
  async getAudit(
    @Query() query: AuditQuery,
    @Query('restaurantId') restaurantId?: string,
  ): Promise<{ data: AuditEntryView[] }> {
    return {
      data: await this.audit.recent({ restaurantId, limit: query.limit ?? 50 }),
    };
  }
}
