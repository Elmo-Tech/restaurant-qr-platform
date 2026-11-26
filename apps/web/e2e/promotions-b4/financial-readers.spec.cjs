/* eslint-disable @typescript-eslint/no-require-imports -- The isolated B4 runner supplies Playwright and the verified API build. */
const { randomUUID } = require('node:crypto');
const { test, expect } = require('@playwright/test');
const { prisma, assertDisposableDatabase, seedWorld, addPromotion, createOwner, storedOrder } = require('./fixture.cjs');

// Reader contracts differ: tracking exposes only the final total; session summaries
// separate pending orders; delivery discounts are not part of a table-session bill.
test.beforeAll(assertDisposableDatabase);
test.afterAll(() => prisma.$disconnect());

const scenarios = [
  { scope: 'MENU', type: 'FIXED_AMOUNT', value: '35.00', amount: '35.00', total: '65.00' },
  { scope: 'MENU', type: 'PERCENTAGE', value: '30.00', amount: '30.00', total: '70.00' },
  { scope: 'CATEGORY', type: 'FIXED_AMOUNT', value: '35.00', amount: '35.00', total: '65.00' },
  { scope: 'CATEGORY', type: 'PERCENTAGE', value: '30.00', amount: '30.00', total: '70.00' },
  { scope: 'CART', type: 'FIXED_AMOUNT', value: '35.00', amount: '35.00', total: '65.00', minimum: '50.00' },
  { scope: 'CART', type: 'PERCENTAGE', value: '30.00', amount: '30.00', total: '70.00', minimum: '50.00' },
  { scope: 'CART', type: 'FIXED_AMOUNT', value: '35.00', amount: '35.00', total: '65.00', legacy: true },
  { scope: 'QUANTITY', type: 'FIXED_AMOUNT', value: '70.00', amount: '70.00', total: '130.00', quantity: 2 },
  { scope: 'QUANTITY', type: 'PERCENTAGE', value: '30.00', amount: '60.00', total: '140.00', quantity: 2 },
  { scope: 'DELIVERY', type: 'FIXED_AMOUNT', value: '10.00', amount: '10.00', total: '100.00', delivery: true },
  { scope: 'DELIVERY', type: 'PERCENTAGE', value: '50.00', amount: '15.00', total: '95.00', delivery: true },
];

for (const s of scenarios) {
  test(`${s.scope} ${s.type}${s.legacy ? ' legacy' : ''}: historical financial readers`, async ({ page, request }) => {
    const w = await seedWorld();
    await prisma.restaurantFeature.create({ data: { restaurantId: w.restaurantId, feature: 'ORDER_TRACKING', enabled: true } });
    const title = 'Historical B4 saving';
    const promotion = s.scope === 'QUANTITY'
      ? await prisma.promotion.create({ data: {
        restaurantId: w.restaurantId, scope: s.scope, discountType: s.type, value: s.value,
        status: 'ACTIVE', internalName: title, minimumQuantity: 2, quantityBasis: 'UNITS',
        translations: { create: { locale: 'en', title } },
      } })
      : await addPromotion(w, { scope: s.scope, discountType: s.type, value: s.value, title, minimumSubtotal: s.minimum });
    const owner = await createOwner(w);
    const qr = s.delivery ? w.genericQr : w.tableQr;
    const guest = `${process.env.B4_API_ORIGIN}/api/v1/public/qr/${qr}`;
    const cart = {
      ...(s.delivery ? { fulfillment: 'DELIVERY', branchId: w.branchId, deliveryZoneId: w.zoneId } : {}),
      items: [{ productId: w.products[0].id, quantity: s.quantity ?? 1 }],
    };
    const quoteResponse = await request.post(`${guest}/quote`, { data: cart });
    expect(quoteResponse.status(), await quoteResponse.text()).toBe(200);
    const quote = (await quoteResponse.json()).data;
    expect(quote).toMatchObject({ total: s.total, promotions: [expect.objectContaining({ scope: s.scope, title, amount: s.amount })] });
    const placed = await request.post(`${guest}/orders`, { data: {
      ...cart, clientRequestId: randomUUID(), expectedTotal: quote.total,
      ...(s.delivery ? { customerName: 'Sara', customerPhone: '+20 100 000 0000', deliveryAddress: '12 Nile Street' } : {}),
    } });
    expect(placed.status(), await placed.text()).toBe(201);
    const order = await storedOrder(w, (await placed.json()).data.id);
    expect(order.totalAmount.toFixed(2)).toBe(s.total);
    expect(order.promotions).toEqual([expect.objectContaining({ promotionId: promotion.id, scope: s.scope, discountType: s.type, titleSnapshot: title })]);
    expect(order.promotions[0].amount.toFixed(2)).toBe(s.amount);

    // Change live configuration only after checkout. Readers must use the saved snapshot.
    await prisma.promotion.update({ where: { id: promotion.id }, data: { status: 'INACTIVE', value: '1.00' } });
    await prisma.promotionTranslation.updateMany({ where: { promotionId: promotion.id }, data: { title: 'Current, not historical' } });
    const tracking = await request.get(`${guest}/orders/${order.id}/tracking?lang=en`);
    expect(tracking.status(), await tracking.text()).toBe(200);
    expect((await tracking.json()).data).toMatchObject({ total: s.total, currencyCode: 'EGP', status: 'PENDING' });

    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(owner.email);
    await page.getByLabel('Password', { exact: true }).fill(owner.password);
    await Promise.all([
      page.waitForURL(url => url.pathname === `/staff/restaurants/${w.restaurantId}`),
      page.getByRole('button', { name: 'Sign in', exact: true }).click(),
    ]);
    const staff = `${process.env.B4_API_ORIGIN}/api/v1/restaurants/${w.restaurantId}`;
    const dashboard = await page.request.get(`${staff}/dashboard?range=today`);
    expect(dashboard.status(), await dashboard.text()).toBe(200);
    expect((await dashboard.json()).data.kpis).toMatchObject({ revenue: s.total, totalOrders: 1, averageOrderValue: s.total });
    if (!s.delivery) {
      const session = await prisma.tableSession.findUniqueOrThrow({ where: { id: order.tableSessionId } });
      const bill = await page.request.get(`${staff}/table-sessions/${session.publicId}/bill`);
      expect(bill.status(), await bill.text()).toBe(200);
      expect((await bill.json()).data).toMatchObject({
        totals: { acceptedTotal: '0.00', pendingTotal: s.total }, rounds: [],
        awaitingRounds: [{ totalAmount: s.total, promotions: [{ title, scope: s.scope, amount: s.amount }] }],
      });
    }

    await page.goto(`/staff/restaurants/${w.restaurantId}/orders`);
    const detailResponse = page.waitForResponse(r => r.request().method() === 'GET' && r.url() === `${staff}/orders/${order.id}`);
    await page.locator(`[data-order-id="${order.id}"]`).click();
    const response = await detailResponse;
    expect(response.status(), await response.text()).toBe(200);
    expect((await response.json()).data).toMatchObject({ totalAmount: s.total, promotions: [{ title, scope: s.scope, amount: s.amount }] });
    await expect(page.getByText(title, { exact: true }).filter({ visible: true })).toBeVisible();
    const receipt = page.locator('#order-receipt-root');
    await page.emulateMedia({ media: 'print' });
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText(title);
    await expect(receipt).toContainText(`−${s.amount} EGP`);
    const totalRow = receipt.locator('dt').filter({ hasText: /^TOTAL$/ }).locator('..');
    await expect(totalRow.locator('dd')).toHaveText(`${s.total} EGP`);
    await expect(receipt).not.toContainText('Current, not historical');
  });
}
