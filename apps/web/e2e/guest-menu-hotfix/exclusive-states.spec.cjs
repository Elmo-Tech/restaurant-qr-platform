/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Playwright fixture. */
const { test, expect } = require('@playwright/test');
const { ARIA, NAMES, SCENARIOS, measure, openMenu } = require('./helpers.cjs');

test.use({ hasTouch: true });

const designs = {
  verde: { attribute: 'data-verde-theme', switcher: '.v-view-switch', views: ['photos', 'quick'] },
  sherbiny: { attribute: 'data-s-theme', views: ['default'] },
  makkboz: { attribute: 'data-m-theme', switcher: '.m-view-switch', views: ['cards', 'list'] },
  meatlovers: { attribute: 'data-ml-theme', switcher: '.ml-view-switch', views: ['cards', 'list'] },
};
for (const scenario of SCENARIOS) {
  if (!designs[scenario]) designs[scenario] = { views: ['default'] };
}
const appearanceOf = { signature: 'dark', night: 'dark', dark: 'dark', paper: 'light', light: 'light' };
const productId = '00000000-0000-4000-8000-000000000001';

async function selectAppearance(page, design, appearance) {
  if (!design.attribute) {
    await expect(page.locator('[data-guest-theme]').first()).toHaveAttribute('data-guest-theme', appearance);
    return;
  }
  const root = page.locator(`[${design.attribute}]`).first();
  const current = async () => appearanceOf[await root.getAttribute(design.attribute)];
  if (design.attribute === 'data-verde-theme') {
    await expect.poll(current, { timeout: 30000 }).toBe(appearance);
    return;
  }
  await expect(async () => {
    if (await current() !== appearance) {
      await page.getByRole('button', { name: /^(Dark|Light) mode$/ }).first().click();
    }
    await expect.poll(current, { timeout: 1500 }).toBe(appearance);
  }).toPass({ timeout: 30000 });
}

async function checkCount(count, context) {
  await expect(count).toBeVisible();
  const chain = await count.evaluate((element) => {
    const nodes = [];
    for (let node = element; node; node = node.parentElement) {
      const cs = getComputedStyle(node);
      nodes.push({ tag: node.tagName, className: String(node.className), color: cs.color, background: cs.backgroundColor,
        image: cs.backgroundImage, opacity: Number(cs.opacity), visibility: cs.visibility });
    }
    return nodes;
  });
  for (const node of chain) {
    expect(node.opacity, `${context}: ancestor ${node.tag}.${node.className} opacity`).toBe(1);
    expect(node.visibility, `${context}: visibility`).toBe('visible');
  }
  // The measured count background must be solid; a gradient requires pixel-based analysis instead.
  for (const node of chain) {
    expect(node.image, `${context}: background image`).toBe('none');
    if (!node.background.endsWith(', 0)') && node.background !== 'transparent') break;
  }
  const colors = await measure(count);
  expect(colors.ratio, `${context}: ${JSON.stringify({ ...colors, chain: chain.slice(0, 3) })}`).toBeGreaterThanOrEqual(4.5);
  console.log(`${context}: ${colors.fg} on ${colors.bg}, ${colors.ratio.toFixed(2)}:1, opacity 1`);
}

for (const [name, design] of Object.entries(designs)) {
  for (const appearance of ['dark', 'light']) {
    test(`${name} ${appearance}: count, hover, pressed and touch`, async ({ page, context, baseURL }) => {
      test.setTimeout(180000);
      await openMenu(page, context, baseURL, name, 'en', appearance);
      const cdp = await context.newCDPSession(page);
      for (const [viewIndex, view] of design.views.entries()) {
        for (const quantity of [1, 2, 10, 99]) {
          await page.evaluate(({ code, productId: id, quantity: q, mode }) => {
            localStorage.setItem(`qr-cart:${code}`, JSON.stringify([{ productId: id, quantity: q, modifierOptionIds: [] }]));
            // Verde stores the guest's appearance separately from the shared guest_theme cookie.
            if (code === 'verde') localStorage.setItem('verde-menu-theme', mode === 'light' ? 'LIGHT' : 'SIGNATURE');
          }, { code: name, productId, quantity, mode: appearance });
          await page.reload({ waitUntil: 'domcontentloaded' });
          // The Next dev indicator is not part of the production menu and can cover controls.
          await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
          await selectAppearance(page, design, appearance);
          if (design.switcher) {
            const viewButton = page.locator(`${design.switcher} button`).nth(viewIndex);
            if (await viewButton.getAttribute('aria-pressed') !== 'true') {
              await expect(async () => {
                await viewButton.click();
                await expect(viewButton).toHaveAttribute('aria-pressed', 'true', { timeout: 1500 });
              }).toPass({ timeout: 30000 });
            }
          }
          const more = page.getByRole('button', { name: ARIA.en.more(NAMES.en.simple), exact: true }).first();
          const count = more.locator('xpath=..').locator('[aria-live="polite"]');
          await expect(count).toHaveText(String(quantity));
          await more.scrollIntoViewIfNeeded();
          await page.mouse.move(0, 0);
          const label = `${name}/${appearance}/${view}/${quantity}`;
          await checkCount(count, `${label}/default`);
          await more.hover();
          await checkCount(count, `${label}/hover`);
          await page.mouse.down();
          await expect.poll(() => more.evaluate((element) => element.matches(':active'))).toBe(true);
          await checkCount(count, `${label}/mouse-active`);
          await page.mouse.move(0, 0);
          await page.mouse.up();
          await more.evaluate((element) => element.addEventListener('touchstart', () => { element.dataset.testTouchReceived = 'yes'; }, { once: true }));
          const box = await more.boundingBox();
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
          await expect.poll(() => more.getAttribute('data-test-touch-received')).toBe('yes');
          await checkCount(count, `${label}/touch-held`);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        }
      }
      await cdp.detach();
    });
  }
}
