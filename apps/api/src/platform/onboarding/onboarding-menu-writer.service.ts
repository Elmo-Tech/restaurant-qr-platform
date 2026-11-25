import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { importGrantStatus } from './onboarding-import-grant';
import { Prisma } from '../../generated/prisma/client';
import { createProductPublicId } from '../../menu/product-public-id';
import { PlatformAuditService } from '../platform-audit.service';
import type { PlatformAdminPrincipal } from '../platform-auth.service';
import { isUuid } from './onboarding-details';
import {
  sanitizeOnboardingMenuDraft,
  validateOnboardingMenuDraft,
  type OnboardingMenuDraft,
} from './onboarding-menu';

type PublishRefusalCode =
  | 'ONBOARDING_CASE_NOT_FOUND'
  | 'ONBOARDING_PROVISIONING_KEY_CONFLICT'
  | 'ONBOARDING_INVALID_TRANSITION'
  | 'ONBOARDING_RESTAURANT_NOT_ELIGIBLE'
  | 'PACKAGE_NOT_AVAILABLE'
  | 'ONBOARDING_MENU_INCOMPLETE'
  | 'ONBOARDING_IMPORT_EXPIRED'
  | 'ONBOARDING_IMPORT_REVIEW_REQUIRED'
  | 'ONBOARDING_IMPORT_GRANT_REQUIRED'
  | 'FEATURE_NOT_AVAILABLE'
  | 'ONBOARDING_MENU_TARGET_NOT_EMPTY';

export type OnboardingMenuPublishResult =
  | { outcome: 'published' | 'alreadyPublished' }
  | { outcome: 'refused'; code: PublishRefusalCode; problems?: string[] };

function refuse(
  code: PublishRefusalCode,
  problems?: string[],
): OnboardingMenuPublishResult {
  return { outcome: 'refused', code, ...(problems ? { problems } : {}) };
}

/** Only the Platform-protected onboarding saga calls this writer. It never accepts a tenant or menu ID. */
@Injectable()
export class OnboardingMenuWriterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async publish(
    admin: PlatformAdminPrincipal,
    input: { caseId: string; provisioningKey: string },
  ): Promise<OnboardingMenuPublishResult> {
    if (!isUuid(input.caseId)) return refuse('ONBOARDING_CASE_NOT_FOUND');
    if (!isUuid(input.provisioningKey)) {
      return refuse('ONBOARDING_PROVISIONING_KEY_CONFLICT');
    }

    // This lock belongs to the writer transaction, never to the orchestrating caller.
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM onboarding_cases WHERE id = ${input.caseId}::uuid FOR UPDATE
      `;
        if (!locked[0]) return refuse('ONBOARDING_CASE_NOT_FOUND');
        const row = await tx.onboardingCase.findUniqueOrThrow({
          where: { id: locked[0].id },
          select: {
            id: true,
            provisioningKey: true,
            status: true,
            mode: true,
            restaurantId: true,
            restaurantProvisionedAt: true,
            packageId: true,
            menuDraft: true,
            menuPublishedAt: true,
            importExpiresAt: true,
            importReviewed: true,
            menuProvenance: true,
            importGrantId: true,
            importGrantExpiresAt: true,
            importGrantRevokedAt: true,
          },
        });
        if (row.provisioningKey !== input.provisioningKey.toLowerCase()) {
          return refuse('ONBOARDING_PROVISIONING_KEY_CONFLICT');
        }
        if (
          row.status !== 'MENU_SETUP' &&
          !(
            row.menuPublishedAt &&
            ['FAILED', 'READY', 'DELIVERED'].includes(row.status)
          )
        ) {
          return refuse('ONBOARDING_INVALID_TRANSITION');
        }
        if (
          !row.restaurantId ||
          !row.restaurantProvisionedAt ||
          (row.mode !== 'REAL' && row.mode !== 'TRIAL')
        ) {
          return refuse('ONBOARDING_RESTAURANT_NOT_ELIGIBLE');
        }
        const restaurantId = row.restaurantId;
        // Freeze tenant status, package assignment and default Locale. The empty-target check below
        // and the unique primary index ensure we never attach to or replace someone else's menu.
        await tx.$queryRaw`SELECT id FROM restaurants WHERE id = ${restaurantId}::uuid FOR UPDATE`;
        const restaurant = await tx.restaurant.findUnique({
          where: { id: restaurantId },
          select: {
            id: true,
            name: true,
            status: true,
            isDemo: true,
            packageId: true,
            defaultLocale: true,
          },
        });
        if (!restaurant || restaurant.isDemo)
          return refuse('ONBOARDING_RESTAURANT_NOT_ELIGIBLE');
        if (row.menuPublishedAt) return { outcome: 'alreadyPublished' };
        if (restaurant.status !== 'ACTIVE')
          return refuse('ONBOARDING_RESTAURANT_NOT_ELIGIBLE');

        const packageId = row.packageId;
        if (!packageId || restaurant.packageId !== packageId)
          return refuse('PACKAGE_NOT_AVAILABLE');
        // Package edits update their parent row in the same transaction as feature updates.
        await tx.$queryRaw`SELECT id FROM packages WHERE id = ${packageId}::uuid FOR SHARE`;
        const pkg = await tx.package.findUnique({
          where: { id: packageId },
          select: { status: true, features: { select: { feature: true } } },
        });
        if (pkg?.status !== 'ACTIVE') return refuse('PACKAGE_NOT_AVAILABLE');

        const expiresAt = row.importExpiresAt?.getTime();
        if (row.menuProvenance !== 'MANUAL') {
          if (expiresAt === undefined || expiresAt <= Date.now())
            return refuse('ONBOARDING_IMPORT_EXPIRED');
          if (importGrantStatus(row) !== 'ACTIVE')
            return refuse('ONBOARDING_IMPORT_GRANT_REQUIRED');
          if (!row.importReviewed)
            return refuse('ONBOARDING_IMPORT_REVIEW_REQUIRED');
        }

        const locales = await tx.$queryRaw<{ locale: string }[]>`
        SELECT locale FROM restaurant_locales
        WHERE restaurant_id = ${restaurantId}::uuid AND is_active
        FOR SHARE
      `;
        const draft = sanitizeOnboardingMenuDraft(row.menuDraft);
        if (!draft.ok)
          return refuse('ONBOARDING_MENU_INCOMPLETE', draft.problems);
        const problems = validateOnboardingMenuDraft(draft.value, {
          defaultLocale: restaurant.defaultLocale,
          activeLocales: locales.map(({ locale }) => locale),
        });
        if (problems.length)
          return refuse('ONBOARDING_MENU_INCOMPLETE', problems);

        if (await tx.menu.count({ where: { restaurantId } })) {
          return refuse('ONBOARDING_MENU_TARGET_NOT_EMPTY');
        }
        // Recheck after lock waits and validation, immediately before the writes start.
        if (expiresAt !== undefined && expiresAt <= Date.now()) {
          return refuse('ONBOARDING_IMPORT_EXPIRED');
        }
        if (
          row.menuProvenance !== 'MANUAL' &&
          importGrantStatus(row) !== 'ACTIVE'
        )
          return refuse('ONBOARDING_IMPORT_GRANT_REQUIRED');
        const counts = await this.insertMenuGraph(tx, restaurant, draft.value);
        await tx.onboardingCase.update({
          where: { id: row.id },
          data: {
            menuPublishedAt: new Date(),
            revision: { increment: 1 },
            updatedByAdminId: admin.adminId,
          },
        });
        await this.audit.record(
          {
            admin,
            action: 'onboarding.menu_published',
            restaurant,
            details: {
              caseId: row.id,
              imported: expiresAt !== undefined,
              ...counts,
            },
          },
          tx,
        );
        return { outcome: 'published' };
      },
      { timeout: 15_000 },
    );
  }

  private async insertMenuGraph(
    tx: Prisma.TransactionClient,
    restaurant: { id: string; defaultLocale: string },
    draft: OnboardingMenuDraft,
  ) {
    const restaurantId = restaurant.id;
    const menus: Prisma.MenuCreateManyInput[] = [];
    const menuTranslations: Prisma.MenuTranslationCreateManyInput[] = [];
    const categories: Prisma.CategoryCreateManyInput[] = [];
    const categoryTranslations: Prisma.CategoryTranslationCreateManyInput[] =
      [];
    const products: Prisma.ProductCreateManyInput[] = [];
    const productTranslations: Prisma.ProductTranslationCreateManyInput[] = [];
    const variants: Prisma.ProductVariantCreateManyInput[] = [];
    const variantTranslations: Prisma.ProductVariantTranslationCreateManyInput[] =
      [];
    const groups: Prisma.ModifierGroupCreateManyInput[] = [];
    const groupTranslations: Prisma.ModifierGroupTranslationCreateManyInput[] =
      [];
    const options: Prisma.ModifierOptionCreateManyInput[] = [];
    const optionTranslations: Prisma.ModifierOptionTranslationCreateManyInput[] =
      [];

    // Assign fresh IDs server-side. Every FK points to an entity in this graph for this case's Restaurant.
    draft.menus.forEach((menu, menuOrder) => {
      const menuId = randomUUID();
      const nameInternal = menu.translations.find(
        ({ locale }) => locale === restaurant.defaultLocale,
      )?.name;
      if (!nameInternal) throw new Error('Validated menu has no default name');
      menus.push({
        id: menuId,
        restaurantId,
        nameInternal,
        status: 'ACTIVE',
        displayOrder: menuOrder,
        isPrimary: menuOrder === 0,
      });
      menuTranslations.push(
        ...menu.translations.map(({ locale, name, description }) => ({
          menuId,
          locale,
          name,
          description,
        })),
      );
      menu.categories.forEach((category, categoryOrder) => {
        const categoryId = randomUUID();
        categories.push({
          id: categoryId,
          restaurantId,
          menuId,
          status: 'ACTIVE',
          displayOrder: categoryOrder,
        });
        categoryTranslations.push(
          ...category.translations.map(({ locale, name, description }) => ({
            categoryId,
            locale,
            name,
            description,
          })),
        );
        category.products.forEach((product, productOrder) => {
          const productId = randomUUID();
          // DEC-041: basePrice represents the cheapest ACTIVE size, not an adjustment or a nominal base price.
          const sizes = product.variants.map(
            (size) => new Prisma.Decimal(size.price),
          );
          const basePrice =
            sizes.length > 0
              ? Prisma.Decimal.min(...sizes)
              : new Prisma.Decimal(product.price);
          products.push({
            id: productId,
            publicId: createProductPublicId(),
            restaurantId,
            categoryId,
            status: 'ACTIVE',
            availability: 'AVAILABLE',
            basePrice,
            displayOrder: productOrder,
            allowCustomerNotes: false,
            featured: false,
          });
          productTranslations.push(
            ...product.translations.map(({ locale, name, description }) => ({
              productId,
              locale,
              name,
              description,
            })),
          );
          product.variants.forEach((variant, variantOrder) => {
            const productVariantId = randomUUID();
            variants.push({
              id: productVariantId,
              restaurantId,
              productId,
              status: 'ACTIVE',
              price: sizes[variantOrder],
              displayOrder: variantOrder,
              isDefault: false,
            });
            variantTranslations.push(
              ...variant.translations.map(({ locale, name }) => ({
                productVariantId,
                locale,
                name,
              })),
            );
          });
          product.modifierGroups.forEach((group, groupOrder) => {
            const modifierGroupId = randomUUID();
            groups.push({
              id: modifierGroupId,
              restaurantId,
              productId,
              status: 'ACTIVE',
              displayOrder: groupOrder,
              minimumSelections: group.minSelections,
              maximumSelections: group.maxSelections,
            });
            groupTranslations.push(
              ...group.translations.map(({ locale, name, description }) => ({
                modifierGroupId,
                locale,
                name,
                helperText: description,
              })),
            );
            group.options.forEach((option, optionOrder) => {
              const modifierOptionId = randomUUID();
              options.push({
                id: modifierOptionId,
                restaurantId,
                modifierGroupId,
                status: 'ACTIVE',
                displayOrder: optionOrder,
                priceAdjustment: new Prisma.Decimal(option.price),
                priceIsOverridden: false,
              });
              optionTranslations.push(
                ...option.translations.map(({ locale, name }) => ({
                  modifierOptionId,
                  locale,
                  name,
                })),
              );
            });
          });
        });
      });
    });

    // Bulk writes keep the bounded draft independent of per-item database round trips.
    await tx.menu.createMany({ data: menus });
    await tx.menuTranslation.createMany({ data: menuTranslations });
    await tx.category.createMany({ data: categories });
    await tx.categoryTranslation.createMany({ data: categoryTranslations });
    await tx.product.createMany({ data: products });
    await tx.productTranslation.createMany({ data: productTranslations });
    if (variants.length) {
      await tx.productVariant.createMany({ data: variants });
      await tx.productVariantTranslation.createMany({
        data: variantTranslations,
      });
    }
    if (groups.length) {
      await tx.modifierGroup.createMany({ data: groups });
      await tx.modifierGroupTranslation.createMany({ data: groupTranslations });
      await tx.modifierOption.createMany({ data: options });
      await tx.modifierOptionTranslation.createMany({
        data: optionTranslations,
      });
    }
    return {
      menus: menus.length,
      categories: categories.length,
      products: products.length,
      variants: variants.length,
      modifierGroups: groups.length,
      modifierOptions: options.length,
    };
  }
}
