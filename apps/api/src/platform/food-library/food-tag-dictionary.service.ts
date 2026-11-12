import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { normalizeFoodText } from './food-tag-matcher';
import type {
  FoodTagCatalogQueryDto,
  FoodTagWriteDto,
} from './food-tag-dictionary.dto';

type Locale = 'ar' | 'en' | 'it';
type PreparedAlias = { locale: Locale; term: string; normalized: string };

const INCLUDE = {
  aliases: true,
  _count: { select: { images: true } },
} as const;

type DetailedTag = Prisma.FoodTagGetPayload<{
  include: typeof INCLUDE;
}>;

const invalid = (code: string, message: string) =>
  new BadRequestException({ error: { code, message } });
const conflict = (code: string, message: string) =>
  new ConflictException({ error: { code, message } });
const missing = () =>
  new NotFoundException({
    error: { code: 'FOOD_TAG_NOT_FOUND', message: 'Tag not found.' },
  });

/** Canonical labels are also searchable aliases. Disallow duplicate/conflicting normalization. */
export function prepareFoodTagAliases(
  input: Pick<
    FoodTagWriteDto,
    | 'nameAr'
    | 'nameEn'
    | 'nameIt'
    | 'aliasesAr'
    | 'aliasesEn'
    | 'aliasesIt'
  >,
): PreparedAlias[] {
  const values: Array<[Locale, string, string[]]> = [
    ['ar', input.nameAr, input.aliasesAr],
    ['en', input.nameEn, input.aliasesEn],
    ['it', input.nameIt, input.aliasesIt],
  ];
  const deduplicated = new Map<string, PreparedAlias>();
  for (const [locale, label, aliases] of values) {
    for (const raw of [label, ...aliases]) {
      const term = raw.trim();
      const normalized = normalizeFoodText(term);
      if (normalized.length < 2 || normalized.length > 150) {
        throw invalid(
          'FOOD_TAG_ALIAS_INVALID',
          'Each label or alias must contain 2 to 150 meaningful characters.',
        );
      }
      const key = locale + ':' + normalized;
      if (!deduplicated.has(key)) {
        deduplicated.set(key, { locale, term, normalized });
      }
    }
  }
  return [...deduplicated.values()];
}

function view(tag: DetailedTag) {
  return {
    id: tag.id,
    code: tag.code,
    group: tag.group,
    nameAr: tag.nameAr,
    nameEn: tag.nameEn,
    nameIt: tag.nameIt,
    imageCount: tag._count.images,
    updatedAt: tag.updatedAt.toISOString(),
    aliases: {
      ar: tag.aliases.filter((alias) => alias.locale === 'ar').map((alias) => alias.term),
      en: tag.aliases.filter((alias) => alias.locale === 'en').map((alias) => alias.term),
      it: tag.aliases.filter((alias) => alias.locale === 'it').map((alias) => alias.term),
    },
  };
}

@Injectable()
export class FoodTagDictionaryService {
  constructor(private readonly prisma: PrismaService) {}

  async catalog(query: FoodTagCatalogQueryDto) {
    const search = (query.search ?? '').trim();
    const normalized = normalizeFoodText(search);
    const where: Prisma.FoodTagWhereInput = {
      ...(query.group ? { group: query.group } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search.toUpperCase() } },
              { aliases: { some: { normalized: { contains: normalized } } } },
            ],
          }
        : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const [rows, total] = await Promise.all([
      this.prisma.foodTag.findMany({
        where,
        include: INCLUDE,
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.foodTag.count({ where }),
    ]);
    return { items: rows.map(view), total, page, pageSize };
  }

  async create(dto: FoodTagWriteDto) {
    const code = dto.code?.trim();
    if (!code || !/^[A-Z][A-Z0-9_]{1,79}$/.test(code)) {
      throw invalid('FOOD_TAG_CODE_INVALID', 'Enter a stable uppercase canonical code.');
    }
    const prepared = prepareFoodTagAliases(dto);
    try {
      await this.assertNoAliasConflict(prepared);
      const created = await this.prisma.foodTag.create({
        data: {
          code,
          group: dto.group,
          nameAr: dto.nameAr.trim(),
          nameEn: dto.nameEn.trim(),
          nameIt: dto.nameIt.trim(),
          aliases: { create: prepared },
        },
        include: INCLUDE,
      });
      return view(created);
    } catch (error: unknown) {
      this.rethrowConflict(error);
      throw error;
    }
  }

  async update(id: string, dto: FoodTagWriteDto) {
    const prepared = prepareFoodTagAliases(dto);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const old = await tx.foodTag.findUnique({
          where: { id },
          select: { code: true },
        });
        if (!old) throw missing();
        if (dto.code && dto.code !== old.code) {
          throw conflict('FOOD_TAG_CODE_IMMUTABLE', 'Canonical IDs cannot be renamed.');
        }
        await this.assertNoAliasConflict(prepared, id, tx);
        await tx.foodTagAlias.deleteMany({ where: { tagId: id } });
        await tx.foodTagAlias.createMany({
          data: prepared.map((alias) => ({ ...alias, tagId: id })),
        });
        return tx.foodTag.update({
          where: { id },
          data: {
            group: dto.group,
            nameAr: dto.nameAr.trim(),
            nameEn: dto.nameEn.trim(),
            nameIt: dto.nameIt.trim(),
          },
          include: INCLUDE,
        });
      });
      return view(result);
    } catch (error: unknown) {
      this.rethrowConflict(error);
      throw error;
    }
  }

  private async assertNoAliasConflict(
    aliases: PreparedAlias[],
    exceptId?: string,
    tx: Pick<PrismaService, 'foodTagAlias'> = this.prisma,
  ) {
    const existing = await tx.foodTagAlias.findFirst({
      where: {
        ...(exceptId ? { tagId: { not: exceptId } } : {}),
        OR: aliases.map((alias) => ({
          locale: alias.locale,
          normalized: alias.normalized,
        })),
      },
      select: { id: true },
    });
    if (existing) {
      throw conflict(
        'FOOD_TAG_ALIAS_CONFLICT',
        'A tag in the dictionary already uses one of these aliases for that language.',
      );
    }
  }

  private rethrowConflict(error: unknown): void {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      throw conflict(
        'FOOD_TAG_CONFLICT',
        'That canonical code or language-specific alias is already in use.',
      );
    }
  }
}
