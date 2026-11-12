/**
 * Platform Food Library AR/EN/IT lexicon seed.
 *
 * Usage (from repository root, PowerShell):
 *   npm run seed:food-tags --workspace=apps/api
 *   npm run seed:food-tags --workspace=apps/api -- --apply
 *
 * Dry-run is the default and performs zero DB writes. --apply MUST be deliberate,
 * after deploying the additive migration and verifying DB backups.
 * Idempotent: upserts stable canonical codes / aliases / related hints; never
 * deletes any tag, image, alias or restaurant data.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  FOOD_TAG_CATALOG,
  FOOD_TAG_RELATIONS,
} from '../src/platform/food-library/food-tag-catalog';
import { normalizeFoodText } from '../src/platform/food-library/food-tag-matcher';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

type Locale = 'ar' | 'en' | 'it';
interface PreparedAlias {
  code: string;
  locale: Locale;
  term: string;
  normalized: string;
}

export function validateFoodTagCatalog() {
  const seenCodes = new Set<string>();
  const seenAliases = new Map<string, string>();
  const prepared: PreparedAlias[] = [];
  for (const tag of FOOD_TAG_CATALOG) {
    if (seenCodes.has(tag.code))
      throw new Error('Duplicate canonical code: ' + tag.code);
    seenCodes.add(tag.code);
    if (!tag.nameAr.trim() || !tag.nameEn.trim() || !tag.nameIt.trim()) {
      throw new Error('Missing reviewed translation: ' + tag.code);
    }
    for (const locale of ['ar', 'en', 'it'] as const) {
      for (const term of tag.aliases[locale]) {
        const normalized = normalizeFoodText(term);
        if (normalized.length < 2 || normalized.length > 150) {
          throw new Error('Invalid alias for ' + tag.code + ': ' + term);
        }
        const key = locale + ':' + normalized;
        const owner = seenAliases.get(key);
        if (owner && owner !== tag.code) {
          throw new Error(
            'Ambiguous same-language alias ' +
              key +
              ': ' +
              owner +
              ' and ' +
              tag.code,
          );
        }
        if (owner === tag.code) continue;
        seenAliases.set(key, tag.code);
        prepared.push({ code: tag.code, locale, term, normalized });
      }
    }
  }
  const seenRelations = new Set<string>();
  for (const [from, to] of FOOD_TAG_RELATIONS) {
    if (!seenCodes.has(from) || !seenCodes.has(to) || from === to) {
      throw new Error('Invalid related-tag hint: ' + from + ' -> ' + to);
    }
    const key = from + ':' + to;
    if (seenRelations.has(key)) throw new Error('Duplicate relation: ' + key);
    seenRelations.add(key);
  }
  return {
    aliases: prepared,
    tagCount: seenCodes.size,
    relationCount: seenRelations.size,
  };
}

async function main(): Promise<void> {
  const plan = validateFoodTagCatalog();
  const apply = process.argv.includes('--apply');
  console.log(
    'Food tag catalog: ' +
      plan.tagCount +
      ' canonical tags, ' +
      plan.aliases.length +
      ' AR/EN/IT labels and aliases, ' +
      plan.relationCount +
      ' soft related-tag hints.',
  );
  if (!apply) {
    console.log(
      'DRY RUN: no database accessed or modified. Pass --apply to write after backup and migration.',
    );
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error('DATABASE_URL is required for --apply.');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    // Preflight ALL existing aliases before writing, so a custom tag cannot be silently reassigned.
    const current = await prisma.foodTagAlias.findMany({
      select: {
        locale: true,
        normalized: true,
        tag: { select: { code: true } },
      },
    });
    const owners = new Map(
      current.map((a) => [a.locale + ':' + a.normalized, a.tag.code]),
    );
    for (const a of plan.aliases) {
      const currentOwner = owners.get(a.locale + ':' + a.normalized);
      if (currentOwner && currentOwner !== a.code) {
        throw new Error(
          'Database alias conflict for ' +
            a.locale +
            ':' +
            a.normalized +
            ' (' +
            currentOwner +
            ' vs ' +
            a.code +
            '). Nothing was written.',
        );
      }
    }

    const ids = new Map<string, string>();
    for (const tag of FOOD_TAG_CATALOG) {
      const saved = await prisma.foodTag.upsert({
        where: { code: tag.code },
        create: {
          code: tag.code,
          nameAr: tag.nameAr,
          nameEn: tag.nameEn,
          nameIt: tag.nameIt,
          group: tag.group,
        },
        update: {
          nameAr: tag.nameAr,
          nameEn: tag.nameEn,
          nameIt: tag.nameIt,
          group: tag.group,
        },
      });
      ids.set(tag.code, saved.id);
    }

    for (const alias of plan.aliases) {
      const tagId = ids.get(alias.code)!;
      await prisma.foodTagAlias.upsert({
        where: {
          locale_normalized: {
            locale: alias.locale,
            normalized: alias.normalized,
          },
        },
        create: {
          tagId,
          locale: alias.locale,
          term: alias.term,
          normalized: alias.normalized,
        },
        update: { term: alias.term },
      });
    }

    for (const [from, to] of FOOD_TAG_RELATIONS) {
      const fromId = ids.get(from)!;
      const toId = ids.get(to)!;
      await prisma.foodTagRelation.upsert({
        where: { fromId_toId: { fromId, toId } },
        create: { fromId, toId },
        update: {},
      });
    }
    console.log('APPLIED: existing data preserved; catalog is safe to re-run.');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Unexpected seeding error.',
  );
  process.exitCode = 1;
});
