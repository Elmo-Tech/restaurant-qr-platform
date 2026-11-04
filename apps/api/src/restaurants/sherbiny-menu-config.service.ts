import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ImageStorageService } from '../storage/image-storage.service';
import { Prisma } from '../generated/prisma/client';
import {
  SHERBINY_IMAGE_FIELD,
  isSherbinyCategoryId,
  normalizeSherbinySettings,
  sherbinyAssetPaths,
  type SherbinyCategoryExtra,
  type SherbinyImageSlot,
  type SherbinyMenuSettings,
} from './sherbiny-menu-config';

/** The compiled bespoke renderer of El Sherbiny; a Restaurant must be assigned it by Platform Admin. */
export const SHERBINY_RENDERER_KEY = 'SHERBINY_FIRE_DOUGH_V1';

export interface SherbinyConfigView {
  draft: SherbinyMenuSettings;
  published: SherbinyMenuSettings;
}

type ImageTarget = { slot: SherbinyImageSlot } | { categoryId: string };

const asJson = (settings: SherbinyMenuSettings): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(settings)) as Prisma.InputJsonValue;

/**
 * Draft / published appearance of the exclusive El Sherbiny renderer. Every query is keyed by the
 * authorized Restaurant ID and requires THAT Restaurant's own SHERBINY assignment: another tenant can
 * neither read nor write these settings.
 */
@Injectable()
export class SherbinyMenuConfigService {
  private readonly logger = new Logger(SherbinyMenuConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageStorageService,
  ) {}

  /** Throws 404 unless the Restaurant itself holds the SHERBINY assignment. */
  private async load(restaurantId: string): Promise<SherbinyConfigView> {
    const row = await this.prisma.restaurantExclusiveDesign.findUnique({
      where: { restaurantId },
      select: { rendererKey: true, draftSettings: true, publishedSettings: true },
    });
    if (!row || row.rendererKey !== SHERBINY_RENDERER_KEY) {
      throw new NotFoundException({
        error: {
          code: 'EXCLUSIVE_DESIGN_NOT_AVAILABLE',
          message: 'This Restaurant has no El Sherbiny exclusive design.',
        },
      });
    }
    return {
      draft: normalizeSherbinySettings(row.draftSettings),
      published: normalizeSherbinySettings(row.publishedSettings),
    };
  }

  private async write(
    restaurantId: string,
    data: { draftSettings?: SherbinyMenuSettings; publishedSettings?: SherbinyMenuSettings },
  ): Promise<SherbinyConfigView> {
    const row = await this.prisma.restaurantExclusiveDesign.update({
      where: { restaurantId },
      data: {
        ...(data.draftSettings ? { draftSettings: asJson(data.draftSettings) } : {}),
        ...(data.publishedSettings ? { publishedSettings: asJson(data.publishedSettings) } : {}),
      },
      select: { draftSettings: true, publishedSettings: true },
    });
    return {
      draft: normalizeSherbinySettings(row.draftSettings),
      published: normalizeSherbinySettings(row.publishedSettings),
    };
  }

  /** Category IDs this Restaurant owns; foreign IDs in a payload are dropped. */
  private async ownCategoryIds(restaurantId: string): Promise<Set<string>> {
    const rows = await this.prisma.category.findMany({
      where: { restaurantId },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id.toLowerCase()));
  }

  get(restaurantId: string): Promise<SherbinyConfigView> {
    return this.load(restaurantId);
  }

  async saveDraft(restaurantId: string, input: unknown): Promise<SherbinyConfigView> {
    const { draft: saved } = await this.load(restaurantId);
    const own = await this.ownCategoryIds(restaurantId);
    const fields =
      typeof input === 'object' && input !== null && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const requested =
      fields.categoryExtras && typeof fields.categoryExtras === 'object' && !Array.isArray(fields.categoryExtras)
        ? (fields.categoryExtras as Record<string, unknown>)
        : {};
    // Text comes from the client; image paths always come from what the server already stored.
    const categoryExtras: Record<string, unknown> = {};
    for (const [id, value] of Object.entries(requested)) {
      const key = id.toLowerCase();
      if (!isSherbinyCategoryId(key) || !own.has(key)) continue;
      categoryExtras[key] = {
        ...(typeof value === 'object' && value !== null ? value : {}),
        imageAssetPath: saved.categoryExtras[key]?.imageAssetPath ?? null,
      };
    }
    const draft = normalizeSherbinySettings({
      ...fields,
      categoryExtras,
      heroImageAssetPath: saved.heroImageAssetPath,
      heroPlateImageAssetPath: saved.heroPlateImageAssetPath,
      favorite1ImageAssetPath: saved.favorite1ImageAssetPath,
      favorite2ImageAssetPath: saved.favorite2ImageAssetPath,
      favorite3ImageAssetPath: saved.favorite3ImageAssetPath,
      storyImageAssetPath: saved.storyImageAssetPath,
    });
    // An override dropped from the draft releases its upload (unless it is still published).
    const view = await this.write(restaurantId, { draftSettings: draft });
    await this.deleteUnreferenced(sherbinyAssetPaths(saved), view);
    return view;
  }

  /** Store one uploaded photo in the draft (published art stays untouched until publish). */
  setDraftImage(
    restaurantId: string,
    slot: SherbinyImageSlot,
    buffer: Buffer,
    mimetype: string,
  ): Promise<SherbinyConfigView> {
    return this.replaceImage(restaurantId, { slot }, buffer, mimetype);
  }

  async setCategoryImage(
    restaurantId: string,
    categoryId: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<SherbinyConfigView> {
    await this.assertOwnCategory(restaurantId, categoryId);
    return this.replaceImage(restaurantId, { categoryId: categoryId.toLowerCase() }, buffer, mimetype);
  }

  resetDraftImage(restaurantId: string, slot: SherbinyImageSlot): Promise<SherbinyConfigView> {
    return this.clearImage(restaurantId, { slot });
  }

  async resetCategoryImage(restaurantId: string, categoryId: string): Promise<SherbinyConfigView> {
    await this.assertOwnCategory(restaurantId, categoryId);
    return this.clearImage(restaurantId, { categoryId: categoryId.toLowerCase() });
  }

  async publish(restaurantId: string): Promise<SherbinyConfigView> {
    const { draft, published: previous } = await this.load(restaurantId);
    const view = await this.write(restaurantId, { publishedSettings: draft });
    await this.deleteUnreferenced(sherbinyAssetPaths(previous), view);
    return view;
  }

  private async assertOwnCategory(restaurantId: string, categoryId: string): Promise<void> {
    await this.load(restaurantId);
    if (
      !isSherbinyCategoryId(categoryId) ||
      !(await this.ownCategoryIds(restaurantId)).has(categoryId.toLowerCase())
    ) {
      throw new NotFoundException({
        error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
      });
    }
  }

  private applyImage(
    draft: SherbinyMenuSettings,
    target: ImageTarget,
    assetPath: string | null,
  ): SherbinyMenuSettings {
    if ('slot' in target) return { ...draft, [SHERBINY_IMAGE_FIELD[target.slot]]: assetPath };
    const base: SherbinyCategoryExtra = draft.categoryExtras[target.categoryId] ?? {
      tagAr: '',
      tagEn: '',
      titleAr: '',
      titleEn: '',
      descAr: '',
      descEn: '',
      imageAssetPath: null,
    };
    return {
      ...draft,
      categoryExtras: { ...draft.categoryExtras, [target.categoryId]: { ...base, imageAssetPath: assetPath } },
    };
  }

  private async replaceImage(
    restaurantId: string,
    target: ImageTarget,
    buffer: Buffer,
    mimetype: string,
  ): Promise<SherbinyConfigView> {
    await this.load(restaurantId);
    let saved: { assetPath: string };
    try {
      saved = await this.images.saveImage(buffer, mimetype);
    } catch (error) {
      this.logger.error('SHERBINY image filesystem write failed', error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException({
        error: { code: 'SHERBINY_IMAGE_STORAGE_FAILED', message: 'Could not store the image. Please try again.' },
      });
    }
    try {
      const { draft } = await this.load(restaurantId);
      const view = await this.write(restaurantId, { draftSettings: this.applyImage(draft, target, saved.assetPath) });
      await this.deleteUnreferenced(sherbinyAssetPaths(draft), view);
      return view;
    } catch (error) {
      await this.images.deleteImageBestEffort(saved.assetPath);
      this.logger.error('SHERBINY image draft save failed', error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException({
        error: {
          code: 'SHERBINY_IMAGE_DRAFT_SAVE_FAILED',
          message: 'The photo was received but the draft could not be saved. Please try again.',
        },
      });
    }
  }

  private async clearImage(restaurantId: string, target: ImageTarget): Promise<SherbinyConfigView> {
    const { draft } = await this.load(restaurantId);
    const view = await this.write(restaurantId, { draftSettings: this.applyImage(draft, target, null) });
    await this.deleteUnreferenced(sherbinyAssetPaths(draft), view);
    return view;
  }

  /** Delete uploads that were referenced before and are now in neither the draft nor the published settings. */
  private async deleteUnreferenced(candidates: Set<string>, view: SherbinyConfigView): Promise<void> {
    const keep = new Set([...sherbinyAssetPaths(view.draft), ...sherbinyAssetPaths(view.published)]);
    for (const path of candidates) {
      if (!keep.has(path)) await this.images.deleteImageBestEffort(path);
    }
  }
}
