import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const studio=read('app/staff/restaurants/[restaurantId]/settings/design/DesignWorkspace.tsx');
const guest=read('app/q/[publicCode]/PublicMenuView.tsx');
const chips=read('app/q/[publicCode]/CategoryChips.tsx');
const qr=read('app/staff/restaurants/[restaurantId]/settings/guest-qr/RestaurantQrPanel.tsx');
const nav=read('components/ui/Tabs.tsx');
const settings=read('app/staff/restaurants/[restaurantId]/settings/SettingsTabs.tsx');
const subscriptions=read('app/staff/restaurants/[restaurantId]/subscription/SubscriptionWorkspace.tsx');
const backend=read('../../api/src/my-subscription/my-subscription.service.ts');

test('selected design owns its inline settings, no bottom-of-catalogue editor',()=>{
 assert.match(studio,/const expanded = isSelected && customizable && customizeOpen/);
 assert.ok(studio.includes("aria-expanded={customizeOpen}"));
 assert.ok(studio.includes("sm:col-span-2"));
 const catalogue=studio.slice(studio.indexOf('{TIERS.map'),studio.indexOf('const DESKTOP_WIDTH'));
 for(const name of ['EmberTemplateEditor','BloomTemplateEditor','BrewTemplateEditor','EditorialPriceDisplayEditor']){
  assert.ok(catalogue.includes('<'+name));
 }
 assert.ok(catalogue.includes("t('design.save')"));
});

test('all premium menus share a page-height sticky category bar, with no duplicate in-content tabs',()=>{
 assert.ok(guest.includes('{hasCategories ? ('));
 assert.ok(guest.includes('onSelect={isPremiumSingleCategory ? selectPremiumCategory : navigation.select}'));
 assert.ok(guest.includes('activeId={isPremiumSingleCategory ? premiumCategoryId : navigation.activeId}'));
 assert.ok(guest.includes('setPremiumCategoryId(id)'));
 assert.ok(guest.includes("id={isPremiumSingleCategory ? 'premium-menu-start' : undefined}"));
 assert.ok(guest.includes('scroll-mt-[76px]'));
 assert.ok(!guest.includes("emberCategoryTabs={template === 'ember'"));
 assert.ok(!guest.includes("bloomCategoryTabs={template === 'bloom'"));
 assert.ok(!guest.includes("brewCategoryTabs={template==='brew'"));
 assert.ok(chips.includes('sticky top-0'));
});

test('QR preview and its live customization remain visible together on phones',()=>{
 const preview = qr.indexOf('id="restaurant-qr-preview"');
 const appearance = qr.indexOf('id="restaurant-qr-appearance"');
 assert.ok(preview > 0 && appearance > preview, 'QR must be above its customization');
 assert.ok(qr.includes('id="restaurant-qr-preview" className="flex min-w-0 flex-col gap-3"'));
 assert.ok(qr.includes('id="restaurant-qr-appearance" className="flex min-w-0 flex-col gap-5"'));
 assert.ok(!qr.includes('mobilePanel'), 'no mobile tabs or hidden editor');
 assert.ok(!qr.includes('role="tabpanel"'), 'preview and customization are not mutually exclusive');
 assert.ok(qr.includes('max-w-[300px] rounded-lg object-contain'));
 assert.ok(qr.includes('grid min-w-0 gap-5 lg:grid-cols-'), 'stack on mobile; two columns on desktop');
 assert.ok(qr.includes('xl:grid-cols-2'));
 assert.ok(settings.includes('scrollable'));
 assert.ok(nav.includes('flex-nowrap overflow-x-auto'));
});

test('subscription comparison uses one plan at a time on phones and displays both real prices',()=>{
 assert.ok(subscriptions.includes("lg:hidden"));
 assert.ok(subscriptions.includes("hidden overflow-x-auto lg:block"));
 assert.ok(subscriptions.includes("mobilePlanIndex"));
 assert.ok(subscriptions.includes('<del dir="ltr"'));
 assert.ok(subscriptions.includes('pricing.discountedMonthly'));
 assert.ok(subscriptions.includes('data.currentPricing'));
 assert.ok(backend.includes('currentPricing: restaurant.package ? cataloguePricing('));
 assert.ok(backend.includes('...cataloguePricing(pkg, currency, today)'));
});
