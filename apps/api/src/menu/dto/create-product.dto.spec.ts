import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(CreateProductDto, body);
  const errors = await validate(instance);
  return { instance, errors };
}

describe('CreateProductDto', () => {
  const VALID_BODY = {
    categoryId: '11111111-1111-4111-8111-111111111111',
    name: 'Classic Burger',
    description: 'Beef burger',
    status: 'ACTIVE',
    availability: 'AVAILABLE',
    basePrice: '250.00',
    displayOrder: 0,
    allowCustomerNotes: true,
    featured: false,
  };

  it('accepts a fully valid body with no errors', async () => {
    const { errors } = await validateBody(VALID_BODY);

    expect(errors).toHaveLength(0);
  });

  it('rejects a malformed categoryId', async () => {
    const { errors } = await validateBody({
      ...VALID_BODY,
      categoryId: 'not-a-uuid',
    });

    expect(errors.some((error) => error.property === 'categoryId')).toBe(true);
  });

  it('accepts a missing description (optional) and normalizes an empty one to null', async () => {
    const { errors } = await validateBody({
      ...VALID_BODY,
      description: undefined,
    });
    expect(errors).toHaveLength(0);

    const { instance } = await validateBody({
      ...VALID_BODY,
      description: '  ',
    });
    expect(instance.description).toBeNull();
  });

  it('trims name', async () => {
    const { instance } = await validateBody({
      ...VALID_BODY,
      name: '  Classic Burger  ',
    });

    expect(instance.name).toBe('Classic Burger');
  });

  it('rejects an empty name', async () => {
    const { errors } = await validateBody({ ...VALID_BODY, name: '' });

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('rejects a status outside ACTIVE/INACTIVE', async () => {
    const { errors } = await validateBody({ ...VALID_BODY, status: 'HIDDEN' });

    expect(errors.some((error) => error.property === 'status')).toBe(true);
  });

  it('rejects an availability outside AVAILABLE/SOLD_OUT', async () => {
    const { errors } = await validateBody({
      ...VALID_BODY,
      availability: 'OUT_OF_STOCK',
    });

    expect(errors.some((error) => error.property === 'availability')).toBe(
      true,
    );
  });

  it.each(['-1.00', '10.505', '1e5', 'abc', '', 10])(
    'rejects a malformed basePrice: %s',
    async (basePrice) => {
      const { errors } = await validateBody({ ...VALID_BODY, basePrice });

      expect(errors.some((error) => error.property === 'basePrice')).toBe(true);
    },
  );

  it('accepts a well-formed basePrice', async () => {
    const { errors } = await validateBody({ ...VALID_BODY, basePrice: '0' });

    expect(errors).toHaveLength(0);
  });

  it('rejects a negative or non-integer displayOrder', async () => {
    const { errors: negativeErrors } = await validateBody({
      ...VALID_BODY,
      displayOrder: -1,
    });
    expect(
      negativeErrors.some((error) => error.property === 'displayOrder'),
    ).toBe(true);

    const { errors: fractionalErrors } = await validateBody({
      ...VALID_BODY,
      displayOrder: 0.5,
    });
    expect(
      fractionalErrors.some((error) => error.property === 'displayOrder'),
    ).toBe(true);
  });

  it('rejects a non-boolean allowCustomerNotes/featured', async () => {
    const { errors } = await validateBody({
      ...VALID_BODY,
      allowCustomerNotes: 'yes',
      featured: 'no',
    });

    expect(
      errors.some((error) => error.property === 'allowCustomerNotes'),
    ).toBe(true);
    expect(errors.some((error) => error.property === 'featured')).toBe(true);
  });

  it('never exposes id/publicId/restaurantId/locale/primaryImageAssetPath/createdAt/updatedAt as DTO fields', () => {
    const instance = new CreateProductDto();

    expect('id' in instance).toBe(false);
    expect('publicId' in instance).toBe(false);
    expect('restaurantId' in instance).toBe(false);
    expect('locale' in instance).toBe(false);
    expect('primaryImageAssetPath' in instance).toBe(false);
    expect('createdAt' in instance).toBe(false);
    expect('updatedAt' in instance).toBe(false);
  });
});
