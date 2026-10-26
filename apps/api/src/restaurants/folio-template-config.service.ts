import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ImageStorageService } from '../storage/image-storage.service';
import { DEFAULT_FOLIO_SETTINGS, normalizeFolioSettings, type FolioTemplateSettings } from './folio-template-config';

export interface FolioConfigView {
  draft: FolioTemplateSettings;
  published: FolioTemplateSettings;
}
const asJson = (value: FolioTemplateSettings): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class FolioTemplateConfigService {
  private readonly logger = new Logger(FolioTemplateConfigService.name);
  constructor(private readonly prisma: PrismaService, private readonly images: ImageStorageService) {}

  private async read(restaurantId: string) {
    return this.prisma.restaurantTemplateConfig.findUnique({
      where: { restaurantId_template: { restaurantId, template: 'FOLIO' } },
      select: { draftSettings: true, publishedSettings: true },
    });
  }
  private view(row: { draftSettings: unknown; publishedSettings: unknown } | null): FolioConfigView {
    return { draft: normalizeFolioSettings(row?.draftSettings), published: normalizeFolioSettings(row?.publishedSettings) };
  }
  async get(restaurantId: string): Promise<FolioConfigView> {
    return this.view(await this.read(restaurantId));
  }
  private async persist(restaurantId: string, draft: FolioTemplateSettings): Promise<FolioConfigView> {
    return this.view(await this.prisma.restaurantTemplateConfig.upsert({
      where: { restaurantId_template: { restaurantId, template: 'FOLIO' } },
      create: { restaurantId, template: 'FOLIO', draftSettings: asJson(draft),
        publishedSettings: asJson(DEFAULT_FOLIO_SETTINGS), schemaVersion: 1 },
      update: { draftSettings: asJson(draft) },
      select: { draftSettings: true, publishedSettings: true },
    }));
  }
  async saveDraft(restaurantId: string, raw: unknown): Promise<FolioConfigView> {
    const current = this.view(await this.read(restaurantId)).draft;
    const input = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, unknown> : {};
    // Never allow a client to replace a server-managed asset path.
    const draft = normalizeFolioSettings({
      ...input,
      artworkAssetPath: current.artworkAssetPath,
    });
    return this.persist(restaurantId, draft);
  }
  async setDraftArtwork(restaurantId: string, buffer: Buffer, mimeType: string): Promise<FolioConfigView> {
    let image: { assetPath: string };
    try {
      image = await this.images.saveImage(buffer, mimeType);
    } catch (error) {
      this.logger.error('FOLIO artwork upload failed', error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException('Could not save FOLIO artwork');
    }
    try {
      const previous = this.view(await this.read(restaurantId));
      const next = await this.persist(restaurantId, {
        ...previous.draft,
        artworkMode: 'CUSTOM',
        artworkAssetPath: image.assetPath,
      });
      if (previous.draft.artworkAssetPath &&
          previous.draft.artworkAssetPath !== previous.published.artworkAssetPath &&
          previous.draft.artworkAssetPath !== image.assetPath) {
        await this.images.deleteImageBestEffort(previous.draft.artworkAssetPath);
      }
      return next;
    } catch (error) {
      await this.images.deleteImageBestEffort(image.assetPath);
      this.logger.error('FOLIO artwork draft failed', error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException('Could not save FOLIO artwork draft');
    }
  }
  async resetDraftArtwork(restaurantId: string): Promise<FolioConfigView> {
    const previous = this.view(await this.read(restaurantId));
    const next = await this.persist(restaurantId, {
      ...previous.draft, artworkMode: 'ILLUSTRATION', artworkAssetPath: null,
    });
    if (previous.draft.artworkAssetPath &&
        previous.draft.artworkAssetPath !== previous.published.artworkAssetPath) {
      await this.images.deleteImageBestEffort(previous.draft.artworkAssetPath);
    }
    return next;
  }
  async publish(restaurantId: string): Promise<FolioConfigView> {
    const old = this.view(await this.read(restaurantId));
    const published = old.draft;
    const row = await this.prisma.restaurantTemplateConfig.upsert({
      where: { restaurantId_template: { restaurantId, template: 'FOLIO' } },
      create: {
        restaurantId, template: 'FOLIO', schemaVersion: 1,
        draftSettings: asJson(published), publishedSettings: asJson(published),
      },
      update: { publishedSettings: asJson(published) },
      select: { draftSettings: true, publishedSettings: true },
    });
    if (old.published.artworkAssetPath &&
        old.published.artworkAssetPath !== published.artworkAssetPath &&
        old.published.artworkAssetPath !== old.draft.artworkAssetPath) {
      await this.images.deleteImageBestEffort(old.published.artworkAssetPath);
    }
    return this.view(row);
  }
}
