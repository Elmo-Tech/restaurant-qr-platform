import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedModifierSelection, modifierGroupsForSize } from './effective-modifiers.ts';

const groups = [{
  id: 'extras', name: 'Extras', helperText: null,
  minimumSelections: 0, maximumSelections: 2,
  disabledVariantIds: ['small'],
  options: [
    { id: 'cheese', name: 'Cheese', priceAdjustment: '10.00',
      sizeOverrides: [
        {variantId:'medium', enabled: true, priceAdjustment:'15.00'},
        {variantId:'large', enabled:false, priceAdjustment:null},
      ] },
    {id:'sauce', name:'Sauce', priceAdjustment:'0.00', sizeOverrides: []},
  ],
}, {
  id:'required', name:'Choice', helperText:null,
  minimumSelections:1, maximumSelections:1,
  options:[{id:'choose', name:'Choose',priceAdjustment:'0.00',
    sizeOverrides:[{variantId:'small', enabled:false, priceAdjustment:null}]}],
}];

test('Old product with no variants inherits its Modifier Groups unchanged', () => {
  assert.equal(modifierGroupsForSize(groups, null, false), groups);
});

test('Required size blocks selecting addons before size selection', () => {
  assert.deepEqual(modifierGroupsForSize(groups, null, true), []);
});

test('Explicit group toggle disables extras for Small only', () => {
  assert.equal(modifierGroupsForSize(groups, 'small', true).some(g=>g.id==='extras'),false);
  assert.equal(modifierGroupsForSize(groups, 'medium', true).some(g=>g.id==='extras'),true);
});

test('Per-size price and availability inherit or override exactly', () => {
  const medium=modifierGroupsForSize(groups,'medium',true)[0];
  const large=modifierGroupsForSize(groups,'large',true)[0];
  assert.equal(medium.options[0].priceAdjustment,'15.00');
  assert.deepEqual(large.options.map(o=>o.id),['sauce']);
  assert.equal(modifierGroupsForSize(groups,'unknown',true)[0].options[0].priceAdjustment,'10.00');
});

test('Switching size drops hidden choices but retains those still available', () => {
  const large=modifierGroupsForSize(groups,'large',true);
  const selected=allowedModifierSelection(large,{extras:['cheese','sauce'],required:['choose']});
  assert.deepEqual(selected.extras,['sauce']);
  assert.deepEqual(selected.required,['choose']);
});

test('A required group with no available choices is not silently skipped', () => {
  const small=modifierGroupsForSize(groups,'small',true);
  const required=small.find(g=>g.id==='required');
  assert.ok(required);
  assert.equal(required.options.length,0);
});
