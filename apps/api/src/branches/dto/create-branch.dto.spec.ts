import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBranchDto } from './create-branch.dto';

async function validateBody(body: Record<string, unknown>) {
  const instance = plainToInstance(CreateBranchDto, body);
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

describe('CreateBranchDto', () => {
  const VALID_BODY = {
    name: 'Maadi',
    timezone: 'Africa/Cairo',
    phone: '+20 100 000 0000',
    address: '1 Nile Street',
  };

  it('accepts a fully valid body with no errors', async () => {
    const { errors } = await validateBody(VALID_BODY);

    expect(errors).toHaveLength(0);
  });

  describe('name', () => {
    it('trims surrounding whitespace', async () => {
      const { instance } = await validateBody({
        ...VALID_BODY,
        name: '  Maadi  ',
      });

      expect(instance.name).toBe('Maadi');
    });

    it('rejects a missing name', async () => {
      const { errors } = await validateBody(omit(VALID_BODY, 'name'));

      expect(errors.some((e) => e.property === 'name')).toBe(true);
    });

    it('rejects a whitespace-only name (empty after trim)', async () => {
      const { errors } = await validateBody({ ...VALID_BODY, name: '   ' });

      const nameError = errors.find((e) => e.property === 'name');
      expect(nameError?.constraints).toHaveProperty('isNotEmpty');
    });

    it('rejects a non-string name', async () => {
      const { errors } = await validateBody({ ...VALID_BODY, name: 123 });

      expect(errors.some((e) => e.property === 'name')).toBe(true);
    });
  });

  describe('timezone', () => {
    it('trims surrounding whitespace', async () => {
      const { instance } = await validateBody({
        ...VALID_BODY,
        timezone: '  Africa/Cairo  ',
      });

      expect(instance.timezone).toBe('Africa/Cairo');
    });

    it('rejects a missing timezone', async () => {
      const { errors } = await validateBody(omit(VALID_BODY, 'timezone'));

      expect(errors.some((e) => e.property === 'timezone')).toBe(true);
    });

    it('rejects an invalid IANA timezone', async () => {
      const { errors } = await validateBody({
        ...VALID_BODY,
        timezone: 'Not/AZone',
      });

      const tzError = errors.find((e) => e.property === 'timezone');
      expect(tzError?.constraints).toHaveProperty('isTimeZone');
    });

    it('rejects a fixed-offset string, not just IANA identifiers', async () => {
      const { errors } = await validateBody({
        ...VALID_BODY,
        timezone: 'GMT+3',
      });

      expect(errors.some((e) => e.property === 'timezone')).toBe(true);
    });
  });

  describe('phone (optional)', () => {
    it('is omitted entirely -> undefined, no error', async () => {
      const { instance, errors } = await validateBody(
        omit(VALID_BODY, 'phone'),
      );

      expect(instance.phone).toBeUndefined();
      expect(errors).toHaveLength(0);
    });

    it('trims surrounding whitespace', async () => {
      const { instance } = await validateBody({
        ...VALID_BODY,
        phone: '  +20 100 000 0000  ',
      });

      expect(instance.phone).toBe('+20 100 000 0000');
    });

    it('empty-after-trim becomes null, not a validation error', async () => {
      const { instance, errors } = await validateBody({
        ...VALID_BODY,
        phone: '   ',
      });

      expect(instance.phone).toBeNull();
      expect(errors).toHaveLength(0);
    });

    it('explicit null is accepted', async () => {
      const { instance, errors } = await validateBody({
        ...VALID_BODY,
        phone: null,
      });

      expect(instance.phone).toBeNull();
      expect(errors).toHaveLength(0);
    });

    it('rejects a non-string, non-null phone', async () => {
      const { errors } = await validateBody({ ...VALID_BODY, phone: 12345 });

      expect(errors.some((e) => e.property === 'phone')).toBe(true);
    });
  });

  describe('address (optional)', () => {
    it('is omitted entirely -> undefined, no error', async () => {
      const { instance, errors } = await validateBody(
        omit(VALID_BODY, 'address'),
      );

      expect(instance.address).toBeUndefined();
      expect(errors).toHaveLength(0);
    });

    it('empty-after-trim becomes null, not a validation error', async () => {
      const { instance, errors } = await validateBody({
        ...VALID_BODY,
        address: '   ',
      });

      expect(instance.address).toBeNull();
      expect(errors).toHaveLength(0);
    });
  });
});
