import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGuestOrderDto } from './create-guest-order.dto';

const UUID = '11111111-1111-4111-8111-111111111111';
const BASE = { clientRequestId: UUID, items: [{ productId: UUID, quantity: 1 }] };

async function errorsFor(body: Record<string, unknown>) {
  return validate(plainToInstance(CreateGuestOrderDto, body));
}

describe('CreateGuestOrderDto -- Delivery fields (FT-8)', () => {
  it.each(['PICKUP', 'DELIVERY'])('accepts fulfillment %s', async (fulfillment) => {
    expect(await errorsFor({ ...BASE, fulfillment })).toHaveLength(0);
  });

  it.each(['DINE_IN', 'delivery', 'TAKEAWAY', ''])(
    'rejects unsupported fulfillment "%s" (the Order type is never client-chosen)',
    async (fulfillment) => {
      const errors = await errorsFor({ ...BASE, fulfillment });
      expect(errors.some((e) => e.property === 'fulfillment')).toBe(true);
    },
  );

  it('accepts and trims address fields', async () => {
    const instance = plainToInstance(CreateGuestOrderDto, {
      ...BASE,
      fulfillment: 'DELIVERY',
      deliveryZoneId: UUID,
      deliveryAddress: '  12 University St  ',
      deliveryBuilding: ' B4 ',
    });
    expect(await validate(instance)).toHaveLength(0);
    expect(instance.deliveryAddress).toBe('12 University St');
    expect(instance.deliveryBuilding).toBe('B4');
  });

  it('rejects a malformed deliveryZoneId', async () => {
    const errors = await errorsFor({ ...BASE, deliveryZoneId: 'zone' });
    expect(errors.some((e) => e.property === 'deliveryZoneId')).toBe(true);
  });

  it.each([
    ['deliveryAddress', 301],
    ['deliveryBuilding', 51],
    ['deliveryFloor', 31],
    ['deliveryApartment', 31],
    ['deliveryLandmark', 151],
  ])('rejects %s longer than its maximum', async (field, length) => {
    const errors = await errorsFor({ ...BASE, [field]: 'x'.repeat(length) });
    expect(errors.some((e) => e.property === field)).toBe(true);
  });
});
