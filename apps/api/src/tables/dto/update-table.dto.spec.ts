import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTableDto } from './update-table.dto';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(UpdateTableDto, body);
  const errors = await validate(instance);
  return { instance, errors };
}

describe('UpdateTableDto', () => {
  it('A. omitted tableNumber is accepted, stays undefined', async () => {
    const { instance, errors } = await validateBody({});

    expect(errors).toHaveLength(0);
    expect(instance.tableNumber).toBeUndefined();
  });

  it('B. {} is accepted with no errors', async () => {
    const { errors } = await validateBody({});

    expect(errors).toHaveLength(0);
  });

  it('C. a valid string is accepted', async () => {
    const { instance, errors } = await validateBody({ tableNumber: 'A2' });

    expect(errors).toHaveLength(0);
    expect(instance.tableNumber).toBe('A2');
  });

  it('D. leading/trailing whitespace is trimmed', async () => {
    const { instance } = await validateBody({ tableNumber: '  A2  ' });

    expect(instance.tableNumber).toBe('A2');
  });

  it('E. whitespace-only is rejected (empty after trim)', async () => {
    const { errors } = await validateBody({ tableNumber: '   ' });

    const error = errors.find((e) => e.property === 'tableNumber');
    expect(error?.constraints).toHaveProperty('isNotEmpty');
  });

  it('F. empty string is rejected', async () => {
    const { errors } = await validateBody({ tableNumber: '' });

    const error = errors.find((e) => e.property === 'tableNumber');
    expect(error?.constraints).toHaveProperty('isNotEmpty');
  });

  it('G. explicit null is rejected (null is not "omitted")', async () => {
    const { errors } = await validateBody({ tableNumber: null });

    expect(errors.some((e) => e.property === 'tableNumber')).toBe(true);
  });

  it('H. a non-string value is rejected', async () => {
    const { errors } = await validateBody({ tableNumber: 123 });

    expect(errors.some((e) => e.property === 'tableNumber')).toBe(true);
  });

  it('I. no maximum length rule is introduced -- a long value is accepted', async () => {
    const longValue = 'A'.repeat(500);
    const { errors } = await validateBody({ tableNumber: longValue });

    expect(errors).toHaveLength(0);
  });

  it('J. no case normalization -- mixed case is preserved as-is', async () => {
    const { instance } = await validateBody({ tableNumber: 'vIp-2' });

    expect(instance.tableNumber).toBe('vIp-2');
  });

  it('K. the DTO exposes no status/restaurantId/branchId property', () => {
    const instance = new UpdateTableDto();

    expect(Object.keys(instance)).not.toContain('status');
    expect(Object.keys(instance)).not.toContain('restaurantId');
    expect(Object.keys(instance)).not.toContain('branchId');
  });

  // `ValidationPipe({ whitelist: true })` (main.ts) is what actually strips
  // unknown request-body fields such as `status`/`id`/`restaurantId` -- a
  // Nest HTTP-pipeline behavior, proven end-to-end instead
  // (tables-update-http.e2e-spec.ts). At the DTO level, `tableNumber` is the
  // only declared/validated property.
});
