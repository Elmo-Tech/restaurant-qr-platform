import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
const marker = '/* ---- EMBER premium light theme (guest-only) ----';
const lightCss = css.slice(css.indexOf(marker));
const paletteNames = ['EMBER', 'NOIR', 'COPPER'];

function blockFor(selector) {
  // No nested selectors in the token definitions; keep the contract readable.
  const start = lightCss.indexOf(selector + ' {');
  assert.ok(start >= 0, 'Light-theme selector missing: ' + selector);
  const from = lightCss.indexOf('{', start) + 1;
  return lightCss.slice(from, lightCss.indexOf('}', from));
}

function tokens(block) {
  const out = {};
  for (const [, name, color] of block.matchAll(/--(g-[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    out[name] = color.toLowerCase();
  }
  return out;
}

function luminance(color) {
  const values = color.slice(1).match(/.{2}/g).map(
    (hex) => parseInt(hex, 16) / 255,
  );
  const [r, g, b] = values.map((x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function contrast(first, second) {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('all curated EMBER palettes have independently accessible light colors', () => {
  assert.ok(lightCss.startsWith(marker), 'EMBER light-mode block must exist');
  const baseline = tokens(blockFor("[data-guest-theme='light'] .ember-experience"));
  for (const name of paletteNames) {
    const colors = name === 'EMBER' ? baseline : {
      ...baseline,
      ...tokens(blockFor("[data-guest-theme='light'] .ember-experience[data-ember-palette='" + name + "']")),
    };
    for (const [foreground, background] of [
      ['g-text', 'g-bg'],
      ['g-text-2', 'g-bg'],
      ['g-accent-text', 'g-bg'],
      ['g-price', 'g-surface'],
      ['g-on-accent', 'g-accent'],
    ]) {
      assert.ok(colors[foreground] && colors[background], name + ': missing token pair ' + foreground);
      assert.ok(contrast(colors[foreground], colors[background]) >= 4.5,
        name + ': low contrast for ' + foreground + ' on ' + background);
    }
  }
});

test('light mode covers the cinematic hero and menu controls, not just cards', () => {
  for (const selector of [
    '.ember-v2-header',
    '.ember-v2-subtitle',
    '.ember-v2-nav-note',
    '.ember-v2-cart-button',
    '.ember-v2-visual-glow',
    '.ember-v2-photo-fallback',
    '.ember-v2-tools-nav',
    '.ember-v2-toolbar',
    '.ember-v2-card-photo',
    '.ember-v2-tab-active',
  ]) {
    assert.ok(lightCss.includes(selector), 'Missing light-mode style for ' + selector);
  }
  assert.ok(css.includes(".ember-experience[data-ember-motion='OFF'] .ember-v2-photo"),
    'Motion OFF support must remain intact');
});
