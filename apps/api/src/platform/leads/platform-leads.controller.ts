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
  PlatformLeadsService,
  type LeadFilter,
  type LeadStatusKey,
  type SignupLeadView,
} from './platform-leads.service';

class ListQuery {
  @IsOptional()
  @IsIn(['open', 'all'])
  filter?: LeadFilter;
}

class UpdateBody {
  @IsIn(['NEW', 'CONTACTED', 'DONE', 'DISMISSED'])
  status!: LeadStatusKey;

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

/** The inbox of landing page requests (DEC-053), `/api/v1/platform/leads`. */
@Controller('platform/leads')
@UseGuards(PlatformCsrfGuard)
export class PlatformLeadsController {
  constructor(private readonly leads: PlatformLeadsService) {}

  @Get()
  @UseGuards(PlatformAuthGuard)
  async list(@Query() query: ListQuery): Promise<{ data: SignupLeadView[] }> {
    return { data: await this.leads.list(query.filter ?? 'open') };
  }

  @Patch(':leadId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async update(
    @Param('leadId') leadId: string,
    @Body() body: UpdateBody,
    @Req() request: PlatformRequest,
  ): Promise<{ data: SignupLeadView }> {
    const result = await this.leads.update(request.platformAdmin, leadId, {
      status: body.status,
      note: body.note,
    });
    if (result.outcome !== 'ok') {
      throw new NotFoundException({
        error: { code: 'LEAD_NOT_FOUND', message: 'Request not found.' },
      });
    }
    return { data: result.data };
  }
}
