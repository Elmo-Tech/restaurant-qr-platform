import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const panel = readFileSync(new URL('app/q/[publicCode]/CartPanel.tsx', root), 'utf8');
const i18n = readFileSync(new URL('lib/public-menu/copy.ts', root), 'utf8');
const handoff = panel.slice(panel.indexOf('function WhatsappHandoff('), panel.indexOf('/** The confirmation, stamped from the Backend'));

test('WhatsApp guest handoff copies the immutable signed message then opens chat without a text parameter', () => {
  assert.ok(handoff.includes('await navigator.clipboard.writeText(handoff.message);'));
  assert.match(handoff, /await navigator\.clipboard\.writeText\(handoff\.message\);[\s\S]*window\.location\.assign\(chatUrl\)/);
  assert.match(handoff, /return url\.origin \+ url\.pathname;/);
  assert.match(handoff, /url\.hostname !== 'wa\.me'/);
  assert.doesNotMatch(handoff, /href=\{handoff\.whatsappUrl\}/);
  assert.doesNotMatch(handoff, /window\.location\.assign\(handoff\.whatsappUrl\)/);
});

test('Guest handoff is explicit about paste-and-send and provides clipboard failure fallback', () => {
  for (const key of ['whatsappPasteInstructions', 'whatsappClipboardUnavailable', 'whatsappOpenChatOnly']) {
    assert.ok(handoff.includes('copy.' + key), key);
    assert.ok(i18n.includes(key + ': string;'), key + ' typed');
    assert.ok((i18n.match(new RegExp(key + ': \\'', 'g')) ?? []).length === 2, key + ' both locales');
  }
  assert.ok(handoff.includes('setCopyFailed(true)'));
  assert.ok(handoff.includes('role="alert"'));
  assert.ok(handoff.includes('href={chatUrl}'));
});
