import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMobileNavigation, isMobileNavActive } from './mobile-navigation.ts';

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
  assert.equal(result.dock[2].href,'/staff/restaurants/restaurant-123/menu');
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
  assert.equal(isMobileNavActive('/staff/restaurants/r/settings/design',settings),true);
});
