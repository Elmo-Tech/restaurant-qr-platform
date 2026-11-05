import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const menu = read('app/q/[publicCode]/meat-lovers/MeatLoversMenu.tsx');
const card = read('app/q/[publicCode]/meat-lovers/MeatLoversCard.tsx');
const css = read('app/q/[publicCode]/meat-lovers/meat-lovers.css');
const view = read('app/q/[publicCode]/PublicMenuView.tsx');
const workspace = read('app/staff/restaurants/[restaurantId]/settings/design/DesignWorkspace.tsx');
const editor = read('app/staff/restaurants/[restaurantId]/settings/design/MeatLoversMenuEditor.tsx');
const api = read('lib/settings/api.ts');
const fonts = read('fonts/meat-lovers.module.css');
const pending = read('app/q/[publicCode]/BrandedMenuPending.tsx');

test('Meat Lovers renderer is loaded on demand and replaces only the presentation', () => {
  assert.ok(view.includes("dynamic(() => import('./meat-lovers/MeatLoversMenu')"));
  assert.ok(view.includes('meatLoversSettings ? ('));
  const start = view.indexOf('<MeatLoversMenu');
  const block = view.slice(start, view.indexOf('</MeatLoversMenu>'));
  for (const token of ['onOpenProduct={handleOpenProduct}', 'onQuickAdd={handleQuickAdd}', 'onIncrement={handleCardIncrement}', 'onQueryChange={setQuery}']) {
    assert.ok(block.includes(token), token);
  }
  assert.ok(menu.includes('{children}'));
  assert.ok(pending.includes('MEAT_LOVERS_BUTCHER_V1'), 'the "menu on its way" page covers this design');
});

test('prices come from shared menu data; a cut without a photo gets built-in artwork; no money arithmetic in the UI', () => {
  assert.ok(card.includes('DiscountedPrice') && card.includes('product.variants') && card.includes("'SOLD_OUT'"));
  assert.ok(card.includes('perKiloPrice(product)'));
  assert.ok(!/toFixed|parseFloat|Number\(/.test(card), 'money is shown from exact decimal strings');
  assert.ok(card.includes('MeatLoversPlaceholder'));
  assert.ok(!/DEMO|نموذج بصري|WAYTA Backend/.test(menu + card + css));
});

test('contact, hours and social links render only when present', () => {
  assert.ok(menu.includes('const hasContact ='));
  assert.ok(menu.includes('{hasContact ? ('));
  assert.ok(menu.includes('channels.length > 0') && menu.includes('{hours ? '));
  assert.ok(menu.includes('logoUrl ?'), 'logo is used only when set, else the brand text');
});

test('self-hosted fonts, RTL / LTR, accessibility and motion safety', () => {
  assert.ok(fonts.includes("'Alexandria'") && fonts.includes("'IBM Plex Sans Arabic'") && fonts.includes("'Barlow Condensed'"));
  assert.ok(css.includes('inset-inline-end') && css.includes('margin-inline'));
  assert.ok(menu.includes("dir={isArabic ? 'rtl' : 'ltr'}") && menu.includes('<bdi>'));
  assert.ok(!/text-align:\s*(left|right)/.test(css.replace(/\[dir="rtl"\][^}]*\}/g, '')));
  assert.ok(css.includes('prefers-reduced-motion') && /ml-rise linear forwards/.test(css));
  assert.ok(menu.includes('aria-pressed') && menu.includes('aria-expanded') && menu.includes('ml-skip'));
});

test('settings are editable with draft / publish and a private live preview', () => {
  assert.ok(workspace.includes('MeatLoversMenuEditor') && workspace.includes('MEAT_LOVERS_DESIGN_PREVIEW_UPDATE'));
  assert.ok(editor.includes('saveMeatLoversMenuDraft') && editor.includes('publishMeatLoversMenu'));
  assert.ok(api.includes('/meat-lovers-menu/draft') && api.includes('/meat-lovers-menu/publish'));
  assert.ok(/heroImageAssetPath: _hero/.test(api.slice(api.indexOf('saveMeatLoversMenuDraft'))));
});

test('light / dark: dashboard default, guest switch in the header, saved in the guest_theme cookie, no flash', () => {
  const page = read('app/q/[publicCode]/page.tsx');
  const hook = read('app/q/[publicCode]/useExclusiveTheme.ts');
  assert.ok(page.includes('GUEST_THEME_COOKIE') && page.includes('guestTheme={guestTheme}'));
  assert.ok(hook.includes('useGuestTheme') && hook.includes('setTheme(next, !designPreview)'));
  assert.ok(menu.includes('useExclusiveTheme(') && menu.includes('theme.toggle') && menu.includes('settings.allowThemeSwitch'));
  assert.ok(menu.includes('aria-label={themeLabel}') && menu.includes('data-ml-theme={theme.attr}'));
  const dark = /\[data-ml-theme="dark"\]\{([^}]*)\}/s.exec(css)?.[1] ?? '';
  const system = /@media \(prefers-color-scheme:dark\)\{\s*\.meat-lovers-experience\[data-ml-theme="system"\]\{([^}]*)\}/s.exec(css)?.[1] ?? '';
  assert.ok(dark.includes('--ml-page:') && dark.includes('--g-accent:') && dark.includes('--g-on-accent:'));
  assert.equal(system.replace(/\s+/g, ''), dark.replace(/\s+/g, ''));
  assert.ok(editor.includes("'DARK'") && editor.includes('allowThemeSwitch'));
});

test('no unlayered colour / font resets (they hid the text of the shared cart, order bar and checkout)', () => {
  assert.ok(!/\.meat-lovers-experience\s+(?:button|input|a)(?:\s*,[^{]*)?\{[^}]*(?:color|font)\s*:\s*inherit/.test(css));
});

test('weights: names state the weight and the per-kilo price is the 1 kg size, with no arithmetic', async () => {
  const { variantGrams, perKiloPrice } = await import('./meat-lovers-weight.ts');
  const names = { 'ربع كيلو (250 جم)': 250, 'نص كيلو (500 جم)': 500, 'كيلو (1000 جم)': 1000, '2 كيلو (2000 جم)': 2000, '250 g': 250, '1 kg': 1000, '2 kg': 2000, '٢ كيلو': 2000, Large: null };
  for (const [name, grams] of Object.entries(names)) assert.equal(variantGrams(name), grams, name);
  const v = (name, price, discountedPrice = null) => ({ id: name, name, price, discountedPrice, isDefault: false });
  assert.deepEqual(perKiloPrice({ variants: [v('250 g', '131.25'), v('1 kg', '525', '500'), v('2 kg', '1050')] }), { price: '525', discountedPrice: '500' });
  assert.equal(perKiloPrice({ variants: [v('Small', '10'), v('Large', '20')] }), null, 'not a weight product');
  assert.equal(perKiloPrice({ variants: [v('250 g', '10'), v('500 g', '20')] }), null, 'no 1 kg size');
  assert.equal(perKiloPrice({ variants: [] }), null);
});
