import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AiSettingsError,
  type AiKeyView,
  type AiSettingsErrorCode,
  type AiSettingsView,
} from '../ai-settings/ai-settings.service';
import {
  AddPlatformAiKeyDto,
  UpdatePlatformAiKeyDto,
  UpdatePlatformAiSettingsDto,
} from './dto/platform-ai.dto';
import {
  PlatformAiService,
  type KeyTestView,
  type PlatformAiOverview,
} from './platform-ai.service';
import {
  PlatformAuthGuard,
  PlatformCsrfGuard,
  type PlatformRequest,
} from './platform-guards';

const REFUSALS: Record<
  AiSettingsErrorCode,
  { status: HttpStatus; message: string }
> = {
  ENCRYPTION_NOT_CONFIGURED: {
    status: HttpStatus.CONFLICT,
    message:
      'The server has no encryption key for model keys yet (AI_KEYS_ENCRYPTION_KEY).',
  },
  KEY_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The key is not a valid API key.',
  },
  KEY_DUPLICATE: {
    status: HttpStatus.CONFLICT,
    message: 'This key is already saved.',
  },
  KEY_LIMIT: {
    status: HttpStatus.CONFLICT,
    message: 'The maximum number of keys is saved.',
  },
  KEY_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Key not found.' },
  KEY_UNREADABLE: {
    status: HttpStatus.CONFLICT,
    message:
      'The key cannot be read with the current encryption key. Delete it and add it again.',
  },
  LABEL_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The label must be 1 to 60 characters.',
  },
  MODEL_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The model name is not valid.',
  },
  KEYS_MISSING: {
    status: HttpStatus.CONFLICT,
    message:
      'The direct engine needs at least one active key. Switch to n8n first, or add another key.',
  },
};

/** Turns a refusal of the AI settings into the documented error envelope; anything else stays a server error. */
async function refusing<T>(run: Promise<T>): Promise<T> {
  try {
    return await run;
  } catch (error) {
    if (error instanceof AiSettingsError) {
      const refusal = REFUSALS[error.code];
      throw new HttpException(
        { error: { code: error.code, message: refusal.message } },
        refusal.status,
      );
    }
    throw error;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id is a missing key, never a database error. */
function keyIdOf(raw: string): string {
  if (!UUID.test(raw)) {
    throw new HttpException(
      {
        error: {
          code: 'KEY_NOT_FOUND',
          message: REFUSALS.KEY_NOT_FOUND.message,
        },
      },
      HttpStatus.NOT_FOUND,
    );
  }
  return raw;
}

/**
 * The AI section of the console (DEC-059), `/api/v1/platform/settings/ai`: the engine that reads a menu, the model
 * and its fallback, and the pool of model keys. A key value goes in once (`POST .../keys`) and never comes out.
 */
@Controller('platform/settings/ai')
@UseGuards(PlatformCsrfGuard)
export class PlatformAiController {
  constructor(private readonly ai: PlatformAiService) {}

  @Get()
  @UseGuards(PlatformAuthGuard)
  async overview(): Promise<{ data: PlatformAiOverview }> {
    return { data: await this.ai.overview() };
  }

  @Put()
  @UseGuards(PlatformAuthGuard)
  async update(
    @Body() body: UpdatePlatformAiSettingsDto,
    @Req() request: PlatformRequest,
  ): Promise<{ data: AiSettingsView }> {
    return {
      data: await refusing(
        this.ai.updateSettings(request.platformAdmin, {
          engine: body.engine,
          model: body.model,
          fallbackModel: body.fallbackModel,
        }),
      ),
    };
  }

  @Post('keys')
  @UseGuards(PlatformAuthGuard)
  async addKey(
    @Body() body: AddPlatformAiKeyDto,
    @Req() request: PlatformRequest,
  ): Promise<{ data: AiKeyView }> {
    return {
      data: await refusing(
        this.ai.addKey(request.platformAdmin, {
          label: body.label,
          secret: body.secret,
        }),
      ),
    };
  }

  @Patch('keys/:keyId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async updateKey(
    @Param('keyId') keyId: string,
    @Body() body: UpdatePlatformAiKeyDto,
    @Req() request: PlatformRequest,
  ): Promise<{ data: AiKeyView }> {
    return {
      data: await refusing(
        this.ai.updateKey(request.platformAdmin, keyIdOf(keyId), {
          label: body.label,
          status: body.status,
        }),
      ),
    };
  }

  @Delete('keys/:keyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PlatformAuthGuard)
  async deleteKey(
    @Param('keyId') keyId: string,
    @Req() request: PlatformRequest,
  ): Promise<void> {
    await refusing(this.ai.deleteKey(request.platformAdmin, keyIdOf(keyId)));
  }

  @Post('keys/:keyId/test')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAuthGuard)
  async testKey(@Param('keyId') keyId: string): Promise<{ data: KeyTestView }> {
    return { data: await refusing(this.ai.testKey(keyIdOf(keyId))) };
  }
}
