import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PlatformAuthGuard,
  PlatformCsrfGuard,
  type PlatformRequest,
} from '../platform-guards';
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from '../../auth/password/password-hasher.service';
import {
  MAX_IMPORT_FILES,
  MAX_IMPORT_FILE_BYTES,
  type UploadedMenuFile,
} from '../../menu-import/menu-import-file';
import { MenuImportUploadErrorsInterceptor } from '../../menu-import/menu-import-upload-errors.interceptor';
import { onboardingImportStorage } from './onboarding-import-upload';
import { OnboardingMenuImportService } from './onboarding-menu-import.service';
import { OnboardingProvisioningService } from './onboarding-provisioning.service';
import { ONBOARDING_MODES, type OnboardingModeKey } from './onboarding-details';
import {
  OnboardingCasesService,
  type CaseOutcome,
  type OnboardingCaseSummary,
  type OnboardingCaseView,
  type OnboardingDuplicates,
  type RemovedCase,
} from './onboarding-cases.service';
import {
  ONBOARDING_STATUSES,
  REMOVAL_IMPACTS,
  type OnboardingStatusKey,
  type RemovalImpact,
} from './onboarding-transitions';

class ListQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(ONBOARDING_STATUSES)
  status?: OnboardingStatusKey;

  /** `true` lists only the cases removed from the active list (kept for history and restorable). */
  @IsOptional()
  @IsIn(['true', 'false'])
  archived?: 'true' | 'false';

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

class CancelBody extends RevisionBody {
  /** Explicit, operator-confirmed assertion: the purged READY demo was not handed off. */
  @IsOptional()
  @IsBoolean()
  confirmNotDelivered?: boolean;
}

class RemoveBody extends RevisionBody {
  /** The impacts the operator was shown and confirmed; the server requires every impact it finds now. */
  @IsArray()
  @ArrayMaxSize(REMOVAL_IMPACTS.length)
  @IsIn(REMOVAL_IMPACTS, { each: true })
  acknowledgedImpacts!: RemovalImpact[];

  /** Required for the READY purged-demo case only: the operator confirms the demo was never handed off. */
  @IsOptional()
  @IsBoolean()
  confirmNotDelivered?: boolean;
}

/**
 * `details` and `modeConfig` are only checked to be objects here: the service's strict allow-list
 * sanitizer decides every key (an unknown key such as `password` refuses the whole write).
 */
class ImportBody extends RevisionBody {
  @Type(() => Number)
  declare revision: number;
}

class GrantBody extends RevisionBody {
  @IsString()
  @Length(1, 500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  expiresAt?: string;
}

class ProvisionBody extends RevisionBody {
  @IsUUID('4')
  provisioningKey!: string;

  @IsOptional()
  @IsString()
  @Length(MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH)
  ownerPassword?: string;
}

class PatchBody extends RevisionBody {
  @IsOptional()
  @IsObject()
  menuDraft?: Record<string, unknown>;

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
    case 'removalRefused':
      throw new HttpException(
        {
          error: {
            code: 'ONBOARDING_REMOVE_REFUSED',
            message:
              result.refusal === 'PROVISIONING_ACTIVE'
                ? 'This case is being set up and cannot be removed now.'
                : result.refusal === 'HANDOFF_PENDING'
                  ? 'Finish or cancel the handoff before removing this case.'
                  : 'This case was already removed from the list.',
            details: { reason: result.refusal },
          },
        },
        HttpStatus.CONFLICT,
      );
    case 'removalConfirmationRequired':
      throw new HttpException(
        {
          error: {
            code: 'ONBOARDING_REMOVE_CONFIRMATION_REQUIRED',
            message: 'Confirm what removing this case affects, then try again.',
            details: { impacts: result.impacts },
          },
        },
        HttpStatus.CONFLICT,
      );
    case 'handoffUnavailable':
      throw new HttpException(
        {
          error: {
            code: result.code,
            message:
              result.code === 'ONBOARDING_DEMO_EXPIRED'
                ? 'The temporary demo is no longer available.'
                : 'The Guest Menu is not ready to hand off.',
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
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
            message:
              'Complete the required onboarding fields before continuing.',
            problems: [
              ...result.problems.customer,
              ...result.problems.mode,
              ...(result.problems.menu ?? []),
            ],
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
  constructor(
    private readonly cases: OnboardingCasesService,
    private readonly provisioning: OnboardingProvisioningService,
    private readonly menuImport: OnboardingMenuImportService,
  ) {}

  @Get()
  @UseGuards(PlatformAuthGuard)
  async list(@Query() query: ListQuery): Promise<{
    data: OnboardingCaseSummary[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const result = await this.cases.list({
      search: query.search,
      status: query.status,
      archived: query.archived === 'true',
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
        menuDraft: body.menuDraft,
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

  @Post(':caseId/provision')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async provision(
    @Param('caseId') caseId: string,
    @Body() body: ProvisionBody,
    @Req() request: PlatformRequest,
  ) {
    return unwrap(
      await this.provisioning.run(request.platformAdmin, caseId, body, false),
    );
  }

  @Post(':caseId/retry')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async retry(
    @Param('caseId') caseId: string,
    @Body() body: ProvisionBody,
    @Req() request: PlatformRequest,
  ) {
    return unwrap(
      await this.provisioning.run(request.platformAdmin, caseId, body, true),
    );
  }

  @Post(':caseId/deliver')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async deliver(
    @Param('caseId') caseId: string,
    @Body() body: RevisionBody,
    @Req() request: PlatformRequest,
  ): Promise<{ data: OnboardingCaseView }> {
    return unwrap(
      await this.cases.deliver(request.platformAdmin, caseId, body.revision),
    );
  }

  @Post(':caseId/menu-import/grant')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async grantImport(
    @Param('caseId') id: string,
    @Body() body: GrantBody,
    @Req() request: PlatformRequest,
  ) {
    return unwrap(
      await this.menuImport.setGrant(
        request.platformAdmin,
        id,
        body.revision,
        body.reason,
        body.expiresAt,
        false,
      ),
    );
  }

  @Post(':caseId/menu-import/revoke')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async revokeImport(
    @Param('caseId') id: string,
    @Body() body: GrantBody,
    @Req() request: PlatformRequest,
  ) {
    return unwrap(
      await this.menuImport.setGrant(
        request.platformAdmin,
        id,
        body.revision,
        body.reason,
        undefined,
        true,
      ),
    );
  }

  @Post(':caseId/menu-import')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  @UseInterceptors(
    MenuImportUploadErrorsInterceptor,
    FilesInterceptor('file', MAX_IMPORT_FILES, {
      storage: onboardingImportStorage,
      limits: {
        fileSize: MAX_IMPORT_FILE_BYTES + 1,
        files: MAX_IMPORT_FILES,
        fields: 1,
        fieldSize: 32,
      },
    }),
  )
  async stageMenu(
    @Param('caseId') caseId: string,
    @Body() body: ImportBody,
    @UploadedFiles() files: UploadedMenuFile[] | undefined,
    @Req() request: PlatformRequest,
  ) {
    return unwrap(
      await this.menuImport.stage(
        request.platformAdmin,
        caseId,
        body.revision,
        files,
      ),
    );
  }

  @Post(':caseId/menu-import/review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async reviewMenu(
    @Param('caseId') caseId: string,
    @Body() body: RevisionBody,
    @Req() request: PlatformRequest,
  ) {
    return unwrap(
      await this.menuImport.reviewOrDiscard(
        request.platformAdmin,
        caseId,
        body.revision,
        false,
      ),
    );
  }

  @Delete(':caseId/menu-import')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async discardMenu(
    @Param('caseId') caseId: string,
    @Body() body: RevisionBody,
    @Req() request: PlatformRequest,
  ) {
    return unwrap(
      await this.menuImport.reviewOrDiscard(
        request.platformAdmin,
        caseId,
        body.revision,
        true,
      ),
    );
  }

  /** Removes the case from the active list: cancel (existing rules) + archive, or archive only. Never a delete. */
  @Post(':caseId/remove')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async remove(
    @Param('caseId') caseId: string,
    @Body() body: RemoveBody,
    @Req() request: PlatformRequest,
  ): Promise<{ data: RemovedCase }> {
    return unwrap(
      await this.cases.remove(request.platformAdmin, caseId, {
        revision: body.revision,
        acknowledgedImpacts: body.acknowledgedImpacts,
        confirmNotDelivered: body.confirmNotDelivered === true,
      }),
    );
  }

  @Post(':caseId/restore')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async restore(
    @Param('caseId') caseId: string,
    @Body() body: RevisionBody,
    @Req() request: PlatformRequest,
  ): Promise<{ data: OnboardingCaseView }> {
    return unwrap(
      await this.cases.restore(request.platformAdmin, caseId, body.revision),
    );
  }

  @Post(':caseId/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async cancel(
    @Param('caseId') caseId: string,
    @Body() body: CancelBody,
    @Req() request: PlatformRequest,
  ): Promise<{ data: OnboardingCaseView }> {
    return unwrap(
      await this.cases.cancel(
        request.platformAdmin,
        caseId,
        body.revision,
        body.confirmNotDelivered === true,
      ),
    );
  }
}
