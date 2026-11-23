/* eslint-disable @typescript-eslint/no-require-imports -- The isolated runner resolves its Playwright tools via NODE_PATH (CommonJS only). */
const { test, expect } = require('@playwright/test');
const { prisma, assertDisposableDatabase, seedWorld, createOwner, orderCount, storedOrder } = require('./fixture.cjs');

const en = {
  heading: 'Promotions', create: 'New promotion', save: 'Create inactive', edit: 'Edit promotion',
  activate: 'Activate', activated: 'Promotion activated.', active: 'Active',
  email: 'Email', password: 'Password', signIn: 'Sign in',
  internal: 'Internal name (staff only)', scope: 'Discount scope', type: 'Discount type', value: /^Discount value/,
  title: language => `Title — ${language}`, moreLanguages: 'More guest languages',
  previewType: 'Sample order type', previewZone: 'Sample delivery area', sampleProduct: 'Sample product',
  addSample: 'Add sample product', sampleQuantity: 'Quantity', calculate: 'Calculate savings',
  applied: 'This promotion applies.', saving: 'Saving from this promotion', total: 'Total',
};
const ar = {
  heading: 'العروض الترويجية', create: 'عرض ترويجي جديد', save: 'إنشاء دون تفعيل', edit: 'تعديل العرض الترويجي',
  activate: 'تفعيل', activated: 'تم تفعيل العرض.', active: 'مفعّل',
  email: 'البريد الإلكتروني', password: 'كلمة المرور', signIn: 'تسجيل الدخول',
  internal: 'الاسم الداخلي (للموظفين فقط)', scope: 'نطاق الخصم', type: 'نوع الخصم', value: /^قيمة الخصم/,
  title: language => `العنوان — ${language}`, moreLanguages: 'لغات إضافية للضيف',
  previewType: 'نوع طلب المعاينة', previewZone: 'منطقة توصيل المعاينة', sampleProduct: 'منتج للمعاينة',
  addSample: 'إضافة منتج للمعاينة', sampleQuantity: 'الكمية', calculate: 'حساب الخصم',
  applied: 'ينطبق هذا العرض.', saving: 'الخصم من هذا العرض', total: 'الإجمالي',
};
const button = (container, name) => container.getByRole('button', { name, exact: true });
const text = (container, label) => container.getByText(label, { exact: true });
const input = (container, label) => container.getByLabel(label, { exact: true });
const staffUrl = w => `/api/v1/restaurants/${w.restaurantId}/promotions`;
const guestUrl = w => `/api/v1/public/qr/${w.tableQr}`;

function waitPost(page, path) {
  return page.waitForResponse(response => response.request().method() === 'POST' &&
    response.url() === `${process.env.B4_API_ORIGIN}${path}`, { timeout: 15_000 });
}

async function readData(response, status) {
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(status);
  return body.data;
}

async function clickPost(page, path, control, status) {
  const [response] = await Promise.all([waitPost(page, path), control.click()]);
  return readData(response, status);
}

async function signIn(page, w, copy) {
  const owner = await createOwner(w);
  await page.goto('/login');
  await input(page, copy.email).fill(owner.email);
  await input(page, copy.password).fill(owner.password);
  await Promise.all([
    page.waitForURL(url => url.pathname.startsWith('/staff')),
    button(page, copy.signIn).click(),
  ]);
  await page.goto(`/staff/restaurants/${w.restaurantId}/menu/promotions`);
  await expect(page.getByRole('heading', { name: copy.heading, level: 1 })).toBeVisible();
  await button(page, copy.create).click();
}

async function expectNoHorizontalOverflow(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
}

async function addSample(page, copy, product) {
  await button(page, copy.addSample).click();
  await input(page, copy.sampleProduct).last().selectOption(product.id);
}

async function staffPreview(page, w, copy, created, scenario) {
  const { scope, samples, strategy, original, payable, saving, grand } = scenario;
  await input(page, copy.previewType).selectOption(scope === 'DELIVERY' ? 'DELIVERY' : 'DINE_IN');
  if (scope === 'DELIVERY') await input(page, copy.previewZone).selectOption(w.zoneId);
  await addSample(page, copy, w.products[0]);
  if (scope === 'QUANTITY') {
    // Two units of a single product do not meet a distinct-product threshold.
    const quantity = input(page, copy.sampleQuantity);
    await quantity.fill('2');
    const below = await clickPost(page, `${staffUrl(w)}/preview`, button(page, copy.calculate), 200);
    expect(below).toMatchObject({ appliedSaving: '0.00', diagnostic: { status: 'BELOW_MINIMUM_QUANTITY', remainingQuantity: 1 } });
    await expect(text(page, 'Remaining quantity: 1')).toBeVisible();
    await quantity.fill('1');
  }
  if (samples === 2) await addSample(page, copy, w.products[1]);
  const result = await clickPost(page, `${staffUrl(w)}/preview`, button(page, copy.calculate), 200);
  expect(result).toMatchObject({ strategy, merchandiseOriginal: original, merchandisePayable: payable,
    appliedSaving: saving, grandTotal: grand, diagnostic: { status: 'APPLIED' } });
  const status = page.getByRole('status').filter({ hasText: copy.applied });
  await expect(status).toBeVisible();
  const metric = label => status.locator('dl > div').filter({ has: text(page, label) });
  await expect(metric(copy.saving)).toContainText(`${saving} EGP`);
  await expect(metric(copy.total)).toContainText(`${grand} EGP`);
  if (scope === 'DELIVERY') {
    expect(result).toMatchObject({ deliveryFeeOriginal: '30.00', deliveryFeePayable: '19.50' });
    await expect(metric('Delivery fee before / after savings')).toContainText('30.00 EGP / 19.50 EGP');
  }
  // Preview runs the real engine as if active, but must not write any state.
  const persisted = await prisma.promotion.findUniqueOrThrow({ where: { id: created.id } });
  expect(persisted.status).toBe('INACTIVE');
  expect(persisted.updatedAt.toISOString()).toBe(created.updatedAt);
  expect(await orderCount(w)).toBe(0);
  return { result, status };
}

async function guestCheck(browser, w, promotion, { locale, title, total, saving, placeOrder = false }) {
  const arabic = locale === 'ar';
  const context = await browser.newContext({ baseURL: process.env.B4_WEB_ORIGIN, locale: arabic ? 'ar-EG' : 'en-US' });
  try {
    const page = await context.newPage();
    await page.goto(`/q/${w.tableQr}?lang=${locale}`);
    const add = button(page, arabic ? `إضافة ${w.products[0].nameAr}` : `Add ${w.products[0].name}`);
    const quote = await clickPost(page, `${guestUrl(w)}/quote`, add, 200);
    await page.getByRole('button', { name: arabic ? /^عرض الطلب,/ : /^View order,/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveCSS('direction', arabic ? 'rtl' : 'ltr');
    expect(quote).toMatchObject({ total, discountTotal: saving, promotions: [expect.objectContaining({ title, amount: saving })] });
    const savings = dialog.getByTestId('cart-quote-savings');
    await expect(savings).toContainText(title);
    const whole = total.split('.')[0];
    const displayedAmount = new RegExp(`(?:${whole}|${whole.replace(/\d/g, digit => String.fromCharCode(0x660 + Number(digit)))})`);
    await expect(dialog.getByTestId('cart-quote-total')).toContainText(displayedAmount);
    expect(await orderCount(w)).toBe(0);
    if (!placeOrder) return { locale, quote };

    const [response] = await Promise.all([
      waitPost(page, `${guestUrl(w)}/orders`),
      dialog.getByRole('button', { name: /^Send order(?! on WhatsApp)(?:\s|$)/ }).click(),
    ]);
    const confirmation = await readData(response, 201);
    expect(response.request().postDataJSON().expectedTotal).toBe(quote.total);
    expect(confirmation).toMatchObject({ total, discountTotal: saving,
      promotions: [expect.objectContaining({ title, amount: saving })] });
    const summary = page.getByRole('region', { name: arabic ? 'ملخص الطلب' : 'Order summary' });
    await expect(summary.getByTestId('confirmed-order-total')).toContainText(displayedAmount);
    await expect(text(summary, title)).toBeVisible();
    expect(await orderCount(w)).toBe(1);
    const order = await storedOrder(w, confirmation.id);
    expect(order.totalAmount.toFixed(2)).toBe(total);
    expect(order.promotionDiscountAmount.toFixed(2)).toBe(saving);
    expect(order.discountTotalAmount.toFixed(2)).toBe(saving);
    expect(order.promotions).toHaveLength(1);
    const [snapshot] = order.promotions;
    expect(snapshot).toMatchObject({ promotionId: promotion.id, restaurantId: w.restaurantId, scope: 'CART',
      titleSnapshot: title, internalNameSnapshot: promotion.internalName });
    expect(snapshot.amount.toFixed(2)).toBe(saving);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].discountAmount.toFixed(2)).toBe('0.00');
    expect(snapshot.allocations).toEqual([expect.objectContaining({ orderId: order.id, orderItemId: order.items[0].id })]);
    expect(snapshot.allocations[0].amount.toFixed(2)).toBe(saving);
    return { locale, quote, confirmation, snapshot };
  } finally {
    await context.close();
  }
}

const scenarios = [
  { scope: 'CART', label: 'سلة', defaultLocale: 'ar', mobile: true, discountType: 'FIXED_AMOUNT', value: '35.00',
    samples: 1, strategy: 'CART', original: '100.00', payable: '65.00', saving: '35.00', grand: '65.00' },
  { scope: 'CATEGORY', label: 'Category', defaultLocale: 'ar', discountType: 'PERCENTAGE', value: '35.00',
    target: ['Grill', 'categories', 'categoryId', w => w.products[0].categoryId],
    samples: 2, strategy: 'ITEM', original: '200.00', payable: '145.00', saving: '35.00', grand: '145.00' },
  { scope: 'MENU', label: 'Menu', discountType: 'PERCENTAGE', value: '30.00',
    target: ['Nile Menu', 'menus', 'menuId', w => w.menuId],
    samples: 2, strategy: 'ITEM', original: '200.00', payable: '140.00', saving: '60.00', grand: '140.00' },
  { scope: 'QUANTITY', label: 'Quantity', discountType: 'FIXED_AMOUNT', value: '50.00',
    samples: 2, strategy: 'CART', original: '200.00', payable: '150.00', saving: '50.00', grand: '150.00' },
  { scope: 'DELIVERY', label: 'Delivery fee', discountType: 'FIXED_AMOUNT', value: '10.50',
    target: ['Nile Zone', 'deliveryZones', 'deliveryZoneId', w => w.zoneId],
    samples: 1, strategy: 'ITEM', original: '100.00', payable: '80.00', saving: '10.50', grand: '99.50' },
];

test.beforeAll(assertDisposableDatabase);
test.afterAll(() => prisma.$disconnect());

for (const scenario of scenarios) {
  const { scope, label, defaultLocale = 'en', mobile, discountType, value, target } = scenario;
  test.describe(`Staff Promotions ${scope}`, () => {
    if (mobile) test.use({ viewport: { width: 390, height: 844 }, locale: 'ar-EG', hasTouch: true });

    test('creates inactive, previews against real prices and activates', async ({ page, browser }, info) => {
      const w = await seedWorld({ defaultLocale });
      const copy = mobile ? ar : en;
      const internalName = `B4 Staff ${scope}`;
      const englishTitle = `Staff ${label} saving`;
      const title = defaultLocale === 'ar' ? (scope === 'CART' ? 'خصم السلة من الموظف' : 'خصم المشويات') : englishTitle;
      const direction = mobile ? 'rtl' : 'ltr';
      const language = defaultLocale === 'ar' ? 'العربية' : 'English';
      await signIn(page, w, copy);
      const heading = page.getByRole('heading', { name: copy.create, level: 1 });
      await expect(heading).toHaveCSS('direction', direction);
      const requiredTitle = input(page, copy.title(language));
      await expect(requiredTitle).toHaveAttribute('required', '');
      await expect(requiredTitle).toHaveCSS('direction', defaultLocale === 'ar' ? 'rtl' : 'ltr');
      await requiredTitle.fill(title);
      if (scope === 'CART') {
        await text(page, copy.moreLanguages).click();
        const optionalTitle = input(page, copy.title('English'));
        await expect(optionalTitle).not.toHaveAttribute('required', '');
        await expect(optionalTitle).toHaveCSS('direction', 'ltr');
        await optionalTitle.fill('Staff cart saving');
      }
      await input(page, copy.internal).fill(internalName);
      await input(page, copy.scope).selectOption(scope);
      if (scope === 'CATEGORY' || scope === 'MENU') await expect(input(page, copy.type)).toHaveCount(0);
      else await input(page, copy.type).selectOption(discountType);
      const valueInput = page.getByLabel(copy.value);
      await valueInput.fill(mobile ? '٣٥' : value);
      if (mobile) await expect(valueInput).toHaveValue('35');
      if (target) await page.getByRole('checkbox', { name: target[0], exact: true }).check();
      if (scope === 'QUANTITY') {
        await input(page, 'Minimum quantity').fill('2');
        await input(page, 'Count by').selectOption('DISTINCT_PRODUCTS');
      }
      await expectNoHorizontalOverflow(page);

      const created = await clickPost(page, staffUrl(w), button(page, copy.save), 201);
      expect(created).toMatchObject({ scope, status: 'INACTIVE', internalName, discountType, value,
        translations: expect.arrayContaining([expect.objectContaining({ locale: defaultLocale, title })]) });
      if (scope === 'QUANTITY') expect(created).toMatchObject({ minimumQuantity: 2, quantityBasis: 'DISTINCT_PRODUCTS' });
      await expect(page.getByRole('heading', { name: copy.edit, level: 1 })).toBeVisible();
      const stored = () => prisma.promotion.findFirstOrThrow({ where: { id: created.id, restaurantId: w.restaurantId },
        include: { categories: true, menus: true, deliveryZones: true } });
      const inactive = await stored();
      expect(inactive.status).toBe('INACTIVE');
      if (target) {
        const [, relation, key, targetId] = target;
        expect(inactive[relation]).toEqual([expect.objectContaining({ [key]: targetId(w), restaurantId: w.restaurantId })]);
      }

      const { result: preview, status } = await staffPreview(page, w, copy, created, scenario);
      await expectNoHorizontalOverflow(page);
      await status.scrollIntoViewIfNeeded();
      await info.attach(`${scope.toLowerCase()}-staff-preview`, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
      await button(page, copy.activate).click();
      const dialog = page.getByRole('dialog', { name: copy.activate });
      await expect(dialog).toBeVisible();
      const confirm = button(dialog, copy.activate);
      // The Next dev badge overlaps the bottom-left RTL control at 390px.
      // Exercise the real dialog's keyboard confirmation there; desktop uses the pointer.
      const [activated] = await Promise.all([
        waitPost(page, `${staffUrl(w)}/${created.id}/activate`),
        mobile ? confirm.press('Enter') : confirm.click(),
      ]);
      const active = await readData(activated, 200);
      expect(active).toMatchObject({ id: created.id, status: 'ACTIVE' });
      await expect(text(page, copy.activated)).toBeVisible();
      const row = page.getByRole('list', { name: copy.heading }).getByRole('listitem').filter({ hasText: internalName });
      await expect(text(row, copy.active)).toBeVisible();
      await expect(text(row, label)).toBeVisible();
      await expect(text(row, title)).toBeVisible();
      expect((await stored()).status).toBe('ACTIVE');

      const guest = [];
      if (scope === 'CART') {
        const prices = { title, total: scenario.grand, saving: scenario.saving };
        // Checkout financial copy prefers a translation in the requested Guest locale.
        expect(created.translations).toContainEqual(expect.objectContaining({ locale: 'en', title: 'Staff cart saving' }));
        guest.push(await guestCheck(browser, w, created, { ...prices, locale: 'ar' }));
        guest.push(await guestCheck(browser, w, created, { ...prices, locale: 'en', title: 'Staff cart saving', placeOrder: true }));
      } else if (scope === 'CATEGORY') {
        expect(created.translations).toHaveLength(1);
        guest.push(await guestCheck(browser, w, created, { title, total: '65.00', saving: '35.00', locale: 'en' }));
      }
      await info.attach(`${scope.toLowerCase()}-reconciliation`, {
        body: JSON.stringify({ created, preview, active, guest }, null, 2), contentType: 'application/json',
      });
    });
  });
}
