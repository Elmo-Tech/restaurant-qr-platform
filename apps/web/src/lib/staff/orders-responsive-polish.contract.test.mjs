import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Phase 1 PR 4: Orders responsive & accessibility polish -- narrow filter
// disclosure, applied-filter visibility and Order Card bidi isolation.
const url = (file) => new URL(file, import.meta.url);
const read = (file) => readFileSync(url(file), 'utf8');
const dir = '../../app/staff/restaurants/[restaurantId]/orders/';
const workspace = read(`${dir}OrdersWorkspace.tsx`);
const filterBar = read(`${dir}OrdersFilterBar.tsx`);
const card = read(`${dir}OrderCard.tsx`);
const ordersMessages = read('../i18n/messages/orders.ts');

const NEW_KEYS = [
  'orders.filter.toggle',
  'orders.filter.activeCount',
  'orders.filter.applied',
  'orders.filter.remove',
  'orders.filter.sortValue',
];

test('narrow screens get one accessible disclosure for the secondary filters', () => {
  assert.match(filterBar, /data-orders-filters-toggle=""/);
  assert.match(filterBar, /aria-expanded=\{filtersOpen\}/);
  // It controls both hidden regions (Sort/Branch and the Type/Status chips).
  assert.match(filterBar, /aria-controls=\{`\$\{sortPanelId\} \$\{chipsPanelId\}`\}/);
  assert.match(filterBar, /<div id=\{sortPanelId\}/);
  assert.match(filterBar, /<div id=\{chipsPanelId\}/);
  // Collapsed state hides only below `md`; at md+ the layout is the PR 2/3 one.
  assert.match(filterBar, /const narrowHidden = filtersOpen \? '' : 'max-md:hidden';/);
  assert.match(filterBar, /md:contents \$\{narrowHidden\}/);
  // The toggle itself never shows at md+, and starts collapsed.
  assert.match(filterBar, /focus-visible:outline-ring md:hidden \$\{/);
  assert.match(filterBar, /useState\(false\)/);
});

test('search stays outside the disclosure and full-width on narrow screens', () => {
  const searchAt = filterBar.indexOf('type="search"');
  const toggleAt = filterBar.indexOf('data-orders-filters-toggle');
  assert.ok(searchAt > 0 && toggleAt > searchAt, 'search renders before (outside) the disclosure');
  assert.match(filterBar, /max-md:basis-full/);
  // Its label is kept for assistive tech (never removed).
  assert.match(filterBar, /\{t\('orders\.filter\.search'\)\}<\/span>/);
});

test('every applied secondary filter stays visible and removable while collapsed', () => {
  // Type, Status, Branch and a non-default Sort each become a pill.
  assert.match(filterBar, /if \(type !== null\)[\s\S]*?onRemove: \(\) => onTypeChange\(null\)/);
  assert.match(filterBar, /if \(status !== null\)[\s\S]*?onRemove: \(\) => onStatusChange\(null\)/);
  assert.match(filterBar, /if \(branchName !== null\)[\s\S]*?onRemove: \(\) => onBranchChange\(ALL_BRANCHES\)/);
  assert.match(filterBar, /const sortCustomized = sort !== defaultSort;/);
  assert.match(filterBar, /if \(sortCustomized\)[\s\S]*?onRemove: onSortReset/);
  // The badge counts them and announces the count.
  assert.match(filterBar, /const secondaryCount = appliedPills\.length;/);
  assert.match(filterBar, /t\('orders\.filter\.activeCount', \{ count: secondaryCount \}\)/);
  // Pills are a labelled list of real buttons with a specific accessible name.
  assert.match(filterBar, /<ul role="list" aria-label=\{t\('orders\.filter\.applied'\)\}/);
  assert.match(filterBar, /aria-label=\{pill\.ariaLabel\}/);
  // Clear filters is reachable collapsed and expanded on narrow screens, and unchanged at md+.
  assert.match(filterBar, /\{showSummary && hasActiveFilters \? clearButton\('min-h-9 md:hidden'\) : null\}/);
  assert.match(filterBar, /\{filtersOpen && hasActiveFilters \? <div className="md:hidden">/);
  assert.match(filterBar, /\{hasActiveFilters \? clearButton\(`\$\{controlHeight\} max-md:hidden`\) : null\}/);
});

test('the workspace passes the view default sort and resets to it (no new sort semantics)', () => {
  assert.match(workspace, /defaultSort=\{effectiveSort\(view, null\)\}/);
  assert.match(workspace, /onSortReset=\{\(\) => setSort\(null\)\}/);
  // Clear filters still leaves an explicit sort alone (unchanged behavior).
  const clear = workspace.slice(workspace.indexOf('function clearFilters()'), workspace.indexOf('const hasActiveFilters'));
  assert.doesNotMatch(clear, /setSort/);
  // Deep links still seed the same state.
  assert.match(workspace, /useState<OrdersSort \| null>\(initialFilters\.sort \?\? null\)/);
  assert.match(workspace, /initialFilters\.status \?\? null/);
});

test('narrow touch targets: search, toggle and selects are 44px; pills at least 36px', () => {
  assert.match(filterBar, /\$\{controlHeight\} max-md:h-11 \$\{INPUT_CLASS\}/);
  assert.match(filterBar, /inline-flex h-11 shrink-0/);
  assert.equal((filterBar.match(/max-md:h-11 max-md:w-full \$\{SELECT_CLASS\}/g) ?? []).length, 2);
  assert.match(filterBar, /inline-flex min-h-9 max-w-full items-center/);
});

test('Order Card keeps the Staff UI direction and isolates only customer text', () => {
  // No block-level dir on the identity / phone lines (that pushed mixed names to the far edge).
  assert.doesNotMatch(card, /<h3\s+dir=/);
  assert.doesNotMatch(card, /<p dir="ltr"/);
  assert.match(card, /\{order\.customer \? <bdi dir="auto">\{identity\}<\/bdi> : identity\}/);
  assert.match(card, /<bdi dir="ltr">\{order\.customer\.phone\}<\/bdi>/);
  // Money stays an LTR isolate; status accent and selected outline unchanged.
  assert.match(card, /<bdi dir="ltr">\s*\{order\.totalAmount\} \{order\.currencyCode\}\s*<\/bdi>/);
  assert.match(card, /statusAccentClass\(order\.status\)/);
  assert.match(card, /outline-2 outline-offset-2 outline-primary/);
});

test('new filter copy exists in English and Arabic', () => {
  for (const key of NEW_KEYS) {
    const count = ordersMessages.split(`'${key}':`).length - 1;
    assert.equal(count, 2, `${key} should be defined for en and ar`);
  }
  assert.match(ordersMessages, /'orders\.filter\.toggle': 'التصفية والترتيب'/);
});
