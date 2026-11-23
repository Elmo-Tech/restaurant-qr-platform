/* eslint-disable @typescript-eslint/no-require-imports -- The isolated runner resolves its Playwright tools via NODE_PATH (CommonJS only). */
const { test, expect, devices } = require('@playwright/test');
const {
  prisma, assertDisposableDatabase, seedWorld, addPromotion, addOffer, createOwner, orderCount, storedOrder,
} = require('./fixture.cjs');

const en = {
  add: n => `Add ${n}`, more: n => `Add one more ${n}`, view: /^View order,/,
  delivery: 'Delivery', next: /^Continue/, send: /^(?:Send order(?! on WhatsApp)|Place (?:pickup|delivery) order)(?:\s|$)/, name: 'Name', phone: 'Phone', address: 'Address',
};
const ar = {
  add: n => `إضافة ${n}`, more: n => `إضافة ${n} آخر`, view: /^عرض الطلب,/,
  delivery: 'توصيل', next: /^متابعة/, send: /^(?:إرسال الطلب|تأكيد طلب (?:التوصيل|الاستلام))(?:\s|$)/, name: 'الاسم', phone: 'رقم الهاتف', address: 'العنوان',
};
const status = dialog => dialog.getByTestId('cart-quote-status');
const total = dialog => dialog.getByTestId('cart-quote-total');
const savings = dialog => dialog.getByTestId('cart-quote-savings');
const post = page => page.getByRole('dialog').getByRole('button', { name: en.send });
const dec = value => value?.toFixed(2) ?? null;
const arabicDigits = text => text.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660));

const feePromo = w => addPromotion(w, { scope: 'DELIVERY', value: '10.00', title: 'Nile fee saving', titleAr: 'خصم رسوم النيل' });
const cartPromo = (w, value = '50.00', discountType = 'FIXED_AMOUNT') => addPromotion(w, {
  scope: 'CART', value, discountType, title: 'Nile cart saving', titleAr: 'خصم سلة النيل',
});

function waitPost(page, qr, action, predicate = () => true) {
  return page.waitForResponse(r => r.request().method() === 'POST' &&
    r.url() === `${process.env.B4_API_ORIGIN}/api/v1/public/qr/${qr}/${action}` &&
    predicate(r.request().postDataJSON()), { timeout: 15_000 });
}
const waitDelivery = (page, qr) => waitPost(page, qr, 'quote', body => body.fulfillment === 'DELIVERY' && !!body.deliveryZoneId);

async function browse(page, w, { table = false, arabic = false, second = true } = {}) {
  const qr = table ? w.tableQr : w.genericQr;
  const copy = arabic ? ar : en;
  await page.goto(`/q/${qr}${arabic ? '?lang=ar' : ''}`);
  const name = p => arabic ? p.nameAr : p.name;
  await page.getByRole('button', { name: copy.add(name(w.products[0])), exact: true }).click();
  if (second) await page.getByRole('button', { name: copy.add(name(w.products[1])), exact: true }).click();
  return { copy, qr };
}

async function openCart(page, copy = en) {
  await page.getByRole('button', { name: copy.view }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function details(dialog, { delivery = true, copy = en } = {}) {
  if (delivery) await dialog.getByRole('button', { name: new RegExp(`^${copy.delivery}(?:\\s|$)`) }).click();
  await dialog.getByRole('button', { name: copy.next }).click();
  if (delivery) {
    const zone = dialog.getByRole('radio', { name: /Nile Zone/ });
    if (await zone.count()) await zone.check();
    await dialog.getByRole('textbox', { name: copy.address, exact: true }).fill('12 Nile Street');
  }
  await dialog.getByRole('textbox', { name: copy.name, exact: true }).fill('B4 Guest');
  await dialog.getByRole('textbox', { name: copy.phone, exact: true }).fill('01012345678');
}

async function expectTotal(dialog, amount) {
  await expect.poll(async () => arabicDigits(await total(dialog).textContent())).toContain(amount);
}

async function evidence(page, info, file, data) {
  const path = info.outputPath(`${file}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await info.attach(file, { path, contentType: 'image/png' });
  if (data) await info.attach(`${file}-reconciliation`, { body: JSON.stringify(data, null, 2), contentType: 'application/json' });
}

function orderSnapshot(order) {
  return {
    subtotal: dec(order.subtotalAmount), discountTotal: dec(order.discountTotalAmount),
    promotionDiscount: dec(order.promotionDiscountAmount), deliveryFeeOriginal: dec(order.deliveryFeeOriginalAmount),
    deliveryDiscount: dec(order.deliveryDiscountAmount), deliveryFee: dec(order.deliveryFeeAmount), total: dec(order.totalAmount),
    lines: order.items.map(line => ({ productId: line.productId, offerId: line.offerId, quantity: line.quantity,
      unitPrice: dec(line.unitPrice), discount: dec(line.discountAmount), lineTotal: dec(line.lineTotal) })),
    promotions: order.promotions.map(p => ({ id: p.promotionId, title: p.titleSnapshot, scope: p.scope, amount: dec(p.amount),
      allocations: p.allocations.map(a => ({ orderId: a.orderId, productId: order.items.find(i => i.id === a.orderItemId)?.productId, amount: dec(a.amount) })) })),
  };
}

function reconcile(order, displayed, quoted, { subtotal, merchandise, newMerchandise, deliveryOriginal, deliveryDiscount, delivery, grand }) {
  const snapshot = orderSnapshot(order);
  const apiMoney = { subtotal, discountTotal: merchandise, deliveryFeeOriginal: deliveryOriginal, deliveryDiscount, deliveryFee: delivery, total: grand };
  expect(quoted).toMatchObject(apiMoney);
  expect(displayed).toMatchObject(apiMoney);
  expect(snapshot).toMatchObject({ ...apiMoney, promotionDiscount: newMerchandise });
  expect(dec(order.subtotalAmount.plus(order.deliveryFeeAmount))).toBe(grand);
  expect(dec(order.discountTotalAmount.minus(order.promotionDiscountAmount))).toBe(
    dec(order.items.reduce((acc, item) => acc.plus(item.discountAmount), order.discountTotalAmount.mul(0))),
  );
  for (const promotion of order.promotions) {
    expect(promotion.orderId).toBe(order.id);
    expect(promotion.restaurantId).toBe(order.restaurantId);
    if (promotion.scope === 'DELIVERY') expect(promotion.allocations).toHaveLength(0);
    else expect(dec(promotion.allocations.reduce((sum, row) => sum.plus(row.amount), promotion.amount.mul(0)))).toBe(dec(promotion.amount));
  }
  return snapshot;
}

async function submit(page, w, qr, quoted, { copy = en, expectedStatus = 201 } = {}) {
  const pending = waitPost(page, qr, 'orders');
  await page.getByRole('dialog').getByRole('button', { name: copy.send }).click();
  const res = await pending;
  const body = await res.json();
  const req = res.request().postDataJSON();
  expect(res.status(), JSON.stringify(body)).toBe(expectedStatus);
  expect(req.expectedTotal).toBe(quoted.total);
  if (expectedStatus !== 201) return { body, req };
  await expect(page.getByTestId('confirmed-order-total')).toContainText(new RegExp(quoted.total.split('.')[0]));
  expect(await orderCount(w)).toBe(1);
  return { order: await storedOrder(w, body.data.id), displayed: body.data, req };
}

test.beforeAll(assertDisposableDatabase);
test.afterAll(() => prisma.$disconnect());

for (const variant of [
  { grand: '170.00', subtotal: '150.00', merchandise: '50.00', newMerchandise: '50.00', value: '50.00', kind: 'FIXED_AMOUNT' },
  { grand: '180.00', subtotal: '160.00', merchandise: '40.00', newMerchandise: '0.00', value: '15.00', kind: 'PERCENTAGE' },
]) {
  test(`Delivery ${variant.grand} reconciles browser quote, confirmation and historical PostgreSQL rows`, async ({ page }, info) => {
    const w = await seedWorld();
    const cart = await cartPromo(w, variant.value, variant.kind);
    const fee = await feePromo(w);
    const { qr } = await browse(page, w);
    const dialog = await openCart(page);
    const pending = waitDelivery(page, qr);
    await details(dialog);
    const quotedResponse = await pending;
    expect(quotedResponse.status()).toBe(200);
    const { data: quoted } = await quotedResponse.json();
    await expectTotal(dialog, variant.grand.split('.')[0]);
    await expect(dialog.getByText('Delivery before discount', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Nile fee saving', { exact: true })).toBeVisible();
    if (variant.newMerchandise === '0.00') {
      await expect(savings(dialog)).toContainText('Product discounts');
      await expect(savings(dialog)).not.toContainText('Nile cart saving');
    } else {
      await expect(savings(dialog)).toContainText('Nile cart saving');
      await expect(savings(dialog)).not.toContainText('Product discounts');
    }
    expect(await orderCount(w)).toBe(0);
    await total(dialog).scrollIntoViewIfNeeded();
    await evidence(page, info, `guest-quote-${variant.grand.split('.')[0]}`);
    const { order, displayed, req } = await submit(page, w, qr, quoted);
    const snapshot = reconcile(order, displayed, quoted, {
      ...variant, deliveryOriginal: '30.00', deliveryDiscount: '10.00', delivery: '20.00',
    });
    expect(snapshot.lines).toHaveLength(2);
    expect(snapshot.lines.map(l => [l.discount, l.lineTotal])).toEqual(variant.newMerchandise === '0.00'
      ? [['20.00', '80.00'], ['20.00', '80.00']] : [['0.00', '100.00'], ['0.00', '100.00']]);
    expect(snapshot.promotions).toEqual(expect.arrayContaining([expect.objectContaining({ id: fee.id, scope: 'DELIVERY', amount: '10.00', allocations: [] })]));
    if (variant.newMerchandise === '0.00') expect(snapshot.promotions).toHaveLength(1);
    else {
      expect(snapshot.promotions).toHaveLength(2);
      expect(snapshot.promotions.find(p => p.id === cart.id)).toMatchObject({ title: 'Nile cart saving', scope: 'CART', amount: '50.00' });
      expect(snapshot.promotions.find(p => p.id === cart.id).allocations).toEqual(expect.arrayContaining(w.products.map(p => ({
        orderId: order.id, productId: p.id, amount: '25.00',
      }))));
    }
    await evidence(page, info, `guest-confirmation-${variant.grand.split('.')[0]}`, { expectedTotal: req.expectedTotal, quote: quoted, response: displayed, snapshot });
  });
}

test('exact merchandise tie keeps item strategy and snapshots category plus legacy, not cart', async ({ page }, info) => {
  const w = await seedWorld({ secondPrice: '50.00' });
  const category = await addPromotion(w, { scope: 'CATEGORY', discountType: 'PERCENTAGE', value: '30.00', title: 'Nile grill saving' });
  await cartPromo(w);
  const { qr } = await browse(page, w, { table: true });
  const quotePromise = page.waitForResponse(r => r.request().method() === 'POST' && r.url() ===
    `${process.env.B4_API_ORIGIN}/api/v1/public/qr/${qr}/quote` && r.request().postDataJSON().items.some(i => i.quantity === 2));
  await page.getByRole('button', { name: en.more('B4 Rice'), exact: true }).click();
  const dialog = await openCart(page);
  await expectTotal(dialog, '150');
  const { data: quoted } = await (await quotePromise).json();
  expect(quoted.total).toBe('150.00');
  await expect(savings(dialog)).toContainText('Nile grill saving');
  await expect(savings(dialog)).toContainText('Product discounts');
  await expect(savings(dialog)).not.toContainText('Nile cart saving');
  expect(await prisma.tableSession.count({ where: { restaurantId: w.restaurantId } })).toBe(0);
  const { order, displayed } = await submit(page, w, qr, quoted);
  const snapshot = reconcile(order, displayed, quoted, { subtotal: '150.00', merchandise: '50.00', newMerchandise: '30.00',
    deliveryOriginal: null, deliveryDiscount: '0.00', delivery: '0.00', grand: '150.00' });
  expect(snapshot.lines.find(l => l.productId === w.products[1].id)).toMatchObject({ quantity: 2, discount: '20.00', lineTotal: '80.00' });
  expect(snapshot.promotions).toEqual([expect.objectContaining({ id: category.id, scope: 'CATEGORY', amount: '30.00', allocations: [
    { orderId: order.id, productId: w.products[0].id, amount: '30.00' },
  ] })]);
  expect(order.roundNumber).toBe(1);
  expect(order.tableSessionId).not.toBeNull();
  await evidence(page, info, 'item-strategy-tie', snapshot);
});

test('Arabic mobile shows discounted delivery minimum shortfall and prevents submission', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const w = await seedWorld({ minimumOrder: '155.00' });
  await cartPromo(w);
  await feePromo(w);
  const { qr, copy } = await browse(page, w, { arabic: true });
  const dialog = await openCart(page, copy);
  const pending = waitDelivery(page, qr);
  await details(dialog, { copy });
  const response = await pending;
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body).toMatchObject({ error: { code: 'DELIVERY_MINIMUM_NOT_MET', details: { subtotal: '150.00', minimumOrder: '155.00' } } });
  await expect(dialog).toHaveCSS('direction', 'rtl');
  const shortfall = dialog.getByTestId('delivery-minimum-shortfall');
  await expect(shortfall).toBeVisible();
  expect(arabicDigits(await shortfall.textContent())).toMatch(/150.*5/);
  await expect(dialog.getByRole('button', { name: copy.send })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await orderCount(w)).toBe(0);
  expect(await prisma.orderPromotion.count({ where: { restaurantId: w.restaurantId } })).toBe(0);
  await shortfall.scrollIntoViewIfNeeded();
  await evidence(page, info, 'arabic-mobile-minimum', body);
});

test('Offer keeps its full price and is excluded from merchandise qualification and allocations', async ({ page }, info) => {
  const w = await seedWorld();
  const offer = await addOffer(w);
  const winner = await cartPromo(w, '50.00', 'PERCENTAGE');
  await addPromotion(w, { scope: 'CART', value: '100.00', discountType: 'PERCENTAGE', title: 'Eligible products threshold', minimumSubtotal: '200.00' });
  const { qr } = await browse(page, w, { second: false });
  await page.getByText('B4 Bundle', { exact: true }).click();
  const pending = page.waitForResponse(r => r.request().method() === 'POST' && r.url() ===
    `${process.env.B4_API_ORIGIN}/api/v1/public/qr/${qr}/quote` && r.request().postDataJSON().items.some(i => i.offerId === offer.id));
  await page.getByRole('dialog').getByRole('button', { name: /^Add to order/ }).click();
  const dialog = await openCart(page);
  await details(dialog, { delivery: false });
  const { data: quoted } = await (await pending).json();
  await expectTotal(dialog, '170');
  await expect(dialog.getByTestId('promotion-progress')).toContainText('100 of 200');
  await expect(dialog.getByTestId('promotion-progress')).toContainText('in eligible products');
  expect(quoted.promotions).toEqual([expect.objectContaining({ title: 'Nile cart saving', amount: '50.00' })]);
  const { order, displayed } = await submit(page, w, qr, quoted);
  const snapshot = reconcile(order, displayed, quoted, { subtotal: '170.00', merchandise: '50.00', newMerchandise: '50.00',
    deliveryOriginal: null, deliveryDiscount: '0.00', delivery: '0.00', grand: '170.00' });
  expect(snapshot.lines.find(l => l.offerId === offer.id)).toMatchObject({ discount: '0.00', lineTotal: '120.00' });
  expect(snapshot.promotions).toEqual([expect.objectContaining({ id: winner.id, allocations: [
    { orderId: order.id, productId: w.products[0].id, amount: '50.00' },
  ] })]);
  await evidence(page, info, 'offer-not-discounted', snapshot);
});

test('PROMOTIONS disabled ignores active rows and keeps legacy product discount and original delivery fee', async ({ page }, info) => {
  const w = await seedWorld({ promotions: false });
  await cartPromo(w);
  await feePromo(w);
  await addPromotion(w, { scope: 'CATEGORY', discountType: 'PERCENTAGE', value: '50.00', title: 'Nile grill saving' });
  const { qr } = await browse(page, w);
  await expect(page.getByText('Nile grill saving', { exact: true })).toHaveCount(0);
  const dialog = await openCart(page);
  const pending = waitDelivery(page, qr);
  await details(dialog);
  const { data: quoted } = await (await pending).json();
  await expectTotal(dialog, '190');
  await expect(savings(dialog)).toContainText('Product discounts');
  await expect(dialog.getByText('Nile fee saving', { exact: true })).toHaveCount(0);
  expect(quoted.promotions).toEqual([]);
  const { order, displayed } = await submit(page, w, qr, quoted);
  const snapshot = reconcile(order, displayed, quoted, { subtotal: '160.00', merchandise: '40.00', newMerchandise: '0.00',
    deliveryOriginal: null, deliveryDiscount: '0.00', delivery: '30.00', grand: '190.00' });
  expect(snapshot.promotions).toEqual([]);
  await evidence(page, info, 'feature-disabled-legacy', snapshot);
});

test('offline quote fails closed, recovery retries the real API without submitting', async ({ context, page }, info) => {
  const w = await seedWorld();
  await cartPromo(w);
  const { qr } = await browse(page, w);
  await context.setOffline(true);
  try {
    const dialog = await openCart(page);
    await details(dialog, { delivery: false });
    await expect(status(dialog)).toHaveAttribute('data-state', 'unavailable');
    await expect(total(dialog)).toHaveCount(0);
    await expect(post(page)).toBeDisabled();
    await evidence(page, info, 'offline-quote-blocked');
    // Reconnect automatically triggers a quote. Fail that transport once so the
    // retry control is exercised, then let the next POST reach real Nest.
    const quoteUrl = `${process.env.B4_API_ORIGIN}/api/v1/public/qr/${qr}/quote`;
    const failReconnect = route => route.request().method() === 'POST' ? route.abort('failed') : route.continue();
    await page.route(quoteUrl, failReconnect);
    const failed = page.waitForEvent('requestfailed', { predicate: req => req.method() === 'POST' && req.url() === quoteUrl, timeout: 15_000 });
    await context.setOffline(false);
    await failed;
    await page.unroute(quoteUrl, failReconnect);
    await expect(status(dialog)).toHaveAttribute('data-state', 'unavailable');
    const pending = waitPost(page, qr, 'quote');
    await dialog.getByRole('button', { name: 'Retry price check' }).click();
    const response = await pending;
    expect(response.status()).toBe(200);
    await expectTotal(dialog, '150');
    await expect(post(page)).toBeEnabled();
    expect(await orderCount(w)).toBe(0);
    await evidence(page, info, 'online-quote-retried');
  } finally {
    await context.setOffline(false);
  }
});

test('stale server pricing rejects old expectedTotal and requires explicit reconfirmation', async ({ page }, info) => {
  const w = await seedWorld();
  await cartPromo(w);
  await feePromo(w);
  const { qr } = await browse(page, w);
  const dialog = await openCart(page);
  const pending = waitDelivery(page, qr);
  await details(dialog);
  const { data: oldQuote } = await (await pending).json();
  await expectTotal(dialog, '170');
  await prisma.restaurantFeature.update({ where: { restaurantId_feature: { restaurantId: w.restaurantId, feature: 'PROMOTIONS' } }, data: { enabled: false } });
  const refreshed = waitPost(page, qr, 'quote');
  const rejected = await submit(page, w, qr, oldQuote, { expectedStatus: 422 });
  expect(rejected.body).toMatchObject({ error: { code: 'PRICE_CHANGED' } });
  const { data: newQuote } = await (await refreshed).json();
  await expectTotal(dialog, '190');
  expect(await orderCount(w)).toBe(0);
  await evidence(page, info, 'stale-price-reconfirmation', { oldTotal: oldQuote.total, newTotal: newQuote.total, rejection: rejected.body.error.code });
  const { order, displayed } = await submit(page, w, qr, newQuote);
  const snapshot = reconcile(order, displayed, newQuote, { subtotal: '160.00', merchandise: '40.00', newMerchandise: '0.00',
    deliveryOriginal: null, deliveryDiscount: '0.00', delivery: '30.00', grand: '190.00' });
  expect(snapshot.promotions).toEqual([]);
});

test('WhatsApp browser handoff renders authoritative message without storing an order', async ({ context, page }, info) => {
  // Even if a client automatically opens a chat, never send traffic to WhatsApp.
  await context.route('https://wa.me/**', route => route.abort());
  const w = await seedWorld({ whatsapp: true });
  await cartPromo(w);
  await feePromo(w);
  const { qr } = await browse(page, w);
  const dialog = await openCart(page);
  const quote = waitDelivery(page, qr);
  await details(dialog);
  const { data: quoted } = await (await quote).json();
  await expectTotal(dialog, '170');
  const pending = waitPost(page, qr, 'whatsapp-order');
  await dialog.getByRole('button', { name: /^Send order on WhatsApp/ }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON().expectedTotal).toBe(quoted.total);
  const { data } = await response.json();
  expect(data.total).toBe('170.00');
  expect(data.message).toContain('Delivery fee: 30 EGP - 10 EGP (Nile fee saving) = 20 EGP');
  expect(data.message).toContain('*Total: 170 EGP*');
  await expect(dialog.getByRole('region', { name: 'Your order message' })).toContainText(data.message);
  expect(await orderCount(w)).toBe(0);
  await evidence(page, info, 'whatsapp-170-handoff');
});

test('Staff detail and printed receipt use the saved 170 EGP snapshot after promotion changes', async ({ page }, info) => {
  const w = await seedWorld();
  const cart = await cartPromo(w);
  const fee = await feePromo(w);
  const owner = await createOwner(w);
  const { qr } = await browse(page, w);
  const dialog = await openCart(page);
  const pending = waitDelivery(page, qr);
  await details(dialog);
  const { data: quoted } = await (await pending).json();
  const { order } = await submit(page, w, qr, quoted);
  expect(dec(order.totalAmount)).toBe('170.00');

  // Exercise historical reads after the live discounts are no longer equivalent.
  await prisma.promotion.updateMany({ where: { id: { in: [cart.id, fee.id] } }, data: { status: 'INACTIVE', value: '1.00' } });
  await prisma.promotionTranslation.updateMany({ where: { promotionId: { in: [cart.id, fee.id] } }, data: { title: 'Current, not historical' } });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await Promise.all([
    page.waitForURL(url => url.pathname.startsWith('/staff')),
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  ]);
  await page.goto(`/staff/restaurants/${w.restaurantId}/orders`);
  const detailResponse = page.waitForResponse(r => r.request().method() === 'GET' &&
    r.url() === `${process.env.B4_API_ORIGIN}/api/v1/restaurants/${w.restaurantId}/orders/${order.id}`);
  await page.locator(`[data-order-id="${order.id}"]`).click();
  const response = await detailResponse;
  expect(response.status()).toBe(200);
  const { data } = await response.json();
  expect(data).toMatchObject({ totalAmount: '170.00', discountTotal: '50.00', deliveryFeeOriginal: '30.00', deliveryDiscount: '10.00', deliveryFee: '20.00' });
  const feeLabel = page.getByText('Delivery fee before discount', { exact: true }).filter({ visible: true });
  await feeLabel.scrollIntoViewIfNeeded();
  await expect(page.getByText('Nile cart saving', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText('Nile fee saving', { exact: true }).filter({ visible: true })).toBeVisible();
  await evidence(page, info, 'staff-order-detail-170');

  const receipt = page.locator('#order-receipt-root');
  await expect(receipt).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText(/Nile cart saving\s*−50\.00 EGP/);
  await expect(receipt).toContainText(/Delivery fee before discount\s*30\.00 EGP/);
  await expect(receipt).toContainText(/Nile fee saving\s*−10\.00 EGP/);
  await expect(receipt).toContainText(/Delivery fee after discount\s*20\.00 EGP/);
  await expect(receipt).toContainText(/TOTAL\s*170\.00 EGP/);
  await expect(receipt).not.toContainText('Current, not historical');
  const pdfPath = info.outputPath('printed-receipt-170.pdf');
  await page.pdf({ path: pdfPath, printBackground: true });
  await info.attach('printed-receipt-170', { path: pdfPath, contentType: 'application/pdf' });
});

test('rapid cart edits cannot show or submit an obsolete in-flight quote', async ({ page }, info) => {
  const w = await seedWorld();
  await cartPromo(w);
  const { qr } = await browse(page, w);
  const dialog = await openCart(page);
  await expectTotal(dialog, '150');
  const increment = dialog.getByRole('button', { name: en.more('B4 Kofta'), exact: true });
  const quoteUrl = `${process.env.B4_API_ORIGIN}/api/v1/public/qr/${qr}/quote`;
  let release, oldQuoteReady, oldRouteDone;
  const holdOldResponse = new Promise(resolve => { release = resolve; });
  const oldQuote = new Promise(resolve => { oldQuoteReady = resolve; });
  const oldRoute = new Promise(resolve => { oldRouteDone = resolve; });
  const keepOld = route => route.request().method() === 'POST' &&
    route.request().postDataJSON().items.some(i => i.productId === w.products[0].id && i.quantity === 2);
  await page.route(quoteUrl, async route => {
    if (!keepOld(route)) return route.continue();
    try {
      const response = await route.fetch({ timeout: 10_000 });
      oldQuoteReady(await response.json());
      await holdOldResponse;
      // Chromium may already have cancelled this request when the Cart key changed.
      await route.fulfill({ response }).catch(() => {});
    } finally {
      oldRouteDone();
    }
  });
  try {
    await increment.click();
    expect((await oldQuote).data.total).toBe('240.00');
    await expect(total(dialog)).toHaveCount(0);
    const final = waitPost(page, qr, 'quote', body => body.items.some(i => i.productId === w.products[0].id && i.quantity === 3));
    await increment.click();
    const { data: freshQuote } = await (await final).json();
    expect(freshQuote.total).toBe('320.00');
    await expectTotal(dialog, '320');
    release();
    await oldRoute;
    await details(dialog, { delivery: false });
    const { order } = await submit(page, w, qr, freshQuote);
    expect(dec(order.totalAmount)).toBe('320.00');
    await evidence(page, info, 'rapid-edits-confirm-320');
  } finally {
    release();
  }
});

test('lost App order response retries the same request and replays the only database order', async ({ page }, info) => {
  const w = await seedWorld();
  await cartPromo(w);
  await feePromo(w);
  const { qr } = await browse(page, w);
  const dialog = await openCart(page);
  const pending = waitDelivery(page, qr);
  await details(dialog);
  const { data: quoted } = await (await pending).json();
  const ordersUrl = `${process.env.B4_API_ORIGIN}/api/v1/public/qr/${qr}/orders`;
  let delivered;
  const serverCommit = new Promise(resolve => { delivered = resolve; });
  const lose = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const result = await route.fetch({ timeout: 10_000 });
    delivered({ key: route.request().postDataJSON().clientRequestId, status: result.status(), body: await result.json() });
    await route.abort('failed');
  };
  await page.route(ordersUrl, lose);
  const failed = page.waitForEvent('requestfailed', { predicate: req => req.method() === 'POST' && req.url() === ordersUrl, timeout: 15_000 });
  await post(page).click();
  const first = await serverCommit;
  expect(first.status).toBe(201);
  expect(first.key).toEqual(expect.any(String));
  await failed;
  await page.unroute(ordersUrl, lose);
  await expect(dialog.getByRole('alert').filter({ hasText: /try again/i })).toBeVisible();
  expect(await orderCount(w)).toBe(1);
  const { order, req } = await submit(page, w, qr, quoted);
  expect(req.clientRequestId).toBe(first.key);
  expect(order.id).toBe(first.body.data.id);
  expect(order.promotions).toHaveLength(2);
  await evidence(page, info, 'lost-response-replay-170', { expectedTotal: req.expectedTotal, snapshot: orderSnapshot(order) });
});

test.describe('Brew mobile touch', () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, screen } = devices['Pixel 7'];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, screen, locale: 'ar-EG' });

  test('RTL size and paid extra preserve tentative menu badge and net item math', async ({ page }, info) => {
    const w = await seedWorld({ brew: true, defaultLocale: 'ar' });
    const { restaurantId } = w;
    const productId = w.products[0].id;
    const promotion = await addPromotion(w, { scope: 'CATEGORY', discountType: 'PERCENTAGE', value: '30.00',
      title: 'Nile grill saving', titleAr: 'خصم مشويات النيل' });
    await prisma.productVariant.create({ data: {
      restaurantId, productId, status: 'ACTIVE', price: '100.00', displayOrder: 0, isDefault: true,
      discountApplies: true, translations: { create: [{ locale: 'en', name: 'Regular' }, { locale: 'ar', name: 'عادي' }] },
    } });
    const large = await prisma.productVariant.create({ data: {
      restaurantId, productId, status: 'ACTIVE', price: '140.00', displayOrder: 1, isDefault: false,
      discountApplies: false, translations: { create: [{ locale: 'en', name: 'Large' }, { locale: 'ar', name: 'كبير' }] },
    } });
    const group = await prisma.modifierGroup.create({ data: {
      restaurantId, productId, status: 'ACTIVE', variantId: large.id, minimumSelections: 1, maximumSelections: 1, displayOrder: 0,
      translations: { create: [{ locale: 'en', name: 'Extra' }, { locale: 'ar', name: 'إضافة' }] },
      options: { create: { restaurantId, status: 'ACTIVE', priceAdjustment: '20.00', displayOrder: 0, priceIsOverridden: false,
        translations: { create: [{ locale: 'en', name: 'Tahini' }, { locale: 'ar', name: 'طحينة' }] } } },
    } });
    const qr = w.tableQr;
    await page.goto(`/q/${qr}?lang=ar`);
    const brew = page.locator('.brew-experience');
    await expect(brew).toBeVisible();
    await expect(brew).toHaveCSS('direction', 'rtl');
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
    const candidate = brew.getByText(/خصم محتمل [٣3][٠0]%/).first();
    await expect(candidate).toBeVisible();
    await candidate.scrollIntoViewIfNeeded();
    await evidence(page, info, 'brew-arabic-touch-menu-candidate');
    await brew.getByRole('button', { name: w.products[0].nameAr, exact: true }).tap();
    const sheet = page.getByRole('dialog');
    await sheet.getByText('كبير', { exact: true }).tap();
    await sheet.getByText('طحينة', { exact: true }).tap();
    const pending = waitPost(page, qr, 'quote', body => body.items.some(i => i.variantId === large.id));
    await sheet.getByRole('button', { name: /^أضف إلى طلبي/ }).tap();
    const dialog = await openCart(page, ar);
    const response = await pending;
    expect(response.status()).toBe(200);
    const { data: quoted } = await response.json();
    expect(quoted.total).toBe('118.00');
    await expectTotal(dialog, '118');
    await expect(dialog.getByTestId('cart-line-saving')).toContainText(/[٤4][٢2]/);
    await expect(savings(dialog)).toContainText('خصم مشويات النيل');
    await total(dialog).scrollIntoViewIfNeeded();
    await evidence(page, info, 'brew-arabic-touch-cart-118');
    const { order, displayed } = await submit(page, w, qr, quoted, { copy: ar });
    const snapshot = reconcile(order, displayed, quoted, { subtotal: '118.00', merchandise: '42.00', newMerchandise: '42.00',
      deliveryOriginal: null, deliveryDiscount: '0.00', delivery: '0.00', grand: '118.00' });
    expect(snapshot.lines).toEqual([expect.objectContaining({ unitPrice: '140.00', lineTotal: '160.00', discount: '0.00' })]);
    expect(snapshot.promotions).toEqual([expect.objectContaining({ id: promotion.id, scope: 'CATEGORY', amount: '42.00' })]);
    expect(await prisma.orderItemModifier.count({ where: { orderItemId: order.items[0].id, modifierGroupId: group.id } })).toBe(1);
    await evidence(page, info, 'brew-arabic-touch-confirmation-118', snapshot);
  });
});
