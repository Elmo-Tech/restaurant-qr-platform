import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGuestOrderDto } from './create-guest-order.dto';

const WELL_FORMED_UUID = '11111111-1111-4111-8111-111111111111';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(CreateGuestOrderDto, body);
  return validate(instance);
}

describe('CreateGuestOrderDto', () => {
  it('accepts a well-formed body', async () => {
    const errors = await validateBody({
      clientRequestId: WELL_FORMED_UUID,
      items: [{ productId: WELL_FORMED_UUID, quantity: 2 }],
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-UUID clientRequestId', async () => {
    const errors = await validateBody({
      clientRequestId: 'not-a-uuid',
      items: [{ productId: WELL_FORMED_UUID, quantity: 1 }],
    });
    expect(errors.some((error) => error.property === 'clientRequestId')).toBe(true);
  });

  it('rejects an empty items array', async () => {
    const errors = await validateBody({ clientRequestId: WELL_FORMED_UUID, items: [] });
    expect(errors.some((error) => error.property === 'items')).toBe(true);
  });

  it('rejects more than 50 line items', async () => {
    const items = Array.from({ length: 51 }, () => ({ productId: WELL_FORMED_UUID, quantity: 1 }));
    const errors = await validateBody({ clientRequestId: WELL_FORMED_UUID, items });
    expect(errors.some((error) => error.property === 'items')).toBe(true);
  });

  it('accepts exactly 50 line items', async () => {
    const items = Array.from({ length: 50 }, () => ({ productId: WELL_FORMED_UUID, quantity: 1 }));
    const errors = await validateBody({ clientRequestId: WELL_FORMED_UUID, items });
    expect(errors).toHaveLength(0);
  });

  it.each([0, -1, 1.5, 100])('rejects an invalid quantity (%s)', async (quantity) => {
    const errors = await validateBody({
      clientRequestId: WELL_FORMED_UUID,
      items: [{ productId: WELL_FORMED_UUID, quantity }],
    });
    expect(errors.some((error) => error.property === 'items')).toBe(true);
  });

  it.each([1, 99])('accepts a boundary-valid quantity (%s)', async (quantity) => {
    const errors = await validateBody({
      clientRequestId: WELL_FORMED_UUID,
      items: [{ productId: WELL_FORMED_UUID, quantity }],
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-UUID productId', async () => {
    const errors = await validateBody({
      clientRequestId: WELL_FORMED_UUID,
      items: [{ productId: 'not-a-uuid', quantity: 1 }],
    });
    expect(errors.some((error) => error.property === 'items')).toBe(true);
  });
});
