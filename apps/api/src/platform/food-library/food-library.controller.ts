import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ImageStorageService,
  MAX_IMAGE_BYTES,
} from '../../storage/image-storage.service';
import type { UploadedImageFile } from '../../storage/uploaded-image-file';
import { PlatformAuditService } from '../platform-audit.service';
import {
  PlatformAuthGuard,
  PlatformCsrfGuard,
  type PlatformRequest,
} from '../platform-guards';
import {
  BulkFoodImageDto,
  FoodImageIdsDto,
  FoodImageListQueryDto,
  FoodTagListQueryDto,
  FoodTagSuggestQueryDto,
  ReviewFoodImageDto,
} from './food-library.dto';
import { FoodLibraryService } from './food-library.service';
import { FoodTagDictionaryService } from './food-tag-dictionary.service';
import { FoodTagCatalogQueryDto, FoodTagWriteDto } from './food-tag-dictionary.dto';

/** Separate Platform session/Origin; never a Restaurant Staff or Guest endpoint. */
@Controller('platform/food-images')
@UseGuards(PlatformCsrfGuard, PlatformAuthGuard)
export class PlatformFoodImagesController {
  constructor(
    private readonly library: FoodLibraryService,
    private readonly storage: ImageStorageService,
    private readonly audit: PlatformAuditService,
  ) {}

  @Get()
  async list(@Query() query: FoodImageListQueryDto) {
    return { data: await this.library.list(query) };
  }

  @Get(':id/preview')
  @Header('Cache-Control', 'private, no-store')
  async preview(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res() response: Response,
  ): Promise<void> {
    // The console's host routes /api/v1/platform to Nest, but may not route /media.
    // Stream through the authenticated platform API, never trust a client file path.
    const file = await this.library.fileForPreview(id);
    response.type(file.mimeType);
    response.sendFile(file.filename, {
      root: this.storage.getUploadDir(),
      dotfiles: 'deny',
    });
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return { data: await this.library.get(id) };
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES * 2 } }),
  )
  async upload(
    @UploadedFile() file: UploadedImageFile | undefined,
    @Req() request: PlatformRequest,
  ) {
    const result = await this.library.upload(file);
    await this.audit.record({
      admin: request.platformAdmin,
      action: 'platform.food_image_uploaded',
      details: { imageId: result.image.id },
    });
    return { data: result };
  }

  @Post('bulk-apply')
  @HttpCode(HttpStatus.OK)
  async bulkApply(
    @Body() dto: BulkFoodImageDto,
    @Req() request: PlatformRequest,
  ) {
    const result = await this.library.bulkApply(dto);
    await this.audit.record({
      admin: request.platformAdmin,
      action: 'platform.food_images_bulk_updated',
      details: { count: result.updated },
    });
    return { data: result };
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  async publish(@Body() dto: FoodImageIdsDto, @Req() request: PlatformRequest) {
    const result = await this.library.publish(dto.ids);
    await this.audit.record({
      admin: request.platformAdmin,
      action: 'platform.food_images_published',
      details: { count: result.published, imageIds: dto.ids },
    });
    return { data: result };
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  async review(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ReviewFoodImageDto,
    @Req() request: PlatformRequest,
  ) {
    const result = await this.library.review(
      id,
      dto,
      request.platformAdmin.adminId,
    );
    await this.audit.record({
      admin: request.platformAdmin,
      action: 'platform.food_image_reviewed',
      details: {
        imageId: id,
        presentation: dto.presentation,
        sectors: dto.sectors,
        tagCount: dto.tagIds.length,
      },
    });
    return { data: result };
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archive(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: PlatformRequest,
  ) {
    const result = await this.library.archive(id);
    await this.audit.record({
      admin: request.platformAdmin,
      action: 'platform.food_image_archived',
      details: { imageId: id },
    });
    return { data: result };
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  async restore(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: PlatformRequest,
  ) {
    const result = await this.library.restore(id);
    await this.audit.record({
      admin: request.platformAdmin,
      action: 'platform.food_image_restored',
      details: { imageId: id },
    });
    return { data: result };
  }
}

/** Searchable central dictionary (AR/EN/IT). No restaurant can create arbitrary global tags. */
@Controller('platform/food-tags')
@UseGuards(PlatformCsrfGuard, PlatformAuthGuard)
export class PlatformFoodTagsController {
  constructor(
    private readonly library: FoodLibraryService,
    private readonly dictionary: FoodTagDictionaryService,
    private readonly audit: PlatformAuditService,
  ) {}

  @Get('catalog')
  async catalog(@Query() query: FoodTagCatalogQueryDto) {
    return { data: await this.dictionary.catalog(query) };
  }

  @Post()
  async create(@Body() dto: FoodTagWriteDto, @Req() request: PlatformRequest) {
    const created = await this.dictionary.create(dto);
    await this.audit.record({
      admin: request.platformAdmin,
      action: 'platform.food_tag_created',
      details: { tagId: created.id, code: created.code },
    });
    return { data: created };
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: FoodTagWriteDto,
    @Req() request: PlatformRequest,
  ) {
    const changed = await this.dictionary.update(id, dto);
    await this.audit.record({
      admin: request.platformAdmin,
      action: 'platform.food_tag_updated',
      details: { tagId: changed.id, code: changed.code },
    });
    return { data: changed };
  }

  @Get()
  async list(@Query() query: FoodTagListQueryDto) {
    return { data: await this.library.tags(query) };
  }

  @Get('suggest')
  async suggest(@Query() query: FoodTagSuggestQueryDto) {
    return { data: await this.library.suggestedTags(query.name) };
  }
}
