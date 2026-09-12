import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PutTranslationDto } from './put-translation.dto';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(PutTranslationDto, body);
  const errors = await validate(instance);
  return { instance, errors };
}

describe('PutTranslationDto', () => {
  it('accepts a trimmed name and null description', async () => {
    const { instance, errors } = await validateBody({
      name: '  القائمة الرئيسية  ',
      description: null,
    });

    expect(errors).toHaveLength(0);
    expect(instance.name).toBe('القائمة الرئيسية');
    expect(instance.description).toBeNull();
  });

  it('accepts a description and trims it', async () => {
    const { instance, errors } = await validateBody({
      name: 'Main Menu',
      description: '  a description  ',
    });

    expect(errors).toHaveLength(0);
    expect(instance.description).toBe('a description');
  });

  it('normalizes a blank description to null', async () => {
    const { instance, errors } = await validateBody({
      name: 'Main Menu',
      description: '   ',
    });

    expect(errors).toHaveLength(0);
    expect(instance.description).toBeNull();
  });

  it('accepts an omitted description', async () => {
    const { errors } = await validateBody({ name: 'Main Menu' });

    expect(errors).toHaveLength(0);
  });

  it('rejects a missing name', async () => {
    const { errors } = await validateBody({});

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('rejects a blank/whitespace-only name', async () => {
    const { errors } = await validateBody({ name: '   ' });

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('rejects a non-string name', async () => {
    const { errors } = await validateBody({ name: 123 });

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('accepts no other writable field (locale/restaurantId/entityId are never body authority)', () => {
    const instance = new PutTranslationDto();

    expect(Object.getOwnPropertyNames(instance)).not.toContain('locale');
    expect(Object.getOwnPropertyNames(instance)).not.toContain('restaurantId');
  });
});
