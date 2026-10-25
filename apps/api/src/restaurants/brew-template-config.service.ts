import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ImageStorageService } from '../storage/image-storage.service';
import { Prisma } from '../generated/prisma/client';
import {
  DEFAULT_BREW_SETTINGS,
  normalizeBrewSettings,
  type BrewTemplateSettings,
} from './brew-template-config';

/** Encode category mappings as plain JSON before writing Prisma JSON fields. */
const asJson = (settings: BrewTemplateSettings): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(settings)) as Prisma.InputJsonValue;

export interface BrewConfigView {
  draft: BrewTemplateSettings;
  published: BrewTemplateSettings;
}

/** All lookups use the authorized restaurant ID, never a client-supplied tenant identity. */
@Injectable()
export class BrewTemplateConfigService {
  private readonly logger = new Logger(BrewTemplateConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageStorageService,
  ) {}

  async get(restaurantId: string): Promise<BrewConfigView> {
    const row = await this.prisma.restaurantTemplateConfig.findUnique({
      where: { restaurantId_template: { restaurantId, template: 'BREW' } },
      select: { draftSettings: true, publishedSettings: true },
    });
    return {
      draft: normalizeBrewSettings(row?.draftSettings),
      published: normalizeBrewSettings(row?.publishedSettings),
    };
  }

  async saveDraft(restaurantId: string, input: unknown): Promise<BrewConfigView> {
    // A client may choose ART/CUSTOM, but cannot set a raw asset path.
    // Preserve the server-managed upload even when an older draft form is saved.
    const existing = await this.prisma.restaurantTemplateConfig.findUnique({
      where: { restaurantId_template: { restaurantId, template: 'BREW' } },
      select: { draftSettings: true },
    });
    const saved = normalizeBrewSettings(existing?.draftSettings);
    const fields = typeof input === 'object' && input !== null && !Array.isArray(input)
      ? input as Record<string, unknown> : {};
    const draft = normalizeBrewSettings({
      ...fields,
      promoImageAssetPath: saved.promoImageAssetPath,
    });
    const row = await this.prisma.restaurantTemplateConfig.upsert({
      where: { restaurantId_template: { restaurantId, template: 'BREW' } },
      create: {
        restaurantId,
        template: 'BREW',
        schemaVersion: 1,
        draftSettings: asJson(draft),
        publishedSettings: asJson(DEFAULT_BREW_SETTINGS),
      },
      update: { draftSettings: asJson(draft) },
      select: { draftSettings: true, publishedSettings: true },
    });
    return {
      draft: normalizeBrewSettings(row.draftSettings),
      published: normalizeBrewSettings(row.publishedSettings),
    };
  }

  /** Image upload updates only the draft; existing published art stays untouched. */
  async setDraftImage(restaurantId: string, buffer: Buffer, mimetype: string): Promise<BrewConfigView> {
    let saved: { assetPath: string };
    try {
      saved = await this.images.saveImage(buffer, mimetype);
    } catch (error) {
      this.logger.error('BREW promo image filesystem write failed', error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException({
        error: {
          code: 'BREW_IMAGE_STORAGE_FAILED',
          message: 'Could not store the BREW image. Please try again or contact support.',
        },
      });
    }
    let oldUnpublishedPath: string | null = null;
    try {
      const row = await this.prisma.restaurantTemplateConfig.findUnique({
        where: { restaurantId_template: { restaurantId, template: 'BREW' } },
        select: { draftSettings: true, publishedSettings: true },
      });
      const currentDraft = normalizeBrewSettings(row?.draftSettings);
      const currentPublished = normalizeBrewSettings(row?.publishedSettings);
      oldUnpublishedPath = currentDraft.promoImageAssetPath !== currentPublished.promoImageAssetPath
        ? currentDraft.promoImageAssetPath : null;
      const next = {
        ...currentDraft,
        promoImageMode: 'CUSTOM' as const,
        promoImageAssetPath: saved.assetPath,
      };
      const persisted = await this.prisma.restaurantTemplateConfig.upsert({
        where: { restaurantId_template: { restaurantId, template: 'BREW' } },
        create: {
          restaurantId, template: 'BREW', schemaVersion: 1,
          draftSettings: asJson(next), publishedSettings: asJson(DEFAULT_BREW_SETTINGS),
        },
        update: { draftSettings: asJson(next) },
        select: { draftSettings: true, publishedSettings: true },
      });
      if (oldUnpublishedPath) await this.images.deleteImageBestEffort(oldUnpublishedPath);
      return {
        draft: normalizeBrewSettings(persisted.draftSettings),
        published: normalizeBrewSettings(persisted.publishedSettings),
      };
    } catch (error) {
      await this.images.deleteImageBestEffort(saved.assetPath);
      this.logger.error('BREW promo image draft save failed', error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException({
        error: {
          code: 'BREW_IMAGE_DRAFT_SAVE_FAILED',
          message: 'The photo was received but the BREW draft could not be saved. Please try again.',
        },
      });
    }
  }

  /** Revert the draft to original coffee promotion artwork without changing the published image. */
  async resetDraftImage(restaurantId: string): Promise<BrewConfigView> {
    const existing = await this.prisma.restaurantTemplateConfig.findUnique({
      where: { restaurantId_template: { restaurantId, template: 'BREW' } },
      select: { draftSettings: true, publishedSettings: true },
    });
    const currentDraft = normalizeBrewSettings(existing?.draftSettings);
    const currentPublished = normalizeBrewSettings(existing?.publishedSettings);
    const reset = {
      ...currentDraft,
      promoImageMode: 'ART' as const,
      promoImageAssetPath: null,
    };
    const row = await this.prisma.restaurantTemplateConfig.upsert({
      where: { restaurantId_template: { restaurantId, template: 'BREW' } },
      create: {
        restaurantId,
        template: 'BREW',
        schemaVersion: 1,
        draftSettings: asJson(reset),
        publishedSettings: asJson(DEFAULT_BREW_SETTINGS),
      },
      update: { draftSettings: asJson(reset) },
      select: { draftSettings: true, publishedSettings: true },
    });
    // Only delete the unreferenced draft upload. A currently published photo
    // must remain available to guests until the appearance is published again.
    if (currentDraft.promoImageAssetPath &&
        currentDraft.promoImageAssetPath !== currentPublished.promoImageAssetPath) {
      await this.images.deleteImageBestEffort(currentDraft.promoImageAssetPath);
    }
    return {
      draft: normalizeBrewSettings(row.draftSettings),
      published: normalizeBrewSettings(row.publishedSettings),
    };
  }

  async publish(restaurantId: string): Promise<BrewConfigView> {
    // Only the last SAVED draft is published; the request itself contains no styles.
    const existing = await this.prisma.restaurantTemplateConfig.findUnique({
      where: { restaurantId_template: { restaurantId, template: 'BREW' } },
      select: { draftSettings: true, publishedSettings: true },
    });
    const previousPublished = normalizeBrewSettings(existing?.publishedSettings);
    const published = normalizeBrewSettings(existing?.draftSettings);
    const row = await this.prisma.restaurantTemplateConfig.upsert({
      where: { restaurantId_template: { restaurantId, template: 'BREW' } },
      create: {
        restaurantId,
        template: 'BREW',
        schemaVersion: 1,
        draftSettings: asJson(published),
        publishedSettings: asJson(published),
      },
      update: { publishedSettings: asJson(published) },
      select: { draftSettings: true, publishedSettings: true },
    });
    // The last published upload can be deleted only after it has no draft
    // or published reference (don't break pages while replacing images).
    if (previousPublished.promoImageAssetPath &&
        previousPublished.promoImageAssetPath !== published.promoImageAssetPath) {
      await this.images.deleteImageBestEffort(previousPublished.promoImageAssetPath);
    }
    return {
      draft: normalizeBrewSettings(row.draftSettings),
      published: normalizeBrewSettings(row.publishedSettings),
    };
  }
}
