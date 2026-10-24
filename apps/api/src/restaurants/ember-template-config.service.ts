import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ImageStorageService } from '../storage/image-storage.service';
import {
  DEFAULT_EMBER_SETTINGS,
  normalizeEmberSettings,
  type EmberTemplateSettings,
} from './ember-template-config';

export interface EmberConfigView {
  draft: EmberTemplateSettings;
  published: EmberTemplateSettings;
}

/** All lookups use the authorized restaurant ID, never a client-supplied tenant identity. */
@Injectable()
export class EmberTemplateConfigService {
  private readonly logger = new Logger(EmberTemplateConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageStorageService,
  ) {}

  async get(restaurantId: string): Promise<EmberConfigView> {
    const row = await this.prisma.restaurantTemplateConfig.findUnique({
      where: { restaurantId_template: { restaurantId, template: 'EMBER' } },
      select: { draftSettings: true, publishedSettings: true },
    });
    return {
      draft: normalizeEmberSettings(row?.draftSettings),
      published: normalizeEmberSettings(row?.publishedSettings),
    };
  }

  async saveDraft(restaurantId: string, input: unknown): Promise<EmberConfigView> {
    // A client may choose AUTO/CUSTOM, but cannot set a raw asset path.
    // Preserve the server-managed upload even when an older draft form is saved.
    const existing = await this.prisma.restaurantTemplateConfig.findUnique({
      where: { restaurantId_template: { restaurantId, template: 'EMBER' } },
      select: { draftSettings: true },
    });
    const saved = normalizeEmberSettings(existing?.draftSettings);
    const fields = typeof input === 'object' && input !== null && !Array.isArray(input)
      ? input as Record<string, unknown> : {};
    const draft = normalizeEmberSettings({
      ...fields,
      heroImageAssetPath: saved.heroImageAssetPath,
    });
    const row = await this.prisma.restaurantTemplateConfig.upsert({
      where: { restaurantId_template: { restaurantId, template: 'EMBER' } },
      create: {
        restaurantId,
        template: 'EMBER',
        schemaVersion: 1,
        draftSettings: { ...draft },
        publishedSettings: { ...DEFAULT_EMBER_SETTINGS },
      },
      update: { draftSettings: { ...draft } },
      select: { draftSettings: true, publishedSettings: true },
    });
    return {
      draft: normalizeEmberSettings(row.draftSettings),
      published: normalizeEmberSettings(row.publishedSettings),
    };
  }

  /** Image upload updates only the draft; existing published art stays untouched. */
  async setDraftImage(restaurantId: string, buffer: Buffer, mimetype: string): Promise<EmberConfigView> {
    let saved: { assetPath: string };
    try {
      saved = await this.images.saveImage(buffer, mimetype);
    } catch (error) {
      this.logger.error('EMBER hero image filesystem write failed', error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException({
        error: {
          code: 'EMBER_IMAGE_STORAGE_FAILED',
          message: 'Could not store the EMBER image. Please try again or contact support.',
        },
      });
    }
    let oldUnpublishedPath: string | null = null;
    try {
      const row = await this.prisma.restaurantTemplateConfig.findUnique({
        where: { restaurantId_template: { restaurantId, template: 'EMBER' } },
        select: { draftSettings: true, publishedSettings: true },
      });
      const currentDraft = normalizeEmberSettings(row?.draftSettings);
      const currentPublished = normalizeEmberSettings(row?.publishedSettings);
      oldUnpublishedPath = currentDraft.heroImageAssetPath !== currentPublished.heroImageAssetPath
        ? currentDraft.heroImageAssetPath : null;
      const next = {
        ...currentDraft,
        heroImageMode: 'CUSTOM' as const,
        heroImageAssetPath: saved.assetPath,
      };
      const persisted = await this.prisma.restaurantTemplateConfig.upsert({
        where: { restaurantId_template: { restaurantId, template: 'EMBER' } },
        create: {
          restaurantId, template: 'EMBER', schemaVersion: 1,
          draftSettings: { ...next }, publishedSettings: { ...DEFAULT_EMBER_SETTINGS },
        },
        update: { draftSettings: { ...next } },
        select: { draftSettings: true, publishedSettings: true },
      });
      if (oldUnpublishedPath) await this.images.deleteImageBestEffort(oldUnpublishedPath);
      return {
        draft: normalizeEmberSettings(persisted.draftSettings),
        published: normalizeEmberSettings(persisted.publishedSettings),
      };
    } catch (error) {
      await this.images.deleteImageBestEffort(saved.assetPath);
      this.logger.error('EMBER hero image draft save failed', error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException({
        error: {
          code: 'EMBER_IMAGE_DRAFT_SAVE_FAILED',
          message: 'The photo was received but the EMBER draft could not be saved. Please try again.',
        },
      });
    }
  }

  /** Revert the draft to automatic food photography without changing the published image. */
  async resetDraftImage(restaurantId: string): Promise<EmberConfigView> {
    const existing = await this.prisma.restaurantTemplateConfig.findUnique({
      where: { restaurantId_template: { restaurantId, template: 'EMBER' } },
      select: { draftSettings: true, publishedSettings: true },
    });
    const currentDraft = normalizeEmberSettings(existing?.draftSettings);
    const currentPublished = normalizeEmberSettings(existing?.publishedSettings);
    const reset = {
      ...currentDraft,
      heroImageMode: 'AUTO' as const,
      heroImageAssetPath: null,
    };
    const row = await this.prisma.restaurantTemplateConfig.upsert({
      where: { restaurantId_template: { restaurantId, template: 'EMBER' } },
      create: {
        restaurantId,
        template: 'EMBER',
        schemaVersion: 1,
        draftSettings: { ...reset },
        publishedSettings: { ...DEFAULT_EMBER_SETTINGS },
      },
      update: { draftSettings: { ...reset } },
      select: { draftSettings: true, publishedSettings: true },
    });
    // Only delete the unreferenced draft upload. A currently published photo
    // must remain available to guests until the appearance is published again.
    if (currentDraft.heroImageAssetPath &&
        currentDraft.heroImageAssetPath !== currentPublished.heroImageAssetPath) {
      await this.images.deleteImageBestEffort(currentDraft.heroImageAssetPath);
    }
    return {
      draft: normalizeEmberSettings(row.draftSettings),
      published: normalizeEmberSettings(row.publishedSettings),
    };
  }

  async publish(restaurantId: string): Promise<EmberConfigView> {
    // Only the last SAVED draft is published; the request itself contains no styles.
    const existing = await this.prisma.restaurantTemplateConfig.findUnique({
      where: { restaurantId_template: { restaurantId, template: 'EMBER' } },
      select: { draftSettings: true, publishedSettings: true },
    });
    const previousPublished = normalizeEmberSettings(existing?.publishedSettings);
    const published = normalizeEmberSettings(existing?.draftSettings);
    const row = await this.prisma.restaurantTemplateConfig.upsert({
      where: { restaurantId_template: { restaurantId, template: 'EMBER' } },
      create: {
        restaurantId,
        template: 'EMBER',
        schemaVersion: 1,
        draftSettings: { ...published },
        publishedSettings: { ...published },
      },
      update: { publishedSettings: { ...published } },
      select: { draftSettings: true, publishedSettings: true },
    });
    // The last published upload can be deleted only after it has no draft
    // or published reference (don't break pages while replacing images).
    if (previousPublished.heroImageAssetPath &&
        previousPublished.heroImageAssetPath !== published.heroImageAssetPath) {
      await this.images.deleteImageBestEffort(previousPublished.heroImageAssetPath);
    }
    return {
      draft: normalizeEmberSettings(row.draftSettings),
      published: normalizeEmberSettings(row.publishedSettings),
    };
  }
}
