import {
  applyBackfillPlan,
  buildBackfillPlan,
  classifyAction,
  validateDefaultLocale,
  verifyBackfill,
  type BackfillLocaleRow,
  type BackfillPlan,
  type BackfillPrismaClient,
  type BackfillRestaurantRow,
} from './restaurant-locales-backfill';

function restaurant(
  id: string,
  defaultLocale: string,
  publicId = `rest-${id}`,
): BackfillRestaurantRow {
  return { id, publicId, defaultLocale };
}

function buildMockPrisma(params: {
  restaurants: BackfillRestaurantRow[];
  locales?: BackfillLocaleRow[];
}) {
  const locales = params.locales ?? [];
  const restaurantFindMany = jest.fn().mockResolvedValue(params.restaurants);
  const restaurantLocaleFindMany = jest.fn().mockResolvedValue(locales);
  const restaurantLocaleUpsert = jest.fn().mockImplementation(
    (args: {
      where: {
        restaurantId_locale: { restaurantId: string; locale: string };
      };
    }) => {
      const { restaurantId, locale } = args.where.restaurantId_locale;
      const existing = locales.find(
        (row) => row.restaurantId === restaurantId && row.locale === locale,
      );
      if (existing) {
        existing.isActive = true;
      } else {
        locales.push({ restaurantId, locale, isActive: true });
      }
      return Promise.resolve(undefined);
    },
  );

  const prisma: BackfillPrismaClient = {
    restaurant: { findMany: restaurantFindMany },
    restaurantLocale: {
      findMany: restaurantLocaleFindMany,
      upsert: restaurantLocaleUpsert,
    },
  };

  return {
    prisma,
    restaurantFindMany,
    restaurantLocaleFindMany,
    restaurantLocaleUpsert,
    locales,
  };
}

describe('validateDefaultLocale', () => {
  it.each(['en', 'ar'])('%s is canonical', (value) => {
    expect(validateDefaultLocale(value)).toEqual({ status: 'canonical' });
  });

  it.each(['fr', 'de', 'en-US', 'ar-EG', 'english', ''])(
    '%s is unsupported',
    (value) => {
      expect(validateDefaultLocale(value)).toEqual({ status: 'unsupported' });
    },
  );

  it('a non-canonical persisted value that normalizes to a valid locale is reported, not silently accepted', () => {
    expect(validateDefaultLocale('EN')).toEqual({
      status: 'nonCanonical',
      normalized: 'en',
    });
  });

  it('non-canonical whitespace form is also reported', () => {
    expect(validateDefaultLocale(' ar ')).toEqual({
      status: 'nonCanonical',
      normalized: 'ar',
    });
  });
});

describe('classifyAction', () => {
  const r = restaurant('r1', 'en');

  it('no existing row -> create', () => {
    expect(classifyAction(r, undefined)).toEqual({
      type: 'create',
      restaurant: r,
    });
  });

  it('existing inactive row -> activate', () => {
    expect(
      classifyAction(r, { restaurantId: 'r1', locale: 'en', isActive: false }),
    ).toEqual({ type: 'activate', restaurant: r });
  });

  it('existing active row -> noop', () => {
    expect(
      classifyAction(r, { restaurantId: 'r1', locale: 'en', isActive: true }),
    ).toEqual({ type: 'noop', restaurant: r });
  });
});

describe('buildBackfillPlan', () => {
  it('A: zero Restaurants -> ok, zero actions', async () => {
    const { prisma } = buildMockPrisma({ restaurants: [] });

    const plan = await buildBackfillPlan(prisma);

    expect(plan).toEqual({ ok: true, restaurantsScanned: 0, actions: [] });
  });

  it('B: an already-correct Restaurant classifies as noop', async () => {
    const r = restaurant('r1', 'en');
    const { prisma } = buildMockPrisma({
      restaurants: [r],
      locales: [{ restaurantId: 'r1', locale: 'en', isActive: true }],
    });

    const plan = await buildBackfillPlan(prisma);

    expect(plan).toEqual({
      ok: true,
      restaurantsScanned: 1,
      actions: [{ type: 'noop', restaurant: r }],
    });
  });

  it('C: a missing default row classifies as create (dry-run plan only, zero writes)', async () => {
    const r = restaurant('r1', 'en');
    const { prisma, restaurantLocaleUpsert } = buildMockPrisma({
      restaurants: [r],
      locales: [],
    });

    const plan = await buildBackfillPlan(prisma);

    expect(plan).toEqual({
      ok: true,
      restaurantsScanned: 1,
      actions: [{ type: 'create', restaurant: r }],
    });
    expect(restaurantLocaleUpsert).not.toHaveBeenCalled();
  });

  it('D: an inactive default row classifies as activate (dry-run plan only, zero writes)', async () => {
    const r = restaurant('r1', 'en');
    const { prisma, restaurantLocaleUpsert } = buildMockPrisma({
      restaurants: [r],
      locales: [{ restaurantId: 'r1', locale: 'en', isActive: false }],
    });

    const plan = await buildBackfillPlan(prisma);

    expect(plan).toEqual({
      ok: true,
      restaurantsScanned: 1,
      actions: [{ type: 'activate', restaurant: r }],
    });
    expect(restaurantLocaleUpsert).not.toHaveBeenCalled();
  });

  it('E: an unsupported defaultLocale aborts the plan with zero writes, even alongside valid Restaurants', async () => {
    const good = restaurant('r1', 'en');
    const bad = restaurant('r2', 'fr');
    const { prisma, restaurantLocaleFindMany, restaurantLocaleUpsert } =
      buildMockPrisma({ restaurants: [good, bad] });

    const plan = await buildBackfillPlan(prisma);

    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.restaurantsScanned).toBe(2);
      expect(plan.invalid).toEqual([
        { restaurant: bad, validation: { status: 'unsupported' } },
      ]);
    }
    // Validation must complete before any classification/write query runs.
    expect(restaurantLocaleFindMany).not.toHaveBeenCalled();
    expect(restaurantLocaleUpsert).not.toHaveBeenCalled();
  });

  it('F: a non-canonical persisted "EN" aborts the plan with zero writes -- never silently normalized', async () => {
    const bad = restaurant('r1', 'EN');
    const { prisma, restaurantLocaleFindMany, restaurantLocaleUpsert } =
      buildMockPrisma({ restaurants: [bad] });

    const plan = await buildBackfillPlan(prisma);

    expect(plan).toEqual({
      ok: false,
      restaurantsScanned: 1,
      invalid: [
        {
          restaurant: bad,
          validation: { status: 'nonCanonical', normalized: 'en' },
        },
      ],
    });
    expect(restaurantLocaleFindMany).not.toHaveBeenCalled();
    expect(restaurantLocaleUpsert).not.toHaveBeenCalled();
  });

  it('J: validation of ALL Restaurants happens before any classification query, regardless of which Restaurant is invalid', async () => {
    const bad = restaurant('r1', 'fr');
    const good = restaurant('r2', 'en');
    const { prisma, restaurantLocaleFindMany } = buildMockPrisma({
      restaurants: [good, bad],
    });

    const plan = await buildBackfillPlan(prisma);

    expect(plan.ok).toBe(false);
    expect(restaurantLocaleFindMany).not.toHaveBeenCalled();
  });
});

describe('applyBackfillPlan', () => {
  it('G: applying a create action upserts an active row', async () => {
    const r = restaurant('r1', 'en');
    const { prisma, restaurantLocaleUpsert, locales } = buildMockPrisma({
      restaurants: [r],
      locales: [],
    });
    const plan: Extract<BackfillPlan, { ok: true }> = {
      ok: true,
      restaurantsScanned: 1,
      actions: [{ type: 'create', restaurant: r }],
    };

    await applyBackfillPlan(prisma, plan);

    expect(restaurantLocaleUpsert).toHaveBeenCalledWith({
      where: { restaurantId_locale: { restaurantId: 'r1', locale: 'en' } },
      create: { restaurantId: 'r1', locale: 'en', isActive: true },
      update: { isActive: true },
    });
    expect(locales).toEqual([
      { restaurantId: 'r1', locale: 'en', isActive: true },
    ]);
  });

  it('H: applying an activate action upserts the existing row active', async () => {
    const r = restaurant('r1', 'en');
    const { prisma, restaurantLocaleUpsert, locales } = buildMockPrisma({
      restaurants: [r],
      locales: [{ restaurantId: 'r1', locale: 'en', isActive: false }],
    });
    const plan: Extract<BackfillPlan, { ok: true }> = {
      ok: true,
      restaurantsScanned: 1,
      actions: [{ type: 'activate', restaurant: r }],
    };

    await applyBackfillPlan(prisma, plan);

    expect(restaurantLocaleUpsert).toHaveBeenCalledTimes(1);
    expect(locales).toEqual([
      { restaurantId: 'r1', locale: 'en', isActive: true },
    ]);
  });

  it('never calls upsert for a noop action', async () => {
    const r = restaurant('r1', 'en');
    const { prisma, restaurantLocaleUpsert } = buildMockPrisma({
      restaurants: [r],
      locales: [{ restaurantId: 'r1', locale: 'en', isActive: true }],
    });
    const plan: Extract<BackfillPlan, { ok: true }> = {
      ok: true,
      restaurantsScanned: 1,
      actions: [{ type: 'noop', restaurant: r }],
    };

    await applyBackfillPlan(prisma, plan);

    expect(restaurantLocaleUpsert).not.toHaveBeenCalled();
  });

  it('I: re-running apply against an already-applied plan is idempotent (upsert again is a same-value no-op write)', async () => {
    const r = restaurant('r1', 'en');
    const { prisma, restaurantLocaleUpsert, locales } = buildMockPrisma({
      restaurants: [r],
      locales: [],
    });
    const plan: Extract<BackfillPlan, { ok: true }> = {
      ok: true,
      restaurantsScanned: 1,
      actions: [{ type: 'create', restaurant: r }],
    };

    await applyBackfillPlan(prisma, plan);
    await applyBackfillPlan(prisma, plan);

    expect(restaurantLocaleUpsert).toHaveBeenCalledTimes(2);
    expect(locales).toEqual([
      { restaurantId: 'r1', locale: 'en', isActive: true },
    ]);
  });
});

describe('verifyBackfill', () => {
  it('K: reports a Restaurant still lacking an active row as a verification failure', async () => {
    const r = restaurant('r1', 'en');
    const { prisma } = buildMockPrisma({
      restaurants: [r],
      locales: [{ restaurantId: 'r1', locale: 'en', isActive: false }],
    });

    const stillBroken = await verifyBackfill(prisma, [r]);

    expect(stillBroken).toEqual([r]);
  });

  it('an empty result means every Restaurant now has a matching active row', async () => {
    const r = restaurant('r1', 'en');
    const { prisma } = buildMockPrisma({
      restaurants: [r],
      locales: [{ restaurantId: 'r1', locale: 'en', isActive: true }],
    });

    const stillBroken = await verifyBackfill(prisma, [r]);

    expect(stillBroken).toEqual([]);
  });

  it('an empty restaurant list short-circuits without querying', async () => {
    const { prisma, restaurantLocaleFindMany } = buildMockPrisma({
      restaurants: [],
    });

    const stillBroken = await verifyBackfill(prisma, []);

    expect(stillBroken).toEqual([]);
    expect(restaurantLocaleFindMany).not.toHaveBeenCalled();
  });
});
