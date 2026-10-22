import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CountryBodyDto,
  PaymentBodyDto,
  SubscriptionBodyDto,
  TrialBodyDto,
  UpdateTrialBodyDto,
  VoidPaymentBodyDto,
} from '../dto/billing.dto';
import {
  PlatformAuthGuard,
  PlatformCsrfGuard,
  type PlatformRequest,
} from '../platform-guards';
import {
  PlatformBillingService,
  type BillingOutcome,
  type BillingRefusal,
  type BillingView,
  type ContractView,
  type SubscriptionInput,
  type TrialInput,
  type SubscriptionPreview,
  type SubscriptionView,
} from './platform-billing.service';
import type { BillingCurrency } from './pricing';

const REFUSALS: Record<
  BillingRefusal,
  { status: HttpStatus; code: string; message: string }
> = {
  RESTAURANT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    code: 'RESTAURANT_NOT_FOUND',
    message: 'Restaurant not found.',
  },
  PACKAGE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    code: 'PACKAGE_NOT_FOUND',
    message: 'Package not found.',
  },
  PACKAGE_ARCHIVED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: 'PACKAGE_ARCHIVED',
    message: 'An archived package cannot be given to a restaurant.',
  },
  PRICE_NOT_SET: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: 'PACKAGE_PRICE_NOT_SET',
    message:
      'This package has no price for the restaurant currency and period. Set it on the package first.',
  },
  OVERLAP: {
    status: HttpStatus.CONFLICT,
    code: 'SUBSCRIPTION_OVERLAP',
    message: 'This period overlaps another subscription of the restaurant.',
  },
  INVALID_DATE: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: 'DATE_INVALID',
    message: 'The date is not a real calendar date.',
  },
  INVALID_DISCOUNT: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: 'DISCOUNT_INVALID',
    message:
      'A percentage discount must be above 0 up to 100; an amount discount must be above 0.',
  },
  INVALID_AMOUNT: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: 'AMOUNT_INVALID',
    message: 'The amount must be above 0 with at most two decimals.',
  },
  INVALID_COUNTRY: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: 'COUNTRY_INVALID',
    message: 'The country must be a two-letter code such as EG.',
  },
  SUBSCRIPTION_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    code: 'SUBSCRIPTION_NOT_FOUND',
    message: 'Subscription not found.',
  },
  SUBSCRIPTION_CANCELLED: {
    status: HttpStatus.CONFLICT,
    code: 'SUBSCRIPTION_CANCELLED',
    message: 'This subscription is cancelled.',
  },
  ALREADY_CANCELLED: {
    status: HttpStatus.CONFLICT,
    code: 'SUBSCRIPTION_ALREADY_CANCELLED',
    message: 'This subscription is already cancelled.',
  },
  PAYMENT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    code: 'PAYMENT_NOT_FOUND',
    message: 'Payment not found.',
  },
  ALREADY_VOIDED: {
    status: HttpStatus.CONFLICT,
    code: 'PAYMENT_ALREADY_VOIDED',
    message: 'This payment is already voided.',
  },
  TRIAL_DISABLED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: 'TRIAL_DISABLED',
    message: 'Free trials are disabled.',
  },
  NOT_A_TRIAL: {
    status: HttpStatus.CONFLICT,
    code: 'NOT_A_TRIAL',
    message: 'This subscription is not a trial.',
  },
  TRIAL_PAYMENT_NOT_ALLOWED: {
    status: HttpStatus.CONFLICT,
    code: 'TRIAL_PAYMENT_NOT_ALLOWED',
    message: 'Payments cannot be recorded on a free trial.',
  },
};

/** The data of an accepted billing change, or the HTTP error for a refused one. */
function unwrap<T>(result: BillingOutcome<T>): { data: T } {
  if (result.outcome === 'ok') return { data: result.data };
  const { status, code, message } = REFUSALS[result.outcome];
  throw new HttpException({ error: { code, message } }, status);
}

const toInput = (body: SubscriptionBodyDto): SubscriptionInput => ({
  packageId: body.packageId,
  period: body.period,
  startsAt: body.startsAt ?? null,
  discount: body.discount
    ? { type: body.discount.type, value: body.discount.value }
    : null,
  notes: body.notes ?? null,
});

const toTrialInput = (body: TrialBodyDto): TrialInput => ({
  packageId: body.packageId,
  startsAt: body.startsAt ?? null,
  durationDays: body.durationDays,
  notes: body.notes ?? null,
});

/**
 * Manual billing routes of the platform console (DEC-049): a Restaurant's subscriptions, their
 * payment ledger and contracts. Same Origin check and Platform Administrator session as the rest of
 * `/platform`.
 */
@Controller('platform')
@UseGuards(PlatformCsrfGuard)
export class PlatformBillingController {
  constructor(private readonly billing: PlatformBillingService) {}

  @Get('restaurants/:restaurantId/billing')
  @UseGuards(PlatformAuthGuard)
  async getBilling(
    @Param('restaurantId') restaurantId: string,
  ): Promise<{ data: BillingView }> {
    return unwrap(await this.billing.billing(restaurantId));
  }

  @Put('restaurants/:restaurantId/country')
  @UseGuards(PlatformAuthGuard)
  async setCountry(
    @Param('restaurantId') restaurantId: string,
    @Body() body: CountryBodyDto,
    @Req() request: PlatformRequest,
  ): Promise<{
    data: { countryCode: string; billingCurrency: BillingCurrency };
  }> {
    return unwrap(
      await this.billing.setCountry(
        request.platformAdmin,
        restaurantId,
        body.countryCode,
      ),
    );
  }

  /** The price and dates a subscription would get. Writes nothing. */
  @Post('restaurants/:restaurantId/subscriptions/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async preview(
    @Param('restaurantId') restaurantId: string,
    @Body() body: SubscriptionBodyDto,
  ): Promise<{ data: SubscriptionPreview }> {
    return unwrap(await this.billing.preview(restaurantId, toInput(body)));
  }

  @Post('restaurants/:restaurantId/subscriptions')
  @UseGuards(PlatformAuthGuard)
  async createSubscription(
    @Param('restaurantId') restaurantId: string,
    @Body() body: SubscriptionBodyDto,
    @Req() request: PlatformRequest,
  ): Promise<{ data: SubscriptionView }> {
    return unwrap(
      await this.billing.create(
        request.platformAdmin,
        restaurantId,
        toInput(body),
      ),
    );
  }

  @Post('restaurants/:restaurantId/trials')
  @UseGuards(PlatformAuthGuard)
  async createTrial(
    @Param('restaurantId') restaurantId: string,
    @Body() body: TrialBodyDto,
    @Req() request: PlatformRequest,
  ): Promise<{ data: SubscriptionView }> {
    return unwrap(
      await this.billing.createTrial(
        request.platformAdmin,
        restaurantId,
        toTrialInput(body),
      ),
    );
  }

  @Put('subscriptions/:subscriptionId/trial')
  @UseGuards(PlatformAuthGuard)
  async updateTrial(
    @Param('subscriptionId') subscriptionId: string,
    @Body() body: UpdateTrialBodyDto,
    @Req() request: PlatformRequest,
  ): Promise<{ data: SubscriptionView }> {
    return unwrap(
      await this.billing.updateTrial(
        request.platformAdmin,
        subscriptionId,
        body.endsAt,
      ),
    );
  }

  @Post('subscriptions/:subscriptionId/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async cancelSubscription(
    @Param('subscriptionId') subscriptionId: string,
    @Req() request: PlatformRequest,
  ): Promise<{ data: SubscriptionView }> {
    return unwrap(
      await this.billing.cancel(request.platformAdmin, subscriptionId),
    );
  }

  @Post('subscriptions/:subscriptionId/payments')
  @UseGuards(PlatformAuthGuard)
  async recordPayment(
    @Param('subscriptionId') subscriptionId: string,
    @Body() body: PaymentBodyDto,
    @Req() request: PlatformRequest,
  ): Promise<{ data: SubscriptionView }> {
    return unwrap(
      await this.billing.recordPayment(request.platformAdmin, subscriptionId, {
        amount: body.amount,
        method: body.method,
        paidAt: body.paidAt,
        reference: body.reference ?? null,
        notes: body.notes ?? null,
      }),
    );
  }

  @Post('subscriptions/:subscriptionId/payments/:paymentId/void')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async voidPayment(
    @Param('subscriptionId') subscriptionId: string,
    @Param('paymentId') paymentId: string,
    @Body() body: VoidPaymentBodyDto,
    @Req() request: PlatformRequest,
  ): Promise<{ data: SubscriptionView }> {
    return unwrap(
      await this.billing.voidPayment(
        request.platformAdmin,
        subscriptionId,
        paymentId,
        body.reason,
      ),
    );
  }

  @Get('subscriptions/:subscriptionId/contract')
  @UseGuards(PlatformAuthGuard)
  async getContract(
    @Param('subscriptionId') subscriptionId: string,
  ): Promise<{ data: ContractView }> {
    return unwrap(await this.billing.contract(subscriptionId));
  }
}
