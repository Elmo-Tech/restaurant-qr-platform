import { createQrPublicCode } from './qr-public-code';

describe('createQrPublicCode', () => {
  it('produces a 43-character value (32 random bytes, base64url-encoded)', () => {
    expect(createQrPublicCode()).toHaveLength(43);
  });

  it('matches the base64url-safe character set', () => {
    expect(createQrPublicCode()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('never contains +, /, or = (not standard base64)', () => {
    const value = createQrPublicCode();
    expect(value).not.toMatch(/[+/=]/);
  });

  it('produces independent values on repeated calls', () => {
    const values = new Set(
      Array.from({ length: 20 }, () => createQrPublicCode()),
    );
    expect(values.size).toBe(20);
  });

  it('takes no arguments -- never derived from a Table/Branch/Restaurant id', () => {
    expect(createQrPublicCode.length).toBe(0);
  });
});
