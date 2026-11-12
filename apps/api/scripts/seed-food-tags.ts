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
    // A seeded tag is a bootstrap only. Once it exists, the Platform Admin owns
    // its labels AND its alias set, including alias removals. Re-running the CLI
    // must never silently restore a deleted alias or overwrite a correction.
    const existingTags = await prisma.foodTag.findMany({
      where: { code: { in: FOOD_TAG_CATALOG.map((tag) => tag.code) } },
      select: { id: true, code: true },
    });
    const ids = new Map(existingTags.map((tag) => [tag.code, tag.id]));
    const newTags = FOOD_TAG_CATALOG.filter((tag) => !ids.has(tag.code));
    const aliasesToCreate = plan.aliases.filter(
      (alias) => !ids.has(alias.code),
    );

    // Preflight only NEW aliases. Edits on existing tags are authoritative.
    const current = await prisma.foodTagAlias.findMany({
      select: {
        locale: true,
        normalized: true,
        tag: { select: { code: true } },
      },
    });
    const owners = new Map(
      current.map((alias) => [
        alias.locale + ':' + alias.normalized,
        alias.tag.code,
      ]),
    );
    for (const alias of aliasesToCreate) {
      const currentOwner = owners.get(alias.locale + ':' + alias.normalized);
      if (currentOwner && currentOwner !== alias.code) {
        throw new Error(
          'Database alias conflict for ' +
            alias.locale +
            ':' +
            alias.normalized +
            ' (' +
            currentOwner +
            ' vs ' +
            alias.code +
            '). Nothing was written.',
        );
      }
    }

    // Create each NEW tag and its aliases atomically. A partially interrupted
    // seed cannot leave a tag without aliases on the next run.
    for (const tag of newTags) {
      const aliases = plan.aliases
        .filter((alias) => alias.code === tag.code)
        .map(({ locale, term, normalized }) => ({
          locale,
          term,
          normalized,
        }));
      const created = await prisma.foodTag.create({
        data: {
          code: tag.code,
          nameAr: tag.nameAr,
          nameEn: tag.nameEn,
          nameIt: tag.nameIt,
          group: tag.group,
          aliases: { create: aliases },
        },
        select: { id: true },
      });
      ids.set(tag.code, created.id);
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
