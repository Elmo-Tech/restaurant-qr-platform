import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  PlatformAuthGuard,
  PlatformCsrfGuard,
  type PlatformRequest,
} from '../platform-guards';
import {
  PlatformRequestsService,
  type RequestFilter,
  type SubscriptionRequestView,
} from './platform-requests.service';

class ListQuery {
  @IsOptional()
  @IsIn(['open', 'all'])
  filter?: RequestFilter;
}

class UpdateBody {
  @IsIn(['NEW', 'CONTACTED', 'DONE', 'DISMISSED'])
  status!: 'NEW' | 'CONTACTED' | 'DONE' | 'DISMISSED';

  /** Missing = keep the note; an empty text clears it. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const next = typeof value === 'string' ? value.trim() : value;
    return next === '' ? null : next;
  })
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

/** The inbox of upgrade and renewal requests (DEC-050), `/api/v1/platform/subscription-requests`. */
@Controller('platform/subscription-requests')
@UseGuards(PlatformCsrfGuard)
export class PlatformRequestsController {
  constructor(private readonly requests: PlatformRequestsService) {}

  @Get()
  @UseGuards(PlatformAuthGuard)
  async list(
    @Query() query: ListQuery,
  ): Promise<{ data: SubscriptionRequestView[] }> {
    return { data: await this.requests.list(query.filter ?? 'open') };
  }

  @Patch(':requestId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async update(
    @Param('requestId') requestId: string,
    @Body() body: UpdateBody,
    @Req() request: PlatformRequest,
  ): Promise<{ data: SubscriptionRequestView }> {
    const result = await this.requests.update(
      request.platformAdmin,
      requestId,
      {
        status: body.status,
        note: body.note,
      },
    );
    if (result.outcome !== 'ok') {
      throw new NotFoundException({
        error: { code: 'REQUEST_NOT_FOUND', message: 'Request not found.' },
      });
    }
    return { data: result.data };
  }
}
