import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// DEC-066: readable Guest Menu links (/q/{restaurant-name}).
const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const page = read('app/q/[publicCode]/page.tsx');
const hero = read('app/q/[publicCode]/GuestHero.tsx');
const view = read('app/q/[publicCode]/PublicMenuView.tsx');
const share = read('app/q/[publicCode]/ShareButton.tsx');
const menus = ['verde/VerdeMenu', 'sherbiny/SherbinyMenu', 'makkboz/MakkbozMenu', 'meat-lovers/MeatLoversMenu'].map((name) =>
  read(`app/q/[publicCode]/${name}.tsx`),
);
const guestMenuApi = read('lib/guest-menu/api.ts');
const qrPanel = read('app/staff/restaurants/[restaurantId]/settings/guest-qr/RestaurantQrPanel.tsx');
const designWorkspace = read('app/staff/restaurants/[restaurantId]/settings/design/DesignWorkspace.tsx');
const tablesWorkspace = read('app/staff/restaurants/[restaurantId]/tables/TablesWorkspace.tsx');
const types = read('lib/public-menu/types.ts');

test('an old /q/{code} link or a renamed slug is redirected to the readable URL, keeping the Guest query', () => {
  assert.ok(page.includes("import { redirect } from 'next/navigation'"));
  assert.ok(page.includes('result.data.context.entry'));
  assert.match(page, /if \(redirectToSlug\) \{[\s\S]*redirect\(`\/q\/\$\{encodeURIComponent\(redirectToSlug\)\}\$\{suffix\}`\)/);
  for (const key of ["'lang'", "'template'", "'designPreview'"]) {
    assert.ok(page.includes(`query.set(${key}`), key);
  }
});

test('the Guest app keeps using the resolved opaque QR code for orders, tracking and storage', () => {
  assert.ok(types.includes('entry: { publicCode: string; redirectToSlug: string | null }'));
  // The code comes from the Backend resolution, never from the URL segment the Guest typed.
  assert.ok(page.includes('const { redirectToSlug, publicCode } = result.data.context.entry'));
  assert.ok(page.includes('publicCode={publicCode}'));
  assert.ok(view.includes('loadCart(publicCode)'));
});

test('the language switch stays on the page it is on (readable slug, or a Table QR code)', () => {
  assert.ok(hero.includes('href={`?lang=${locale}'));
  for (const menu of menus) {
    assert.ok(menu.includes('const localeHref = (code: string) => `?lang=${code}'));
    assert.ok(!menu.includes('/q/${publicCode}?lang='));
  }
});

test('sharing and staff links use the readable segment, falling back to the opaque code', () => {
  assert.ok(share.includes('`${window.location.origin}/q/${shareCode}`'));
  assert.ok(guestMenuApi.includes('body.data.slug ?? body.data.publicCode'));
  assert.ok(qrPanel.includes('`${webOrigin}/q/${qr.slug ?? qr.publicCode}`'));
  assert.ok(designWorkspace.includes('qr.slug ?? qr.publicCode'));
});

test('Table QR links keep their opaque public code', () => {
  assert.ok(/\/q\/\$\{[^}]*publicCode\}/.test(tablesWorkspace) || tablesWorkspace.includes('publicCode'));
  assert.ok(!/\.slug/.test(tablesWorkspace), 'a table QR must never be addressed by a slug');
});
