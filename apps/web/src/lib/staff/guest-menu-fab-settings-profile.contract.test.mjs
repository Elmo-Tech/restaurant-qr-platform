import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Pre-release fix: the shell's floating guest-menu button covered Settings -> Profile
// form fields (an input and the WhatsApp country picker) at 320px and 1024px. Like
// Orders, Dashboard and Tables, Profile now relies on an in-flow header entry. The
// exclusion is the Profile route only; every other Settings page keeps the button.
const url = (file) => new URL(file, import.meta.url);
const read = (file) => readFileSync(url(file), 'utf8');
const fab = read('../../components/menu/GuestMenuFab.tsx');
const shell = read('../../components/staff/StaffShell.tsx');
const profileDir = '../../app/staff/restaurants/[restaurantId]/settings/profile/';
const profile = read(profileDir + 'ProfileWorkspace.tsx');
const profilePage = read(profileDir + 'page.tsx');
const contact = read(profileDir + 'ContactCard.tsx');

test('the floating button is not rendered on Settings -> Profile, at any width', () => {
  assert.match(fab, /const onSettingsProfile = pathname === `\$\{base\}\/settings\/profile`;/);
  assert.match(fab, /const headerEntryPage = inOrders \|\| onDashboard \|\| inTables \|\| onSettingsProfile;/);
  assert.match(fab, /if \(link\.status !== 'ready' \|\| inKitchen \|\| headerEntryPage\) return null;/);
  // Not a CSS-only hide: no fixed overlay may remain in the DOM on Profile.
  assert.doesNotMatch(fab, /onSettingsProfile \? '/);
});

test('the exclusion is exact: no other Settings route loses the floating button', () => {
  // Exact equality, not a prefix match, and no blanket /settings rule.
  assert.doesNotMatch(fab, /pathname\.startsWith\(`\$\{base\}\/settings/);
  assert.doesNotMatch(fab, /pathname === `\$\{base\}\/settings`/);
  const settingsRules = fab.match(/\$\{base\}\/settings[^`]*`/g) ?? [];
  assert.deepEqual(settingsRules, ['${base}/settings/profile`']);
  assert.match(shell, /<GuestMenuFab restaurantId=\{restaurantId\} \/>/);
});

test('Profile offers the same guest-menu entry in its existing page header', () => {
  assert.match(
    profile,
    /import \{ OpenGuestMenuButton \} from '..\/..\/..\/..\/..\/..\/components\/menu\/OpenGuestMenuButton';/,
  );
  const entries = profile.match(/<OpenGuestMenuButton\b[^>]*\/>/g) ?? [];
  // Quiet secondary look, hidden in the same cases the floating button hid (no ACTIVE GENERIC QR,
  // link error), icon-only with an accessible name below `sm` so the 320px header stays compact.
  assert.deepEqual(entries, ['<OpenGuestMenuButton variant="secondary" hideWhenUnavailable compactOnPhone />']);
  assert.match(
    profile,
    /<PageHeader\s+title=\{t\('settingsHub\.profile'\)\}\s+description=\{t\('settingsHub\.profile\.description'\)\}\s+actions=\{<OpenGuestMenuButton /,
  );
  // Not gated by any Profile permission: availability is the shared link's own.
  const entryLine = profile.slice(profile.lastIndexOf('\n', profile.indexOf('<OpenGuestMenuButton')), profile.indexOf('<OpenGuestMenuButton'));
  assert.doesNotMatch(entryLine, /canManage|hasRestaurantManagePermission/);
});

test('Profile page guards, persistence and contact handling are untouched by the fix', () => {
  assert.doesNotMatch(profilePage, /GuestMenu/);
  assert.match(profilePage, /canManage=\{hasRestaurantManagePermission\(membership\) && membership\.allBranches === true\}/);
  assert.doesNotMatch(contact, /GuestMenu/);
  assert.match(contact, /internationalInput\('whatsapp'\)/);
});
