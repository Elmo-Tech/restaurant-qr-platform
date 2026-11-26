/* eslint-disable @typescript-eslint/no-require-imports -- The isolated runner resolves its Playwright tools via NODE_PATH (CommonJS only). */
const { test, expect } = require('@playwright/test');
const { prisma, assertDisposableDatabase, seedWorld, addPromotion, createOwner, orderCount, storedOrder } = require('./fixture.cjs');

/**
 * DEC-077 B2 browser-to-API checks for the mandatory CART minimum: a legacy CART promotion (no minimum) keeps applying
 * and stays editable as metadata but is refused, with the editor's message, for a pricing change until a valid minimum
 * is saved; the Guest threshold behaves exactly at the boundary (equality qualifies, one cent short does not) and
 * checkout / snapshot follow. Kofta costs 100.00 and carries a 20 % Product discount, so a 35.00 cart promotion wins
 * the item path when it applies, and the 80.00 legacy price stands when it does not.
 */
const en = {
  heading: 'Promotions', email: 'Email', password: 'Password', signIn: 'Sign in', edit: 'Edit', save: 'Save',
  internal: 'Internal name (staff only)', value: /^Discount value/, minimumOptional: 'Minimum order amount (optional)',
  legacyNotice: /has no minimum order amount/,
  required: 'Enter a minimum order amount greater than 0 to save or activate this cart promotion.',
};
const ar = {
  heading: 'العروض الترويجية', email: 'البريد الإلكتروني', password: 'كلمة المرور', signIn: 'تسجيل الدخول', edit: 'تعديل',
  save: 'حفظ', internal: 'الاسم الداخلي (للموظفين فقط)', legacyNotice: /هذا العرض بلا حد أدنى لمبلغ الطلب/,
  minimumOptional: 'الحد الأدنى لمبلغ الطلب (اختياري)', value: /^قيمة الخصم/,
  required: 'أدخل حدًا أدنى لمبلغ الطلب أكبر من 0 لحفظ عرض السلة هذا أو تفعيله.',
};
const button = (container, name) => container.getByRole('button', { name, exact: true });
const input = (container, label) => container.getByLabel(label, { exact: true });
const staffUrl = w => `${process.env.B4_API_ORIGIN}/api/v1/restaurants/${w.restaurantId}/promotions`;
const guestUrl = w => `${process.env.B4_API_ORIGIN}/api/v1/public/qr/${w.tableQr}`;
const stored = id => prisma.promotion.findUniqueOrThrow({ where: { id } });

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

const saveAndWait = (page, w, id, copy) => Promise.all([
  page.waitForResponse(r => r.request().method() === 'PATCH' && r.url() === `${staffUrl(w)}/${id}`),
  button(page, copy.save).click(),
]).then(([response]) => response);

async function guestQuote(browser, w, locale = 'en') {
  const context = await browser.newContext({ baseURL: process.env.B4_WEB_ORIGIN, locale: locale === 'ar' ? 'ar-EG' : 'en-US' });
  try {
    const page = await context.newPage();
    await page.goto(`/q/${w.tableQr}?lang=${locale}`);
    const [quoted] = await Promise.all([
      page.waitForResponse(r => r.request().method() === 'POST' && r.url() === `${guestUrl(w)}/quote`),
      button(page, locale === 'ar' ? `إضافة ${w.products[0].nameAr}` : `Add ${w.products[0].name}`).click(),
    ]);
    return (await quoted.json()).data;
  } finally {
    await context.close();
  }
}

test.use({ viewport: { width: 1280, height: 900 } });
test.beforeAll(assertDisposableDatabase);
test.afterAll(() => prisma.$disconnect());

test.describe('Legacy CART promotion in the Staff editor (LTR desktop)', () => {
  test('keeps applying, stays editable as metadata, and needs a valid minimum for a pricing change', async ({ page, browser }) => {
    const w = await seedWorld();
    // A pre-B2 promotion: ACTIVE, 35.00 off the cart, no minimum at all.
    const legacy = await addPromotion(w, { scope: 'CART', discountType: 'FIXED_AMOUNT', value: '35.00', title: 'Legacy cart 35', priority: 7 });
    expect(legacy.minimumSubtotal).toBeNull();
    // Before Staff touch anything it prices the cart exactly as before.
    expect(await guestQuote(browser, w)).toMatchObject({ total: '65.00', discountTotal: '35.00',
      promotions: [expect.objectContaining({ title: 'Legacy cart 35', amount: '35.00' })] });

    await signInAndOpen(page, w, en, legacy.internalName);
    await expect(page.getByText(en.legacyNotice)).toBeVisible();
    await expect(input(page, en.minimumOptional)).toHaveValue('');
    await expect(button(page, en.save)).toBeDisabled(); // nothing changed yet

    // Metadata only: allowed. The form re-sends the stored values; the Backend sees nothing but a new name.
    await input(page, en.internal).fill('Legacy cart 35 (renamed)');
    await expect(button(page, en.save)).toBeEnabled();
    const renamed = await saveAndWait(page, w, legacy.id, en);
    expect(renamed.status(), await renamed.text()).toBe(200);
    expect(renamed.request().postDataJSON()).toMatchObject({ scope: 'CART', discountType: 'FIXED_AMOUNT', value: '35.00', priority: 7, minimumSubtotal: null });
    expect(await stored(legacy.id)).toMatchObject({ internalName: 'Legacy cart 35 (renamed)', status: 'ACTIVE', priority: 7, minimumSubtotal: null });
    await expect(page.getByText(en.legacyNotice)).toBeVisible();

    // A pricing change without a valid minimum is refused by the Backend; the editor says why and nothing is written.
    await page.getByLabel(en.value).fill('40');
    const refused = await saveAndWait(page, w, legacy.id, en);
    expect(refused.status()).toBe(422);
    expect((await refused.json()).error).toMatchObject({ code: 'PROMOTION_INVALID',
      details: { problems: [expect.objectContaining({ code: 'MINIMUM_SUBTOTAL_REQUIRED', field: 'minimumSubtotal' })] } });
    await expect(page.getByText(en.required)).toBeVisible();
    expect((await stored(legacy.id)).value.toFixed(2)).toBe('35.00');
    expect(await guestQuote(browser, w)).toMatchObject({ total: '65.00' }); // still the old price

    // With a valid minimum the same change is saved, and the promotion stops being legacy.
    await input(page, en.minimumOptional).fill('100');
    const saved = await saveAndWait(page, w, legacy.id, en);
    expect(saved.status(), await saved.text()).toBe(200);
    expect((await saved.json()).data).toMatchObject({ minimumSubtotal: '100.00', value: '40.00', needsMinimumSubtotal: false });
    expect(await stored(legacy.id)).toMatchObject({ minimumSubtotal: expect.anything(), priority: 7 });
    await expect(page.getByText(en.legacyNotice)).toHaveCount(0);
    // 100.00 of merchandise meets a 100.00 minimum exactly (equality qualifies): the new 40.00 applies.
    expect(await guestQuote(browser, w)).toMatchObject({ total: '60.00', discountTotal: '40.00' });
  });
});

test.describe('Legacy CART notice in Arabic (RTL, mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: 'ar-EG', hasTouch: true });

  test('explains the rule in Arabic, keeps the layout inside the viewport and refuses a pricing change with the Arabic message', async ({ page }) => {
    const w = await seedWorld({ defaultLocale: 'ar' });
    const legacy = await addPromotion(w, { scope: 'CART', discountType: 'PERCENTAGE', value: '10.00', title: 'خصم السلة القديم', titleAr: 'خصم السلة القديم' });
    await signInAndOpen(page, w, ar, legacy.internalName);
    const notice = page.getByText(ar.legacyNotice);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveCSS('direction', 'rtl');
    await expect(input(page, ar.minimumOptional)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(button(page, ar.save)).toBeDisabled();
    await page.getByLabel(ar.value).fill('١٢');
    const refused = await saveAndWait(page, w, legacy.id, ar);
    expect(refused.status()).toBe(422);
    await expect(page.getByText(ar.required)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect((await stored(legacy.id)).value.toFixed(2)).toBe('10.00');
  });
});

test.describe('Guest threshold, checkout and snapshot at the minimum boundary', () => {
  test('equality qualifies: the quote, the order total and the snapshot follow the CART promotion', async ({ browser }) => {
    const w = await seedWorld();
    const promotion = await addPromotion(w, { scope: 'CART', discountType: 'FIXED_AMOUNT', value: '35.00', title: 'Boundary cart 35', minimumSubtotal: '100.00' });
    const context = await browser.newContext({ baseURL: process.env.B4_WEB_ORIGIN, locale: 'en-US' });
    try {
      const page = await context.newPage();
      await page.goto(`/q/${w.tableQr}?lang=en`);
      const [quoted] = await Promise.all([
        page.waitForResponse(r => r.request().method() === 'POST' && r.url() === `${guestUrl(w)}/quote`),
        button(page, `Add ${w.products[0].name}`).click(),
      ]);
      const quote = (await quoted.json()).data;
      expect(quote).toMatchObject({ total: '65.00', discountTotal: '35.00', promotionProgress: [],
        promotions: [expect.objectContaining({ title: 'Boundary cart 35', amount: '35.00' })] });
      await page.getByRole('button', { name: /^View order,/ }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByTestId('cart-quote-savings')).toContainText('Boundary cart 35');
      await expect(dialog.getByTestId('promotion-progress')).toHaveCount(0);
      expect(await orderCount(w)).toBe(0);
      const [placed] = await Promise.all([
        page.waitForResponse(r => r.request().method() === 'POST' && r.url() === `${guestUrl(w)}/orders`),
        dialog.getByRole('button', { name: /^Send order(?! on WhatsApp)(?:\s|$)/ }).click(),
      ]);
      expect(placed.status(), await placed.text()).toBe(201);
      expect(placed.request().postDataJSON().expectedTotal).toBe('65.00');
      const order = await storedOrder(w, (await placed.json()).data.id);
      expect(order.totalAmount.toFixed(2)).toBe('65.00');
      const [snapshot] = order.promotions;
      expect(snapshot).toMatchObject({ promotionId: promotion.id, scope: 'CART', discountType: 'FIXED_AMOUNT' });
      expect(snapshot.amount.toFixed(2)).toBe('35.00');
      expect(order.items[0].discountAmount.toFixed(2)).toBe('0.00'); // the beaten legacy Product discount is not stored
    } finally {
      await context.close();
    }
  });

  test('one cent short does not qualify: the legacy price stands and the cart shows what is missing', async ({ browser }) => {
    const w = await seedWorld();
    await addPromotion(w, { scope: 'CART', discountType: 'FIXED_AMOUNT', value: '35.00', title: 'Boundary cart 35', minimumSubtotal: '100.01' });
    const context = await browser.newContext({ baseURL: process.env.B4_WEB_ORIGIN, locale: 'en-US' });
    try {
      const page = await context.newPage();
      await page.goto(`/q/${w.tableQr}?lang=en`);
      const [quoted] = await Promise.all([
        page.waitForResponse(r => r.request().method() === 'POST' && r.url() === `${guestUrl(w)}/quote`),
        button(page, `Add ${w.products[0].name}`).click(),
      ]);
      const quote = (await quoted.json()).data;
      expect(quote).toMatchObject({ total: '80.00', discountTotal: '20.00', promotions: [],
        promotionProgress: [expect.objectContaining({ scope: 'CART', status: 'BELOW_MINIMUM_SUBTOTAL',
          subtotal: expect.objectContaining({ current: '100.00', required: '100.01', remaining: '0.01' }) })] });
      await page.getByRole('button', { name: /^View order,/ }).click();
      const dialog = page.getByRole('dialog');
      const progress = dialog.getByTestId('promotion-progress');
      await expect(progress).toBeVisible();
      await expect(progress).toContainText('Boundary cart 35');
      await expect(progress).toContainText('0.01');
      const [placed] = await Promise.all([
        page.waitForResponse(r => r.request().method() === 'POST' && r.url() === `${guestUrl(w)}/orders`),
        dialog.getByRole('button', { name: /^Send order(?! on WhatsApp)(?:\s|$)/ }).click(),
      ]);
      expect(placed.status(), await placed.text()).toBe(201);
      const order = await storedOrder(w, (await placed.json()).data.id);
      expect(order.totalAmount.toFixed(2)).toBe('80.00');
      expect(order.promotions).toHaveLength(0);
      expect(order.items[0].discountAmount.toFixed(2)).toBe('20.00'); // the legacy Product discount, exactly as before
    } finally {
      await context.close();
    }
  });
});
