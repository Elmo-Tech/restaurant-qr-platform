import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '../generated/prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

/**
 * Product Discounts V1: write-side validation and persistence in
 * `ProductsService`, plus the DTO contract. Prisma is mocked (the real-database
 * behaviour is covered by `test/product-discounts.e2e-spec.ts`).
 */

const RESTAURANT_ID = 'restaurant-1';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

const ROW = {
  id: 'product-1',
  publicId: 'product-uuid',
  categoryId: 'category-1',
  status: 'ACTIVE' as const,
  availability: 'AVAILABLE' as const,
  basePrice: new Prisma.Decimal('200.00'),
  primaryImageAssetPath: null,
  displayOrder: 0,
  allowCustomerNotes: true,
  featured: false,
  discountType: null as 'PERCENTAGE' | 'FIXED_AMOUNT' | null,
  discountValue: null as Prisma.Decimal | null,
  discountEnabled: false,
  discountStartsOn: null as Date | null,
  discountEndsOn: null as Date | null,
};

function build(existing = ROW) {
  const productCreate = jest.fn().mockResolvedValue(ROW);
  const productUpdate = jest.fn().mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({ ...existing, ...data }),
  );
  const tx = {
    category: { findFirst: jest.fn().mockResolvedValue({ id: 'category-1' }) },
    product: {
      findFirst: jest.fn().mockResolvedValue(existing),
      create: productCreate,
      update: productUpdate,
    },
    productTranslation: {
      create: jest.fn().mockResolvedValue({ locale: 'en', name: 'Burger', description: null }),
      updateMany: jest.fn(),
      findFirstOrThrow: jest
        .fn()
        .mockResolvedValue({ locale: 'en', name: 'Burger', description: null }),
    },
  };
  const prisma = {
    restaurant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ defaultLocale: 'en' }) },
    branch: { findFirst: jest.fn().mockResolvedValue({ timezone: 'Africa/Cairo' }) },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      Promise.resolve(callback(tx)),
    ),
  };
  return { service: new ProductsService(prisma as never), productCreate, productUpdate, prisma, tx };
}

const baseCreate = {
  restaurantId: RESTAURANT_ID,
  categoryId: 'category-1',
  name: 'Burger',
  description: null,
  status: 'ACTIVE' as const,
  availability: 'AVAILABLE' as const,
  basePrice: '200.00',
  displayOrder: 0,
  allowCustomerNotes: true,
  featured: false,
};

describe('ProductsService.createProduct -- discount validation', () => {
  it.each([
    ['a 0% discount', { enabled: true, type: 'PERCENTAGE' as const, value: '0' }, 'DISCOUNT_VALUE_INVALID'],
    ['a 120% discount', { enabled: true, type: 'PERCENTAGE' as const, value: '120' }, 'DISCOUNT_VALUE_INVALID'],
    ['a zero fixed amount', { enabled: true, type: 'FIXED_AMOUNT' as const, value: '0.00' }, 'DISCOUNT_VALUE_INVALID'],
    ['a fixed amount above the price', { enabled: true, type: 'FIXED_AMOUNT' as const, value: '250.00' }, 'DISCOUNT_EXCEEDS_PRICE'],
    [
      'an end date before the start date',
      { enabled: true, type: 'PERCENTAGE' as const, value: '10', startsOn: '2026-10-20', endsOn: '2026-10-10' },
      'DISCOUNT_DATES_INVALID',
    ],
  ])('rejects %s and writes nothing', async (_label, discount, code) => {
    const { service, productCreate, prisma } = build();

    const result = await service.createProduct({ ...baseCreate, discount });

    expect(result).toEqual({ outcome: 'invalidDiscount', code });
    expect(productCreate).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts the boundary values (100%, fixed equal to the price, same-day window)', async () => {
    for (const discount of [
      { enabled: true, type: 'PERCENTAGE' as const, value: '100.00' },
      { enabled: true, type: 'FIXED_AMOUNT' as const, value: '200.00' },
      { enabled: true, type: 'PERCENTAGE' as const, value: '10', startsOn: '2026-10-10', endsOn: '2026-10-10' },
    ]) {
      const { service } = build();
      const result = await service.createProduct({ ...baseCreate, discount });
      expect(result.outcome).toBe('created');
    }
  });

  it('persists the discount as exact Decimal and real dates', async () => {
    const { service, productCreate } = build();

    await service.createProduct({
      ...baseCreate,
      discount: {
        enabled: true,
        type: 'PERCENTAGE',
        value: '12.50',
        startsOn: '2026-10-11',
        endsOn: '2026-10-31',
      },
    });

    const data = (productCreate.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
    expect(data.discountType).toBe('PERCENTAGE');
    expect(data.discountValue).toBeInstanceOf(Prisma.Decimal);
    expect((data.discountValue as Prisma.Decimal).toFixed(2)).toBe('12.50');
    expect(data.discountEnabled).toBe(true);
    expect((data.discountStartsOn as Date).toISOString().slice(0, 10)).toBe('2026-10-11');
    expect((data.discountEndsOn as Date).toISOString().slice(0, 10)).toBe('2026-10-31');
  });

  it('a product without a discount stores a cleared configuration', async () => {
    const { service, productCreate } = build();

    await service.createProduct(baseCreate);

    const data = (productCreate.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
    expect(data).toMatchObject({
      discountType: null,
      discountValue: null,
      discountEnabled: false,
      discountStartsOn: null,
      discountEndsOn: null,
    });
  });
});

describe('ProductsService.updateProduct -- discount handling', () => {
  const withFixed = {
    ...ROW,
    discountType: 'FIXED_AMOUNT' as const,
    discountValue: new Prisma.Decimal('150.00'),
    discountEnabled: true,
  };

  it('discount: null removes the discount completely', async () => {
    const { service, productUpdate } = build(withFixed);

    const result = await service.updateProduct({
      restaurantId: RESTAURANT_ID,
      productId: PRODUCT_ID,
      discount: null,
    });

    expect(result.outcome).toBe('updated');
    const data = (productUpdate.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
    expect(data).toMatchObject({
      discountType: null,
      discountValue: null,
      discountEnabled: false,
      discountStartsOn: null,
      discountEndsOn: null,
    });
  });

  it('omitting discount and price leaves the stored discount untouched', async () => {
    const { service, productUpdate } = build(withFixed);

    await service.updateProduct({
      restaurantId: RESTAURANT_ID,
      productId: PRODUCT_ID,
      featured: true,
    });

    const data = (productUpdate.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
    expect(Object.keys(data)).toEqual(['featured']);
  });

  it('lowering the price below an existing fixed discount is rejected (never a negative price)', async () => {
    const { service, productUpdate } = build(withFixed);

    const result = await service.updateProduct({
      restaurantId: RESTAURANT_ID,
      productId: PRODUCT_ID,
      basePrice: '100.00',
    });

    expect(result).toEqual({ outcome: 'invalidDiscount', code: 'DISCOUNT_EXCEEDS_PRICE' });
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it('lowering the price is fine when the same request also fixes the discount', async () => {
    const { service } = build(withFixed);

    const result = await service.updateProduct({
      restaurantId: RESTAURANT_ID,
      productId: PRODUCT_ID,
      basePrice: '100.00',
      discount: { enabled: true, type: 'FIXED_AMOUNT', value: '40.00' },
    });

    expect(result.outcome).toBe('updated');
  });

  it('reports state and the charged unit price for an ACTIVE discount', async () => {
    const { service } = build({
      ...ROW,
      discountType: 'PERCENTAGE',
      discountValue: new Prisma.Decimal('25'),
      discountEnabled: true,
    });

    const result = await service.updateProduct({
      restaurantId: RESTAURANT_ID,
      productId: PRODUCT_ID,
      discount: { enabled: true, type: 'PERCENTAGE', value: '25' },
    });

    expect(result.outcome === 'updated' && result.data.discount).toMatchObject({
      type: 'PERCENTAGE',
      value: '25.00',
      state: 'ACTIVE',
      discountedPrice: '150.00',
    });
  });
});

describe('discount DTO contract', () => {
  const create = (discount: unknown) =>
    plainToInstance(CreateProductDto, {
      categoryId: '11111111-1111-4111-8111-111111111111',
      name: 'Burger',
      status: 'ACTIVE',
      availability: 'AVAILABLE',
      basePrice: '200.00',
      displayOrder: 0,
      allowCustomerNotes: true,
      featured: false,
      discount,
    });

  it('accepts no discount, null, and a well-formed discount', async () => {
    expect(await validate(create(undefined))).toHaveLength(0);
    expect(await validate(create(null))).toHaveLength(0);
    expect(
      await validate(
        create({ enabled: true, type: 'PERCENTAGE', value: '20.00', startsOn: '2026-10-11', endsOn: null }),
      ),
    ).toHaveLength(0);
  });

  it('rejects a numeric value, an unknown type, a negative value and impossible dates', async () => {
    expect(await validate(create({ enabled: true, type: 'PERCENTAGE', value: 20 }))).not.toHaveLength(0);
    expect(await validate(create({ enabled: true, type: 'BOGO', value: '20' }))).not.toHaveLength(0);
    expect(await validate(create({ enabled: true, type: 'FIXED_AMOUNT', value: '-5' }))).not.toHaveLength(0);
    expect(
      await validate(create({ enabled: true, type: 'PERCENTAGE', value: '10', startsOn: '2026-02-30' })),
    ).not.toHaveLength(0);
    expect(
      await validate(create({ enabled: true, type: 'PERCENTAGE', value: '10', endsOn: '10/11/2026' })),
    ).not.toHaveLength(0);
    expect(await validate(create({ type: 'PERCENTAGE', value: '10' }))).not.toHaveLength(0);
  });

  it('the update DTO distinguishes omitted from null', async () => {
    const omitted = plainToInstance(UpdateProductDto, { featured: true });
    const removal = plainToInstance(UpdateProductDto, { discount: null });

    expect(await validate(omitted)).toHaveLength(0);
    expect(omitted.discount).toBeUndefined();
    expect(await validate(removal)).toHaveLength(0);
    expect(removal.discount).toBeNull();
  });
});
