import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describePromotion, isolateLtr } from './describe.ts';

const fields = (overrides = {}) => ({ scope: 'CART', discountType: 'PERCENTAGE', value: ' 10.00 ', minimumSubtotal: '', minimumQuantity: '', quantityBasis: 'UNITS', ...overrides });

test('empty values are pending, with no invented discount or conditions', () => {
  assert.deepEqual(describePromotion(fields({ value: '  ', minimumSubtotal: '100' }), 'EGP'), [{ key: 'promotions.sentence.pending', params: {} }]);
});

test('every scope and type has bilingual copy and inserts the entered value without calculation', () => {
  const text = readFileSync(new URL('../i18n/messages/promotions.ts', import.meta.url), 'utf8');
  const split = text.indexOf("'promotions.title'", text.indexOf("'promotions.title'") + 1);
  assert.ok(split > 0);
  const [en, ar] = [text.slice(0, split), text.slice(split)];
  for (const scope of ['CATEGORY', 'MENU', 'CART', 'QUANTITY', 'DELIVERY']) {
    for (const discountType of ['PERCENTAGE', 'FIXED_AMOUNT']) {
      const parts = describePromotion(fields({ scope, discountType }), 'EGP');
      assert.equal(parts[0].key, `promotions.sentence.discount.${scope}.${discountType}`);
      assert.equal(parts[0].params.value, isolateLtr(discountType === 'PERCENTAGE' ? '10.00%' : '10.00 EGP'));
      assert.equal(parts.at(-1).key, 'promotions.sentence.competition');
      const needle = `'${parts[0].key}': '`;
      assert.ok(en.includes(needle), `en ${scope} ${discountType}`);
      const line = ar.split('\n').find((entry) => entry.includes(needle));
      assert.ok(line && /[\u0600-\u06FF]/.test(line), `ar ${scope} ${discountType}`);
    }
  }
});

test('only applicable conditions are described, with isolated unmodified values', () => {
  for (const scope of ['CATEGORY', 'MENU']) assert.equal(describePromotion(fields({ scope, minimumSubtotal: '50' }), 'EGP').length, 2);
  for (const scope of ['CART', 'DELIVERY']) {
    const parts = describePromotion(fields({ scope, minimumSubtotal: ' 50.00 ' }), 'EGP');
    assert.deepEqual(parts[1], { key: `promotions.sentence.condition.${scope}`, params: { minimum: '\u206650.00 EGP\u2069' } });
  }
  for (const quantityBasis of ['UNITS', 'DISTINCT_PRODUCTS']) {
    const parts = describePromotion(fields({ scope: 'QUANTITY', minimumQuantity: ' 2 ', quantityBasis, minimumSubtotal: '50' }), 'EGP');
    assert.deepEqual(parts[1], { key: `promotions.sentence.condition.QUANTITY.${quantityBasis}`, params: { quantity: '\u20662\u2069' } });
    assert.deepEqual(parts[2], { key: 'promotions.sentence.condition.QUANTITY.spend', params: { minimum: '\u206650 EGP\u2069' } });
  }
  assert.equal(describePromotion(fields({ scope: 'QUANTITY', minimumQuantity: '', minimumSubtotal: '50' }), 'EGP').length, 2);
  assert.equal(isolateLtr('12 EGP'), '\u206612 EGP\u2069');
});
