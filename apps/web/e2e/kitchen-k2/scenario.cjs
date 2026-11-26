/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS test fixture. */
'use strict';
const { ticket, BRANCH_MAIN } = require('./stub-api.cjs');

/**
 * A busy board with everything K2 cares about: stages with several tickets, delayed and very-late tickets,
 * a ticket accepted long after it was created (so createdAt order differs from stage order), a tie, sizes,
 * grouped modifiers, a Guest note, Dine-In round 2, Pickup and Delivery. Product text is restaurant content,
 * so the Arabic dataset uses Arabic names (mixed with a Latin brand name, as real menus do).
 */
const COPY = {
  en: {
    pizza: 'Margherita Pizza', large: 'Large', cola: 'Cola', burger: 'Smash Burger', regular: 'Regular',
    fries: 'Loaded Fries', salad: 'Greek Salad', shawarma: 'Chicken Shawarma Wrap',
    extras: 'Extras', remove: 'Remove', sauce: 'Sauce', side: 'Side',
    cheese: 'Extra cheese', mushrooms: 'Mushrooms', onions: 'No onions', pickles: 'No pickles', garlic: 'Garlic sauce', spicy: 'Spicy mayo',
    coleslaw: 'Coleslaw',
    note: 'Allergy: no sesame. Please cut the pizza into 8 slices.', omar: 'Omar K.', sara: 'Sara',
  },
  ar: {
    pizza: 'بيتزا مارجريتا', large: 'كبير', cola: 'كولا', burger: 'سماش برجر', regular: 'وسط',
    fries: 'بطاطس محمّرة بالجبنة', salad: 'سلطة يونانية', shawarma: 'ساندويتش شاورما دجاج',
    extras: 'الإضافات', remove: 'بدون', sauce: 'الصوص', side: 'الجانبي',
    cheese: 'جبنة زيادة', mushrooms: 'مشروم', onions: 'بدون بصل', pickles: 'بدون مخلل', garlic: 'صوص ثوم', spicy: 'مايونيز حار',
    coleslaw: 'كولسلو',
    note: 'حساسية: بدون سمسم. من فضلك قطّع البيتزا 8 شرائح.', omar: 'عمر ك.', sara: 'سارة',
  },
};

function boardTickets(locale) {
  const c = COPY[locale];
  const pizza = {
    name: c.pizza, variantName: c.large, quantity: 2,
    modifiers: [
      { groupName: c.extras, optionName: c.cheese }, { groupName: c.remove, optionName: c.onions },
      { groupName: c.extras, optionName: c.mushrooms },
    ],
  };
  const cola = { name: c.cola, variantName: null, quantity: 3, modifiers: [] };
  const burger = {
    name: c.burger, variantName: c.regular, quantity: 1,
    modifiers: [{ groupName: c.remove, optionName: c.pickles }, { groupName: c.sauce, optionName: c.spicy }],
  };
  return [
    // NEW. Created first but accepted last: stage order differs from creation order (what the API sorts by).
    ticket({ id: 'a-newest-stage', status: 'ACCEPTED', type: 'DELIVERY', customerName: c.sara, stageMinutes: 3, createdMinutes: 70, items: [{ name: c.shawarma, variantName: null, quantity: 2, modifiers: [{ groupName: c.sauce, optionName: c.garlic }] }] }),
    ticket({ id: 'b-late', status: 'ACCEPTED', type: 'DINE_IN', roundNumber: 2, table: { id: 't7', tableNumber: '7' }, notes: c.note, stageMinutes: 26, createdMinutes: 30, items: [pizza, cola] }),
    ticket({ id: 'c-tie-1', status: 'ACCEPTED', type: 'PICKUP', customerName: c.omar, stageMinutes: 12, createdMinutes: 12, items: [burger] }),
    ticket({ id: 'd-tie-2', status: 'ACCEPTED', type: 'DINE_IN', table: { id: 't3', tableNumber: '3' }, stageMinutes: 12, createdMinutes: 13, items: [{ name: c.salad, variantName: null, quantity: 1, modifiers: [] }] }),
    // PREPARING
    ticket({ id: 'e-prep-slow', status: 'PREPARING', type: 'DINE_IN', table: { id: 't12', tableNumber: '12' }, stageMinutes: 22, createdMinutes: 40, items: [burger, { name: c.fries, variantName: null, quantity: 2, modifiers: [{ groupName: c.side, optionName: c.coleslaw }] }] }),
    ticket({ id: 'f-prep-new', status: 'PREPARING', type: 'PICKUP', customerName: c.omar, stageMinutes: 6, createdMinutes: 18, items: [cola] }),
    // READY (waiting for service; never flagged as delayed, never offers SERVED)
    ticket({ id: 'g-ready', status: 'READY', type: 'DINE_IN', table: { id: 't5', tableNumber: '5' }, stageMinutes: 15, createdMinutes: 45, items: [{ name: c.fries, variantName: null, quantity: 1, modifiers: [] }] }),
  ];
}

module.exports = { boardTickets, COPY, BRANCH_MAIN };
