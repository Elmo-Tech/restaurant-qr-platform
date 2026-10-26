import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const bottom = read('../../components/staff/MobileNavigation.tsx');
const shell = read('../../components/staff/StaffShell.tsx');
const sidebar = read('../../components/staff/RestaurantSidebar.tsx');
const layout = read('../../app/staff/restaurants/[restaurantId]/layout.tsx');
const topbar = read('../../components/staff/StaffTopbar.tsx');
const copy = read('../i18n/messages/common.ts');

test('dock links, More actions and mobile shell have working focus semantics', () => {
  assert.match(bottom, /<nav aria-label=/);
  assert.match(bottom, /aria-current=\{active \? 'page'/);
  assert.match(bottom, /aria-haspopup="dialog"/);
  assert.match(bottom, /role="dialog" aria-modal="true"/);
  assert.match(bottom, /closeButtonRef\.current\?\.focus/);
  assert.match(bottom, /event\.key === 'Escape'/);
  assert.match(bottom, /focusableSelector/);
  assert.match(bottom, /<StaffLanguageSwitcher\/>/);
  assert.match(bottom, /<LogoutButton\/>/);
  assert.match(bottom, /onClick=\{\(\) => setMoreOpen\(false\)\}/);
});

test('shell reserves phone bottom safe area; desktop sidebar stays intact', () => {
  assert.match(shell, /<MobileNavigation/);
  assert.match(shell, /pb-\[calc\(7rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(shell, /lg:pb-6/);
  assert.match(sidebar, /hidden w-64 flex-shrink-0 lg:flex/);
  assert.doesNotMatch(sidebar, /isMobileOpen/);
  assert.match(bottom, /lg:hidden print:hidden/);
  assert.match(topbar, /lg:block/);
  assert.doesNotMatch(topbar, /IconHamburger/);
});

test('entitlements and membership permissions still come from authenticated layout', () => {
  assert.match(layout, /canViewKitchen\(membership\)/);
  assert.match(layout, /usesTableOrdering\(membership\)/);
  assert.match(layout, /receivesDashboardOrders\(membership\)/);
  assert.match(shell, /packageHides,/);
  assert.match(shell, /canViewSubscription,/);
  assert.match(shell, /canViewStaff,/);
  assert.match(bottom, /buildMobileNavigation\(restaurantId, access\)/);
  assert.match(copy, /'mobileNav\.more':/);
});
