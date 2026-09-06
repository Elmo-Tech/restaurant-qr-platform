import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCategoryDto } from './update-category.dto';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(UpdateCategoryDto, body);
  const errors = await validate(instance);
  return { instance, errors };
}

describe('UpdateCategoryDto', () => {
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
      description: '  وصف الفئة  ',
    });
    expect(trimmed.description).toBe('وصف الفئة');
  });

  it('rejects an empty name when supplied', async () => {
    const { errors } = await validateBody({ name: '' });

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('accepts a well-formed menuId and rejects a malformed one', async () => {
    const { errors: validErrors } = await validateBody({
      menuId: '11111111-1111-4111-8111-111111111111',
    });
    expect(validErrors).toHaveLength(0);

    const { errors: invalidErrors } = await validateBody({
      menuId: 'not-a-uuid',
    });
    expect(invalidErrors.some((error) => error.property === 'menuId')).toBe(
      true,
    );
  });

  it('rejects a status outside ACTIVE/INACTIVE when supplied', async () => {
    const { errors } = await validateBody({ status: 'HIDDEN' });

    expect(errors.some((error) => error.property === 'status')).toBe(true);
  });

  it('rejects a negative displayOrder when supplied', async () => {
    const { errors } = await validateBody({ displayOrder: -1 });

    expect(errors.some((error) => error.property === 'displayOrder')).toBe(
      true,
    );
  });

  it.each(['menuId', 'name', 'status', 'displayOrder'] as const)(
    'rejects explicit null for %s (only description may be explicitly cleared)',
    async (field) => {
      const { errors } = await validateBody({ [field]: null });

      expect(errors.some((error) => error.property === field)).toBe(true);
    },
  );

  it('never exposes restaurantId/imageAssetPath/locale/createdAt/updatedAt as DTO fields', () => {
    const instance = new UpdateCategoryDto();

    expect('restaurantId' in instance).toBe(false);
    expect('imageAssetPath' in instance).toBe(false);
    expect('locale' in instance).toBe(false);
    expect('createdAt' in instance).toBe(false);
    expect('updatedAt' in instance).toBe(false);
  });
});
