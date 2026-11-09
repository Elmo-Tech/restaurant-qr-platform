import {
  Body,
  Controller,
  UseGuards,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PublicRestaurantHostGuard } from './public-restaurant-host.guard';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  RATE_LIMIT_GROUPS,
  RateLimitGroup,
} from '../common/rate-limit/rate-limit-group';
import { isPlausiblePhone } from './order-tracking';
import {
  PublicOrderTrackingService,
  type OrderTrackingView,
} from './public-order-tracking.service';

class LookupOrdersDto {
  @IsString()
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;
}

const ORDER_NOT_FOUND = {
  error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' },
};

/**
 * Guest order tracking (DEC-042, slice 5), unauthenticated like the rest of `/public/qr`.
 *
 * - `GET /public/qr/{publicCode}/orders/{orderId}/tracking`: the id is the unguessable UUID the
 *   Guest was given when they placed the order (it is a capability, held by the Guest's own
 *   device). Another Restaurant's id, an unknown id and a malformed one all answer the same
 *   404. The view carries progress and a summary only.
 * - `POST /public/qr/{publicCode}/orders/lookup`: for a Guest on another device: the recent
 *   (24 h) Pickup / Delivery orders placed with that phone number, same safe view, no ids.
 *   Counted by a strict per-IP rate limit.
 */
@UseGuards(PublicRestaurantHostGuard)
@Controller('public/qr')
export class PublicOrderTrackingController {
  constructor(private readonly tracking: PublicOrderTrackingService) {}

  @Get(':publicCode/orders/:orderId/tracking')
  @RateLimitGroup(RATE_LIMIT_GROUPS.PUBLIC_TRACKING)
  async track(
    @Param('publicCode') publicCode: string,
    @Param('orderId') orderId: string,
    @Query('lang') lang?: string,
  ): Promise<{ data: OrderTrackingView }> {
    const result = await this.tracking.getTracking({
      publicCode,
      orderId,
      locale: lang,
    });
    if (result.outcome === 'notFound')
      throw new NotFoundException(ORDER_NOT_FOUND);
    return { data: result.data };
  }

  @Post(':publicCode/orders/lookup')
  @HttpCode(HttpStatus.OK)
  @RateLimitGroup(RATE_LIMIT_GROUPS.PUBLIC_LOOKUP)
  async lookup(
    @Param('publicCode') publicCode: string,
    @Body() dto: LookupOrdersDto,
  ): Promise<{ data: OrderTrackingView[] }> {
    if (!isPlausiblePhone(dto.phone)) {
      throw new UnprocessableEntityException({
        error: {
          code: 'PHONE_INVALID',
          message: 'Enter the phone number you used for the order.',
        },
      });
    }
    return {
      data: await this.tracking.lookupByPhone({
        publicCode,
        phone: dto.phone,
        locale: dto.locale,
      }),
    };
  }
}
