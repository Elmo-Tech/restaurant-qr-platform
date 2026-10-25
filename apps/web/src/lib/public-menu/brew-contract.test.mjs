import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');
const templates=read('lib/public-menu/templates.ts');
const view=read('app/q/[publicCode]/PublicMenuView.tsx');
const sections=read('app/q/[publicCode]/MenuSections.tsx');
const hero=read('app/q/[publicCode]/GuestHeroBrew.tsx');
const css=read('app/globals.css');
const studio=read('app/staff/restaurants/[restaurantId]/settings/design/DesignWorkspace.tsx');
const api=read('lib/settings/api.ts');
const settings=read('lib/public-menu/brew-settings.ts');
test('BREW is an isolated premium layout with reference coffee typography',()=>{
 assert.match(templates,/\bbrew: \{ hero: 'brew', cards: 'brew'/);
 assert.ok(hero.includes('brew-v2-art')&&hero.includes('brew-v2-display'));
 assert.ok(css.includes('font-family: var(--font-bloom-display), var(--font-bloom-arabic), Georgia, serif'));
 assert.ok(css.includes("data-guest-theme='dark'"));
 assert.ok(css.includes("data-brew-palette='MOCHA'"));
 assert.ok(css.includes("data-brew-palette='SAGE'"));
 assert.ok(css.includes("color: var(--g-text);"));
 assert.ok(css.includes("flex-direction: column; align-items: flex-start;"));
 assert.ok(css.includes("align-self: flex-end;"));
 assert.ok(!css.includes("position:absolute;left:20px;bottom:0;font-size:76px"));
 assert.ok(view.includes('data-brew-palette='));
 assert.ok(settings.includes("BREW_PALETTES=['FOREST','MOCHA','SAGE']"));
});
test('BREW retains real product prices, modifiers, cart and search',()=>{
 assert.ok(sections.includes('<ProductLine key={product.id}'));
 for(const token of ['onQuickAdd={onQuickAdd}','onIncrement={onIncrement}','onDecrement={onDecrement}'])
   assert.ok(sections.includes(token),token);
 assert.ok(view.includes("template === 'brew'"));
 assert.ok(view.includes("template==='brew'?brewSettings:undefined"));
 assert.ok(sections.includes('brewPromoForCategory(brewSettings,category.id)'));
});
test('BREW customizations are private until staff publish',()=>{
 assert.ok(settings.includes('BREW_DESIGN_PREVIEW_READY'));
 assert.ok(studio.includes('<BrewTemplateEditor'));
 assert.ok(api.includes('/brew-template/draft'));
 assert.ok(api.includes('/brew-template/publish'));
 assert.ok(api.includes('categoryPromos'));
 assert.ok(api.includes("'palette'"));
});
