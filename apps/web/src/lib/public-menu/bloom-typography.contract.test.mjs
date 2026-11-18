import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const layout = readFileSync(new URL('app/q/layout.tsx', root), 'utf8');
const css = readFileSync(new URL('app/globals.css', root), 'utf8');
const hero = readFileSync(new URL('app/q/[publicCode]/GuestHeroBloom.tsx', root), 'utf8');
// Fonts are self-hosted (build(web) 0c22017): /q/layout.tsx applies classes from fonts/guest.module.css.
const guestFonts = readFileSync(new URL('fonts/guest.module.css', root), 'utf8');
const faces = (family) => guestFonts.split('@font-face').filter((block) => block.includes(`font-family: '${family}'`));
const design = css.split('/* ---- BLOOM premium patisserie design')[1];

test('BLOOM loads exactly Cormorant Garamond normal + real italic and Arabic Tajawal', () => {
  assert.ok(layout.includes("import fonts from '../../fonts/guest.module.css'"), 'guest layout must load the self-hosted fonts');
  assert.ok(layout.includes('${fonts.bloomDisplay}') && layout.includes('${fonts.bloomArabic}'), 'BLOOM font variables must be applied on /q');
  assert.ok(guestFonts.includes(".bloomDisplay { --font-bloom-display: 'Cormorant Garamond'; }"));
  assert.ok(guestFonts.includes(".bloomArabic { --font-bloom-arabic: 'Tajawal'; }"));
  const cormorant = faces('Cormorant Garamond');
  assert.ok(cormorant.some((b) => b.includes('font-style: normal;')), 'Cormorant Garamond normal face');
  assert.ok(cormorant.some((b) => b.includes('font-style: italic;')), 'Cormorant Garamond real italic face');
  assert.ok(faces('Tajawal').length > 0, 'Tajawal face');
  for (const block of [...cormorant, ...faces('Tajawal')]) {
    const file = block.match(/url\('\.\/(files\/[^']+)'\)/)?.[1];
    assert.ok(file && existsSync(new URL('fonts/' + file, root)), 'self-hosted font file missing: ' + file);
  }
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
  const platform = readFileSync(new URL('../../platform/src/lib/api/platform.ts', root), 'utf8');
  const designPage = readFileSync(new URL('app/staff/restaurants/[restaurantId]/settings/design/page.tsx', root), 'utf8');
  // Match list membership, not position: later templates (e.g. BREW) are appended after BLOOM.
  const list = (name) => platform.match(new RegExp('export const ' + name + ' = \\[([^\\]]*)\\] as const'))?.[1] ?? '';
  assert.ok(list('PACKAGE_TEMPLATES').includes('"BLOOM"'), 'BLOOM must be a selectable package template');
  assert.ok(list('PREMIUM_TEMPLATES').includes('"BLOOM"'), 'BLOOM must be premium');
  assert.ok(!list('STANDARD_TEMPLATES').includes('"BLOOM"'), 'BLOOM must not be a standard template');
  assert.ok(/export const PREMIUM_TEMPLATES = \[[^\]]*\] as const satisfies readonly PackageTemplate\[\]/.test(platform), 'premium list must stay typed against PackageTemplate');
  assert.ok(designPage.includes('MENU_TEMPLATES.map('), 'design page must reuse its actual template registry');
});
