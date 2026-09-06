import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProductDto } from './update-product.dto';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(UpdateProductDto, body);
  const errors = await validate(instance);
  return { instance, errors };
}

describe('UpdateProductDto', () => {
  it('accepts a fully empty body -- every field is genuinely optional', async () => {
    const { errors } = await validateBody({});

    expect(errors).toHaveLength(0);
  });

  it('distinguishes omitted description (unchanged) from explicit null (clear)', async () => {
    const { instance: omitted } = await validateBody({});
    expect(omitted.description).toBeUndefined();

    const { instance: cleared } = await validateBody({ description: null });
    expect(cleared.description).toBeNull();

    const { instance: trimmed } = await validateBody({
      description: '  Beef burger  ',
    });
    expect(trimmed.description).toBe('Beef burger');
  });

  it('rejects an empty name when supplied', async () => {
    const { errors } = await validateBody({ name: '' });

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('accepts a well-formed categoryId and rejects a malformed one', async () => {
    const { errors: validErrors } = await validateBody({
      categoryId: '11111111-1111-4111-8111-111111111111',
    });
    expect(validErrors).toHaveLength(0);

    const { errors: invalidErrors } = await validateBody({
      categoryId: 'not-a-uuid',
    });
    expect(invalidErrors.some((error) => error.property === 'categoryId')).toBe(
      true,
    );
  });

  it('rejects a malformed basePrice when supplied', async () => {
    const { errors } = await validateBody({ basePrice: '-1.00' });

    expect(errors.some((error) => error.property === 'basePrice')).toBe(true);
  });

  it('rejects a negative displayOrder when supplied', async () => {
    const { errors } = await validateBody({ displayOrder: -1 });

    expect(errors.some((error) => error.property === 'displayOrder')).toBe(
      true,
    );
  });

  it.each([
    'categoryId',
    'name',
    'status',
    'basePrice',
    'displayOrder',
    'allowCustomerNotes',
    'featured',
  ] as const)(
    'rejects explicit null for %s (only description may be explicitly cleared)',
    async (field) => {
      const { errors } = await validateBody({ [field]: null });

      expect(errors.some((error) => error.property === field)).toBe(true);
    },
  );

  it('never exposes an availability field -- it has its own dedicated endpoint', () => {
    const instance = new UpdateProductDto();

    expect('availability' in instance).toBe(false);
  });

  it('never exposes publicId/restaurantId/primaryImageAssetPath/locale/createdAt/updatedAt as DTO fields', () => {
    const instance = new UpdateProductDto();

    expect('publicId' in instance).toBe(false);
    expect('restaurantId' in instance).toBe(false);
    expect('primaryImageAssetPath' in instance).toBe(false);
    expect('locale' in instance).toBe(false);
    expect('createdAt' in instance).toBe(false);
    expect('updatedAt' in instance).toBe(false);
  });
});
