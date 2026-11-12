import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(sourceRoot, path), 'utf8');
const page = read('app/staff/restaurants/[restaurantId]/page.tsx');
const operations = read('app/staff/restaurants/[restaurantId]/dashboard/OperationsDashboard.tsx');
const ordering = read('app/staff/restaurants/[restaurantId]/settings/ordering/OrderingWorkspace.tsx');
const card = read('app/staff/restaurants/[restaurantId]/settings/ordering/WhatsappConnectionCard.tsx');

test('WhatsApp pairing appears on operations and menu-only dashboards, never as a privileged shortcut', () => {
  assert.match(page, /visible: restaurant\.features\.WHATSAPP_ORDERING && membership\.allBranches && access\.settings/);
  assert.match(operations, /whatsappConnection\.visible\s*\?\s*\(/);
  assert.match(page, /whatsappConnection\.visible\s*\?\s*\(/);
  assert.match(page, /whatsappConnection=\{whatsappConnection\}/);
});

test('Ordering Settings links to the Dashboard rather than embedding the QR connection card', () => {
  assert.doesNotMatch(ordering, /<WhatsappConnectionCard/);
  assert.match(ordering, /#whatsapp-connection/);
  assert.match(card, /id="whatsapp-connection"/);
});

test('Pairing respects server authorization and restaurant phone and channel prerequisites', () => {
  assert.match(card, /!canManage \|\| !hasWhatsappNumber \|\| !orderingEnabled/);
  assert.match(card, /connection\.state !== 'NOT_CONFIGURED'/);
  assert.match(card, /connectWhatsapp\(restaurantId\)/);
  assert.match(card, /getConnection\(restaurantId\)/);
});

test('Polling cannot erase the one-time QR before the connection is confirmed', () => {
  assert.match(card, /const \[pairing, setPairing\] = useState/);
  assert.match(card, /if \(current\.connected\) setPairing\(null\)/);
  assert.match(card, /const qrSrc = pairing\?\.qrCode/);
  assert.match(card, /document\.visibilityState === 'visible'/);
});

test('Guide is compact by default on mobile, keyboard accessible, and opened during pairing', () => {
  assert.match(card, /const \[guideOpen, setGuideOpen\] = useState\(false\)/);
  assert.match(card, /aria-expanded=\{guideOpen\}/);
  assert.match(card, /setGuideOpen\(true\)/);
  assert.match(card, /aria-controls="whatsapp-connection-guide"/);
});

test('Guide explains the two-device linked-device scan and received-only count', () => {
  assert.match(card, /الأجهزة المرتبطة/);
  assert.match(card, /Linked devices/);
  assert.match(card, /computer or another phone/);
  assert.match(card, /verified received messages count/);
  assert.match(card, /Wayta does not store chat text/);
});
