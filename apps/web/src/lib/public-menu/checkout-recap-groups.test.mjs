import test from 'node:test';
import assert from 'node:assert/strict';
import { groupCheckoutRecapLines } from './checkout-recap-groups.ts';

const pizza = { id: 'pizza', name: 'بيتزا', order: 0 };
const crepe = { id: 'crepe', name: 'كريب حادق', order: 2 };
const makeLine = (key, name, category, offerId = null) => ({
  lineKey: key, name, category, offerId, quantity: 1, lineTotal: '230.00',
});

test('groups duplicate-name items under their real category in public-menu order', () => {
  const crepeChicken = makeLine('c-1', 'فراخ', crepe);
  const pizzaChicken = makeLine('p-1', 'فراخ', pizza);
  const pizzaTawook = makeLine('p-2', 'شيش طاووق', pizza);
  const cartLines = [crepeChicken, pizzaChicken, pizzaTawook];
  const groups = groupCheckoutRecapLines(cartLines, 'العروض', 'أصنافك');

  assert.deepEqual(groups.map((g) => ({ key: g.key, title: g.title })), [
    { key: 'category:pizza', title: 'بيتزا' },
    { key: 'category:crepe', title: 'كريب حادق' },
  ]);
  assert.deepEqual(groups[0].lines, [pizzaChicken, pizzaTawook]);
  assert.deepEqual(groups[1].lines, [crepeChicken]);
  assert.deepEqual(cartLines, [crepeChicken, pizzaChicken, pizzaTawook],
    'the order/cart remains untouched: grouping is presentation only');
  assert.equal(groups[0].lines[0].lineTotal, '230.00');
});

test('shows offers first, while keeping category labels localized and each offer intact', () => {
  const pizzaLine = makeLine('pizza-2', 'فراخ', pizza);
  const offerLine = { ...makeLine('offer-1', 'وجبة الفطار', null, 'offer-id'), offerRows: ['هدية'] };
  const groups = groupCheckoutRecapLines([pizzaLine, offerLine], 'العروض', 'أصنافك');
  assert.deepEqual(groups.map((g) => g.title), ['العروض', 'بيتزا']);
  assert.equal(groups[0].lines[0], offerLine);
  assert.deepEqual(groups[0].lines[0].offerRows, ['هدية']);
  assert.deepEqual(groupCheckoutRecapLines([offerLine], 'Offers', 'Your items').map((g) => g.title), ['Offers']);
});

test('keeps categories with the same visible name separate by category id', () => {
  const first = makeLine('one', 'فراخ', { id: 'cat-a', name: 'فراخ', order: 3 });
  const second = makeLine('two', 'فراخ', { id: 'cat-b', name: 'فراخ', order: 1 });
  const groups = groupCheckoutRecapLines([first, second], 'العروض', 'أصنافك');
  assert.deepEqual(groups.map((g) => g.key), ['category:cat-b', 'category:cat-a']);
  assert.equal(groups[0].lines[0], second);
  assert.equal(groups[1].lines[0], first);
});

test('handles empty cart and unavailable menu category without inventing a category', () => {
  assert.deepEqual(groupCheckoutRecapLines([], 'العروض', 'أصنافك'), []);
  const noCategory = makeLine('missing', 'منتج', null);
  const grouped = groupCheckoutRecapLines([noCategory], 'العروض', 'أصنافك');
  assert.equal(grouped[0].title, 'أصنافك');
  assert.deepEqual(grouped[0].lines, [noCategory]);
});
