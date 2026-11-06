import {
  cleanMultiLine,
  cleanPhoneInput,
  cleanSingleLine,
  GUEST_FIELD_LIMITS,
  normalizeGuestPhone,
  toWesternDigits,
  validateGuestOrderFields,
} from './guest-order-fields';

describe('toWesternDigits', () => {
  it('converts Arabic-Indic, Eastern Arabic and full-width digits', () => {
    expect(toWesternDigits('٠١٠١٢٣٤٥٦٧٨')).toBe('01012345678');
    expect(toWesternDigits('۰۱۰۱۲۳۴۵۶۷۸')).toBe('01012345678');
    expect(toWesternDigits('０１０１２３４５６７８')).toBe('01012345678');
    expect(toWesternDigits('＋２０')).toBe('+20');
    expect(toWesternDigits('Sara 12')).toBe('Sara 12');
  });
});

describe('normalizeGuestPhone (Egypt is the default country)', () => {
  const eg = (raw: string) => normalizeGuestPhone(raw, 'EG');

  it.each([
    ['01012345678', '+201012345678'],
    ['01112345678', '+201112345678'],
    ['01212345678', '+201212345678'],
    ['01512345678', '+201512345678'],
    ['010 1234 5678', '+201012345678'],
    ['010-1234-5678', '+201012345678'],
    ['(010) 1234 5678', '+201012345678'],
    ['+201012345678', '+201012345678'],
    ['+20 10 1234 5678', '+201012345678'],
    ['+2001012345678', '+201012345678'],
    ['00201012345678', '+201012345678'],
    ['0020 10 1234 5678', '+201012345678'],
    ['٠١٠١٢٣٤٥٦٧٨', '+201012345678'],
    ['۰۱۰۱۲۳۴۵۶۷۸', '+201012345678'],
    ['+٢٠١٠١٢٣٤٥٦٧٨', '+201012345678'],
  ])('accepts the Egyptian mobile %s as %s', (raw, expected) => {
    expect(eg(raw)).toEqual({ valid: true, value: expected });
  });

  it.each([
    ['0222345678', '+20222345678'], // Cairo / Giza: 02 + 8 digits
    ['02 2345 6789', '+20223456789'],
    ['034567890', '+2034567890'], // Alexandria: 03 + 7 digits
    ['0403456789', '+20403456789'], // Governorate areas: 0xx + 7 digits
    ['0951234567', '+20951234567'],
    ['+20 2 2345 6789', '+20223456789'],
    ['0020223456789', '+20223456789'],
  ])('accepts the Egyptian landline %s as %s', (raw, expected) => {
    expect(eg(raw)).toEqual({ valid: true, value: expected });
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['548', '548'],
    ['too short mobile', '0101234567'], // 10 digits
    ['too long mobile', '010123456789'], // 12 digits
    ['mobile with an unused prefix', '01312345678'],
    ['mobile missing its leading 0 and a digit', '123456789'],
    ['letters', 'abc1234567'],
    ['letters mixed in', '0101234abcd'],
    ['arabic letters', 'ص٠١٢٣٤٥٦٧٨٩'],
    ['a URL', 'https://wa.me/201012345678'],
    ['two plus signs', '++201012345678'],
    ['plus in the middle', '0101+2345678'],
    ['all zeros', '00000000000'],
    ['toll-free line', '08001234567'],
    ['premium line', '09001234567'],
    ['landline with a wrong length', '02234567'],
    ['too many digits', '+2010123456789012345'],
    ['an extension', '01012345678 ext 12'],
    ['unknown country prefix', '+999123456789'],
  ])('refuses %s (%s)', (_label, raw) => {
    expect(eg(raw)).toEqual({ valid: false });
  });

  it('accepts a number of another country only in international format', () => {
    expect(eg('+966501234567')).toEqual({
      valid: true,
      value: '+966501234567',
    });
    expect(eg('00966501234567')).toEqual({
      valid: true,
      value: '+966501234567',
    });
    expect(eg('+1 202 555 0123')).toEqual({
      valid: true,
      value: '+12025550123',
    });
    // Without the prefix a Saudi local mobile is read as an Egyptian one, and is not one.
    expect(eg('0581234567')).toEqual({ valid: false });
  });

  it('reads a local number in the Restaurant country, whichever it is', () => {
    expect(normalizeGuestPhone('0581234567', 'SA')).toEqual({
      valid: true,
      value: '+966581234567',
    });
    expect(normalizeGuestPhone('01012345678', 'SA')).toEqual({ valid: false });
    expect(normalizeGuestPhone('+201012345678', 'SA')).toEqual({
      valid: true,
      value: '+201012345678',
    });
  });

  it('strips zero-width and bidi marks before judging', () => {
    expect(eg('\u202A01012345678\u202C')).toEqual({
      valid: true,
      value: '+201012345678',
    });
    expect(eg('0101\u200B2345678')).toEqual({
      valid: true,
      value: '+201012345678',
    });
  });
});

describe('cleaning', () => {
  it('cleanSingleLine trims, collapses whitespace and removes control characters', () => {
    expect(cleanSingleLine('  Sara   Ali  ')).toBe('Sara Ali');
    expect(cleanSingleLine('Sara\u0000 Ali\u0007')).toBe('Sara Ali');
    expect(cleanSingleLine('line1\nline2\r\nline3\tx')).toBe(
      'line1 line2 line3 x',
    );
    expect(cleanSingleLine('a\u202Eb\u200Bc')).toBe('abc');
    expect(cleanSingleLine(12)).toBe(12);
  });

  it('cleanMultiLine keeps line breaks but not control characters or long blank runs', () => {
    expect(cleanMultiLine(' no onions\r\n\r\n\r\n\r\nextra sauce\u0000 ')).toBe(
      'no onions\n\nextra sauce',
    );
    expect(cleanMultiLine('a\tb')).toBe('a b');
    expect(cleanMultiLine('a\u2028b')).toBe('a\nb');
  });

  it('cleanPhoneInput converts digits and trims, without judging the format', () => {
    expect(cleanPhoneInput(' ٠١٠ 1234 ٥٦٧٨\u200B ')).toBe('010 1234 5678');
    expect(cleanPhoneInput('548')).toBe('548');
  });
});

describe('validateGuestOrderFields', () => {
  const base = {
    customerName: 'Sara Ali',
    customerPhone: '010 1234 5678',
    customerNotes: 'No onions',
    deliveryAddress: '12 University St',
    deliveryBuilding: 'B4',
    deliveryFloor: '3',
    deliveryApartment: '12',
    deliveryLandmark: 'Near the library',
  };

  it('returns the clean values with the phone normalized (delivery)', () => {
    const result = validateGuestOrderFields(base, {
      defaultCountry: 'EG',
      delivery: true,
    });
    expect(result).toEqual({
      ok: true,
      fields: {
        customerName: 'Sara Ali',
        customerPhone: '+201012345678',
        customerNotes: 'No onions',
        deliveryAddress: '12 University St',
        deliveryBuilding: 'B4',
        deliveryFloor: '3',
        deliveryApartment: '12',
        deliveryLandmark: 'Near the library',
      },
    });
  });

  it('drops delivery text for a pickup order and turns blanks into null', () => {
    const result = validateGuestOrderFields(
      { ...base, customerNotes: '  ', deliveryAddress: '' },
      { defaultCountry: 'EG', delivery: false },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fields.customerNotes).toBeNull();
    expect(result.fields.deliveryAddress).toBeNull();
    expect(result.fields.deliveryBuilding).toBeNull();
  });

  it('reports every bad field at once with stable codes', () => {
    const result = validateGuestOrderFields(
      {
        customerName: 'S',
        customerPhone: '548',
        deliveryAddress: '12',
        deliveryBuilding: 'x'.repeat(
          GUEST_FIELD_LIMITS.deliveryBuilding.max + 1,
        ),
        customerNotes: 'n'.repeat(GUEST_FIELD_LIMITS.customerNotes.max + 1),
      },
      { defaultCountry: 'EG', delivery: true },
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        { field: 'customerName', code: 'TOO_SHORT' },
        { field: 'customerNotes', code: 'TOO_LONG' },
        { field: 'customerPhone', code: 'INVALID_PHONE' },
        { field: 'deliveryAddress', code: 'TOO_SHORT' },
        { field: 'deliveryBuilding', code: 'TOO_LONG' },
      ],
    });
  });

  it('requires a name and an address with a letter in them', () => {
    const result = validateGuestOrderFields(
      { ...base, customerName: '12345', deliveryAddress: '12345 / 67' },
      { defaultCountry: 'EG', delivery: true },
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        { field: 'customerName', code: 'MUST_CONTAIN_LETTER' },
        { field: 'deliveryAddress', code: 'MUST_CONTAIN_LETTER' },
      ],
    });
  });

  it('accepts Arabic names and addresses', () => {
    const result = validateGuestOrderFields(
      {
        ...base,
        customerName: 'سارة علي',
        deliveryAddress: '١٢ شارع الجامعة، الدور ٣',
      },
      { defaultCountry: 'EG', delivery: true },
    );
    expect(result.ok).toBe(true);
  });
});
