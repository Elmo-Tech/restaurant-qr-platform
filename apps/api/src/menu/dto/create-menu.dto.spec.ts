import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMenuDto } from './create-menu.dto';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(CreateMenuDto, body);
  const errors = await validate(instance);
  return { instance, errors };
}

describe('CreateMenuDto', () => {
  const VALID_BODY = {
    nameInternal: 'Main Menu',
    name: 'القائمة الرئيسية',
    description: 'وصف القائمة',
    status: 'ACTIVE',
    displayOrder: 0,
  };

  it('accepts a fully valid body with no errors', async () => {
    const { errors } = await validateBody(VALID_BODY);

    expect(errors).toHaveLength(0);
  });

  it('accepts a missing description (optional)', async () => {
    const { errors } = await validateBody({
      ...VALID_BODY,
      description: undefined,
    });

    expect(errors).toHaveLength(0);
  });

  it('normalizes an empty description to null', async () => {
    const { instance } = await validateBody({
      ...VALID_BODY,
      description: '   ',
    });

    expect(instance.description).toBeNull();
  });

  it('trims nameInternal and name', async () => {
    const { instance } = await validateBody({
      ...VALID_BODY,
      nameInternal: '  Main Menu  ',
      name: '  القائمة  ',
    });

    expect(instance.nameInternal).toBe('Main Menu');
    expect(instance.name).toBe('القائمة');
  });

  it('rejects an empty nameInternal', async () => {
    const { errors } = await validateBody({ ...VALID_BODY, nameInternal: '' });

    expect(errors.some((error) => error.property === 'nameInternal')).toBe(
      true,
    );
  });

  it('rejects an empty name', async () => {
    const { errors } = await validateBody({ ...VALID_BODY, name: '' });

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('rejects a status outside ACTIVE/INACTIVE', async () => {
    const { errors } = await validateBody({ ...VALID_BODY, status: 'PRIMARY' });

    expect(errors.some((error) => error.property === 'status')).toBe(true);
  });

  it('rejects a non-integer displayOrder', async () => {
    const { errors } = await validateBody({
      ...VALID_BODY,
      displayOrder: 1.5,
    });

    expect(errors.some((error) => error.property === 'displayOrder')).toBe(
      true,
    );
  });

  it('rejects a negative displayOrder', async () => {
    const { errors } = await validateBody({
      ...VALID_BODY,
      displayOrder: -1,
    });

    expect(errors.some((error) => error.property === 'displayOrder')).toBe(
      true,
    );
  });

  it('never exposes restaurantId/locale/isPrimary/createdAt/updatedAt as DTO fields', () => {
    const instance = new CreateMenuDto();

    expect('restaurantId' in instance).toBe(false);
    expect('locale' in instance).toBe(false);
    expect('isPrimary' in instance).toBe(false);
    expect('createdAt' in instance).toBe(false);
    expect('updatedAt' in instance).toBe(false);
  });
});
