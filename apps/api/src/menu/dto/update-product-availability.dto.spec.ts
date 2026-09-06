import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProductAvailabilityDto } from './update-product-availability.dto';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(UpdateProductAvailabilityDto, body);
  const errors = await validate(instance);
  return { instance, errors };
}

describe('UpdateProductAvailabilityDto', () => {
  it.each(['AVAILABLE', 'SOLD_OUT'])('accepts %s', async (availability) => {
    const { errors } = await validateBody({ availability });

    expect(errors).toHaveLength(0);
  });

  it('rejects an unsupported value', async () => {
    const { errors } = await validateBody({ availability: 'OUT_OF_STOCK' });

    expect(errors.some((error) => error.property === 'availability')).toBe(
      true,
    );
  });

  it('accepts no other writable field', () => {
    const instance = new UpdateProductAvailabilityDto();

    expect(Object.getOwnPropertyNames(instance)).not.toContain('status');
    expect(Object.getOwnPropertyNames(instance)).not.toContain('basePrice');
  });
});
