import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  firstMissingSlot,
  isSlotComplete,
  listToPicks,
  offerCartKey,
  offerRunsOnDay,
  offerUnitPrice,
  picksToList,
  resolveOfferLine,
} from './offers.ts';

const breakfast = {
  id: 'o1',
  name: 'Breakfast',
  description: null,
  price: '35.00',
  badge: 'GIFT',
  imageAssetPath: null,
  daysOfWeek: [],
  startsOn: null,
  endsOn: null,
  availableToday: true,
  slots: [
    {
      id: 's1',
      kind: 'SINGLE',
      requiredCount: 1,
      title: 'Sandwich',
      options: [
        { id: 'ful', name: 'Ful', priceAdjustment: '0.00' },
        { id: 'liver', name: 'Liver', priceAdjustment: '10.00' },
      ],
    },
    { id: 's2', kind: 'FIXED', requiredCount: 0, title: 'Gift', options: [{ id: 'fries', name: 'Fries', priceAdjustment: '0.00' }] },
  ],
};

const box = {
  ...breakfast,
  id: 'o2',
  name: 'Box',
  price: '120.00',
  slots: [
    {
      id: 'm1',
      kind: 'MULTI',
      requiredCount: 3,
      title: 'Pick 3',
      options: [
        { id: 'a', name: 'A', priceAdjustment: '0.00' },
        { id: 'b', name: 'B', priceAdjustment: '5.00' },
      ],
    },
  ],
};

test('a SINGLE slot is complete with exactly one pick, a FIXED slot always', () => {
  assert.equal(isSlotComplete(breakfast.slots[1], {}), true);
  assert.equal(isSlotComplete(breakfast.slots[0], {}), false);
  assert.equal(isSlotComplete(breakfast.slots[0], { s1: { ful: 1 } }), true);
  assert.equal(firstMissingSlot(breakfast, {})?.id, 's1');
  assert.equal(firstMissingSlot(breakfast, { s1: { ful: 1 } }), null);
});

test('a MULTI slot needs exactly its count, repeats allowed', () => {
  assert.equal(isSlotComplete(box.slots[0], { m1: { a: 2 } }), false);
  assert.equal(isSlotComplete(box.slots[0], { m1: { a: 2, b: 1 } }), true);
  assert.equal(isSlotComplete(box.slots[0], { m1: { a: 4 } }), false);
});

test('the displayed price is the offer price plus paid adjustments, exact', () => {
  assert.equal(offerUnitPrice(breakfast, { s1: { ful: 1 } }), '35.00');
  assert.equal(offerUnitPrice(breakfast, { s1: { liver: 1 } }), '45.00');
  assert.equal(offerUnitPrice(box, { m1: { a: 1, b: 2 } }), '130.00');
  const cents = { ...box, price: '10.10', slots: [{ ...box.slots[0], options: [{ id: 'a', name: 'A', priceAdjustment: '0.10' }] }] };
  assert.equal(offerUnitPrice(cents, { m1: { a: 3 } }), '10.40');
});

test('picks round-trip through the identity list (FIXED slots never appear) and the cart key ignores order', () => {
  const list = picksToList(breakfast, { s1: { liver: 1 }, s2: { fries: 1 } });
  assert.deepEqual(list, [{ slotId: 's1', optionId: 'liver', quantity: 1 }]);
  assert.deepEqual(listToPicks(list), { s1: { liver: 1 } });
  const one = offerCartKey('o2', [{ slotId: 'm1', optionId: 'a', quantity: 1 }, { slotId: 'm1', optionId: 'b', quantity: 2 }]);
  const two = offerCartKey('o2', [{ slotId: 'm1', optionId: 'b', quantity: 2 }, { slotId: 'm1', optionId: 'a', quantity: 1 }]);
  assert.equal(one, two);
});

test('a stored cart line is re-resolved against the current menu', () => {
  const extra = (a) => `+${a}`;
  const ok = resolveOfferLine([breakfast], { offerId: 'o1', choices: [{ slotId: 's1', optionId: 'liver', quantity: 1 }] }, extra);
  assert.equal(ok?.problem, null);
  assert.equal(ok?.unitPrice, '45.00');
  assert.deepEqual(ok?.rows.map((r) => [r.title, r.value, r.included]), [
    ['Sandwich', 'Liver (+10.00)', false],
    ['Gift', 'Fries', true],
  ]);
  // the option vanished from the offer: the line is kept, flagged CHANGED
  assert.equal(resolveOfferLine([breakfast], { offerId: 'o1', choices: [{ slotId: 's1', optionId: 'gone', quantity: 1 }] }, extra)?.problem, 'CHANGED');
  // incomplete choices are CHANGED too
  assert.equal(resolveOfferLine([breakfast], { offerId: 'o1', choices: [] }, extra)?.problem, 'CHANGED');
  // not valid today
  assert.equal(resolveOfferLine([{ ...breakfast, availableToday: false }], { offerId: 'o1', choices: [{ slotId: 's1', optionId: 'ful', quantity: 1 }] }, extra)?.problem, 'UNAVAILABLE');
  // the offer is gone from the menu
  assert.equal(resolveOfferLine([], { offerId: 'o1', choices: [] }, extra), null);
});

test('an included item can bring several units, and a sold-out offer is blocked', () => {
  const extra = (a) => `+${a}`;
  const pack = {
    ...breakfast,
    id: 'p1',
    slots: [
      {
        id: 'inc',
        kind: 'FIXED',
        requiredCount: 0,
        title: 'Included',
        options: [
          { id: 'a', name: 'Taameya', priceAdjustment: '0.00', quantity: 2 },
          { id: 'b', name: 'Fries', priceAdjustment: '0.00', quantity: 1 },
        ],
      },
    ],
  };
  const line = resolveOfferLine([pack], { offerId: 'p1', choices: [] }, extra, '، ');
  assert.equal(line?.problem, null, 'a package with nothing to choose is ready as it is');
  assert.equal(line?.rows[0].value, '2× Taameya، Fries');
  assert.equal(offerUnitPrice(pack, {}), '35.00');
  assert.equal(firstMissingSlot(pack, {}), null);
  assert.equal(resolveOfferLine([{ ...pack, soldOut: true }], { offerId: 'p1', choices: [] }, extra)?.problem, 'UNAVAILABLE');
});

test('weekdays: empty means every day', () => {
  assert.equal(offerRunsOnDay({ daysOfWeek: [] }, 3), true);
  assert.equal(offerRunsOnDay({ daysOfWeek: [5] }, 5), true);
  assert.equal(offerRunsOnDay({ daysOfWeek: [5] }, 4), false);
});

// ---- contract: every renderer shows the shared strip + chip, the cart and overlays are shared ----
const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const view = read('app/q/[publicCode]/PublicMenuView.tsx');

test('the shared offers strip, choice sheet and cart wiring live once in PublicMenuView', () => {
  assert.ok(view.includes('<OffersStrip'));
  assert.ok(view.includes('<OfferSheet'));
  assert.ok(view.includes('showFeatured = featuredProducts.length > 0 && !isSearching && !hasOffers'), 'offers replace the featured strip');
  assert.ok(view.includes("{ id: OFFERS_SECTION_ID, name: offersCopy.sectionTitle, imageUrl: null, isOffers: true }"), 'first chip');
  assert.ok((view.match(/offers=\{designOffers\}/g) ?? []).length === 4, 'all four exclusive designs receive the offers');
});

for (const [name, path, chipClass] of [
  ['VERDE', 'app/q/[publicCode]/verde/VerdeMenu.tsx', 'v-offers'],
  ['El Sherbiny', 'app/q/[publicCode]/sherbiny/SherbinyMenu.tsx', 's-offers'],
  ['Makkboz', 'app/q/[publicCode]/makkboz/MakkbozMenu.tsx', 'm-offers'],
  ['Meat Lovers', 'app/q/[publicCode]/meat-lovers/MeatLoversMenu.tsx', 'ml-offers'],
]) {
  test(`${name} renders the shared strip and the first Offers chip`, () => {
    const source = read(path);
    assert.ok(source.includes(`${chipClass}`));
    assert.ok(source.includes('offers.strip'));
    assert.ok(source.includes('data-offers-chip'));
    assert.ok(source.includes('offers.onJump'));
  });
}

test('the order API client sends offer lines as identities only', () => {
  const api = read('lib/public-menu/orders-api.ts');
  assert.ok(api.includes('offerChoices'));
  assert.ok(api.includes("'OFFER_UNAVAILABLE'") && api.includes("'OFFER_CHANGED'"));
  assert.ok(!/priceAdjustment|price:/.test(api.split('SubmitGuestOrderItem')[1].split('}')[0]), 'no price in the item');
});
