import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const root = '../../app/staff/restaurants/[restaurantId]/settings';
const hub = read(root + '/overview/page.tsx');
const ordering = read(root + '/ordering/page.tsx');
const orderingWorkspace = read(root + '/ordering/OrderingWorkspace.tsx');
const orderingCard = read(root + '/guest-qr/OrderingOptionsCard.tsx');
const qr = read(root + '/guest-qr/GuestQrWorkspace.tsx');
const profile = read(root + '/profile/ProfileWorkspace.tsx');
const branches = read(root + '/branches/BranchesWorkspace.tsx');
const branchPage = read(root + '/branches/page.tsx');
const hours = read(root + '/hours/HoursWorkspace.tsx');
const hoursPage = read(root + '/hours/page.tsx');
const delivery = read(root + '/delivery/DeliveryWorkspace.tsx');
const deliveryPage = read(root + '/delivery/page.tsx');
const languages = read(root + '/languages/LanguagesWorkspace.tsx');
const sidebar = read('../../components/staff/RestaurantSidebar.tsx');
const shell = read('../../components/staff/StaffShell.tsx');
const mobile = read('./mobile-navigation.ts');
const back = read('../../components/staff/SettingsBackLink.tsx');
const copy = read('../i18n/messages/settingsHub.ts');

test('Settings Card Hub is task-based with four full bilingual routes and a premium visual', () => {
  assert.match(hub, /settingsHub\.heroTitle/);
  assert.match(hub, /linear-gradient/);
  assert.match(hub, /grid-cols-1/);
  assert.match(hub, /sm:grid-cols-2/);
  assert.match(hub, /settingsHub\.openPage/);
  assert.match(hub, /canViewRestaurantSettings\(member\)/);
  assert.match(hub, /canViewBranches\(member\)/);
  for (const item of ["'/profile'", "'/ordering'", "'/branches'", "'/languages'"]) {
    assert.ok(hub.includes(item), 'Missing settings card route: ' + item);
  }
});

test('ordering is outside QR and accessible to restaurant viewers without tables.view', () => {
  assert.match(ordering, /canViewRestaurantSettings\(member\)/);
  assert.doesNotMatch(ordering, /canViewTables/);
  assert.match(ordering, /canManageLanguages\(member\)/);
  assert.match(ordering, /restaurant\.features/);
  assert.match(orderingWorkspace, /<OrderingOptionsCard/);
  assert.match(orderingWorkspace, /settings\/profile#contact-settings/);
  assert.match(orderingCard, /settingsApi\.updateOrderingOptions/);
  assert.match(orderingCard, /features\.WHATSAPP_ORDERING/);
  assert.match(orderingCard, /features\.TABLE_ORDERING/);
  assert.match(qr, /<RestaurantQrPanel/);
  assert.doesNotMatch(qr, /<OrderingOptionsCard/);
  assert.match(qr, /settings\/ordering/);
});

test('all old editors remain on their deep links; horizontal SettingsTabs are replaced', () => {
  for (const [label, file] of Object.entries({ profile, branches, hours, delivery, languages })) {
    assert.doesNotMatch(file, /<SettingsTabs/, 'Horizontal tabs remain in ' + label);
    assert.match(file, /<SettingsBackLink/, 'Back navigation missing in ' + label);
  }
  assert.match(profile, /<ContactCard/);
  assert.match(profile, /id="contact-settings"/);
  assert.match(branches, /<BranchFormDialog/);
  assert.match(hours, /hoursApi\.saveBranchHours/);
  assert.match(delivery, /DeliveryZone/);
  assert.match(languages, /settingsApi\.setRestaurantLocaleState/);
});

test('branch cards link to the exact branch for hours and delivery without privilege escalation', () => {
  assert.match(branches, /settings\/hours\?branchId=/);
  assert.match(branches, /settings\/delivery\?branchId=/);
  assert.match(branches, /canViewDelivery/);
  assert.match(branchPage, /canViewDelivery=\{canViewRestaurantSettings\(membership\)\}/);
  assert.match(hoursPage, /searchParams/);
  assert.match(hours, /branch\.id === initialBranchId/);
  assert.match(deliveryPage, /searchParams/);
  assert.match(delivery, /branch\.id === initialBranchId/);
  assert.match(delivery, /settingsHub\.allDelivery/);
});

test('new Settings root and mobile/desktop navigation open the Hub; legacy paths stay valid', () => {
  assert.match(sidebar, /settings\/overview/);
  assert.match(mobile, /settings: \{[^\n]*\/settings\/overview/);
  assert.match(shell, /settingsHub\.order(?:ing)?/);
  assert.match(shell, /settingsHub\.branches/);
  assert.match(shell, /settingsHub\.hours/);
  assert.match(shell, /settingsHub\.delivery/);
  assert.match(shell, /settingsHub\.languages/);
  assert.match(back, /parent === 'branches'/);
  const rootRedirect = read(root + '/page.tsx');
  assert.match(rootRedirect, /settings\/overview/);
});

test('all Settings Hub keys exist in both Arabic and English', () => {
  const half = copy.indexOf('  ar: {');
  const en = copy.slice(0, half);
  const ar = copy.slice(half);
  const keys = [...en.matchAll(/'settingsHub\.([\w.]+)'\s*:/g)].map(match => match[1]);
  assert.ok(keys.length >= 20);
  for (const key of keys) {
    assert.ok(ar.includes("'settingsHub." + key + "'"), 'Missing Arabic key ' + key);
  }
});
