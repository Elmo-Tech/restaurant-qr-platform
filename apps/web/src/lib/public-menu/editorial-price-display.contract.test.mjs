import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const product = read('app/q/[publicCode]/ProductVariants.tsx');
const sections = read('app/q/[publicCode]/MenuSections.tsx');
const guest = read('app/q/[publicCode]/PublicMenuView.tsx');
const publicPage = read('app/q/[publicCode]/page.tsx');
const design = read('app/staff/restaurants/[restaurantId]/settings/design/DesignWorkspace.tsx');
const editor = read('app/staff/restaurants/[restaurantId]/settings/design/EditorialPriceDisplayEditor.tsx');
const backend = read('../../api/src/public/public-menu.service.ts');
const controller = read('../../api/src/restaurants/editorial-template-config.controller.ts');

test('the current Editorial FROM price is the default for every old restaurant', () => {
  const settings = read('lib/public-menu/editorial-settings.ts');
  assert.ok(settings.includes("priceDisplay: 'FROM'"));
  assert.ok(product.includes("props.editorialPriceDisplay === 'ALL_VARIANTS' && view.sizes.length >= 2"));
  assert.ok(sections.includes("editorialPriceDisplay='FROM'"));
});

test('Editorial variant mode lists every real size and effective discounted price', () => {
  const start = product.indexOf('function ProductEditorialImpl');
  const end = product.indexOf('EMBER-specific cinematic poster', start);
  assert.ok(start >= 0 && end > start);
  const editorial = product.slice(start, end);
  assert.ok(editorial.includes('view.sizes.map(size=>('), 'show all size rows, not just first four');
  assert.ok(!editorial.includes('view.sizes.slice('), 'do not silently hide extra sizes');
  assert.ok(editorial.includes('size.discountedPrice !== null'));
  assert.ok(editorial.includes('<OriginalPrice amount={size.price}'));
  assert.ok(editorial.includes('size.discountedPrice ?? size.price'));
  assert.ok(editorial.includes('<Price amount='));
  assert.ok(editorial.includes('<AddControl'), 'shared add / variant selection must be intact');
  assert.ok(editorial.includes('{!showAllSizes ? <div'), 'only one price area is rendered');
});

test('the preference is tenant scoped, guarded and guest output is published-only', () => {
  assert.ok(controller.includes('RestaurantAccessGuard'));
  assert.ok(controller.includes('AllBranchesRequiredGuard'));
  assert.ok(controller.includes('CsrfGuard'));
  assert.ok(controller.includes("PERMISSIONS.RESTAURANT_MANAGE"));
  assert.ok(controller.includes("templatesFor(restaurantId)"));
  assert.ok(backend.includes("template: 'EDITORIAL'"));
  assert.ok(backend.includes('publishedSettings: true'));
  assert.ok(backend.includes('editorialSettings'));
});

test('the Arabic/English staff toggle previews without publishing until Save', () => {
  const strings = read('lib/i18n/messages/design.ts');
  assert.ok(strings.includes("'design.editorialPriceAll'"));
  assert.ok(strings.includes("'design.editorialPriceFrom'"));
  assert.ok(editor.includes('getEditorialTemplateSettings'));
  assert.ok(editor.includes('saveEditorialTemplateSettings'));
  assert.ok(design.includes('<EditorialPriceDisplayEditor'));
  assert.ok(design.includes("kind:'editorial'"));
  assert.ok(publicPage.includes("template?.toUpperCase() === 'EDITORIAL'"));
  assert.ok(guest.includes('EDITORIAL_DESIGN_PREVIEW_READY'));
  assert.ok(guest.includes('event.origin!==window.location.origin'));
  assert.ok(sections.includes("layout.cards==='editorial'?editorialPriceDisplay:undefined"));
});
