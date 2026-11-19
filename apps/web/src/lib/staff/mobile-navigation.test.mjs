import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMobileNavigation, isMobileNavActive } from './mobile-navigation.ts';
import { MENU_OWNED_SETTINGS_SLUGS, isMenuOwnedSettingsPath, resolveStaffSection } from './staff-sections.ts';

const base = {
  canViewOrders: true, canViewMenu: true, canViewTables: true,
  canViewKitchen: true, canViewStaff: true, canViewRestaurantSettings: true,
  canViewSubscription: true, packageHides: {orders:false,tables:false},
};
function keys(nav) { return nav.map(item => item.key); }
test('all-features owner shows four daily modules and only authorized overflow', () => {
  const result = buildMobileNavigation('restaurant-123',base);
  assert.deepEqual(keys(result.dock), ['dashboard','orders','menu','tables']);
  assert.deepEqual(keys(result.more), ['kitchen','staff','settings','subscription','account']);
  assert.equal(result.dock.length,4);
  assert.equal(result.dock[2].href,'/staff/restaurants/restaurant-123/menu/overview');
});
test('basic/view-only plan hides ordering and tables even if membership has stale permissions', () => {
  const result = buildMobileNavigation('r', {...base,packageHides:{orders:true,tables:true},canViewKitchen:false});
  assert.deepEqual(keys(result.dock),['dashboard','menu','staff','settings']);
  assert.deepEqual(keys(result.more),['subscription','account']);
  assert.ok(![...result.dock,...result.more].some(item=>item.key==='orders'||item.key==='tables'));
});
test('cashier with no menu permission never sees menu, team, settings or subscription', () => {
  const result = buildMobileNavigation('r',{
    ...base,canViewMenu:false,canViewStaff:false,canViewRestaurantSettings:false,
    canViewSubscription:false,canViewKitchen:false,
  });
  assert.deepEqual(keys(result.dock),['dashboard','orders','tables']);
  assert.deepEqual(keys(result.more),['account']);
});
test('kitchen-only role sees kitchen in prime position without irrelevant modules',()=>{
  const result = buildMobileNavigation('r',{
    ...base,canViewMenu:false,canViewOrders:false,canViewTables:false,
    canViewStaff:false,canViewRestaurantSettings:false,canViewSubscription:false,
  });
  assert.deepEqual(keys(result.dock),['dashboard','kitchen']);
  assert.deepEqual(keys(result.more),['account']);
});
test('permissions cannot bypass package-gated orders and tables',()=>{
  const result = buildMobileNavigation('r',{
    ...base,packageHides:{orders:true,tables:true},canViewKitchen:false,
    canViewMenu:false,canViewStaff:false,canViewRestaurantSettings:false,
    canViewSubscription:false,
  });
  assert.deepEqual(keys(result.dock),['dashboard']);
  assert.deepEqual(keys(result.more),['account']);
});
test('active state matches nested routes without prefix collision',()=>{
  const result = buildMobileNavigation('r',base);
  const menu = result.dock.find(item=>item.key==='menu');
  const home = result.dock.find(item=>item.key==='dashboard');
  const settings = result.more.find(item=>item.key==='settings');
  assert.ok(menu && home && settings);
  assert.equal(isMobileNavActive('/staff/restaurants/r/menu/products/new',menu),true);
  assert.equal(isMobileNavActive('/staff/restaurants/r/menu-other',menu),false);
  assert.equal(isMobileNavActive('/staff/restaurants/r/orders',home),false);
  assert.equal(isMobileNavActive('/staff/restaurants/r',home),true);
  for (const slug of ['design', 'announcements', 'suggestions', 'guest-qr']) {
    const url = `/staff/restaurants/r/settings/${slug}`;
    assert.equal(isMobileNavActive(url, menu), true);
    assert.equal(isMobileNavActive(url, settings), false);
  }
  assert.equal(isMobileNavActive('/staff/restaurants/r/settings/profile',settings),true);
  assert.equal(isMobileNavActive('/staff/restaurants/r/settings/overview',settings),true);
  assert.equal(isMobileNavActive('/staff/restaurants/r/settings/ordering',settings),true);
  assert.equal(isMobileNavActive('/staff/restaurants/r/settings/hours',settings),true);
  assert.equal(isMobileNavActive('/staff/restaurants/r/settings/delivery',settings),true);
  assert.equal(isMobileNavActive('/staff/restaurants/r/settings/ordering',menu),false);
  assert.equal(isMobileNavActive('/staff/restaurants/r/menu/overview',menu),true);
});

test('settings-only staff retains a Menu Hub entry without acquiring menu permissions', () => {
  const nav = buildMobileNavigation('r', {
    ...base, canViewMenu: false, canViewRestaurantSettings: true,
    canViewOrders: false, canViewTables: false, canViewKitchen: false,
    canViewStaff: false, canViewSubscription: false,
  });
  assert.ok([...nav.dock,...nav.more].some(item => item.key === 'menu'));
  assert.equal([...nav.dock,...nav.more].find(item => item.key === 'menu')?.href,
    '/staff/restaurants/r/menu/overview');
});

/**
 * Behaviour lock for active-section resolution: every path maps to exactly
 * the one nav item the Staff shell highlights today (or none at all).
 */
const ACTIVE_SECTION_CASES = [
  ['', 'dashboard'],
  ['/', null],
  ['/orders', 'orders'], ['/orders/abc', 'orders'], ['/orders-archive', null],
  ['/tables', 'tables'], ['/tables/abc', 'tables'],
  ['/kitchen', 'kitchen'], ['/kitchen/abc', 'kitchen'],
  ['/staff', 'staff'], ['/staff/roles', 'staff'],
  ['/account', 'account'], ['/account/extra', null],
  ['/subscription', 'subscription'], ['/subscription/extra', null],
  ['/settings', 'settings'], ['/settings/overview', 'settings'], ['/settings/profile', 'settings'],
  ['/settings/ordering', 'settings'], ['/settings/hours', 'settings'], ['/settings/delivery', 'settings'],
  ['/settings/branches', 'settings'], ['/settings/languages', 'settings'], ['/settings/design-other', 'settings'],
  ['/settings-other', null],
  ['/settings/design', 'menu'], ['/settings/design/x', 'menu'], ['/settings/announcements', 'menu'],
  ['/settings/suggestions', 'menu'], ['/settings/guest-qr', 'menu'], ['/settings/guest-qr/x', 'menu'],
  ['/menu', 'menu'], ['/menu/overview', 'menu'], ['/menu/guest-experience', 'menu'], ['/menu/offers', 'menu'],
  ['/menu/import', 'menu'], ['/menu/modifier-presets', 'menu'], ['/menu/products/new', 'menu'],
  ['/menu-other', null],
  ['/setup', null], ['/setup-preview', null],
];

function activeKeys(nav, pathname) {
  return [...nav.dock, ...nav.more].filter(item => isMobileNavActive(pathname, item)).map(item => item.key);
}

test('every staff path highlights exactly the expected section', () => {
  const nav = buildMobileNavigation('r', base);
  for (const [suffix, expected] of ACTIVE_SECTION_CASES) {
    const pathname = '/staff/restaurants/r' + suffix;
    assert.deepEqual(activeKeys(nav, pathname), expected ? [expected] : [], pathname);
  }
  assert.deepEqual(activeKeys(nav, '/staff/restaurants/other/orders'), []);
});

test('active matching uses the encoded restaurant id from the nav href', () => {
  const nav = buildMobileNavigation('a b', base);
  assert.deepEqual(activeKeys(nav, '/staff/restaurants/a%20b/orders'), ['orders']);
  assert.deepEqual(activeKeys(nav, '/staff/restaurants/a%20b/settings/design'), ['menu']);
  assert.deepEqual(activeKeys(nav, '/staff/restaurants/a%20b'), ['dashboard']);
  assert.deepEqual(activeKeys(nav, '/staff/restaurants/a b/orders'), []);
});

test('shared resolver used by the desktop shell returns the same section for every path', () => {
  for (const [suffix, expected] of ACTIVE_SECTION_CASES) {
    const pathname = '/staff/restaurants/r' + suffix;
    assert.equal(resolveStaffSection(pathname, '/staff/restaurants/r'), expected, pathname);
  }
  assert.equal(resolveStaffSection('/staff/restaurants/other/orders', '/staff/restaurants/r'), null);
  // The shell passes the raw restaurant id; it must keep matching raw pathnames.
  assert.equal(resolveStaffSection('/staff/restaurants/a b/orders', '/staff/restaurants/a b'), 'orders');
});

test('exactly the four Menu-owned /settings routes are treated as Menu', () => {
  assert.deepEqual([...MENU_OWNED_SETTINGS_SLUGS], ['design', 'announcements', 'suggestions', 'guest-qr']);
  for (const slug of MENU_OWNED_SETTINGS_SLUGS) {
    assert.equal(isMenuOwnedSettingsPath(`/staff/restaurants/r/settings/${slug}`, '/staff/restaurants/r'), true);
  }
  for (const slug of ['profile', 'overview', 'hours', 'delivery', 'ordering', 'branches', 'languages', 'design-other']) {
    assert.equal(isMenuOwnedSettingsPath(`/staff/restaurants/r/settings/${slug}`, '/staff/restaurants/r'), false);
  }
});
