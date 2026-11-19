import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const sidebar = read('../../components/staff/RestaurantSidebar.tsx');
const copy = read('../i18n/messages/common.ts');

test('desktop sidebar renders grouped navigation from the shared model', () => {
  assert.match(sidebar, /buildDesktopNavigation\(restaurantId,/);
  assert.match(sidebar, /<nav\s+aria-label=\{t\('shell\.navigationAria'\)\}/);
  assert.match(sidebar, /<ul aria-labelledby=\{headingId\}/);
  assert.match(sidebar, /isActive=\{currentSection === item\.key\}/);
});

test('unauthorized items are hidden, never rendered as disabled "No access" rows', () => {
  assert.doesNotMatch(sidebar, /DisabledRow/);
  assert.doesNotMatch(sidebar, /common\.noAccess/);
  assert.doesNotMatch(sidebar, /aria-disabled/);
});

test('My Account stays in the sidebar footer', () => {
  assert.match(sidebar, /function SidebarFooter/);
  assert.match(sidebar, /href=\{user\.accountHref\}/);
  assert.match(sidebar, /<SidebarFooter user=\{user\}/);
});

test('group headings are localized in English and Arabic', () => {
  for (const key of ['nav.group.daily', 'nav.group.management', 'nav.group.account', 'shell.navigationAria']) {
    const matches = copy.match(new RegExp(`'${key.replace(/\./g, '\\.')}':`, 'g')) ?? [];
    assert.equal(matches.length, 2, `${key} must exist in en and ar`);
  }
  assert.match(copy, /'nav\.group\.daily': 'العمليات اليومية'/);
  assert.match(copy, /'nav\.group\.management': 'إدارة المطعم'/);
});
