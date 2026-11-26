import { validateEnv } from './env.schema';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  CORS_ORIGIN: 'http://localhost:3000',
};

describe('validateEnv -- DEC-077 B1 fixed item write gate', () => {
  it('is OFF by default, so a fresh deployment never enables fixed item writes by accident', () => {
    expect(validateEnv(BASE)).toMatchObject({
      PROMOTIONS_FIXED_ITEM_WRITES_ENABLED: false,
    });
  });

  it('reads an explicit true / false', () => {
    expect(
      validateEnv({ ...BASE, PROMOTIONS_FIXED_ITEM_WRITES_ENABLED: 'true' }),
    ).toMatchObject({ PROMOTIONS_FIXED_ITEM_WRITES_ENABLED: true });
    expect(
      validateEnv({ ...BASE, PROMOTIONS_FIXED_ITEM_WRITES_ENABLED: 'false' }),
    ).toMatchObject({ PROMOTIONS_FIXED_ITEM_WRITES_ENABLED: false });
  });

  it('fails clearly at startup on any other value (no truthy guessing)', () => {
    for (const value of ['1', 'yes', 'TRUE', 'on', '']) {
      expect(() =>
        validateEnv({ ...BASE, PROMOTIONS_FIXED_ITEM_WRITES_ENABLED: value }),
      ).toThrow(/PROMOTIONS_FIXED_ITEM_WRITES_ENABLED/);
    }
  });
});
