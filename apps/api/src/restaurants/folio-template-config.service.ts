import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
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
      categoryArtwork: current.categoryArtwork,
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
  /** A FOLIO-owned photo is removed only if no draft or published page references it. */
  private async cleanupArtwork(path: string | null, draft: FolioTemplateSettings, published: FolioTemplateSettings) {
    if (!path) return;
    const referenced = [
      draft.artworkAssetPath, published.artworkAssetPath,
      ...Object.values(draft.categoryArtwork), ...Object.values(published.categoryArtwork),
    ];
    if (!referenced.includes(path)) await this.images.deleteImageBestEffort(path);
  }

  private async requireCategory(restaurantId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, restaurantId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category is not available for this restaurant');
  }

  async setDraftCategoryArtwork(restaurantId: string, categoryId: string, buffer: Buffer, mimeType: string): Promise<FolioConfigView> {
    await this.requireCategory(restaurantId, categoryId);
    let saved: { assetPath: string };
    try { saved = await this.images.saveImage(buffer, mimeType); }
    catch (error) {
      this.logger.error('FOLIO category artwork upload failed', error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException('Could not save FOLIO category artwork');
    }
    try {
      const previous = this.view(await this.read(restaurantId));
      const next = await this.persist(restaurantId, {
        ...previous.draft,
        categoryArtwork: { ...previous.draft.categoryArtwork, [categoryId]: saved.assetPath },
      });
      await this.cleanupArtwork(previous.draft.categoryArtwork[categoryId] ?? null, next.draft, next.published);
      return next;
    } catch (error) {
      await this.images.deleteImageBestEffort(saved.assetPath);
      throw error;
    }
  }

  async resetDraftCategoryArtwork(restaurantId: string, categoryId: string): Promise<FolioConfigView> {
    await this.requireCategory(restaurantId, categoryId);
    const previous = this.view(await this.read(restaurantId));
    const nextArtwork = { ...previous.draft.categoryArtwork };
    const discarded = nextArtwork[categoryId] ?? null;
    delete nextArtwork[categoryId];
    const next = await this.persist(restaurantId, {
      ...previous.draft, categoryArtwork: nextArtwork,
    });
    await this.cleanupArtwork(discarded, next.draft, next.published);
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
    const next = this.view(row);
    for (const path of Object.values(old.published.categoryArtwork)) {
      await this.cleanupArtwork(path, next.draft, next.published);
    }
    return next;
  }
}
