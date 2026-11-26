'use strict';
/** Shared scenario list and in-page measurement helpers for the Guest Menu hotfix suite. */

/** Every stock template with its palettes, and every exclusive design: one entry per distinct look. */
const SCENARIOS = [
  'classic', 'list', 'gallery', 'menu', 'floating', 'centered', 'compact', 'editorial',
  'ember-EMBER', 'ember-NOIR', 'ember-COPPER',
  'bloom-ROSE', 'bloom-LILAC', 'bloom-PEACH',
  'brew-FOREST', 'brew-MOCHA', 'brew-SAGE',
  'verde', 'sherbiny', 'makkboz', 'meatlovers',
];
const LANGS = ['en', 'ar'];
const APPEARANCES = ['dark', 'light'];

const NAMES = {
  en: { simple: 'Margherita', burger: 'Chicken burger' },
  ar: { simple: 'مارجريتا', burger: 'برجر الدجاج' },
};
const ARIA = {
  en: {
    add: (n) => `Add ${n}`, more: (n) => `Add one more ${n}`, less: (n) => `Remove one ${n}`, remove: (n) => `Remove ${n} from your order`,
  },
  ar: {
    add: (n) => `إضافة ${n}`, more: (n) => `إضافة ${n} آخر`, less: (n) => `إزالة واحد من ${n}`, remove: (n) => `إزالة ${n} من طلبك`,
  },
};

/** Fresh browser context per test (Playwright's default), so the cart and cookies always start empty. */
async function openMenu(page, context, baseURL, scenario, lang, appearance, query = '') {
  await context.addCookies([{ name: 'guest_theme', value: appearance, url: baseURL + '/q' }]);
  await page.goto(`/q/${scenario}?lang=${lang}${query}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: ARIA[lang].add(NAMES[lang].simple), exact: true }).first().waitFor({ timeout: 60_000 });
}

/**
 * The colours a Guest actually sees for `locator`'s text: the computed text colour against the first opaque
 * background found walking up the tree (translucent layers are composited over what is behind them).
 */
async function measure(locator) {
  return locator.evaluate((el) => {
    const parse = (value) => {
      const m = value.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const blend = (top, bottom) => ({
      r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1,
    });
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const cs = getComputedStyle(node);
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) { layers.push(bg); if (bg.a === 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base);
    const cs = getComputedStyle(el);
    let fg = parse(cs.color) ?? { r: 0, g: 0, b: 0, a: 1 };
    fg = blend({ ...fg, a: fg.a * Number(cs.opacity) }, base);
    const lum = ({ r, g, b }) => {
      const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const [hi, lo] = [lum(fg), lum(base)].sort((a, b) => b - a);
    const hex = ({ r, g, b }) => '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
    return { ratio: (hi + 0.05) / (lo + 0.05), fg: hex(fg), bg: hex(base), text: (el.textContent || '').trim() };
  });
}

module.exports = { SCENARIOS, LANGS, APPEARANCES, NAMES, ARIA, openMenu, measure };
