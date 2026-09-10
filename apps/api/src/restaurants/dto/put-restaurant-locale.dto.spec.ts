import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PutRestaurantLocaleDto } from './put-restaurant-locale.dto';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(PutRestaurantLocaleDto, body);
  const errors = await validate(instance);
  return { instance, errors };
}

describe('PutRestaurantLocaleDto', () => {
  it.each([true, false])('accepts isActive: %s', async (isActive) => {
    const { errors } = await validateBody({ isActive });

    expect(errors).toHaveLength(0);
  });

  it.each(['true', 1, 0, null, undefined, 'yes'])(
    'rejects a non-boolean isActive (%p)',
    async (isActive) => {
      const { errors } = await validateBody({ isActive });

      expect(errors.some((error) => error.property === 'isActive')).toBe(true);
    },
  );

  it('accepts no other writable field (locale/restaurantId are never body authority)', () => {
    const instance = new PutRestaurantLocaleDto();

    expect(Object.getOwnPropertyNames(instance)).not.toContain('locale');
    expect(Object.getOwnPropertyNames(instance)).not.toContain('restaurantId');
  });
});
