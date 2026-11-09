import {
  Controller,
  UseGuards,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { PublicRestaurantHostGuard } from './public-restaurant-host.guard';
import { PublicMenuService } from './public-menu.service';
import type { PublicMenuData } from './public-menu.service';

/**
 * QR_SPEC.md #47/#48: one stable, safe-to-render-friendly-copy-from error
 * for an unknown `publicCode`, an INACTIVE QR, or a suspended/inactive
 * Restaurant -- these never distinguish from one another in the public
 * response (never leaks *why* a QR does not resolve).
 */
const QR_NOT_FOUND_RESPONSE = {
  error: {
    code: 'QR_NOT_FOUND',
    message: 'This QR code is not available.',
  },
};

/** FT-3, Section 4: the Restaurant has no ACTIVE primary Menu right now -- a distinct outcome from an invalid QR, since the QR itself resolved fine. */
const MENU_NOT_AVAILABLE_RESPONSE = {
  error: {
    code: 'MENU_NOT_AVAILABLE',
    message: 'This restaurant menu is temporarily unavailable.',
  },
};

interface PublicMenuResponseBody {
  data: PublicMenuData;
}

/**
 * FT-3: the one public Guest Menu endpoint,
 * `GET /api/v1/public/qr/:publicCode/menu`. Deliberately carries NONE of
 * AuthGuard/CsrfGuard/RestaurantAccessGuard/PermissionGuard (Section 11) --
 * this is public, read-only, unauthenticated content. `publicCode` alone is
 * the authoritative Restaurant/QR context; nothing here ever accepts or
 * trusts a client-supplied Restaurant id.
 *
 * No reusable Public rate limiter exists anywhere in this repository yet.
 * Per Section 11, this Fast Track batch deliberately does NOT build a new
 * rate-limiting subsystem for it -- adding Guest-facing rate limiting for
 * public QR/Menu endpoints is documented, deferred follow-up work, not a
 * silently-accepted gap.
 */
@UseGuards(PublicRestaurantHostGuard)
@Controller('public/qr')
export class PublicMenuController {
  constructor(private readonly publicMenuService: PublicMenuService) {}

  @Get(':publicCode/menu')
  @HttpCode(HttpStatus.OK)
  async getPublicMenu(
    @Param('publicCode') publicCode: string,
    @Query('lang') lang: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<PublicMenuResponseBody> {
    const result = await this.publicMenuService.getPublicMenu({
      publicCode,
      explicitLang: lang ?? null,
      acceptLanguageHeader: acceptLanguage ?? null,
    });

    if (result.outcome === 'qrNotFound') {
      throw new NotFoundException(QR_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'menuNotAvailable') {
      // A Restaurant with an exclusive design also tells the page whom it is for, so the page can be branded.
      throw new NotFoundException(
        result.branding
          ? {
              error: {
                ...MENU_NOT_AVAILABLE_RESPONSE.error,
                branding: result.branding,
              },
            }
          : MENU_NOT_AVAILABLE_RESPONSE,
      );
    }

    return { data: result.data };
  }

  /**
   * Table Sessions: the advisory Table QR ordering availability, for the Guest
   * "Check again" action. Read-only and unauthenticated like the menu; reveals
   * only `AVAILABLE | CLOSED | DISABLED`, never session, bill or payment data.
   */
  @Get(':publicCode/table-ordering')
  @HttpCode(HttpStatus.OK)
  async getTableOrdering(
    @Param('publicCode') publicCode: string,
  ): Promise<{ data: { tableOrdering: 'AVAILABLE' | 'CLOSED' | 'DISABLED' } }> {
    const result = await this.publicMenuService.getTableOrdering(publicCode);
    if (result.outcome === 'qrNotFound') {
      throw new NotFoundException(QR_NOT_FOUND_RESPONSE);
    }
    return { data: { tableOrdering: result.tableOrdering } };
  }
}
