import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FOLIO_SETTINGS, pickFolioArtwork } from './folio-settings.ts';

const id = 'a0b1c2d3-1111-4222-8333-ffeeddccbbaa';
const image = '/media/01234567-89ab-4cde-8f01-23456789abcd.webp';
const cat = {
  id, imageAssetPath: '/media/category.jpg',
  products: [{featured:true,primaryImageAssetPath:'/media/item.webp'}],
};
test('each chapter uses its own override before other sources', () => {
  assert.equal(pickFolioArtwork({
    ...DEFAULT_FOLIO_SETTINGS,
    categoryArtwork:{[id]:image},
  },cat),image);
  assert.equal(pickFolioArtwork(DEFAULT_FOLIO_SETTINGS,cat),'/media/category.jpg');
});
test('a chapter with no category image follows selected fallback mode', () => {
  const empty = {...cat,imageAssetPath:null};
  assert.equal(pickFolioArtwork(DEFAULT_FOLIO_SETTINGS,empty),null);
  assert.equal(pickFolioArtwork({...DEFAULT_FOLIO_SETTINGS,artworkMode:'FEATURED'},empty),'/media/item.webp');
  assert.equal(pickFolioArtwork({
    ...DEFAULT_FOLIO_SETTINGS,artworkMode:'CUSTOM',artworkAssetPath:image,
  },empty),image);
});
test('a chapter missing images uses the original illustrated plate',()=>{
  assert.equal(pickFolioArtwork(DEFAULT_FOLIO_SETTINGS,{id,imageAssetPath:null,products:[]}),null);
});
