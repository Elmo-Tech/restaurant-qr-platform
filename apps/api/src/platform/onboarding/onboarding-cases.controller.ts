import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PlatformAuthGuard,
  PlatformCsrfGuard,
  type PlatformRequest,
} from '../platform-guards';
import { ONBOARDING_MODES, type OnboardingModeKey } from './onboarding-details';
import {
  OnboardingCasesService,
  type CaseOutcome,
  type OnboardingCaseSummary,
  type OnboardingCaseView,
  type OnboardingDuplicates,
} from './onboarding-cases.service';
import {
  ONBOARDING_STATUSES,
  type OnboardingStatusKey,
} from './onboarding-transitions';

class ListQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(ONBOARDING_STATUSES)
  status?: OnboardingStatusKey;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

class CreateBody {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  leadId?: string | null;
}

class RevisionBody {
  @IsInt()
  @Min(1)
  revision!: number;
}

/**
 * `details` and `modeConfig` are only checked to be objects here: the service's strict allow-list
 * sanitizer decides every key (an unknown key such as `password` refuses the whole write).
 */
class PatchBody extends RevisionBody {
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  modeConfig?: Record<string, unknown>;

  // IsOptional also lets `null` through: null clears the mode.
  @IsOptional()
  @IsIn(ONBOARDING_MODES)
  mode?: OnboardingModeKey | null;
}

const NOT_FOUND = {
  error: {
    code: 'ONBOARDING_CASE_NOT_FOUND',
    message: 'Onboarding case not found.',
  },
};

/** Maps a service refusal to the platform error envelope; returns the data otherwise. */
function unwrap<T>(result: CaseOutcome<T>): { data: T } {
  switch (result.outcome) {
    case 'ok':
      return { data: result.data };
    case 'notFound':
      throw new HttpException(NOT_FOUND, HttpStatus.NOT_FOUND);
    case 'revisionConflict':
      throw new HttpException(
        {
          error: {
            code: 'ONBOARDING_REVISION_CONFLICT',
            message:
              'The case was changed by someone else. Reload it and try again.',
            details: { currentRevision: result.currentRevision },
          },
        },
        HttpStatus.CONFLICT,
      );
    case 'notEditable':
      throw new HttpException(
        {
          error: {
            code: 'ONBOARDING_NOT_EDITABLE',
            message: 'This case can no longer be edited.',
            details: { status: result.status },
          },
        },
        HttpStatus.CONFLICT,
      );
    case 'invalidTransition':
      throw new HttpException(
        {
          error: {
            code: 'ONBOARDING_INVALID_TRANSITION',
            message: 'This action is not possible in the current status.',
            details: { status: result.status },
          },
        },
        HttpStatus.CONFLICT,
      );
    case 'invalidInput':
      throw new HttpException(
        {
          error: {
            code: 'ONBOARDING_INPUT_INVALID',
            message: 'The case contains fields that are not allowed.',
            problems: result.problems,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    case 'incomplete':
      throw new HttpException(
        {
          error: {
            code: 'ONBOARDING_INCOMPLETE',
            message: 'Steps 1 and 2 must be complete before review.',
            problems: [...result.problems.customer, ...result.problems.mode],
            details: result.problems,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
  }
}

/** Owner onboarding cases (PROPOSED, milestones A1 + A2), `/api/v1/platform/onboarding-cases`. */
@Controller('platform/onboarding-cases')
@UseGuards(PlatformCsrfGuard)
export class OnboardingCasesController {
  constructor(private readonly cases: OnboardingCasesService) {}

  @Get()
  @UseGuards(PlatformAuthGuard)
  async list(@Query() query: ListQuery): Promise<{
    data: OnboardingCaseSummary[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const result = await this.cases.list({
      search: query.search,
      status: query.status,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
    return {
      data: result.items,
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    };
  }

  @Post()
  @UseGuards(PlatformAuthGuard)
  async create(
    @Body() body: CreateBody,
    @Req() request: PlatformRequest,
  ): Promise<{ data: OnboardingCaseView }> {
    const result = await this.cases.create(request.platformAdmin, {
      leadId: body.leadId ?? null,
    });
    switch (result.outcome) {
      case 'created':
        return { data: result.data };
      case 'leadNotFound':
        throw new HttpException(
          { error: { code: 'LEAD_NOT_FOUND', message: 'Request not found.' } },
          HttpStatus.NOT_FOUND,
        );
      case 'leadInProgress':
        throw new HttpException(
          {
            error: {
              code: 'ONBOARDING_LEAD_IN_PROGRESS',
              message: 'This request already has an open onboarding case.',
              details: { caseId: result.caseId },
            },
          },
          HttpStatus.CONFLICT,
        );
    }
  }

  @Get(':caseId')
  @UseGuards(PlatformAuthGuard)
  async get(
    @Param('caseId') caseId: string,
  ): Promise<{ data: OnboardingCaseView }> {
    return unwrap(await this.cases.get(caseId));
  }

  @Get(':caseId/duplicates')
  @UseGuards(PlatformAuthGuard)
  async duplicates(
    @Param('caseId') caseId: string,
  ): Promise<{ data: OnboardingDuplicates }> {
    return unwrap(await this.cases.duplicates(caseId));
  }

  @Patch(':caseId')
  @UseGuards(PlatformAuthGuard)
  async update(
    @Param('caseId') caseId: string,
    @Body() body: PatchBody,
    @Req() request: PlatformRequest,
  ): Promise<{ data: OnboardingCaseView }> {
    return unwrap(
      await this.cases.update(request.platformAdmin, caseId, {
        revision: body.revision,
        details: body.details,
        modeConfig: body.modeConfig,
        mode: body.mode,
      }),
    );
  }

  @Post(':caseId/submit-for-review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async submit(
    @Param('caseId') caseId: string,
    @Body() body: RevisionBody,
    @Req() request: PlatformRequest,
  ): Promise<{ data: OnboardingCaseView }> {
    return unwrap(
      await this.cases.submitForReview(
        request.platformAdmin,
        caseId,
        body.revision,
      ),
    );
  }

  @Post(':caseId/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async cancel(
    @Param('caseId') caseId: string,
    @Body() body: RevisionBody,
    @Req() request: PlatformRequest,
  ): Promise<{ data: OnboardingCaseView }> {
    return unwrap(
      await this.cases.cancel(request.platformAdmin, caseId, body.revision),
    );
  }
}
