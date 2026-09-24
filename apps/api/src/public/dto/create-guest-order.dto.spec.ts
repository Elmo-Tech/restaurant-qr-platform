import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGuestOrderDto } from './create-guest-order.dto';

const WELL_FORMED_UUID = '11111111-1111-4111-8111-111111111111';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(CreateGuestOrderDto, body);
  return validate(instance);
}

/** Well-formed, mutually distinct UUIDs -- only the last segment varies. */
function generateUuids(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
  );
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

  describe('modifierOptionIds', () => {
    it('accepts a normal valid UUID array', async () => {
      const errors = await validateBody({
        clientRequestId: WELL_FORMED_UUID,
        items: [
          {
            productId: WELL_FORMED_UUID,
            quantity: 1,
            modifierOptionIds: generateUuids(3),
          },
        ],
      });
      expect(errors).toHaveLength(0);
    });

    it('rejects a malformed option id', async () => {
      const errors = await validateBody({
        clientRequestId: WELL_FORMED_UUID,
        items: [
          {
            productId: WELL_FORMED_UUID,
            quantity: 1,
            modifierOptionIds: [WELL_FORMED_UUID, 'not-a-uuid'],
          },
        ],
      });
      expect(errors.some((error) => error.property === 'items')).toBe(true);
    });

    // FT-6A final blocker fix: there is NO documented global maximum on how
    // many Modifier Options one line item may select (DATABASE_SPEC.md #74
    // only bounds minimumSelections/maximumSelections PER Group) -- the
    // previous `@ArrayMaxSize(20)` was an invented DTO-wide cap that could
    // reject a completely valid Product configuration. A large-but-valid
    // array must never fail merely because of its length.
    it('does NOT reject more than 20 valid UUID entries merely because of array length', async () => {
      const errors = await validateBody({
        clientRequestId: WELL_FORMED_UUID,
        items: [
          {
            productId: WELL_FORMED_UUID,
            quantity: 1,
            modifierOptionIds: generateUuids(25),
          },
        ],
      });
      expect(errors).toHaveLength(0);
    });
  });
});

describe('CreateGuestOrderDto -- Pickup fields (FT-7)', () => {
  const base = {
    clientRequestId: WELL_FORMED_UUID,
    items: [{ productId: WELL_FORMED_UUID, quantity: 1 }],
  };

  it('accepts a body with no Pickup fields at all (TABLE QR orders)', async () => {
    expect(await validateBody(base)).toHaveLength(0);
  });

  it('accepts and trims Pickup name/phone/notes', async () => {
    const instance = plainToInstance(CreateGuestOrderDto, {
      ...base,
      branchId: WELL_FORMED_UUID,
      customerName: '  Sara Ali  ',
      customerPhone: ' +20 100 000 0000 ',
      customerNotes: '  No onions ',
    });
    expect(await validate(instance)).toHaveLength(0);
    expect(instance.customerName).toBe('Sara Ali');
    expect(instance.customerPhone).toBe('+20 100 000 0000');
    expect(instance.customerNotes).toBe('No onions');
  });

  it('rejects a malformed branchId', async () => {
    const errors = await validateBody({ ...base, branchId: 'nope' });
    expect(errors.some((error) => error.property === 'branchId')).toBe(true);
  });

  it.each([
    ['customerName', 101],
    ['customerPhone', 31],
    ['customerNotes', 501],
  ])('rejects %s longer than its maximum', async (field, length) => {
    const errors = await validateBody({ ...base, [field]: 'x'.repeat(length) });
    expect(errors.some((error) => error.property === field)).toBe(true);
  });
});
