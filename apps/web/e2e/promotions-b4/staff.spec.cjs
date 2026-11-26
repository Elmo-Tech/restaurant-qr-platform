/* eslint-disable @typescript-eslint/no-require-imports -- The isolated runner resolves its Playwright tools via NODE_PATH (CommonJS only). */
const { test, expect } = require('@playwright/test');
const { prisma, assertDisposableDatabase, seedWorld, createOwner, orderCount, storedOrder } = require('./fixture.cjs');

const en = {
  heading: 'Promotions', create: 'New promotion', save: 'Create inactive', edit: 'Edit promotion',
  activate: 'Activate', activated: 'Promotion activated.', active: 'Active',
  email: 'Email', password: 'Password', signIn: 'Sign in',
  internal: 'Internal name (staff only)', scope: 'Discount scope', type: 'Discount type', value: /^Discount value/,
  title: language => `Title — ${language}`, moreLanguages: 'More guest languages',
  applied: 'The offer works on this example.', needsValue: 'Enter the discount value.',
};
const ar = {
  heading: 'العروض الترويجية', create: 'عرض ترويجي جديد', save: 'إنشاء دون تفعيل', edit: 'تعديل العرض الترويجي',
  activate: 'تفعيل', activated: 'تم تفعيل العرض.', active: 'مفعّل',
  email: 'البريد الإلكتروني', password: 'كلمة المرور', signIn: 'تسجيل الدخول',
  internal: 'الاسم الداخلي (للموظفين فقط)', scope: 'نطاق الخصم', type: 'نوع الخصم', value: /^قيمة الخصم/,
  title: language => `العنوان — ${language}`, moreLanguages: 'لغات إضافية للضيف',
  applied: 'يعمل العرض في هذا المثال.', needsValue: 'أدخل قيمة الخصم.',
  // DEC-077 B2: a new CART promotion needs a minimum order amount above 0.
  minimum: 'الحد الأدنى لمبلغ الطلب قبل الخصومات (مطلوب)', minimumRequired: 'أدخل حدًا أدنى لمبلغ الطلب أكبر من 0.',
  minimumPositive: 'يجب أن يكون الحد الأدنى لمبلغ الطلب أكبر من 0.', minimumPreview: 'راجع الحد الأدنى لمبلغ الطلب.',
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
    page.waitForURL(url => url.pathname === `/staff/restaurants/${w.restaurantId}`),
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

const previewPath = w => `${process.env.B4_API_ORIGIN}${staffUrl(w)}/preview`;

/** Records every automatic preview request so the test can prove only real catalog IDs are sent. */
function recordPreviewRequests(page, w) {
  const bodies = [];
  page.on('request', request => {
    if (request.method() === 'POST' && request.url() === previewPath(w)) bodies.push(request.postDataJSON());
  });
  return bodies;
}

function waitPreview(page, w, matches) {
  return page.waitForResponse(response => response.request().method() === 'POST' && response.url() === previewPath(w) &&
    matches(response.request().postDataJSON()), { timeout: 15_000 });
}

/** The automatic preview of the saved promotion: no selectors, no Calculate button. */
async function staffPreview(page, w, copy, created, scenario, response) {
  const { scope } = scenario;
  const result = await readData(response, 200);
  const body = response.request().postDataJSON();
  expect(body).toMatchObject({ contract: 'CONTEXTUAL_V1', promotionId: created.id, branchId: w.branchId,
    orderType: scope === 'DELIVERY' ? 'DELIVERY' : 'PICKUP' });
  expect(body.items).toBeUndefined(); // the Backend constructs the example basket
  expect(body.deliveryZoneId).toBe(scope === 'DELIVERY' ? w.zoneId : undefined);
  expect(result).toMatchObject({ state: 'REAL', requestId: body.requestId });
  const example = result.examples.find(item => item.kind === 'QUALIFYING' || item.kind === 'SINGLE');
  expect(example).toBeDefined();
  expect(example).toMatchObject({ strategy: scenario.strategy, merchandiseOriginal: scenario.original,
    merchandisePayable: scenario.payable, appliedSaving: scenario.saving, grandTotal: scenario.grand,
    diagnostic: { status: 'APPLIED' } });
  const card = page.getByTestId('savings-preview');
  const rendered = card.getByTestId(`savings-preview-example-${example.kind}`);
  const status = rendered.getByTestId('savings-preview-diagnostic');
  await expect(card).toHaveAttribute('data-state', 'REAL');
  await expect(status).toHaveAttribute('data-status', example.diagnostic.status);
  await expect(rendered.getByTestId('savings-preview-payable')).toContainText(`${scope === 'DELIVERY' ? example.deliveryFeePayable : example.merchandisePayable} EGP`);
  if (example.diagnostic.status === 'APPLIED') {
    await expect(rendered.getByTestId('savings-preview-saving')).toContainText(`${example.appliedSaving} EGP`);
  }
  if (scope === 'DELIVERY') {
    expect(example).toMatchObject({ deliveryFeeOriginal: '30.00', deliveryFeePayable: '19.50' });
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

// The preview picks its own example: the first eligible item in menu order (Kofta), or as many
// distinct items as a quantity threshold needs. Kofta carries a 20% Product discount, so a promotion
// must save more than 20.00 to win the item.
const one = w => [{ productId: w.products[0].id, quantity: 1 }];
const scenarios = [
  { scope: 'CART', label: 'سلة', defaultLocale: 'ar', mobile: true, discountType: 'FIXED_AMOUNT', value: '35.00',
    items: one, strategy: 'CART', original: '100.00', payable: '65.00', saving: '35.00', grand: '65.00' },
  { scope: 'CART', label: 'سلة', defaultLocale: 'ar', mobile: true, discountType: 'PERCENTAGE', value: '35.00',
    items: one, strategy: 'CART', original: '100.00', payable: '65.00', saving: '35.00', grand: '65.00' },
  { scope: 'CATEGORY', label: 'Category', defaultLocale: 'ar', discountType: 'PERCENTAGE', value: '35.00',
    target: ['Grill', 'categories', 'categoryId', w => w.products[0].categoryId],
    items: one, strategy: 'ITEM', original: '100.00', payable: '65.00', saving: '35.00', grand: '65.00' },
  { scope: 'MENU', label: 'Menu', discountType: 'PERCENTAGE', value: '30.00',
    target: ['Nile Menu', 'menus', 'menuId', w => w.menuId],
    items: one, strategy: 'ITEM', original: '100.00', payable: '70.00', saving: '30.00', grand: '70.00' },
  // DEC-077 B1: the same two item scopes with a fixed amount per purchased unit (35.00 beats Kofta's 20 % Product discount).
  { scope: 'CATEGORY', label: 'Category', defaultLocale: 'ar', discountType: 'FIXED_AMOUNT', value: '35.00',
    target: ['Grill', 'categories', 'categoryId', w => w.products[0].categoryId],
    items: one, strategy: 'ITEM', original: '100.00', payable: '65.00', saving: '35.00', grand: '65.00' },
  { scope: 'MENU', label: 'Menu', discountType: 'FIXED_AMOUNT', value: '30.00',
    target: ['Nile Menu', 'menus', 'menuId', w => w.menuId],
    items: one, strategy: 'ITEM', original: '100.00', payable: '70.00', saving: '30.00', grand: '70.00' },
  { scope: 'QUANTITY', label: 'Quantity', discountType: 'FIXED_AMOUNT', value: '50.00',
    items: w => w.products.map(({ id }) => ({ productId: id, quantity: 1 })),
    strategy: 'CART', original: '200.00', payable: '150.00', saving: '50.00', grand: '150.00' },
  { scope: 'QUANTITY', label: 'Quantity', discountType: 'PERCENTAGE', value: '35.00',
    items: w => w.products.map(({ id }) => ({ productId: id, quantity: 1 })),
    strategy: 'CART', original: '200.00', payable: '130.00', saving: '70.00', grand: '130.00' },
  { scope: 'DELIVERY', label: 'Delivery fee', discountType: 'FIXED_AMOUNT', value: '10.50',
    target: ['Nile Zone', 'deliveryZones', 'deliveryZoneId', w => w.zoneId],
    items: one, strategy: 'ITEM', original: '100.00', payable: '80.00', saving: '10.50', grand: '99.50' },
  { scope: 'DELIVERY', label: 'Delivery fee', discountType: 'PERCENTAGE', value: '35.00',
    target: ['Nile Zone', 'deliveryZones', 'deliveryZoneId', w => w.zoneId],
    items: one, strategy: 'ITEM', original: '100.00', payable: '80.00', saving: '10.50', grand: '99.50' },
];

test.use({ viewport: { width: 1280, height: 900 } });
test.beforeAll(assertDisposableDatabase);
test.afterAll(() => prisma.$disconnect());

for (const scenario of scenarios) {
  const { scope, label, defaultLocale = 'en', mobile, discountType, value, target } = scenario;
  test.describe(`Staff Promotions ${scope} ${discountType}`, () => {
    if (mobile) test.use({ viewport: { width: 390, height: 844 }, locale: 'ar-EG', hasTouch: true });

    test('creates inactive, previews against real prices and activates', async ({ page, browser }, info) => {
      const w = await seedWorld({ defaultLocale });
      const copy = mobile ? ar : en;
      const internalName = `B4 Staff ${scope}`;
      const englishTitle = `Staff ${label} saving`;
      const title = defaultLocale === 'ar' ? (scope === 'CART' ? 'خصم السلة من الموظف' : 'خصم المشويات') : englishTitle;
      const direction = mobile ? 'rtl' : 'ltr';
      const language = defaultLocale === 'ar' ? 'العربية' : 'English';
      const sent = recordPreviewRequests(page, w);
      await signIn(page, w, copy);
      const card = page.getByTestId('savings-preview');
      // A blank draft explains what is missing instead of showing a number.
      await expect(card).toHaveAttribute('data-state', 'INCOMPLETE');
      await expect(text(card, copy.needsValue)).toBeVisible();
      await expect(card.getByTestId('savings-preview-payable')).toHaveCount(0);
      await expect(card).toHaveCSS('direction', direction);
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
      // DEC-077 B1: every scope offers both discount types (the runner enables the fixed item write gate).
      await expect(input(page, copy.type)).toHaveCount(1);
      await input(page, copy.type).selectOption(discountType);
      const valueInput = page.getByLabel(copy.value);
      await valueInput.fill(mobile ? '٣٥' : value);
      if (mobile) await expect(valueInput).toHaveValue('35');
      if (scope === 'CART') {
        // DEC-077 B2: without a minimum above 0 the draft is visibly not ready: guidance (RTL), no preview figure, no save.
        const minimum = input(page, copy.minimum);
        await expect(minimum).toHaveAttribute('aria-required', 'true');
        await expect(minimum).toHaveAttribute('aria-invalid', 'true');
        await expect(text(page, copy.minimumRequired)).toBeVisible();
        await expect(text(page, copy.minimumRequired)).toHaveCSS('direction', 'rtl');
        await expect(button(page, copy.save)).toBeDisabled();
        await expect(card).toContainText(copy.minimumPreview);
        await expect(card.getByTestId('savings-preview-saving')).toHaveCount(0);
        await minimum.fill('٠');
        await expect(minimum).toHaveValue('0');
        await expect(text(page, copy.minimumPositive)).toBeVisible();
        await expect(button(page, copy.save)).toBeDisabled();
        await minimum.fill('٥٠'); // Arabic-Indic digits are normalized before they reach the API
        await expect(minimum).toHaveValue('50');
        await expect(minimum).not.toHaveAttribute('aria-invalid', 'true');
        await expect(button(page, copy.save)).toBeEnabled();
      }
      if (target) await page.getByRole('checkbox', { name: target[0], exact: true }).check();
      if (scope === 'QUANTITY') {
        await input(page, 'Minimum quantity').fill('2');
        await input(page, 'Count by').selectOption('DISTINCT_PRODUCTS');
      }
      await expectNoHorizontalOverflow(page);
      // The unsaved draft previews by itself, with no button to press.
      await expect(card).toHaveAttribute('data-state', 'REAL');
      await expect(card.getByTestId('savings-preview-result')).toHaveAttribute('data-fresh', 'true');
      await expect(card.getByTestId('savings-preview-diagnostic').filter({ hasText: copy.applied }).first()).toBeVisible();
      const [form, side] = await Promise.all([page.locator('form').filter({ has: button(page, copy.save) }).boundingBox(), card.boundingBox()]);
      if (mobile) {
        // Full width below the editor on a phone.
        expect(side.y).toBeGreaterThanOrEqual(form.y + form.height);
        expect(Math.abs(side.width - form.width)).toBeLessThanOrEqual(2);
      } else {
        // Sticky sidebar beside the editor on desktop.
        expect(side.x).toBeGreaterThan(form.x + form.width - 1);
        await expect(page.locator('aside').filter({ has: card })).toHaveCSS('position', 'sticky');
      }

      const savedPreview = waitPreview(page, w, body => body.promotionId !== undefined);
      const created = await clickPost(page, staffUrl(w), button(page, copy.save), 201);
      expect(created).toMatchObject({ scope, status: 'INACTIVE', internalName, discountType, value,
        translations: expect.arrayContaining([expect.objectContaining({ locale: defaultLocale, title })]) });
      if (scope === 'QUANTITY') expect(created).toMatchObject({ minimumQuantity: 2, quantityBasis: 'DISTINCT_PRODUCTS' });
      if (scope === 'CART') expect(created).toMatchObject({ minimumSubtotal: '50.00', needsMinimumSubtotal: false });
      await expect(page.getByRole('heading', { name: copy.edit, level: 1 })).toBeVisible();
      const stored = () => prisma.promotion.findFirstOrThrow({ where: { id: created.id, restaurantId: w.restaurantId },
        include: { categories: true, menus: true, deliveryZones: true } });
      const inactive = await stored();
      expect(inactive.status).toBe('INACTIVE');
      if (target) {
        const [, relation, key, targetId] = target;
        expect(inactive[relation]).toEqual([expect.objectContaining({ [key]: targetId(w), restaurantId: w.restaurantId })]);
      }

      const { result: preview, status } = await staffPreview(page, w, copy, created, scenario, await savedPreview);
      const catalog = new Set(w.products.map(({ id }) => id));
      expect(sent.length).toBeGreaterThan(0);
      for (const body of sent) {
        expect(body.contract).toBe('CONTEXTUAL_V1');
        expect(body.items).toBeUndefined();
      }
      for (const example of preview.examples) {
        for (const item of example.lines) expect(catalog.has(item.productId)).toBe(true);
      }
      await expectNoHorizontalOverflow(page);
      await status.scrollIntoViewIfNeeded();
      const screenshot = info.outputPath(`${mobile ? 'arabic-390' : 'english-1280'}-${scope.toLowerCase()}-${discountType.toLowerCase()}.png`);
      await page.screenshot({ path: screenshot, animations: 'disabled', fullPage: true });
      await info.attach(`${scope.toLowerCase()}-staff-preview`, { path: screenshot, contentType: 'image/png' });
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
      const scopeLabel = mobile ? 'إجمالي الطلب' : ({ CATEGORY: 'Items in a category', MENU: 'Items in a menu',
        QUANTITY: 'Number of items', DELIVERY: 'Delivery fee' })[scope];
      await expect(text(row, scopeLabel)).toBeVisible();
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

test('preview discards a late answer and hides previous prices after failure', async ({ page }) => {
  const w = await seedWorld();
  await signIn(page, w, en);
  await input(page, en.internal).fill('Preview freshness');
  await input(page, en.title('English')).fill('Preview freshness');
  const value = page.getByLabel(en.value);
  const card = page.getByTestId('savings-preview');
  await page.getByLabel('Minimum order amount before discounts (required)').fill('50');
  await value.fill('35');
  await expect(card).toHaveAttribute('data-state', 'REAL');
  await expect(card.getByTestId('savings-preview-result')).toHaveAttribute('data-fresh', 'true');

  let releaseOld;
  const oldGate = new Promise(resolve => { releaseOld = resolve; });
  let sawOld;
  const oldStarted = new Promise(resolve => { sawOld = resolve; });
  let oldFinished;
  const oldDelivered = new Promise(resolve => { oldFinished = resolve; });
  await page.route(previewPath(w), async route => {
    const request = route.request().postDataJSON();
    if (request.draft.value === '36') {
      const response = await route.fetch();
      sawOld();
      await oldGate;
      await route.fulfill({ response }).catch(() => {});
      oldFinished();
    } else if (request.draft.value === '37') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    } else {
      await route.continue();
    }
  });
  try {
    await value.fill('36');
    await oldStarted;
    await expect(card.getByTestId('savings-preview-stale')).toBeVisible();
    await expect(card.getByTestId('savings-preview-result')).toHaveAttribute('data-fresh', 'false');
    await expect(card.getByTestId('savings-preview-result')).toHaveAttribute('inert', '');
    await value.fill('37');
    await expect(card.getByRole('alert')).toBeVisible();
    await expect(card.getByTestId('savings-preview-result')).toHaveCount(0);
    await expect(card.getByTestId('savings-preview-payable')).toHaveCount(0);
    releaseOld();
    await oldDelivered;
    await expect(card.getByRole('alert')).toBeVisible();
    await expect(card.getByTestId('savings-preview-result')).toHaveCount(0);
  } finally {
    releaseOld();
  }
});

test('keyboard opens advanced settings at 200% CSS zoom', async ({ page }, info) => {
  const w = await seedWorld();
  await signIn(page, w, en);
  // CSS zoom exercises the enlarged layout; it is not a substitute for manual browser text-zoom QA.
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const advanced = page.getByTestId('promotion-advanced');
  const summary = advanced.locator('summary');
  await expect(advanced).not.toHaveAttribute('open', '');
  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(advanced).toHaveAttribute('open', '');
  await page.keyboard.press('Tab');
  const priority = page.getByLabel('Priority (0–1000)', { exact: true });
  await expect(priority).toBeFocused();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('7');
  await expect(priority).toHaveValue('7');
  const screenshot = info.outputPath('english-1280-keyboard-200-percent-css-zoom.png');
  await page.screenshot({ path: screenshot, animations: 'disabled', fullPage: true });
  await info.attach('keyboard-200-percent-css-zoom', { path: screenshot, contentType: 'image/png' });
});

test('quantity preview shows both quantity and amount shortfalls', async ({ page }) => {
  const w = await seedWorld();
  await signIn(page, w, en);
  await input(page, en.internal).fill('Quantity and amount');
  await input(page, en.title('English')).fill('Quantity and amount');
  await input(page, en.scope).selectOption('QUANTITY');
  await page.getByLabel(en.value).fill('35');
  await input(page, 'Minimum quantity').fill('3');
  await input(page, 'Count by').selectOption('DISTINCT_PRODUCTS');
  const response = waitPreview(page, w, body => body.draft.minimumSubtotal === '20000');
  await input(page, 'Minimum order amount (optional)').fill('20000');
  const answer = await readData(await response, 200);
  const below = answer.examples.find(example => example.kind === 'BELOW_THRESHOLD');
  expect(below.diagnostic).toMatchObject({ status: 'BELOW_MINIMUM_QUANTITY', remainingQuantity: 1, remainingAmount: '200.00' });
  const card = page.getByTestId('savings-preview-example-BELOW_THRESHOLD');
  await expect(card.getByTestId('savings-preview-diagnostic')).toContainText('1 more items');
  await expect(card).toContainText('200.00 EGP');
  await expect(card).toContainText('short of the minimum amount');
});

test.describe('Arabic preview on a 360px phone', () => {
  test.use({ viewport: { width: 360, height: 800 }, locale: 'ar-EG', hasTouch: true });
  test('real threshold examples and illustrative fallback remain labelled', async ({ page }, info) => {
    const w = await seedWorld({ defaultLocale: 'ar' });
    await signIn(page, w, ar);
    await input(page, ar.internal).fill('Preview threshold');
    await input(page, ar.title('العربية')).fill('معاينة الحد الأدنى');
    await input(page, ar.scope).selectOption('CART');
    await page.getByLabel(ar.value).fill('35');
    await page.getByLabel(ar.minimum).fill('150');
    const card = page.getByTestId('savings-preview');
    await expect(card).toHaveAttribute('data-state', 'REAL');
    await expect(card.getByTestId('savings-preview-example-BELOW_THRESHOLD')).toBeVisible();
    await expect(card.getByTestId('savings-preview-example-QUALIFYING')).toBeVisible();
    await expect(card).toHaveCSS('direction', 'rtl');
    await expectNoHorizontalOverflow(page);
    await card.scrollIntoViewIfNeeded();
    const realScreenshot = info.outputPath('arabic-360-real-preview.png');
    await page.screenshot({ path: realScreenshot, animations: 'disabled', fullPage: true });
    await info.attach('arabic-360-real-preview', { path: realScreenshot, contentType: 'image/png' });

    // Remove all orderable items only in this runner's verified disposable database.
    await prisma.product.updateMany({ where: { restaurantId: w.restaurantId }, data: { status: 'INACTIVE' } });
    await card.getByRole('button', { name: 'تحديث', exact: true }).click();
    await expect(card).toHaveAttribute('data-state', 'ILLUSTRATIVE');
    await expect(card.getByTestId('savings-preview-illustrative')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const illustrativeScreenshot = info.outputPath('arabic-360-illustrative-preview.png');
    await page.screenshot({ path: illustrativeScreenshot, animations: 'disabled', fullPage: true });
    await info.attach('arabic-360-illustrative-preview', { path: illustrativeScreenshot, contentType: 'image/png' });
  });
});
