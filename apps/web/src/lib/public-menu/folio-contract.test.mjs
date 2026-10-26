import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const templates = read('./templates.ts');
const component = read('../../app/q/[publicCode]/FolioExperience.tsx');
const view = read('../../app/q/[publicCode]/PublicMenuView.tsx');
const page = read('../../app/q/[publicCode]/page.tsx');
const editor = read('../../app/staff/restaurants/[restaurantId]/settings/design/DesignWorkspace.tsx');
const appearance = read('./folio-settings.ts');
const css = read('../../app/globals.css');

test('FOLIO is a first-class preview-guarded template, with existing checkout', () => {
  assert.match(templates, /'folio'/);
  assert.match(page, /template\?\.toUpperCase\(\) === 'FOLIO'/);
  assert.match(view, /<FolioExperience/);
  assert.match(view, /<CartPanel/);
  assert.match(view, /<ProductSheet/);
  assert.match(view, /onOpenProduct=\{handleOpenProduct\}/);
  assert.match(view, /onQuickAdd=\{handleQuickAdd\}/);
});

test('FOLIO paginates real categories without losing sizes or discounts', () => {
  assert.match(component, /category\.products\.slice/);
  assert.match(component, /product\.variants/);
  assert.match(component, /toMinorUnits/);
  assert.match(component, /product\.discount\?\.discountedPrice/);
  assert.match(component, /product\.availability !== 'SOLD_OUT'/);
  assert.match(component, /p\.query/);
  assert.match(component, /p\.onQuickAdd/);
});

test('FOLIO ships responsive mobile book, sticky navigation and motion control', () => {
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /\.folio-v2-artpage \{display:none;/);
  assert.match(css, /\.folio-v2-sticky \{ position:sticky;/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /data-folio-motion='OFF'/);
  assert.match(component, /onClick=\{\(\) => jumpToCategory\(category\.id\)\}/);
  assert.match(component, /ref=\{menuRef\}/);
  assert.match(component, /onTouchStart/);
  assert.match(component, /onTouchEnd/);
  assert.match(css, /data-has-cart='true'/);
});

test('FOLIO uses no infinite announcement ticker and no hidden-mobile artwork', () => {
  assert.match(component, /p\.announcements\.map/);
  assert.doesNotMatch(component, /<AnnouncementBar/);
  assert.match(component, /categoryArtwork\[category\.id\]/);
  assert.match(component, /spread\.category\.name/);
  assert.match(component, /folio-v2-inline-art/);
  assert.match(component, /\{opened \? <>/);
  assert.match(css, /\[data-guest-theme='light'\] \.folio-experience/);
  assert.match(css, /\.folio-v2-inline-art img \{/);
  assert.doesNotMatch(css, /perspective:1500px/);
  assert.doesNotMatch(css, /backdrop-filter:blur\(14px\)/);
});

test('appearance stays typed and draft-only until published', () => {
  assert.match(appearance, /FOLIO_DESIGN_PREVIEW_READY/);
  assert.match(appearance, /artworkAssetPath/);
  assert.match(editor, /<FolioTemplateEditor/);
  assert.match(editor, /FOLIO_DESIGN_PREVIEW_UPDATE/);
  assert.match(editor, /FOLIO_DESIGN_PREVIEW_READY/);
});
