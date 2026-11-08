import { Prisma } from '../generated/prisma/client';
import {
  offerChoiceModifiers,
  offerLineKey,
  resolveOfferChoices,
  type OrderableOffer,
} from './offer-order';

const d = (value: string) => new Prisma.Decimal(value);

/** "Breakfast meal": ful / taameya / liver(+10), plus free fries. */
const BREAKFAST: OrderableOffer = {
  id: 'offer-breakfast',
  price: d('35.00'),
  nameSnapshot: 'وجبة الفطار',
  slots: [
    {
      id: 'slot-sandwich',
      kind: 'SINGLE',
      requiredCount: 1,
      displayOrder: 0,
      titleSnapshot: 'اختار الساندويتش',
      options: [
        { id: 'opt-ful', displayOrder: 0, nameSnapshot: 'فول', priceAdjustment: d('0.00') },
        { id: 'opt-taameya', displayOrder: 1, nameSnapshot: 'طعمية', priceAdjustment: d('0.00') },
        { id: 'opt-liver', displayOrder: 2, nameSnapshot: 'كبدة', priceAdjustment: d('10.00') },
      ],
    },
    {
      id: 'slot-gift',
      kind: 'FIXED',
      requiredCount: 0,
      displayOrder: 1,
      titleSnapshot: 'هدية العرض',
      options: [{ id: 'opt-fries', displayOrder: 0, nameSnapshot: 'بطاطس هدية', priceAdjustment: d('0.00') }],
    },
  ],
};

/** "Family box": 3 sandwiches out of 6, with cheese +5 and liver +10, and a drink. */
const BOX: OrderableOffer = {
  id: 'offer-box',
  price: d('120.00'),
  nameSnapshot: 'بوكس العيلة',
  slots: [
    {
      id: 'slot-three',
      kind: 'MULTI',
      requiredCount: 3,
      displayOrder: 0,
      titleSnapshot: 'اختار ٣ ساندويتشات',
      options: [
        { id: 'o-ful', displayOrder: 0, nameSnapshot: 'فول', priceAdjustment: d('0.00') },
        { id: 'o-taameya', displayOrder: 1, nameSnapshot: 'طعمية', priceAdjustment: d('0.00') },
        { id: 'o-cheese', displayOrder: 2, nameSnapshot: 'جبنة رومي', priceAdjustment: d('5.00') },
        { id: 'o-liver', displayOrder: 3, nameSnapshot: 'كبدة', priceAdjustment: d('10.00') },
      ],
    },
    {
      id: 'slot-drink',
      kind: 'SINGLE',
      requiredCount: 1,
      displayOrder: 1,
      titleSnapshot: 'اختار المشروب',
      options: [
        { id: 'd-pepsi', displayOrder: 0, nameSnapshot: 'بيبسي', priceAdjustment: d('0.00') },
        { id: 'd-juice', displayOrder: 1, nameSnapshot: 'عصير', priceAdjustment: d('5.00') },
      ],
    },
  ],
};

describe('resolveOfferChoices (DEC-069)', () => {
  it('prices a free choice at the fixed offer price and adds the included gift', () => {
    const result = resolveOfferChoices(BREAKFAST, [
      { slotId: 'slot-sandwich', optionId: 'opt-ful', quantity: 1 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unitTotal.toFixed(2)).toBe('35.00');
    expect(result.extrasTotal.toFixed(2)).toBe('0.00');
    expect(result.choices.map((c) => [c.slotTitleSnapshot, c.optionNameSnapshot, c.included])).toEqual([
      ['اختار الساندويتش', 'فول', false],
      ['هدية العرض', 'بطاطس هدية', true],
    ]);
  });

  it('adds the paid adjustment of the chosen option on top of the offer price', () => {
    const result = resolveOfferChoices(BREAKFAST, [
      { slotId: 'slot-sandwich', optionId: 'opt-liver', quantity: 1 },
    ]);
    expect(result.ok && result.unitTotal.toFixed(2)).toBe('45.00');
  });

  it('prices a MULTI slot by adjustment x quantity, exactly (no floating point)', () => {
    const result = resolveOfferChoices(BOX, [
      { slotId: 'slot-three', optionId: 'o-taameya', quantity: 2 },
      { slotId: 'slot-three', optionId: 'o-cheese', quantity: 1 },
      { slotId: 'slot-drink', optionId: 'd-juice', quantity: 1 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extrasTotal.toFixed(2)).toBe('10.00'); // 5 + 5
    expect(result.unitTotal.toFixed(2)).toBe('130.00');
  });

  it('keeps cents exact: 0.1 + 0.2 style sums never drift', () => {
    const offer: OrderableOffer = {
      ...BOX,
      price: d('10.10'),
      slots: [
        {
          ...BOX.slots[0],
          options: BOX.slots[0].options.map((o) => ({ ...o, priceAdjustment: d('0.10') })),
        },
      ],
    };
    const result = resolveOfferChoices(offer, [
      { slotId: 'slot-three', optionId: 'o-ful', quantity: 2 },
      { slotId: 'slot-three', optionId: 'o-cheese', quantity: 1 },
    ]);
    expect(result.ok && result.unitTotal.toFixed(2)).toBe('10.40');
  });

  it('refuses an incomplete SINGLE slot, an incomplete MULTI slot and an over-filled one', () => {
    expect(resolveOfferChoices(BREAKFAST, [])).toEqual({ ok: false, problem: 'SLOT_INCOMPLETE' });
    expect(
      resolveOfferChoices(BOX, [
        { slotId: 'slot-three', optionId: 'o-ful', quantity: 2 },
        { slotId: 'slot-drink', optionId: 'd-pepsi', quantity: 1 },
      ]),
    ).toEqual({ ok: false, problem: 'SLOT_INCOMPLETE' });
    expect(
      resolveOfferChoices(BOX, [
        { slotId: 'slot-three', optionId: 'o-ful', quantity: 4 },
        { slotId: 'slot-drink', optionId: 'd-pepsi', quantity: 1 },
      ]),
    ).toEqual({ ok: false, problem: 'SLOT_OVERFILLED' });
    expect(
      resolveOfferChoices(BREAKFAST, [
        { slotId: 'slot-sandwich', optionId: 'opt-ful', quantity: 1 },
        { slotId: 'slot-sandwich', optionId: 'opt-taameya', quantity: 1 },
      ]),
    ).toEqual({ ok: false, problem: 'SLOT_OVERFILLED' });
  });

  it('refuses a slot or an option that is not part of THIS offer (also another offer\'s ids)', () => {
    expect(
      resolveOfferChoices(BREAKFAST, [{ slotId: 'slot-three', optionId: 'o-ful', quantity: 1 }]),
    ).toEqual({ ok: false, problem: 'UNKNOWN_SLOT' });
    expect(
      resolveOfferChoices(BREAKFAST, [{ slotId: 'slot-sandwich', optionId: 'o-ful', quantity: 1 }]),
    ).toEqual({ ok: false, problem: 'UNKNOWN_OPTION' });
    // an option of another slot of the same offer
    expect(
      resolveOfferChoices(BOX, [{ slotId: 'slot-drink', optionId: 'o-ful', quantity: 1 }]),
    ).toEqual({ ok: false, problem: 'UNKNOWN_OPTION' });
  });

  it('refuses a choice for the included (FIXED) slot, a repeated option and a bad quantity', () => {
    expect(
      resolveOfferChoices(BREAKFAST, [
        { slotId: 'slot-sandwich', optionId: 'opt-ful', quantity: 1 },
        { slotId: 'slot-gift', optionId: 'opt-fries', quantity: 1 },
      ]),
    ).toEqual({ ok: false, problem: 'FIXED_HAS_CHOICE' });
    expect(
      resolveOfferChoices(BOX, [
        { slotId: 'slot-three', optionId: 'o-ful', quantity: 1 },
        { slotId: 'slot-three', optionId: 'o-ful', quantity: 2 },
      ]),
    ).toEqual({ ok: false, problem: 'DUPLICATE_OPTION' });
    for (const quantity of [0, -1, 1.5, 21]) {
      expect(
        resolveOfferChoices(BOX, [{ slotId: 'slot-three', optionId: 'o-ful', quantity }]),
      ).toEqual({ ok: false, problem: 'BAD_QUANTITY' });
    }
  });

  it('accepts an offer that is only an included gift (nothing to choose)', () => {
    const friday: OrderableOffer = {
      id: 'offer-friday',
      price: d('25.00'),
      nameSnapshot: 'عرض الجمعة',
      slots: [
        {
          id: 's',
          kind: 'FIXED',
          requiredCount: 0,
          displayOrder: 0,
          titleSnapshot: 'العرض',
          options: [
            { id: 'a', displayOrder: 0, nameSnapshot: '٢ طعمية', priceAdjustment: d('0') },
            { id: 'b', displayOrder: 1, nameSnapshot: 'سلطة هدية', priceAdjustment: d('0') },
          ],
        },
      ],
    };
    const result = resolveOfferChoices(friday, []);
    expect(result.ok && result.unitTotal.toFixed(2)).toBe('25.00');
    expect(result.ok && result.choices).toHaveLength(2);
  });

  it('gives the same line key whatever order the choices arrive in', () => {
    const a = offerLineKey('o', [
      { slotId: 's', optionId: '1', quantity: 1 },
      { slotId: 's', optionId: '2', quantity: 2 },
    ]);
    const b = offerLineKey('o', [
      { slotId: 's', optionId: '2', quantity: 2 },
      { slotId: 's', optionId: '1', quantity: 1 },
    ]);
    const c = offerLineKey('o', [{ slotId: 's', optionId: '1', quantity: 1 }]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('offerChoiceModifiers (the shape every order reader renders)', () => {
  it('projects slot -> group, choice -> option, adjustment x quantity -> price', () => {
    const modifiers = offerChoiceModifiers([
      {
        slotTitleSnapshot: 'اختار ٣',
        optionNameSnapshot: 'جبنة رومي',
        priceAdjustmentSnapshot: d('5.00'),
        quantity: 2,
        displayOrder: 1,
      },
      {
        slotTitleSnapshot: 'اختار ٣',
        optionNameSnapshot: 'فول',
        priceAdjustmentSnapshot: d('0.00'),
        quantity: 1,
        displayOrder: 0,
      },
    ]);
    expect(modifiers).toEqual([
      { groupName: 'اختار ٣', optionName: 'فول', priceAdjustment: '0.00' },
      { groupName: 'اختار ٣', optionName: '2× جبنة رومي', priceAdjustment: '10.00' },
    ]);
  });
});
