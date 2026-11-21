import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Release blocker fix: the shell's floating guest-menu button covered the
// Dashboard's "How to connect · 4 steps" control (1280px) and "More actions
// for Table N" on Tables (375px). Like Orders, both pages now rely on an
// in-flow header entry; every other Staff page keeps the floating button.
const url = (file) => new URL(file, import.meta.url);
const read = (file) => readFileSync(url(file), 'utf8');
const fab = read('../../components/menu/GuestMenuFab.tsx');
const shell = read('../../components/staff/StaffShell.tsx');
const dashboardPage = read('../../app/staff/restaurants/[restaurantId]/page.tsx');
const tables = read('../../app/staff/restaurants/[restaurantId]/tables/TablesWorkspace.tsx');
const tableCard = read('../../app/staff/restaurants/[restaurantId]/tables/TableCard.tsx');

test('the floating button is not rendered on the Dashboard root or on Tables, at any width', () => {
  // Dashboard is the workspace root only: nested routes (setup, menu, settings...) are unaffected.
  assert.match(fab, /const onDashboard = pathname === base;/);
  assert.match(fab, /const inTables = pathname === `\$\{base\}\/tables` \|\| pathname\.startsWith\(`\$\{base\}\/tables\/`\);/);
  assert.match(fab, /const headerEntryPage = inOrders \|\| onDashboard \|\| inTables;/);
  assert.match(fab, /if \(link\.status !== 'ready' \|\| inKitchen \|\| headerEntryPage\) return null;/);
  // Not a CSS-only hide: no fixed overlay may remain in the DOM on these pages.
  assert.doesNotMatch(fab, /(?:onDashboard|inTables|headerEntryPage) \? '(?:max-|lg:|hidden)/);
});

test('the floating button keeps its existing behavior on every other route', () => {
  assert.match(shell, /<GuestMenuFab restaurantId=\{restaurantId\} \/>/);
  assert.match(fab, /const inKitchen = pathname === `\$\{base\}\/kitchen` \|\| pathname\.startsWith\(`\$\{base\}\/kitchen\/`\);/);
  assert.match(fab, /const inOrders = pathname === `\$\{base\}\/orders` \|\| pathname\.startsWith\(`\$\{base\}\/orders\/`\);/);
  assert.match(fab, /pathname\.startsWith\(`\$\{base\}\/menu\/import`\) \|\| pathname\.startsWith\(`\$\{base\}\/menu\/products\/`\)/);
  assert.match(fab, /fixed end-4 bottom-\[calc\(5\.25rem\+env\(safe-area-inset-bottom\)\)\] z-40 lg:end-6 lg:bottom-6/);
  assert.match(fab, /keyboardUp \? 'hidden' : ''/);
  assert.match(fab, /stickySave \? 'max-lg:hidden' : ''/);
  assert.match(fab, /placement="up"/);
});

test('the Dashboard keeps its single existing header entry (no duplicate), gated exactly as before', () => {
  const entries = dashboardPage.match(/<OpenGuestMenuButton\b[^>]*\/>/g) ?? [];
  assert.deepEqual(entries, ['<OpenGuestMenuButton />']);
  // Same availability as the floating button had: ACTIVE restaurant + menu.view (the guest-menu-link
  // endpoint's own permission); without an ACTIVE GENERIC QR it shows its disabled state and hint.
  assert.match(dashboardPage, /restaurant\.status === 'ACTIVE' && canViewMenu\(membership\) \? \(\s*<OpenGuestMenuButton \/>/);
});

test('Tables offers the same guest-menu entry in its existing header, after the page actions', () => {
  assert.match(tables, /import \{ OpenGuestMenuButton \} from '..\/..\/..\/..\/..\/components\/menu\/OpenGuestMenuButton';/);
  const entries = tables.match(/<OpenGuestMenuButton\b[^>]*\/>/g) ?? [];
  // Quiet secondary look (table actions stay primary), hidden when no link is available (the same
  // cases the floating button hid in), icon-only below `sm` so the 320px header does not grow a row.
  assert.deepEqual(entries, ['<OpenGuestMenuButton variant="secondary" hideWhenUnavailable compactOnPhone />']);
  const headerAt = tables.indexOf('<PageHeader');
  const newTableAt = tables.indexOf("{t('tables.new')}");
  const entryAt = tables.indexOf('<OpenGuestMenuButton');
  const headerEndAt = tables.indexOf('/>', tables.indexOf('</div>', entryAt));
  // Inside the PageHeader actions, last -- so its end-aligned dropdown stays on screen.
  assert.ok(headerAt > 0 && newTableAt > headerAt && entryAt > newTableAt && headerEndAt > entryAt);
  // Not gated by any Tables permission: availability is the link's own (menu.view + ACTIVE GENERIC QR).
  const entryLine = tables.slice(tables.lastIndexOf('\n', entryAt), entryAt);
  assert.doesNotMatch(entryLine, /canManage|sessionCaps|selectedBranchId/);
});

test('Table cards are untouched by the fix', () => {
  assert.doesNotMatch(tableCard, /GuestMenu/);
  assert.match(tableCard, /tables\.card\.moreAria/);
});
