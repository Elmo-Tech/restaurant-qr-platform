import {
  ContactValidationError,
  normalizeContactValue,
  whatsappLink,
} from './restaurant-contact';

describe('restaurant contact normalizer', () => {
  it('normalizes phones to digits with an optional plus', () => {
    expect(normalizeContactValue('phone', '+20 (10) 1234-5678')).toBe(
      '+201012345678',
    );
    expect(normalizeContactValue('phone', '01012345678')).toBe('01012345678');
    expect(normalizeContactValue('whatsapp', '+20 100 000 0000')).toBe(
      '+201000000000',
    );
    expect(normalizeContactValue('phone', '   ')).toBeNull();
    expect(normalizeContactValue('phone', null)).toBeNull();
  });

  it('normalizes a hotline (short number) and rejects bad ones', () => {
    expect(normalizeContactValue('hotline', '16512')).toBe('16512');
    expect(normalizeContactValue('hotline', ' 19 777 ')).toBe('19777');
    expect(normalizeContactValue('hotline', '')).toBeNull();
    for (const bad of ['12', '123456789', '+16512', '165a2', '16-5-12x']) {
      expect(() => normalizeContactValue('hotline', bad)).toThrow(
        ContactValidationError,
      );
    }
  });

  it('rejects phones that are not numbers', () => {
    for (const bad of [
      '12345',
      'call me',
      '+20 abc',
      '1'.repeat(16),
      '010-12',
      '0100 000 0000', // WhatsApp needs the country code
    ]) {
      expect(() => normalizeContactValue('whatsapp', bad)).toThrow(
        ContactValidationError,
      );
    }
  });

  it('accepts links on the platform domain and adds https to a bare one', () => {
    expect(
      normalizeContactValue('instagramUrl', 'instagram.com/elmo.cafe'),
    ).toBe('https://instagram.com/elmo.cafe');
    expect(
      normalizeContactValue('facebookUrl', 'https://www.facebook.com/elmo'),
    ).toBe('https://www.facebook.com/elmo');
    expect(
      normalizeContactValue('mapsUrl', 'https://maps.app.goo.gl/abc123'),
    ).toBe('https://maps.app.goo.gl/abc123');
    expect(
      normalizeContactValue('websiteUrl', 'https://elmo.example.com/menu'),
    ).toBe('https://elmo.example.com/menu');
  });

  it('rejects other hosts, look-alikes, http, credentials, scripts and spaces', () => {
    const bad: Array<[Parameters<typeof normalizeContactValue>[0], string]> = [
      ['facebookUrl', 'https://evil.example/facebook.com'],
      ['facebookUrl', 'https://facebook.com.evil.example/x'],
      ['facebookUrl', 'http://facebook.com/x'],
      ['instagramUrl', 'https://user:pw@instagram.com/x'],
      ['tiktokUrl', 'javascript:alert(1)'],
      ['xUrl', 'https://x.com/a b'],
      ['websiteUrl', 'http://insecure.example'],
      ['websiteUrl', 'https://localhost'],
      ['websiteUrl', `https://example.com/${'a'.repeat(300)}`],
    ];
    for (const [field, value] of bad) {
      expect(() => normalizeContactValue(field, value)).toThrow(
        ContactValidationError,
      );
    }
  });

  it('builds the wa.me link from digits only', () => {
    expect(whatsappLink('+201012345678')).toBe('https://wa.me/201012345678');
  });
});
