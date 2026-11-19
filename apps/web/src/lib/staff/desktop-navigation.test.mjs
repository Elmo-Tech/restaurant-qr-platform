import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDesktopNavigation } from './desktop-navigation.ts';

const owner = {
  canViewOrders: true, canViewMenu: true, canViewTables: true,
  canViewKitchen: true, canViewStaff: true, canViewRestaurantSettings: true,
  canViewSubscription: true, packageHides: { orders: false, tables: false },
};
const none = {
  canViewOrders: false, canViewMenu: false, canViewTables: false,
  canViewKitchen: false, canViewStaff: false, canViewRestaurantSettings: false,
  canViewSubscription: false, packageHides: { orders: false, tables: false },
};
const shape = nav => nav.map(group => [group.key, group.items.map(item => item.key)]);
const allKeys = nav => nav.flatMap(group => group.items.map(item => item.key));

test('owner with all features sees three groups in approved order with real routes', () => {
  const nav = buildDesktopNavigation('r-1', owner);
  assert.deepEqual(shape(nav), [
    ['daily', ['dashboard', 'orders', 'tables', 'kitchen']],
    ['management', ['menu', 'staff', 'settings']],
    ['account', ['subscription']],
  ]);
  assert.deepEqual(nav.map(group => group.heading), ['nav.group.daily', 'nav.group.management', 'nav.group.account']);
  const hrefs = Object.fromEntries(nav.flatMap(group => group.items.map(item => [item.key, item.href])));
  assert.deepEqual(hrefs, {
    dashboard: '/staff/restaurants/r-1',
    orders: '/staff/restaurants/r-1/orders',
    tables: '/staff/restaurants/r-1/tables',
    kitchen: '/staff/restaurants/r-1/kitchen',
    menu: '/staff/restaurants/r-1/menu/overview',
    staff: '/staff/restaurants/r-1/staff',
    settings: '/staff/restaurants/r-1/settings/overview',
    subscription: '/staff/restaurants/r-1/subscription',
  });
  assert.equal(nav[1].items[0].label, 'menuHub.title');
});

test('My Account is never a nav item (it stays in the sidebar footer)', () => {
  assert.ok(!allKeys(buildDesktopNavigation('r', owner)).includes('account'));
});

test('view-only member keeps every page it can open, hides the rest, no empty Account group', () => {
  // e.g. a read-only manager: can view menu, orders, tables, settings, but not staff/kitchen/subscription.
  const nav = buildDesktopNavigation('r', {
    ...none, canViewOrders: true, canViewMenu: true, canViewTables: true, canViewRestaurantSettings: true,
  });
  assert.deepEqual(shape(nav), [
    ['daily', ['dashboard', 'orders', 'tables']],
    ['management', ['menu', 'settings']],
  ]);
});

test('menu entry stays reachable through settings-only view permission (menu-owned settings)', () => {
  const nav = buildDesktopNavigation('r', { ...none, canViewRestaurantSettings: true });
  assert.deepEqual(shape(nav), [['daily', ['dashboard']], ['management', ['menu', 'settings']]]);
});

test('kitchen-only member sees Dashboard and Kitchen, with no management or account group', () => {
  const nav = buildDesktopNavigation('r', { ...none, canViewKitchen: true });
  assert.deepEqual(shape(nav), [['daily', ['dashboard', 'kitchen']]]);
});

test('package-limited plan hides Orders and Tables even when permissions are present', () => {
  const nav = buildDesktopNavigation('r', {
    ...owner, canViewKitchen: false, packageHides: { orders: true, tables: true },
  });
  assert.deepEqual(shape(nav), [
    ['daily', ['dashboard']],
    ['management', ['menu', 'staff', 'settings']],
    ['account', ['subscription']],
  ]);
});

test('missing packageHides is treated as no package limitation', () => {
  const rest = { ...owner };
  delete rest.packageHides;
  assert.deepEqual(allKeys(buildDesktopNavigation('r', rest)).slice(0, 4), ['dashboard', 'orders', 'tables', 'kitchen']);
});

test('no group is ever empty and no item is duplicated', () => {
  const flags = ['canViewOrders', 'canViewMenu', 'canViewTables', 'canViewKitchen', 'canViewStaff', 'canViewRestaurantSettings', 'canViewSubscription'];
  for (let mask = 0; mask < 1 << flags.length; mask++) {
    for (const hide of [false, true]) {
      const access = { ...none, packageHides: { orders: hide, tables: hide } };
      flags.forEach((flag, i) => { access[flag] = Boolean(mask & (1 << i)); });
      const nav = buildDesktopNavigation('r', access);
      assert.ok(nav.every(group => group.items.length > 0));
      const keys = allKeys(nav);
      assert.equal(new Set(keys).size, keys.length);
      assert.equal(nav[0].key, 'daily');
    }
  }
});
