import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const layout = readFileSync(new URL('app/q/layout.tsx', root), 'utf8');
const css = readFileSync(new URL('app/globals.css', root), 'utf8');
const hero = readFileSync(new URL('app/q/[publicCode]/GuestHeroBloom.tsx', root), 'utf8');
const design = css.split('/* ---- BLOOM premium patisserie design')[1];

test('BLOOM loads exactly Cormorant Garamond normal + real italic and Arabic Tajawal', () => {
  assert.ok(layout.includes('Cormorant_Garamond'));
  assert.ok(layout.includes('Tajawal'));
  assert.ok(layout.includes("style: ['normal', 'italic']"));
  assert.ok(layout.includes("variable: '--font-bloom-display'"));
  assert.ok(layout.includes("variable: '--font-bloom-arabic'"));
  assert.ok(css.includes('font-family: var(--font-bloom-display), var(--font-bloom-arabic), Georgia, serif'));
  assert.ok(hero.includes('<i>{p.bloomHeadlineMiddle'));
});
test('BLOOM keeps pastel defaults, 3 color schemes and dark mode from existing guest theme', () => {
  assert.ok(design);
  for (const selector of [
    '.bloom-v2-ribbon', '.bloom-v2-hero', '.bloom-v2-card',
    '.bloom-v2-tabs', ".bloom-experience[data-bloom-palette='LILAC']",
    ".bloom-experience[data-bloom-palette='PEACH']",
    "[data-guest-theme='dark'] .bloom-experience",
    "[data-guest-theme='dark'] .bloom-experience[data-bloom-palette='LILAC']",
    "[data-guest-theme='dark'] .bloom-experience[data-bloom-palette='PEACH']",
    "data-bloom-motion='OFF'",
  ]) assert.ok(design.includes(selector), 'missing '+selector);
  assert.ok(design.includes('--g-accent: #b44d6b;'));
});

test('BLOOM stays available in the platform package registry and legacy design fallback', () => {
  const platform = readFileSync(new URL('../../../platform/src/lib/api/platform.ts', root), 'utf8');
  const designPage = readFileSync(new URL('app/staff/restaurants/[restaurantId]/settings/design/page.tsx', root), 'utf8');
  assert.match(platform, /export const PACKAGE_TEMPLATES = \\[[^\\]]*['"]BLOOM['"]/);
  assert.match(platform, /export const PREMIUM_TEMPLATES = \\[[^\\]]*['"]BLOOM['"]/);
  assert.ok(designPage.includes('MENU_TEMPLATES.map('), 'design page must reuse its actual template registry');
});
