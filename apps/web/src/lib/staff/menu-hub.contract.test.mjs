import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const root = '../../app/staff/restaurants/[restaurantId]';
const hub = source(root + '/menu/overview/page.tsx');
const guest = source(root + '/menu/guest-experience/page.tsx');
const shell = source('../../components/staff/StaffShell.tsx');
const sidebar = source('../../components/staff/RestaurantSidebar.tsx');
const back = source('../../components/staff/MenuHubBackLink.tsx');
const mobile = source('./mobile-navigation.ts');
const tabs = source(root + '/settings/SettingsTabs.tsx');
const qr = source(root + '/settings/guest-qr/GuestQrWorkspace.tsx');
const design = source(root + '/settings/design/DesignWorkspace.tsx');
const announcements = source(root + '/settings/announcements/AnnouncementsWorkspace.tsx');
const suggestions = source(root + '/settings/suggestions/SuggestionsWorkspace.tsx');
const copy = source('../i18n/messages/menuHub.ts');

test('approved Hub has responsive hero, four decorated functional cards and real permission gating', () => {
  assert.match(hub, /menuHub\.heroTitle/);
  assert.match(hub, /menuHub\.heroBadge/);
  assert.match(hub, /linear-gradient/);
  assert.match(hub, /menuHub\.openPage/);
  assert.match(hub, /number="0[1-4]"/);
  assert.match(hub, /grid-cols-1/);
  assert.match(hub, /sm:grid-cols-2/);
  assert.match(hub, /canViewMenu\(member\)/);
  assert.match(hub, /canViewRestaurantSettings\(member\)/);
  assert.match(hub, /canViewTables\(member\)/);
  for (const p of ['/menu\'', '/settings/design', '/menu/guest-experience', '/settings/guest-qr']) {
    assert.ok(hub.includes(p));
  }
});

test('guest experience opens the ORIGINAL management screens with their capabilities', () => {
  assert.match(guest, /menuHub\.announcementsDetails/);
  assert.match(guest, /menuHub\.suggestionsDetails/);
  assert.match(guest, /settings\/announcements/);
  assert.match(guest, /settings\/suggestions/);
  assert.match(guest, /features\.SMART_SUGGESTIONS/);
  assert.match(guest, /MenuHubBackLink/);
  assert.match(announcements, /createAnnouncement|announcementsApi\.create/);
  assert.match(announcements, /deleteAnnouncement|announcementsApi\.delete/);
  assert.match(announcements, /<Dialog/);
  for (const mode of ['OFF', 'MANUAL', 'AUTO', 'BOTH']) {
    assert.ok(suggestions.includes(mode));
  }
});

test('legacy settings URLs are treated as menu, with stable sidebar and real QR functionality', () => {
  for (const slug of ['design', 'announcements', 'suggestions', 'guest-qr']) {
    assert.ok(shell.includes("'" + slug + "'"));
  }
  assert.match(sidebar, /lg:sticky lg:top-0/);
  assert.match(sidebar, /lg:h-screen lg:h-dvh/);
  assert.match(mobile, /menuSettings/);
  assert.match(qr, /<RestaurantQrPanel/);
  assert.match(qr, /<OrderingOptionsCard/);
  assert.match(design, /<MenuHubBackLink/);
  assert.match(design, /menuHub\.design/);
  assert.doesNotMatch(design, /<SettingsTabs/);
  assert.doesNotMatch(tabs, /key: 'design',/);
  assert.doesNotMatch(tabs, /key: 'announcements',/);
  assert.doesNotMatch(tabs, /key: 'suggestions',/);
  assert.match(tabs, /key: 'guest-qr'/); // Ordering switches remain discoverable until separate settings redesign.
  assert.match(back, /parent === 'guest'/);
  assert.match(back, /menuHub\.backGuest/);
});

test('all new navigation text has Arabic and English translations', () => {
  const half = copy.indexOf('  ar: {');
  const en = copy.slice(0, half);
  const ar = copy.slice(half);
  const keys = [...en.matchAll(/'menuHub\.([\w.]+)'\s*:/g)].map(m => m[1]);
  assert.ok(keys.length >= 20);
  for (const key of keys) {
    assert.ok(ar.includes("'menuHub." + key + "'"), 'Missing Arabic key ' + key);
  }
});
