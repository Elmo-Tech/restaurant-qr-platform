import { Prisma } from '../generated/prisma/client';
import {
  backfillRestaurantSlugs,
  changeRestaurantSlug,
  ensureRestaurantSlug,
} from './restaurant-slug-store';

interface SlugRow {
  id: string;
  slug: string;
  restaurantId: string;
  isCurrent: boolean;
}

/** An in-memory stand-in for the two tables, enforcing the same unique rules as the database. */
function build(
  restaurants: Array<{ id: string; name: string }>,
  rows: SlugRow[] = [],
  options: { failFirstCreateWithUnique?: boolean } = {},
) {
  const table = [...rows];
  let seq = 0;
  let failNext = options.failFirstCreateWithUnique ?? false;
  const slugApi = {
    findMany: jest.fn(({ where }: { where: { slug: { in: string[] } } }) =>
      Promise.resolve(
        table
          .filter((row) => where.slug.in.includes(row.slug))
          .map((row) => ({ slug: row.slug })),
      ),
    ),
    findUnique: jest.fn(({ where }: { where: { slug: string } }) =>
      Promise.resolve(table.find((row) => row.slug === where.slug) ?? null),
    ),
    findFirst: jest.fn(
      ({ where }: { where: { restaurantId: string; isCurrent: boolean } }) =>
        Promise.resolve(
          table.find(
            (row) =>
              row.restaurantId === where.restaurantId &&
              row.isCurrent === where.isCurrent,
          ) ?? null,
        ),
    ),
    create: jest.fn(
      ({
        data,
      }: {
        data: { slug: string; restaurantId: string; isCurrent: boolean };
      }) => {
        if (failNext) {
          failNext = false;
          return Promise.reject(uniqueViolation());
        }
        if (table.some((row) => row.slug === data.slug))
          return Promise.reject(uniqueViolation());
        if (
          data.isCurrent &&
          table.some((r) => r.restaurantId === data.restaurantId && r.isCurrent)
        ) {
          return Promise.reject(uniqueViolation());
        }
        const row = { id: `slug-${(seq += 1)}`, ...data };
        table.push(row);
        return Promise.resolve(row);
      },
    ),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: { isCurrent: boolean };
      }) => {
        const row = table.find((r) => r.id === where.id) as SlugRow;
        if (
          data.isCurrent &&
          table.some(
            (r) =>
              r.restaurantId === row.restaurantId && r.isCurrent && r !== row,
          )
        ) {
          return Promise.reject(uniqueViolation());
        }
        row.isCurrent = data.isCurrent;
        return Promise.resolve(row);
      },
    ),
  };
  const restaurantApi = {
    findMany: jest.fn(() =>
      Promise.resolve(
        restaurants.filter(
          (r) => !table.some((row) => row.restaurantId === r.id),
        ),
      ),
    ),
    count: jest.fn(() => Promise.resolve(restaurants.length)),
    findUnique: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(restaurants.find((r) => r.id === where.id) ?? null),
    ),
  };
  const db = {
    restaurant: restaurantApi,
    restaurantSlug: slugApi,
    $transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({ restaurant: restaurantApi, restaurantSlug: slugApi }),
    ),
  };
  return { db: db as never, table, slugApi, transaction: db.$transaction };
}

function uniqueViolation(): Error {
  const error = Object.create(
    Prisma.PrismaClientKnownRequestError.prototype,
  ) as Error & {
    code: string;
    meta: unknown;
  };
  error.code = 'P2002';
  error.meta = {};
  return error;
}

describe('backfillRestaurantSlugs', () => {
  const restaurants = [
    { id: 'r1', name: 'VERDE Napoletana' },
    { id: 'r2', name: 'El Sherbiny' },
    { id: 'r3', name: 'الشربيني' },
    { id: 'r4', name: 'El Sherbiny' },
  ];

  it('gives EVERY restaurant without a slug a current one; same names get a number', async () => {
    const m = build(restaurants);

    const summary = await backfillRestaurantSlugs(m.db);

    expect(summary.assigned.map((a) => a.slug)).toEqual([
      'verde-napoletana',
      'el-sherbiny',
      'al-shrbyny',
      'el-sherbiny-2',
    ]);
    expect(summary.alreadyHadSlug).toBe(0);
    expect(m.table.every((row) => row.isCurrent)).toBe(true);
    expect(new Set(m.table.map((row) => row.restaurantId)).size).toBe(4);
  });

  it('is repeatable: a second run changes nothing', async () => {
    const m = build(restaurants);
    await backfillRestaurantSlugs(m.db);
    const before = JSON.stringify(m.table);

    const second = await backfillRestaurantSlugs(m.db);

    expect(second.assigned).toEqual([]);
    expect(second.alreadyHadSlug).toBe(4);
    expect(JSON.stringify(m.table)).toBe(before);
  });

  it('never touches a restaurant that already has a slug', async () => {
    const m = build(restaurants, [
      { id: 'x', slug: 'my-chosen-link', restaurantId: 'r2', isCurrent: true },
    ]);

    const summary = await backfillRestaurantSlugs(m.db);

    expect(summary.alreadyHadSlug).toBe(1);
    expect(m.table.find((row) => row.restaurantId === 'r2')?.slug).toBe(
      'my-chosen-link',
    );
    // r4 has the same name as r2 but r2 holds a different slug now, so r4 takes the plain name.
    expect(summary.assigned.find((a) => a.restaurantId === 'r4')?.slug).toBe(
      'el-sherbiny',
    );
  });

  it('a dry run writes nothing but reports the same picks, including numbers', async () => {
    const m = build(restaurants);

    const summary = await backfillRestaurantSlugs(m.db, { dryRun: true });

    expect(m.slugApi.create).not.toHaveBeenCalled();
    expect(m.table).toEqual([]);
    expect(summary.assigned.map((a) => a.slug)).toEqual([
      'verde-napoletana',
      'el-sherbiny',
      'al-shrbyny',
      'el-sherbiny-2',
    ]);
  });

  it('retries with the next number when a concurrent run won the same slug', async () => {
    const m = build([{ id: 'r1', name: 'Pizza House' }], [], {
      failFirstCreateWithUnique: true,
    });

    const summary = await backfillRestaurantSlugs(m.db);

    expect(summary.assigned).toHaveLength(1);
    expect(m.table).toHaveLength(1);
  });
});

describe('ensureRestaurantSlug', () => {
  it('returns the current slug, or creates one for a restaurant that has none', async () => {
    const m = build([{ id: 'r1', name: 'Pizza House' }]);

    await expect(ensureRestaurantSlug(m.db, 'r1')).resolves.toBe('pizza-house');
    await expect(ensureRestaurantSlug(m.db, 'r1')).resolves.toBe('pizza-house');
    expect(m.table).toHaveLength(1);
    await expect(ensureRestaurantSlug(m.db, 'unknown')).resolves.toBeNull();
  });
});

describe('changeRestaurantSlug (Platform edit)', () => {
  const restaurants = [
    { id: 'r1', name: 'One' },
    { id: 'r2', name: 'Two' },
  ];
  const seeded = (): SlugRow[] => [
    { id: 's1', slug: 'one', restaurantId: 'r1', isCurrent: true },
    { id: 's2', slug: 'two', restaurantId: 'r2', isCurrent: true },
  ];

  it('makes the new slug current and keeps the old one as a former slug (so old links redirect)', async () => {
    const m = build(restaurants, seeded());

    const result = await changeRestaurantSlug(m.db, 'r1', 'new-name');

    expect(result).toEqual({
      outcome: 'updated',
      slug: 'new-name',
      previousSlug: 'one',
    });
    const mine = m.table.filter((row) => row.restaurantId === 'r1');
    expect(mine.map((row) => [row.slug, row.isCurrent]).sort()).toEqual([
      ['new-name', true],
      ['one', false],
    ]);
  });

  it('normalizes what the person typed', async () => {
    const m = build(restaurants, seeded());

    await expect(
      changeRestaurantSlug(m.db, 'r1', '  New-Name '),
    ).resolves.toMatchObject({
      outcome: 'updated',
      slug: 'new-name',
    });
  });

  it("refuses another restaurant's slug, current or former", async () => {
    const m = build(restaurants, [
      ...seeded(),
      { id: 's3', slug: 'two-old', restaurantId: 'r2', isCurrent: false },
    ]);

    await expect(changeRestaurantSlug(m.db, 'r1', 'two')).resolves.toEqual({
      outcome: 'taken',
    });
    await expect(changeRestaurantSlug(m.db, 'r1', 'two-old')).resolves.toEqual({
      outcome: 'taken',
    });
    expect(m.table.find((row) => row.id === 's1')?.isCurrent).toBe(true);
  });

  it('may return to one of its own former slugs', async () => {
    const m = build(restaurants, [
      { id: 's1', slug: 'one', restaurantId: 'r1', isCurrent: false },
      { id: 's9', slug: 'one-b', restaurantId: 'r1', isCurrent: true },
      { id: 's2', slug: 'two', restaurantId: 'r2', isCurrent: true },
    ]);

    await expect(
      changeRestaurantSlug(m.db, 'r1', 'one'),
    ).resolves.toMatchObject({
      outcome: 'updated',
      slug: 'one',
      previousSlug: 'one-b',
    });
    expect(
      m.table
        .filter((row) => row.restaurantId === 'r1' && row.isCurrent)
        .map((r) => r.slug),
    ).toEqual(['one']);
  });

  it('reports no change for its current slug', async () => {
    const m = build(restaurants, seeded());

    await expect(changeRestaurantSlug(m.db, 'r1', 'one')).resolves.toEqual({
      outcome: 'unchanged',
      slug: 'one',
    });
  });

  it('rejects invalid and reserved slugs without touching anything', async () => {
    const m = build(restaurants, seeded());

    await expect(
      changeRestaurantSlug(m.db, 'r1', 'Has Space'),
    ).resolves.toEqual({
      outcome: 'invalid',
      problem: 'format',
    });
    await expect(changeRestaurantSlug(m.db, 'r1', 'مطعم')).resolves.toEqual({
      outcome: 'invalid',
      problem: 'format',
    });
    await expect(changeRestaurantSlug(m.db, 'r1', 'admin')).resolves.toEqual({
      outcome: 'invalid',
      problem: 'reserved',
    });
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it('reports notFound for an unknown restaurant', async () => {
    const m = build(restaurants, seeded());

    await expect(
      changeRestaurantSlug(m.db, 'nobody', 'fresh-name'),
    ).resolves.toEqual({
      outcome: 'notFound',
    });
  });

  it('a lost race on the unique index reports taken, never a crash', async () => {
    const m = build(restaurants, seeded(), { failFirstCreateWithUnique: true });

    await expect(
      changeRestaurantSlug(m.db, 'r1', 'brand-new'),
    ).resolves.toEqual({ outcome: 'taken' });
  });
});
