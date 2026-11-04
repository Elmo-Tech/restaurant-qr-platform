import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const menu = read('app/q/[publicCode]/sherbiny/SherbinyMenu.tsx');
const row = read('app/q/[publicCode]/sherbiny/SherbinyDishRow.tsx');
const css = read('app/q/[publicCode]/sherbiny/sherbiny.css');
const view = read('app/q/[publicCode]/PublicMenuView.tsx');
const workspace = read('app/staff/restaurants/[restaurantId]/settings/design/DesignWorkspace.tsx');
const editor = read('app/staff/restaurants/[restaurantId]/settings/design/SherbinyMenuEditor.tsx');
const api = read('lib/settings/api.ts');
const settings = read('lib/public-menu/sherbiny-settings.ts');

test('El Sherbiny renderer is loaded on demand and replaces only the presentation', () => {
  assert.ok(view.includes("dynamic(() => import('./sherbiny/SherbinyMenu')"));
  assert.ok(view.includes('sherbinySettings ? ('));
  for (const token of ['onOpenProduct={handleOpenProduct}', 'onQuickAdd={handleQuickAdd}', 'onIncrement={handleCardIncrement}', 'onQueryChange={setQuery}']) {
    const start = view.indexOf('<SherbinyMenu');
    assert.ok(view.slice(start, view.indexOf('</SherbinyMenu>')).includes(token), token);
  }
  // Overlays (cart, product sheet, tracking) render inside the themed root.
  assert.ok(menu.includes('{children}'));
});

test('no concept leftovers and money stays an exact decimal string', () => {
  for (const leftover of ['Concept Preview', 'EXCLUSIVE MENU CONCEPT', 'معاينة تصميم', 'غير متصل', 'Interactive UI Concept']) {
    assert.ok(!menu.includes(leftover) && !css.includes(leftover) && !settings.includes(leftover), leftover);
  }
  assert.ok(row.includes('DiscountedPrice') && row.includes('product.variants') && row.includes("'SOLD_OUT'"));
  assert.ok(!/toFixed|parseFloat|Number\(/.test(row), 'money is shown from exact decimal strings');
});

test('contact, hours and social links render only when present', () => {
  assert.ok(menu.includes('const hasContact ='));
  assert.ok(menu.includes('{hasContact ? ('));
  assert.ok(menu.includes('addresses.length > 0 || phoneNumbers.length > 0'));
  assert.ok(menu.includes('channels.length > 0'));
  assert.ok(menu.includes('{hours ? '));
});

test('both themes define the full token set; header, hero and footer are not light-only', () => {
  const paper = /\[data-s-theme="paper"\],\s*\.sherbiny-experience\[data-s-theme="system"\]\{([^}]*)\}/s.exec(css)?.[1] ?? '';
  const night = /\[data-s-theme="night"\]\{([^}]*)\}/s.exec(css)?.[1] ?? '';
  for (const token of ['--s-page', '--s-panel', '--s-text', '--s-soft', '--g-bg', '--g-surface', '--g-text', '--g-accent', '--g-on-accent', '--g-price']) {
    assert.ok(paper.includes(token + ':'), 'paper ' + token);
    assert.ok(night.includes(token + ':'), 'night ' + token);
  }
  // No unlayered colour / font resets: they would beat the Tailwind utilities of the shared cart, sheet and checkout.
  assert.ok(!/\.sherbiny-experience[^{]*(?:button|input|a)[^{]*\{[^}]*(?:color|font)\s*:\s*inherit/.test(css));
});

test('light / dark: dashboard default, guest switch in the header, saved in the guest_theme cookie, no flash', () => {
  const page = readFileSync(new URL('../../app/q/[publicCode]/page.tsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../../app/q/[publicCode]/useExclusiveTheme.ts', import.meta.url), 'utf8');
  // The server reads the cookie, so the first paint already has the guest's pick.
  assert.ok(page.includes('GUEST_THEME_COOKIE') && page.includes('guestTheme={guestTheme}'));
  assert.ok(hook.includes('useGuestTheme') && hook.includes('setTheme(next, !designPreview)'));
  assert.ok(menu.includes('useExclusiveTheme(') && menu.includes('theme.toggle') && menu.includes('settings.allowThemeSwitch'));
  assert.ok(menu.includes('aria-label={themeLabel}') && !menu.includes('localStorage'));
  // "System" follows the device through CSS alone (no script, no flash) and its dark palette is the night palette.
  const media = /@media \(prefers-color-scheme:dark\)\{\s*\.sherbiny-experience\[data-s-theme="system"\]\{([^}]*)\}/s.exec(css)?.[1] ?? '';
  const night = /\[data-s-theme="night"\]\{([^}]*)\}/s.exec(css)?.[1] ?? '';
  assert.equal(media.replace(/\s+/g, ''), night.replace(/\s+/g, ''));
  assert.ok(editor.includes("'SYSTEM'"));
});

test('RTL / LTR, accessibility and motion safety', () => {
  assert.ok(css.includes('inset-inline-end') && css.includes('margin-inline'));
  assert.ok(menu.includes("dir={isArabic ? 'rtl' : 'ltr'}") && menu.includes('<bdi>') && menu.includes('dir="auto"'));
  assert.ok(!/text-align:\s*(left|right)/.test(css));
  assert.ok(css.includes('prefers-reduced-motion'));
  // Scroll reveal never hides content before it is reached and is progressive enhancement only.
  assert.ok(css.includes('@supports (animation-timeline:view())'));
  assert.ok(/s-rise linear forwards/.test(css) && !/s-rise linear both/.test(css));
  assert.ok(menu.includes('aria-pressed') && menu.includes('aria-expanded') && menu.includes('s-skip'));
});

test('settings are editable with draft / publish and a private live preview', () => {
  assert.ok(workspace.includes('SherbinyMenuEditor') && workspace.includes('SHERBINY_DESIGN_PREVIEW_UPDATE'));
  assert.ok(editor.includes('saveSherbinyMenuDraft') && editor.includes('publishSherbinyMenu'));
  assert.ok(api.includes('/sherbiny-menu/draft') && api.includes('/sherbiny-menu/publish'));
  // Image paths are server-owned: never sent with the text settings.
  assert.ok(/heroImageAssetPath: _hero/.test(api));
});
