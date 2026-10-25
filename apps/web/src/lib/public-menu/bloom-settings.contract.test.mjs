import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BLOOM_SETTINGS,
  BLOOM_COPY_KEYS,
  BLOOM_DESIGN_PREVIEW_READY,
  BLOOM_DESIGN_PREVIEW_UPDATE,
  isBloomPreviewUpdate,
  normalizeBloomTemplateSettings,
  normalizeBloomTemplateConfigView,
} from './bloom-settings.ts';

test('legacy or missing API fields never break the BLOOM editor', () => {
  for (const input of [null, undefined, {}, {draft:null,published:[]}, {draft:{headlineTopAr:''},published:{}}]) {
    const {draft,published} = normalizeBloomTemplateConfigView(input);
    for (const item of [draft,published]) {
      for (const field of BLOOM_COPY_KEYS) {
        assert.equal(typeof item[field], 'string', field);
        assert.ok(item[field].length > 0, field);
      }
    }
  }
});
test('all default lines preserve the exact handwritten-reference layout', () => {
  assert.equal(DEFAULT_BLOOM_SETTINGS.headlineTopAr, 'sweet');
  assert.equal(DEFAULT_BLOOM_SETTINGS.headlineMiddleAr, 'little');
  assert.equal(DEFAULT_BLOOM_SETTINGS.headlineBottomAr, 'things.');
  assert.equal(DEFAULT_BLOOM_SETTINGS.sectionHeadlineAr, 'The sweet selection.');
  assert.ok(DEFAULT_BLOOM_SETTINGS.ribbonAr.includes('BAKED WITH LOVE'));
});
test('only the same-origin scoped BLOOM message protocol can carry design settings', () => {
  assert.equal(isBloomPreviewUpdate(null), false);
  assert.equal(isBloomPreviewUpdate({type:BLOOM_DESIGN_PREVIEW_READY}), false);
  assert.equal(isBloomPreviewUpdate({type:'unrelated'}), false);
  assert.equal(isBloomPreviewUpdate({type:BLOOM_DESIGN_PREVIEW_UPDATE,settings:{palette:'PEACH'}}), true);
});
test('custom artwork paths must be in /media UUID storage', () => {
  const fake=normalizeBloomTemplateSettings({
    heroImageMode:'CUSTOM',
    heroImageAssetPath:'https://untrusted.example/cake.svg',
    headlineTopAr:'  كيك  ',
  });
  assert.equal(fake.heroImageMode, 'ART');
  assert.equal(fake.heroImageAssetPath, null);
  assert.equal(fake.headlineTopAr, 'كيك');
  const uploaded=normalizeBloomTemplateSettings({
    heroImageMode:'CUSTOM', heroImageAssetPath:'/media/9c81c329-d31e-4655-97bf-e4136288ace7.webp',
  });
  assert.equal(uploaded.heroImageMode, 'CUSTOM');
});
