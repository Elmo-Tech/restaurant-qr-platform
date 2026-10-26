import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const backend = read('../../api/src/my-subscription/my-subscription.service.ts');
const rules = read('../../api/src/my-subscription/plan-options.ts');
const client = read('lib/subscription/api.ts');
const view = read('app/staff/restaurants/[restaurantId]/subscription/SubscriptionWorkspace.tsx');
const messages = read('lib/i18n/messages/subscription.ts');

test('plan comparisons are broader than upgrades and only include active packages', () => {
  assert.ok(rules.includes("pkg.status === 'ACTIVE' && pkg.id !== input.currentPackageId"));
  assert.ok(backend.includes('const comparisonPlans = comparisonCandidates(candidateInput)'));
  assert.ok(backend.includes('const upgrades = upgradeCandidates(candidateInput)'));
  assert.ok(backend.includes('comparisonPlans,'));
  assert.ok(client.includes('comparisonPlans?: UpgradeOption[]'));
});

test('desktop and mobile compare all plans but cannot request a lower plan as an upgrade', () => {
  assert.ok(view.includes('const options = data.comparisonPlans ?? data.upgrades'));
  assert.ok(view.includes('const upgradeIds = new Set(data.upgrades.map((item) => item.id))'));
  assert.ok(view.includes('selectedOption&&onRequest&&upgradeIds.has(selectedOption.id)'));
  assert.ok(view.includes('upgradeIds.has(option.id) ? ('));
  assert.ok(view.includes("option.id === firstUpgradeId"));
  assert.ok(view.includes("subscription.compare.compareOnly"));
  assert.ok(messages.includes("'subscription.compare.compareOnly'"));
  assert.ok(view.includes('mobilePlanIndex'));
});
