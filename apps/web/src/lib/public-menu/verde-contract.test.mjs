import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const menu = read('app/q/[publicCode]/verde/VerdeMenu.tsx');
const card = read('app/q/[publicCode]/verde/VerdeProductCard.tsx');
const css = read('app/q/[publicCode]/verde/verde.css');
const view = read('app/q/[publicCode]/PublicMenuView.tsx');
const page = read('app/q/[publicCode]/page.tsx');
const workspace = read('app/staff/restaurants/[restaurantId]/settings/design/DesignWorkspace.tsx');
const editor = read('app/staff/restaurants/[restaurantId]/settings/design/VerdeMenuEditor.tsx');
const api = read('lib/settings/api.ts');
const settings = read('lib/public-menu/verde-settings.ts');
const messages = read('lib/i18n/messages/verde-design.ts');

test('VERDE renderer is loaded on demand and replaces only the presentation', () => {
  assert.ok(view.includes("dynamic(() => import('./verde/VerdeMenu')"));
  assert.ok(view.includes('verdeSettings ? ('));
  // The shared Guest logic is reused, never forked: cart, search, product sheet and quick add stay in PublicMenuView.
  for (const token of ['onOpenProduct={handleOpenProduct}', 'onQuickAdd={handleQuickAdd}', 'onIncrement={handleCardIncrement}', 'onQueryChange={setQuery}']) {
    assert.ok(view.includes(token), token);
  }
  assert.ok(!/VerdeShowcase|verde-experience\.css/.test(view), 'the old showcase must be gone');
  // Overlays render inside the themed root so the cart, sheet and tracking match the skin.
  assert.ok(menu.includes('{children}'));
});

test('VERDE copy and prices come from settings, i18n and Backend data -- no concept leftovers', () => {
  for (const leftover of ['NOT LIVE', 'DESIGN STUDY', 'CONCEPT 02', 'PDF THEME', 'ثيم الـ PDF', 'قائمة تجريبية', 'Prototype']) {
    assert.ok(!menu.includes(leftover) && !css.includes(leftover) && !settings.includes(leftover), leftover);
  }
  assert.ok(card.includes('DiscountedPrice') && card.includes('product.variants'));
  assert.ok(menu.includes('copy.lightMode') && menu.includes('copy.verdeViewPhotos'));
  assert.ok(!/toFixed|parseFloat|Number\(/.test(card), 'money is shown from exact decimal strings');
});

test('both themes define the full token set and the dark theme never reuses a background as text', () => {
  const light = /\[data-verde-theme="light"\]\{([^}]*)\}/s.exec(css)?.[1] ?? '';
  const dark = /\[data-verde-theme="signature"\]\{([^}]*)\}/s.exec(css)?.[1] ?? '';
  for (const token of ['--g-bg', '--g-surface', '--g-text', '--g-text-2', '--g-text-3', '--g-accent', '--g-on-accent', '--v-action', '--v-action-fg', '--v-card', '--v-hero-bg']) {
    assert.ok(light.includes(token + ':'), 'light ' + token);
    assert.ok(dark.includes(token + ':'), 'dark ' + token);
  }
  // The category index (invisible in the first concept's dark theme) uses the theme text token.
  assert.match(css, /\.v-category-nav button\{[^}]*color:var\(--g-text\)/);
  // Resets use :where so component rules (cream button, cart button) always win.
  assert.ok(css.includes(':where(.verde-experience) a{'));
  assert.ok(!/^\.verde-experience a\{/m.test(css));
  assert.ok(css.includes('prefers-reduced-motion'));
});

test('VERDE stays RTL-safe: logical properties, isolated Latin runs, no physical text alignment', () => {
  assert.ok(css.includes('inset-inline-end') && css.includes('margin-inline'));
  assert.ok(menu.includes('dir="auto"') && menu.includes('<bdi>'));
  assert.ok(!/text-align:\s*(left|right)/.test(css));
});

test('VERDE settings are editable with draft / publish and a private live preview', () => {
  for (const route of ['/verde-menu/draft', '/verde-menu/publish', '/verde-menu/images/', '/verde-menu/category-images/']) {
    assert.ok(api.includes(route), route);
  }
  assert.ok(workspace.includes('<VerdeMenuEditor'));
  assert.ok(workspace.includes("exclusiveDesign.rendererKey === 'VERDE_NAPOLI_V1'"));
  assert.ok(page.includes('showExclusive ||'));
  // The exclusive design is one choice beside the stock templates: guests follow the Restaurant's own choice.
  assert.ok(page.includes('exclusiveInUse !== false'));
  assert.ok(workspace.includes('setExclusiveDesignSelection') && workspace.includes('{TIERS.map'));
  assert.ok(api.includes('/exclusive-design/selection'));
  assert.ok(editor.includes('saveVerdeMenuDraft') && editor.includes('publishVerdeMenu'));
  // Asset paths are server-owned and never posted with the text settings.
  assert.ok(api.includes('heroImageAssetPath: _hero'));
  for (const slot of ['hero', 'chapter1', 'chapter2', 'banner']) assert.ok(editor.includes(`slot: '${slot}'`), slot);
});

test('every VERDE copy field has an Arabic and English editor label', () => {
  const keys = [...settings.matchAll(/^  (\w+): \[/gm)].map((match) => match[1]);
  assert.ok(keys.length >= 25);
  for (const key of keys) assert.equal([...messages.matchAll(new RegExp(`'verde\\.field\\.${key}':`, 'g'))].length, 2, key);
});
