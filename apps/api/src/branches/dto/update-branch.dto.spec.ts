import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBranchDto } from './update-branch.dto';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(UpdateBranchDto, body);
  const errors = await validate(instance);
  return { instance, errors };
}

describe('UpdateBranchDto', () => {
  it('accepts an empty body with no errors', async () => {
    const { errors } = await validateBody({});

    expect(errors).toHaveLength(0);
  });

  describe('name', () => {
    it('omitted -> accepted, stays undefined', async () => {
      const { instance, errors } = await validateBody({});

      expect(errors).toHaveLength(0);
      expect(instance.name).toBeUndefined();
    });

    it('trims surrounding whitespace', async () => {
      const { instance } = await validateBody({ name: '  Maadi  ' });

      expect(instance.name).toBe('Maadi');
    });

    it('rejects an empty/whitespace-only string (empty after trim)', async () => {
      const { errors } = await validateBody({ name: '   ' });

      const error = errors.find((e) => e.property === 'name');
      expect(error?.constraints).toHaveProperty('isNotEmpty');
    });

    it('rejects explicit null (null is not "omitted")', async () => {
      const { errors } = await validateBody({ name: null });

      expect(errors.some((e) => e.property === 'name')).toBe(true);
    });

    it('rejects a non-string value', async () => {
      const { errors } = await validateBody({ name: 123 });

      expect(errors.some((e) => e.property === 'name')).toBe(true);
    });
  });

  describe('timezone', () => {
    it('omitted -> accepted, stays undefined', async () => {
      const { instance, errors } = await validateBody({});

      expect(errors).toHaveLength(0);
      expect(instance.timezone).toBeUndefined();
    });

    it('trims surrounding whitespace', async () => {
      const { instance } = await validateBody({
        timezone: '  Africa/Cairo  ',
      });

      expect(instance.timezone).toBe('Africa/Cairo');
    });

    it('accepts a valid IANA timezone', async () => {
      const { errors } = await validateBody({ timezone: 'Africa/Cairo' });

      expect(errors).toHaveLength(0);
    });

    it('rejects an invalid IANA timezone', async () => {
      const { errors } = await validateBody({ timezone: 'Not/AZone' });

      const error = errors.find((e) => e.property === 'timezone');
      expect(error?.constraints).toHaveProperty('isTimeZone');
    });

    it('rejects explicit null (null is not "omitted")', async () => {
      const { errors } = await validateBody({ timezone: null });

      expect(errors.some((e) => e.property === 'timezone')).toBe(true);
    });
  });

  describe('phone', () => {
    it('omitted -> stays undefined (unchanged)', async () => {
      const { instance, errors } = await validateBody({});

      expect(instance.phone).toBeUndefined();
      expect(errors).toHaveLength(0);
    });

    it('trims surrounding whitespace', async () => {
      const { instance } = await validateBody({
        phone: '  +20 100 000 0000  ',
      });

      expect(instance.phone).toBe('+20 100 000 0000');
    });

    it('empty/whitespace-only -> null', async () => {
      const { instance, errors } = await validateBody({ phone: '   ' });

      expect(instance.phone).toBeNull();
      expect(errors).toHaveLength(0);
    });

    it('explicit null is accepted (clears)', async () => {
      const { instance, errors } = await validateBody({ phone: null });

      expect(instance.phone).toBeNull();
      expect(errors).toHaveLength(0);
    });

    it('rejects a non-string, non-null value', async () => {
      const { errors } = await validateBody({ phone: 12345 });

      expect(errors.some((e) => e.property === 'phone')).toBe(true);
    });
  });

  describe('address', () => {
    it('omitted -> stays undefined (unchanged)', async () => {
      const { instance, errors } = await validateBody({});

      expect(instance.address).toBeUndefined();
      expect(errors).toHaveLength(0);
    });

    it('trims surrounding whitespace', async () => {
      const { instance } = await validateBody({
        address: '  1 Nile Street  ',
      });

      expect(instance.address).toBe('1 Nile Street');
    });

    it('empty/whitespace-only -> null', async () => {
      const { instance, errors } = await validateBody({ address: '   ' });

      expect(instance.address).toBeNull();
      expect(errors).toHaveLength(0);
    });

    it('explicit null is accepted (clears)', async () => {
      const { instance, errors } = await validateBody({ address: null });

      expect(instance.address).toBeNull();
      expect(errors).toHaveLength(0);
    });
  });

  // `ValidationPipe({ whitelist: true })` (main.ts) is what actually strips
  // unknown request-body fields such as `status`/`id`/`restaurantId` -- a
  // Nest HTTP-pipeline behavior, not something `plainToInstance` alone
  // reproduces at the unit level, so it is proven end-to-end instead
  // (branches-update-http.e2e-spec.ts, authority section). At the DTO
  // level, `name`/`timezone`/`phone`/`address` are the only declared/
  // validated properties -- `status` is not declared here at all.
});
