import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { isWellFormedUuid } from '../common/is-uuid';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import {
  AnnouncementsService,
  type AnnouncementFailure,
  type AnnouncementResult,
  type AnnouncementView,
} from './announcements.service';
import { AnnouncementDto } from './dto/announcement.dto';

const MESSAGES: Record<AnnouncementFailure, string> = {
  DEFAULT_TRANSLATION_REQUIRED:
    'The message in the Restaurant default language is required.',
  LOCALE_NOT_ACTIVE: 'The locale is not active for this Restaurant.',
  ANNOUNCEMENT_DATES_INVALID:
    'The dates are not valid: the end date cannot be before the start date.',
  ANNOUNCEMENT_LIMIT_REACHED:
    'Only three announcements can be active at once. Switch one off first.',
  ANNOUNCEMENT_NOT_FOUND: 'Announcement not found.',
};

function unwrap(result: AnnouncementResult): { data: AnnouncementView } {
  if (result.outcome === 'ok') return { data: result.data };
  const body = { error: { code: result.code, message: MESSAGES[result.code] } };
  if (result.code === 'ANNOUNCEMENT_NOT_FOUND')
    throw new NotFoundException(body);
  if (result.code === 'ANNOUNCEMENT_LIMIT_REACHED')
    throw new ConflictException(body);
  throw new UnprocessableEntityException(body);
}

const notFound = () =>
  new NotFoundException({
    error: {
      code: 'ANNOUNCEMENT_NOT_FOUND',
      message: MESSAGES.ANNOUNCEMENT_NOT_FOUND,
    },
  });

/**
 * Restaurant announcements (DEC-042): `/restaurants/{restaurantId}/announcements`. A
 * Restaurant-structural setting like the profile: reading needs `restaurant.view`; every
 * change needs `restaurant.manage` with Restaurant-wide Branch scope (and CSRF). The
 * Restaurant always comes from the authorized request, never from the body.
 */
@Controller('restaurants/:restaurantId/announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_VIEW)
  async list(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: AnnouncementView[] }> {
    return {
      data: await this.announcements.list(
        request.restaurantAccess.restaurantId,
      ),
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async create(
    @Body() dto: AnnouncementDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: AnnouncementView }> {
    return unwrap(
      await this.announcements.create({
        restaurantId: request.restaurantAccess.restaurantId,
        ...dto,
      }),
    );
  }

  @Patch(':announcementId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async update(
    @Param('announcementId') announcementId: string,
    @Body() dto: AnnouncementDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: AnnouncementView }> {
    if (!isWellFormedUuid(announcementId)) throw notFound();
    return unwrap(
      await this.announcements.update(announcementId, {
        restaurantId: request.restaurantAccess.restaurantId,
        ...dto,
      }),
    );
  }

  @Delete(':announcementId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async remove(
    @Param('announcementId') announcementId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    if (!isWellFormedUuid(announcementId)) throw notFound();
    const removed = await this.announcements.remove(
      request.restaurantAccess.restaurantId,
      announcementId,
    );
    if (!removed) throw notFound();
  }
}
