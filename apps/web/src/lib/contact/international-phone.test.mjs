import assert from 'node:assert/strict';
import test from 'node:test';
import {
  asciiPhoneDigits,
  changePhoneDraftCountry,
  countryOptionsForLocale,
  editPhoneDraft,
  normalizePhoneDraft,
  phoneDraftFromStored,
} from './international-phone.ts';

test('Egypt is the default and local Egyptian mobile numbers save in E.164', () => {
  const blank = phoneDraftFromStored(null);
  assert.equal(blank.country, 'EG');
  const edited = editPhoneDraft(blank, '010 1217 5532');
  assert.deepEqual(normalizePhoneDraft(edited), { valid: true, value: '+201012175532' });
  assert.deepEqual(normalizePhoneDraft(editPhoneDraft(blank, '٠١٠١٢١٧٥٥٣٢')),
    { valid: true, value: '+201012175532' });
});

test('pasting a full international phone number selects its country and never duplicates code', () => {
  const fromEgypt = phoneDraftFromStored('');
  const pasted = editPhoneDraft(fromEgypt, '+44 7911 123456');
  assert.equal(pasted.country, 'GB');
  assert.deepEqual(normalizePhoneDraft(pasted), { valid: true, value: '+447911123456' });
  const again = editPhoneDraft(pasted, '+44 7911 123456');
  assert.deepEqual(normalizePhoneDraft(again), { valid: true, value: '+447911123456' });
});

test('stored international numbers reopen with the correct country and national format', () => {
  const draft = phoneDraftFromStored('+966501234567');
  assert.equal(draft.country, 'SA');
  assert.equal(draft.edited, false);
  assert.deepEqual(normalizePhoneDraft(draft), { valid: true, value: '+966501234567' });
});

test('existing national-only or invalid legacy numbers are not silently edited on load', () => {
  const legacy = phoneDraftFromStored('01012345678');
  assert.equal(legacy.edited, false);
  assert.equal(legacy.country, 'EG');
  assert.equal(legacy.national, '01012345678');
  assert.deepEqual(normalizePhoneDraft(editPhoneDraft(legacy, legacy.national)),
    { valid: true, value: '+201012345678' });
  const odd = phoneDraftFromStored('1234567');
  assert.equal(odd.edited, false);
  assert.equal(odd.national, '1234567');
});

test('reject malformed/short numbers rather than sending an invalid WhatsApp address', () => {
  const base = phoneDraftFromStored('');
  for (const raw of ['123', 'abc', '010 123', '++201012345678', 'https://wa.me/201012345678']) {
    assert.equal(normalizePhoneDraft(editPhoneDraft(base, raw)).valid, false, raw);
  }
  assert.deepEqual(normalizePhoneDraft(editPhoneDraft(base, '')), { valid: true, value: null });
});

test('changing country affects parsing and picker offers full localized country list', () => {
  const sa = changePhoneDraftCountry(phoneDraftFromStored(''), 'SA');
  assert.equal(sa.edited, true);
  assert.equal(sa.country, 'SA');
  const egyptOptions = countryOptionsForLocale('ar');
  const countryIds = [...egyptOptions.popular, ...egyptOptions.remaining].map(item => item.country);
  assert.equal(new Set(countryIds).size, countryIds.length);
  assert.ok(countryIds.length > 200);
  assert.ok(egyptOptions.popular.some(item => item.country === 'EG' && item.callingCode === '20'));
  assert.ok(egyptOptions.remaining.some(item => item.country === 'FR'));
});

test('Arabic/Persian/full-width digits are normalized without changing phone semantics', () => {
  assert.equal(asciiPhoneDigits('＋٢٠١۰۱۲３４５'), '+201012345');
});
