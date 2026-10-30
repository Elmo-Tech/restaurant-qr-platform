import test from 'node:test';
import assert from 'node:assert/strict';
import { focusInvalidFormField } from './focus-invalid-field.ts';

function fakeInput(id, disabled = false) {
  return {
    id, disabled,
    focusOptions: null, scrollOptions: null,
    focus(options) { this.focusOptions = options; },
    scrollIntoView(options) { this.scrollOptions = options; },
  };
}

test('validation focus targets only the invalid control in the specified form', () => {
  const other = fakeInput('contact-phone');
  const bad = fakeInput('contact-whatsapp');
  const form = { querySelectorAll: () => [other, bad] };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  assert.equal(focusInvalidFormField(form, 'contact-whatsapp'), true);
  assert.deepEqual(bad.focusOptions, { preventScroll: true });
  assert.deepEqual(bad.scrollOptions, { block: 'center', behavior: 'smooth' });
  assert.equal(other.focusOptions, null);
});

test('focus honors reduced-motion preference and skips missing or disabled controls', () => {
  const bad = fakeInput('restaurant-name');
  const form = { querySelectorAll: () => [bad] };
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  assert.equal(focusInvalidFormField(form, 'restaurant-name'), true);
  assert.equal(bad.scrollOptions.behavior, 'auto');
  assert.equal(focusInvalidFormField(form, 'contact-whatsapp'), false);
  bad.disabled = true;
  assert.equal(focusInvalidFormField(form, 'restaurant-name'), false);
  assert.equal(focusInvalidFormField(null, 'restaurant-name'), false);
});
