import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListOrdersQueryDto } from './list-orders-query.dto';

const WELL_FORMED_UUID = '11111111-1111-4111-8111-111111111111';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(ListOrdersQueryDto, body);
  return validate(instance);
}

describe('ListOrdersQueryDto', () => {
  it('accepts an empty query (both filters optional)', async () => {
    expect(await validateBody({})).toHaveLength(0);
  });

  it('accepts a well-formed branchId and status', async () => {
    const errors = await validateBody({ branchId: WELL_FORMED_UUID, status: 'PENDING' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-UUID branchId', async () => {
    const errors = await validateBody({ branchId: 'not-a-uuid' });
    expect(errors.some((error) => error.property === 'branchId')).toBe(true);
  });

  it('rejects an unsupported status value', async () => {
    const errors = await validateBody({ status: 'DELIVERED' });
    expect(errors.some((error) => error.property === 'status')).toBe(true);
  });
});
