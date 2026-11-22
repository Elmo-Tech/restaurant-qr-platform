import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service';
import { Prisma } from '../src/generated/prisma/client';
import { OnboardingMenuWriterService } from '../src/platform/onboarding/onboarding-menu-writer.service';
import type { OnboardingMenuDraft } from '../src/platform/onboarding/onboarding-menu';
import { PlatformAuditService } from '../src/platform/platform-audit.service';
import type { PlatformAdminPrincipal } from '../src/platform/platform-auth.service';

const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const action = 'onboarding.menu_published';
const translation = (name: string) => ({ locale: 'en', name });
const draft: OnboardingMenuDraft = {
  menus: [
    {
      translations: [translation('Brunch'), { locale: 'ar', name: 'فطور' }],
      categories: [
        {
          translations: [translation('Drinks')],
          products: [
            {
              translations: [translation('Coffee')],
              price: '120.00',
              variants: [
                { translations: [translation('Large')], price: '120.00' },
                { translations: [translation('Small')], price: '100.05' },
              ],
              modifierGroups: [
                {
                  translations: [
                    { ...translation('Milk'), description: 'Choose one' },
                  ],
                  minSelections: 1,
                  maxSelections: 1,
                  options: [
                    { translations: [translation('Oat')], price: '0.30' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describeSandbox('Onboarding Platform menu writer (real PostgreSQL)', () => {
  let prisma: PrismaService;
  let audit: PlatformAuditService;
  let writer: OnboardingMenuWriterService;
  let admin: PlatformAdminPrincipal;
  const caseIds: string[] = [];
  const restaurantIds: string[] = [];
  const packageIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(
      new ConfigService({ DATABASE_URL: SANDBOX_URL }),
    );
    await assertSandboxIdentity(prisma);
    audit = new PlatformAuditService(prisma);
    writer = new OnboardingMenuWriterService(prisma, audit);
    const email = `menu-writer-${randomUUID()}@example.test`;
    const row = await prisma.platformAdmin.create({
      data: {
        email,
        emailNormalized: email,
        passwordHash: 'not-used-by-service-test',
        displayName: 'Menu writer tester',
        status: 'ACTIVE',
      },
    });
    admin = {
      adminId: row.id,
      email,
      displayName: row.displayName,
      sessionId: randomUUID(),
    };
  });

  afterAll(async () => {
    try {
      if (!admin) return;
      const scoped = { restaurantId: { in: restaurantIds } };
      await prisma.platformAuditLog.deleteMany({
        where: { adminId: admin.adminId },
      });
      await prisma.onboardingCase.deleteMany({
        where: { id: { in: caseIds } },
      });
      await prisma.modifierOption.deleteMany({ where: scoped });
      await prisma.modifierGroup.deleteMany({ where: scoped });
      await prisma.productVariant.deleteMany({ where: scoped });
      await prisma.product.deleteMany({ where: scoped });
      await prisma.category.deleteMany({ where: scoped });
      await prisma.menu.deleteMany({ where: scoped });
      await prisma.restaurantLocale.deleteMany({ where: scoped });
      await prisma.restaurant.deleteMany({
        where: { id: { in: restaurantIds } },
      });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.platformAdmin.delete({ where: { id: admin.adminId } });
    } finally {
      await prisma?.$disconnect();
    }
  });

  async function fixture(
    fields: Partial<Prisma.OnboardingCaseUncheckedCreateInput> = {},
    options: { importEntitled?: boolean; extraLocale?: boolean } = {},
  ) {
    const tag = randomUUID();
    const pkg = await prisma.package.create({
      data: {
        name: tag,
        nameNormalized: tag,
        nameEn: tag,
        nameEnNormalized: tag,
        features: options.importEntitled
          ? { create: { feature: 'MENU_IMPORT' } }
          : undefined,
      },
    });
    packageIds.push(pkg.id);
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `restaurant-${tag}`,
        name: 'Menu writer restaurant',
        packageId: pkg.id,
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
        locales: {
          create: [
            { locale: 'en', isActive: true },
            { locale: 'ar', isActive: options.extraLocale ?? true },
          ],
        },
      },
    });
    restaurantIds.push(restaurant.id);
    const provisioningKey = randomUUID();
    const row = await prisma.onboardingCase.create({
      data: {
        mode: 'REAL',
        status: 'MENU_SETUP',
        restaurantId: restaurant.id,
        restaurantProvisionedAt: new Date(),
        provisioningKey,
        packageId: pkg.id,
        menuDraft: draft,
        ...fields,
      },
    });
    caseIds.push(row.id);
    return {
      caseId: row.id,
      provisioningKey,
      restaurantId: restaurant.id,
      packageId: pkg.id,
    };
  }

  it('concurrent retries commit one scoped graph, marker, revision bump and audit', async () => {
    const target = await fixture();
    const neighbor = await fixture();
    const input = {
      caseId: target.caseId,
      provisioningKey: target.provisioningKey,
    };
    const results = await Promise.all([
      writer.publish(admin, input),
      writer.publish(admin, input),
    ]);
    expect(results.map(({ outcome }) => outcome).sort()).toEqual([
      'alreadyPublished',
      'published',
    ]);

    const menu = await prisma.menu.findFirstOrThrow({
      where: { restaurantId: target.restaurantId },
      include: {
        translations: true,
        categories: {
          include: {
            products: {
              include: {
                variants: true,
                modifierGroups: {
                  include: { translations: true, options: true },
                },
              },
            },
          },
        },
      },
    });
    expect(
      await prisma.menu.count({ where: { restaurantId: target.restaurantId } }),
    ).toBe(1);
    expect(
      await prisma.menu.count({
        where: { restaurantId: neighbor.restaurantId },
      }),
    ).toBe(0);
    expect(menu).toMatchObject({
      isPrimary: true,
      status: 'ACTIVE',
      nameInternal: 'Brunch',
    });
    expect(menu.translations.map(({ locale }) => locale).sort()).toEqual([
      'ar',
      'en',
    ]);
    const [category] = menu.categories;
    const [product] = category.products;
    const [group] = product.modifierGroups;
    expect(
      [category, product, ...product.variants, group, ...group.options].every(
        ({ restaurantId }) => restaurantId === target.restaurantId,
      ),
    ).toBe(true);
    expect(product.publicId).toMatch(/^product-/);
    expect(product.basePrice.toFixed(2)).toBe('100.05');
    expect(
      product.variants.map(({ price }) => price.toFixed(2)).sort(),
    ).toEqual(['100.05', '120.00']);
    expect(group.translations[0].helperText).toBe('Choose one');
    expect(group.options[0].priceAdjustment.toFixed(2)).toBe('0.30');
    const saved = await prisma.onboardingCase.findUniqueOrThrow({
      where: { id: target.caseId },
    });
    expect(saved.revision).toBe(2);
    expect(saved.menuPublishedAt).toBeInstanceOf(Date);
    const entries = await prisma.platformAuditLog.findMany({
      where: { action, restaurantId: target.restaurantId },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].details).toEqual({
      caseId: target.caseId,
      imported: false,
      menus: 1,
      categories: 1,
      products: 1,
      variants: 2,
      modifierGroups: 1,
      modifierOptions: 1,
    });
  });

  it('does not write when the key, stage, restaurant or package is not eligible', async () => {
    const target = await fixture();
    const invalidStage = await fixture({ status: 'PROVISIONING' });
    const invalidRestaurant = await fixture({ restaurantProvisionedAt: null });
    const wrongPackage = await fixture({ packageId: target.packageId });
    expect(
      await writer.publish(admin, {
        caseId: target.caseId,
        provisioningKey: randomUUID(),
      }),
    ).toEqual({
      outcome: 'refused',
      code: 'ONBOARDING_PROVISIONING_KEY_CONFLICT',
    });
    expect(await writer.publish(admin, invalidStage)).toEqual({
      outcome: 'refused',
      code: 'ONBOARDING_INVALID_TRANSITION',
    });
    expect(await writer.publish(admin, invalidRestaurant)).toEqual({
      outcome: 'refused',
      code: 'ONBOARDING_RESTAURANT_NOT_ELIGIBLE',
    });
    expect(await writer.publish(admin, wrongPackage)).toEqual({
      outcome: 'refused',
      code: 'PACKAGE_NOT_AVAILABLE',
    });
    await prisma.package.update({
      where: { id: target.packageId },
      data: { status: 'ARCHIVED' },
    });
    expect(await writer.publish(admin, target)).toEqual({
      outcome: 'refused',
      code: 'PACKAGE_NOT_AVAILABLE',
    });
    expect(
      await prisma.menu.count({
        where: {
          restaurantId: {
            in: [
              target.restaurantId,
              invalidStage.restaurantId,
              invalidRestaurant.restaurantId,
              wrongPackage.restaurantId,
            ],
          },
        },
      }),
    ).toBe(0);
  });

  it('rechecks review, retention, effective MENU_IMPORT and active locale', async () => {
    const future = new Date(Date.now() + 60_000);
    const unreviewed = await fixture(
      { importExpiresAt: future },
      { importEntitled: true },
    );
    const expired = await fixture(
      {
        importExpiresAt: new Date(0),
        menuDraft: Prisma.DbNull,
        importReviewed: false,
      },
      { importEntitled: true },
    );
    const notEntitled = await fixture({
      importExpiresAt: future,
      importReviewed: true,
    });
    const localeInactive = await fixture({}, { extraLocale: false });
    expect(await writer.publish(admin, unreviewed)).toEqual({
      outcome: 'refused',
      code: 'ONBOARDING_IMPORT_REVIEW_REQUIRED',
    });
    expect(await writer.publish(admin, expired)).toEqual({
      outcome: 'refused',
      code: 'ONBOARDING_IMPORT_EXPIRED',
    });
    expect(await writer.publish(admin, notEntitled)).toEqual({
      outcome: 'refused',
      code: 'FEATURE_NOT_AVAILABLE',
    });
    expect(await writer.publish(admin, localeInactive)).toEqual({
      outcome: 'refused',
      code: 'ONBOARDING_MENU_INCOMPLETE',
      problems: ['menus[0].translations[1].locale'],
    });
    const entitled = await fixture(
      { importExpiresAt: future, importReviewed: true },
      { importEntitled: true },
    );
    await prisma.restaurantFeature.create({
      data: {
        restaurantId: entitled.restaurantId,
        feature: 'MENU_IMPORT',
        enabled: false,
      },
    });
    expect(await writer.publish(admin, entitled)).toEqual({
      outcome: 'refused',
      code: 'FEATURE_NOT_AVAILABLE',
    });
    await prisma.restaurantFeature.deleteMany({
      where: { restaurantId: entitled.restaurantId },
    });
    expect(await writer.publish(admin, entitled)).toEqual({
      outcome: 'published',
    });
  });

  it('does not attach to or replace an existing menu', async () => {
    const target = await fixture();
    const existing = await prisma.menu.create({
      data: {
        restaurantId: target.restaurantId,
        nameInternal: 'Already exists',
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
      },
    });
    expect(await writer.publish(admin, target)).toEqual({
      outcome: 'refused',
      code: 'ONBOARDING_MENU_TARGET_NOT_EMPTY',
    });
    expect(
      await prisma.menu.findMany({
        where: { restaurantId: target.restaurantId },
        select: { id: true, nameInternal: true },
      }),
    ).toEqual([{ id: existing.id, nameInternal: existing.nameInternal }]);
  });

  it('rolls back menu rows, marker and revision when audit fails; then retries successfully', async () => {
    const target = await fixture();
    const record = jest
      .spyOn(audit, 'record')
      .mockRejectedValueOnce(new Error('Test audit unavailable'));
    try {
      await expect(writer.publish(admin, target)).rejects.toThrow(
        'Test audit unavailable',
      );
      expect(
        await prisma.menu.count({
          where: { restaurantId: target.restaurantId },
        }),
      ).toBe(0);
      const row = await prisma.onboardingCase.findUniqueOrThrow({
        where: { id: target.caseId },
      });
      expect(row).toMatchObject({
        revision: 1,
        menuPublishedAt: null,
        status: 'MENU_SETUP',
      });
      expect(await writer.publish(admin, target)).toEqual({
        outcome: 'published',
      });
    } finally {
      record.mockRestore();
    }
  });
});
