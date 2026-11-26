/* eslint-disable @typescript-eslint/no-require-imports -- The isolated runner resolves its Playwright tools via NODE_PATH (CommonJS only). */
const { test, expect } = require('@playwright/test');
const { prisma, assertDisposableDatabase, seedWorld, addPromotion, createOwner, orderCount, storedOrder } = require('./fixture.cjs');

/**
 * DEC-077 B1 browser-to-API checks for fixed CATEGORY / MENU promotions: the editor keeps a stored fixed promotion
 * as it is, an explicit confirmation guards a discount-type change (and an older client's whole-form save is refused
 * with a 409), and the Guest sees and is charged the capped per-unit saving. The runner enables the write gate
 * (PROMOTIONS_FIXED_ITEM_WRITES_ENABLED=true) for this disposable stack only.
 */
const en = {
  heading: 'Promotions', email: 'Email', password: 'Password', signIn: 'Sign in', edit: 'Edit',
  type: 'Discount type', value: /^Discount value/, internal: 'Internal name (staff only)',
  save: 'Save', confirmType: 'I checked the value for the new discount type',
};
const ar = {
  heading: 'العروض الترويجية', email: 'البريد الإلكتروني', password: 'كلمة المرور', signIn: 'تسجيل الدخول', edit: 'تعديل',
  type: 'نوع الخصم', value: /^قيمة الخصم/, internal: 'الاسم الداخلي (للموظفين فقط)',
  save: 'حفظ', confirmType: 'راجعت القيمة بحسب نوع الخصم الجديد',
};
const button = (container, name) => container.getByRole('button', { name, exact: true });
const input = (container, label) => container.getByLabel(label, { exact: true });
const staffUrl = w => `${process.env.B4_API_ORIGIN}/api/v1/restaurants/${w.restaurantId}/promotions`;
const guestUrl = w => `${process.env.B4_API_ORIGIN}/api/v1/public/qr/${w.tableQr}`;

async function signInAndOpen(page, w, copy, internalName) {
  const owner = await createOwner(w);
  await page.goto('/login');
  await input(page, copy.email).fill(owner.email);
  await input(page, copy.password).fill(owner.password);
  await Promise.all([page.waitForURL(url => url.pathname === `/staff/restaurants/${w.restaurantId}`), button(page, copy.signIn).click()]);
  await page.goto(`/staff/restaurants/${w.restaurantId}/menu/promotions`);
  await expect(page.getByRole('heading', { name: copy.heading, level: 1 })).toBeVisible();
  const row = page.getByRole('list', { name: copy.heading }).getByRole('listitem').filter({ hasText: internalName });
  await button(row, copy.edit).click();
}

async function expectNoHorizontalOverflow(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
}

const stored = id => prisma.promotion.findUniqueOrThrow({ where: { id } });

test.use({ viewport: { width: 1280, height: 900 } });
test.beforeAll(assertDisposableDatabase);
test.afterAll(() => prisma.$disconnect());

test.describe('Fixed item promotion in the Staff editor (LTR desktop)', () => {
  test('keeps the stored fixed type and value, refuses an older client, and confirms a deliberate type change', async ({ page }) => {
    const w = await seedWorld();
    const row = await addPromotion(w, { scope: 'CATEGORY', discountType: 'FIXED_AMOUNT', value: '35.00', title: 'Grill 35 off', priority: 7 });
    await signInAndOpen(page, w, en, row.internalName);

    // The editor shows the type selector for an item scope and keeps the stored fixed promotion as it is.
    await expect(input(page, en.type)).toHaveValue('FIXED_AMOUNT');
    await expect(page.getByLabel(en.value)).toHaveValue('35.00');
    await expect(page.getByText(/Customers get .* off each unit of the items in the chosen categories/)).toBeVisible();
    const advanced = page.locator('details').filter({ hasText: 'Advanced settings' });
    await expect(advanced).not.toHaveAttribute('open', '');
    await expect(advanced.locator('summary')).toContainText('Custom priority set');
    await expect(button(page, en.save)).toBeDisabled(); // nothing changed yet

    // A metadata-only save sends the stored type and no confirmation flag; nothing about the discount changes.
    await input(page, en.internal).fill('Grill 35 off (renamed)');
    const [renamed] = await Promise.all([
      page.waitForResponse(r => r.request().method() === 'PATCH' && r.url() === `${staffUrl(w)}/${row.id}`),
      button(page, en.save).click(),
    ]);
    expect(renamed.status(), await renamed.text()).toBe(200);
    const sent = renamed.request().postDataJSON();
    expect(sent).toMatchObject({ discountType: 'FIXED_AMOUNT', value: '35.00', priority: 7 });
    expect('confirmDiscountTypeChange' in sent).toBe(false);
    expect(await stored(row.id)).toMatchObject({ discountType: 'FIXED_AMOUNT', priority: 7, internalName: 'Grill 35 off (renamed)' });

    // An older client (its form always sends PERCENTAGE for a category) is refused with a 409 and changes nothing.
    const before = await stored(row.id);
    const stale = await page.evaluate(async ([url, body]) => {
      const response = await fetch(url, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    }, [`${staffUrl(w)}/${row.id}`, { internalName: before.internalName, scope: 'CATEGORY', discountType: 'PERCENTAGE', value: '35.00' }]);
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: { code: 'PROMOTION_DISCOUNT_TYPE_CHANGE_CONFIRMATION_REQUIRED',
      details: { fields: ['discountType'], from: 'FIXED_AMOUNT', to: 'PERCENTAGE', value: '35.00' } } });
    const after = await stored(row.id);
    expect(after.discountType).toBe('FIXED_AMOUNT');
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());

    // A deliberate change in the editor needs the explicit confirmation before it can be saved.
    await input(page, en.type).selectOption('PERCENTAGE');
    const confirm = page.getByRole('checkbox', { name: en.confirmType });
    await expect(confirm).toBeVisible();
    await expect(page.getByText(/You are changing the discount from Fixed amount to Percentage\./)).toBeVisible();
    await expect(button(page, en.save)).toBeDisabled();
    await page.getByLabel(en.value).fill('35');
    await confirm.check();
    const [converted] = await Promise.all([
      page.waitForResponse(r => r.request().method() === 'PATCH' && r.url() === `${staffUrl(w)}/${row.id}`),
      button(page, en.save).click(),
    ]);
    expect(converted.status(), await converted.text()).toBe(200);
    expect(converted.request().postDataJSON()).toMatchObject({ discountType: 'PERCENTAGE', confirmDiscountTypeChange: true });
    expect(await stored(row.id)).toMatchObject({ discountType: 'PERCENTAGE' });
  });

  test('Guest sees the capped per-unit saving and is charged it at checkout; the snapshot stays fixed', async ({ browser }) => {
    const w = await seedWorld();
    // Kofta 100.00 carries a 20 % Product discount (20.00); the fixed 35.00 category promotion saves more and wins.
    const promotion = await addPromotion(w, { scope: 'CATEGORY', discountType: 'FIXED_AMOUNT', value: '35.00', title: 'Grill 35 off' });
    const context = await browser.newContext({ baseURL: process.env.B4_WEB_ORIGIN, locale: 'en-US' });
    try {
      const page = await context.newPage();
      await page.goto(`/q/${w.tableQr}?lang=en`);
      const [quoted] = await Promise.all([
        page.waitForResponse(r => r.request().method() === 'POST' && r.url() === `${guestUrl(w)}/quote`),
        button(page, `Add ${w.products[0].name}`).click(),
      ]);
      const quote = (await quoted.json()).data;
      expect(quote).toMatchObject({ total: '65.00', discountTotal: '35.00', promotions: [expect.objectContaining({ scope: 'CATEGORY', title: 'Grill 35 off', amount: '35.00' })] });
      await page.getByRole('button', { name: /^View order,/ }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByTestId('cart-quote-total')).toContainText('65');
      await expect(dialog.getByTestId('cart-quote-savings')).toContainText('Grill 35 off');
      expect(await orderCount(w)).toBe(0);

      const [placed] = await Promise.all([
        page.waitForResponse(r => r.request().method() === 'POST' && r.url() === `${guestUrl(w)}/orders`),
        dialog.getByRole('button', { name: /^Send order(?! on WhatsApp)(?:\s|$)/ }).click(),
      ]);
      expect(placed.status(), await placed.text()).toBe(201);
      expect(placed.request().postDataJSON().expectedTotal).toBe('65.00');
      const order = await storedOrder(w, (await placed.json()).data.id);
      expect(order.totalAmount.toFixed(2)).toBe('65.00');
      expect(order.items[0].discountAmount.toFixed(2)).toBe('0.00'); // the beaten legacy discount is not stored
      const [snapshot] = order.promotions;
      expect(snapshot).toMatchObject({ promotionId: promotion.id, scope: 'CATEGORY', discountType: 'FIXED_AMOUNT' });
      expect(snapshot.value.toFixed(2)).toBe('35.00');
      expect(snapshot.amount.toFixed(2)).toBe('35.00');
    } finally {
      await context.close();
    }
  });
});

test.describe('Discount type confirmation in Arabic (RTL, mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: 'ar-EG', hasTouch: true });

  test('shows the RTL confirmation, keeps the layout inside the viewport and sends the confirmation', async ({ page }) => {
    const w = await seedWorld({ defaultLocale: 'ar' });
    const row = await addPromotion(w, { scope: 'MENU', discountType: 'FIXED_AMOUNT', value: '12.50', title: 'خصم القائمة', titleAr: 'خصم القائمة' });
    await signInAndOpen(page, w, ar, row.internalName);
    await expect(input(page, ar.type)).toHaveValue('FIXED_AMOUNT');
    await expect(page.getByText(/يحصل العميل على خصم .* على كل قطعة من أصناف القوائم المختارة/)).toBeVisible();
    await input(page, ar.type).selectOption('PERCENTAGE');
    const confirm = page.getByRole('checkbox', { name: ar.confirmType });
    await expect(confirm).toBeVisible();
    await expect(page.getByText(/ستغيّر نوع الخصم من مبلغ ثابت إلى نسبة مئوية\./)).toBeVisible();
    await expect(page.locator('main, body').first()).toHaveCSS('direction', 'rtl');
    await expectNoHorizontalOverflow(page);
    await expect(button(page, ar.save)).toBeDisabled();
    await page.getByLabel(ar.value).fill('١٢');
    await confirm.check();
    await expect(button(page, ar.save)).toBeEnabled();
    const [converted] = await Promise.all([
      page.waitForResponse(r => r.request().method() === 'PATCH' && r.url() === `${staffUrl(w)}/${row.id}`),
      button(page, ar.save).press('Enter'),
    ]);
    expect(converted.status(), await converted.text()).toBe(200);
    expect(converted.request().postDataJSON()).toMatchObject({ discountType: 'PERCENTAGE', value: '12', confirmDiscountTypeChange: true });
  });
});
