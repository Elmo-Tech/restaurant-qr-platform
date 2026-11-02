import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DEFAULT_DEMO_KIND } from '../demo/demo-constants';
import { DemoService, type DemoView } from '../demo/demo.service';
import {
  CreatePlatformDemoDto,
  ExtendPlatformDemoDto,
} from './dto/platform-demo.dto';
import { PlatformAuditService } from './platform-audit.service';
import {
  PlatformAuthGuard,
  PlatformCsrfGuard,
  type PlatformRequest,
} from './platform-guards';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): HttpException {
  return new HttpException(
    { error: { code: 'DEMO_NOT_FOUND', message: 'Demo not found.' } },
    HttpStatus.NOT_FOUND,
  );
}
function invalid(problems: string[]): HttpException {
  return new HttpException(
    {
      error: {
        code: 'DEMO_INVALID',
        message: 'The demo settings are not valid.',
        problems,
      },
    },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}
const idOf = (raw: string): string => {
  if (!UUID.test(raw)) throw notFound();
  return raw;
};

/**
 * The Demos section of the console (DEC-060), `/api/v1/platform/demos`: create a temporary demo restaurant for a
 * prospect, copy its secret link, extend it, or remove it now. The link is returned once, when it is made.
 */
@Controller('platform/demos')
@UseGuards(PlatformCsrfGuard)
export class PlatformDemoController {
  constructor(
    private readonly demos: DemoService,
    private readonly audit: PlatformAuditService,
  ) {}

  @Get()
  @UseGuards(PlatformAuthGuard)
  async list(): Promise<{ data: DemoView[] }> {
    return { data: await this.demos.list() };
  }

  @Post()
  @UseGuards(PlatformAuthGuard)
  async create(
    @Body() body: CreatePlatformDemoDto,
    @Req() request: PlatformRequest,
  ): Promise<{ data: { demo: DemoView; link: string } }> {
    const result = await this.demos.create({
      label: body.label,
      hours: body.hours,
      packageId: body.packageId ?? null,
      kind: body.kind ?? DEFAULT_DEMO_KIND,
    });
    if (result.outcome === 'invalidInput') throw invalid(result.problems);
    if (result.outcome === 'limitReached') {
      throw new HttpException(
        {
          error: {
            code: 'DEMO_LIMIT_REACHED',
            message: `At most ${result.max} demos can exist at once.`,
          },
        },
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.record({
      admin: request.platformAdmin,
      action: 'platform.demo_created',
      restaurant: { id: result.demo.id, name: result.demo.label },
      details: {
        label: result.demo.label,
        kind: result.demo.kind,
        expiresAt: result.demo.expiresAt,
        package: result.demo.package?.nameEn ?? null,
      },
    });
    return { data: { demo: result.demo, link: result.link } };
  }

  @Post(':id/extend')
  @UseGuards(PlatformAuthGuard)
  @HttpCode(HttpStatus.OK)
  async extend(
    @Param('id') rawId: string,
    @Body() body: ExtendPlatformDemoDto,
    @Req() request: PlatformRequest,
  ): Promise<{ data: DemoView }> {
    const id = idOf(rawId);
    const result = await this.demos.extend(id, body.hours);
    if (result.outcome === 'notFound') throw notFound();
    if (result.outcome === 'invalidInput') throw invalid(result.problems);
    await this.audit.record({
      admin: request.platformAdmin,
      action: 'platform.demo_extended',
      restaurant: { id, name: result.demo.label },
      details: {
        label: result.demo.label,
        hours: body.hours,
        expiresAt: result.demo.expiresAt,
      },
    });
    return { data: result.demo };
  }

  @Post(':id/link')
  @UseGuards(PlatformAuthGuard)
  @HttpCode(HttpStatus.OK)
  async newLink(
    @Param('id') rawId: string,
    @Req() request: PlatformRequest,
  ): Promise<{ data: { demo: DemoView; link: string } }> {
    const id = idOf(rawId);
    const result = await this.demos.newLink(id);
    if (result.outcome !== 'ok') throw notFound();
    await this.audit.record({
      admin: request.platformAdmin,
      action: 'platform.demo_link_regenerated',
      restaurant: { id, name: result.demo.demo.label },
      details: { label: result.demo.demo.label },
    });
    return { data: result.demo };
  }

  @Delete(':id')
  @UseGuards(PlatformAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') rawId: string,
    @Req() request: PlatformRequest,
  ): Promise<void> {
    const id = idOf(rawId);
    const before = (await this.demos.list()).find((d) => d.id === id);
    if (!before) throw notFound();
    // Logged first: the restaurant row is about to disappear (the audit row keeps, detached from it).
    await this.audit.record({
      admin: request.platformAdmin,
      action: 'platform.demo_removed',
      restaurant: { id, name: before.label },
      details: { label: before.label },
    });
    const result = await this.demos.remove(id);
    if (result.outcome !== 'ok') throw notFound();
  }
}
