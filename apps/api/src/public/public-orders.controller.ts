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
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  RATE_LIMIT_GROUPS,
  RateLimitGroup,
} from '../common/rate-limit/rate-limit-group';
import { CreateGuestOrderDto } from './dto/create-guest-order.dto';
import { PublicOrdersService } from './public-orders.service';
import type {
  CreateGuestOrderInput,
  CreateGuestOrderResult,
  GuestOrderView,
} from './public-orders.service';
import {
  buildWhatsappMessage,
  buildWhatsappUrl,
} from './whatsapp-order-message';

/** Mirrors `PublicMenuController`'s exact QR_NOT_FOUND envelope -- the identical stable error for an unknown/inactive QR, a GENERIC QR, or an inactive Table (Section 3/5). */
/** What the Guest's device needs to hand the order to WhatsApp. */
export interface WhatsappOrderView {
  /** The full message, to show a preview or to copy. */
  message: string;
  /** wa.me link: opens WhatsApp on the Restaurant's number with the message ready to send. */
  whatsappUrl: string;
  total: string;
  currencyCode: string;
}

const WHATSAPP_ONLY_RESPONSE = {
  error: {
    code: 'ORDER_VIA_WHATSAPP_ONLY',
    message: 'This restaurant takes pickup and delivery orders on WhatsApp.',
  },
};

const WHATSAPP_UNAVAILABLE_RESPONSE = {
  error: {
    code: 'WHATSAPP_ORDERING_UNAVAILABLE',
    message: 'WhatsApp ordering is not available for this restaurant.',
  },
};

const BRANCH_CLOSED_RESPONSE = {
  error: {
    code: 'BRANCH_CLOSED',
    message: 'This branch is closed right now and is not taking orders.',
  },
};

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

/** Table Sessions: the table is locked by staff (a session was closed and no new one has been opened). Stable code for the Guest UI (decision P1); the message is a fallback only. */
/** DEC-038: the Restaurant switched Table ordering off; the Guest Menu is view-only. */
const ORDERING_DISABLED_RESPONSE = {
  error: {
    code: 'ORDERING_DISABLED',
    message: 'Ordering is not available through the menu right now.',
  },
};

const TABLE_ORDERING_UNAVAILABLE_RESPONSE = {
  error: {
    code: 'TABLE_ORDERING_UNAVAILABLE',
    message:
      'Ordering for this table is closed right now. Please ask a member of staff.',
  },
};

const DELIVERY_DETAILS_REQUIRED_RESPONSE = {
  error: {
    code: 'DELIVERY_DETAILS_REQUIRED',
    message:
      'Name, phone and delivery address are required for a delivery order.',
  },
};

const DELIVERY_UNAVAILABLE_RESPONSE = {
  error: {
    code: 'DELIVERY_UNAVAILABLE',
    message: 'Delivery ordering is not available right now.',
  },
};

/** One indistinguishable response for a missing, unknown, foreign, INACTIVE, or wrong-Branch delivery zone. */
const DELIVERY_ZONE_INVALID_RESPONSE = {
  error: {
    code: 'DELIVERY_ZONE_INVALID',
    message: 'The selected delivery area is not available.',
  },
};

function minimumOrderNotMetResponse(zoneName: string, minimumOrder: string) {
  return {
    error: {
      code: 'DELIVERY_MINIMUM_NOT_MET',
      message: 'The order is below the minimum for this delivery area.',
      details: { zoneName, minimumOrder },
    },
  };
}

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
  // FT-9: unauthenticated order creation -- counted by the tighter publicOrder throttler (per client IP).
  @RateLimitGroup(RATE_LIMIT_GROUPS.PUBLIC_ORDER)
  async createOrder(
    @Param('publicCode') publicCode: string,
    @Body() dto: CreateGuestOrderDto,
  ): Promise<GuestOrderResponseBody> {
    const result = await this.publicOrdersService.createOrder(
      this.toInput(publicCode, dto, {}),
    );
    this.refuse(result);
    if (result.outcome !== 'created')
      throw new NotFoundException(QR_NOT_FOUND_RESPONSE);
    return { data: result.data };
  }

  /**
   * DEC-042, WhatsApp ordering: the SAME validation and pricing as a real order (items, sizes,
   * extras, discounts, delivery zone and fee, minimum, opening hours, expected total), then
   * nothing is stored. The answer is the ready-to-send WhatsApp message and link, built from the
   * Backend's own numbers. Only when the Restaurant switched WhatsApp ordering on.
   */
  @Post(':publicCode/whatsapp-order')
  @HttpCode(HttpStatus.OK)
  @RateLimitGroup(RATE_LIMIT_GROUPS.PUBLIC_ORDER)
  async whatsappOrder(
    @Param('publicCode') publicCode: string,
    @Body() dto: CreateGuestOrderDto,
  ): Promise<{ data: WhatsappOrderView }> {
    const result = await this.publicOrdersService.createOrder(
      this.toInput(publicCode, dto, { channel: 'WHATSAPP', dryRun: true }),
    );
    this.refuse(result);
    if (result.outcome !== 'quoted')
      throw new NotFoundException(QR_NOT_FOUND_RESPONSE);
    const message = buildWhatsappMessage(result.quote);
    return {
      data: {
        message,
        whatsappUrl: buildWhatsappUrl(result.quote.whatsappNumber, message),
        total: result.quote.total,
        currencyCode: result.quote.currencyCode,
      },
    };
  }

  private toInput(
    publicCode: string,
    dto: CreateGuestOrderDto,
    extra: { channel?: 'APP' | 'WHATSAPP'; dryRun?: boolean },
  ): CreateGuestOrderInput {
    return {
      publicCode,
      clientRequestId: dto.clientRequestId,
      locale: dto.locale,
      expectedTotal: dto.expectedTotal,
      items: dto.items.map((item) => ({
        productId: item.productId,
        offerId: item.offerId,
        offerChoices: item.offerChoices?.map((choice) => ({
          slotId: choice.slotId,
          optionId: choice.optionId,
          quantity: choice.quantity,
        })),
        quantity: item.quantity,
        modifierOptionIds: item.modifierOptionIds ?? [],
        variantId: item.variantId ?? undefined,
      })),
      branchId: dto.branchId,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerNotes: dto.customerNotes,
      fulfillment: dto.fulfillment,
      deliveryZoneId: dto.deliveryZoneId,
      deliveryAddress: dto.deliveryAddress,
      deliveryBuilding: dto.deliveryBuilding,
      deliveryFloor: dto.deliveryFloor,
      deliveryApartment: dto.deliveryApartment,
      deliveryLandmark: dto.deliveryLandmark,
      ...extra,
    };
  }

  /** Turns every refusal into its stable HTTP error; returns only for `created` and `quoted`. */
  private refuse(result: CreateGuestOrderResult): void {
    if (result.outcome === 'customerDetailsRequired') {
      throw new BadRequestException(CUSTOMER_DETAILS_REQUIRED_RESPONSE);
    }
    if (result.outcome === 'invalidFields') {
      // Same envelope as a DTO failure (API_CONVENTIONS.md #34): VALIDATION_ERROR + one code per field.
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request contains invalid data.',
          details: { fields: result.errors },
        },
      });
    }
    if (result.outcome === 'branchRequired') {
      throw new BadRequestException(PICKUP_BRANCH_REQUIRED_RESPONSE);
    }
    if (result.outcome === 'branchInvalid') {
      throw new BadRequestException(PICKUP_BRANCH_INVALID_RESPONSE);
    }
    if (result.outcome === 'deliveryDetailsRequired') {
      throw new BadRequestException(DELIVERY_DETAILS_REQUIRED_RESPONSE);
    }
    if (result.outcome === 'deliveryZoneInvalid') {
      throw new BadRequestException(DELIVERY_ZONE_INVALID_RESPONSE);
    }
    if (result.outcome === 'deliveryUnavailable') {
      throw new ConflictException(DELIVERY_UNAVAILABLE_RESPONSE);
    }
    if (result.outcome === 'minimumOrderNotMet') {
      throw new BadRequestException(
        minimumOrderNotMetResponse(result.zoneName, result.minimumOrder),
      );
    }
    if (result.outcome === 'tableOrderingUnavailable') {
      throw new ConflictException(TABLE_ORDERING_UNAVAILABLE_RESPONSE);
    }
    if (result.outcome === 'tableOrderingDisabled') {
      throw new ConflictException(ORDERING_DISABLED_RESPONSE);
    }
    if (result.outcome === 'priceChanged') {
      // API_CONVENTIONS.md #75: 422 PRICE_CHANGED with the refreshed pricing.
      throw new UnprocessableEntityException({
        error: {
          code: 'PRICE_CHANGED',
          message:
            'The price of an item changed while you were ordering. Review the updated total and confirm again.',
          details: { pricing: result.pricing },
        },
      });
    }
    if (result.outcome === 'whatsappOnly') {
      throw new ConflictException(WHATSAPP_ONLY_RESPONSE);
    }
    if (result.outcome === 'whatsappUnavailable') {
      throw new ConflictException(WHATSAPP_UNAVAILABLE_RESPONSE);
    }
    if (result.outcome === 'branchClosed') {
      throw new ConflictException(BRANCH_CLOSED_RESPONSE);
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
    if (result.outcome === 'offerUnavailable') {
      // DEC-069: 409, nothing created; the Guest app keeps the cart line and says which offer is gone.
      throw new ConflictException({
        error: {
          code: 'OFFER_UNAVAILABLE',
          message: 'An offer in your order is not available right now.',
          details: { offerIds: result.offerIds },
        },
      });
    }
    if (result.outcome === 'offerChanged') {
      throw new ConflictException({
        error: {
          code: 'OFFER_CHANGED',
          message: 'An offer in your order has changed. Please choose again.',
          details: { offerIds: result.offerIds },
        },
      });
    }
  }
}
