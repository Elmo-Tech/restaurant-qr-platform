import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(CreateCategoryDto, body);
  const errors = await validate(instance);
  return { instance, errors };
}

describe('CreateCategoryDto', () => {
  const VALID_BODY = {
    menuId: '11111111-1111-4111-8111-111111111111',
    name: 'المقبلات',
    description: 'وصف الفئة',
    status: 'ACTIVE',
    displayOrder: 0,
  };

  it('accepts a fully valid body with no errors', async () => {
    const { errors } = await validateBody(VALID_BODY);

    expect(errors).toHaveLength(0);
  });

  it('rejects a malformed menuId', async () => {
    const { errors } = await validateBody({
      ...VALID_BODY,
      menuId: 'not-a-uuid',
    });

    expect(errors.some((error) => error.property === 'menuId')).toBe(true);
  });

  it('accepts a missing description (optional) and normalizes an empty one to null', async () => {
    const { errors: missingErrors } = await validateBody({
      ...VALID_BODY,
      description: undefined,
    });
    expect(missingErrors).toHaveLength(0);

    const { instance } = await validateBody({
      ...VALID_BODY,
      description: '  ',
    });
    expect(instance.description).toBeNull();
  });

  it('trims name', async () => {
    const { instance } = await validateBody({
      ...VALID_BODY,
      name: '  المقبلات  ',
    });

    expect(instance.name).toBe('المقبلات');
  });

  it('rejects an empty name', async () => {
    const { errors } = await validateBody({ ...VALID_BODY, name: '' });

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('rejects a status outside ACTIVE/INACTIVE', async () => {
    const { errors } = await validateBody({ ...VALID_BODY, status: 'HIDDEN' });

    expect(errors.some((error) => error.property === 'status')).toBe(true);
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

  it('never exposes restaurantId/locale/imageAssetPath/createdAt/updatedAt as DTO fields', () => {
    const instance = new CreateCategoryDto();

    expect('restaurantId' in instance).toBe(false);
    expect('locale' in instance).toBe(false);
    expect('imageAssetPath' in instance).toBe(false);
    expect('createdAt' in instance).toBe(false);
    expect('updatedAt' in instance).toBe(false);
  });
});
