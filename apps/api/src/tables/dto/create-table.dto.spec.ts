import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTableDto } from './create-table.dto';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(CreateTableDto, body);
  const errors = await validate(instance);
  return { instance, errors };
}

function omit(
  body: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const copy = { ...body };
  delete copy[key];
  return copy;
}

describe('CreateTableDto', () => {
  const VALID_BODY = { tableNumber: 'A1' };

  it('accepts a fully valid body with no errors', async () => {
    const { errors } = await validateBody(VALID_BODY);

    expect(errors).toHaveLength(0);
  });

  describe('tableNumber', () => {
    it('rejects a missing tableNumber', async () => {
      const { errors } = await validateBody(omit(VALID_BODY, 'tableNumber'));

      expect(errors.some((e) => e.property === 'tableNumber')).toBe(true);
    });

    it('rejects a non-string tableNumber', async () => {
      const { errors } = await validateBody({ tableNumber: 123 });

      expect(errors.some((e) => e.property === 'tableNumber')).toBe(true);
    });

    it('rejects an empty string', async () => {
      const { errors } = await validateBody({ tableNumber: '' });

      const error = errors.find((e) => e.property === 'tableNumber');
      expect(error?.constraints).toHaveProperty('isNotEmpty');
    });

    it('rejects a whitespace-only value (empty after trim)', async () => {
      const { errors } = await validateBody({ tableNumber: '   ' });

      const error = errors.find((e) => e.property === 'tableNumber');
      expect(error?.constraints).toHaveProperty('isNotEmpty');
    });

    it('trims surrounding whitespace', async () => {
      const { instance } = await validateBody({ tableNumber: '  A1  ' });

      expect(instance.tableNumber).toBe('A1');
    });

    it.each(['12', 'A1', 'VIP-2'])('accepts %s', async (tableNumber) => {
      const { instance, errors } = await validateBody({ tableNumber });

      expect(errors).toHaveLength(0);
      expect(instance.tableNumber).toBe(tableNumber);
    });
  });

  // `ValidationPipe({ whitelist: true })` (main.ts) is what actually strips
  // unknown request-body fields -- that is a Nest HTTP-pipeline behavior,
  // not something `plainToInstance` alone reproduces at the unit level, so
  // it is proven end-to-end instead (tables-create-http.e2e-spec.ts, body
  // authority section). At the DTO level, `tableNumber` is the only
  // declared/validated property, so no other field can ever become
  // persistence authority through this contract.
});
