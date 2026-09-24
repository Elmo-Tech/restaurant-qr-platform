import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { CreateGuestOrderDto } from './dto/create-guest-order.dto';
import { PublicOrdersService } from './public-orders.service';
import type { GuestOrderView } from './public-orders.service';

/** Mirrors `PublicMenuController`'s exact QR_NOT_FOUND envelope -- the identical stable error for an unknown/inactive QR, a GENERIC QR, or an inactive Table (Section 3/5). */
const QR_NOT_FOUND_RESPONSE = {
  error: {
    code: 'QR_NOT_FOUND',
    message: 'This QR code is not available.',
  },
};

/** Section 6: at least one submitted Product is no longer orderable -- the WHOLE Order was rejected, none of it was created. */
const ORDER_ITEM_UNAVAILABLE_RESPONSE = {
  error: {
    code: 'ORDER_ITEM_UNAVAILABLE',
    message: 'One or more items in your order are no longer available.',
  },
};

const DUPLICATE_ITEMS_RESPONSE = {
  error: {
    code: 'VALIDATION_ERROR',
    message:
      'Each product/modifier-selection combination may appear only once in items, and modifierOptionIds must not repeat within one item.',
  },
};

/** FT-7: a GENERIC QR (Pickup) checkout is missing customer name and/or phone. */
const CUSTOMER_DETAILS_REQUIRED_RESPONSE = {
  error: {
    code: 'PICKUP_CUSTOMER_DETAILS_REQUIRED',
    message: 'Name and phone are required for a pickup order.',
  },
};

const PICKUP_BRANCH_REQUIRED_RESPONSE = {
  error: {
    code: 'PICKUP_BRANCH_REQUIRED',
    message: 'Please choose a pickup branch.',
  },
};

/** One indistinguishable response for an unknown, foreign, or INACTIVE Branch -- never reveals which. */
const PICKUP_BRANCH_INVALID_RESPONSE = {
  error: {
    code: 'PICKUP_BRANCH_INVALID',
    message: 'The selected pickup branch is not available.',
  },
};

const PICKUP_UNAVAILABLE_RESPONSE = {
  error: {
    code: 'PICKUP_UNAVAILABLE',
    message: 'Pickup ordering is not available right now.',
  },
};

interface GuestOrderResponseBody {
  data: GuestOrderView;
}

/**
 * FT-5: the one public Guest Order-creation endpoint,
 * `POST /api/v1/public/qr/:publicCode/orders`. Deliberately carries NONE of
 * AuthGuard/CsrfGuard/RestaurantAccessGuard/PermissionGuard, exactly like
 * `PublicMenuController` -- there is no Guest session/cookie for CSRF to
 * protect at all; `publicCode` alone is the authoritative Restaurant/
 * Branch/Table context, and every authoritative fact (which Products are
 * orderable, unit price, totals) is re-resolved server-side regardless of
 * what the request body claims (Section 4/5/6/8).
 *
 * No reusable Public rate limiter exists anywhere in this repository yet
 * (same documented gap as `PublicMenuController`, Section 28) -- this Fast
 * Track batch deliberately does NOT build a new rate-limiting subsystem for
 * it; adding Guest-facing rate limiting for public Order creation is
 * documented, deferred, pre-production follow-up work, not a silently
 * accepted gap. Idempotency (`clientRequestId`) is still enforced
 * regardless (Section 11/28).
 */
@Controller('public/qr')
export class PublicOrdersController {
  constructor(private readonly publicOrdersService: PublicOrdersService) {}

  @Post(':publicCode/orders')
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @Param('publicCode') publicCode: string,
    @Body() dto: CreateGuestOrderDto,
  ): Promise<GuestOrderResponseBody> {
    const result = await this.publicOrdersService.createOrder({
      publicCode,
      clientRequestId: dto.clientRequestId,
      items: dto.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        modifierOptionIds: item.modifierOptionIds ?? [],
      })),
      branchId: dto.branchId,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerNotes: dto.customerNotes,
    });

    if (result.outcome === 'customerDetailsRequired') {
      throw new BadRequestException(CUSTOMER_DETAILS_REQUIRED_RESPONSE);
    }
    if (result.outcome === 'branchRequired') {
      throw new BadRequestException(PICKUP_BRANCH_REQUIRED_RESPONSE);
    }
    if (result.outcome === 'branchInvalid') {
      throw new BadRequestException(PICKUP_BRANCH_INVALID_RESPONSE);
    }
    if (result.outcome === 'pickupUnavailable') {
      throw new ConflictException(PICKUP_UNAVAILABLE_RESPONSE);
    }
    if (result.outcome === 'qrNotFound') {
      throw new NotFoundException(QR_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'itemsUnavailable') {
      throw new ConflictException(ORDER_ITEM_UNAVAILABLE_RESPONSE);
    }
    if (result.outcome === 'duplicateItems') {
      throw new BadRequestException(DUPLICATE_ITEMS_RESPONSE);
    }

    return { data: result.data };
  }
}
