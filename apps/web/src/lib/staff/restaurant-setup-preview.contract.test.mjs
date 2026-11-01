import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const root = '../../app/staff/restaurants/[restaurantId]';
const previewPage = read(root + '/setup-preview/page.tsx');
const previewWorkspace = read(root + '/setup-preview/SetupPreviewWorkspace.tsx');
const card = read('../../components/staff/RestaurantSetupChecklistCard.tsx');
const dashboard = read(root + '/dashboard/OperationsDashboard.tsx');
const landing = read(root + '/page.tsx');
const translations = read('../i18n/messages/restaurantSetup.ts');
const registry = read('../i18n/messages/index.ts');

test('UX preview is guarded and limited to authorized active OWNER/MANAGER', () => {
  assert.match(previewPage, /getAuthSessionState/);
  assert.match(previewPage, /member\.restaurant\.status !== 'ACTIVE'/);
  assert.match(previewPage, /'OWNER', 'MANAGER'/);
  assert.match(previewPage, /canViewRestaurantSettings\(member\)/);
  assert.match(previewPage, /canViewBranches\(member\)/);
  assert.match(previewPage, /canViewMenu\(member\)/);
  assert.doesNotMatch(previewPage, /prisma\.|migrate\b|createGenericQr/);
});

test('preview never silently replaces live operational dashboard or enrols old restaurants', () => {
  assert.doesNotMatch(dashboard, /RestaurantSetupChecklistCard|SetupPreviewWorkspace/);
  assert.doesNotMatch(landing, /RestaurantSetupChecklistCard|setup-preview/);
  assert.match(dashboard, /<AttentionPanel/);
  assert.match(previewWorkspace, /setup\.preview\.warning/);
  assert.match(previewWorkspace, /buildSetupPreviewSteps/);
  assert.doesNotMatch(previewWorkspace, /fetch\(|apiFetch|updateOrderingOptions|localStorage|sessionStorage/);
});

test('checklist has premium unified card, accessible progress and responsive controls', () => {
  assert.match(card, /linear-gradient/);
  assert.match(card, /rounded-\[22px\]/);
  assert.match(card, /sm:px-6/);
  assert.match(card, /role="progressbar"/);
  assert.match(card, /aria-valuenow/);
  assert.match(card, /aria-expanded/);
  assert.match(card, /motion-reduce:transition-none/);
  assert.match(card, /focus-visible:outline-2/);
  assert.match(card, /min-h-11/);
  assert.match(card, /<Link href=\{href\}/);
  assert.match(card, /summary\.nextAction/);
  assert.match(card, /pendingExamples/);
  assert.doesNotMatch(card, /finishedExample/);
  assert.doesNotMatch(card, /isRestaurantReady|createOrder|handlePayment/);
});

test('four scenarios, hide/reopen preview and a non-deceptive owner review state', () => {
  for (const scenario of ["key: 'new'", "key: 'partial'", "key: 'whatsapp'", "key: 'ready'"]) {
    assert.ok(previewWorkspace.includes(scenario), 'Missing scenario ' + scenario);
  }
  assert.match(previewWorkspace, /setHidden\(true\)/);
  assert.match(previewWorkspace, /setHidden\(false\)/);
  assert.match(previewWorkspace, /aria-pressed/);
  assert.match(card, /setup\.preview\.readyNote/);
  assert.doesNotMatch(card, /confirmSetup|ownerCompletedAt/);
});

test('setup translations have identical keys for Arabic and English', () => {
  const [en, ar] = translations.split('  ar: {');
  const keys = [...en.matchAll(/'setup\.[\w.]+':/g)].map(m => m[0]);
  assert.ok(keys.length >= 55, 'Expected complete actionable translation set');
  for (const key of keys) assert.ok(ar.includes(key), 'Missing Arabic key ' + key);
  assert.match(registry, /restaurantSetupMessages\.en/);
  assert.match(registry, /restaurantSetupMessages\.ar/);
});
