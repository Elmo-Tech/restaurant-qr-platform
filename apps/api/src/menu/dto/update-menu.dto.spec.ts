import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMenuDto } from './update-menu.dto';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(UpdateMenuDto, body);
  const errors = await validate(instance);
  return { instance, errors };
}

describe('UpdateMenuDto', () => {
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
      description: '  Weekend Menu  ',
    });
    expect(trimmed.description).toBe('Weekend Menu');
  });

  it('rejects an empty nameInternal/name when supplied', async () => {
    const { errors: internalErrors } = await validateBody({
      nameInternal: '',
    });
    expect(
      internalErrors.some((error) => error.property === 'nameInternal'),
    ).toBe(true);

    const { errors: nameErrors } = await validateBody({ name: '' });
    expect(nameErrors.some((error) => error.property === 'name')).toBe(true);
  });

  it('rejects a status outside ACTIVE/INACTIVE when supplied', async () => {
    const { errors } = await validateBody({ status: 'PRIMARY' });

    expect(errors.some((error) => error.property === 'status')).toBe(true);
  });

  it('rejects a negative displayOrder when supplied', async () => {
    const { errors } = await validateBody({ displayOrder: -1 });

    expect(errors.some((error) => error.property === 'displayOrder')).toBe(
      true,
    );
  });

  it.each(['nameInternal', 'name', 'status', 'displayOrder'] as const)(
    'rejects explicit null for %s (only description may be explicitly cleared)',
    async (field) => {
      const { errors } = await validateBody({ [field]: null });

      expect(errors.some((error) => error.property === field)).toBe(true);
    },
  );

  it('never exposes an isPrimary field -- it has its own dedicated Set-Primary endpoint', () => {
    const instance = new UpdateMenuDto();

    expect('isPrimary' in instance).toBe(false);
  });

  it('never exposes restaurantId/locale/createdAt/updatedAt as DTO fields', () => {
    const instance = new UpdateMenuDto();

    expect('restaurantId' in instance).toBe(false);
    expect('locale' in instance).toBe(false);
    expect('createdAt' in instance).toBe(false);
    expect('updatedAt' in instance).toBe(false);
  });
});
