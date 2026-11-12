import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { readImageDimensions } from '../../storage/image-dimensions';
import { assertValidImageUpload } from '../../storage/image-file-validator';
import { ImageStorageService } from '../../storage/image-storage.service';
import type { UploadedImageFile } from '../../storage/uploaded-image-file';
import type { BulkFoodImageDto, FoodImageListQueryDto, FoodTagListQueryDto, ReviewFoodImageDto } from './food-library.dto';
import { normalizeFoodText, suggestFoodTagCodes } from './food-tag-matcher';

const INCLUDE = { tags: { include: { tag: true } } } as const;
type Asset = Prisma.FoodImageAssetGetPayload<{ include: typeof INCLUDE }>;
type Tag = { id: string; code: string; group: string; nameAr: string; nameEn: string; nameIt: string };
const bad = (code: string, message: string) => new BadRequestException({ error: { code, message } });
const notFound = () => new NotFoundException({ error: { code: 'FOOD_IMAGE_NOT_FOUND', message: 'Image not found.' } });
const blocked = (code: string, message: string) => new ConflictException({ error: { code, message } });

function view(asset: Asset) {
  return {
    id: asset.id,
    name: asset.name,
    originalFilename: asset.originalFilename,
    assetPath: asset.assetPath,
    status: asset.status,
    presentation: asset.presentation,
    sectors: asset.sectors,
    tags: asset.tags.map(({ tag }) => ({
      id: tag.id, code: tag.code, group: tag.group, nameAr: tag.nameAr, nameEn: tag.nameEn, nameIt: tag.nameIt,
    })),
    reviewedAt: asset.reviewedAt?.toISOString() ?? null,
    publishedAt: asset.publishedAt?.toISOString() ?? null,
    createdAt: asset.createdAt.toISOString(),
  };
}

function tagView(tag: Tag) {
  return { id: tag.id, code: tag.code, group: tag.group,
    nameAr: tag.nameAr, nameEn: tag.nameEn, nameIt: tag.nameIt };
}

@Injectable()
export class FoodLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ImageStorageService,
  ) {}

  async tags(query: FoodTagListQueryDto) {
    const normalized = normalizeFoodText(query.search ?? '');
    const rows = await this.prisma.foodTag.findMany({
      where: normalized ? {
        aliases: { some: { normalized: { contains: normalized } } },
      } : {},
      orderBy: { code: 'asc' },
      take: query.limit ?? 30,
    });
    return rows.map(tagView);
  }

  async suggestedTags(name: string) {
    const rows = await this.prisma.foodTag.findMany({
      include: { aliases: { select: { term: true } } },
    });
    const codes = suggestFoodTagCodes(name, rows.map((row) => ({
      code: row.code,
      aliases: row.aliases.map((alias) => alias.term),
    })));
    return rows.filter((tag) => codes.includes(tag.code)).map(tagView);
  }

  async list(query: FoodImageListQueryDto) {
    const search = (query.search ?? '').trim();
    const normalized = normalizeFoodText(search);
    const matchedTagIds = normalized
      ? (await this.prisma.foodTag.findMany({
        where: { aliases: { some: { normalized: { contains: normalized } } } },
        select: { id: true },
      })).map((tag) => tag.id)
      : [];
    const where: Prisma.FoodImageAssetWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.presentation ? { presentation: query.presentation } : {}),
      ...(query.sector ? { sectors: { has: query.sector } } : {}),
      ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { tags: { some: { tagId: { in: matchedTagIds } } } },
      ] } : {}),
    };
    const page = query.page ?? 1, pageSize = query.pageSize ?? 24;
    const [items, total] = await Promise.all([
      this.prisma.foodImageAsset.findMany({
        where, include: INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.foodImageAsset.count({ where }),
    ]);
    return { items: items.map(view), page, pageSize, total };
  }

  async get(id: string) {
    const asset = await this.prisma.foodImageAsset.findUnique({ where: { id }, include: INCLUDE });
    if (!asset) throw notFound();
    return view(asset);
  }

  async fileForPreview(id: string) {
    const asset = await this.prisma.foodImageAsset.findUnique({
      where: { id }, select: { assetPath: true, mimeType: true },
    });
    if (!asset || !/^\/media\/[a-f0-9-]+\.(jpg|png|webp)$/.test(asset.assetPath)) {
      throw notFound();
    }
    return { filename: asset.assetPath.slice('/media/'.length), mimeType: asset.mimeType };
  }

  async upload(file: UploadedImageFile | undefined) {
    assertValidImageUpload(file);
    const size = readImageDimensions(file.buffer, file.mimetype);
    if (!size || size.width > 6000 || size.height > 6000 || size.width * size.height > 24_000_000) {
      throw bad('FOOD_IMAGE_DIMENSIONS_INVALID', 'Image dimensions are invalid or too large.');
    }
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.foodImageAsset.findUnique({ where: { sha256 }, select: { id: true } });
    if (duplicate) throw blocked('FOOD_IMAGE_DUPLICATE', 'This image is already in the library.');

    // Filename is only metadata and the initial review title; storage always creates a UUID path.
    const originalFilename = basename(file.originalname.replace(/\\/g, '/')).slice(0, 255);
    const name = originalFilename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 160) || 'Untitled image';
    const suggestions = await this.suggestedTags(name);
    const saved = await this.storage.saveImage(file.buffer, file.mimetype);
    try {
      const image = await this.prisma.foodImageAsset.create({
        data: { name, originalFilename, assetPath: saved.assetPath, sha256,
          mimeType: file.mimetype, sizeBytes: file.size },
        include: INCLUDE,
      });
      return { image: view(image), suggestions };
    } catch (error: unknown) {
      await this.storage.deleteImageBestEffort(saved.assetPath);
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw blocked('FOOD_IMAGE_DUPLICATE', 'This image is already in the library.');
      }
      throw error;
    }
  }

  async review(id: string, dto: ReviewFoodImageDto, adminId: string) {
    const current = await this.prisma.foodImageAsset.findUnique({ where: { id } });
    if (!current) throw notFound();
    if (current.status === 'ARCHIVED') throw blocked('FOOD_IMAGE_ARCHIVED', 'Restore the image before editing it.');
    const tagIds = [...new Set(dto.tagIds)];
    const sectors = [...new Set(dto.sectors)];
    const validTags = await this.prisma.foodTag.count({ where: { id: { in: tagIds } } });
    if (validTags !== tagIds.length) throw bad('FOOD_TAG_UNKNOWN', 'Select tags from the approved dictionary.');
    if (sectors.length === 0) throw bad('FOOD_SECTOR_REQUIRED', 'Choose at least one suitable sector.');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.foodImageTag.deleteMany({ where: { imageId: id } });
      await tx.foodImageTag.createMany({ data: tagIds.map((tagId) => ({ imageId: id, tagId })) });
      return tx.foodImageAsset.update({
        where: { id },
        data: { name: dto.name.trim(), presentation: dto.presentation,
          sectors,
          reviewedAt: new Date(), reviewedByAdminId: adminId,
          status: 'DRAFT', publishedAt: null },
        include: INCLUDE,
      });
    });
    return view(updated);
  }

  /**
   * Shared changes deliberately invalidate review, even if a photo was already
   * published. Admin must verify the visual contents again before republishing.
   */
  async bulkApply(dto: BulkFoodImageDto) {
    if (!dto.presentation && !dto.sectors && (!dto.addTagIds || dto.addTagIds.length === 0)) {
      throw bad('FOOD_BULK_EMPTY', 'Choose a state, sector or tag before applying.');
    }
    const ids = [...new Set(dto.ids)];
    const rows = await this.prisma.foodImageAsset.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } });
    if (rows.length !== ids.length) throw notFound();
    if (rows.some((row) => row.status === 'ARCHIVED')) throw blocked('FOOD_IMAGE_ARCHIVED', 'Restore archived images before editing.');
    const tagIds = [...new Set(dto.addTagIds ?? [])];
    if (tagIds.length > 0) {
      const count = await this.prisma.foodTag.count({ where: { id: { in: tagIds } } });
      if (count !== tagIds.length) throw bad('FOOD_TAG_UNKNOWN', 'Select known tags from the dictionary.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.foodImageAsset.updateMany({
        where: { id: { in: ids } },
        data: {
          ...(dto.presentation ? { presentation: dto.presentation } : {}),
          ...(dto.sectors ? { sectors: [...new Set(dto.sectors)] } : {}),
          status: 'DRAFT', reviewedAt: null, reviewedByAdminId: null, publishedAt: null,
        },
      });
      if (tagIds.length) {
        await tx.foodImageTag.createMany({
          data: ids.flatMap((imageId) => tagIds.map((tagId) => ({ imageId, tagId }))),
          skipDuplicates: true,
        });
      }
    });
    return { updated: ids.length };
  }

  /** Atomic, all-or-nothing publish. No filename-based suggestion can bypass explicit review. */
  async publish(rawIds: string[]) {
    const ids = [...new Set(rawIds)];
    await this.prisma.$transaction(async (tx) => {
      const images = await tx.foodImageAsset.findMany({
        where: { id: { in: ids } },
        include: { tags: { select: { tagId: true } } },
      });
      if (images.length !== ids.length) throw notFound();
      if (images.some((image) => image.status === 'ARCHIVED')) {
        throw blocked('FOOD_IMAGE_ARCHIVED', 'Archived images cannot be published.');
      }
      if (images.some((image) =>
        !image.name.trim() || !image.reviewedAt || image.presentation === 'UNSPECIFIED' ||
        image.sectors.length === 0 || image.tags.length === 0
      )) throw blocked('FOOD_IMAGE_NOT_REVIEWED', 'Review the name, approved tags, state and sectors before publishing.');
      await tx.foodImageAsset.updateMany({
        where: { id: { in: ids } }, data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
    });
    return { published: ids.length };
  }

  async archive(id: string) {
    const exists = await this.prisma.foodImageAsset.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound();
    await this.prisma.foodImageAsset.update({ where: { id }, data: { status: 'ARCHIVED' } });
    // Files are deliberately retained. Archiving must never unlink shared storage.
    return { id, status: 'ARCHIVED' as const };
  }

  async restore(id: string) {
    const exists = await this.prisma.foodImageAsset.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound();
    await this.prisma.foodImageAsset.update({
      where: { id }, data: { status: 'DRAFT', reviewedAt: null, reviewedByAdminId: null, publishedAt: null },
    });
    return { id, status: 'DRAFT' as const };
  }
}
