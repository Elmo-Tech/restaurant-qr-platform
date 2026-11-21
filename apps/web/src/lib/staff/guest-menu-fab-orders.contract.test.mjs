import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Release blocker fix: the shell's floating guest-menu button covered Order
// totals / "View order" / status actions on Orders. Orders now uses an
// in-flow header entry; every other Staff page keeps the floating button.
const url = (file) => new URL(file, import.meta.url);
const read = (file) => readFileSync(url(file), 'utf8');
const fab = read('../../components/menu/GuestMenuFab.tsx');
const button = read('../../components/menu/OpenGuestMenuButton.tsx');
const menu = read('../../components/menu/GuestMenuMenu.tsx');
const shell = read('../../components/staff/StaffShell.tsx');
const workspace = read('../../app/staff/restaurants/[restaurantId]/orders/OrdersWorkspace.tsx');

test('the floating button is route-aware: not rendered on Orders, at any width', () => {
  assert.match(fab, /const inOrders = pathname === `\$\{base\}\/orders` \|\| pathname\.startsWith\(`\$\{base\}\/orders\/`\);/);
  assert.match(fab, /const headerEntryPage = inOrders \|\|/);
  assert.match(fab, /if \(link\.status !== 'ready' \|\| inKitchen \|\| headerEntryPage\) return null;/);
  // Not a CSS-only hide (it must not sit on top of content at lg+ either).
  assert.doesNotMatch(fab, /inOrders \? '(?:max-|lg:)/);
});

test('every other Staff page keeps the floating button exactly as before', () => {
  // Still mounted once in the shell, same position and kitchen / sticky-save / keyboard rules.
  assert.match(shell, /<GuestMenuFab restaurantId=\{restaurantId\} \/>/);
  assert.match(fab, /fixed end-4 bottom-\[calc\(5\.25rem\+env\(safe-area-inset-bottom\)\)\] z-40 lg:end-6 lg:bottom-6/);
  assert.match(fab, /keyboardUp \? 'hidden' : ''/);
  assert.match(fab, /stickySave \? 'max-lg:hidden' : ''/);
  assert.match(fab, /placement="up"/);
});

test('Orders offers the same guest-menu entry in its header (same link, same dropdown)', () => {
  assert.match(workspace, /import \{ OpenGuestMenuButton \} from '..\/..\/..\/..\/..\/components\/menu\/OpenGuestMenuButton';/);
  assert.match(workspace, /<OpenGuestMenuButton variant="secondary" hideWhenUnavailable compactOnPhone \/>/);
  // After Refresh, inside the PageHeader actions.
  const refreshAt = workspace.indexOf("{t('common.refresh')}");
  const entryAt = workspace.indexOf('<OpenGuestMenuButton');
  assert.ok(refreshAt > 0 && entryAt > refreshAt);
  // The former bottom clearance for the floating button is gone.
  assert.doesNotMatch(workspace, /lg:pb-16/);
  // Reuses the shared link + dropdown; no new fetch.
  assert.match(button, /useGuestMenuLink\(\)/);
  assert.match(button, /<GuestMenuMenu id=\{menuId\} triggerRef=\{triggerRef\} placement="down"/);
  assert.doesNotMatch(button, /fetch\(/);
});

test('the header entry stays accessible: real link, labelled menu button, label kept for AT on phones', () => {
  assert.match(button, /target="_blank"/);
  assert.match(button, /rel="noopener noreferrer"/);
  assert.match(button, /aria-label=\{t\('guestMenu\.moreActions'\)\}/);
  assert.match(button, /aria-haspopup="menu"/);
  assert.match(button, /aria-expanded=\{open\}/);
  // Icon-only below `sm` is visual only: the text stays as the accessible name.
  assert.match(button, /<span className=\{compactOnPhone \? 'max-sm:sr-only' : undefined\}>\{t\('guestMenu\.openMenu'\)\}<\/span>/);
  assert.match(button, /compactOnPhone \? 'max-sm:w-11 max-sm:px-0' : ''/);
  // Defaults keep the existing Dashboard / Menu / checklist buttons unchanged.
  assert.match(button, /variant = 'primary',\s*hideWhenUnavailable = false,\s*compactOnPhone = false,/);
});

test('hideWhenUnavailable hides only after loading (no header shift), matching the floating button', () => {
  assert.match(button, /if \(hideWhenUnavailable && link\.status !== 'loading'\) return null;/);
});

test('the dropdown flips to start alignment only when end alignment would leave the viewport', () => {
  assert.match(menu, /useState<'end' \| 'start'>\('end'\)/);
  assert.match(menu, /rect\.left < 0 \|\| rect\.right > document\.documentElement\.clientWidth/);
  assert.match(menu, /\$\{align === 'end' \? 'end-0' : 'start-0'\}/);
  // Keyboard model unchanged.
  assert.match(menu, /event\.key === 'Escape'/);
  assert.match(menu, /role="menuitem"/);
});
