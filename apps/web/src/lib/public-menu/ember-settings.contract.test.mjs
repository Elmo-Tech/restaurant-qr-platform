import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMBER_COPY_KEYS,
  DEFAULT_EMBER_SETTINGS,
  normalizeEmberTemplateSettings,
  normalizeEmberTemplateConfigView,
  isEmberPreviewUpdate,
  EMBER_DESIGN_PREVIEW_UPDATE,
  EMBER_DESIGN_PREVIEW_READY,
} from './ember-settings.ts';

test('legacy draft returned by an older API fills every editable field', () => {
  const oldResponse = {
    draft: { palette: 'NOIR', motion: 'OFF', headlineAr: 'نص محفوظ', subtitleEn: '' },
    published: { palette: 'EMBER', headlineEn: 'Saved headline' },
  };
  const normalized = normalizeEmberTemplateConfigView(oldResponse);
  assert.equal(normalized.draft.palette, 'NOIR');
  assert.equal(normalized.draft.motion, 'OFF');
  assert.equal(normalized.draft.headlineAr, 'نص محفوظ');
  assert.equal(normalized.published.headlineEn, 'Saved headline');
  for (const version of [normalized.draft, normalized.published]) {
    for (const key of EMBER_COPY_KEYS) {
      assert.equal(typeof version[key], 'string', key);
      assert.ok(version[key].length > 0, key);
    }
  }
  assert.equal(normalized.draft.subtitleEn, DEFAULT_EMBER_SETTINGS.subtitleEn);
});

test('missing, null and malformed responses do not crash the editor', () => {
  for (const response of [undefined, null, {}, { draft: null, published: undefined }, { draft: ['invalid'] }]) {
    assert.deepEqual(normalizeEmberTemplateConfigView(response), {
      draft: DEFAULT_EMBER_SETTINGS,
      published: DEFAULT_EMBER_SETTINGS,
    });
  }
});

test('customized copy remains intact, invalid stored photo paths are rejected', () => {
  const v = normalizeEmberTemplateSettings({
    headlineAr: '  عبارة مخصصة  ',
    eyebrowAr: 'Y'.repeat(200),
    heroImageMode: 'CUSTOM',
    heroImageAssetPath: 'https://evil.example/asset.svg',
  });
  assert.equal(v.headlineAr, 'عبارة مخصصة');
  assert.equal(v.eyebrowAr.length, 100);
  assert.equal(v.heroImageMode, 'AUTO');
  assert.equal(v.heroImageAssetPath, null);
  const uploaded = normalizeEmberTemplateSettings({
    heroImageMode: 'CUSTOM',
    heroImageAssetPath: '/media/0c5fd0cb-ed79-4846-a27d-8bd21bfd29c7.webp',
  });
  assert.equal(uploaded.heroImageMode, 'CUSTOM');
  assert.equal(uploaded.heroImageAssetPath, '/media/0c5fd0cb-ed79-4846-a27d-8bd21bfd29c7.webp');
});

test('only the dedicated same-origin EMBER preview message type may update appearance', () => {
  assert.equal(isEmberPreviewUpdate(null), false);
  assert.equal(isEmberPreviewUpdate([]), false);
  assert.equal(isEmberPreviewUpdate({ type: EMBER_DESIGN_PREVIEW_READY }), false);
  assert.equal(isEmberPreviewUpdate({ type: 'other' }), false);
  assert.equal(isEmberPreviewUpdate({
    type: EMBER_DESIGN_PREVIEW_UPDATE,
    settings: { palette: 'COPPER', headlineAr: 'معاينة غير منشورة' },
  }), true);
  const settings = normalizeEmberTemplateSettings({
    palette: 'COPPER', headlineAr: 'معاينة غير منشورة',
  });
  assert.equal(settings.palette, 'COPPER');
  assert.equal(settings.headlineAr, 'معاينة غير منشورة');
});
