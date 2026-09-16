import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateOrderStatusDto } from './update-order-status.dto';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(UpdateOrderStatusDto, body);
  const errors = await validate(instance);
  return errors;
}

describe('UpdateOrderStatusDto', () => {
  it('accepts a well-formed body', async () => {
    const errors = await validateBody({ expectedStatus: 'PENDING', status: 'ACCEPTED' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing expectedStatus', async () => {
    const errors = await validateBody({ status: 'ACCEPTED' });
    expect(errors.some((error) => error.property === 'expectedStatus')).toBe(true);
  });

  it('rejects a missing status', async () => {
    const errors = await validateBody({ expectedStatus: 'PENDING' });
    expect(errors.some((error) => error.property === 'status')).toBe(true);
  });

  it('rejects an unsupported status value', async () => {
    const errors = await validateBody({ expectedStatus: 'PENDING', status: 'DELIVERED' });
    expect(errors.some((error) => error.property === 'status')).toBe(true);
  });
});
