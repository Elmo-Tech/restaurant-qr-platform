import { validateOwnerContact } from './restaurant-owner-contact';

describe('Private Platform owner contact normalization', () => {
  it('keeps legacy / CLI provisioning compatible without customer contact', () => {
    expect(validateOwnerContact(undefined)).toEqual({ ok: true, value: null });
  });

  it('accepts an Egyptian mobile, normalizes numbers and Facebook profile', () => {
    expect(
      validateOwnerContact({
        fullName: '  Ahmed Hassan  ',
        phone: '010 1234 5678',
        facebookUrl: 'facebook.com/ahmed.hassan',
      }),
    ).toEqual({
      ok: true,
      value: {
        fullName: 'Ahmed Hassan',
        phone: '01012345678',
        facebookUrl: 'https://facebook.com/ahmed.hassan',
      },
    });
  });

  it('accepts international numbers and optional Facebook', () => {
    expect(
      validateOwnerContact({
        fullName: 'Fatma Said',
        phone: '+20 (10) 9876-5432',
        facebookUrl: '',
      }),
    ).toMatchObject({
      ok: true,
      value: { phone: '+201098765432', facebookUrl: null },
    });
  });

  it.each([
    [],
    {},
    { fullName: 'A', phone: '01012345678' },
    { fullName: 'Ahmed', phone: '123' },
    { fullName: 'Ahmed', phone: 1000111 },
    { fullName: 'Ahmed', phone: '01012345678', facebookUrl: 'javascript:alert(1)' },
    { fullName: 'Ahmed', phone: '01012345678', facebookUrl: 'https://evil.example/' },
    { fullName: 'A'.repeat(130), phone: '01012345678' },
  ])('rejects invalid customer contact %j', (raw) => {
    expect(validateOwnerContact(raw).ok).toBe(false);
  });

  it('never echoes telephone numbers or profile URLs in validation errors', () => {
    const bad = validateOwnerContact({
      fullName: '',
      phone: '555',
      facebookUrl: 'https://evil.example/profile',
    });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toContain('555');
    expect(JSON.stringify(bad)).not.toContain('evil.example');
  });
});
