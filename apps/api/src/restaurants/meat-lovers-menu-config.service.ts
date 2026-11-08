import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ImageStorageService } from '../storage/image-storage.service';
import { Prisma } from '../generated/prisma/client';
import {
  MEAT_LOVERS_IMAGE_FIELD,
  isMeatLoversCategoryId,
  normalizeMeatLoversSettings,
  meatLoversAssetPaths,
  type MeatLoversCategoryExtra,
  type MeatLoversImageSlot,
  type MeatLoversMenuSettings,
} from './meat-lovers-menu-config';

/** The compiled bespoke renderer of MeatLovers; a Restaurant must be assigned it by Platform Admin. */
export const MEAT_LOVERS_RENDERER_KEY = 'MEAT_LOVERS_BUTCHER_V1';

export interface MeatLoversConfigView {
  draft: MeatLoversMenuSettings;
  published: MeatLoversMenuSettings;
}

type ImageTarget = { slot: MeatLoversImageSlot } | { categoryId: string };

const asJson = (settings: MeatLoversMenuSettings): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(settings)) as Prisma.InputJsonValue;

/**
 * Draft / published appearance of the exclusive MeatLovers renderer. Every query is keyed by the
 * authorized Restaurant ID and requires THAT Restaurant's own MEAT_LOVERS assignment: another tenant can
 * neither read nor write these settings.
 */
@Injectable()
export class MeatLoversMenuConfigService {
  private readonly logger = new Logger(MeatLoversMenuConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageStorageService,
  ) {}

  /** Throws 404 unless the Restaurant itself holds the MEAT_LOVERS assignment. */
  private async load(restaurantId: string): Promise<MeatLoversConfigView> {
    const row = await this.prisma.restaurantExclusiveDesign.findUnique({
      where: { restaurantId },
      select: { rendererKey: true, draftSettings: true, publishedSettings: true },
    });
    if (!row || row.rendererKey !== MEAT_LOVERS_RENDERER_KEY) {
      throw new NotFoundException({
        error: {
          code: 'EXCLUSIVE_DESIGN_NOT_AVAILABLE',
          message: 'This Restaurant has no MeatLovers exclusive design.',
        },
      });
    }
    return {
      draft: normalizeMeatLoversSettings(row.draftSettings),
      published: normalizeMeatLoversSettings(row.publishedSettings),
    };
  }

  private async write(
    restaurantId: string,
    data: { draftSettings?: MeatLoversMenuSettings; publishedSettings?: MeatLoversMenuSettings },
  ): Promise<MeatLoversConfigView> {
    const row = await this.prisma.restaurantExclusiveDesign.update({
      where: { restaurantId },
      data: {
        ...(data.draftSettings ? { draftSettings: asJson(data.draftSettings) } : {}),
        ...(data.publishedSettings ? { publishedSettings: asJson(data.publishedSettings) } : {}),
      },
      select: { draftSettings: true, publishedSettings: true },
    });
    return {
      draft: normalizeMeatLoversSettings(row.draftSettings),
      published: normalizeMeatLoversSettings(row.publishedSettings),
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

  get(restaurantId: string): Promise<MeatLoversConfigView> {
    return this.load(restaurantId);
  }

  async saveDraft(restaurantId: string, input: unknown): Promise<MeatLoversConfigView> {
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
      if (!isMeatLoversCategoryId(key) || !own.has(key)) continue;
      categoryExtras[key] = {
        ...(typeof value === 'object' && value !== null ? value : {}),
        imageAssetPath: saved.categoryExtras[key]?.imageAssetPath ?? null,
      };
    }
    const draft = normalizeMeatLoversSettings({
      ...fields,
      categoryExtras,
      heroImageAssetPath: saved.heroImageAssetPath,
      storyImageAssetPath: saved.storyImageAssetPath,
    });
    // An override dropped from the draft releases its upload (unless it is still published).
    const view = await this.write(restaurantId, { draftSettings: draft });
    await this.deleteUnreferenced(meatLoversAssetPaths(saved), view);
    return view;
  }

  /** Store one uploaded photo in the draft (published art stays untouched until publish). */
  setDraftImage(
    restaurantId: string,
    slot: MeatLoversImageSlot,
    buffer: Buffer,
    mimetype: string,
  ): Promise<MeatLoversConfigView> {
    return this.replaceImage(restaurantId, { slot }, buffer, mimetype);
  }

  async setCategoryImage(
    restaurantId: string,
    categoryId: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<MeatLoversConfigView> {
    await this.assertOwnCategory(restaurantId, categoryId);
    return this.replaceImage(restaurantId, { categoryId: categoryId.toLowerCase() }, buffer, mimetype);
  }

  resetDraftImage(restaurantId: string, slot: MeatLoversImageSlot): Promise<MeatLoversConfigView> {
    return this.clearImage(restaurantId, { slot });
  }

  async resetCategoryImage(restaurantId: string, categoryId: string): Promise<MeatLoversConfigView> {
    await this.assertOwnCategory(restaurantId, categoryId);
    return this.clearImage(restaurantId, { categoryId: categoryId.toLowerCase() });
  }

  async publish(restaurantId: string): Promise<MeatLoversConfigView> {
    const { draft, published: previous } = await this.load(restaurantId);
    const view = await this.write(restaurantId, { publishedSettings: draft });
    await this.deleteUnreferenced(meatLoversAssetPaths(previous), view);
    return view;
  }

  private async assertOwnCategory(restaurantId: string, categoryId: string): Promise<void> {
    await this.load(restaurantId);
    if (
      !isMeatLoversCategoryId(categoryId) ||
      !(await this.ownCategoryIds(restaurantId)).has(categoryId.toLowerCase())
    ) {
      throw new NotFoundException({
        error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
      });
    }
  }

  private applyImage(
    draft: MeatLoversMenuSettings,
    target: ImageTarget,
    assetPath: string | null,
  ): MeatLoversMenuSettings {
    if ('slot' in target) return { ...draft, [MEAT_LOVERS_IMAGE_FIELD[target.slot]]: assetPath };
    const base: MeatLoversCategoryExtra = draft.categoryExtras[target.categoryId] ?? {
      tagAr: '',
      tagEn: '',
      introAr: '',
      introEn: '',
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
  ): Promise<MeatLoversConfigView> {
    await this.load(restaurantId);
    let saved: { assetPath: string };
    try {
      saved = await this.images.saveImage(buffer, mimetype);
    } catch (error) {
      this.logger.error('MEAT_LOVERS image filesystem write failed', error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException({
        error: { code: 'MEAT_LOVERS_IMAGE_STORAGE_FAILED', message: 'Could not store the image. Please try again.' },
      });
    }
    try {
      const { draft } = await this.load(restaurantId);
      const view = await this.write(restaurantId, { draftSettings: this.applyImage(draft, target, saved.assetPath) });
      await this.deleteUnreferenced(meatLoversAssetPaths(draft), view);
      return view;
    } catch (error) {
      await this.images.deleteImageBestEffort(saved.assetPath);
      this.logger.error('MEAT_LOVERS image draft save failed', error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException({
        error: {
          code: 'MEAT_LOVERS_IMAGE_DRAFT_SAVE_FAILED',
          message: 'The photo was received but the draft could not be saved. Please try again.',
        },
      });
    }
  }

  private async clearImage(restaurantId: string, target: ImageTarget): Promise<MeatLoversConfigView> {
    const { draft } = await this.load(restaurantId);
    const view = await this.write(restaurantId, { draftSettings: this.applyImage(draft, target, null) });
    await this.deleteUnreferenced(meatLoversAssetPaths(draft), view);
    return view;
  }

  /** Delete uploads that were referenced before and are now in neither the draft nor the published settings. */
  private async deleteUnreferenced(candidates: Set<string>, view: MeatLoversConfigView): Promise<void> {
    const keep = new Set([...meatLoversAssetPaths(view.draft), ...meatLoversAssetPaths(view.published)]);
    for (const path of candidates) {
      if (!keep.has(path)) await this.images.deleteImageBestEffort(path);
    }
  }
}
