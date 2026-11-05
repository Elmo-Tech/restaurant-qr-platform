import assert from 'node:assert/strict';
import test from 'node:test';
import * as libphonenumber from 'libphonenumber-js/max';
import {
  checkGuestPhone,
  checkoutValuesForSubmit,
  cleanCheckoutValue,
  issueFromApiCode,
  loadPhoneLibrary,
  phoneNeedsLibrary,
  sanitizeWhileTyping,
  toWesternDigits,
  validateCheckoutFields,
} from './checkout-validation.ts';

const eg = (raw, library = null) => checkGuestPhone(raw, 'EG', library);
const E164 = (value) => ({ valid: true, value, verified: true });

test('Egyptian mobiles in every written form are accepted and normalized to E.164', () => {
  for (const raw of [
    '01012345678',
    '010 1234 5678',
    '010-1234-5678',
    '(010) 1234 5678',
    '+201012345678',
    '+20 10 1234 5678',
    '+2001012345678',
    '00201012345678',
    '0020 10 1234 5678',
    '1012345678',
    '٠١٠١٢٣٤٥٦٧٨',
    '۰۱۰۱۲۳۴۵۶۷۸',
    '+٢٠١٠١٢٣٤٥٦٧٨',
  ]) {
    assert.deepEqual(eg(raw), E164('+201012345678'), raw);
  }
  assert.deepEqual(eg('01112345678'), E164('+201112345678'));
  assert.deepEqual(eg('01212345678'), E164('+201212345678'));
  assert.deepEqual(eg('01512345678'), E164('+201512345678'));
});

test('Egyptian landlines are accepted by area code with the right length', () => {
  assert.deepEqual(eg('0222345678'), E164('+20222345678')); // Cairo / Giza: 02 + 8 digits
  assert.deepEqual(eg('02 2345 6789'), E164('+20223456789'));
  assert.deepEqual(eg('034567890'), E164('+2034567890')); // Alexandria: 03 + 7 digits
  assert.deepEqual(eg('0403456789'), E164('+20403456789')); // other governorates: 0xx + 7 digits
  assert.deepEqual(eg('+20 2 2345 6789'), E164('+20223456789'));
  assert.deepEqual(eg('0020223456789'), E164('+20223456789'));
});

test('nonsense, wrong lengths, letters and service numbers are refused', () => {
  for (const raw of [
    '',
    '   ',
    '548',
    '0101234567', // one digit short
    '010123456789', // one digit too many
    '01312345678', // no such mobile prefix
    '123456789',
    'abc1234567',
    '0101234abcd',
    'ص٠١٢٣٤٥٦٧٨٩',
    'https://wa.me/201012345678',
    '++201012345678',
    '0101+2345678',
    '00000000000',
    '08001234567', // toll free
    '09001234567', // premium
    '02234567', // landline, wrong length
    '+2010123456789012345',
    '01012345678 ext 12',
  ]) {
    assert.deepEqual(eg(raw), { valid: false }, `"${raw}" must be refused`);
  }
});

test('with the full library loaded the answer is the library\'s, for Egypt and for other countries', async () => {
  const lib = await loadPhoneLibrary();
  assert.deepEqual(eg('01012345678', lib), E164('+201012345678'));
  assert.deepEqual(eg('548', lib), { valid: false });
  assert.deepEqual(eg('01312345678', lib), { valid: false });
  assert.deepEqual(eg('+966501234567', lib), E164('+966501234567'));
  assert.deepEqual(eg('+1 202 555 0123', lib), E164('+12025550123'));
  assert.deepEqual(eg('0581234567', lib), { valid: false }); // a Saudi local mobile is not Egyptian
  assert.deepEqual(checkGuestPhone('0581234567', 'SA', lib), E164('+966581234567'));
  assert.deepEqual(checkGuestPhone('01012345678', 'SA', lib), { valid: false });
  assert.deepEqual(eg('08001234567', lib), { valid: false });
  assert.deepEqual(eg('+999123456789', lib), { valid: false }); // no such country code
});

test('before the library has loaded a number of another country is only shape-checked', () => {
  assert.deepEqual(eg('+966501234567'), { valid: true, value: '+966501234567', verified: false });
  assert.deepEqual(eg('+96650'), { valid: false });
  assert.equal(phoneNeedsLibrary('+966501234567', 'EG'), true);
  assert.equal(phoneNeedsLibrary('01012345678', 'EG'), false);
  assert.equal(phoneNeedsLibrary('+201012345678', 'EG'), false);
  assert.equal(phoneNeedsLibrary('0020 10 1234 5678', 'EG'), false);
  assert.equal(phoneNeedsLibrary('0581234567', 'SA'), true);
});

test('the built-in Egyptian rules agree with libphonenumber over many numbers', () => {
  // A deterministic sweep: every area/mobile prefix with lengths around the right one.
  const prefixes = [];
  for (let first = 1; first <= 9; first += 1) {
    for (let second = 0; second <= 9; second += 1) prefixes.push(`${first}${second}`);
  }
  let checked = 0;
  for (const prefix of prefixes) {
    for (const rest of ['', '3', '34', '345', '3456', '34567', '345678', '3456789', '34567890', '345678901']) {
      const national = `${prefix}${rest}${rest ? '0' : ''}`;
      const raw = `0${national}`;
      const phone = libphonenumber.parsePhoneNumberFromString(raw, { defaultCountry: 'EG', extract: false });
      const type = phone?.isValid() ? phone.getType() : undefined;
      const refused = ['TOLL_FREE', 'PREMIUM_RATE', 'SHARED_COST'].includes(type);
      const expected = Boolean(phone?.isValid()) && !refused;
      assert.equal(eg(raw).valid, expected, `0${national} (library says ${phone?.isValid()} / ${type})`);
      checked += 1;
    }
  }
  assert.ok(checked > 800);
});

test('digits typed in any script become Western digits, letters are dropped from the phone as typed', () => {
  assert.equal(toWesternDigits('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'), '01234567890123456789');
  assert.equal(sanitizeWhileTyping('customerPhone', '٠١٠ 1234 abc ٥٦٧٨'), '010 1234  5678');
  assert.equal(sanitizeWhileTyping('customerPhone', '+٢٠'), '+20');
});

test('control and bidi characters never survive; spaces typed mid-sentence do', () => {
  const NUL = String.fromCharCode(0);
  const OVERRIDE = String.fromCharCode(0x202e);
  assert.equal(sanitizeWhileTyping('customerName', `Sara${NUL} ${OVERRIDE}Ali `), 'Sara Ali ');
  assert.equal(cleanCheckoutValue('customerName', `  Sara   ${NUL}Ali  `), 'Sara Ali');
  assert.equal(cleanCheckoutValue('deliveryAddress', 'a\nb\tc'), 'a b c');
  assert.equal(cleanCheckoutValue('customerNotes', ' no onions\r\n\r\n\r\n\r\nthanks '), 'no onions\n\nthanks');
  assert.equal(sanitizeWhileTyping('customerNotes', 'a\nb'), 'a\nb');
});

const context = { country: 'EG', delivery: false, library: null };
const filled = {
  customerName: 'Sara Ali',
  customerPhone: '010 1234 5678',
  customerNotes: '',
  deliveryAddress: '',
  deliveryBuilding: '',
  deliveryFloor: '',
  deliveryApartment: '',
  deliveryLandmark: '',
};

test('a complete pickup form has no issues', () => {
  assert.deepEqual(validateCheckoutFields(filled, context), {});
});

test('the phone "548" and an empty name are refused on pickup', () => {
  assert.deepEqual(validateCheckoutFields({ ...filled, customerName: '  ', customerPhone: '548' }, context), {
    customerName: 'required',
    customerPhone: 'invalidPhone',
  });
  assert.deepEqual(validateCheckoutFields({ ...filled, customerPhone: '' }, context), {
    customerPhone: 'required',
  });
});

test('name rules: length, a letter, limits', () => {
  assert.deepEqual(validateCheckoutFields({ ...filled, customerName: 'S' }, context), { customerName: 'tooShort' });
  assert.deepEqual(validateCheckoutFields({ ...filled, customerName: '12345' }, context), {
    customerName: 'needsLetter',
  });
  assert.deepEqual(validateCheckoutFields({ ...filled, customerName: 'x'.repeat(101) }, context), {
    customerName: 'tooLong',
  });
  assert.deepEqual(validateCheckoutFields({ ...filled, customerName: 'سارة علي' }, context), {});
});

test('delivery requires an address with a letter; the parts and notes only have limits; pickup ignores delivery text', () => {
  const delivery = { ...context, delivery: true };
  assert.deepEqual(validateCheckoutFields(filled, delivery), { deliveryAddress: 'required' });
  const withAddress = { ...filled, deliveryAddress: '12 University St' };
  assert.deepEqual(validateCheckoutFields(withAddress, delivery), {});
  assert.deepEqual(validateCheckoutFields({ ...withAddress, deliveryAddress: '12' }, delivery), {
    deliveryAddress: 'tooShort',
  });
  assert.deepEqual(validateCheckoutFields({ ...withAddress, deliveryAddress: '12345 / 6' }, delivery), {
    deliveryAddress: 'needsLetter',
  });
  assert.deepEqual(
    validateCheckoutFields(
      {
        ...withAddress,
        deliveryBuilding: 'x'.repeat(51),
        deliveryFloor: 'x'.repeat(31),
        deliveryApartment: 'x'.repeat(31),
        deliveryLandmark: 'x'.repeat(151),
        customerNotes: 'x'.repeat(501),
      },
      delivery,
    ),
    {
      deliveryBuilding: 'tooLong',
      deliveryFloor: 'tooLong',
      deliveryApartment: 'tooLong',
      deliveryLandmark: 'tooLong',
      customerNotes: 'tooLong',
    },
  );
  // A pickup order does not judge (or send) delivery text typed before switching back.
  assert.deepEqual(validateCheckoutFields({ ...filled, deliveryBuilding: 'x'.repeat(99) }, context), {});
});

test('the submitted values are cleaned, the phone is E.164 and pickup carries no delivery text', () => {
  const values = {
    ...filled,
    customerName: '  Sara   Ali ',
    customerPhone: '٠١٠ ١٢٣٤ ٥٦٧٨',
    deliveryAddress: '12 University St',
    deliveryLandmark: 'near the library',
  };
  assert.deepEqual(checkoutValuesForSubmit(values, { ...context, delivery: true }), {
    customerName: 'Sara Ali',
    customerPhone: '+201012345678',
    customerNotes: '',
    deliveryAddress: '12 University St',
    deliveryBuilding: '',
    deliveryFloor: '',
    deliveryApartment: '',
    deliveryLandmark: 'near the library',
  });
  const pickup = checkoutValuesForSubmit(values, context);
  assert.equal(pickup.deliveryAddress, '');
  assert.equal(pickup.deliveryLandmark, '');
});

test('API field codes map to issues, unknown codes to a generic one (never parsed from English)', () => {
  assert.equal(issueFromApiCode('INVALID_PHONE'), 'invalidPhone');
  assert.equal(issueFromApiCode('TOO_SHORT'), 'tooShort');
  assert.equal(issueFromApiCode('TOO_LONG'), 'tooLong');
  assert.equal(issueFromApiCode('MUST_CONTAIN_LETTER'), 'needsLetter');
  assert.equal(issueFromApiCode('REQUIRED'), 'required');
  assert.equal(issueFromApiCode('INVALID_VALUE'), 'invalid');
});
