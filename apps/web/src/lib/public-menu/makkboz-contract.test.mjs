import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const menu = read('app/q/[publicCode]/makkboz/MakkbozMenu.tsx');
const card = read('app/q/[publicCode]/makkboz/MakkbozCard.tsx');
const css = read('app/q/[publicCode]/makkboz/makkboz.css');
const view = read('app/q/[publicCode]/PublicMenuView.tsx');
const workspace = read('app/staff/restaurants/[restaurantId]/settings/design/DesignWorkspace.tsx');
const editor = read('app/staff/restaurants/[restaurantId]/settings/design/MakkbozMenuEditor.tsx');
const api = read('lib/settings/api.ts');
const fonts = read('fonts/makkboz.module.css');

test('Makkboz renderer is loaded on demand and replaces only the presentation', () => {
  assert.ok(view.includes("dynamic(() => import('./makkboz/MakkbozMenu')"));
  assert.ok(view.includes('makkbozSettings ? ('));
  const start = view.indexOf('<MakkbozMenu');
  const block = view.slice(start, view.indexOf('</MakkbozMenu>'));
  for (const token of ['onOpenProduct={handleOpenProduct}', 'onQuickAdd={handleQuickAdd}', 'onIncrement={handleCardIncrement}', 'onQueryChange={setQuery}']) {
    assert.ok(block.includes(token), token);
  }
  assert.ok(menu.includes('{children}'));
});

test('prices, sizes, discounts and sold-out state come from shared menu data; a dish without a photo is a text card', () => {
  assert.ok(card.includes('DiscountedPrice') && card.includes('product.variants') && card.includes("'SOLD_OUT'"));
  assert.ok(!/toFixed|parseFloat|Number\(/.test(card), 'money is shown from exact decimal strings');
  assert.ok(card.includes('has-photo') && card.includes('m-card-ornament'));
  assert.ok(!/DEMO|هذا عرض توضيحي|نموذج تصميم|WAYTA Backend/.test(menu + card + css));
});

test('contact, hours and social links render only when present', () => {
  assert.ok(menu.includes('const hasContact ='));
  assert.ok(menu.includes('{hasContact ? ('));
  assert.ok(menu.includes('channels.length > 0') && menu.includes('{hours ? '));
  assert.ok(menu.includes('logoUrl ?'), 'logo is used only when set, else the brand text');
});

test('uses a non-colour display face and keeps RTL / LTR, accessibility and motion safe', () => {
  assert.ok(fonts.includes("'Aref Ruqaa'") && !fonts.includes('Aref Ruqaa Ink'), 'the Ink variant is a colour font and ignores the page colour');
  assert.ok(css.includes('inset-inline-end') && css.includes('margin-inline'));
  assert.ok(menu.includes("dir={isArabic ? 'rtl' : 'ltr'}") && menu.includes('<bdi>'));
  assert.ok(!/text-align:\s*(left|right)/.test(css));
  assert.ok(css.includes('prefers-reduced-motion') && /m-rise linear forwards/.test(css));
  assert.ok(menu.includes('aria-pressed') && menu.includes('aria-expanded') && menu.includes('m-skip'));
  assert.ok(/dir="auto"><bdi>/.test(card) === false, 'dir=auto ignores <bdi> and would pick the wrong side');
});

test('settings are editable with draft / publish and a private live preview', () => {
  assert.ok(workspace.includes('MakkbozMenuEditor') && workspace.includes('MAKKBOZ_DESIGN_PREVIEW_UPDATE'));
  assert.ok(editor.includes('saveMakkbozMenuDraft') && editor.includes('publishMakkbozMenu'));
  assert.ok(api.includes('/makkboz-menu/draft') && api.includes('/makkboz-menu/publish'));
  assert.ok(/heroImageAssetPath: _hero/.test(api.slice(api.indexOf('saveMakkbozMenuDraft'))));
});
