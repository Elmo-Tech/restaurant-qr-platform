/* eslint-disable @typescript-eslint/no-require-imports -- The isolated runner supplies the compiled API and Playwright. */
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { prisma, assertDisposableDatabase, seedWorld, addPromotion, storedOrder } = require('./fixture.cjs');
const { checkOrderPricingSnapshot } = require(path.join(process.env.B4_API_BUILD, 'promotions/promotion-snapshot.js'));

// API quote -> checkout -> persisted rows. This is not a browser or downstream-reader test.
test.beforeAll(assertDisposableDatabase);
test.afterAll(() => prisma.$disconnect());

const cases = [
  { name: 'MENU fixed', scope: 'MENU', type: 'FIXED_AMOUNT', value: '35.00', total: '65.00', amount: '35.00', legacy: '0.00' },
  { name: 'MENU percentage', scope: 'MENU', type: 'PERCENTAGE', value: '30.00', total: '70.00', amount: '30.00', legacy: '0.00' },
  { name: 'CATEGORY percentage', scope: 'CATEGORY', type: 'PERCENTAGE', value: '30.00', total: '70.00', amount: '30.00', legacy: '0.00' },
  { name: 'QUANTITY fixed', scope: 'QUANTITY', type: 'FIXED_AMOUNT', value: '70.00', quantity: 2, total: '130.00', amount: '70.00', legacy: '0.00' },
  { name: 'DELIVERY fixed', scope: 'DELIVERY', type: 'FIXED_AMOUNT', value: '10.00', delivery: true, total: '100.00', amount: '10.00', legacy: '20.00' },
  { name: 'legacy CART fixed without minimum', scope: 'CART', type: 'FIXED_AMOUNT', value: '35.00', total: '65.00', amount: '35.00', legacy: '0.00' },
];

for (const scenario of cases) {
  test(`${scenario.name}: quote, checkout and persisted snapshot reconcile`, async ({ request }) => {
    const w = await seedWorld();
    const promotion = scenario.scope === 'QUANTITY'
      ? await prisma.promotion.create({ data: {
        restaurantId: w.restaurantId, scope: scenario.scope, discountType: scenario.type, value: scenario.value,
        status: 'ACTIVE', internalName: `Internal ${scenario.name}`, minimumQuantity: 2, quantityBasis: 'UNITS',
        translations: { create: { locale: 'en', title: scenario.name } },
      } })
      : await addPromotion(w, {
        scope: scenario.scope, discountType: scenario.type, value: scenario.value, title: scenario.name,
      });
    if (scenario.scope === 'CART') expect(promotion.minimumSubtotal).toBeNull();

    const cart = {
      fulfillment: scenario.delivery ? 'DELIVERY' : 'PICKUP',
      branchId: w.branchId,
      ...(scenario.delivery ? { deliveryZoneId: w.zoneId } : {}),
      items: [{ productId: w.products[0].id, quantity: scenario.quantity ?? 1 }],
    };
    const url = `${process.env.B4_API_ORIGIN}/api/v1/public/qr/${w.genericQr}`;
    const quote = await request.post(`${url}/quote`, { data: cart });
    expect(quote.status(), await quote.text()).toBe(200);
    const quoted = (await quote.json()).data;
    expect(quoted.total).toBe(scenario.total);
    expect(quoted.promotions).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: scenario.scope, title: scenario.name, amount: scenario.amount }),
    ]));

    const placed = await request.post(`${url}/orders`, { data: {
      ...cart, customerName: 'Sara', customerPhone: '+20 100 000 0000',
      ...(scenario.delivery ? { deliveryAddress: '12 Nile Street' } : {}),
      clientRequestId: randomUUID(), expectedTotal: quoted.total,
    } });
    expect(placed.status(), await placed.text()).toBe(201);
    const result = (await placed.json()).data;
    expect(result.total).toBe(scenario.total);
    const order = await storedOrder(w, result.id);
    expect(order.totalAmount.toFixed(2)).toBe(scenario.total);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].discountAmount.toFixed(2)).toBe(scenario.legacy);
    expect(order.promotions).toHaveLength(1);
    const row = order.promotions[0];
    expect(row).toMatchObject({ promotionId: promotion.id, scope: scenario.scope, discountType: scenario.type, titleSnapshot: scenario.name });
    expect(row.value.toFixed(2)).toBe(scenario.value);
    expect(row.amount.toFixed(2)).toBe(scenario.amount);
    expect(row.configSnapshot).toMatchObject({ scope: scenario.scope, discountType: scenario.type, value: scenario.value });
    if (scenario.scope === 'CART') expect(row.configSnapshot.minimumSubtotal).toBeNull();
    if (scenario.scope === 'QUANTITY') expect(row.configSnapshot).toMatchObject({ minimumQuantity: 2, quantityBasis: 'UNITS' });
    if (scenario.delivery) {
      expect(row.allocations).toHaveLength(0);
      expect(order.deliveryFeeOriginalAmount.toFixed(2)).toBe('30.00');
      expect(order.deliveryDiscountAmount.toFixed(2)).toBe(scenario.amount);
      expect(order.deliveryFeeAmount.toFixed(2)).toBe('20.00');
    } else {
      expect(row.allocations).toHaveLength(1);
      expect(row.allocations[0].orderItemId).toBe(order.items[0].id);
      expect(row.allocations[0].amount.toFixed(2)).toBe(scenario.amount);
    }

    const indexes = new Map(order.items.map((item, index) => [item.id, index]));
    const snapshot = {
      order,
      items: order.items.map((item, lineIndex) => ({ ...item, lineIndex })),
      promotions: order.promotions.map(p => ({ ...p, allocations: p.allocations.map(a => ({
        lineIndex: indexes.get(a.orderItemId) ?? -1, amount: a.amount,
      })) })),
    };
    expect(checkOrderPricingSnapshot(snapshot)).toEqual([]);
  });
}
