import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { checkoutIssueMessage } from './checkout-issue-copy.ts';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const sections = read('app/q/[publicCode]/CheckoutSections.tsx');
const menuView = read('app/q/[publicCode]/PublicMenuView.tsx');
const ordersApi = read('lib/public-menu/orders-api.ts');
const hook = read('app/q/[publicCode]/useCheckoutValidation.ts');

const FIELDS = [
  'customerName',
  'customerPhone',
  'customerNotes',
  'deliveryAddress',
  'deliveryBuilding',
  'deliveryFloor',
  'deliveryApartment',
  'deliveryLandmark',
];
const ISSUES = ['required', 'tooShort', 'tooLong', 'invalidPhone', 'needsLetter', 'invalid'];
const ARABIC = /[؀-ۿ]/;

test('every checkout problem has a sentence in Arabic and in English, never a raw code', () => {
  for (const field of FIELDS) {
    for (const issue of ISSUES) {
      for (const egyptianPhone of [true, false]) {
        const ar = checkoutIssueMessage('ar', field, issue, { egyptianPhone, max: 100 });
        const en = checkoutIssueMessage('en', field, issue, { egyptianPhone, max: 100 });
        assert.ok(ar.length > 5 && ARABIC.test(ar), `${field}/${issue} Arabic: ${ar}`);
        assert.ok(en.length > 5 && !ARABIC.test(en), `${field}/${issue} English: ${en}`);
        for (const text of [ar, en]) {
          assert.ok(!/INVALID_|TOO_|REQUIRED|VALIDATION|tooShort|tooLong|invalidPhone|needsLetter/.test(text), text);
        }
      }
    }
  }
});

test('the phone message names the 11-digit Egyptian format only when the Restaurant is Egyptian', () => {
  const egyptian = checkoutIssueMessage('en', 'customerPhone', 'invalidPhone', { egyptianPhone: true, max: 30 });
  const other = checkoutIssueMessage('en', 'customerPhone', 'invalidPhone', { egyptianPhone: false, max: 30 });
  assert.match(egyptian, /01012345678/);
  assert.doesNotMatch(other, /01012345678/);
  assert.match(other, /\+/);
  assert.match(checkoutIssueMessage('ar', 'customerPhone', 'invalidPhone', { egyptianPhone: true, max: 30 }), /01012345678/);
});

test('the "too long" sentence names the field limit', () => {
  assert.match(checkoutIssueMessage('en', 'deliveryLandmark', 'tooLong', { egyptianPhone: true, max: 150 }), /150/);
  assert.match(checkoutIssueMessage('ar', 'deliveryLandmark', 'tooLong', { egyptianPhone: true, max: 150 }), /150/);
});

test('each field shows its message accessibly: aria-invalid, aria-describedby, a live region, no layout jump', () => {
  assert.ok(sections.includes('aria-invalid={error ? true : undefined}'));
  assert.ok(sections.includes('aria-describedby={error ? `${id}-error` : undefined}'));
  assert.ok(sections.includes('aria-live="polite"'));
  // The row opens by animating its height; reduced motion removes the animation.
  assert.ok(sections.includes('grid-rows-[0fr]') && sections.includes('grid-rows-[1fr]'));
  assert.ok(sections.includes('motion-reduce:transition-none'));
  // Notes (the textarea) are covered as well.
  assert.ok(sections.includes("aria-describedby={checkout.fieldErrors.customerNotes ? 'checkout-customerNotes-error'"));
  for (const field of FIELDS.filter((name) => name !== 'customerNotes')) {
    assert.ok(sections.includes(`error={fieldErrors.${field}}`), `${field} has no error line`);
  }
  assert.ok(sections.includes('onBlur={() => checkout.onFieldBlur('));
});

test('the phone keeps the telephone keyboard and an LTR value inside the RTL page', () => {
  assert.ok(sections.includes("inputMode={type === 'tel' ? 'tel' : undefined}"));
  assert.match(sections, /fieldKey="customerPhone"[\s\S]*?type="tel"[\s\S]*?ltr/);
  assert.ok(sections.includes("dir={ltr ? 'ltr' : 'auto'}"));
  assert.ok(sections.includes("rtl:text-right"));
  // Limits come from the shared validator, not copied numbers.
  assert.ok(sections.includes('CHECKOUT_LIMITS.customerPhone.max'));
  assert.doesNotMatch(sections, /maxLength=\{\d+\}/);
});

test('a send with a problem is blocked and focused on the first bad field, in both the order and the WhatsApp flows', () => {
  for (const handler of ['handlePlaceOrder', 'handleSendWhatsapp']) {
    const start = menuView.indexOf(`async function ${handler}()`);
    assert.ok(start > 0, handler);
    const body = menuView.slice(start, start + 400);
    const guard = body.indexOf('if (!(await validation.checkBeforeSend())) return;');
    const submitting = body.indexOf('setIsSubmitting(true)');
    assert.ok(guard > 0 && submitting > guard, `${handler} must check the fields before sending anything`);
  }
  assert.ok(hook.includes('document.getElementById(`checkout-${first}`)'));
  assert.ok(hook.includes('setAttempted(true)'));
});

test('the typed fields no longer silently grey the button: only branch, area and minimum do', () => {
  const start = menuView.indexOf('const checkoutDetailsComplete');
  const block = menuView.slice(start, start + 300);
  assert.doesNotMatch(block, /customerPhone|customerName|deliveryAddress/);
});

test('typing is sanitized (digits in any script, no control characters) and the API verdict is shown per field', () => {
  assert.ok(menuView.includes('sanitizeWhileTyping(key, value)'));
  assert.ok(menuView.includes('validation.applyServerIssues(result.fields)'));
  assert.ok(menuView.includes('validation.onFieldEdited(key)'));
});

test('API errors are read by their stable code, never by the English message', () => {
  assert.ok(ordersApi.includes("error.code === 'VALIDATION_ERROR'"));
  assert.ok(ordersApi.includes("outcome: 'invalidFields'"));
  assert.doesNotMatch(ordersApi, /error\.message/);
});

test('one shared checkout serves every template: no other file renders the customer fields', () => {
  const dir = new URL('app/q/[publicCode]/', root);
  const files = [];
  const walk = (path) => {
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx|ts)$/.test(name)) files.push(full);
    }
  };
  walk(dir.pathname.replace(/^\/([A-Za-z]:)/, '$1').replaceAll('%20', ' ').replaceAll('%5B', '[').replaceAll('%5D', ']'));
  const rendering = files.filter((file) => /fieldKey="customerPhone"|name="customerPhone"|id="checkout-customerPhone"/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(
    rendering.map((file) => file.replaceAll('\\', '/').split('/').pop()),
    ['CheckoutSections.tsx'],
  );
});
