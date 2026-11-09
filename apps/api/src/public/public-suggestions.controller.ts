import {
  Body,
  Controller,
  UseGuards,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { PublicRestaurantHostGuard } from './public-restaurant-host.guard';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { PublicSuggestionsService } from './public-suggestions.service';

class SuggestionsRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  productIds!: string[];
}

/**
 * `POST /public/qr/{publicCode}/suggestions`: the products the Guest cart suggests, as ids of
 * the menu the page already holds (DEC-042). Unauthenticated like the rest of `/public/qr`; it
 * answers an empty list when suggestions are off, the code is unknown or there is nothing to
 * suggest, so it never reveals more than "no suggestions".
 */
@UseGuards(PublicRestaurantHostGuard)
@Controller('public/qr')
export class PublicSuggestionsController {
  constructor(private readonly suggestions: PublicSuggestionsService) {}

  @Post(':publicCode/suggestions')
  @HttpCode(HttpStatus.OK)
  async suggest(
    @Param('publicCode') publicCode: string,
    @Body() dto: SuggestionsRequestDto,
  ): Promise<{ data: { productIds: string[] } }> {
    const productIds = await this.suggestions.suggest({
      publicCode,
      productIds: dto.productIds,
    });
    return { data: { productIds } };
  }
}
