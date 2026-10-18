import {
  assertSandboxIdentity,
  assertSandboxUrl,
  SANDBOX_URL,
} from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './../src/generated/prisma/client';
import { EntitlementsService } from './../src/entitlements/entitlements.service';
import { PublicMenuService } from './../src/public/public-menu.service';
import { PublicOrdersService } from './../src/public/public-orders.service';

/**
 * Product Variants (DEC-041) on the Guest side, against REAL PostgreSQL (no
 * mocks): the public menu lists the active sizes with their own prices and
 * per-size discounts, and order creation prices the chosen size on the Backend
 * (the client sends an identity only), applies the discount only to sizes it
 * covers, snapshots the size, and rejects anything it cannot resolve.
 *
 * Isolation: see `support/sandbox-guard.ts` (sandbox-only, identity-checked,
 * skipped without TABLE_SESSION_IT_DATABASE_URL).
 */

const describeSandbox = SANDBOX_URL ? describe : describe.skip;

describeSandbox(
  'Product sizes: public menu and ordering (real PostgreSQL)',
  () => {
    let prisma: PrismaClient;
    let orders: PublicOrdersService;
    let menu: PublicMenuService;

    beforeAll(async () => {
      assertSandboxUrl(SANDBOX_URL as string);
      prisma = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: SANDBOX_URL as string,
          max: 10,
        }),
      });
      await prisma.$connect();
      try {
        await assertSandboxIdentity(prisma);
      } catch (error) {
        await prisma.$disconnect();
        throw error;
      }
      const entitlements = new EntitlementsService(prisma as never);
      orders = new PublicOrdersService(prisma as never, entitlements);
      menu = new PublicMenuService(prisma as never, entitlements);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    interface Tenant {
      restaurantId: string;
      qrCode: string;
      productId: string;
      small: string;
      medium: string;
      large: string;
    }

    /** One Restaurant with a 60 / 80 / 100 pizza (Small is the default size). */
    async function seed(discount?: {
      type: 'PERCENTAGE' | 'FIXED_AMOUNT';
      value: string;
    }): Promise<Tenant> {
      const restaurant = await prisma.restaurant.create({
        data: {
          publicId: `it-rest-${randomUUID()}`,
          name: 'IT sizes',
          status: 'ACTIVE',
          defaultLocale: 'en',
          currencyCode: 'EGP',
        },
      });
      for (const locale of ['en', 'ar']) {
        await prisma.restaurantLocale.create({
          data: { restaurantId: restaurant.id, locale, isActive: true },
        });
      }
      const branch = await prisma.branch.create({
        data: {
          publicId: `branch-${randomUUID()}`,
          restaurantId: restaurant.id,
          name: 'IT Branch',
          status: 'ACTIVE',
          timezone: 'Africa/Cairo',
        },
      });
      const table = await prisma.table.create({
        data: {
          restaurantId: restaurant.id,
          branchId: branch.id,
          tableNumber: '1',
          status: 'ACTIVE',
        },
      });
      const qr = await prisma.qrCode.create({
        data: {
          publicCode: `it-qr-${randomUUID()}`,
          restaurantId: restaurant.id,
          branchId: branch.id,
          tableId: table.id,
          type: 'TABLE',
          status: 'ACTIVE',
        },
      });
      const primary = await prisma.menu.create({
        data: {
          restaurantId: restaurant.id,
          nameInternal: 'IT menu',
          status: 'ACTIVE',
          displayOrder: 0,
          isPrimary: true,
          translations: { create: { locale: 'en', name: 'Menu' } },
        },
      });
      const category = await prisma.category.create({
        data: {
          restaurantId: restaurant.id,
          menuId: primary.id,
          status: 'ACTIVE',
          displayOrder: 0,
          translations: { create: { locale: 'en', name: 'Pizza' } },
        },
      });
      const product = await prisma.product.create({
        data: {
          publicId: `product-${randomUUID()}`,
          restaurantId: restaurant.id,
          categoryId: category.id,
          status: 'ACTIVE',
          availability: 'AVAILABLE',
          basePrice: '60.00', // = the cheapest size, as the Backend keeps it
          displayOrder: 0,
          allowCustomerNotes: false,
          featured: false,
          discountType: discount?.type ?? null,
          discountValue: discount?.value ?? null,
          discountEnabled: discount !== undefined,
          translations: { create: { locale: 'en', name: 'Margherita' } },
        },
      });
      const makeSize = async (
        name: string,
        arabic: string | null,
        price: string,
        displayOrder: number,
        isDefault: boolean,
        discountApplies = true,
      ) => {
        const created = await prisma.productVariant.create({
          data: {
            restaurantId: restaurant.id,
            productId: product.id,
            status: 'ACTIVE',
            price,
            displayOrder,
            isDefault,
            discountApplies,
            translations: {
              create: [
                { locale: 'en', name },
                ...(arabic ? [{ locale: 'ar', name: arabic }] : []),
              ],
            },
          },
        });
        return created.id;
      };
      return {
        restaurantId: restaurant.id,
        qrCode: qr.publicCode,
        productId: product.id,
        small: await makeSize('Small', 'صغير', '60.00', 0, true),
        medium: await makeSize('Medium', null, '80.00', 1, false, false),
        large: await makeSize('Large', 'كبير', '100.00', 2, false),
      };
    }

    const order = (t: Tenant, item: Record<string, unknown>) =>
      orders.createOrder({
        publicCode: t.qrCode,
        clientRequestId: randomUUID(),
        items: [{ productId: t.productId, quantity: 1, ...item }],
      });

    describe('public menu', () => {
      it('lists the active sizes with their own prices, in order, with the default flagged', async () => {
        const t = await seed();
        const result = await menu.getPublicMenu({
          publicCode: t.qrCode,
          explicitLang: null,
          acceptLanguageHeader: null,
        });
        if (result.outcome !== 'found') throw new Error('menu not found');
        const product = result.data.menu.categories[0].products[0];

        expect(product.basePrice).toBe('60.00');
        expect(
          product.variants.map((v) => [
            v.name,
            v.price,
            v.isDefault,
            v.discountedPrice,
          ]),
        ).toEqual([
          ['Small', '60.00', true, null],
          ['Medium', '80.00', false, null],
          ['Large', '100.00', false, null],
        ]);
      });

      it('prices the discount per size and skips sizes that opted out', async () => {
        const t = await seed({ type: 'PERCENTAGE', value: '10' });
        const result = await menu.getPublicMenu({
          publicCode: t.qrCode,
          explicitLang: null,
          acceptLanguageHeader: null,
        });
        if (result.outcome !== 'found') throw new Error('menu not found');
        const product = result.data.menu.categories[0].products[0];

        // Medium has discountApplies = false
        expect(
          product.variants.map((v) => [v.name, v.discountedPrice]),
        ).toEqual([
          ['Small', '54.00'],
          ['Medium', null],
          ['Large', '90.00'],
        ]);
      });

      it('hides inactive sizes and falls back to the default-language name', async () => {
        const t = await seed();
        await prisma.productVariant.update({
          where: { id: t.large },
          data: { status: 'INACTIVE' },
        });
        const result = await menu.getPublicMenu({
          publicCode: t.qrCode,
          explicitLang: 'ar',
          acceptLanguageHeader: null,
        });
        if (result.outcome !== 'found') throw new Error('menu not found');
        const names = result.data.menu.categories[0].products[0].variants.map(
          (v) => v.name,
        );

        // Arabic where it exists, English (default) where it does not, Large is gone
        expect(names).toEqual(['صغير', 'Medium']);
      });
    });

    describe('order creation', () => {
      it('prices the chosen size on the Backend and snapshots it', async () => {
        const t = await seed();
        const result = await order(t, { variantId: t.large });
        if (result.outcome !== 'created')
          throw new Error(`not created: ${result.outcome}`);

        expect(result.data.total).toBe('100.00');
        expect(result.data.items[0]).toMatchObject({
          variantName: 'Large',
          unitPrice: '100.00',
          lineTotal: '100.00',
        });
        const stored = await prisma.orderItem.findFirstOrThrow({
          where: { order: { id: result.data.id } },
        });
        expect(stored.variantId).toBe(t.large);
        expect(stored.variantNameSnapshot).toBe('Large');
        expect(stored.variantPriceSnapshot?.toFixed(2)).toBe('100.00');
        expect(stored.unitPrice.toFixed(2)).toBe('100.00');
      });

      it('discounts only the sizes the discount covers, and never the extras', async () => {
        const t = await seed({ type: 'PERCENTAGE', value: '10' });

        const large = await order(t, { variantId: t.large, quantity: 2 });
        if (large.outcome !== 'created') throw new Error('not created');
        // (100 - 10) * 2
        expect(large.data.total).toBe('180.00');
        expect(large.data.discountTotal).toBe('20.00');

        const medium = await order(t, { variantId: t.medium });
        if (medium.outcome !== 'created') throw new Error('not created');
        // Medium opted out: full price, no discount
        expect(medium.data.total).toBe('80.00');
        expect(medium.data.discountTotal).toBe('0.00');
      });

      it('rejects a missing, unknown, foreign or hidden size for a product with sizes', async () => {
        const t = await seed();
        const other = await seed();
        await prisma.productVariant.update({
          where: { id: t.medium },
          data: { status: 'INACTIVE' },
        });

        for (const variantId of [
          undefined,
          randomUUID(),
          other.large,
          t.medium,
        ]) {
          const result = await order(
            t,
            variantId === undefined ? {} : { variantId },
          );
          expect(result.outcome).toBe('itemsUnavailable');
        }
        expect(
          await prisma.order.count({ where: { restaurantId: t.restaurantId } }),
        ).toBe(0);
      });

      it('rejects a size sent for a product that has none', async () => {
        const t = await seed();
        const other = await seed();
        await prisma.productVariant.deleteMany({
          where: { productId: other.productId },
        });
        const result = await order(
          {
            ...other,
            small: t.small,
            large: t.large,
            medium: t.medium,
          },
          { variantId: t.small },
        );
        expect(result.outcome).toBe('itemsUnavailable');
      });

      it('keeps a product without sizes exactly as before', async () => {
        const t = await seed();
        await prisma.productVariant.deleteMany({
          where: { productId: t.productId },
        });
        await prisma.product.update({
          where: { id: t.productId },
          data: { basePrice: '75.00' },
        });
        const result = await order(t, {});
        if (result.outcome !== 'created') throw new Error('not created');

        expect(result.data.total).toBe('75.00');
        expect(result.data.items[0].variantName).toBeNull();
      });

      it('treats two sizes of the same product as two different lines', async () => {
        const t = await seed();
        const result = await orders.createOrder({
          publicCode: t.qrCode,
          clientRequestId: randomUUID(),
          items: [
            { productId: t.productId, quantity: 1, variantId: t.small },
            { productId: t.productId, quantity: 1, variantId: t.large },
          ],
        });
        if (result.outcome !== 'created')
          throw new Error(`not created: ${result.outcome}`);
        expect(result.data.total).toBe('160.00');

        const repeat = await orders.createOrder({
          publicCode: t.qrCode,
          clientRequestId: randomUUID(),
          items: [
            { productId: t.productId, quantity: 1, variantId: t.small },
            { productId: t.productId, quantity: 2, variantId: t.small },
          ],
        });
        expect(repeat.outcome).toBe('duplicateItems');
      });
    });
  },
);
